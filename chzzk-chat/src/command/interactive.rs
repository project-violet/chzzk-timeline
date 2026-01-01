use chrono::Utc;
use color_eyre::eyre::Result;
use std::io::{self, Write};

use crate::api::client;
use crate::api::models::ChannelDetail;
use crate::data::models::{ChannelWithReplays, ChatLog, Replay};
use crate::data::utils as data_utils;
use crate::utils;

/// 인터렉티브 모드 실행
pub async fn run_interactive() -> Result<()> {
    utils::log("인터렉티브 모드 시작");
    println!("치지직 채팅 스크래퍼 - 인터렉티브 모드");
    println!("도움말: 'help' 입력");
    println!("종료: 'exit' 또는 'quit' 입력\n");

    // 모든 데이터 로드
    println!("데이터 로드 중...");
    let (channels, chat_logs) = match load_all_data() {
        Ok((ch, cl)) => {
            println!(
                "데이터 로드 완료: 채널 {}개, 채팅 로그 {}개\n",
                ch.len(),
                cl.len()
            );
            (ch, cl)
        }
        Err(e) => {
            eprintln!("데이터 로드 실패: {}", e);
            return Err(e);
        }
    };

    loop {
        print!("> ");
        io::stdout().flush()?;

        let mut input = String::new();
        io::stdin().read_line(&mut input)?;
        let input = input.trim();

        if input.is_empty() {
            continue;
        }

        let parts: Vec<&str> = input.split_whitespace().collect();
        if parts.is_empty() {
            continue;
        }

        let command = parts[0].to_lowercase();
        let args = &parts[1..];

        match command.as_str() {
            "exit" | "quit" | "q" => {
                println!("종료합니다.");
                break;
            }
            "help" | "h" => {
                print_help();
            }
            "search" | "s" => {
                if args.is_empty() {
                    println!("사용법: search <스트리머 이름>");
                    continue;
                }
                let query = args.join(" ");
                match search_channel_by_name(&query).await {
                    Ok(Some((channel, channel_name))) => {
                        println!("채널 ID: {}", channel.channel_id);
                        println!("채널명: {}", channel_name);
                        if let Some(follower) = channel.follower_count {
                            println!("팔로워 수: {}", follower);
                        }
                    }
                    Ok(None) => {
                        println!("채널을 찾을 수 없습니다: {}", query);
                    }
                    Err(e) => {
                        println!("오류: {}", e);
                    }
                }
            }
            "videos" | "v" => {
                if args.is_empty() {
                    println!("사용법: videos <채널 ID> [일수]");
                    println!("예시: videos a7e175625fdea5a7d98428302b7aa57f 7");
                    continue;
                }
                let channel_id = args[0];
                let days = if args.len() >= 2 {
                    args[1].parse::<u64>().unwrap_or(7)
                } else {
                    7
                };
                match list_recent_videos(&channels, channel_id, days) {
                    Ok(replays) => {
                        println!(
                            "\n최근 {}일간의 비디오 목록 (총 {}개):",
                            days,
                            replays.len()
                        );
                        if replays.is_empty() {
                            println!("(비디오가 없거나 날짜 필터링에 의해 제외되었습니다)");
                        }
                        for (idx, replay) in replays.iter().enumerate() {
                            println!("{}. [{}] {}", idx + 1, replay.start, replay.title);
                            println!("   비디오 번호: {}", replay.video_no);
                            if let Some(ref category) = replay.category_ko {
                                println!("   카테고리: {}", category);
                            }
                        }
                    }
                    Err(e) => {
                        println!("오류: {}", e);
                    }
                }
            }
            "chat" | "c" => {
                if args.is_empty() {
                    println!("사용법: chat <비디오 번호>");
                    continue;
                }
                let video_no = match args[0].parse::<u64>() {
                    Ok(n) => n,
                    Err(_) => {
                        println!("올바른 비디오 번호를 입력해주세요.");
                        continue;
                    }
                };

                match get_chat_count(&chat_logs, video_no) {
                    Ok(Some(count)) => {
                        println!("비디오 {}의 채팅 개수: {}", video_no, count);
                    }
                    Ok(None) => {
                        println!("비디오 {}의 채팅 데이터를 찾을 수 없습니다.", video_no);
                    }
                    Err(e) => {
                        println!("오류: {}", e);
                    }
                }
            }
            "load" | "l" => {
                println!("데이터는 이미 로드되어 있습니다.");
                println!("  채널: {}개", channels.len());
                println!("  채팅 로그: {}개", chat_logs.len());
            }
            _ => {
                println!("알 수 없는 명령어: {}", command);
                println!("도움말: 'help' 입력");
            }
        }
        println!(); // 빈 줄 추가
    }

    Ok(())
}

/// 도움말 출력
fn print_help() {
    println!("\n=== 사용 가능한 명령어 ===");
    println!("  search <스트리머 이름>  - 스트리머 이름으로 채널 ID 검색");
    println!("  videos <채널 ID> [일수] - 특정 채널의 최근 n일 비디오 목록 조회 (기본값: 7일)");
    println!("  chat <비디오 번호>     - 특정 다시보기의 채팅 개수 조회");
    println!("  load                  - 현재 로드된 데이터 정보 확인");
    println!("  help                  - 이 도움말 출력");
    println!("  exit / quit           - 프로그램 종료");
    println!();
}

