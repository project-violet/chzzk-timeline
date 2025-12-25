use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use crate::data::models::{ChannelWithReplays, ChatLog, Replay};
use crate::utils;
use rayon::prelude::*;

/// 다시보기와 채널 정보를 함께 저장하는 구조체
#[derive(Debug, Clone)]
pub struct ReplayWithChannel {
    pub replay: Replay,
    pub channel_id: String,
    pub channel_name: String,
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

