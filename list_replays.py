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


def _fetch_replays_page(channel_id: str, page: int = 0, size: int = 30):
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


def list_replays(channel: str, page: int = 0, size: int = 30):
    channel_id = resolve_channel_id(channel)
    return _fetch_replays_page(channel_id, page=page, size=size)


def list_replays_all(
    channel: str,
    size: int = 30,
    start_page: int = 0,
    max_pages: int | None = None,
    delay: float = 0.0,
):
    """
    더 이상 항목이 없을 때까지 페이지를 탐색하며 모든 리플레이를 수집합니다.

    Args:
        channel: 채널 ID, 핸들, 또는 채널 URL
        size: 페이지당 아이템 수
        start_page: 시작 페이지 (기본값 0)
        max_pages: 최대 탐색 페이지 수 (None이면 제한 없음)
        delay: 각 요청 간 대기 시간(초)
    """

    channel_id = resolve_channel_id(channel)
    page = start_page
    fetched_pages = 0
    all_videos = []
    total_pages = None
    total_count = None

    while True:
        result = _fetch_replays_page(channel_id, page=page, size=size)
        videos = result.get("videos", [])

        if total_pages is None:
            total_pages = result.get("totalPages")
        if total_count is None:
            total_count = result.get("totalCount")

        if not videos:
            break

        all_videos.extend(videos)
        fetched_pages += 1
        page += 1

        if max_pages is not None and fetched_pages >= max_pages:
            break

        if total_pages is not None and page >= total_pages:
            break

        if delay:
            time.sleep(delay)

    return {
        "channelId": channel_id,
        "page": start_page,
        "size": size,
        "fetchedPages": fetched_pages,
        "totalPages": total_pages,
        "totalCount": total_count if total_count is not None else len(all_videos),
        "videos": all_videos,
    }


def save_json(data, filename: str):
    """결과를 JSON 파일로 저장"""
    with open(filename, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"✅ JSON 파일 저장 완료: {filename}")


if __name__ == "__main__":
    # 예시: 치지직 방송인 "a7e175625fdea5a7d98428302b7aa57f"
    # channel = "a6c4ddb09cdb160478996007bff35296"
    channel = "ac6a03808bffbe58b3bfb0e25271836e"
    out = list_replays_all(channel, size=50, delay=0.2)

    # JSON으로 저장
    save_json(out, f"{channel}_replays.json")
