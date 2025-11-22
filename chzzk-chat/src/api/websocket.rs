use std::time::Duration;

use chrono::Utc;
use color_eyre::eyre::Result;
use futures::{SinkExt, StreamExt};
use once_cell::sync::Lazy;
use serde_json::Value;
use tokio::sync::broadcast;
use tokio::{net::TcpListener, time};
use tokio_tungstenite::{
    accept_async, connect_async,
    tungstenite::{client::IntoClientRequest, Message},
};

use crate::api::models::{InitBody, InitMessage, LiveReady};
use crate::utils::{log, SCRAPING_CHANNELS};

static LIVE_CHAT_BROADCAST: Lazy<broadcast::Sender<String>> = Lazy::new(|| {
    let (tx, _rx) = broadcast::channel(1024);
    tx
});

/// Node의 scrapeChats(live)를 백그라운드 태스크로 실행
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

    // INIT 메시지 송신
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
                // Node 코드처럼 주기마다 채널 상태 확인 후 PING
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
                        // 서버에서 온 ping은 tungstenite가 자동 pong 처리
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

pub fn spawn_live_chat_ws_server(addr: &str) {
    let addr = addr.to_string();
    tokio::spawn(async move {
        if let Err(err) = run_live_chat_ws_server(&addr).await {
            log(format!(
                "Live chat WebSocket server stopped ({}): {:?}",
                addr, err
            ));
        }
    });
}

async fn run_live_chat_ws_server(addr: &str) -> Result<()> {
    let listener = TcpListener::bind(addr).await?;
    log(format!(
        "Live chat WebSocket server listening on ws://{}",
        addr
    ));

    loop {
        let (stream, _) = listener.accept().await?;
        tokio::spawn(async move {
            if let Err(err) = handle_live_chat_client(stream).await {
                log(format!("Live chat client error: {:?}", err));
            }
        });
    }
}

async fn handle_live_chat_client(stream: tokio::net::TcpStream) -> Result<()> {
    let peer = stream.peer_addr().ok();
    let mut ws_stream = accept_async(stream).await?;
    let mut rx = LIVE_CHAT_BROADCAST.subscribe();
    log(format!("Live chat client connected: {:?}", peer));

    loop {
        tokio::select! {
            incoming = rx.recv() => {
                match incoming {
                    Ok(msg) => {
                        if ws_stream.send(Message::Text(msg)).await.is_err() {
                            break;
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(skipped)) => {
                        log(format!("Live chat client lagging; skipped {} messages", skipped));
                    }
                    Err(broadcast::error::RecvError::Closed) => {
                        break;
                    }
                }
            }
            ws_msg = ws_stream.next() => {
                match ws_msg {
                    Some(Ok(Message::Ping(payload))) => {
                        ws_stream.send(Message::Pong(payload)).await.ok();
                    }
                    Some(Ok(Message::Close(_))) | None => {
                        break;
                    }
                    Some(Err(err)) => {
                        log(format!("Live chat websocket read error: {:?}", err));
                        break;
                    }
                    _ => {}
                }
            }
        }
    }

    log(format!("Live chat client disconnected: {:?}", peer));
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
                    // db.insertChat({ channelId, userId }) 역할 대신 println
                    // println!(
                    //     "CHAT channelId={} userId={}, msg={}, raw={:?}",
                    //     live.channel_id,
                    //     uid,
                    //     chat["msg"].as_str().unwrap_or(""),
                    //     chat
                    // );

                    publish_live_chat(live, uid, chat);
                }
            }
        }
    }

    Ok(())
}

fn publish_live_chat(live: &LiveReady, uid: &str, chat: &Value) {
    let payload = serde_json::json!({
        "channelId": live.channel_id,
        "userId": uid,
        "message": chat["msg"].as_str().unwrap_or(""),
        "raw": chat,
        "receivedAt": Utc::now().timestamp_millis(),
    });

    if let Ok(serialized) = serde_json::to_string(&payload) {
        let _ = LIVE_CHAT_BROADCAST.send(serialized);
    }
}
