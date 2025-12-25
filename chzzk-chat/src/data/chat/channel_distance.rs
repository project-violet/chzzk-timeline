use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::Path;
use std::sync::Arc;

use chrono::{Duration as ChronoDuration, Utc};
use color_eyre::eyre::{Context, Result};
use serde::Serialize;

use crate::data::models::{ChannelWithReplays, ChatLog};
use crate::utils;
use rayon::prelude::*;

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
    let json_string = serde_json::to_string(&json_data)
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

    let json_string = serde_json::to_string(&json_map)
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

