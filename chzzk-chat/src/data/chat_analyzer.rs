use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::Path;
use std::sync::Arc;

use chrono::{Duration as ChronoDuration, Utc};
use color_eyre::eyre::{Context, Result};
use serde::Serialize;

use crate::data::models::{ChannelWithReplays, ChatLog, Replay};
use crate::utils;
use rayon::prelude::*;

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

/// 채널 간 연결 정보 (링크)
#[derive(Debug, Clone, Serialize)]
pub struct ChannelLink {
    pub source: String,
    pub target: String,
    pub inter: usize,
    pub distance: f64,
}

/// 채널 노드 정보
#[derive(Debug, Clone, Serialize)]
pub struct ChannelNode {
    #[serde(rename = "id")]
    pub channel_id: String,
    pub name: String,
    pub follower: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image: Option<String>,
    pub chat_count: usize,
}

/// JSON 출력용 데이터 구조체
#[derive(Debug, Serialize)]
struct ChannelDistanceJson {
    #[serde(rename = "updateTime")]
    update_time: String,
    nodes: Vec<ChannelNode>,
    links: Vec<ChannelLink>,
}

/// 채널별 고유 사용자 집합을 구합니다.
fn build_channel_user_map(
    chat_logs: &[ChatLog],
    channels: &[ChannelWithReplays],
) -> HashMap<String, HashSet<String>> {
    // video_id -> channel_id 매핑 생성
    let video_to_channel: HashMap<u64, &str> = channels
        .iter()
        .flat_map(|channel| {
            channel
                .replays
                .iter()
                .map(move |replay| (replay.video_no, channel.channel_id.as_str()))
        })
        .collect();

    // 채널별 고유 사용자 집합
    let mut channel_users: HashMap<String, HashSet<String>> = HashMap::new();

    for chat_log in chat_logs {
        if let Some(channel_id) = video_to_channel.get(&chat_log.video_id) {
            let users = channel_users
                .entry(channel_id.to_string())
                .or_insert_with(HashSet::new);

            // 이 채팅 로그의 모든 고유 user_id 추가
            for message in &chat_log.messages {
                users.insert(message.user_id.clone());
            }
        }
    }

    channel_users
}

