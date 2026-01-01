use std::collections::HashMap;

use crate::data::models::ChatLog;

/// 이벤트 구간 (peak/폭발 구간)
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct EventInterval {
    /// 구간 시작 시간 (초, 첫 메시지 기준 0초)
    pub start_sec: i64,
    /// 구간 종료 시간 (초, 첫 메시지 기준 0초)
    pub end_sec: i64,
    /// 피크 시간 (초, 첫 메시지 기준 0초)
    pub peak_sec: i64,
    /// 피크 시 z-score
    pub peak_z_score: f64,
    /// 피크 시 메시지 수
    pub peak_count: usize,
}

/// 이벤트 탐지 결과
#[derive(Debug, Clone)]
pub struct EventDetectionResult {
    /// 첫 메시지 시간
    pub first_message_time: chrono::DateTime<chrono::FixedOffset>,
    /// 이벤트 구간들
    pub events: Vec<EventInterval>,
    /// 전체 타임라인 데이터 (디버깅용)
    #[allow(dead_code)]
    pub timeline: Vec<(i64, usize, f64)>, // (time_sec, count, z_score)
}

/// 초 단위로 메시지를 resample합니다.
fn resample_to_seconds(
    messages: &[&crate::data::models::ChatMessage],
    first_time: chrono::DateTime<chrono::FixedOffset>,
) -> HashMap<i64, usize> {
    let mut count_map: HashMap<i64, usize> = HashMap::new();

    for message in messages {
        let elapsed_seconds = (message.timestamp - first_time).num_seconds();
        *count_map.entry(elapsed_seconds).or_insert(0) += 1;
    }

    count_map
}

/// EWMA (Exponentially Weighted Moving Average) 계산
fn ewma(values: &[f64], alpha: f64) -> Vec<f64> {
    if values.is_empty() {
        return Vec::new();
    }

    let mut smoothed = Vec::with_capacity(values.len());
    let mut prev = values[0];

    for &value in values {
        prev = alpha * value + (1.0 - alpha) * prev;
        smoothed.push(prev);
    }

    smoothed
}

/// Moving Average 계산
#[allow(dead_code)]
fn moving_average(values: &[f64], window: usize) -> Vec<f64> {
    if values.is_empty() {
        return Vec::new();
    }

    let mut smoothed = Vec::with_capacity(values.len());

    for i in 0..values.len() {
        let start = i.saturating_sub(window / 2);
        let end = (i + window / 2 + 1).min(values.len());
        let sum: f64 = values[start..end].iter().sum();
        let count = (end - start) as f64;
        smoothed.push(sum / count);
    }

    smoothed
}

/// Median 계산
fn median(values: &[f64]) -> f64 {
    if values.is_empty() {
        return 0.0;
    }

    let mut sorted = values.to_vec();
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));

    let mid = sorted.len() / 2;
    if sorted.len().is_multiple_of(2) {
        (sorted[mid - 1] + sorted[mid]) / 2.0
    } else {
        sorted[mid]
    }
}

/// MAD (Median Absolute Deviation) 계산
fn mad(values: &[f64]) -> f64 {
    if values.is_empty() {
        return 1.0; // 기본값
    }

    let med = median(values);
    let deviations: Vec<f64> = values.iter().map(|&v| (v - med).abs()).collect();
    let mad_value = median(&deviations);

    // MAD가 0이면 기본값 반환
    if mad_value < 1e-10 {
        1.0
    } else {
        mad_value
    }
}

/// Local maximum 찾기
#[allow(dead_code)]
fn find_local_maxima(z_scores: &[f64], threshold: f64) -> Vec<usize> {
    let mut maxima = Vec::new();

    for i in 1..z_scores.len().saturating_sub(1) {
        if z_scores[i] > threshold && z_scores[i] > z_scores[i - 1] && z_scores[i] > z_scores[i + 1]
        {
            maxima.push(i);
        }
    }

    maxima
}

