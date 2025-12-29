# litellm_peak_summarize.py
# ------------------------------------------------------------
# pip install -U litellm python-dotenv tqdm
#
# 예)
#   python litellm_peak_summarize.py --input chat_a.log --engine gemini2
#   python litellm_peak_summarize.py --input chat_a.log --suite all
#   python litellm_peak_summarize.py --input chat_a.log --models openai/gpt-5.2 gemini/gemini-2.0-flash groq/llama-3.3-70b-versatile xai/grok-4-1-fast-non-reasoning
#
# 폴더 처리 (병렬 처리, progress bar 지원)
#   python litellm_peak_summarize.py --input ./chat_folder --engine gemini2
#   python litellm_peak_summarize.py --input ./chat_folder --engine gemini2 --file_workers 12
#
# 노이즈 제거 옵션(추천)
#   python litellm_peak_summarize.py --input chat_a.log --suite fast --denoise --dedup_run_min 3
#   python litellm_peak_summarize.py --input chat_a.log --engine groq_70b --no_denoise
#
# JSON 파일 모드 (extract_event.rs가 생성한 JSON 파일 처리)
#   python llm-chat-event.py --json --input 10307278_chat.json --engine gemini2
#   python llm-chat-event.py --json --input 10307278_chat.json --engine gemini25 --denoise
# ------------------------------------------------------------

import argparse
import json
import os
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

from dotenv import load_dotenv

try:
    from tqdm import tqdm
except ImportError:
    # tqdm이 없으면 기본 print 사용
    tqdm = None

TS_PREFIX_RE = re.compile(r"^\[\d{2}:\d{2}:\d{2}\]\s*:\s*")

# 이모티콘 패턴: {:...:} 형식 (예: {:tmRainbowdance:}, {:d_41:})
EMOTICON_RE = re.compile(r"\{:[^}]+\}")


# -------------------------
# Noise reduction (chat)
# -------------------------

# "줄 전체가" 웃음/감탄/기호/자음반복 등일 때만 제거 (단어+ㅋㅋ 같은 줄은 유지)
ONLY_NOISE_RE = re.compile(
    r"^(?:"
    r"[ㅋㅎㅌㅠㅜㄷㅇㅈ]{2,}"  # ㅋㅋㅋㅋ / ㅎㅎㅎㅎ / ㄷㄷ / ㅇㅈ 등
    r"|[!?~.]{1,}"  # ? / !! / ... / ~~ 등
    r"|캬+|와+|오+|헉+|엥+|어\?*|에\?*"  # 감탄 단독
    r"|zz+|ZZ+"  # zzzz 같은 잡음(가끔 채팅에서 잠/졸림)
    r")$"
)

REPEAT_COMPRESS = [
    (re.compile(r"(ㅋ)\1{2,}"), r"\1\1"),  # ㅋㅋㅋㅋ -> ㅋㅋ
    (re.compile(r"(ㅎ)\1{2,}"), r"\1\1"),  # ㅎㅎㅎㅎ -> ㅎㅎ
    (re.compile(r"(ㅠ)\1{2,}"), r"\1\1"),  # ㅠㅠㅠ -> ㅠㅠ
    (re.compile(r"(ㅜ)\1{2,}"), r"\1\1"),  # ㅜㅜㅜ -> ㅜㅜ
    (re.compile(r"(!)\1{2,}"), r"\1\1"),  # !!!!! -> !!
    (re.compile(r"(\?)\1{2,}"), r"\1\1"),  # ????? -> ??
    (re.compile(r"(~)\1{2,}"), r"\1\1"),  # ~~~~~ -> ~~
    (re.compile(r"(\.)\1{2,}"), r"\1\1"),  # ..... -> ..
]


def compress_repeats(s: str) -> str:
    out = s
    for pat, rep in REPEAT_COMPRESS:
        out = pat.sub(rep, out)
    return out


def remove_emoticons(s: str) -> str:
    """이모티콘 {:...:} 형식을 제거"""
    return EMOTICON_RE.sub("", s).strip()


def is_noise_only_line(s: str) -> bool:
    # 공백 제거 후 노이즈인지 판단(예: "ㅋㅋㅋㅋ ㅋ" 같은 것도 제거)
    normalized = re.sub(r"\s+", "", s)
    return bool(ONLY_NOISE_RE.match(normalized))


