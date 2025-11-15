use color_eyre::eyre::{Context, Result};

use crate::api::models::{
    ChannelDetail, ChannelDetailResponse, Live, LiveDetail, LiveDetailResponse, LivesResponse,
    PageNext,
};
use crate::utils::log;

/// ====== HTTP 함수들 ======

pub async fn fetch_lives(next: Option<&PageNext>) -> Result<(Vec<Live>, Option<PageNext>)> {
    let url = if let Some(next) = next {
        format!(
            "https://api.chzzk.naver.com/service/v1/lives?size=50&sortType=POPULAR&concurrentUserCount={}&liveId={}",
            next.concurrent_user_count, next.live_id
        )
    } else {
        "https://api.chzzk.naver.com/service/v1/lives?size=50&sortType=POPULAR".to_string()
    };

    let client = reqwest::Client::new();
    let resp: LivesResponse = client
        .get(&url)
        .header("User-Agent", "Mozilla")
        .send()
        .await?
        .json()
        .await
        .with_context(|| format!("Failed to parse lives response: {}", url))?;

    Ok((resp.content.data, resp.content.page.next))
}

pub async fn fetch_lives_pages(min_user: u64) -> Result<Vec<Live>> {
    let mut valid_lives = Vec::new();
    let mut next: Option<PageNext> = None;

    loop {
        let (lives, next_page) = fetch_lives(next.as_ref()).await?;

        // let stop = filtered.len() < filtered.capacity(); // lives.len()와 같지 않으면 중단
        let stop = lives.iter().any(|l| l.concurrent_user_count < min_user);

        valid_lives.append(
            &mut lives
                .into_iter()
                .filter(|l| l.concurrent_user_count >= min_user)
                .collect(),
        );

        if stop {
            break;
        }

        if next_page.is_none() {
            break;
        }

        next = next_page;
        println!("next: {:?}", next);
    }

    Ok(valid_lives)
}

pub async fn fetch_channel(channel_id: &str) -> Result<Option<ChannelDetail>> {
    let url = format!(
        "https://api.chzzk.naver.com/service/v1/channels/{}",
        channel_id
    );

    let client = reqwest::Client::new();
    let resp = client
        .get(&url)
        .header("User-Agent", "Mozilla")
        .send()
        .await?;

    let status = resp.status();
    if !status.is_success() {
        log(format!(
            "fetchChannel() HTTP error {} for channel {}",
            status, channel_id
        ));
        return Ok(None);
    }

    let json: ChannelDetailResponse = resp
        .json()
        .await
        .with_context(|| format!("fetchChannel() JSON parse error for channel {}", channel_id))?;

    if json.content.is_none() {
        log(format!(
            "fetchChannel() JSON Error! channel_id={} (content is null)",
            channel_id
        ));
    }

    Ok(json.content)
}

pub async fn fetch_live_detail(channel_id: &str) -> Result<Option<LiveDetail>> {
    let url = format!(
        "https://api.chzzk.naver.com/service/v3/channels/{}/live-detail",
        channel_id
    );

    let client = reqwest::Client::new();
    let resp = client
        .get(&url)
        .header("User-Agent", "Mozilla")
        .send()
        .await?;

    let status = resp.status();
    if !status.is_success() {
        log(format!(
            "fetchLiveDetail() HTTP error {} for channel {}",
            status, channel_id
        ));
        return Ok(None);
    }

    let json: LiveDetailResponse = resp.json().await.with_context(|| {
        format!(
            "fetchLiveDetail() JSON parse error for channel {}",
            channel_id
        )
    })?;

    Ok(json.content)
}