fn pick_peaks_from_runs(z: &[f64], rate: &[f64], z_th: f64) -> Vec<usize> {
    let mut peaks = Vec::new();
    let mut i = 0;

    while i < z.len() {
        if z[i] <= z_th {
            i += 1;
            continue;
        }

        // [start, end] : z > z_th 인 연속 구간
        let mut best = i;
        let start = i;
        while i < z.len() && z[i] > z_th {
            if z[i] > z[best] || (z[i] == z[best] && rate[i] > rate[best]) {
                best = i;
            }
            i += 1;
        }
        let _end = i - 1;

        peaks.push(best);

        // (옵션) 너무 가까운 run이면 여기서도 스킵/병합 가능
        let _ = start;
    }

    peaks
}

/// 가까운 피크들을 병합합니다.
fn merge_nearby_peaks(
    peaks: Vec<(usize, i64, f64, usize)>,
    gap_threshold_sec: i64,
) -> Vec<(i64, i64, i64, f64, usize)> {
    // (start_sec, end_sec, peak_sec, peak_z_score, peak_count)
    if peaks.is_empty() {
        return Vec::new();
    }

    let mut merged: Vec<(i64, i64, i64, f64, usize)> = Vec::new();

    for (_idx, peak_sec, peak_z, peak_count) in peaks {
        if merged.is_empty() {
            // 첫 피크는 그대로 추가
            merged.push((peak_sec, peak_sec, peak_sec, peak_z, peak_count));
        } else {
            let last = merged.last_mut().unwrap();
            let gap = peak_sec - last.1; // end_sec와의 gap

            if gap <= gap_threshold_sec {
                // 병합: end_sec 확장, 더 큰 z-score를 가진 피크로 업데이트
                last.1 = peak_sec;
                if peak_z > last.3 {
                    last.2 = peak_sec;
                    last.3 = peak_z;
                    last.4 = peak_count;
                }
            } else {
                // 새 구간 추가
                merged.push((peak_sec, peak_sec, peak_sec, peak_z, peak_count));
            }
        }
    }

    merged
}

/// z-score 기반으로 구간을 확장합니다.
fn expand_intervals(
    merged_peaks: Vec<(i64, i64, i64, f64, usize)>,
    z_scores: &[(i64, f64)],
    z_end: f64,
) -> Vec<EventInterval> {
    let mut events = Vec::new();

    for (start_sec, end_sec, peak_sec, peak_z, peak_count) in merged_peaks {
        // start_sec를 왼쪽으로 확장
        let mut expanded_start = start_sec;
        // peak_sec 주변에서 왼쪽으로 탐색
        for &(time_sec, z) in z_scores.iter().rev() {
            if time_sec > start_sec {
                continue;
            }
            if time_sec < start_sec && z > z_end {
                expanded_start = time_sec;
            } else if z <= z_end {
                // z_end 이하로 떨어지면 더 이상 확장하지 않음
                break;
            }
        }

        // end_sec를 오른쪽으로 확장
        let mut expanded_end = end_sec;
        // peak_sec 주변에서 오른쪽으로 탐색
        for &(time_sec, z) in z_scores.iter() {
            if time_sec < end_sec {
                continue;
            }
            if time_sec > end_sec && z > z_end {
                expanded_end = time_sec;
            } else if z <= z_end {
                // z_end 이하로 떨어지면 더 이상 확장하지 않음
                break;
            }
        }

        events.push(EventInterval {
            start_sec: expanded_start,
            end_sec: expanded_end,
            peak_sec,
            peak_z_score: peak_z,
            peak_count,
        });
    }

    events
}

