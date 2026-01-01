use std::time::Duration;

use color_eyre::eyre::Result;
use mimalloc::MiMalloc;
use structopt::StructOpt;
use tokio::time;

use crate::data::models::{ChannelWithReplays, ChatLog};

mod api;
mod command;
mod data;
mod utils;

#[global_allocator]
static GLOBAL: MiMalloc = MiMalloc;

/// ====== CLI 구조체 ======

#[derive(StructOpt, Debug)]
#[structopt(name = "chzzk-chat", about = "치지직 채팅 스크래퍼")]
pub enum Opt {
    /// 실시간 채팅 테스트 모드 (채널 스캔 및 채팅 스크래핑)
    #[structopt(name = "live-chat-test")]
    LiveChatTest,

    /// 채팅 분석 모드
    #[structopt(name = "analysis-chat")]
    AnalysisChat(AnalysisChatOpt),

    /// 실험 모드
    #[structopt(name = "experimental")]
    Experimental,

    /// 이벤트 추출 모드
    #[structopt(name = "extract-event")]
    ExtractEvent(command::extract_event::ExtractEventOpt),

    /// 인터렉티브 모드
    #[structopt(name = "interactive")]
    Interactive,
}

/// 채팅 분석 모드 옵션
#[derive(StructOpt, Debug, Default)]
pub struct AnalysisChatOpt {
    /// 채널 및 리플레이 데이터 파일 경로 (여러 개 지정 가능)
    #[structopt(long)]
    pub files: Vec<String>,

    #[structopt(long)]
    pub enable_experimental: bool,
}

/// ====== 엔트리포인트 ======

#[tokio::main]
async fn main() -> Result<()> {
    color_eyre::install()?;
    let opt = Opt::from_args();

    match opt {
        Opt::LiveChatTest => run_live_chat_test().await?,
        Opt::AnalysisChat(opts) => run_analysis_chat(&opts).await?,
        Opt::Experimental => run_experimental().await?,
        Opt::ExtractEvent(opts) => command::extract_event::run_extract_event(&opts)?,
        Opt::Interactive => command::interactive::run_interactive().await?,
    }

    Ok(())
}

/// 실시간 채팅 테스트 모드 실행
async fn run_live_chat_test() -> Result<()> {
    utils::log("실시간 채팅 테스트 모드 시작");
    api::scan_channels().await?;

    // 웹소켓 태스크들이 계속 돌 수 있도록 프로세스를 유지
    loop {
        time::sleep(Duration::from_secs(3600)).await;
    }
}

/// 채팅 분석 모드 실행
async fn run_analysis_chat(opts: &AnalysisChatOpt) -> Result<()> {
    let (channels, chat_logs) = load_channels_and_chat_logs(opts)?;

    // 비디오별 채팅 타임라인 추출
    data::timeline::extract_video_chat_timeline_count(
        &chat_logs,
        "../web/public/video_with_chat_counts.json",
    )?;

    // 고유 사용자 수 만 명 이상인 chat_log 필터링
    utils::log("고유 사용자 수 기준 필터링 중...");
    let chat_logs = data::chat::filter_chat_logs_by_user_count(chat_logs, 10000);

    // 각 채팅 로그 분석
    if opts.enable_experimental {
        for chat_log in &chat_logs {
            let analysis = data::chat::analyze_chat_log(chat_log);
            data::chat::print_analysis_summary(chat_log, &analysis, &channels);
        }
    }

    run_channel_distance_analysis(&channels, &chat_logs)?;

    if opts.enable_experimental {
        run_cluster_similar_replays(&channels, &chat_logs);
    }

    run_find_related_replays(&channels, &chat_logs)?;

    // 메모리 해제하는데 너무 많은 시간을 써서 그냥 메모리 정리는 커널에 던지고 종료
    std::process::exit(0);
}

pub fn load_channels_and_chat_logs(
    opts: &AnalysisChatOpt,
) -> Result<(
    Vec<data::models::ChannelWithReplays>,
    Vec<data::models::ChatLog>,
)> {
    let file_paths = if opts.files.is_empty() {
        vec![
            "../web/public/channel_with_replays_0.json".to_string(),
            "../web/public/channel_with_replays_1.json".to_string(),
        ]
    } else {
        opts.files.clone()
    };

    utils::log(format!("채팅 분석 모드 시작: {}개 파일", file_paths.len()));

    let mut channels = Vec::new();
    for file_path in &file_paths {
        utils::log(format!("파일 로드 중: {}", file_path));
        let mut file_channels = data::loader::load_channel_with_replays(file_path)?;
        channels.append(&mut file_channels);
    }

    utils::log(format!("로드된 채널 수: {}", channels.len()));

    let chat_logs_dir = "../chat_logs";
    utils::log(format!("채팅 로그 폴더에서 데이터 로드: {}", chat_logs_dir));

    let chat_logs =
        data::chat::loader::load_all_chat_logs(chat_logs_dir, Some("../chat_logs_cache"))?;
    utils::log(format!("로드된 채팅 로그 수: {}", chat_logs.len()));

    Ok((channels, chat_logs))
}

