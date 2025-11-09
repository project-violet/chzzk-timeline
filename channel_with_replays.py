from __future__ import annotations

import json
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Iterable


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as file:
        return json.load(file)


def load_channels(path: Path) -> list[dict]:
    data = load_json(path)
    if not isinstance(data, list):
        raise ValueError("channels.json 데이터 형식이 리스트가 아닙니다.")
    return data


def pick_latest_replay(videos: Iterable[dict]) -> dict | None:
    latest: dict | None = None
    latest_ts = -1
    for video in videos:
        ts = video.get("publishDateAt")
        if ts is None:
            continue
        if ts > latest_ts:
            latest = video
            latest_ts = ts
    if latest is not None:
        return latest
    videos = list(videos)
    return videos[0] if videos else None


def parse_datetime(value: str) -> datetime | None:
    try:
        return datetime.strptime(value, "%Y-%m-%d %H:%M:%S")
    except (TypeError, ValueError):
        return None


def get_duration_seconds(video: dict) -> int | None:
    duration = video.get("durationSec")
    try:
        return int(duration)
    except (TypeError, ValueError):
        return None


def format_time_window(
    publish_date: str, duration_seconds: int | None
) -> tuple[str, str]:
    start_dt = parse_datetime(publish_date)
    if not start_dt:
        return ("시작 시간 정보 없음", "종료 시간 정보 없음")

    end_dt: datetime | None = None
    if duration_seconds is not None:
        end_dt = start_dt + timedelta(seconds=duration_seconds)

    start_str = start_dt.strftime("%Y-%m-%d %H:%M:%S")
    end_str = end_dt.strftime("%Y-%m-%d %H:%M:%S") if end_dt else "종료 시간 정보 없음"
    return start_str, end_str


def build_replay_entries(videos: Iterable[dict]) -> list[dict]:
    entries: list[dict] = []
    for video in videos:
        title = video.get("title", "제목 없음")
        publish_date = video.get("publishDate")
        duration_seconds = get_duration_seconds(video)
        start_str, end_str = format_time_window(publish_date, duration_seconds)
        entries.append(
            {
                "title": title,
                "start": start_str,
                "end": end_str,
                "videoNo": video.get("videoNo"),
                "thumbnail": video.get("thumbnailUrl"),
                "tags": video.get("tags"),
                "categoryKo": video.get("categoryKo"),
            }
        )
    return entries


def save_summary_json(data: list[dict], path: Path) -> None:
    with path.open("w", encoding="utf-8") as file:
        json.dump(data, file, ensure_ascii=False, separators=(",", ":"))
    print(f"✅ 요약 JSON 저장 완료: {path}")


def main() -> None:
    base_dir = Path(__file__).resolve().parent
    data_dir = base_dir / "data"
    replays_dir = data_dir / "replays"
    summary_path = base_dir / "web" / "public" / "channel_with_replays.json"

    channels_path = base_dir / "channels.json"
    channels = load_channels(channels_path)
    top_channels = sorted(
        channels,
        key=lambda channel: channel.get("follower", 0),
        reverse=True,
    )

    summary_entries: list[dict] = []

    for channel in top_channels:
        channel_id = channel.get("id")
        channel_name = channel.get("name", channel_id or "")
        followers = channel.get("follower", 0)

        if not channel_id:
            print(f"❌ 채널 ID 없음, 건너뜀: {channel_name!r}")
            continue

        replay_path = replays_dir / f"{channel_id}_replays.json"
        if not replay_path.exists():
            print(f"⚠️  리플레이 파일 없음: {replay_path.name}")
            continue

        data = load_json(replay_path)
        videos = data.get("videos") if isinstance(data, dict) else None
        if not videos:
            print(f"⚠️  리플레이 데이터 없음: {channel_name}")
            continue

        latest = pick_latest_replay(videos)
        if not latest:
            print(f"⚠️  최신 리플레이 선택 실패: {channel_name}")
            continue

        publish_date = latest.get("publishDate")
        duration_seconds = get_duration_seconds(latest)
        start_str, end_str = format_time_window(publish_date, duration_seconds)

        replay_entries = build_replay_entries(videos)
        summary_entries.append(
            {
                "name": channel_name,
                "follower": followers,
                "channelId": channel_id,
                "image": channel.get("image"),
                "replays": replay_entries,
            }
        )

    if not summary_entries:
        print("⚠️  저장할 요약 정보가 없습니다.")
        return

    data_dir.mkdir(parents=True, exist_ok=True)

    split_index = len(summary_entries) // 10
    chunks = [
        summary_entries[:split_index],
        summary_entries[split_index:],
    ]

    for idx, chunk in enumerate(chunks):
        output_path = summary_path.with_name(f"channel_with_replays_{idx}.json")
        save_summary_json(chunk, output_path)


if __name__ == "__main__":
    main()
