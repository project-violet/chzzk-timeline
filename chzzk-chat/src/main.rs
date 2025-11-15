use std::time::Duration;

use color_eyre::eyre::Result;
use structopt::StructOpt;
use tokio::time;

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
}

/// 채팅 분석 모드 옵션
#[derive(StructOpt, Debug)]
pub struct AnalysisChatOpt {
    /// 채널 및 리플레이 데이터 파일 경로
    #[structopt(long, default_value = "../web/public/channel_with_replays_0.json")]
    pub file: String,
}

/// ====== 엔트리포인트 ======

#[tokio::main]
async fn main() -> Result<()> {
    color_eyre::install()?;
    let opt = Opt::from_args();

    match opt {
        Opt::LiveChatTest => run_live_chat_test().await?,
        Opt::AnalysisChat(opts) => run_analysis_chat(&opts).await?,
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
    utils::log(format!("채팅 분석 모드 시작: {}", opts.file));

    // 채널 데이터 로드
    let channels = data::loader::load_channel_with_replays(&opts.file)?;
    utils::log(format!("로드된 채널 수: {}", channels.len()));

    // chat_logs 폴더에서 모든 채팅 로그 로드
    let chat_logs_dir = "../chat_logs";
    utils::log(format!("채팅 로그 폴더에서 데이터 로드: {}", chat_logs_dir));
    let chat_logs = data::chat_loader::load_all_chat_logs(chat_logs_dir)?;
    utils::log(format!("로드된 채팅 로그 수: {}", chat_logs.len()));

    // 각 채팅 로그 분석
    for chat_log in &chat_logs {
        let analysis = data::chat_analyzer::analyze_chat_log(chat_log);
        data::chat_analyzer::print_analysis_summary(chat_log, &analysis);
    }

    Ok(())
}