/// ChatLog에서 이벤트 후보 구간을 탐지합니다.
pub fn detect_event_intervals(chat_log: &ChatLog) -> Option<EventDetectionResult> {
    if chat_log.messages.is_empty() {
        return None;
    }

    // 상수 설정
    const Z_TH: f64 = 8.0; // 피크 임계값
    const Z_END: f64 = 2.5; // 구간 확장 임계값
    const GAP_THRESHOLD_SEC: i64 = 12; // 병합 기준 (초)
    const BASELINE_WINDOW_SEC: i64 = 600; // 10분
    const BASELINE_LAG_SEC: i64 = 60; // 최근 60초 제외
    const SMOOTH_ALPHA: f64 = 0.2; // EWMA alpha
    const EPS: f64 = 1e-6; // MAD 분모 보정값

    // 메시지를 시간 순으로 정렬
    let mut sorted_messages: Vec<_> = chat_log.messages.iter().collect();
    sorted_messages.sort_by_key(|msg| msg.timestamp);

    let first_time = sorted_messages[0].timestamp;

    // 1. 초 단위로 resample
    let count_map = resample_to_seconds(&sorted_messages, first_time);

    // 시간 범위 찾기
    let min_sec = *count_map.keys().min().unwrap_or(&0);
    let max_sec = *count_map.keys().max().unwrap_or(&0);

    // 2. rate[t] = count[t] (1초 bin) - 이미 초 단위로 되어 있음
    let mut rate = Vec::new();
    let mut time_points = Vec::new();
    for sec in min_sec..=max_sec {
        let count = count_map.get(&sec).copied().unwrap_or(0);
        rate.push(count as f64);
        time_points.push(sec);
    }

    if rate.is_empty() {
        return None;
    }

    // 3. smooth[t] = EWMA(rate, alpha=0.2)
    let smooth = ewma(&rate, SMOOTH_ALPHA);

    // 4. base[t]와 mad[t] 계산 (10분 윈도우)
    let mut base = Vec::new();
    let mut mad_values = Vec::new();
    let mut z_scores = Vec::new();

    for i in 0..smooth.len() {
        let current_time = time_points[i];
        let window_start = (current_time - BASELINE_WINDOW_SEC).max(min_sec);
        let window_end = (current_time - BASELINE_LAG_SEC).max(min_sec);

        // 윈도우 내의 smooth 값들 수집
        let mut window_values = Vec::new();
        for j in 0..=i {
            if time_points[j] >= window_start && time_points[j] <= window_end {
                window_values.push(smooth[j]);
            }
        }

        // base[t] = median(smooth[t-10min..t])
        let base_value = if window_values.is_empty() {
            smooth[i]
        } else {
            median(&window_values)
        };
        base.push(base_value);

        // mad[t] = MAD(smooth[t-10min..t])
        let mad_value = if window_values.is_empty() {
            1.0
        } else {
            mad(&window_values)
        };
        mad_values.push(mad_value);

        // z[t] = (smooth[t] - base[t]) / (mad[t] + eps)
        let z = (smooth[i] - base_value) / (mad_value + EPS);
        z_scores.push(z);
    }

    // 5. z[t] > Z_TH 인 지점들을 이벤트 후보로 잡고 local maximum만 남기기
    // let peak_indices = find_local_maxima(&z_scores, Z_TH);
    let peak_indices = pick_peaks_from_runs(&z_scores, &rate, Z_TH);

    // 6. 피크 정보 수집
    let mut peaks: Vec<(usize, i64, f64, usize)> = Vec::new();
    for &idx in &peak_indices {
        let peak_sec = time_points[idx];
        let peak_z = z_scores[idx];
        let peak_count = rate[idx] as usize;
        peaks.push((idx, peak_sec, peak_z, peak_count));
    }

    // 7. 가까운 피크끼리 병합
    let merged_peaks = merge_nearby_peaks(peaks, GAP_THRESHOLD_SEC);

    // 8. 구간 확장 (z[t] > Z_END 인 구간으로)
    let z_scores_with_time: Vec<(i64, f64)> = time_points
        .iter()
        .zip(z_scores.iter())
        .map(|(&t, &z)| (t, z))
        .collect();

    let events = expand_intervals(merged_peaks, &z_scores_with_time, Z_END);

    // 타임라인 데이터 생성 (디버깅용)
    let timeline: Vec<(i64, usize, f64)> = time_points
        .iter()
        .zip(rate.iter())
        .zip(z_scores.iter())
        .map(|((&t, &c), &z)| (t, c as usize, z))
        .collect();

    Some(EventDetectionResult {
        first_message_time: first_time,
        events,
        timeline,
    })
}

