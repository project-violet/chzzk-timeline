use serde::{Deserialize, Serialize};

/// ====== HTTP 응답 구조체들 ======

#[derive(Debug, Deserialize, Clone)]
pub struct ChannelInfo {
    #[serde(rename = "channelId")]
    pub channel_id: String,
    // 다른 필드는 필요 없으면 생략
}

#[derive(Debug, Deserialize, Clone)]
pub struct Live {
    #[serde(rename = "concurrentUserCount")]
    pub concurrent_user_count: u64,
    pub adult: bool,
    #[serde(rename = "chatChannelId")]
    #[allow(dead_code)]
    pub chat_channel_id: Option<String>,
    pub channel: ChannelInfo,
}

#[derive(Debug, Deserialize)]
pub struct PageNext {
    #[serde(rename = "concurrentUserCount")]
    pub concurrent_user_count: u64,
    #[serde(rename = "liveId")]
    pub live_id: u64,
}

#[derive(Debug, Deserialize)]
pub struct PageInfo {
    pub next: Option<PageNext>,
}

#[derive(Debug, Deserialize)]
pub struct LivesContent {
    pub data: Vec<Live>,
    pub page: PageInfo,
}

#[derive(Debug, Deserialize)]
pub struct LivesResponse {
    pub content: LivesContent,
}

#[derive(Debug, Deserialize, Clone)]
pub struct ChannelDetail {
    #[serde(rename = "channelId")]
    pub channel_id: String,
    #[serde(rename = "followerCount")]
    pub follower_count: Option<u64>,
    #[serde(rename = "openLive")]
    pub open_live: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct ChannelDetailResponse {
    pub content: Option<ChannelDetail>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct LiveDetail {
    #[serde(rename = "chatChannelId")]
    pub chat_channel_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct LiveDetailResponse {
    pub content: Option<LiveDetail>,
}

/// 스크래핑에 필요한 최소 정보만 모아놓은 구조체
#[derive(Debug, Clone)]
pub struct LiveReady {
    pub channel_id: String,
    pub chat_channel_id: String,
    pub follower_count: u64,
}

/// ====== WebSocket 메시지 포맷 ======

#[derive(Debug, Serialize)]
pub struct InitBody {
    pub uid: Option<String>,
    #[serde(rename = "devType")]
    pub dev_type: i32,
    #[serde(rename = "accTkn")]
    pub acc_tkn: Option<String>,
    pub auth: String,
    #[serde(rename = "libVer")]
    pub lib_ver: Option<String>,
    #[serde(rename = "osVer")]
    pub os_ver: Option<String>,
    #[serde(rename = "devName")]
    pub dev_name: Option<String>,
    pub locale: Option<String>,
    pub timezone: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct InitMessage {
    pub ver: String,
    pub cmd: i32,
    pub svcid: String,
    pub cid: String,
    pub tid: i32,
    pub bdy: InitBody,
}
