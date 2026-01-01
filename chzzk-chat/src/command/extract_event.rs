use color_eyre::eyre::{Context, Result};
use std::collections::HashSet;
use std::fs;
use std::path::Path;

use crate::data::chat;
use crate::data::chat::EventInterval;
use crate::data::models::ChatLog;
use crate::data::utils;
use crate::utils as crate_utils;
use chrono::{Duration as ChronoDuration, FixedOffset, Utc};
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use serde_json;

/// 이벤트 추출 옵션
#[derive(structopt::StructOpt, Debug)]
pub enum ExtractEventOpt {
    /// Video ID로 이벤트 추출
    #[structopt(name = "video")]
    Video {
        /// Video ID
        #[structopt(long)]
        video_id: u64,
    },
    /// Channel의 최근 N일 이벤트 추출
    #[structopt(name = "channel")]
    Channel {
        /// Channel ID
        #[structopt(long)]
        channel: String,
        /// 최근 N일
        #[structopt(long)]
        recent_days: u64,
    },
    /// 구독자 수 상위 N명 채널의 최근 M일 이벤트 추출
    #[structopt(name = "top")]
    Top {
        /// 팔로워 랭킹 최대 수 (기본값: 100)
        #[structopt(long, default_value = "100")]
        max_followers: u64,
        /// 최근 N일 (기본값: 7)
        #[structopt(long, default_value = "7")]
        recent_days: u64,
        /// 각 채널당 최근 비디오 최대 개수 (기본값: 100)
        #[structopt(long, default_value = "100")]
        max_videos_per_channel: u64,
    },
}