fn run_channel_distance_analysis(
    channels: &[ChannelWithReplays],
    chat_logs: &[ChatLog],
) -> Result<()> {
    // 채널 간 distance 계산
    utils::log("채널 간 거리 계산 중...");
    let (nodes, links) = data::chat::calculate_channel_distances(chat_logs, channels, None);

    data::chat::export_channel_distances_json(&nodes, &links, "../web/public/data2.json")?;

    // 연관 채널 링크만 별도 JSON으로 내보내기 (각 채널당 최대 6개, distance ≥ 0.1)
    data::chat::export_related_channel_links_json(
        &links,
        "../web/public/related_channels.json",
        0.01,
        32,
        &[
            // 블랙리스트 채널들 (완전히 제외)
            "c5f1df85d73d9c613f0c27c0ef816857".to_string(),
        ],
    )?;

    utils::log(format!("계산된 채널 노드 수: {}", nodes.len()));
    utils::log(format!("계산된 채널 링크 수: {}", links.len()));

    // 채널별로 가장 가까운 채널 상위 5개 출력
    data::chat::print_top_closest_channels(&nodes, &links);

    Ok(())
}

fn run_cluster_similar_replays(channels: &[ChannelWithReplays], chat_logs: &[ChatLog]) {
    utils::log("유사한 다시보기 클러스터링 중 (시청자 수 기준)...");
    let clusters = data::chat::cluster_similar_replays(channels, chat_logs, 0.1);
    data::chat::print_replay_clusters(&clusters, Some(10000));
}

/// 비디오 연관도 분석 모드 실행
fn run_find_related_replays(channels: &[ChannelWithReplays], chat_logs: &[ChatLog]) -> Result<()> {
    // 모든 비디오 간 연관도 분석
    let all_relations = data::video_analyzer::analyze_all_video_relations(channels, chat_logs)?;

    // JSON 파일로 저장
    data::video_analyzer::export_video_relations_json(
        &all_relations,
        "../web/public/video_related.json",
    )?;

    // 전체 분석 결과 요약 출력
    data::video_analyzer::print_all_video_relations(&all_relations, Some(20));

    Ok(())
}

async fn run_experimental() -> Result<()> {
    let (_, chat_logs) = load_channels_and_chat_logs(&AnalysisChatOpt::default())?;

    let first_chat = chat_logs
        .iter()
        .find(|chat_log| chat_log.video_id == 10066814)
        .unwrap();
    let second_chat = chat_logs
        .iter()
        .find(|chat_log| chat_log.video_id == 10066747)
        .unwrap();

    let event = data::chat::detect_event_intervals(first_chat).unwrap();
    let event2 = data::chat::detect_event_intervals(second_chat).unwrap();
    // data::chat::print_event_intervals(&event);

    data::chat::print_event_intervals(&event);

    let result = data::chat::match_events_time_only(&event, &event2);

    data::chat::print_match_result(&result, &event, &event2);

    let top_matched = result.matches.first().unwrap();

    print_matched_event_chats(top_matched, &event, &event2, first_chat, second_chat);

    Ok(())
}

/// 매칭된 이벤트 구간의 채팅을 타임스탬프와 함께 출력합니다.
fn print_matched_event_chats(
    matched: &data::chat::MatchedEvent,
    event_a: &data::chat::EventDetectionResult,
    event_b: &data::chat::EventDetectionResult,
    chat_a: &ChatLog,
    chat_b: &ChatLog,
) {
    println!("\n=== 매칭된 이벤트 구간의 채팅 ===");

    // A 이벤트 구간 (first_chat)
    let a_event = &event_a.events[matched.a_idx];
    let a_start_abs = event_a.first_message_time.timestamp() + a_event.start_sec;
    let a_end_abs = event_a.first_message_time.timestamp() + a_event.end_sec;

    println!("\n[A 채팅 (Video ID: {})]", chat_a.video_id);
    println!(
        "구간: {} ~ {}",
        event_a.first_message_time.format("%Y-%m-%d %H:%M:%S"),
        (event_a.first_message_time + chrono::Duration::seconds(a_event.end_sec))
            .format("%Y-%m-%d %H:%M:%S")
    );

    let mut a_messages: Vec<_> = chat_a
        .messages
        .iter()
        .filter(|msg| {
            let msg_timestamp = msg.timestamp.timestamp();
            msg_timestamp >= a_start_abs && msg_timestamp <= a_end_abs
        })
        .collect();

    // 시간 순으로 정렬
    a_messages.sort_by_key(|msg| msg.timestamp);

    for msg in a_messages.iter().take(1000) {
        // 상위 50개만 출력
        println!(
            "[{}] {}: {}",
            msg.timestamp.format("%H:%M:%S"),
            msg.nickname,
            msg.message
        );
    }
    println!("... (총 {}개 메시지)", a_messages.len());

    // B 이벤트 구간 (second_chat)
    let b_event = &event_b.events[matched.b_idx];
    let b_start_abs = event_b.first_message_time.timestamp() + b_event.start_sec;
    let b_end_abs = event_b.first_message_time.timestamp() + b_event.end_sec;

    println!("\n[B 채팅 (Video ID: {})]", chat_b.video_id);
    println!(
        "구간: {} ~ {}",
        event_b.first_message_time.format("%Y-%m-%d %H:%M:%S"),
        (event_b.first_message_time + chrono::Duration::seconds(b_event.end_sec))
            .format("%Y-%m-%d %H:%M:%S")
    );

    let mut b_messages: Vec<_> = chat_b
        .messages
        .iter()
        .filter(|msg| {
            let msg_timestamp = msg.timestamp.timestamp();
            msg_timestamp >= b_start_abs && msg_timestamp <= b_end_abs
        })
        .collect();

    // 시간 순으로 정렬
    b_messages.sort_by_key(|msg| msg.timestamp);

    for msg in b_messages.iter().take(1000) {
        // 상위 50개만 출력
        println!(
            "[{}] {}: {}",
            msg.timestamp.format("%H:%M:%S"),
            msg.nickname,
            msg.message
        );
    }
    println!("... (총 {}개 메시지)", b_messages.len());
}
