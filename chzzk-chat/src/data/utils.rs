use chrono::{DateTime, FixedOffset, NaiveDateTime, TimeZone};
use color_eyre::eyre::Result;

/// Replay 시간 문자열을 파싱합니다.
/// ISO 8601 형식 또는 다른 형식을 지원합니다.
/// 예: "2024-11-10T10:00:00+09:00" 또는 "2024-11-10 10:00:00"
pub fn parse_replay_time(time_str: &str) -> Result<DateTime<FixedOffset>> {
    // 먼저 ISO 8601 형식 시도
    if let Ok(dt) = DateTime::parse_from_rfc3339(time_str) {
        return Ok(dt);
    }

    // RFC 3339 형식 시도 (Z 또는 +09:00 포함)
    if let Ok(dt) = DateTime::parse_from_str(time_str, "%Y-%m-%dT%H:%M:%S%z") {
        return Ok(dt);
    }

    // NaiveDateTime으로 파싱 후 KST(+09:00) 오프셋 적용
    if let Ok(naive_dt) = NaiveDateTime::parse_from_str(time_str, "%Y-%m-%d %H:%M:%S") {
        let kst_offset = FixedOffset::east_opt(9 * 3600)
            .ok_or_else(|| color_eyre::eyre::eyre!("Invalid timezone offset"))?;
        return kst_offset
            .from_local_datetime(&naive_dt)
            .single()
            .ok_or_else(|| color_eyre::eyre::eyre!("Ambiguous local time"));
    }

    // ISO 형식 (공백 포함) 시도
    if let Ok(naive_dt) = NaiveDateTime::parse_from_str(time_str, "%Y-%m-%dT%H:%M:%S") {
        let kst_offset = FixedOffset::east_opt(9 * 3600)
            .ok_or_else(|| color_eyre::eyre::eyre!("Invalid timezone offset"))?;
        return kst_offset
            .from_local_datetime(&naive_dt)
            .single()
            .ok_or_else(|| color_eyre::eyre::eyre!("Ambiguous local time"));
    }

    Err(color_eyre::eyre::eyre!(
        "Failed to parse time string: {}",
        time_str
    ))
}
