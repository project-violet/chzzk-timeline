use color_eyre::eyre::{Context, Result};
use std::collections::HashSet;
use std::fs;
use std::io::Write;
use std::path::Path;

use crate::data::chat;
use crate::data::chat::EventInterval;
use crate::data::models::ChatLog;
use crate::data::utils;
use chrono::{Duration as ChronoDuration, FixedOffset, Utc};
use serde::{Deserialize, Serialize};
use serde_json;

/// 이벤트 추출 옵션
#[derive(structopt::StructOpt, Debug)]
pub struct ExtractEventOpt {
    /// Video ID (channel과 함께 사용할 수 없음)
    #[structopt(long)]
    pub video_id: Option<u64>,

    /// Channel ID (video_id와 함께 사용할 수 없음, recent_days 필수)
    #[structopt(long)]
    pub channel: Option<String>,

    /// 최근 N일 (channel과 함께 사용 시 필수)
    #[structopt(long)]
    pub recent_days: Option<u64>,

    /// 헤더 출력 여부 (true/false, 기본값: false)
    #[structopt(long, default_value = "false")]
    pub print_header: String,

    /// 타임스탬프 출력 여부 (true/false, 기본값: false)
    #[structopt(long, default_value = "false")]
    pub print_timestamp: String,

    /// JSON 파일로 출력 여부 (true/false, 기본값: true)
    #[structopt(long, default_value = "true")]
    pub output_json: String,
}

/// 특정 video_id 또는 channel의 최근 n일 이벤트를 추출하여 파일로 저장합니다.
pub fn run_extract_event(opts: &ExtractEventOpt) -> Result<()> {
    use crate::load_channels_and_chat_logs;
    use crate::AnalysisChatOpt;

    // 문자열을 bool로 변환
    let print_header = opts.print_header.parse::<bool>().unwrap_or(false);
    let print_timestamp = opts.print_timestamp.parse::<bool>().unwrap_or(false);
    let output_json = opts.output_json.parse::<bool>().unwrap_or(true);

    // video_id 또는 channel 중 하나는 반드시 지정되어야 함
    if opts.video_id.is_none() && opts.channel.is_none() {
        return Err(color_eyre::eyre::eyre!(
            "video_id 또는 channel 중 하나는 반드시 지정되어야 합니다"
        ));
    }

    // video_id와 channel은 함께 사용할 수 없음
    if opts.video_id.is_some() && opts.channel.is_some() {
        return Err(color_eyre::eyre::eyre!(
            "video_id와 channel은 함께 사용할 수 없습니다"
        ));
    }

    // channel을 사용할 때는 recent_days가 필수
    if opts.channel.is_some() && opts.recent_days.is_none() {
        return Err(color_eyre::eyre::eyre!(
            "channel을 사용할 때는 recent_days가 필수입니다"
        ));
    }

    // 채널과 채팅 로그 로드
    let (channels, chat_logs) = load_channels_and_chat_logs(&AnalysisChatOpt::default())?;

    // video_id 모드: 기존 로직
    if let Some(video_id) = opts.video_id {
        // 특정 video_id 찾기
        let chat_log = chat_logs
            .iter()
            .find(|log| log.video_id == video_id)
            .ok_or_else(|| {
                color_eyre::eyre::eyre!("Video ID {} not found in chat logs", video_id)
            })?;

        // 이벤트 탐지
        let event_result = chat::detect_event_intervals(chat_log).ok_or_else(|| {
            color_eyre::eyre::eyre!("Failed to detect events for video {}", video_id)
        })?;

        // 이벤트 출력
        chat::print_event_intervals(&event_result);

        // JSON 또는 파일로 저장
        if output_json {
            save_event_chats_to_json(chat_log, &event_result)?;
        } else {
            save_event_chats_to_files(chat_log, &event_result, print_header, print_timestamp)?;
        }
    }
    // channel 모드: 최근 n일 처리
    else if let Some(channel_id) = &opts.channel {
        let recent_days = opts.recent_days.unwrap(); // validation에 의해 항상 Some

        // 채널 찾기
        let channel = channels
            .iter()
            .find(|ch| ch.channel_id == *channel_id)
            .ok_or_else(|| color_eyre::eyre::eyre!("Channel ID {} not found", channel_id))?;

        // 최근 n일 계산 (현재 시간 기준)
        let now = Utc::now().with_timezone(&FixedOffset::east_opt(9 * 3600).unwrap()); // KST
        let cutoff_date = now - ChronoDuration::days(recent_days as i64);

        println!(
            "Processing channel: {} ({}), filtering videos from last {} days (since {})",
            channel.name,
            channel_id,
            recent_days,
            cutoff_date.format("%Y-%m-%d %H:%M:%S")
        );

        // 해당 채널의 최근 n일 내 비디오 찾기
        let recent_video_ids: HashSet<u64> = channel
            .replays
            .iter()
            .filter_map(|replay| {
                // replay.start 파싱
                utils::parse_replay_time(&replay.start)
                    .ok()
                    .map(|start_time| (replay.video_no, start_time >= cutoff_date))
                    .filter(|(_, is_recent)| *is_recent)
                    .map(|(video_no, _)| video_no)
            })
            .collect();

        println!("Found {} recent videos in channel", recent_video_ids.len());

        // 해당 비디오들의 채팅 로그 찾기 및 처리
        let matching_chat_logs: Vec<_> = chat_logs
            .iter()
            .filter(|log| recent_video_ids.contains(&log.video_id))
            .collect();

        if matching_chat_logs.is_empty() {
            return Err(color_eyre::eyre::eyre!(
                "No chat logs found for channel {} in the last {} days",
                channel_id,
                recent_days
            ));
        }

        println!("Processing {} chat logs...", matching_chat_logs.len());

        // 각 비디오마다 이벤트 추출
        for chat_log in matching_chat_logs {
            println!("\n=== Processing Video ID: {} ===", chat_log.video_id);

            // 이벤트 탐지
            if let Some(event_result) = chat::detect_event_intervals(chat_log) {
                // 이벤트 출력
                chat::print_event_intervals(&event_result);

                // JSON 또는 파일로 저장
                if output_json {
                    save_event_chats_to_json(chat_log, &event_result)?;
                } else {
                    save_event_chats_to_files(
                        chat_log,
                        &event_result,
                        print_header,
                        print_timestamp,
                    )?;
                }
            } else {
                println!(
                    "Warning: Failed to detect events for video {}",
                    chat_log.video_id
                );
            }
        }
    }

    Ok(())
}

