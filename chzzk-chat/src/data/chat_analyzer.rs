use std::collections::HashMap;

use crate::data::models::ChatLog;

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

/// 채팅 로그 분석 결과를 요약 출력합니다.
pub fn print_analysis_summary(chat_log: &ChatLog, analysis: &ChatAnalysis) {
    println!(
        "=== 채팅 로그 분석 결과 (Video ID: {}) ===",
        chat_log.video_id
    );
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
