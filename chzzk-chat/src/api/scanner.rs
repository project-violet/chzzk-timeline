use std::env;

use color_eyre::eyre::Result;
use futures::future::join_all;

use crate::api::client::{fetch_channel, fetch_live_detail, fetch_lives_pages};
use crate::api::models::LiveReady;
use crate::utils::{log, SCRAPING_CHANNELS};
use crate::api::websocket::spawn_scrape_chats;

/// Node의 scanChannels와 대응
pub async fn scan_channels() -> Result<()> {
    let min_live_user: u64 = env::var("MIN_LIVE_USER")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(100); // 기본값

    log(format!(
        "Starting scan with MIN_LIVE_USER = {}",
        min_live_user
    ));

    let mut lives = fetch_lives_pages(min_live_user).await?;
    // adult == false만
    lives.retain(|l| !l.adult);

    // 병렬로 채널 상세 데이터 fetch
    let futures: Vec<_> = lives
        .into_iter()
        .map(|live| {
            let channel_id = live.channel.channel_id.clone();
            async move {
                let (detail_result, live_detail_result) =
                    tokio::join!(fetch_channel(&channel_id), fetch_live_detail(&channel_id));

                let detail_opt = detail_result.ok().flatten();
                let live_detail_opt = live_detail_result.ok().flatten();

                let Some(detail) = detail_opt else {
                    return None;
                };

                let Some(follower_count) = detail.follower_count else {
                    return None;
                };

                let Some(live_detail) = live_detail_opt else {
                    return None;
                };

                let Some(chat_channel_id) = live_detail.chat_channel_id.clone() else {
                    return None;
                };

                let ready_live = LiveReady {
                    channel_id,
                    chat_channel_id,
                    follower_count,
                };
                println!("ready_live: {:?}", ready_live);

                Some(ready_live)
            }
        })
        .collect();

    let results = join_all(futures).await;
    let mut ready_lives: Vec<LiveReady> = results.into_iter().flatten().collect();

    // 이미 scraping 중인 채널 제거
    ready_lives.retain(|l| !SCRAPING_CHANNELS.contains(&l.channel_id));

    // 각 live마다 WebSocket 스크래핑 시작
    for live in ready_lives {
        spawn_scrape_chats(live);
    }

    Ok(())
}