/// 스트리머 이름으로 채널 ID 검색
async fn search_channel_by_name(query: &str) -> Result<Option<(ChannelDetail, String)>> {
    // 채널 ID 형식인지 확인 (32자 hex)
    if query.len() == 32 && query.chars().all(|c| c.is_ascii_hexdigit()) {
        // 이미 채널 ID인 경우
        if let Some(channel) = client::fetch_channel(query).await? {
            // 채널 ID만으로는 이름을 알 수 없으므로, 검색 API로 이름 가져오기
            let url = "https://api.chzzk.naver.com/service/v1/search/channels";
            let params = [
                ("keyword", query),
                ("size", "1"),
                ("withFirstChannelContent", "false"),
            ];
            let client = reqwest::Client::new();
            let resp = client
                .get(url)
                .query(&params)
                .header("User-Agent", "Mozilla")
                .send()
                .await?;

            let channel_name = if resp.status().is_success() {
                let json: serde_json::Value = resp.json().await?;
                json.get("content")
                    .and_then(|c| c.get("data"))
                    .and_then(|d| d.as_array())
                    .and_then(|arr| arr.first())
                    .and_then(|item| item.get("channel"))
                    .and_then(|c| c.get("channelName"))
                    .and_then(|n| n.as_str())
                    .map(|s| s.to_string())
                    .unwrap_or_else(|| "알 수 없음".to_string())
            } else {
                "알 수 없음".to_string()
            };

            return Ok(Some((channel, channel_name)));
        } else {
            return Ok(None);
        }
    }

    // 검색 API 호출
    let url = "https://api.chzzk.naver.com/service/v1/search/channels";
    let params = [
        ("keyword", query),
        ("size", "20"),
        ("withFirstChannelContent", "false"),
    ];

    let client = reqwest::Client::new();
    let resp = client
        .get(url)
        .query(&params)
        .header("User-Agent", "Mozilla")
        .send()
        .await?;

    if !resp.status().is_success() {
        return Err(color_eyre::eyre::eyre!("검색 API 오류: {}", resp.status()));
    }

    let json: serde_json::Value = resp.json().await?;

    if json.get("code").and_then(|v| v.as_u64()) != Some(200) {
        return Err(color_eyre::eyre::eyre!("API 응답 오류: {:?}", json));
    }

    let content = json.get("content").and_then(|v| v.as_object());
    let data = content
        .and_then(|c| c.get("data"))
        .and_then(|v| v.as_array())
        .ok_or_else(|| color_eyre::eyre::eyre!("검색 결과 데이터 형식 오류"))?;

    if data.is_empty() {
        return Ok(None);
    }

    // 정확한 이름 매칭 시도
    let exact_match = data.iter().find(|item| {
        item.get("channel")
            .and_then(|c| c.get("channelName"))
            .and_then(|n| n.as_str())
            == Some(query)
    });

    let picked = exact_match.unwrap_or(&data[0]);
    let channel_obj = picked
        .get("channel")
        .ok_or_else(|| color_eyre::eyre::eyre!("채널 정보를 찾을 수 없습니다"))?;

    let channel_id = channel_obj
        .get("channelId")
        .and_then(|v| v.as_str())
        .ok_or_else(|| color_eyre::eyre::eyre!("채널 ID를 찾을 수 없습니다"))?
        .to_string();

    let channel_name = channel_obj
        .get("channelName")
        .and_then(|v| v.as_str())
        .unwrap_or("알 수 없음")
        .to_string();

    // 채널 상세 정보 가져오기
    if let Some(channel) = client::fetch_channel(&channel_id).await? {
        Ok(Some((channel, channel_name)))
    } else {
        Ok(None)
    }
}

/// 최근 n일간의 비디오 목록 조회 (로컬 데이터에서)
fn list_recent_videos<'a>(
    channels: &'a [ChannelWithReplays],
    channel_id: &str,
    days: u64,
) -> Result<Vec<&'a Replay>> {
    let now = Utc::now();
    let cutoff_date = now - chrono::Duration::days(days as i64);

    // 채널 찾기
    let channel = channels
        .iter()
        .find(|ch| ch.channel_id == channel_id)
        .ok_or_else(|| color_eyre::eyre::eyre!("채널을 찾을 수 없습니다: {}", channel_id))?;

    // 날짜 필터링된 비디오 목록
    let mut recent_replays = Vec::new();

    for replay in &channel.replays {
        // start 날짜 파싱 (parse_replay_time 사용)
        if let Ok(start_dt) = data_utils::parse_replay_time(&replay.start) {
            let start_utc = start_dt.with_timezone(&Utc);
            // cutoff_date보다 오래된 비디오는 포함하지 않음
            if start_utc >= cutoff_date {
                recent_replays.push(replay);
            }
        }
    }

    // 최신순으로 정렬 (start 날짜 기준 내림차순)
    recent_replays.sort_by(|a, b| {
        let date_a = data_utils::parse_replay_time(&a.start).ok();
        let date_b = data_utils::parse_replay_time(&b.start).ok();

        match (date_a, date_b) {
            (Some(da), Some(db)) => db.cmp(&da), // 내림차순
            _ => std::cmp::Ordering::Equal,
        }
    });

    Ok(recent_replays)
}

/// 특정 비디오의 채팅 개수 조회
fn get_chat_count(chat_logs: &[ChatLog], video_no: u64) -> Result<Option<usize>> {
    let chat_log = chat_logs.iter().find(|log| log.video_id == video_no);
    Ok(chat_log.map(|log| log.messages.len()))
}

/// 모든 데이터 로드
fn load_all_data() -> Result<(Vec<ChannelWithReplays>, Vec<ChatLog>)> {
    use crate::AnalysisChatOpt;

    let opts = AnalysisChatOpt::default();
    crate::load_channels_and_chat_logs(&opts)
}