/// 이벤트 탐지 결과를 출력합니다.
pub fn print_event_intervals(result: &EventDetectionResult) {
    println!("\n=== 이벤트 후보 구간 (Peak/폭발 구간) ===");
    println!(
        "첫 메시지 시간: {}",
        result.first_message_time.format("%Y-%m-%d %H:%M:%S %z")
    );
    println!("총 이벤트 수: {}\n", result.events.len());

    for (i, event) in result.events.iter().enumerate() {
        // 시작 시간 (상대 시간을 시간:분:초로 변환)
        let start_hour = event.start_sec / 3600;
        let start_min = (event.start_sec % 3600) / 60;
        let start_sec_remainder = event.start_sec % 60;

        // 종료 시간
        let end_hour = event.end_sec / 3600;
        let end_min = (event.end_sec % 3600) / 60;
        let end_sec_remainder = event.end_sec % 60;

        // 피크 시간 (절대 시간)
        let peak_time = result.first_message_time + chrono::Duration::seconds(event.peak_sec);
        let peak_hour: u32 = peak_time.format("%H").to_string().parse().unwrap_or(0);
        let peak_min: u32 = peak_time.format("%M").to_string().parse().unwrap_or(0);
        let peak_sec_remainder: u32 = peak_time.format("%S").to_string().parse().unwrap_or(0);

        let duration = event.end_sec - event.start_sec;

        println!("이벤트 #{}", i + 1);
        println!(
            "  구간: {:02}:{:02}:{:02} ~ {:02}:{:02}:{:02} (지속: {}초)",
            start_hour,
            start_min,
            start_sec_remainder,
            end_hour,
            end_min,
            end_sec_remainder,
            duration
        );
        println!(
            "  피크: {:02}:{:02}:{:02}",
            peak_hour, peak_min, peak_sec_remainder
        );
        println!("  피크 z-score: {:.2}", event.peak_z_score);
        println!("  피크 시 메시지 수: {}개/초", event.peak_count);
        println!();
    }
}

// ====== 두 VOD 이벤트 매칭 기능 ======

/// 매칭된 이벤트 쌍
#[derive(Debug, Clone)]
pub struct MatchedEvent {
    /// A VOD의 이벤트 인덱스
    pub a_idx: usize,
    /// B VOD의 이벤트 인덱스
    pub b_idx: usize,
    /// 매칭 점수
    pub score: f64,
    /// A의 피크 시간 (offset 적용 후, 절대시간)
    #[allow(dead_code)]
    pub abs_peak_a_aligned: i64,
    /// B의 피크 시간 (절대시간)
    #[allow(dead_code)]
    pub abs_peak_b: i64,
    /// 피크 시간 차이 (초)
    pub delta_peak_sec: i64,
}

/// 매칭 결과
#[derive(Debug, Clone)]
pub struct MatchResult {
    /// 추정된 offset (초, A에 더하면 B에 맞춰짐)
    pub offset_sec: f64,
    /// 매칭된 이벤트 쌍들
    pub matches: Vec<MatchedEvent>,
}

