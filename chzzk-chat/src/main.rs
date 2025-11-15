use std::time::Duration;

use color_eyre::eyre::Result;
use structopt::StructOpt;
use tokio::time;

mod api;
mod utils;

/// ====== CLI 구조체 ======

#[derive(StructOpt, Debug)]
#[structopt(name = "chzzk-chat", about = "치지직 채팅 스크래퍼")]
pub struct Opt {
    /// 실시간 채팅 테스트 모드 (채널 스캔 및 채팅 스크래핑)
    #[structopt(long)]
    pub live_chat_test: bool,

    /// 채팅 분석 모드
    #[structopt(long)]
    pub analysis_chat: bool,
}

/// ====== 엔트리포인트 ======

#[tokio::main]
async fn main() -> Result<()> {
    color_eyre::install()?;
    let opt = Opt::from_args();

    if opt.live_chat_test {
        run_live_chat_test().await?;
    } else if opt.analysis_chat {
        run_analysis_chat().await?;
    } else {
        // 기본값으로 live-chat-test 실행
        run_live_chat_test().await?;
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
async fn run_analysis_chat() -> Result<()> {
    utils::log("채팅 분석 모드 시작");
    // TODO: 채팅 분석 기능 구현
    utils::log("채팅 분석 기능이 아직 구현되지 않았습니다.");
    Ok(())
}