def preprocess_chat_lines(
    lines: list[str], dedup_run_min: int = 3, remove_emoticons_flag: bool = True
) -> list[str]:
    """
    1) 이모티콘 {:...:} 형식 제거 (옵션)
    2) 줄 전체가 웃음/감탄/기호 등 '노이즈만'이면 제거
    3) 줄 내부 반복(ㅋㅋㅋㅋ/!!!!!/?????)은 짧게 압축
    4) 연속 동일 줄 도배는 "(xN)"으로 런-길이 압축
    """
    cleaned: list[str] = []
    for ln in lines:
        s = ln.strip()
        if not s:
            continue
        # 이모티콘 제거
        if remove_emoticons_flag:
            s = remove_emoticons(s)
            if not s:  # 이모티콘만 있던 줄은 제거
                continue
        s = compress_repeats(s)
        if is_noise_only_line(s):
            continue
        cleaned.append(s)

    # 연속 중복 압축
    out: list[str] = []
    i = 0
    n = len(cleaned)
    while i < n:
        j = i + 1
        while j < n and cleaned[j] == cleaned[i]:
            j += 1
        run_len = j - i
        if run_len >= dedup_run_min:
            out.append(f"{cleaned[i]} (x{run_len})")
        else:
            out.extend(cleaned[i:j])
        i = j

    return out


# -------------------------
# LLM runner
# -------------------------


def strip_timestamps(raw_text: str) -> str:
    # 각 라인의 맨 앞 '[HH:MM:SS] : ' 만 제거
    return "\n".join(TS_PREFIX_RE.sub("", line) for line in raw_text.splitlines())


def pick_api_key(model: str) -> str | None:
    # LiteLLM은 env var 자동 인식도 하지만, provider별로 명시해두면 삑사리 줄어듦.
    if model.startswith("openai/") or model.startswith("gpt-"):
        return os.getenv("OPENAI_API_KEY")
    if model.startswith("gemini/"):
        return os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if model.startswith("xai/"):
        return os.getenv("XAI_API_KEY")
    if model.startswith("groq/"):
        return os.getenv("GROQ_API_KEY")
    return None


def build_messages(chat_text: str) -> list[dict]:
    system = (
        "컨텍스트:\n"
        "- 아래 입력은 한국어 '스트리머 라이브 방송'의 시청자 채팅 발췌(피크 구간)이다.\n"
        "- 사람들끼리 농담/리액션/게임 상황/이벤트 참여 등이 섞일 수 있다.\n\n"
        "너의 임무:\n"
        "- 실제로 등장한 단서에 근거해서 '무슨 상황인지'를 간결히 정리한다.\n"
        "- 출력은 규정된 형식만 지킨다.\n"
        "- 출력에는 '스트리머', '방송', '채팅', '로그', '요약', '분석', '모델', '입력', '출력' 같은 메타 단어를 쓰지 마라.\n"
    )

    user = (
        f"{chat_text}\n\n"
        "-----\n"
        "요청:\n"
        "1) 위 텍스트에서 실제로 등장한 짧은 표현 3~6개를 그대로 뽑아 EVIDENCE에 ' | '로 나열\n"
        "2) 그 근거를 바탕으로 '무슨 일이 벌어졌는지'를 한 문장으로 SUMMARY에 작성\n"
        "3) TITLE은 상황을 설명하는 헤드라인으로 작성\n"
        "제약:\n"
        "- TITLE: 20~45자, 한국어\n"
        "- SUMMARY는 EVIDENCE 중 최소 1개 표현을 포함\n"
        "- 금지 단어(출력 전체): 스트리머, 방송, 채팅, 로그, 요약, 분석, 모델, 입력, 출력\n"
        "- 형식은 반드시 아래 3줄만 (다른 줄/부연설명 금지)\n"
        "EVIDENCE: ...\n"
        "SUMMARY: ...\n"
        "TITLE: ...\n"
    )

    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]


def call_once(
    model: str,
    messages: list[dict],
    max_tokens: int,
    temperature: float,
    timeout_s: float,
    reasoning: str | None,
):
    import litellm

    kwargs = dict(
        model=model,
        messages=messages,
        max_tokens=max_tokens,
        temperature=temperature,
        timeout=timeout_s,
    )

    # 일부 provider/model에서 지원하는 경우만 먹힘(안 먹혀도 무시되거나 에러날 수 있음)
    if reasoning:
        kwargs["reasoning_effort"] = reasoning  # (예: low/medium/high 등)

    api_key = pick_api_key(model)
    if api_key:
        kwargs["api_key"] = api_key

    t0 = time.perf_counter()
    resp = litellm.completion(**kwargs)
    dt_ms = (time.perf_counter() - t0) * 1000.0

    # resp가 dict/obj 둘 다 올 수 있어서 방어적으로 처리
    try:
        text = resp["choices"][0]["message"]["content"] or ""
        usage = resp.get("usage") or {}
    except TypeError:
        text = resp.choices[0].message.content or ""
        usage = getattr(resp, "usage", {}) or {}

    text = text.strip()
    return {
        "model": model,
        "latency_ms": dt_ms,
        "prompt_tokens": usage.get("prompt_tokens"),
        "completion_tokens": usage.get("completion_tokens"),
        "total_tokens": usage.get("total_tokens"),
        "text": text,
    }