/// 상위 K개 이벤트를 선택합니다 (peak_z_score 기준).
fn select_top_events(events: &[EventInterval], k: usize) -> Vec<(usize, &EventInterval)> {
    let mut indexed: Vec<(usize, &EventInterval)> = events.iter().enumerate().collect();

    indexed.sort_by(|a, b| {
        b.1.peak_z_score
            .partial_cmp(&a.1.peak_z_score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    indexed.into_iter().take(k).collect()
}

/// Weighted histogram을 사용해 offset을 추정합니다.
fn estimate_offset(
    a_events: &[(usize, &EventInterval)],
    b_events: &[(usize, &EventInterval)],
    a_base_time: i64,
    b_base_time: i64,
    _bin_size_sec: i64,
) -> f64 {
    const BIN_SIZE: i64 = 10; // 10초 bin

    // 모든 쌍에 대해 delta 계산
    let mut deltas_with_weights: Vec<(i64, f64)> = Vec::new();

    for (_, a_ev) in a_events {
        let a_abs_peak = a_base_time + a_ev.peak_sec;

        for (_, b_ev) in b_events {
            let b_abs_peak = b_base_time + b_ev.peak_sec;
            let delta = b_abs_peak - a_abs_peak;

            // weight = min(za, zb) 또는 za * zb
            let weight = a_ev.peak_z_score.min(b_ev.peak_z_score);
            // let weight = a_ev.peak_z_score * b_ev.peak_z_score;

            deltas_with_weights.push((delta, weight));
        }
    }

    if deltas_with_weights.is_empty() {
        return 0.0;
    }

    // Binning
    let mut bin_map: std::collections::HashMap<i64, f64> = std::collections::HashMap::new();

    for (delta, weight) in &deltas_with_weights {
        let bin = (delta / BIN_SIZE) * BIN_SIZE;
        *bin_map.entry(bin).or_insert(0.0) += weight;
    }

    // 최빈 bin 찾기
    let best_bin = bin_map
        .iter()
        .max_by(|a, b| a.1.partial_cmp(b.1).unwrap_or(std::cmp::Ordering::Equal))
        .map(|(bin, _)| *bin)
        .unwrap_or(0);

    // best bin 주변(±bin)에서 weighted average로 refinement
    let mut weighted_sum = 0.0;
    let mut weight_sum = 0.0;

    for (delta, weight) in &deltas_with_weights {
        if (delta - best_bin).abs() <= BIN_SIZE {
            weighted_sum += *delta as f64 * weight;
            weight_sum += weight;
        }
    }

    if weight_sum > 0.0 {
        weighted_sum / weight_sum
    } else {
        best_bin as f64
    }
}

/// 두 VOD의 이벤트를 시간 정보만으로 매칭합니다.
pub fn match_events_time_only(a: &EventDetectionResult, b: &EventDetectionResult) -> MatchResult {
    // 상수 설정
    const TOP_K: usize = 40; // 상위 K개 이벤트만 사용
    const PEAK_WINDOW: i64 = 90; // 피크 근접 필터 (초)
    const MIN_OVERLAP: i64 = 15; // 최소 겹침 (초)
    const RATIO_TH: f64 = 0.35; // 최소 겹침 비율
    const Z_MIN: f64 = 3.0; // 최소 z-score
    const BIN_SIZE: i64 = 10; // offset 추정 bin 크기

    // 약한 이벤트 제외
    let a_events_filtered: Vec<(usize, &EventInterval)> = a
        .events
        .iter()
        .enumerate()
        .filter(|(_, ev)| ev.peak_z_score >= Z_MIN)
        .collect();

    let b_events_filtered: Vec<(usize, &EventInterval)> = b
        .events
        .iter()
        .enumerate()
        .filter(|(_, ev)| ev.peak_z_score >= Z_MIN)
        .collect();

    if a_events_filtered.is_empty() || b_events_filtered.is_empty() {
        return MatchResult {
            offset_sec: 0.0,
            matches: Vec::new(),
        };
    }

    // 1. Offset 추정
    let a_base_time = a.first_message_time.timestamp();
    let b_base_time = b.first_message_time.timestamp();

    let a_top = select_top_events(&a.events, TOP_K);
    let b_top = select_top_events(&b.events, TOP_K);

    let offset_sec = estimate_offset(&a_top, &b_top, a_base_time, b_base_time, BIN_SIZE);

    // 2. B 이벤트를 abs_peak로 정렬 (binary search를 위해)
    let mut b_sorted: Vec<(usize, i64, &EventInterval)> = b_events_filtered
        .iter()
        .map(|(idx, ev)| {
            let abs_peak = b_base_time + ev.peak_sec;
            (*idx, abs_peak, *ev)
        })
        .collect();
    b_sorted.sort_by_key(|(_, abs_peak, _)| *abs_peak);

    // 3. 후보 매칭 생성
    let mut candidates: Vec<(usize, usize, f64, i64, i64, i64, i64)> = Vec::new();
    // (a_idx, b_idx, overlap_ratio, abs_peak_a_aligned, abs_peak_b, delta_peak_sec, overlap_sec)

    for (a_idx, a_ev) in &a_events_filtered {
        let a_abs_peak = a_base_time + a_ev.peak_sec;
        let a_abs_peak_aligned = a_abs_peak + offset_sec as i64;

        // Binary search로 PEAK_WINDOW 범위 내의 B 이벤트 찾기
        let target_min = a_abs_peak_aligned - PEAK_WINDOW;
        let target_max = a_abs_peak_aligned + PEAK_WINDOW;

        // Lower bound 찾기
        let start_idx = b_sorted
            .binary_search_by_key(&target_min, |(_, abs_peak, _)| *abs_peak)
            .unwrap_or_else(|idx| idx);

        // Upper bound 찾기
        let end_idx = b_sorted
            .binary_search_by_key(&target_max, |(_, abs_peak, _)| *abs_peak)
            .unwrap_or_else(|idx| idx);

        // 범위 내의 B 이벤트들 확인
        for (b_idx, b_abs_peak, b_ev) in &b_sorted[start_idx..end_idx.min(b_sorted.len())] {
            let delta_peak = (b_abs_peak - a_abs_peak_aligned).abs();

            if delta_peak > PEAK_WINDOW {
                continue;
            }

            // 구간 겹침 계산
            let a_abs_start = a_base_time + a_ev.start_sec + offset_sec as i64;
            let a_abs_end = a_base_time + a_ev.end_sec + offset_sec as i64;
            let b_abs_start = b_base_time + b_ev.start_sec;
            let b_abs_end = b_base_time + b_ev.end_sec;

            let overlap_start = a_abs_start.max(b_abs_start);
            let overlap_end = a_abs_end.min(b_abs_end);
            let overlap_sec = (overlap_end - overlap_start).max(0);

            if overlap_sec < MIN_OVERLAP {
                continue;
            }

            let len_a = a_abs_end - a_abs_start;
            let len_b = b_abs_end - b_abs_start;
            let min_len = len_a.min(len_b);

            if min_len == 0 {
                continue;
            }

            let overlap_ratio = overlap_sec as f64 / min_len as f64;

            if overlap_ratio < RATIO_TH {
                continue;
            }

            candidates.push((
                *a_idx,
                *b_idx,
                overlap_ratio,
                a_abs_peak_aligned,
                *b_abs_peak,
                delta_peak,
                overlap_sec,
            ));
        }
    }

    // 4. 1:1 매칭으로 정리 (그리디)
    // score = overlap_ratio + 0.03 * min(z_a, z_b)
    let mut scored_candidates: Vec<(usize, usize, f64, i64, i64, i64)> = candidates
        .into_iter()
        .map(
            |(a_idx, b_idx, overlap_ratio, abs_peak_a_aligned, abs_peak_b, delta_peak, _)| {
                let z_a = a.events[a_idx].peak_z_score;
                let z_b = b.events[b_idx].peak_z_score;
                let score = overlap_ratio + 0.03 * z_a.min(z_b);
                (
                    a_idx,
                    b_idx,
                    score,
                    abs_peak_a_aligned,
                    abs_peak_b,
                    delta_peak,
                )
            },
        )
        .collect();

    scored_candidates.sort_by(|a, b| b.2.partial_cmp(&a.2).unwrap_or(std::cmp::Ordering::Equal));

    let mut used_a = std::collections::HashSet::new();
    let mut used_b = std::collections::HashSet::new();
    let mut matches = Vec::new();

    for (a_idx, b_idx, score, abs_peak_a_aligned, abs_peak_b, delta_peak) in scored_candidates {
        if used_a.contains(&a_idx) || used_b.contains(&b_idx) {
            continue;
        }

        used_a.insert(a_idx);
        used_b.insert(b_idx);

        matches.push(MatchedEvent {
            a_idx,
            b_idx,
            score,
            abs_peak_a_aligned,
            abs_peak_b,
            delta_peak_sec: delta_peak,
        });
    }

    MatchResult {
        offset_sec,
        matches,
    }
}

/// 매칭 결과를 출력합니다.
pub fn print_match_result(
    result: &MatchResult,
    a: &EventDetectionResult,
    b: &EventDetectionResult,
) {
    println!("\n=== 두 VOD 이벤트 매칭 결과 ===");
    println!(
        "추정된 offset: {:.2}초 (A에 더하면 B에 맞춰짐)",
        result.offset_sec
    );
    println!("매칭된 이벤트 쌍 수: {}\n", result.matches.len());

    for (i, matched) in result.matches.iter().enumerate() {
        let a_ev = &a.events[matched.a_idx];
        let b_ev = &b.events[matched.b_idx];

        // A 피크 시간 계산 (절대 시간)
        let a_peak_time = a.first_message_time + chrono::Duration::seconds(a_ev.peak_sec);
        let a_peak_hour: u32 = a_peak_time.format("%H").to_string().parse().unwrap_or(0);
        let a_peak_min: u32 = a_peak_time.format("%M").to_string().parse().unwrap_or(0);
        let a_peak_sec: u32 = a_peak_time.format("%S").to_string().parse().unwrap_or(0);

        // B 피크 시간 계산 (절대 시간)
        let b_peak_time = b.first_message_time + chrono::Duration::seconds(b_ev.peak_sec);
        let b_peak_hour: u32 = b_peak_time.format("%H").to_string().parse().unwrap_or(0);
        let b_peak_min: u32 = b_peak_time.format("%M").to_string().parse().unwrap_or(0);
        let b_peak_sec: u32 = b_peak_time.format("%S").to_string().parse().unwrap_or(0);

        // 시작 시간도 계산 (상대 시간을 시간:분:초로 변환)
        let a_start_hour = a_ev.start_sec / 3600;
        let a_start_min = (a_ev.start_sec % 3600) / 60;
        let a_start_sec = a_ev.start_sec % 60;

        let b_start_hour = b_ev.start_sec / 3600;
        let b_start_min = (b_ev.start_sec % 3600) / 60;
        let b_start_sec = b_ev.start_sec % 60;

        println!("매칭 #{} (점수: {:.3})", i + 1, matched.score);
        println!(
            "  A 이벤트 #{}: {:02}:{:02}:{:02} (피크: {:02}:{:02}:{:02}, z={:.2})",
            matched.a_idx + 1,
            a_start_hour,
            a_start_min,
            a_start_sec,
            a_peak_hour,
            a_peak_min,
            a_peak_sec,
            a_ev.peak_z_score
        );
        println!(
            "  B 이벤트 #{}: {:02}:{:02}:{:02} (피크: {:02}:{:02}:{:02}, z={:.2})",
            matched.b_idx + 1,
            b_start_hour,
            b_start_min,
            b_start_sec,
            b_peak_hour,
            b_peak_min,
            b_peak_sec,
            b_ev.peak_z_score
        );
        println!("  피크 시간 차이: {}초", matched.delta_peak_sec);
        println!();
    }
}
