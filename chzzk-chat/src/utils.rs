use chrono::{Duration as ChronoDuration, Utc};
use dashmap::DashSet;
use indicatif::{ProgressBar, ProgressStyle};
use once_cell::sync::Lazy;

/// Node.js의 `scrapingChannels` Set 대체
pub static SCRAPING_CHANNELS: Lazy<DashSet<String>> = Lazy::new(DashSet::new);

/// ====== 공통 로그 함수 (KST 기준) ======
pub fn log(msg: impl AsRef<str>) {
    let now = Utc::now() + ChronoDuration::hours(9);
    println!("{} {}", now.format("%Y-%m-%d %H:%M:%S"), msg.as_ref());
}

/// ====== 공통 Progress Bar 생성 함수 ======
/// 표준 스타일의 ProgressBar를 생성합니다.
pub fn create_progress_bar(total: u64, message: &str) -> ProgressBar {
    let pb = ProgressBar::new(total);
    pb.set_style(
        ProgressStyle::default_bar()
            .template("{spinner:.green} [{elapsed_precise}] [{bar:40.cyan/blue}] {pos:>7}/{len:7} ({eta}) {msg}")
            .unwrap()
            .progress_chars("#>-"),
    );
    pb.set_message(message.to_string());
    pb
}
