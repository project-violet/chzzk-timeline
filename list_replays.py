import re
import time
import json
import requests
from urllib.parse import urlparse

BASE = "https://api.chzzk.naver.com"
UA = "Mozilla/5.0 (X11; Linux x86_64) PythonRequests/2.x (+github.com)"
SESSION = requests.Session()
SESSION.headers.update({"User-Agent": UA, "Accept": "application/json"})


class ChzzkAPIError(Exception):
    pass


def _request(url, params=None, max_retries=3, backoff=0.8):
    for attempt in range(max_retries):
        r = SESSION.get(url, params=params, timeout=15)
        if r.status_code == 200:
            j = r.json()
            if j.get("code") == 200:
                return j["content"]
            raise ChzzkAPIError(f"API returned non-200 code: {j}")
        if r.status_code in (429, 500, 502, 503):
            time.sleep(backoff * (2**attempt))
            continue
        r.raise_for_status()
    raise ChzzkAPIError(f"Failed after {max_retries} retries: {url}")


def is_channel_id(s: str) -> bool:
    return bool(re.fullmatch(r"[0-9a-f]{32}", s))


def extract_handle_or_id_from_url(url: str) -> str:
    path = urlparse(url).path.strip("/")
    if not path:
        return ""
    parts = path.split("/")
    return parts[-1]


def resolve_channel_id(query: str) -> str:
    q = query.strip()

    if q.startswith("http"):
        q = extract_handle_or_id_from_url(q)

    if is_channel_id(q):
        return q

    url = f"{BASE}/service/v1/search/channels"
    content = _request(
        url, params={"keyword": q, "size": 20, "withFirstChannelContent": "false"}
    )
    data = (content or {}).get("data", [])
    if not data:
        raise ChzzkAPIError(f"No channel found for query: {query}")

    exact = [d for d in data if d.get("channel", {}).get("channelName") == q]
    picked = (exact[0] if exact else data[0]).get("channel", {})
    channel_id = picked.get("channelId")
    if not channel_id:
        raise ChzzkAPIError(f"Failed to resolve channelId for query: {query}")
    return channel_id


def list_replays(channel: str, page: int = 0, size: int = 30):
    channel_id = resolve_channel_id(channel)
    url = f"{BASE}/service/v1/channels/{channel_id}/videos"
    params = {
        "sortType": "LATEST",
        "pagingType": "PAGE",
        "page": page,
        "size": size,
        "videoType": "REPLAY",
    }
    content = _request(url, params=params)

    items = []
    for v in (content or {}).get("data", []):
        items.append(
            {
                "videoNo": v.get("videoNo"),
                "videoId": v.get("videoId"),
                "title": v.get("videoTitle"),
                "publishDate": v.get("publishDate"),
                "publishDateAt": v.get("publishDateAt"),
                "durationSec": v.get("duration"),
                "views": v.get("readCount"),
                "category": v.get("videoCategory"),
                "categoryKo": v.get("videoCategoryValue"),
                "thumbnailUrl": v.get("thumbnailImageUrl"),
                "videoType": v.get("videoType"),
                "tags": v.get("tags"),
            }
        )

    result = {
        "page": content.get("page"),
        "size": content.get("size"),
        "totalCount": content.get("totalCount"),
        "totalPages": content.get("totalPages"),
        "channelId": channel_id,
        "videos": items,
    }
    return result


def save_json(data, filename: str):
    """결과를 JSON 파일로 저장"""
    with open(filename, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"✅ JSON 파일 저장 완료: {filename}")


if __name__ == "__main__":
    # 예시: 치지직 방송인 "a7e175625fdea5a7d98428302b7aa57f"
    channel = "a6c4ddb09cdb160478996007bff35296"
    out = list_replays(channel, page=0, size=50)

    # JSON으로 저장
    save_json(out, f"{channel}_replays.json")
