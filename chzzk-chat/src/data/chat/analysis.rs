use std::collections::HashMap;

use crate::data::models::{ChannelWithReplays, ChatLog};

/// 채팅 로그 분석 결과
#[derive(Debug, Clone)]
pub struct ChatAnalysis {
    pub total_messages: usize,
    pub unique_users: usize,
    pub unique_nicknames: usize,
    pub messages_per_user: HashMap<String, usize>,
    pub messages_per_nickname: HashMap<String, usize>,
    pub first_message_time: Option<chrono::DateTime<chrono::FixedOffset>>,
    pub last_message_time: Option<chrono::DateTime<chrono::FixedOffset>>,
    pub duration_seconds: Option<i64>,
}

/// 단일 채팅 로그를 분석합니다.
pub fn analyze_chat_log(chat_log: &ChatLog) -> ChatAnalysis {
    let total_messages = chat_log.messages.len();

    // 고유 사용자 수 (user_id 기준)
    let unique_users: std::collections::HashSet<String> = chat_log
        .messages
        .iter()
        .map(|msg| msg.user_id.clone())
        .collect();
    let unique_users_count = unique_users.len();

    // 고유 닉네임 수
    let unique_nicknames: std::collections::HashSet<String> = chat_log
        .messages
        .iter()
        .map(|msg| msg.nickname.clone())
        .collect();
    let unique_nicknames_count = unique_nicknames.len();

    // 사용자별 메시지 수
    let mut messages_per_user: HashMap<String, usize> = HashMap::new();
    for message in &chat_log.messages {
        *messages_per_user
            .entry(message.user_id.clone())
            .or_insert(0) += 1;
    }

    // 닉네임별 메시지 수
    let mut messages_per_nickname: HashMap<String, usize> = HashMap::new();
    for message in &chat_log.messages {
        *messages_per_nickname
            .entry(message.nickname.clone())
            .or_insert(0) += 1;
    }

    // 시간 정보
    let mut timestamps: Vec<chrono::DateTime<chrono::FixedOffset>> =
        chat_log.messages.iter().map(|msg| msg.timestamp).collect();
    timestamps.sort();

    let first_message_time = timestamps.first().copied();
    let last_message_time = timestamps.last().copied();
    let duration_seconds =
        if let (Some(first), Some(last)) = (first_message_time, last_message_time) {
            Some((last - first).num_seconds())
        } else {
            None
        };

    ChatAnalysis {
        total_messages,
        unique_users: unique_users_count,
        unique_nicknames: unique_nicknames_count,
        messages_per_user,
        messages_per_nickname,
        first_message_time,
        last_message_time,
        duration_seconds,
    }
}

/// 여러 채팅 로그를 분석합니다.
#[allow(dead_code)]
pub fn analyze_chat_logs(chat_logs: &[ChatLog]) -> Vec<ChatAnalysis> {
    chat_logs.iter().map(analyze_chat_log).collect()
}

/// video_id로 채널 및 리플레이 정보를 찾습니다.
fn find_channel_and_replay(
    video_id: u64,
    channels: &[ChannelWithReplays],
) -> (
    Option<&ChannelWithReplays>,
    Option<&crate::data::models::Replay>,
) {
    for channel in channels {
        if let Some(replay) = channel.replays.iter().find(|r| r.video_no == video_id) {
            return (Some(channel), Some(replay));
        }
    }
    (None, None)
}

/// 채팅 로그 분석 결과를 요약 출력합니다.
pub fn print_analysis_summary(
    chat_log: &ChatLog,
    analysis: &ChatAnalysis,
    channels: &[ChannelWithReplays],
) {
    println!(
        "=== 채팅 로그 분석 결과 (Video ID: {}) ===",
        chat_log.video_id
    );

    // video_id로 채널 및 리플레이 정보 찾기
    let (channel_info, replay_info) = find_channel_and_replay(chat_log.video_id, channels);

    if let Some(channel) = channel_info {
        println!(
            "채널: {} (ID: {}, 팔로워: {})",
            channel.name, channel.channel_id, channel.follower
        );
    } else {
        println!("채널 정보: 찾을 수 없음");
    }

    if let Some(replay) = replay_info {
        println!("방송 제목: {}", replay.title);
        if let Some(category) = &replay.category_ko {
            println!("카테고리: {}", category);
        }
        println!("방송 기간: {} ~ {}", replay.start, replay.end);
        if !replay.tags.is_empty() {
            println!("태그: {}", replay.tags.join(", "));
        }
    } else {
        println!("리플레이 정보: 찾을 수 없음");
    }

    println!();
    println!("총 메시지 수: {}", analysis.total_messages);
    println!("고유 사용자 수: {}", analysis.unique_users);
    println!("고유 닉네임 수: {}", analysis.unique_nicknames);

    if let Some(first) = analysis.first_message_time {
        println!("첫 메시지 시간: {}", first.format("%Y-%m-%d %H:%M:%S %z"));
    }
    if let Some(last) = analysis.last_message_time {
        println!(
            "마지막 메시지 시간: {}",
            last.format("%Y-%m-%d %H:%M:%S %z")
        );
    }
    if let Some(duration) = analysis.duration_seconds {
        let hours = duration / 3600;
        let minutes = (duration % 3600) / 60;
        let seconds = duration % 60;
        println!("방송 시간: {}시간 {}분 {}초", hours, minutes, seconds);
    }

    // 상위 10명의 활성 사용자
    let mut top_users: Vec<(&String, &usize)> = analysis.messages_per_user.iter().collect();
    top_users.sort_by(|a, b| b.1.cmp(a.1));
    println!("\n상위 10명의 활성 사용자:");
    for (i, (user_id, count)) in top_users.iter().take(10).enumerate() {
        println!("  {}. {}: {} 메시지", i + 1, user_id, count);
    }

    // 상위 10명의 활성 닉네임
    let mut top_nicknames: Vec<(&String, &usize)> = analysis.messages_per_nickname.iter().collect();
    top_nicknames.sort_by(|a, b| b.1.cmp(a.1));
    println!("\n상위 10명의 활성 닉네임:");
    for (i, (nickname, count)) in top_nicknames.iter().take(10).enumerate() {
        println!("  {}. {}: {} 메시지", i + 1, nickname, count);
    }
    println!();
}

/// 고유 사용자 수가 기준값 이상인 chat_log를 필터링합니다.
pub fn filter_chat_logs_by_user_count(
    chat_logs: Vec<ChatLog>,
    max_user_count: usize,
) -> Vec<ChatLog> {
    use std::collections::HashSet;

    let initial_count = chat_logs.len();
    let filtered: Vec<_> = chat_logs
        .into_iter()
        .filter(|chat_log| {
            let unique_users: HashSet<String> = chat_log
                .messages
                .iter()
                .map(|msg| msg.user_id.clone())
                .collect();
            let user_count = unique_users.len();
            user_count < max_user_count
        })
        .collect();

    let filtered_count = filtered.len();
    let excluded_count = initial_count - filtered_count;

    // 필터링된 항목 로그 출력
    if excluded_count > 0 {
        println!(
            "필터링: 고유 사용자 수 {}명 이상인 chat_log {}개 제외",
            max_user_count, excluded_count
        );
    }
    println!(
        "필터링 완료: {}개 중 {}개 제외 (남은 로그 수: {})",
        initial_count, excluded_count, filtered_count
    );

    filtered
}
