import json
import os
import time
import urllib.request
from datetime import datetime, timedelta, timezone
import boto3

s3 = boto3.client("s3")


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None:
        return default
    raw = raw.strip()
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError as e:
        raise ValueError(f"Invalid {name}={raw!r} (must be int)") from e


def _get_output_target(msg: dict) -> tuple[str, str]:
    """
    우선순위:
      1) SQS 메시지의 output_bucket/output_prefix
      2) Lambda 환경변수 CHATLOG_BUCKET/CHATLOG_PREFIX
      3) 기본값: chzzk-chats-bucket / raw/chats/
    """
    bucket = msg.get("output_bucket")
    prefix = msg.get("output_prefix")

    if not isinstance(bucket, str) or not bucket.strip():
        bucket = os.environ.get("CHATLOG_BUCKET", "chzzk-chats-bucket")
    if not isinstance(prefix, str) or not prefix.strip():
        prefix = os.environ.get("CHATLOG_PREFIX", "raw/chats/")

    bucket = str(bucket).strip()
    prefix = str(prefix).strip()
    if not prefix.endswith("/"):
        prefix += "/"
    return bucket, prefix


def _download_json(url: str, timeout_sec: int, user_agent: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": user_agent})
    with urllib.request.urlopen(req, timeout=timeout_sec) as r:
        return json.loads(r.read().decode("utf-8"))


def _safe_nickname(profile_value) -> str:
    if not profile_value or profile_value == "null":
        return "Unknown"
    if isinstance(profile_value, dict):
        return str(profile_value.get("nickname") or "Unknown")
    if isinstance(profile_value, str):
        try:
            obj = json.loads(profile_value)
            if isinstance(obj, dict):
                return str(obj.get("nickname") or "Unknown")
        except json.JSONDecodeError:
            return "Unknown"
    return "Unknown"


def _upload_chatlog_to_s3(video_id: str, bucket: str, key: str) -> dict:
    """
    CHZZK API를 페이지네이션으로 호출해서 chatLog를 생성하고,
    /tmp 파일 없이 S3로 바로 스트리밍 업로드한다(멀티파트 업로드).

    반환값에는 pages/lines/bytes 같은 통계를 담는다.
    """
    user_agent = os.environ.get(
        "CHZZK_USER_AGENT",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/",
    ).strip()
    timeout_sec = _env_int("CHZZK_TIMEOUT_SEC", 30)
    max_pages = _env_int("CHZZK_MAX_PAGES", 5000)  # 안전장치(사실상 무제한)
    delay_ms = _env_int("CHZZK_PAGE_DELAY_MS", 100)
    delay_sec = max(0.0, delay_ms / 1000.0)

    # 멀티파트 최소 파트 사이즈는 5MB (마지막 파트는 예외)
    part_size_mb = _env_int("CHATLOG_PART_SIZE_MB", 8)
    part_size_mb = max(part_size_mb, 5)
    part_size = part_size_mb * 1024 * 1024

    next_player_message_time = "0"
    pages = 0
    lines = 0
    last_next = None
    kst = timezone(timedelta(hours=9))
    total_bytes = 0

    upload_id = None
    parts: list[dict] = []
    buffer = bytearray()
    part_number = 1

    try:
        # 일단 멀티파트를 열어두고(로그가 작아도 비용은 크지 않음),
        # 첫 파트가 끝까지 안 찰 정도로 작으면 complete 대신 put_object로 전환.
        mp = s3.create_multipart_upload(
            Bucket=bucket,
            Key=key,
            ContentType="text/plain; charset=utf-8",
        )
        upload_id = mp["UploadId"]

        while True:
            if pages >= max_pages:
                raise RuntimeError(
                    f"Exceeded CHZZK_MAX_PAGES={max_pages} for video_id={video_id}"
                )

            if delay_sec:
                time.sleep(delay_sec)

            url = (
                f"https://api.chzzk.naver.com/service/v1/videos/{video_id}/chats"
                f"?playerMessageTime={next_player_message_time}"
            )
            data = _download_json(url, timeout_sec=timeout_sec, user_agent=user_agent)

            if data.get("code") != 200:
                break

            content = (
                data.get("content") if isinstance(data.get("content"), dict) else {}
            )
            video_chats = (
                content.get("videoChats")
                if isinstance(content.get("videoChats"), list)
                else []
            )
            if not video_chats:
                break

            for chat in video_chats:
                if not isinstance(chat, dict):
                    continue
                message_time = chat.get("messageTime")
                try:
                    timestamp = float(message_time) / 1000.0
                except (TypeError, ValueError):
                    continue

                formatted_time = datetime.fromtimestamp(timestamp, kst).strftime(
                    "%Y-%m-%d %H:%M:%S"
                )
                nickname = _safe_nickname(chat.get("profile"))
                user_id_hash = str(chat.get("userIdHash", "")).strip()
                text = (
                    str(chat.get("content", ""))
                    .replace("\r", " ")
                    .replace("\n", " ")
                    .strip()
                )

                line = (
                    f"[{formatted_time}] {nickname}: {text} ({user_id_hash})\n".encode(
                        "utf-8"
                    )
                )
                buffer.extend(line)
                total_bytes += len(line)
                lines += 1

                # 파트 업로드(버퍼가 충분히 찼을 때)
                while len(buffer) >= part_size:
                    chunk = bytes(buffer[:part_size])
                    del buffer[:part_size]
                    resp = s3.upload_part(
                        Bucket=bucket,
                        Key=key,
                        UploadId=upload_id,
                        PartNumber=part_number,
                        Body=chunk,
                    )
                    parts.append({"ETag": resp["ETag"], "PartNumber": part_number})
                    part_number += 1

            pages += 1
            last_next = next_player_message_time
            next_player_message_time = content.get("nextPlayerMessageTime")
            if next_player_message_time is None:
                break
            next_player_message_time = str(next_player_message_time).strip()
            if not next_player_message_time or next_player_message_time == last_next:
                break

        # 업로드 종료 처리
        if not parts:
            # 전체가 5MB 미만이면 멀티파트 대신 put_object가 더 단순
            s3.abort_multipart_upload(Bucket=bucket, Key=key, UploadId=upload_id)
            upload_id = None
            s3.put_object(
                Bucket=bucket,
                Key=key,
                Body=bytes(buffer),
                ContentType="text/plain; charset=utf-8",
            )
        else:
            # 마지막 파트(5MB 미만 가능)
            if buffer:
                resp = s3.upload_part(
                    Bucket=bucket,
                    Key=key,
                    UploadId=upload_id,
                    PartNumber=part_number,
                    Body=bytes(buffer),
                )
                parts.append({"ETag": resp["ETag"], "PartNumber": part_number})

            s3.complete_multipart_upload(
                Bucket=bucket,
                Key=key,
                UploadId=upload_id,
                MultipartUpload={"Parts": parts},
            )

        return {"pages": pages, "lines": lines, "bytes": total_bytes}
    except Exception:
        if upload_id:
            try:
                s3.abort_multipart_upload(Bucket=bucket, Key=key, UploadId=upload_id)
            except Exception:
                pass
        raise


def handler(event, context):
    records = event.get("Records", [])
    if not records:
        return {"ok": True, "msg": "no records"}

    # batch_size=1로 둘 거라 1개만 처리한다고 가정
    body = records[0].get("body", "")
    try:
        msg = json.loads(body) if isinstance(body, str) else body
    except Exception:
        msg = {"video_id": str(body)}

    video_id = str(msg.get("video_id", "")).strip()
    if not video_id:
        raise ValueError("missing video_id")

    out_bucket, out_prefix = _get_output_target(msg)
    key = f"{out_prefix}chatLog-{video_id}.log"

    stats = _upload_chatlog_to_s3(video_id, out_bucket, key)

    return {
        "ok": True,
        "video_id": video_id,
        "bucket": out_bucket,
        "key": key,
        "pages": stats["pages"],
        "lines": stats["lines"],
        "bytes": stats["bytes"],
        "uploaded_at_utc": datetime.now(timezone.utc).isoformat(),
    }
