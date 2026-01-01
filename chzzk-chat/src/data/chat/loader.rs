use color_eyre::eyre::{Context, Result};
use once_cell::sync::Lazy;
use regex::Regex;
use std::fs;
use std::io::{BufReader, BufWriter};
use std::path::{Path, PathBuf};

use crate::data::models::{ChatLog, ChatMessage};
use crate::utils;
use chrono::{FixedOffset, TimeZone};
use rayon::prelude::*;

/// 파일 이름에서 video_id를 추출하기 위한 정규표현식
static FILENAME_REGEX: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"chatLog-(\d+)\.log").expect("Invalid filename regex"));

/// 채팅 로그 한 줄을 파싱하기 위한 정규표현식
static CHAT_LINE_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\] ([^:]+): (.+) \(([^)]+)\)")
        .expect("Invalid chat line regex")
});

/// 파일 이름에서 video_id를 추출합니다.
/// `chatLog-{video_id}.log` 형식에서 video_id를 추출합니다.
pub fn extract_video_id_from_filename(filename: &str) -> Option<u64> {
    let caps = FILENAME_REGEX.captures(filename)?;
    caps.get(1)?.as_str().parse().ok()
}

/// 채팅 로그 파일 한 줄을 파싱합니다.
/// 형식: `[2025-10-24 18:03:15] 닉네임: 메시지 (user_id)`
fn parse_chat_line(line: &str) -> Option<ChatMessage> {
    let caps = CHAT_LINE_REGEX.captures(line)?;

    // 타임스탬프 파싱
    let timestamp_str = caps.get(1)?.as_str();
    // KST (UTC+9) 타임존으로 파싱
    let kst_offset = FixedOffset::east_opt(9 * 3600)?;
    let naive_dt =
        chrono::NaiveDateTime::parse_from_str(timestamp_str, "%Y-%m-%d %H:%M:%S").ok()?;
    // KST는 고정 오프셋이므로 UTC로 변환 후 오프셋 적용
    // 로그 파일의 시간은 이미 KST이므로, UTC로 변환하지 않고 그대로 사용
    let timestamp = kst_offset.from_local_datetime(&naive_dt).single()?;

    let nickname = caps.get(2)?.as_str().trim().to_string();
    let message = caps.get(3)?.as_str().trim().to_string();
    let user_id = caps.get(4)?.as_str().to_string();

    Some(ChatMessage {
        timestamp,
        nickname,
        message,
        user_id,
    })
}

/// 단일 채팅 로그 파일을 로드합니다.
pub fn load_chat_log<P: AsRef<Path>>(path: P) -> Result<ChatLog> {
    let path = path.as_ref();
    let file_content = fs::read_to_string(path)
        .with_context(|| format!("Failed to read chat log file: {:?}", path))?;

    // 파일 이름에서 video_id 추출
    let filename = path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| color_eyre::eyre::eyre!("Invalid filename: {:?}", path))?;
    let video_id = extract_video_id_from_filename(filename).ok_or_else(|| {
        color_eyre::eyre::eyre!("Failed to extract video_id from filename: {}", filename)
    })?;

    // 각 줄을 파싱
    let messages: Vec<ChatMessage> = file_content
        .lines()
        .filter_map(|line| {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                None
            } else {
                parse_chat_line(trimmed)
            }
        })
        .collect();

    Ok(ChatLog { video_id, messages })
}

/// 캐시 파일에서 ChatLog를 로드합니다.
fn load_chat_log_from_cache<P: AsRef<Path>>(cache_path: P) -> Result<ChatLog> {
    let cache_path = cache_path.as_ref();
    let file = fs::File::open(cache_path)
        .with_context(|| format!("Failed to open cache file: {:?}", cache_path))?;
    let reader = BufReader::new(file);
    ciborium::de::from_reader(reader)
        .with_context(|| format!("Failed to deserialize cache file: {:?}", cache_path))
}

/// ChatLog를 캐시 파일에 저장합니다.
fn save_chat_log_to_cache<P: AsRef<Path>>(chat_log: &ChatLog, cache_path: P) -> Result<()> {
    let cache_path = cache_path.as_ref();
    let file = fs::File::create(cache_path)
        .with_context(|| format!("Failed to create cache file: {:?}", cache_path))?;
    let writer = BufWriter::new(file);
    ciborium::ser::into_writer(chat_log, writer)
        .with_context(|| format!("Failed to serialize to cache file: {:?}", cache_path))?;
    Ok(())
}

