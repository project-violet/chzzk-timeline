use std::time::Duration;

use color_eyre::eyre::Result;
use structopt::StructOpt;
use tokio::time;

use crate::data::models::{ChannelWithReplays, ChatLog};

mod api;
mod data;
mod utils;

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

    /// 비디오 연관도 분석 모드
    #[structopt(name = "find-related-replays")]
    FindRelatedReplays(FindRelatedReplaysOpt),
}

/// 채팅 분석 모드 옵션
#[derive(StructOpt, Debug)]
pub struct AnalysisChatOpt {
    /// 채널 및 리플레이 데이터 파일 경로 (여러 개 지정 가능)
    #[structopt(long)]
    pub files: Vec<String>,
}

/// 비디오 연관도 분석 모드 옵션
#[derive(StructOpt, Debug)]
pub struct FindRelatedReplaysOpt {
    /// 채널 및 리플레이 데이터 파일 경로 (여러 개 지정 가능)
    #[structopt(long)]
    pub files: Vec<String>,

    /// 출력할 연관 비디오 최대 개수
    #[structopt(long, default_value = "20")]
    pub max_count: usize,
}

/// ====== 엔트리포인트 ======

#[tokio::main]
async fn main() -> Result<()> {
    color_eyre::install()?;
    let opt = Opt::from_args();

    match opt {
        Opt::LiveChatTest => run_live_chat_test().await?,
        Opt::AnalysisChat(opts) => run_analysis_chat(&opts).await?,
        Opt::FindRelatedReplays(opts) => run_find_related_replays(&opts).await?,
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
    let chat_logs = data::chat_analyzer::filter_chat_logs_by_user_count(chat_logs, 10000);

    // 각 채팅 로그 분석
    // for chat_log in &chat_logs {
    //     let analysis = data::chat_analyzer::analyze_chat_log(chat_log);
    //     data::chat_analyzer::print_analysis_summary(chat_log, &analysis, &channels);
    // }

    run_channel_distance_analysis(&channels, &chat_logs)?;

    // run_cluster_similar_replays(&channels, &chat_logs);

    Ok(())
}

fn load_channels_and_chat_logs(
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

    let chat_logs = data::chat_loader::load_all_chat_logs(chat_logs_dir)?;
    utils::log(format!("로드된 채팅 로그 수: {}", chat_logs.len()));

    Ok((channels, chat_logs))
}

fn run_channel_distance_analysis(
    channels: &Vec<ChannelWithReplays>,
    chat_logs: &Vec<ChatLog>,
) -> Result<()> {
    // 채널 간 distance 계산
    utils::log("채널 간 거리 계산 중...");
    let (nodes, links) =
        data::chat_analyzer::calculate_channel_distances(chat_logs, channels, None);

    data::chat_analyzer::export_channel_distances_json(&nodes, &links, "../web/public/data2.json")?;

    // 연관 채널 링크만 별도 JSON으로 내보내기 (각 채널당 최대 6개, distance ≥ 0.1)
    data::chat_analyzer::export_related_channel_links_json(
        &links,
        "../web/public/related_channels.json",
        0.01,
        6,
        &vec![
            // 블랙리스트 채널들 (완전히 제외)
            "c5f1df85d73d9c613f0c27c0ef816857".to_string(),
        ],
    )?;

    utils::log(format!("계산된 채널 노드 수: {}", nodes.len()));
    utils::log(format!("계산된 채널 링크 수: {}", links.len()));

    // 채널별로 가장 가까운 채널 상위 5개 출력
    // data::chat_analyzer::print_top_closest_channels(&nodes, &links);

    Ok(())
}

fn run_cluster_similar_replays(channels: &Vec<ChannelWithReplays>, chat_logs: &Vec<ChatLog>) {
    utils::log("유사한 다시보기 클러스터링 중 (시청자 수 기준)...");
    let clusters = data::chat_analyzer::cluster_similar_replays(channels, chat_logs, 0.1);
    data::chat_analyzer::print_replay_clusters(&clusters, Some(10000));
}

/// 비디오 연관도 분석 모드 실행
async fn run_find_related_replays(opts: &FindRelatedReplaysOpt) -> Result<()> {
    let (channels, chat_logs) = load_channels_and_chat_logs_for_analysis(&opts.files)?;

    // 모든 비디오 간 연관도 분석
    let all_relations = data::video_analyzer::analyze_all_video_relations(&channels, &chat_logs)?;

    // JSON 파일로 저장
    data::video_analyzer::export_video_relations_json(
        &all_relations,
        "../web/public/video_related.json",
    )?;

    // 전체 분석 결과 요약 출력
    data::video_analyzer::print_all_video_relations(&all_relations, Some(opts.max_count));

    Ok(())
}

/// 채널 및 채팅 로그 로드 (분석용)
fn load_channels_and_chat_logs_for_analysis(
    files: &[String],
) -> Result<(
    Vec<data::models::ChannelWithReplays>,
    Vec<data::models::ChatLog>,
)> {
    let file_paths = if files.is_empty() {
        vec![
            "../web/public/channel_with_replays_0.json".to_string(),
            "../web/public/channel_with_replays_1.json".to_string(),
        ]
    } else {
        files.to_vec()
    };

    utils::log(format!("채널 데이터 로드 중: {}개 파일", file_paths.len()));

    let mut channels = Vec::new();
    for file_path in &file_paths {
        utils::log(format!("파일 로드 중: {}", file_path));
        let mut file_channels = data::loader::load_channel_with_replays(file_path)?;
        channels.append(&mut file_channels);
    }

    utils::log(format!("로드된 채널 수: {}", channels.len()));

    let chat_logs_dir = "../chat_logs";
    utils::log(format!("채팅 로그 폴더에서 데이터 로드: {}", chat_logs_dir));

    let chat_logs = data::chat_loader::load_all_chat_logs(chat_logs_dir)?;
    utils::log(format!("로드된 채팅 로그 수: {}", chat_logs.len()));

    Ok((channels, chat_logs))
}
