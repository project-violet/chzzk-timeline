import requests
import json
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path


def load_json_file(file_path):
    """JSON 파일을 로드합니다."""
    with open(file_path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_json_file(data, file_path):
    """데이터를 JSON 파일로 저장합니다."""
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=4)
    print(f"✅ JSON 파일 저장 완료: {file_path}")


def filter_replays_within_month(replays):
    """한 달 이내의 replays만 필터링합니다."""
    now = datetime.now(timezone(timedelta(hours=9)))  # KST
    one_month_ago = now - timedelta(days=30)

    filtered = []
    for replay in replays:
        start_str = replay.get("start")
        if not start_str:
            continue

        try:
            # "2025-11-14 02:29:28" 형식 파싱
            start_date = datetime.strptime(start_str, "%Y-%m-%d %H:%M:%S")
            # KST timezone 추가
            start_date = start_date.replace(tzinfo=timezone(timedelta(hours=9)))

            if start_date >= one_month_ago:
                filtered.append(replay)
        except ValueError as e:
            print(f"⚠️  날짜 파싱 오류: {start_str}, {e}")
            continue

    return filtered


def get_top_100_channels_with_recent_replays(json_path):
    """follower가 많은 순으로 상위 100명을 뽑고, 한 달 이내 replays만 필터링합니다."""
    print("📂 JSON 파일 로드 중...")
    channels = load_json_file(json_path)

    print(f"📊 총 {len(channels)}개 채널 발견")

    # follower 기준으로 정렬 (내림차순)
    sorted_channels = sorted(channels, key=lambda x: x.get("follower", 0), reverse=True)

    # 상위 100명 추출
    top_100 = sorted_channels[:200]
    print("🏆 상위 100명 채널 추출 완료")

    # 한 달 이내 replays만 필터링
    result = []
    for channel in top_100:
        replays = channel.get("replays", [])
        filtered_replays = filter_replays_within_month(replays)

        if filtered_replays:
            channel_data = {
                "name": channel.get("name"),
                "follower": channel.get("follower"),
                "channelId": channel.get("channelId"),
                "image": channel.get("image"),
                "replays": filtered_replays,
            }
            result.append(channel_data)
            print(
                f"  ✓ {channel.get('name')}: {len(filtered_replays)}개 replay (전체 {len(replays)}개 중)"
            )

    print(
        f"📝 총 {len(result)}개 채널에 {sum(len(c['replays']) for c in result)}개 replay 필터링 완료"
    )
    return result


def fetch_and_save_chat_data(video_no, output_dir=None):
    """특정 videoNo의 채팅 데이터를 가져와서 파일로 저장합니다."""
    if output_dir:
        output_path = Path(output_dir)
        output_path.mkdir(parents=True, exist_ok=True)
        file_path = output_path / f"chatLog-{video_no}.log"
    else:
        file_path = Path(f"chatLog-{video_no}.log")

    # 이미 파일이 존재하고 크기가 0보다 크면 건너뛰기
    if file_path.exists() and file_path.stat().st_size > 0:
        return  # process_replays_chat에서 이미 필터링했으므로 여기서는 조용히 리턴

    next_player_message_time = "0"

    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/"
        }

        with open(file_path, "w", encoding="utf-8") as file:
            while True:
                time.sleep(0.1)  # API 요청 간 딜레이
                url = f"https://api.chzzk.naver.com/service/v1/videos/{video_no}/chats?playerMessageTime={next_player_message_time}"
                response = requests.get(url, headers=headers)
                response.raise_for_status()
                data = response.json()

                if data["code"] == 200 and data["content"]["videoChats"]:
                    video_chats = data["content"]["videoChats"]

                    # 비디오 채팅 데이터를 로그 파일에 기록
                    for chat in video_chats:
                        message_time = chat["messageTime"]
                        user_id_hash = chat["userIdHash"]
                        content = chat["content"]

                        # 유닉스 타임스탬프를 한국 시간으로 변환
                        timestamp = message_time / 1000.0
                        kst = timezone(timedelta(hours=9))
                        kst_time = datetime.fromtimestamp(timestamp, kst)
                        formatted_time = kst_time.strftime("%Y-%m-%d %H:%M:%S")

                        # 프로필에서 닉네임 가져오기
                        if chat["profile"] and chat["profile"] != "null":
                            try:
                                profile = json.loads(chat["profile"])
                                nickname = profile.get("nickname", "Unknown")
                            except json.JSONDecodeError:
                                nickname = "Unknown"
                        else:
                            nickname = "Unknown"

                        # 로그 메시지 생성
                        log_message = f"[{formatted_time}] {nickname}: {content} ({user_id_hash})\n"

                        # 파일에 기록
                        file.write(log_message)

                    # 다음 메시지 시간 설정
                    next_player_message_time = data["content"]["nextPlayerMessageTime"]

                    # 다음 메시지 시간이 null이면 크롤링 종료
                    if next_player_message_time is None:
                        print(f"✅ {file_path.name} 저장 완료 (마지막 페이지)")
                        break

                    print(
                        f"  📄 {file_path.name} 진행 중... (nextPlayerMessageTime: {next_player_message_time})"
                    )

                else:
                    print(
                        f"⚠️  {file_path.name}: 유효한 채팅 데이터가 없거나 요청이 완료되었습니다."
                    )
                    break

    except requests.exceptions.RequestException as e:
        print(f"❌ {file_path.name} 데이터 가져오기 오류: {e}")
    except KeyError as e:
        print(f"❌ {file_path.name} JSON 파싱 오류: {e}")
    except Exception as e:
        print(f"❌ {file_path.name} 예상치 못한 오류: {e}")


