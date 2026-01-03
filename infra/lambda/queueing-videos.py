import json
import os
import urllib.request
from datetime import datetime, timedelta, timezone
import boto3

s3 = boto3.client("s3")
sqs = boto3.client("sqs")


def _req(event: dict, k: str) -> str:
    v = event.get(k)
    if not isinstance(v, str) or not v.strip():
        raise ValueError(f"event['{k}'] is required (non-empty string).")
    return v.strip()


def _parse_s3_uri(uri: str):
    u = uri.strip()
    if u.startswith("s3://"):
        u = u[len("s3://") :]
    parts = u.split("/", 1)
    if len(parts) != 2 or not parts[0] or not parts[1]:
        raise ValueError("S3 uri must be like s3://bucket/key")
    return parts[0], parts[1]


def _normalize_github_raw(url: str) -> str:
    # blob URL이면 raw로 받기 쉽게 ?raw=1을 붙여줌(이미 있으면 유지)
    u = url.strip()
    if "github.com/" in u and "/blob/" in u and "raw=1" not in u:
        sep = "&" if "?" in u else "?"
        u = u + f"{sep}raw=1"
    return u


def _download_text(url: str, timeout_sec: int = 120) -> str:
    u = _normalize_github_raw(url)
    req = urllib.request.Request(u, headers={"User-Agent": "lambda/producer"})
    with urllib.request.urlopen(req, timeout=timeout_sec) as r:
        # GitHub raw는 보통 utf-8
        return r.read().decode("utf-8")


def _load_have_ids_from_chatlists(chatlists_json_bytes: bytes) -> set[str]:
    """
    chatlists.json 형태를 유연하게 처리:
      - ["11050592.json", ...]
      - ["11050592", ...]
      - {"items":[{"filename":"11050592.json"}, ...]}
      - {"items":[{"key":"raw/chats/11050592.json"}, ...]}
    """
    obj = json.loads(chatlists_json_bytes.decode("utf-8"))

    names = []
    if isinstance(obj, list):
        names = [x for x in obj if isinstance(x, (str, int))]
    elif isinstance(obj, dict) and isinstance(obj.get("items"), list):
        for it in obj["items"]:
            if isinstance(it, (str, int)):
                names.append(it)
            elif isinstance(it, dict):
                if isinstance(it.get("filename"), str):
                    names.append(it["filename"])
                elif isinstance(it.get("key"), str):
                    names.append(it["key"].rsplit("/", 1)[-1])

    out = set()
    for x in names:
        s = str(x).strip()
        if not s:
            continue
        if s.lower().endswith(".json"):
            s = s[:-5]
        out.add(s)
    return out


def _extract_videoNos_from_channels_json(text: str) -> set[str]:
    """
    channel_with_replays_0.json:
      [
        { ..., "replays":[{"videoNo":11050592, ...}, ...] },
        ...
      ]
    """
    # Lambda 환경변수로 최근 N일만 큐잉 (기본 7일)
    # - JSON의 replays[*]["end"] (channel_with_replays.py에서 만든 end_str) 기준
    # - 포맷: "%Y-%m-%d %H:%M:%S"
    recent_days_raw = os.environ.get("RECENT_DAYS", "7").strip()
    try:
        recent_days = int(recent_days_raw)
    except ValueError as e:
        raise ValueError(
            f"Invalid RECENT_DAYS={recent_days_raw!r} (must be int)"
        ) from e
    if recent_days < 0:
        raise ValueError(f"Invalid RECENT_DAYS={recent_days_raw!r} (must be >= 0)")

    now_utc = datetime.now(timezone.utc)
    cutoff_utc = now_utc - timedelta(days=recent_days)

    data = json.loads(text)
    if not isinstance(data, list):
        raise ValueError("channels json must be a list")

    vids = set()
    for ch in data:
        if not isinstance(ch, dict):
            continue
        replays = ch.get("replays", [])
        if not isinstance(replays, list):
            continue
        for r in replays:
            if not isinstance(r, dict):
                continue
            v = r.get("videoNo")
            if v is None:
                continue
            end_str = r.get("end")
            if not isinstance(end_str, str) or not end_str.strip():
                continue
            try:
                end_dt = datetime.strptime(end_str.strip(), "%Y-%m-%d %H:%M:%S")
            except ValueError:
                # "종료 시간 정보 없음" 같은 값은 제외
                continue
            end_dt_utc = end_dt.replace(tzinfo=timezone.utc)
            if end_dt_utc < cutoff_utc:
                continue
            vids.add(str(v).strip())
    return vids


def _send_sqs_batch(queue_url: str, messages: list[dict]):
    # SendMessageBatch는 10개씩
    for i in range(0, len(messages), 10):
        batch = messages[i : i + 10]
        entries = [
            {"Id": str(j), "MessageBody": json.dumps(m, ensure_ascii=False)}
            for j, m in enumerate(batch)
        ]
        resp = sqs.send_message_batch(QueueUrl=queue_url, Entries=entries)
        if resp.get("Failed"):
            raise RuntimeError(f"SQS send failed: {resp['Failed']}")


def handler(event, context):
    if not isinstance(event, dict):
        raise ValueError("Event must be a JSON object.")

    chatlist_s3_uri = _req(
        event, "chatlist_s3_uri"
    )  # s3://.../manifests/chatlists.json
    channels_json_url = _req(event, "channels_json_url")  # github raw(or blob) url
    queue_url = _req(event, "queue_url")  # SQS URL
    output_s3_uri = _req(event, "output_s3_uri")  # s3://bucket/test/

    out_bucket, out_prefix = _parse_s3_uri(output_s3_uri)
    if not out_prefix.endswith("/"):
        out_prefix += "/"

    # 1) chatlists.json 읽기(S3)
    cbucket, ckey = _parse_s3_uri(chatlist_s3_uri)
    chatlists_bytes = s3.get_object(Bucket=cbucket, Key=ckey)["Body"].read()
    have_ids = _load_have_ids_from_chatlists(chatlists_bytes)

    # 2) channels json 다운로드(GitHub)
    channels_text = _download_text(channels_json_url, timeout_sec=120)
    all_video_ids = _extract_videoNos_from_channels_json(channels_text)

    # 3) 차집합 = missing
    missing = sorted(all_video_ids - have_ids)

    # 4) SQS enqueue
    now = datetime.now(timezone.utc).isoformat()
    msgs = [
        {
            "video_id": vid,
            "output_bucket": out_bucket,
            "output_prefix": out_prefix,  # "test/"
            "enqueued_at_utc": now,
        }
        for vid in missing
    ]

    if msgs:
        _send_sqs_batch(queue_url, msgs)

    return {
        "ok": True,
        "have_count": len(have_ids),
        "channels_video_count": len(all_video_ids),
        "missing_count": len(missing),
        "sample_missing": missing[:10],
    }
