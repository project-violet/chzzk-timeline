from __future__ import annotations

import json
import time
from pathlib import Path

from list_replays import ChzzkAPIError, list_replays_all, save_json


def load_channels(path: Path) -> list[dict]:
    with path.open("r", encoding="utf-8") as file:
        data = json.load(file)
    if not isinstance(data, list):
        raise ValueError("channels.json 데이터 형식이 리스트가 아닙니다.")
    return data


def main() -> None:
    base_dir = Path(__file__).resolve().parent
    channels_path = base_dir / "channels.json"
    output_dir = base_dir / "data" / "replays"
    output_dir.mkdir(parents=True, exist_ok=True)

    channels = load_channels(channels_path)

    for channel in channels:
        channel_id = channel.get("id")
        channel_name = channel.get("name", channel_id or "")

        if not channel_id:
            print(f"❌ 채널 ID 없음, 건너뜀: {channel_name!r}")
            continue

        try:
            replays = list_replays_all(channel_id, size=50)
        except ChzzkAPIError as err:
            print(f"⚠️  재생목록을 가져오지 못했습니다 ({channel_name}): {err}")
            continue

        output_path = output_dir / f"{channel_id}_replays.json"
        save_json(replays, str(output_path))
        # time.sleep(0.5)


if __name__ == "__main__":
    main()
