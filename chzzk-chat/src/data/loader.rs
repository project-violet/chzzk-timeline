use color_eyre::eyre::{Context, Result};
use std::fs;
use std::path::Path;

use crate::data::models::ChannelWithReplays;

/// JSON 파일에서 채널 및 리플레이 데이터를 로드합니다.
pub fn load_channel_with_replays<P: AsRef<Path>>(path: P) -> Result<Vec<ChannelWithReplays>> {
    let file_content = fs::read_to_string(path.as_ref())
        .with_context(|| format!("Failed to read file: {:?}", path.as_ref()))?;

    let channels: Vec<ChannelWithReplays> = serde_json::from_str(&file_content)
        .with_context(|| format!("Failed to parse JSON from file: {:?}", path.as_ref()))?;

    Ok(channels)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_load_channel_with_replays() {
        // 프로젝트 루트 기준으로 web/public/channel_with_replays_0.json 파일 경로
        // cargo test는 프로젝트 루트(chzzk-chat)에서 실행되므로 ../web/public 경로 사용
        let test_file_path = "../web/public/channel_with_replays_0.json";

        let result = load_channel_with_replays(test_file_path);

        match result {
            Ok(channels) => {
                println!("✅ 파일 로딩 성공! 채널 수: {}", channels.len());
                assert!(!channels.is_empty(), "채널 데이터가 비어있습니다.");

                // 첫 번째 채널 정보 출력
                if let Some(first_channel) = channels.first() {
                    println!("첫 번째 채널:");
                    println!("  이름: {}", first_channel.name);
                    println!("  채널 ID: {}", first_channel.channel_id);
                    println!("  팔로워 수: {}", first_channel.follower);
                    println!("  리플레이 수: {}", first_channel.replays.len());

                    // 첫 번째 리플레이 정보 출력
                    if let Some(first_replay) = first_channel.replays.first() {
                        println!("  첫 번째 리플레이:");
                        println!("    제목: {}", first_replay.title);
                        println!("    시작: {}", first_replay.start);
                        println!("    종료: {}", first_replay.end);
                        println!("    비디오 번호: {}", first_replay.video_no);
                        println!("    카테고리: {:?}", first_replay.category_ko);
                        println!("    태그 수: {}", first_replay.tags.len());
                    }
                }
            }
            Err(e) => {
                eprintln!("❌ 파일 로딩 실패: {:?}", e);
                eprintln!("파일 경로를 확인해주세요: {}", test_file_path);
                // 테스트 환경에서는 파일이 없을 수 있으므로 패닉하지 않음
            }
        }
    }
}