def ensure_three_lines(out_text: str) -> bool:
    lines = [ln.strip() for ln in out_text.splitlines() if ln.strip()]
    if len(lines) != 3:
        return False
    return (
        lines[0].startswith("EVIDENCE:")
        and lines[1].startswith("SUMMARY:")
        and lines[2].startswith("TITLE:")
    )


def run_model(
    model: str,
    messages: list[dict],
    max_tokens: int,
    temperature: float,
    timeout_s: float,
    reasoning: str | None,
    retry_on_bad_format: bool,
):
    r1 = call_once(model, messages, max_tokens, temperature, timeout_s, reasoning)
    if (not retry_on_bad_format) or ensure_three_lines(r1["text"]):
        return r1

    # 2차 재시도: 포맷 강제(테스트용 옵션)
    fixup = messages + [
        {
            "role": "user",
            "content": "방금 출력이 형식을 지키지 않았다. 반드시 정확히 2줄(EVIDENCE/SUMMARY)로 다시 출력해라.",
        }
    ]
    r2 = call_once(model, fixup, max_tokens, temperature, timeout_s, reasoning)
    r2["model"] = model + " (retry)"
    return r2


def process_file(
    input_path: str,
    models: list[str],
    max_tokens: int,
    temperature: float,
    timeout_s: float,
    reasoning: str | None,
    retry_on_bad_format: bool,
    threads: int,
    do_denoise: bool,
    dedup_run_min: int,
    max_lines: int,
    remove_emoticons: bool = True,
) -> dict[str, Any]:
    """단일 파일을 처리하고 LLM을 실행하여 결과를 반환"""
    raw_text = open(input_path, "r", encoding="utf-8").read()
    cleaned = strip_timestamps(raw_text)

    lines = cleaned.splitlines()

    if do_denoise:
        lines = preprocess_chat_lines(
            lines,
            dedup_run_min=max(2, dedup_run_min),
            remove_emoticons_flag=remove_emoticons,
        )
    else:
        if remove_emoticons:
            lines = [remove_emoticons(ln.strip()) for ln in lines if ln.strip()]
            lines = [ln for ln in lines if ln]  # 빈 줄 제거
        else:
            lines = [ln.strip() for ln in lines if ln.strip()]

    if max_lines and max_lines > 0 and len(lines) > max_lines:
        lines = lines[-max_lines:]

    chat_text = "\n".join(lines)
    messages = build_messages(chat_text)

    # 병렬 실행
    results = []
    with ThreadPoolExecutor(max_workers=max(1, threads)) as ex:
        futs = {
            ex.submit(
                run_model,
                m,
                messages,
                max_tokens,
                temperature,
                timeout_s,
                reasoning,
                retry_on_bad_format,
            ): m
            for m in models
        }
        for fut in as_completed(futs):
            try:
                results.append(fut.result())
            except Exception as e:
                results.append({"model": futs[fut], "error": repr(e)})

    return {
        "filename": os.path.basename(input_path),
        "filepath": input_path,
        "results": sorted(
            results,
            key=lambda x: (x.get("error") is not None, x.get("latency_ms") or 1e18),
        ),
    }


def print_file_results(file_result: dict[str, Any]):
    """파일 처리 결과를 출력"""
    print("=" * 80)
    print(f"FILE: {file_result['filename']}")
    for r in file_result["results"]:
        print()
        print(f"MODEL: {r.get('model')}")
        if r.get("error"):
            print(f"ERROR: {r['error']}")
            continue
        print(
            f"LATENCY: {r['latency_ms']:.1f}ms | TOKENS: prompt={r.get('prompt_tokens')} completion={r.get('completion_tokens')} total={r.get('total_tokens')}"
        )
        print(r.get("text", ""))
    print()


