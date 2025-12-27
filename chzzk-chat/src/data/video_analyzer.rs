use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::Path;
use std::sync::Arc;

use chrono::{DateTime, Duration, FixedOffset};
use color_eyre::eyre::{Context, Result};
use rayon::prelude::*;
use serde::Serialize;

use crate::data::models::{ChannelWithReplays, ChatLog, Replay};
use crate::data::utils::parse_replay_time;

/// 비디오 연관도 정보
#[derive(Debug, Clone, Serialize)]
pub struct VideoRelation {
    /// 연관된 비디오 번호
    pub video_no: u64,
    /// 연관도 점수 (0.0 ~ 1.0, Jaccard 유사도)
    pub similarity: f64,
    /// 겹치는 유저 수
    pub shared_users: usize,
    /// 비디오 제목
    pub title: String,
    /// 채널 이름
    pub channel_name: String,
}

/// Replay의 start/end 문자열을 DateTime으로 파싱합니다.

/// 두 시간 범위가 겹치는지 확인합니다.
///
/// 예시:
/// - target: 10:00 ~ 17:00
/// - candidate: 05:00 ~ 15:00 → 겹침 (10:00 ~ 15:00)
/// - candidate: 15:00 ~ 19:00 → 겹침 (15:00 ~ 17:00)
/// - candidate: 18:00 ~ 21:00 → 겹치지 않음
fn is_time_range_overlapping(
    target_start: DateTime<FixedOffset>,
    target_end: DateTime<FixedOffset>,
    candidate_start: DateTime<FixedOffset>,
    candidate_end: DateTime<FixedOffset>,
) -> bool {
    let buffer = Duration::minutes(10);

    let target_start_buffered = target_start - buffer;
    let target_end_buffered = target_end + buffer;

    // 두 범위가 겹치려면:
    // target_start < candidate_end && candidate_start < target_end
    target_start_buffered < candidate_end && candidate_start < target_end_buffered
}

/// 비디오별 채팅 유저 집합을 구합니다.
fn build_video_user_map(chat_logs: &[ChatLog]) -> HashMap<u64, HashSet<String>> {
    let mut video_users: HashMap<u64, HashSet<String>> = HashMap::new();

    for chat_log in chat_logs {
        let users = video_users
            .entry(chat_log.video_id)
            .or_insert_with(HashSet::new);

        for message in &chat_log.messages {
            users.insert(message.user_id.clone());
        }
    }

    video_users
}

/// 두 비디오 간 유저 겹침 유사도를 계산합니다 (Jaccard 유사도).
fn calculate_user_overlap_similarity(
    users_a: &HashSet<String>,
    users_b: &HashSet<String>,
) -> (f64, usize) {
    if users_a.is_empty() || users_b.is_empty() {
        return (0.0, 0);
    }

    // 교집합 계산
    let intersection = users_a.intersection(users_b).count();

    // 합집합 계산
    let union = users_a.union(users_b).count();

    // Jaccard 유사도: intersection / union
    let similarity = if union > 0 {
        intersection as f64 / union as f64
    } else {
        0.0
    };

    (similarity, intersection)
}

