use std::collections::HashMap;
use std::fs;
use std::path::Path;

use color_eyre::eyre::{Context, Result};
use serde::Serialize;

use crate::data::models::ChatLog;
use crate::utils;

/// 10분 단위 타임라인 데이터
#[derive(Debug, Serialize, Clone)]
pub struct TimelineEntry {
    /// 시작 시간 (초 단위, 첫 메시지 기준 0초)
    pub time: i64,
    /// 해당 구간의 메시지 개수
    pub count: usize,
}

/// 비디오별 채팅 타임라인 데이터
#[derive(Debug, Serialize, Clone)]
pub struct VideoChatTimeline {
    #[serde(rename = "videoId")]
    pub video_id: u64,
    /// 첫 메시지 시간 (ISO 8601 형식)
    pub start_time: String,
    /// 타임라인 데이터 (10분 단위)
    pub timeline: Vec<TimelineEntry>,
}

/// 채팅 타임라인 데이터 집합
#[derive(Debug, Serialize)]
struct VideoChatTimelineJson {
    videos: Vec<VideoChatTimeline>,
}

/// 단일 채팅 로그에 대한 10분 단위 타임라인을 계산합니다.
pub fn calculate_chat_timeline(chat_log: &ChatLog) -> Option<VideoChatTimeline> {
    if chat_log.messages.is_empty() {
        return None;
    }

    const MINUTE_INTERVAL: i64 = 10; // 10분
    const INTERVAL_SECONDS: i64 = MINUTE_INTERVAL * 60; // 600초

    // 메시지를 시간 순으로 정렬
    let mut sorted_messages: Vec<_> = chat_log.messages.iter().collect();
    sorted_messages.sort_by_key(|msg| msg.timestamp);

    // 첫 메시지 시간을 기준으로 설정
    let first_time = sorted_messages[0].timestamp;

    // 10분 단위로 메시지 개수 계산
    let mut timeline_map: HashMap<i64, usize> = HashMap::new();

    for message in &sorted_messages {
        // 첫 메시지 시간으로부터 경과 시간 (초)
        let elapsed_seconds = (message.timestamp - first_time).num_seconds();

        // 10분 단위로 구간 나누기 (0, 600, 1200, ...)
        let time_bucket = (elapsed_seconds / INTERVAL_SECONDS) * INTERVAL_SECONDS;

        // 해당 구간의 메시지 개수 증가
        *timeline_map.entry(time_bucket).or_insert(0) += 1;
    }

    // 타임라인 엔트리를 시간 순으로 정렬
    let mut timeline: Vec<TimelineEntry> = timeline_map
        .into_iter()
        .map(|(time, count)| TimelineEntry { time, count })
        .collect();
    timeline.sort_by_key(|e| e.time);

    // 첫 메시지 시간을 ISO 8601 형식으로 변환
    let start_time = first_time.format("%Y-%m-%dT%H:%M:%S%z").to_string();

    Some(VideoChatTimeline {
        video_id: chat_log.video_id,
        start_time,
        timeline,
    })
}

/// 모든 채팅 로그에 대한 타임라인을 추출합니다.
pub fn extract_video_chat_timelines(chat_logs: &[ChatLog]) -> Vec<VideoChatTimeline> {
    let mut video_timelines: Vec<VideoChatTimeline> = chat_logs
        .iter()
        .filter_map(calculate_chat_timeline)
        .collect();

    // video_id로 정렬
    video_timelines.sort_by_key(|v| v.video_id);

    video_timelines
}

/// 타임라인 데이터를 JSON 파일로 내보냅니다.
pub fn export_video_chat_timeline_json<P: AsRef<Path>>(
    timelines: &[VideoChatTimeline],
    output_path: P,
) -> Result<()> {
    // JSON 구조체 생성
    let json_data = VideoChatTimelineJson {
        videos: timelines.to_vec(),
    };

    // JSON 파일로 저장
    let json_string = serde_json::to_string_pretty(&json_data)
        .context("Failed to serialize video chat timeline to JSON")?;
    fs::write(&output_path, json_string)
        .with_context(|| format!("Failed to write JSON file: {:?}", output_path.as_ref()))?;

    Ok(())
}

/// 채팅을 10분 단위로 쪼개서 개수를 세고 JSON 파일로 내보냅니다.
pub fn extract_video_chat_timeline_count<P: AsRef<Path>>(
    chat_logs: &[ChatLog],
    output_path: P,
) -> Result<()> {
    utils::log("비디오별 채팅 타임라인 추출 중...");

    // 타임라인 추출
    let video_timelines = extract_video_chat_timelines(chat_logs);

    // JSON 파일로 내보내기
    export_video_chat_timeline_json(&video_timelines, &output_path)?;

    utils::log(format!(
        "비디오별 채팅 타임라인 추출 완료: {}개 비디오, 파일: {:?}",
        video_timelines.len(),
        output_path.as_ref()
    ));

    Ok(())
}