def parse_llm_output(text: str) -> dict[str, str] | None:
    """LLM 출력에서 EVIDENCE, SUMMARY, TITLE을 파싱"""
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    result = {}

    for line in lines:
        if line.startswith("EVIDENCE:"):
            result["evidence"] = line[9:].strip()
        elif line.startswith("SUMMARY:"):
            result["summary"] = line[8:].strip()
        elif line.startswith("TITLE:"):
            result["title"] = line[6:].strip()

    if len(result) == 3:
        return result
    return None


def prepare_chat_text_from_lines(
    lines: list[str],
    do_denoise: bool,
    dedup_run_min: int,
    max_lines: int,
    remove_emoticons: bool = True,
) -> str:
    """메시지 라인들을 전처리하여 채팅 텍스트로 변환 (기존 process_file 로직 재사용)"""
    if do_denoise:
        lines = preprocess_chat_lines(
            lines,
            dedup_run_min=max(2, dedup_run_min),
            remove_emoticons_flag=remove_emoticons,
        )
    else:
        if remove_emoticons:
            lines = [remove_emoticons(ln.strip()) for ln in lines if ln.strip()]
            lines = [ln for ln in lines if ln]  # 빈 줄 제거
        else:
            lines = [ln.strip() for ln in lines if ln.strip()]

    if max_lines and max_lines > 0 and len(lines) > max_lines:
        lines = lines[-max_lines:]

    return "\n".join(lines)


def run_parallel_with_progress(
    items: list,
    process_func,
    desc: str,
    unit: str,
    max_workers: int,
) -> list:
    """병렬 실행 래퍼 (progress bar 포함, 순서 유지)"""
    pbar_kwargs = {
        "total": len(items),
        "desc": desc,
        "unit": unit,
    }
    if tqdm:
        pbar = tqdm(**pbar_kwargs)
    else:
        pbar = None

    def process_with_progress(item):
        try:
            result = process_func(item)
            if pbar:
                pbar.update(1)
            return result
        except Exception as e:
            if pbar:
                pbar.update(1)
            raise

    # 순서 유지 (인덱스 기반)
    results = [None] * len(items)
    with ThreadPoolExecutor(max_workers=max(1, max_workers)) as ex:
        futures = {
            ex.submit(process_with_progress, item): idx
            for idx, item in enumerate(items)
        }
        for fut in as_completed(futures):
            try:
                result = fut.result()
                idx = futures[fut]
                results[idx] = result
            except Exception as e:
                idx = futures[fut]
                print(f"경고: 항목 #{idx + 1} 처리 중 오류 발생: {repr(e)}")
                results[idx] = None
    if pbar:
        pbar.close()
    return results


def process_json_file(
    json_path: str,
    model: str,
    max_tokens: int,
    temperature: float,
    timeout_s: float,
    reasoning: str | None,
    retry_on_bad_format: bool,
    do_denoise: bool,
    dedup_run_min: int,
    max_lines: int,
    threads: int,
    output_dir: str,
    remove_emoticons: bool = True,
) -> dict[str, Any]:
    """JSON 파일을 읽어서 각 이벤트를 병렬로 요약하고 summary JSON 생성"""
    # JSON 파일 읽기
    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    video_id = data["video_id"]
    first_message_time = data["first_message_time"]
    events = data["events"]

    def process_event(idx_and_event: tuple[int, dict]) -> tuple[int, dict]:
        """단일 이벤트를 처리하여 evidence, summary, title 추출"""
        event_idx, event_data = idx_and_event
        event = event_data["event"]
        messages = event_data["messages"]  # Vec<String>

        # 메시지 전처리 (기존 함수 재사용)
        lines = [msg.strip() for msg in messages if msg.strip()]
        chat_text = prepare_chat_text_from_lines(
            lines, do_denoise, dedup_run_min, max_lines, remove_emoticons
        )

        # LLM 요약 (기존 함수 재사용)
        llm_messages = build_messages(chat_text)
        result = run_model(
            model,
            llm_messages,
            max_tokens,
            temperature,
            timeout_s,
            reasoning,
            retry_on_bad_format,
        )

        if result.get("error"):
            parsed = {"evidence": "", "summary": "", "title": ""}
        else:
            parsed = parse_llm_output(result["text"])
            if not parsed:
                parsed = {"evidence": "", "summary": "", "title": ""}

        return event_idx, {
            "event": event,
            "evidence": parsed["evidence"],
            "summary": parsed["summary"],
            "title": parsed["title"],
        }

    # 병렬 실행 (순서 유지)
    items = [(idx, event_data) for idx, event_data in enumerate(events)]
    results = run_parallel_with_progress(
        items,
        process_event,
        f"이벤트 처리 ({os.path.basename(json_path)})",
        "이벤트",
        threads,
    )

    # 결과를 딕셔너리로 변환 및 빈 값 처리
    processed_events = []
    for idx, result in enumerate(results):
        if result is None:
            # 오류 발생 시 빈 값으로 채움
            processed_events.append(
                {
                    "event": events[idx]["event"],
                    "evidence": "",
                    "summary": "",
                    "title": "",
                }
            )
        else:
            _, event_result = result
            processed_events.append(event_result)

    output_data = {
        "video_id": video_id,
        "first_message_time": first_message_time,
        "events": processed_events,
    }

    # 출력 파일명 생성
    base_name = os.path.splitext(os.path.basename(json_path))[0]
    output_filename = base_name + "_summary.json"

    # 출력 폴더 생성 (없으면)
    os.makedirs(output_dir, exist_ok=True)

    # 출력 경로 생성
    output_path = os.path.join(output_dir, output_filename)

    # JSON 파일로 저장
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output_data, f, ensure_ascii=False)

    return {
        "input_path": json_path,
        "output_path": output_path,
        "events_processed": len(processed_events),
    }