/// 특정 비디오의 uptime 동안 연관된 다른 리플레이를 찾습니다.
///
/// # Arguments
/// * `target_video_no` - 대상 비디오 번호
/// * `channels` - 모든 채널 및 리플레이 데이터
/// * `chat_logs` - 모든 채팅 로그
///
/// # Returns
/// 시간 범위가 겹치고 채팅 유저가 겹치는 리플레이들의 연관도 정보
pub fn find_related_replays(
    target_video_no: u64,
    channels: &[ChannelWithReplays],
    chat_logs: &[ChatLog],
) -> Result<Vec<VideoRelation>> {
    // 1. 대상 비디오의 Replay 찾기
    let target_replay = channels
        .iter()
        .flat_map(|channel| &channel.replays)
        .find(|replay| replay.video_no == target_video_no)
        .ok_or_else(|| color_eyre::eyre::eyre!("Target video not found: {}", target_video_no))?;

    // 2. 대상 비디오의 시간 범위 파싱
    let target_start = parse_replay_time(&target_replay.start).with_context(|| {
        format!(
            "Failed to parse target replay start time: {}",
            target_replay.start
        )
    })?;
    let target_end = parse_replay_time(&target_replay.end).with_context(|| {
        format!(
            "Failed to parse target replay end time: {}",
            target_replay.end
        )
    })?;

    // 3. 비디오별 채팅 유저 집합 구하기
    let video_users = build_video_user_map(chat_logs);

    // 4. 대상 비디오의 유저 집합
    let target_users = video_users
        .get(&target_video_no)
        .cloned()
        .unwrap_or_default();

    // 5. 모든 리플레이를 순회하며 시간 범위가 겹치는 것 찾기
    let mut related_replays: Vec<VideoRelation> = Vec::new();

    for channel in channels {
        for replay in &channel.replays {
            // 자기 자신은 제외
            if replay.video_no == target_video_no {
                continue;
            }

            // 시간 범위 파싱
            let candidate_start = match parse_replay_time(&replay.start) {
                Ok(dt) => dt,
                Err(e) => {
                    eprintln!(
                        "Warning: Failed to parse replay start time for video {}: {}",
                        replay.video_no, e
                    );
                    continue;
                }
            };

            let candidate_end = match parse_replay_time(&replay.end) {
                Ok(dt) => dt,
                Err(e) => {
                    eprintln!(
                        "Warning: Failed to parse replay end time for video {}: {}",
                        replay.video_no, e
                    );
                    continue;
                }
            };

            // 시간 범위가 겹치는지 확인
            if !is_time_range_overlapping(target_start, target_end, candidate_start, candidate_end)
            {
                continue;
            }

            // 채팅 유저 집합 가져오기
            let candidate_users = video_users
                .get(&replay.video_no)
                .cloned()
                .unwrap_or_default();

            // 유저 겹침 유사도 계산
            let (similarity, shared_users) =
                calculate_user_overlap_similarity(&target_users, &candidate_users);

            // 유사도가 0.05 이상인 경우만 추가
            if similarity >= 0.05 {
                related_replays.push(VideoRelation {
                    video_no: replay.video_no,
                    similarity,
                    shared_users,
                    title: replay.title.clone(),
                    channel_name: channel.name.clone(),
                });
            }
        }
    }

    // 유사도 기준으로 정렬 (내림차순)
    related_replays.sort_by(|a, b| {
        b.similarity
            .partial_cmp(&a.similarity)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    Ok(related_replays)
}

/// 연관된 리플레이 정보를 출력합니다.
pub fn print_related_replays(relations: &[VideoRelation], max_count: Option<usize>) {
    let display_count = max_count.unwrap_or(relations.len()).min(relations.len());

    println!("\n=== 연관된 리플레이 ({}개) ===", relations.len());
    println!();

    for (i, relation) in relations.iter().take(display_count).enumerate() {
        println!(
            "{}. [{}] {} (Video ID: {})",
            i + 1,
            relation.channel_name,
            relation.title,
            relation.video_no
        );
        println!(
            "   유사도: {:.4}, 겹치는 유저 수: {}",
            relation.similarity, relation.shared_users
        );
    }

    if relations.len() > display_count {
        println!(
            "\n... (총 {}개 중 {}개만 표시)",
            relations.len(),
            display_count
        );
    }

    println!();
}

/// 모든 비디오 쌍에 대한 연관도를 분석합니다.
///
/// # Arguments
/// * `channels` - 모든 채널 및 리플레이 데이터
/// * `chat_logs` - 모든 채팅 로그
///
/// # Returns
/// 각 비디오별로 연관된 다른 비디오들의 리스트
pub fn analyze_all_video_relations(
    channels: &[ChannelWithReplays],
    chat_logs: &[ChatLog],
) -> Result<HashMap<u64, Vec<VideoRelation>>> {
    use crate::utils;

    // 비디오별 채팅 유저 집합 구하기
    let video_users = build_video_user_map(chat_logs);

    // 모든 비디오 번호 수집
    let all_video_nos: Vec<u64> = channels
        .iter()
        .flat_map(|channel| channel.replays.iter().map(|r| r.video_no))
        .collect();

    let total_videos = all_video_nos.len();
    utils::log(format!(
        "전체 {}개 비디오 간 연관도 분석 시작...",
        total_videos
    ));

    // Arc로 감싸서 여러 스레드에서 공유 가능하게 만들기
    let channels_arc = Arc::new(channels);
    let video_users_arc = Arc::new(video_users);

    let mut replay_by_video_no: HashMap<u64, &Replay> = HashMap::new();
    for channel in channels {
        for replay in &channel.replays {
            replay_by_video_no.insert(replay.video_no, replay);
        }
    }

    // 모든 리플레이의 시간 문자열을 사전에 파싱하여 캐싱
    // 불변 HashMap으로 만들어 Arc로 공유하므로 병렬 구간에서 락 없이 조회 가능
    let mut time_cache: HashMap<String, DateTime<FixedOffset>> = HashMap::new();
    for channel in channels {
        for replay in &channel.replays {
            if !time_cache.contains_key(&replay.start) {
                if let Ok(dt) = parse_replay_time(&replay.start) {
                    time_cache.insert(replay.start.clone(), dt);
                }
            }
            if !time_cache.contains_key(&replay.end) {
                if let Ok(dt) = parse_replay_time(&replay.end) {
                    time_cache.insert(replay.end.clone(), dt);
                }
            }
        }
    }
    let time_cache_arc = Arc::new(time_cache);

    let empty_set = HashSet::new();

    // Progress bar 생성
    let pb = utils::create_progress_bar(total_videos as u64, "Analyzing video relations...");
    let pb_arc = Arc::new(pb);

    // 병렬로 각 비디오에 대해 연관도 계산
    let relations_vec: Vec<(u64, Vec<VideoRelation>)> = all_video_nos
        .par_iter()
        .filter_map(|target_video_no| {
            let channels_ref = Arc::clone(&channels_arc);
            let video_users_ref = Arc::clone(&video_users_arc);
            let time_cache_ref = Arc::clone(&time_cache_arc);
            let pb_ref = Arc::clone(&pb_arc);

            // Progress bar 업데이트
            pb_ref.inc(1);

            // 대상 비디오의 Replay 찾기
            let target_replay = match replay_by_video_no.get(target_video_no) {
                Some(r) => *r,
                None => return None,
            };

            // 대상 비디오의 시간 범위 파싱
            let target_start = match time_cache_ref.get(target_replay.start.as_str()) {
                Some(dt) => dt.clone(),
                None => return None,
            };

            let target_end = match time_cache_ref.get(target_replay.end.as_str()) {
                Some(dt) => dt.clone(),
                None => return None,
            };

            // 대상 비디오의 유저 집합
            let target_users = video_users_ref.get(target_video_no).unwrap_or(&empty_set);

            if target_users.is_empty() {
                return None;
            }

            // 다른 모든 비디오와 비교
            let mut relations: Vec<VideoRelation> = Vec::new();

            for channel in channels_ref.iter() {
                for replay in &channel.replays {
                    // 자기 자신은 제외
                    if replay.video_no == *target_video_no {
                        continue;
                    }

                    // 시간 범위 파싱
                    let candidate_start = match time_cache_ref.get(replay.start.as_str()) {
                        Some(dt) => dt.clone(),
                        None => continue,
                    };

                    let candidate_end = match time_cache_ref.get(replay.end.as_str()) {
                        Some(dt) => dt.clone(),
                        None => continue,
                    };

                    // 시간 범위가 겹치는지 확인
                    if !is_time_range_overlapping(
                        target_start,
                        target_end,
                        candidate_start,
                        candidate_end,
                    ) {
                        continue;
                    }

                    // 채팅 유저 집합 가져오기
                    let candidate_users =
                        video_users_ref.get(&replay.video_no).unwrap_or(&empty_set);

                    // 유저 겹침 유사도 계산
                    let (similarity, shared_users) =
                        calculate_user_overlap_similarity(target_users, candidate_users);

                    // 유사도가 0.01 이상인 경우만 추가
                    if similarity >= 0.02 {
                        relations.push(VideoRelation {
                            video_no: replay.video_no,
                            similarity,
                            shared_users,
                            title: replay.title.clone(),
                            channel_name: channel.name.clone(),
                        });
                    }
                }
            }

            // 유사도 기준으로 정렬 (내림차순)
            relations.sort_by(|a, b| {
                b.similarity
                    .partial_cmp(&a.similarity)
                    .unwrap_or(std::cmp::Ordering::Equal)
            });

            Some((*target_video_no, relations))
        })
        .collect();

    // Progress bar 완료
    pb_arc.finish_with_message("Video relations analyzed!");

    // HashMap으로 변환
    let all_relations: HashMap<u64, Vec<VideoRelation>> = relations_vec.into_iter().collect();

    utils::log("전체 비디오 간 연관도 분석 완료!");

    Ok(all_relations)
}

/// 모든 비디오 연관도 분석 결과를 출력합니다.
pub fn print_all_video_relations(
    all_relations: &HashMap<u64, Vec<VideoRelation>>,
    max_per_video: Option<usize>,
) {
    let max_count = max_per_video.unwrap_or(10);

    println!("\n=== 전체 비디오 연관도 분석 결과 ===");
    println!("총 {}개 비디오 분석됨\n", all_relations.len());

    // 연관 비디오가 많은 순으로 정렬
    let mut sorted_videos: Vec<_> = all_relations.iter().collect();
    sorted_videos.sort_by(|a, b| b.1.len().cmp(&a.1.len()));

    for (video_no, relations) in sorted_videos.iter().take(20) {
        if relations.is_empty() {
            continue;
        }

        println!("📺 비디오 {} (연관 비디오 {}개)", video_no, relations.len());

        for (i, relation) in relations.iter().take(max_count).enumerate() {
            println!(
                "  {}. [{}] {} (Video ID: {}) - 유사도: {:.4}, 겹치는 유저: {}",
                i + 1,
                relation.channel_name,
                relation.title,
                relation.video_no,
                relation.similarity,
                relation.shared_users
            );
        }

        if relations.len() > max_count {
            println!("  ... (총 {}개 중 {}개만 표시)", relations.len(), max_count);
        }

        println!();
    }

    if sorted_videos.len() > 20 {
        println!(
            "... (총 {}개 비디오 중 상위 20개만 표시)",
            sorted_videos.len()
        );
    }
}

/// 비디오 연관도 분석 결과를 JSON 파일로 내보냅니다.
pub fn export_video_relations_json<P: AsRef<Path>>(
    all_relations: &HashMap<u64, Vec<VideoRelation>>,
    output_path: P,
) -> Result<()> {
    use crate::utils;

    utils::log(format!(
        "비디오 연관도 JSON 파일 저장 중: {:?}",
        output_path.as_ref()
    ));

    // JSON 구조체 생성
    // 각 비디오별로 연관 비디오 리스트를 포함하는 구조
    let json_data: HashMap<String, Vec<VideoRelation>> = all_relations
        .iter()
        .map(|(video_no, relations)| (video_no.to_string(), relations.clone()))
        .collect();

    // JSON 파일로 저장
    let json_string =
        serde_json::to_string(&json_data).context("Failed to serialize video relations to JSON")?;
    fs::write(&output_path, json_string)
        .with_context(|| format!("Failed to write JSON file: {:?}", output_path.as_ref()))?;

    utils::log(format!(
        "비디오 연관도 JSON 파일 저장 완료: {}개 비디오",
        all_relations.len()
    ));

    Ok(())
}
