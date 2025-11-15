use chrono::{DateTime, FixedOffset};
use serde::Deserialize;

/// ====== Channel With Replays JSON 구조체 ======

#[derive(Debug, Deserialize, Clone)]
pub struct Replay {
    pub title: String,
    pub start: String,
    pub end: String,
    #[serde(rename = "videoNo")]
    pub video_no: u64,
    #[serde(default)]
    pub thumbnail: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(rename = "categoryKo", default)]
    pub category_ko: Option<String>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct ChannelWithReplays {
    pub name: String,
    pub follower: u64,
    #[serde(rename = "channelId")]
    pub channel_id: String,
    #[serde(default)]
    pub image: Option<String>,
    pub replays: Vec<Replay>,
}

/// ====== Chat Log 구조체 ======

/// 채팅 메시지
#[derive(Debug, Clone)]
pub struct ChatMessage {
    pub timestamp: DateTime<FixedOffset>,
    pub nickname: String,
    pub message: String,
    pub user_id: String,
}

/// 채팅 로그 (특정 비디오의 모든 채팅 메시지)
#[derive(Debug, Clone)]
pub struct ChatLog {
    pub video_id: u64,
    pub messages: Vec<ChatMessage>,
}