def main():
    load_dotenv()

    engines = {
        # Gemini (Google AI Studio)
        "gemini2": "gemini/gemini-2.0-flash",
        "gemini25": "gemini/gemini-2.5-flash",
        "gemini3": "gemini/gemini-3-flash-preview",
        # OpenAI
        "gpt52": "openai/gpt-5.2",
        # xAI (Grok) - fast 계열(비추론)
        "grok_fast": "xai/grok-4-1-fast-non-reasoning",
        # Groq
        "groq_70b": "groq/llama-3.3-70b-versatile",
        "groq_8b": "groq/llama-3.1-8b-instant",
    }

    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--input", required=True, help="원본 채팅 txt 파일, 폴더 경로, 또는 JSON 파일"
    )
    ap.add_argument(
        "--json",
        action="store_true",
        help="JSON 파일 모드 (extract_event.rs가 생성한 JSON 파일 처리)",
    )
    ap.add_argument(
        "--engine", default=None, choices=sorted(engines.keys()), help="프리셋 엔진"
    )
    ap.add_argument(
        "--models",
        nargs="*",
        default=None,
        help="직접 model 리스트 (예: openai/gpt-5.2 gemini/gemini-2.0-flash ...)",
    )
    ap.add_argument(
        "--suite", default=None, choices=["all", "fast"], help="여러 모델 한번에"
    )
    ap.add_argument("--threads", type=int, default=12, help="동시 호출 개수(병렬)")
    ap.add_argument("--max_tokens", type=int, default=256)
    ap.add_argument("--temperature", type=float, default=0.2)
    ap.add_argument("--timeout", type=float, default=60.0)
    ap.add_argument(
        "--reasoning", default=None, help="(옵션) reasoning_effort 예: low/medium/high"
    )
    ap.add_argument(
        "--retry_on_bad_format", action="store_true", help="형식 불량이면 1회 재시도"
    )

    # ✅ 노이즈 제거 옵션
    denoise_group = ap.add_mutually_exclusive_group()
    denoise_group.add_argument(
        "--denoise",
        action="store_true",
        help="노이즈 줄(ㅋㅋ/감탄사 단독 등) 제거 + 도배 압축",
    )
    denoise_group.add_argument(
        "--no_denoise", action="store_true", help="노이즈 제거 비활성화"
    )
    ap.add_argument(
        "--dedup_run_min",
        type=int,
        default=3,
        help="연속 동일 줄 도배를 (xN)으로 압축하는 최소 N (기본 3)",
    )
    ap.add_argument(
        "--max_lines",
        type=int,
        default=0,
        help="(선택) 전처리 후 최대 줄 수(0이면 제한 없음). 초과 시 마지막 N줄만 유지",
    )
    ap.add_argument(
        "--file_workers",
        type=int,
        default=12,
        help="폴더 처리 시 동시에 처리할 파일 수 (기본 12)",
    )
    ap.add_argument(
        "--output-dir",
        type=str,
        default="../web/public/summary",
        help="JSON 모드에서 출력 파일을 저장할 폴더 경로 (기본: ../web/public/summary)",
    )
    # 이모티콘 제거 옵션 (기본값: True, 즉 이모티콘 제거)
    ap.add_argument(
        "--keep-emoticons",
        action="store_false",
        dest="remove_emoticons",
        default=True,
        help="이모티콘 {:...:} 형식 유지 (기본값: 이모티콘 제거)",
    )

    args = ap.parse_args()

    # 기본은 denoise ON으로 추천(하지만 기존 동작 유지 원하면 --no_denoise)
    do_denoise = True
    if args.no_denoise:
        do_denoise = False
    if args.denoise:
        do_denoise = True

    # 실행할 모델들 결정
    if args.models:
        models = args.models
    elif args.engine:
        models = [engines[args.engine]]
    elif args.suite == "fast":
        models = [
            engines["gemini2"],
            engines["gemini25"],
            engines["groq_8b"],
            engines["grok_fast"],
        ]
    else:  # default
        models = [
            engines["gemini25"],
            engines["groq_70b"],
            engines["grok_fast"],
            engines["gpt52"],
        ]

    # JSON 모드 처리
    if args.json:
        if not os.path.isfile(args.input):
            print(f"오류: '{args.input}'는 유효한 파일이 아닙니다.")
            return

        if not args.input.endswith(".json"):
            print(f"오류: JSON 모드에서는 .json 파일이 필요합니다.")
            return

        # 모델 선택 (JSON 모드에서는 단일 모델만 사용)
        if args.models:
            model = args.models[0]
        elif args.engine:
            model = engines[args.engine]
        elif args.suite == "fast":
            model = engines["gemini2"]
        else:
            model = engines["gemini25"]

        # 기본 denoise 설정
        do_denoise = True
        if args.no_denoise:
            do_denoise = False
        if args.denoise:
            do_denoise = True

        result = process_json_file(
            args.input,
            model,
            args.max_tokens,
            args.temperature,
            args.timeout,
            args.reasoning,
            args.retry_on_bad_format,
            do_denoise,
            args.dedup_run_min,
            args.max_lines,
            args.threads,
            args.output_dir,
            args.remove_emoticons,
        )
        print(f"처리 완료: {result['input_path']} -> {result['output_path']}")
        print(f"처리된 이벤트 수: {result['events_processed']}")
        return

    # 입력이 파일인지 폴더인지 확인
    input_path = args.input
    if os.path.isfile(input_path):
        # 단일 파일 처리
        file_result = process_file(
            input_path,
            models,
            args.max_tokens,
            args.temperature,
            args.timeout,
            args.reasoning,
            args.retry_on_bad_format,
            args.threads,
            do_denoise,
            args.dedup_run_min,
            args.max_lines,
            args.remove_emoticons,
        )
        print_file_results(file_result)
    elif os.path.isdir(input_path):
        # 폴더인 경우 파일명 순으로 정렬하여 각 파일 처리
        file_list = [
            f
            for f in os.listdir(input_path)
            if os.path.isfile(os.path.join(input_path, f))
        ]
        file_list.sort()  # 파일명 순으로 정렬

        if not file_list:
            print(f"경고: 폴더 '{input_path}'에 파일이 없습니다.")
            return

        # 병렬로 파일 처리
        file_paths = [os.path.join(input_path, f) for f in file_list]

        def process_single_file(file_path: str) -> dict[str, Any]:
            return process_file(
                file_path,
                models,
                args.max_tokens,
                args.temperature,
                args.timeout,
                args.reasoning,
                args.retry_on_bad_format,
                args.threads,
                do_denoise,
                args.dedup_run_min,
                args.max_lines,
                args.remove_emoticons,
            )

        file_results = run_parallel_with_progress(
            file_paths,
            process_single_file,
            "파일 처리",
            "파일",
            args.file_workers,
        )

        # 에러 처리 및 파일명 순으로 정렬
        processed_results = []
        for i, result in enumerate(file_results):
            if result is None:
                file_path = file_paths[i]
                processed_results.append(
                    {
                        "filename": os.path.basename(file_path),
                        "filepath": file_path,
                        "results": [{"error": "처리 중 오류 발생"}],
                    }
                )
            else:
                processed_results.append(result)

        # 파일명 순으로 결과 정렬
        processed_results.sort(key=lambda x: x["filename"])
        file_results = processed_results

        # 결과 출력
        for file_result in file_results:
            print_file_results(file_result)
    else:
        print(f"오류: '{input_path}'는 유효한 파일 또는 폴더가 아닙니다.")
        return


if __name__ == "__main__":
    main()