def process_replays_chat(filtered_replays_json_path, output_dir=None):
    """필터링된 replays JSON을 읽어서 각 replay의 chat을 저장합니다."""
    print("\n📂 필터링된 replays JSON 로드 중...")
    data = load_json_file(filtered_replays_json_path)

    # 출력 디렉토리 설정
    if output_dir:
        output_path = Path(output_dir)
        output_path.mkdir(parents=True, exist_ok=True)
    else:
        output_path = Path(".")

    # 모든 replays의 videoNo 수집 및 존재 여부 확인
    all_video_nos = []
    existing_files = []
    for channel in data:
        for replay in channel.get("replays", []):
            video_no = replay.get("videoNo")
            if video_no:
                file_path = output_path / f"chatLog-{video_no}.log"
                if file_path.exists() and file_path.stat().st_size > 0:
                    existing_files.append(video_no)
                else:
                    all_video_nos.append(video_no)

            break

    print(f"📹 총 {len(all_video_nos) + len(existing_files)}개 replay 발견")
    if existing_files:
        print(f"⏭️  이미 존재하는 파일 {len(existing_files)}개 건너뛰기")
    print(f"📥 새로 수집할 replay: {len(all_video_nos)}개")

    # 각 videoNo에 대해 chat 데이터 가져오기
    for idx, video_no in enumerate(all_video_nos, 1):
        print(f"\n[{idx}/{len(all_video_nos)}] videoNo: {video_no} 처리 중...")
        fetch_and_save_chat_data(video_no, output_dir)
        time.sleep(0.2)  # API 요청 간 추가 딜레이

    print("\n✅ 모든 chat 데이터 수집 완료!")


def main():
    # 경로 설정
    base_dir = Path(__file__).resolve().parent
    input_json = base_dir / "web" / "public" / "channel_with_replays_0.json"
    filtered_json = base_dir / "top100_recent_replays.json"
    chat_output_dir = base_dir / "chat_logs"

    # 1단계: 상위 100명의 한 달 이내 replays 필터링 및 저장
    print("=" * 60)
    print("1단계: 상위 100명 채널의 한 달 이내 replays 필터링")
    print("=" * 60)
    filtered_data = get_top_100_channels_with_recent_replays(input_json)
    save_json_file(filtered_data, filtered_json)

    # 2단계: 필터링된 replays의 chat 데이터 수집
    print("\n" + "=" * 60)
    print("2단계: 필터링된 replays의 chat 데이터 수집")
    print("=" * 60)
    process_replays_chat(filtered_json, chat_output_dir)

    print("\n" + "=" * 60)
    print("🎉 모든 작업 완료!")
    print("=" * 60)
    print(f"📁 필터링된 replays JSON: {filtered_json}")
    print(f"📁 Chat 로그 저장 위치: {chat_output_dir}")


if __name__ == "__main__":
    main()