/// chat_logs 폴더 내의 모든 채팅 로그 파일을 로드합니다.
/// 캐시 디렉토리가 제공되면 CBOR 형식으로 캐싱된 파일을 사용합니다.
pub fn load_all_chat_logs<P: AsRef<Path>>(
    chat_logs_dir: P,
    cache_dir: Option<&str>,
) -> Result<Vec<ChatLog>> {
    let chat_logs_dir = chat_logs_dir.as_ref();
    let cache_dir = cache_dir.unwrap_or("../chat_logs_cache");

    // 캐시 디렉토리 생성
    let cache_path = PathBuf::from(cache_dir);
    if !cache_path.exists() {
        fs::create_dir_all(&cache_path)
            .with_context(|| format!("Failed to create cache directory: {:?}", cache_path))?;
    }

    let entries = fs::read_dir(chat_logs_dir)
        .with_context(|| format!("Failed to read chat_logs directory: {:?}", chat_logs_dir))?;

    // chatLog-*.log 파일 경로 수집
    let log_file_paths: Vec<_> = entries
        .filter_map(|entry| {
            let entry = entry.ok()?;
            let path = entry.path();
            let filename = path.file_name()?.to_str()?;
            if filename.starts_with("chatLog-") && filename.ends_with(".log") {
                Some(path)
            } else {
                None
            }
        })
        .collect();

    let total_files = log_file_paths.len();

    // Progress bar 생성
    let pb = utils::create_progress_bar(total_files as u64, "Loading chat logs...");

    // 병렬로 파일 로드
    // ProgressBar는 내부적으로 thread-safe하므로 Arc로 감싸지 않아도 됩니다.
    let cache_dir_path = cache_path.clone();
    let mut chat_logs: Vec<ChatLog> = log_file_paths
        .par_iter()
        .filter_map(|path| {
            // 파일 이름에서 video_id 추출
            let filename = path.file_name()?.to_str()?;
            let video_id = extract_video_id_from_filename(filename)?;

            // 캐시 파일 경로 생성
            let cache_file_name = format!("chatLog-{}.log.cache", video_id);
            let cache_file_path = cache_dir_path.join(&cache_file_name);

            // 캐시 파일이 있으면 로드, 없으면 파싱 후 저장
            let chat_log = if cache_file_path.exists() {
                match load_chat_log_from_cache(&cache_file_path) {
                    Ok(log) => log,
                    Err(e) => {
                        panic!("Failed to load cache {:?}, error: {}", cache_file_path, e);
                    }
                }
            } else {
                // 캐시가 없으면 파싱 후 저장
                match load_chat_log(path) {
                    Ok(log) => {
                        // 캐시 저장 시도 (실패해도 계속 진행)
                        if let Err(save_err) = save_chat_log_to_cache(&log, &cache_file_path) {
                            eprintln!(
                                "Warning: Failed to save cache {:?}: {}",
                                cache_file_path, save_err
                            );
                        }
                        log
                    }
                    Err(e) => {
                        eprintln!("Warning: Failed to load chat log {:?}: {}", path, e);
                        pb.inc(1);
                        return None;
                    }
                }
            };

            // ProgressBar는 내부적으로 thread-safe하므로 여러 스레드에서 안전하게 호출 가능
            pb.inc(1);

            Some(chat_log)
        })
        .collect();

    pb.finish_with_message("Chat logs loaded!");

    // video_id로 정렬
    chat_logs.sort_by_key(|log| log.video_id);

    Ok(chat_logs)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_video_id_from_filename() {
        assert_eq!(
            extract_video_id_from_filename("chatLog-9902485.log"),
            Some(9902485)
        );
        assert_eq!(
            extract_video_id_from_filename("chatLog-123456.log"),
            Some(123456)
        );
        assert_eq!(extract_video_id_from_filename("invalid.log"), None);
    }

    #[test]
    fn test_parse_chat_line() {
        let line = "[2025-10-24 18:03:15] 1연지: 머타타 (f2959e925442442d133ed215d603786d)";
        let message = parse_chat_line(line);
        assert!(message.is_some());
        let msg = message.unwrap();
        assert_eq!(msg.nickname, "1연지");
        assert_eq!(msg.message, "머타타");
        assert_eq!(msg.user_id, "f2959e925442442d133ed215d603786d");
    }
}