/// JSON 출력용 이벤트 데이터 구조체
#[derive(Debug, Serialize, Deserialize)]
struct EventChatJson {
    event: EventInterval,
    messages: Vec<String>,
}

/// JSON 출력용 루트 구조체
#[derive(Debug, Serialize, Deserialize)]
struct EventChatsJson {
    video_id: u64,
    first_message_time: String,
    events: Vec<EventChatJson>,
}

/// ChatLog와 EventDetectionResult를 받아서 하나의 JSON 파일로 저장합니다.
fn save_event_chats_to_json(
    chat_log: &ChatLog,
    event_result: &chat::EventDetectionResult,
) -> Result<()> {
    // JSON 파일명 생성
    let filename = format!("{}_chat.json", chat_log.video_id);
    let file_path = Path::new(&filename);

    // 중복 체크를 위한 HashSet: (start_sec, end_sec) 쌍을 저장
    let mut seen_intervals: HashSet<(i64, i64)> = HashSet::new();
    let mut saved_count = 0;
    let mut skipped_count = 0;

    let mut events_json = Vec::new();

    // 각 이벤트마다 처리
    for (event_idx, event) in event_result.events.iter().enumerate() {
        // 이벤트 구간의 절대 시간 계산
        let start_abs = event_result.first_message_time.timestamp() + event.start_sec;
        let end_abs = event_result.first_message_time.timestamp() + event.end_sec;

        // 중복 체크: 같은 (start_sec, end_sec) 구간이 이미 처리되었는지 확인
        let interval_key = (event.start_sec, event.end_sec);
        if seen_intervals.contains(&interval_key) {
            println!(
                "Skipped event #{} (duplicate interval: {} ~ {})",
                event_idx + 1,
                event.start_sec,
                event.end_sec
            );
            skipped_count += 1;
            continue;
        }
        seen_intervals.insert(interval_key);

        // 해당 구간의 메시지 필터링 및 추출
        let mut message_items: Vec<_> = chat_log
            .messages
            .iter()
            .filter(|msg| {
                let msg_timestamp = msg.timestamp.timestamp();
                msg_timestamp >= start_abs && msg_timestamp <= end_abs
            })
            .collect();

        // 시간 순으로 정렬
        message_items.sort_by_key(|msg| msg.timestamp);

        // 메시지 문자열만 추출
        let messages: Vec<String> = message_items
            .iter()
            .map(|msg| msg.message.clone())
            .collect();

        events_json.push(EventChatJson {
            event: event.clone(),
            messages,
        });

        saved_count += 1;
    }

    // JSON 루트 구조체 생성
    let json_data = EventChatsJson {
        video_id: chat_log.video_id,
        first_message_time: event_result
            .first_message_time
            .format("%Y-%m-%d %H:%M:%S %z")
            .to_string(),
        events: events_json,
    };

    // JSON 파일로 저장
    let json_string =
        serde_json::to_string(&json_data).with_context(|| "Failed to serialize JSON")?;
    fs::write(file_path, json_string)
        .with_context(|| format!("Failed to write JSON file: {:?}", file_path))?;

    println!(
        "Saved {} events (skipped {} duplicates) to JSON file: {:?}",
        saved_count, skipped_count, file_path
    );

    Ok(())
}

