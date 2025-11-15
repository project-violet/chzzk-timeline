use std::time::Duration;

use color_eyre::eyre::Result;
use futures::{SinkExt, StreamExt};
use serde_json::Value;
use tokio::time;
use tokio_tungstenite::{
    connect_async,
    tungstenite::{client::IntoClientRequest, Message},
};

use crate::api::models::{InitBody, InitMessage, LiveReady};
use crate::utils::{log, SCRAPING_CHANNELS};

/// Node의 scrapeChats(live)와 대응 (백그라운드 태스크로 실행)
pub fn spawn_scrape_chats(live: LiveReady) {
    tokio::spawn(async move {
        if let Err(e) = scrape_chats(live.clone()).await {
            log(format!(
                "scrape_chats error for channel {}: {:?}",
                live.channel_id, e
            ));
            SCRAPING_CHANNELS.remove(&live.channel_id);
        }
    });
}

async fn scrape_chats(live: LiveReady) -> Result<()> {
    let request = "wss://kr-ss1.chat.naver.com/chat"
        .into_client_request()
        .unwrap();

    let (mut ws_stream, _) = connect_async(request).await?;
    SCRAPING_CHANNELS.insert(live.channel_id.clone());

    // INIT 메시지 전송
    let init_msg = InitMessage {
        ver: "3".to_string(),
        cmd: 100,
        svcid: "game".to_string(),
        cid: live.chat_channel_id.clone(),
        tid: 1,
        bdy: InitBody {
            uid: None,
            dev_type: 2001,
            acc_tkn: None,
            auth: "READ".to_string(),
            lib_ver: None,
            os_ver: None,
            dev_name: None,
            locale: None,
            timezone: None,
        },
    };

    ws_stream
        .send(Message::Text(serde_json::to_string(&init_msg)?))
        .await?;

    log(format!(
        "Opened! channel_id={} scrapingChannels={}",
        live.channel_id,
        SCRAPING_CHANNELS.len()
    ));

    let mut ping_interval = time::interval(Duration::from_secs(20));

    loop {
        tokio::select! {
            _ = ping_interval.tick() => {
                // Node 코드처럼 주기적으로 채널 상태 확인 및 PING
                if let Some(detail) = crate::api::client::fetch_channel(&live.channel_id).await? {
                    if let Some(open_live) = detail.open_live {
                        if !open_live {
                            log(format!("Channel {} closed live, closing websocket.", live.channel_id));
                            ws_stream.close(None).await.ok();
                            break;
                        }
                    }
                }

                let ping_msg = serde_json::json!({
                    "ver": 3,
                    "cmd": 0,
                });

                ws_stream
                    .send(Message::Text(ping_msg.to_string()))
                    .await
                    .ok();
            }

            msg = ws_stream.next() => {
                match msg {
                    Some(Ok(Message::Text(text))) => {
                        handle_ws_message(&live, &mut ws_stream, &text).await?;
                    }
                    Some(Ok(Message::Ping(_))) => {
                        // 서버에서 온 ping에 자동 응답은 tungstenite가 처리하지만,
                        // 필요하면 여기서 수동으로 처리 가능.
                    }
                    Some(Ok(Message::Close(_))) => {
                        break;
                    }
                    Some(Err(e)) => {
                        log(format!("WebSocket error for channel {}: {:?}", live.channel_id, e));
                        break;
                    }
                    None => {
                        // 스트림 종료
                        break;
                    }
                    _ => {}
                }
            }
        }
    }

    SCRAPING_CHANNELS.remove(&live.channel_id);
    log(format!(
        "Closed! channel_id={} scrapingChannels={}",
        live.channel_id,
        SCRAPING_CHANNELS.len()
    ));

    Ok(())
}

async fn handle_ws_message(
    live: &LiveReady,
    ws_stream: &mut (impl futures::Sink<Message, Error = tokio_tungstenite::tungstenite::Error> + Unpin),
    text: &str,
) -> Result<()> {
    let v: Value = serde_json::from_str(text)?;

    let cmd = v["cmd"].as_i64().unwrap_or_default();

    if cmd == 0 {
        // 서버 ping -> PONG 응답
        let pong_msg = serde_json::json!({
            "ver": 3,
            "cmd": 10000,
        });
        ws_stream
            .send(Message::Text(pong_msg.to_string()))
            .await
            .ok();
    } else if cmd == 93101 {
        if let Some(bdy) = v["bdy"].as_array() {
            for chat in bdy {
                if let Some(uid) = chat["uid"].as_str() {
                    // db.insertChat({ channelId, userId }) 대신 println!
                    println!(
                        "CHAT channelId={} userId={}, msg={}",
                        live.channel_id,
                        uid,
                        chat["msg"].as_str().unwrap_or("")
                    );
                }
            }
        }
    }

    Ok(())
}