/// 특정 video_id 또는 channel의 최근 n일 이벤트를 추출하여 파일로 저장합니다.
pub fn run_extract_event(opts: &ExtractEventOpt) -> Result<()> {
    use crate::load_channels_and_chat_logs;
    use crate::AnalysisChatOpt;

    match opts {
        ExtractEventOpt::Video { video_id } => {
            // 채널과 채팅 로그 로드
            let (_, chat_logs) = load_channels_and_chat_logs(&AnalysisChatOpt::default())?;

            // 특정 video_id 찾기
            let chat_log = chat_logs
                .iter()
                .find(|log| log.video_id == *video_id)
                .ok_or_else(|| {
                    color_eyre::eyre::eyre!("Video ID {} not found in chat logs", video_id)
                })?;

            // 이벤트 탐지
            let event_result = chat::detect_event_intervals(chat_log).ok_or_else(|| {
                color_eyre::eyre::eyre!("Failed to detect events for video {}", video_id)
            })?;

            // 이벤트 출력
            chat::print_event_intervals(&event_result);

            // JSON 파일로 저장
            save_event_chats_to_json(chat_log, &event_result)?;
        }
        ExtractEventOpt::Channel {
            channel: channel_id,
            recent_days,
        } => {
            // 채널과 채팅 로그 로드
            let (channels, chat_logs) = load_channels_and_chat_logs(&AnalysisChatOpt::default())?;

            // 채널 찾기
            let channel = channels
                .iter()
                .find(|ch| ch.channel_id == *channel_id)
                .ok_or_else(|| color_eyre::eyre::eyre!("Channel ID {} not found", channel_id))?;

            // 최근 n일 계산 (현재 시간 기준)
            let now = Utc::now().with_timezone(&FixedOffset::east_opt(9 * 3600).unwrap()); // KST
            let cutoff_date = now - ChronoDuration::days(*recent_days as i64);

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

                    // JSON 파일로 저장
                    save_event_chats_to_json(chat_log, &event_result)?;
                } else {
                    println!(
                        "Warning: Failed to detect events for video {}",
                        chat_log.video_id
                    );
                }
            }
        }
        ExtractEventOpt::Top {
            max_followers,
            recent_days,
            max_videos_per_channel,
        } => {
            // 채널과 채팅 로그 로드
            let (channels, chat_logs) = load_channels_and_chat_logs(&AnalysisChatOpt::default())?;

            // 구독자 수 기준으로 채널 정렬 (내림차순)
            let mut sorted_channels: Vec<_> = channels.iter().collect();
            sorted_channels.sort_by_key(|ch| std::cmp::Reverse(ch.follower));

            // 상위 N개 채널 선택
            let top_channels: Vec<_> = sorted_channels
                .into_iter()
                .take(*max_followers as usize)
                .collect();

            println!(
                "Selected top {} channels by follower count (total channels: {})",
                top_channels.len(),
                channels.len()
            );

            // 최근 N일 계산 (현재 시간 기준)
            let now = Utc::now().with_timezone(&FixedOffset::east_opt(9 * 3600).unwrap()); // KST
            let cutoff_date = now - ChronoDuration::days(*recent_days as i64);

            println!(
                "Filtering videos from last {} days (since {}), max {} videos per channel",
                recent_days,
                cutoff_date.format("%Y-%m-%d %H:%M:%S"),
                max_videos_per_channel
            );

            // ====== 첫 번째 단계: 최근 N일 다시보기들 가져오기 (병렬화) ======
            let pb_step1 = crate_utils::create_progress_bar(
                top_channels.len() as u64,
                "Collecting recent videos from channels",
            );

            let recent_video_ids: Vec<u64> = top_channels
                .par_iter()
                .flat_map(|channel| {
                    // 해당 채널의 최근 N일 내 비디오 찾기 (시간순 정렬 후 최대 M개 선택)
                    let mut video_with_time: Vec<(u64, chrono::DateTime<FixedOffset>)> = channel
                        .replays
                        .iter()
                        .filter_map(|replay| {
                            utils::parse_replay_time(&replay.start)
                                .ok()
                                .map(|start_time| {
                                    (replay.video_no, start_time, start_time >= cutoff_date)
                                })
                                .filter(|(_, _, is_recent)| *is_recent)
                                .map(|(video_no, start_time, _)| (video_no, start_time))
                        })
                        .collect();

                    // 시간순 정렬 (가장 최근 것부터)
                    video_with_time.sort_by_key(|(_, time)| std::cmp::Reverse(*time));

                    // 각 채널당 최대 M개만 선택
                    let video_ids: Vec<u64> = video_with_time
                        .into_iter()
                        .take(*max_videos_per_channel as usize)
                        .map(|(video_no, _)| video_no)
                        .collect();

                    pb_step1.inc(1);
                    video_ids
                })
                .collect();

            pb_step1.finish_with_message("Recent videos collected!");

            if recent_video_ids.is_empty() {
                return Err(color_eyre::eyre::eyre!(
                    "No recent videos found in top {} channels",
                    max_followers
                ));
            }

            // 중복 제거
            let recent_video_ids_set: HashSet<u64> = recent_video_ids.into_iter().collect();

            println!(
                "Found {} unique recent videos across top {} channels",
                recent_video_ids_set.len(),
                max_followers
            );

            // ====== 두 번째 단계: 다시보기들 출력하기 (병렬화) ======
            // video_id -> ChatLog 매핑 생성 (빠른 조회를 위해)
            let video_to_chat_log: std::collections::HashMap<u64, &ChatLog> = chat_logs
                .iter()
                .filter(|log| recent_video_ids_set.contains(&log.video_id))
                .map(|log| (log.video_id, log))
                .collect();

            let video_ids_with_chat_logs: Vec<u64> = recent_video_ids_set
                .into_iter()
                .filter(|video_id| video_to_chat_log.contains_key(video_id))
                .collect();

            println!(
                "Found {} videos with chat logs",
                video_ids_with_chat_logs.len()
            );

            let pb_step2 = crate_utils::create_progress_bar(
                video_ids_with_chat_logs.len() as u64,
                "Extracting events and saving JSON files",
            );

            let results: Vec<Result<usize>> = video_ids_with_chat_logs
                .par_iter()
                .map(|video_id| {
                    let chat_log = video_to_chat_log.get(video_id).unwrap();

                    // 이벤트 탐지
                    let result = if let Some(event_result) = chat::detect_event_intervals(chat_log)
                    {
                        // JSON 파일로 저장
                        match save_event_chats_to_json(chat_log, &event_result) {
                            Ok(()) => Ok(1),
                            Err(e) => Err(e),
                        }
                    } else {
                        Ok(0)
                    };

                    pb_step2.inc(1);
                    result
                })
                .collect();

            pb_step2.finish_with_message("All events processed!");

            // 결과 집계
            let mut total_saved = 0;
            for result in results {
                total_saved += result?;
            }

            println!("\n=== Summary ===");
            println!(
                "Processed {} videos, saved {} event JSON files",
                video_ids_with_chat_logs.len(),
                total_saved
            );
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
    let filename = format!("chats/{}_chat.json", chat_log.video_id);
    let file_path = Path::new(&filename);

    // 디렉터리 생성
    if let Some(parent) = file_path.parent() {
        fs::create_dir_all(parent)
            .with_context(|| format!("Failed to create directory: {:?}", parent))?;
    }

    // 중복 체크를 위한 HashSet: (start_sec, end_sec) 쌍을 저장
    let mut seen_intervals: HashSet<(i64, i64)> = HashSet::new();
    let mut _saved_count = 0;
    let mut _skipped_count = 0;

    let mut events_json = Vec::new();

    // 각 이벤트마다 처리
    for (_event_idx, event) in event_result.events.iter().enumerate() {
        // 이벤트 구간의 절대 시간 계산
        let start_abs = event_result.first_message_time.timestamp() + event.start_sec;
        let end_abs = event_result.first_message_time.timestamp() + event.end_sec;

        // 중복 체크: 같은 (start_sec, end_sec) 구간이 이미 처리되었는지 확인
        let interval_key = (event.start_sec, event.end_sec);
        if seen_intervals.contains(&interval_key) {
            // ProgressBar를 사용하는 경우 출력을 줄이기 위해 주석 처리
            // println!(
            //     "Skipped event #{} (duplicate interval: {} ~ {})",
            //     event_idx + 1,
            //     event.start_sec,
            //     event.end_sec
            // );
            _skipped_count += 1;
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

        _saved_count += 1;
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

    // ProgressBar를 사용하는 경우 출력을 줄이기 위해 주석 처리
    // println!(
    //     "Saved {} events (skipped {} duplicates) to JSON file: {:?}",
    //     _saved_count, _skipped_count, file_path
    // );

    Ok(())
}