/// ChatLog와 EventDetectionResult를 받아서 각 이벤트 구간의 채팅을 개별 파일로 저장합니다.
fn save_event_chats_to_files(
    chat_log: &ChatLog,
    event_result: &chat::EventDetectionResult,
    print_header: bool,
    print_timestamp: bool,
) -> Result<()> {
    // 폴더 이름 생성: {video_id}_chat 또는 {video_id}_chat_raw
    let folder_name = if print_header || print_timestamp {
        format!("{}_chat", chat_log.video_id)
    } else {
        format!("{}_chat_raw", chat_log.video_id)
    };
    let folder_path = Path::new(&folder_name);

    // 폴더 생성
    fs::create_dir_all(folder_path)
        .with_context(|| format!("Failed to create directory: {:?}", folder_path))?;

    // 중복 체크를 위한 HashSet: (start_sec, end_sec) 쌍을 저장
    let mut seen_intervals: HashSet<(i64, i64)> = HashSet::new();
    let mut saved_count = 0;
    let mut skipped_count = 0;

    // 각 이벤트마다 파일 생성
    for (event_idx, event) in event_result.events.iter().enumerate() {
        // 이벤트 구간의 절대 시간 계산
        let start_abs = event_result.first_message_time.timestamp() + event.start_sec;
        let end_abs = event_result.first_message_time.timestamp() + event.end_sec;

        // 중복 체크: 같은 (start_sec, end_sec) 구간이 이미 처리되었는지 확인
        let interval_key = (event.start_sec, event.end_sec);
        if seen_intervals.contains(&interval_key) {
            println!(
                "Skipped event #{} (duplicate interval: {} ~ {})",
                event_idx + 1,
                event.start_sec,
                event.end_sec
            );
            skipped_count += 1;
            continue;
        }
        seen_intervals.insert(interval_key);

        // 시작/종료 시간을 파일명에 사용할 수 있는 형식으로 변환
        let start_time =
            event_result.first_message_time + chrono::Duration::seconds(event.start_sec);
        let end_time = event_result.first_message_time + chrono::Duration::seconds(event.end_sec);

        // 파일명 생성: event_{번호}_{시작시간}_{종료시간}.log
        // 시간 형식: HHMMSS (예: 143025)
        let start_str = start_time.format("%H%M%S").to_string();
        let end_str = end_time.format("%H%M%S").to_string();
        let filename = format!("event_{:03}_{}_{}.log", event_idx + 1, start_str, end_str);
        let file_path = folder_path.join(&filename);

        // 해당 구간의 메시지 필터링
        let mut messages: Vec<_> = chat_log
            .messages
            .iter()
            .filter(|msg| {
                let msg_timestamp = msg.timestamp.timestamp();
                msg_timestamp >= start_abs && msg_timestamp <= end_abs
            })
            .collect();

        // 시간 순으로 정렬
        messages.sort_by_key(|msg| msg.timestamp);

        // 파일에 쓰기
        let mut file = fs::File::create(&file_path)
            .with_context(|| format!("Failed to create file: {:?}", file_path))?;

        // 헤더 정보 작성 (옵션에 따라)
        if print_header {
            writeln!(
                file,
                "# Event #{} - Video ID: {}",
                event_idx + 1,
                chat_log.video_id
            )?;
            writeln!(
                file,
                "# Start: {}",
                start_time.format("%Y-%m-%d %H:%M:%S %z")
            )?;
            writeln!(file, "# End: {}", end_time.format("%Y-%m-%d %H:%M:%S %z"))?;
            writeln!(
                file,
                "# Peak: {} (z-score: {:.2}, count: {})",
                event_result.first_message_time + chrono::Duration::seconds(event.peak_sec),
                event.peak_z_score,
                event.peak_count
            )?;
            writeln!(file, "# Total messages: {}", messages.len())?;
            writeln!(file)?;
        }

        // 메시지 작성
        for msg in &messages {
            if print_timestamp {
                writeln!(
                    file,
                    "[{}] {}: {}",
                    msg.timestamp.format("%H:%M:%S"),
                    msg.nickname,
                    msg.message
                )?;
            } else {
                writeln!(file, "{}", msg.message)?;
            }
        }

        println!(
            "Saved event #{} to: {:?} ({} messages)",
            event_idx + 1,
            file_path,
            messages.len()
        );
        saved_count += 1;
    }

    println!(
        "Saved {} events (skipped {} duplicates) to folder: {:?}",
        saved_count, skipped_count, folder_path
    );

    Ok(())
}