/// 채널 간 distance와 inter를 계산합니다.
pub fn calculate_channel_distances(
    chat_logs: &[ChatLog],
    channels: &[ChannelWithReplays],
    max_nodes: Option<usize>,
) -> (Vec<ChannelNode>, Vec<ChannelLink>) {
    // 채널별 고유 사용자 집합 구하기
    let channel_users = build_channel_user_map(chat_logs, channels);

    // 채널별 채팅 수 계산 (고유 사용자 수 = chat_count)
    let mut channel_nodes: Vec<ChannelNode> = channels
        .iter()
        .filter_map(|channel| {
            let chat_count = channel_users
                .get(&channel.channel_id)
                .map(|u| u.len())
                .unwrap_or(0);
            if chat_count > 0 {
                Some(ChannelNode {
                    channel_id: channel.channel_id.clone(),
                    name: channel.name.clone(),
                    follower: channel.follower,
                    image: channel.image.clone(),
                    chat_count,
                })
            } else {
                None
            }
        })
        .collect();

    // 채팅 수 기준으로 정렬
    channel_nodes.sort_by(|a, b| b.chat_count.cmp(&a.chat_count));

    // 상위 max_nodes개만 선택
    if let Some(max) = max_nodes {
        channel_nodes.truncate(max);
    }

    // 채널 쌍 생성 및 inter 계산 (병렬화)
    // Arc로 감싸서 여러 스레드에서 안전하게 공유
    let channel_nodes_arc = Arc::new(channel_nodes);
    let channel_users_arc = Arc::new(channel_users);
    let n = channel_nodes_arc.len();

    // Progress bar 생성 (총 쌍 수: n * (n - 1) / 2)
    let total_pairs = n * (n - 1) / 2;
    let pb = utils::create_progress_bar(total_pairs as u64, "Calculating channel distances...");
    let pb_arc = Arc::new(pb);

    // 모든 (i, j) 쌍을 생성 (i < j) - 병렬 처리
    let mut links: Vec<ChannelLink> = (0..n)
        .into_par_iter()
        .flat_map(|i| {
            let channel_nodes_ref = Arc::clone(&channel_nodes_arc);
            let channel_users_ref = Arc::clone(&channel_users_arc);
            let pb_ref = Arc::clone(&pb_arc);

            let source_node = &channel_nodes_ref[i];
            let source_users = channel_users_ref
                .get(&source_node.channel_id)
                .cloned()
                .unwrap_or_default();
            let source_channel_id = source_node.channel_id.clone();
            let source_chat_count = source_node.chat_count;

            // 각 i에 대해 j > i인 모든 쌍을 생성
            ((i + 1)..n)
                .map(move |j| {
                    let pb_ref = Arc::clone(&pb_ref);

                    let target_node = &channel_nodes_ref[j];
                    let target_users = channel_users_ref
                        .get(&target_node.channel_id)
                        .cloned()
                        .unwrap_or_default();
                    let target_channel_id = target_node.channel_id.clone();
                    let target_chat_count = target_node.chat_count;

                    // 교집합 계산 (inter)
                    let inter = source_users.intersection(&target_users).count();

                    // distance 계산: inter / MIN(source_cnt, target_cnt)
                    let min_count = source_chat_count.min(target_chat_count);
                    let distance = if min_count > 0 {
                        inter as f64 / min_count as f64
                    } else {
                        0.0
                    };

                    // Progress bar 업데이트
                    pb_ref.inc(1);

                    ChannelLink {
                        source: source_channel_id.clone(),
                        target: target_channel_id,
                        inter,
                        distance,
                    }
                })
                .collect::<Vec<_>>()
        })
        .collect();

    // Progress bar 완료
    pb_arc.finish_with_message("Channel distances calculated!");

    // channel_nodes를 Arc에서 다시 가져오기
    let channel_nodes = Arc::try_unwrap(channel_nodes_arc).unwrap_or_else(|arc| (*arc).clone());

    // 관련 없는 link 제거 (inter가 0이거나 distance가 0인 link 제거)
    links.retain(|link| link.inter > 0 && link.distance > 0.0);

    // links에 나타나는 channel_id 집합 생성
    let mut linked_channel_ids: HashSet<String> = HashSet::new();
    for link in &links {
        linked_channel_ids.insert(link.source.clone());
        linked_channel_ids.insert(link.target.clone());
    }

    // link가 있는 노드만 남기기
    let channel_nodes: Vec<ChannelNode> = channel_nodes
        .into_iter()
        .filter(|node| linked_channel_ids.contains(&node.channel_id))
        .collect();

    // distance 기준으로 정렬
    links.sort_by(|a, b| {
        b.distance
            .partial_cmp(&a.distance)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    (channel_nodes, links)
}

/// 채널 간 distance와 inter 정보를 JSON 파일로 내보냅니다.
pub fn export_channel_distances_json<P: AsRef<Path>>(
    nodes: &[ChannelNode],
    links: &[ChannelLink],
    output_path: P,
) -> Result<()> {
    // KST 기준 현재 시간 생성 (updateTime 형식: "2025-11-09 17:27:55")
    let now = Utc::now() + ChronoDuration::hours(9);
    let update_time = now.format("%Y-%m-%d %H:%M:%S").to_string();

    // JSON 구조체 생성 (직접 ChannelNode, ChannelLink 사용)
    let json_data = ChannelDistanceJson {
        update_time,
        nodes: nodes.to_vec(),
        links: links.to_vec(),
    };

    // JSON 파일로 저장
    let json_string = serde_json::to_string_pretty(&json_data)
        .context("Failed to serialize channel distances to JSON")?;
    fs::write(&output_path, json_string)
        .with_context(|| format!("Failed to write JSON file: {:?}", output_path.as_ref()))?;

    Ok(())
}

/// 채널별 연관 채널 링크만 JSON으로 내보냅니다.
/// 각 채널에 대해 distance ≥ min_distance 인 상위 max_per_channel 개만 포함합니다.
pub fn export_related_channel_links_json<P: AsRef<Path>>(
    links: &[ChannelLink],
    output_path: P,
    min_distance: f64,
    max_per_channel: usize,
    blacklist: &[String],
) -> Result<()> {
    use std::collections::{HashMap, HashSet};

    // 블랙리스트 set
    let blacklist_set: HashSet<&str> = blacklist.iter().map(|s| s.as_str()).collect();

    // 양방향 인접 리스트 구성: source->target, target->source 모두 포함
    let mut adj: HashMap<String, Vec<(String, usize, f64)>> = HashMap::new();
    for link in links {
        if link.distance >= min_distance {
            // 블랙리스트 채널은 완전히 제외
            if blacklist_set.contains(link.source.as_str())
                || blacklist_set.contains(link.target.as_str())
            {
                continue;
            }
            adj.entry(link.source.clone()).or_default().push((
                link.target.clone(),
                link.inter,
                link.distance,
            ));
            adj.entry(link.target.clone()).or_default().push((
                link.source.clone(),
                link.inter,
                link.distance,
            ));
        }
    }

    // 각 채널별로 distance 내림차순 정렬 후 상위 max_per_channel만 선택
    #[derive(Serialize)]
    struct RelatedItem {
        target: String,
        inter: usize,
        distance: f64,
    }

    let mut json_map: HashMap<String, Vec<RelatedItem>> = HashMap::new();
    for (channel_id, mut neighbors) in adj {
        // 방어적으로 채널 키 자체도 블랙리스트면 스킵
        if blacklist_set.contains(channel_id.as_str()) {
            continue;
        }
        neighbors.sort_by(|a, b| b.2.partial_cmp(&a.2).unwrap_or(std::cmp::Ordering::Equal));
        let top: Vec<RelatedItem> = neighbors
            .into_iter()
            .take(max_per_channel)
            .map(|(target, inter, distance)| RelatedItem {
                target,
                inter,
                distance,
            })
            .collect();
        if !top.is_empty() {
            json_map.insert(channel_id, top);
        }
    }

    let json_string = serde_json::to_string_pretty(&json_map)
        .context("Failed to serialize related channel links to JSON")?;
    fs::write(&output_path, json_string).with_context(|| {
        format!(
            "Failed to write related channel links JSON file: {:?}",
            output_path.as_ref()
        )
    })?;

    Ok(())
}

/// 각 채널별로 가장 가까운 채널 상위 5개를 출력합니다.
pub fn print_top_closest_channels(nodes: &[ChannelNode], links: &[ChannelLink]) {
    // 채널 ID로 노드 정보 찾기 위한 맵 생성
    let node_map: std::collections::HashMap<_, _> = nodes
        .iter()
        .map(|node| (node.channel_id.as_str(), node))
        .collect();

    println!("\n=== 채널별 가장 가까운 채널 (상위 5개) ===");
    println!();

    for node in nodes {
        println!(
            "📺 채널: {} (ID: {}, 고유 사용자 수: {})",
            node.name, node.channel_id, node.chat_count
        );

        // 이 채널과 연결된 링크 필터링 및 정렬 (distance가 클수록 가까움)
        let mut channel_links: Vec<_> = links
            .iter()
            .filter(|link| link.source == node.channel_id || link.target == node.channel_id)
            .map(|link| {
                // 상대방 채널 ID와 정보 찾기
                let other_id = if link.source == node.channel_id {
                    &link.target
                } else {
                    &link.source
                };
                let other_node = node_map.get(other_id.as_str());
                (link, other_id.clone(), other_node)
            })
            .collect();

        // distance가 클수록 가까우므로 내림차순 정렬
        channel_links.sort_by(|a, b| {
            b.0.distance
                .partial_cmp(&a.0.distance)
                .unwrap_or(std::cmp::Ordering::Equal)
        });

        // 상위 5개 출력
        let top_count = channel_links.len().min(10);
        if top_count > 0 {
            for (i, (link, other_id, other_node)) in
                channel_links.iter().take(top_count).enumerate()
            {
                let other_name = other_node.map(|n| n.name.as_str()).unwrap_or("알 수 없음");
                println!(
                    "  {}. {} (ID: {}) - distance: {:.4}, inter: {}",
                    i + 1,
                    other_name,
                    other_id,
                    link.distance,
                    link.inter
                );
            }
        } else {
            println!("  연결된 채널이 없습니다.");
        }
        println!();
    }
}

/// 다시보기와 채널 정보를 함께 저장하는 구조체
#[derive(Debug, Clone)]
pub struct ReplayWithChannel {
    pub replay: Replay,
    pub channel_id: String,
    pub channel_name: String,
}

/// 두 다시보기 간 유사도를 계산합니다 (기존 방식: 제목, 카테고리, 태그 기반).
/// 반환값: 0.0 ~ 1.0 (1.0이 가장 유사)
#[allow(dead_code)]
fn calculate_replay_similarity_old(a: &ReplayWithChannel, b: &ReplayWithChannel) -> f64 {
    let mut similarity = 0.0;
    let mut weight_sum = 0.0;

    // 1. 같은 채널인지 확인 (가중치: 0.3)
    if a.channel_id == b.channel_id {
        similarity += 1.0 * 0.3;
    }
    weight_sum += 0.3;

    // 2. 카테고리 유사도 (가중치: 0.2)
    match (&a.replay.category_ko, &b.replay.category_ko) {
        (Some(cat_a), Some(cat_b)) if cat_a == cat_b => {
            similarity += 1.0 * 0.2;
        }
        (Some(_), Some(_)) => {
            // 다른 카테고리
        }
        _ => {
            // 둘 중 하나라도 카테고리가 없으면 0.5점
            similarity += 0.5 * 0.2;
        }
    }
    weight_sum += 0.2;

    // 3. 태그 유사도 (Jaccard 유사도, 가중치: 0.3)
    let tags_a: HashSet<String> = a.replay.tags.iter().cloned().collect();
    let tags_b: HashSet<String> = b.replay.tags.iter().cloned().collect();
    if !tags_a.is_empty() || !tags_b.is_empty() {
        let intersection = tags_a.intersection(&tags_b).count();
        let union = tags_a.union(&tags_b).count();
        let tag_similarity = if union > 0 {
            intersection as f64 / union as f64
        } else {
            0.0
        };
        similarity += tag_similarity * 0.3;
    }
    weight_sum += 0.3;

    // 4. 제목 키워드 유사도 (가중치: 0.2)
    // 간단한 키워드 매칭 (공통 단어 비율)
    let title_a_words: HashSet<&str> = a
        .replay
        .title
        .split_whitespace()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .collect();
    let title_b_words: HashSet<&str> = b
        .replay
        .title
        .split_whitespace()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .collect();

    if !title_a_words.is_empty() || !title_b_words.is_empty() {
        let intersection = title_a_words.intersection(&title_b_words).count();
        let union = title_a_words.union(&title_b_words).count();
        let title_similarity = if union > 0 {
            intersection as f64 / union as f64
        } else {
            0.0
        };
        similarity += title_similarity * 0.2;
    }
    weight_sum += 0.2;

    // 가중치 합으로 나누어 정규화
    if weight_sum > 0.0 {
        similarity / weight_sum
    } else {
        0.0
    }
}

/// 다시보기 클러스터
#[derive(Debug, Clone)]
pub struct ReplayCluster {
    pub replays: Vec<ReplayWithChannel>,
    pub average_similarity: f64,
}

/// 두 다시보기 간 유사도를 계산합니다 (시청자 수 기반).
/// 반환값: 0.0 ~ 1.0 (1.0이 가장 유사, Jaccard 유사도)

fn calculate_replay_similarity(
    a: &ReplayWithChannel,
    b: &ReplayWithChannel,
    video_viewers: &HashMap<u64, HashSet<String>>,
) -> f64 {
    let viewers_a = match video_viewers.get(&a.replay.video_no) {
        Some(v) => v,
        None => return 0.0,
    };
    let viewers_b = match video_viewers.get(&b.replay.video_no) {
        Some(v) => v,
        None => return 0.0,
    };

    if viewers_a.is_empty() || viewers_b.is_empty() {
        return 0.0;
    }

    // 항상 작은 쪽을 돌면서 큰 쪽에 contains() → 캐시/성능 ↑
    let (small, large) = if viewers_a.len() <= viewers_b.len() {
        (viewers_a, viewers_b)
    } else {
        (viewers_b, viewers_a)
    };

    let intersection = small.iter().filter(|v| large.contains(*v)).count();
    if intersection == 0 {
        return 0.0;
    }

    // |A ∪ B| = |A| + |B| - |A ∩ B|
    let union = viewers_a.len() + viewers_b.len() - intersection;

    intersection as f64 / union as f64
}

/// 다시보기들을 유사도 기반으로 클러스터링합니다 (시청자 수 기준).
pub fn cluster_similar_replays(
    channels: &[ChannelWithReplays],
    chat_logs: &[ChatLog],
    similarity_threshold: f64,
) -> Vec<ReplayCluster> {
    // video_id별 시청자 집합 구하기 (먼저 ChatLog가 있는 video_id 집합 생성)
    let mut video_viewers: HashMap<u64, HashSet<String>> = HashMap::new();
    let mut video_ids_with_chat_log: HashSet<u64> = HashSet::new();
    for chat_log in chat_logs {
        video_ids_with_chat_log.insert(chat_log.video_id);
        let viewers = video_viewers
            .entry(chat_log.video_id)
            .or_insert_with(HashSet::new);
        for message in &chat_log.messages {
            viewers.insert(message.user_id.clone());
        }
    }

    // ChatLog가 있는 다시보기만 채널 정보와 함께 수집
    let mut replays_with_channel: Vec<ReplayWithChannel> = Vec::new();
    for channel in channels {
        for replay in &channel.replays {
            // ChatLog가 있는 video_no만 포함
            if video_ids_with_chat_log.contains(&replay.video_no) {
                replays_with_channel.push(ReplayWithChannel {
                    replay: replay.clone(),
                    channel_id: channel.channel_id.clone(),
                    channel_name: channel.name.clone(),
                });
            }
        }
    }

    if replays_with_channel.is_empty() {
        return Vec::new();
    }

    // Union-Find를 사용한 간단한 클러스터링
    let n = replays_with_channel.len();
    let mut parent: Vec<usize> = (0..n).collect();

    fn find(parent: &mut [usize], x: usize) -> usize {
        if parent[x] != x {
            parent[x] = find(parent, parent[x]);
        }
        parent[x]
    }

    fn union(parent: &mut [usize], x: usize, y: usize) {
        let px = find(parent, x);
        let py = find(parent, y);
        if px != py {
            parent[px] = py;
        }
    }

    // 유사도 계산을 병렬로 수행 (Arc로 공유)
    let replays_arc = Arc::new(replays_with_channel);
    let video_viewers_arc = Arc::new(video_viewers);

    // Progress bar 생성
    // 총 쌍 수: n * (n-1) / 2
    let total_pairs = n * (n - 1) / 2;
    let pb = utils::create_progress_bar(total_pairs as u64, "Calculating replay similarities...");

    let pb = Arc::new(pb);

    // 모든 (i, j) 쌍에 대해 유사도를 병렬로 계산하고, threshold를 넘는 쌍 수집
    let pairs_to_union: Vec<(usize, usize)> = (0..n)
        .into_par_iter()
        .flat_map(|i| {
            let replays_ref = Arc::clone(&replays_arc);
            let video_viewers_ref = Arc::clone(&video_viewers_arc);
            let pb = Arc::clone(&pb);

            ((i + 1)..n)
                .filter_map(move |j| {
                    let similarity = calculate_replay_similarity(
                        &replays_ref[i],
                        &replays_ref[j],
                        &video_viewers_ref,
                    );

                    pb.inc(1);

                    if similarity >= similarity_threshold {
                        Some((i, j))
                    } else {
                        None
                    }
                })
                .collect::<Vec<_>>()
        })
        .collect();

    // Progress bar 완료
    pb.finish_with_message("Replay similarities calculated!");

    // 수집된 쌍들을 순차적으로 union 수행 (Union-Find는 순차적으로 실행되어야 함)
    for (i, j) in pairs_to_union {
        union(&mut parent, i, j);
    }

    // 클러스터별로 그룹화
    let mut cluster_map: HashMap<usize, Vec<usize>> = HashMap::new();
    for i in 0..n {
        let root = find(&mut parent, i);
        cluster_map.entry(root).or_insert_with(Vec::new).push(i);
    }

    // replays_with_channel과 video_viewers를 Arc에서 다시 가져오기
    let replays_with_channel = Arc::try_unwrap(replays_arc).unwrap_or_else(|arc| (*arc).clone());
    let video_viewers = Arc::try_unwrap(video_viewers_arc).unwrap_or_else(|arc| (*arc).clone());

    // 클러스터 내 유사도 계산 및 정렬
    let mut clusters: Vec<ReplayCluster> = cluster_map
        .into_iter()
        .filter(|(_, indices)| indices.len() > 1) // 2개 이상인 클러스터만
        .map(|(_, indices)| {
            let cluster_replays: Vec<_> = indices
                .iter()
                .map(|&idx| replays_with_channel[idx].clone())
                .collect();

            // 클러스터 내 평균 유사도 계산
            let mut total_similarity = 0.0;
            let mut pair_count = 0;
            for i in 0..cluster_replays.len() {
                for j in (i + 1)..cluster_replays.len() {
                    let sim = calculate_replay_similarity(
                        &cluster_replays[i],
                        &cluster_replays[j],
                        &video_viewers,
                    );
                    total_similarity += sim;
                    pair_count += 1;
                }
            }
            let avg_similarity = if pair_count > 0 {
                total_similarity / pair_count as f64
            } else {
                0.0
            };

            ReplayCluster {
                replays: cluster_replays,
                average_similarity: avg_similarity,
            }
        })
        .collect();

    // 평균 유사도 기준으로 정렬 (내림차순)
    clusters.sort_by(|a, b| {
        b.average_similarity
            .partial_cmp(&a.average_similarity)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    clusters
}

/// 클러스터링 결과를 출력합니다.
pub fn print_replay_clusters(clusters: &[ReplayCluster], max_clusters: Option<usize>) {
    let display_count = max_clusters.unwrap_or(clusters.len()).min(clusters.len());

    println!("\n=== 유사한 다시보기 클러스터 ({}개) ===", clusters.len());
    println!();

    for (cluster_idx, cluster) in clusters.iter().take(display_count).enumerate() {
        println!(
            "📦 클러스터 {} (평균 유사도: {:.4}, 다시보기 수: {})",
            cluster_idx + 1,
            cluster.average_similarity,
            cluster.replays.len()
        );

        // 클러스터 내 다시보기들을 출력
        for (i, replay_with_channel) in cluster.replays.iter().enumerate() {
            println!(
                "  {}. [{}] {} (Video ID: {})",
                i + 1,
                replay_with_channel.channel_name,
                replay_with_channel.replay.title,
                replay_with_channel.replay.video_no
            );
            if let Some(category) = &replay_with_channel.replay.category_ko {
                println!("     카테고리: {}", category);
            }
            if !replay_with_channel.replay.tags.is_empty() {
                println!("     태그: {}", replay_with_channel.replay.tags.join(", "));
            }
        }
        println!();
    }
}
