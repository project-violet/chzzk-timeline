import json
from datetime import datetime, timezone
import boto3

s3 = boto3.client("s3")


def _require_str(event: dict, key: str) -> str:
    v = event.get(key)
    if not isinstance(v, str) or not v.strip():
        raise ValueError(f"event['{key}'] (non-empty string) is required.")
    return v.strip()


def _parse_s3_path(path: str):
    """
    허용 포맷:
      - s3://bucket/key-or-prefix
      - bucket/key-or-prefix
    return: (bucket, key_or_prefix)
    """
    p = path.strip()
    if p.startswith("s3://"):
        p = p[len("s3://") :]
    parts = p.split("/", 1)
    if len(parts) != 2 or not parts[0] or not parts[1]:
        raise ValueError(
            "output_bucket_path must be like 's3://bucket/key' or 'bucket/key'"
        )
    return parts[0], parts[1]


def handler(event, context):
    if not isinstance(event, dict):
        raise ValueError("Event must be a JSON object.")

    # ---- 입력: 전부 event에서만 받음 ----
    bucket = _require_str(event, "bucket")
    prefix = _require_str(event, "prefix")
    output_bucket_path = _require_str(event, "output_bucket_path")

    # prefix 정규화 (폴더처럼 쓰려면 끝에 /)
    if prefix and not prefix.endswith("/"):
        prefix += "/"

    out_bucket, out_key_or_prefix = _parse_s3_path(output_bucket_path)

    # OUTPUT 경로가 폴더(prefix)이면 timestamp.json 자동 생성
    if out_key_or_prefix.endswith("/"):
        ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        out_key = f"{out_key_or_prefix}{ts}.json"
    elif out_key_or_prefix.lower().endswith(".json"):
        out_key = out_key_or_prefix
    else:
        ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        out_key = f"{out_key_or_prefix.rstrip('/')}/{ts}.json"

    # ---- S3 리스트: prefix 바로 아래만 (non-recursive) ----
    paginator = s3.get_paginator("list_objects_v2")

    items = []
    for page in paginator.paginate(
        Bucket=bucket,
        Prefix=prefix,
        Delimiter="/",  # 핵심: 하위 폴더로 재귀 안 들어감
    ):
        for obj in page.get("Contents", []):
            key = obj["Key"]
            if key == prefix or key.endswith("/"):
                continue

            items.append(
                {
                    "key": key,
                    "filename": key.rsplit("/", 1)[-1],
                    "size": obj.get("Size"),
                    "last_modified": (
                        obj["LastModified"].astimezone(timezone.utc).isoformat()
                        if obj.get("LastModified")
                        else None
                    ),
                }
            )

    payload = {
        "source": {"bucket": bucket, "prefix": prefix},
        "count": len(items),
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "items": items,
    }

    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")

    s3.put_object(
        Bucket=out_bucket,
        Key=out_key,
        Body=body,
        ContentType="application/json",
    )

    return {
        "ok": True,
        "count": len(items),
        "output": {"bucket": out_bucket, "key": out_key},
    }
