use std::time::{SystemTime, UNIX_EPOCH};

fn splitmix64(mut z: u64) -> u64 {
    z = z.wrapping_add(0x9E37_79B9_7F4A_7C15);
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    z ^ (z >> 31)
}

/// 24 位十六进制任务 ID（12 + 12），由纳秒时间与 splitmix 混合，无需额外随机源。
pub fn new_job_id() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let lo = splitmix64(nanos as u64);
    let hi = splitmix64((nanos >> 64) as u64 ^ 0x5DEE_CE66_D1CE_2B2C);
    format!(
        "{:012x}{:012x}",
        lo & 0xffff_ffff_ffff,
        hi & 0xffff_ffff_ffff
    )
}

/// 当前 UTC 时间的 ISO8601 字符串（秒精度，便于排序与展示）。
pub fn iso_now() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    iso_from_secs(secs)
}

/// 公历换算（Howard Hinnant 的 civil_from_days），避免引入时间库。
pub fn iso_from_secs(secs: i64) -> String {
    let days = secs.div_euclid(86_400);
    let rem = secs.rem_euclid(86_400);
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    format!(
        "{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}Z",
        rem / 3600,
        (rem % 3600) / 60,
        rem % 60
    )
}

/// 版本比较：只比数字段（最多三段），忽略 `v` 前缀、预发布与构建后缀。
/// 解析失败时返回 false —— 宁可漏报更新，也不要把用户导向错误版本。
pub fn version_greater(remote: &str, current: &str) -> bool {
    fn segments(version: &str) -> Vec<u64> {
        let trimmed = version.trim();
        let trimmed = trimmed
            .strip_prefix('v')
            .or_else(|| trimmed.strip_prefix('V'))
            .unwrap_or(trimmed);
        let head = trimmed.split(['-', '+']).next().unwrap_or("");
        head.split('.')
            .take(3)
            .map(|part| part.parse::<u64>().unwrap_or(0))
            .collect()
    }

    let remote = segments(remote);
    let current = segments(current);
    if remote.is_empty() || current.is_empty() {
        return false;
    }
    for index in 0..3 {
        let a = remote.get(index).copied().unwrap_or(0);
        let b = current.get(index).copied().unwrap_or(0);
        if a != b {
            return a > b;
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn job_ids_are_24_hex_and_unique() {
        let a = new_job_id();
        let b = new_job_id();
        assert_eq!(a.len(), 24);
        assert!(a.chars().all(|c| c.is_ascii_hexdigit()));
        assert_ne!(a, b);
    }

    #[test]
    fn iso_timestamp_formats_known_epoch() {
        assert_eq!(iso_from_secs(0), "1970-01-01T00:00:00Z");
        assert_eq!(iso_from_secs(1_700_000_000), "2023-11-14T22:13:20Z");
        assert_eq!(iso_from_secs(86_399), "1970-01-01T23:59:59Z");
    }

    #[test]
    fn version_compare_handles_tags_and_suffixes() {
        assert!(version_greater("v1.0.1", "1.0.0"));
        assert!(version_greater("1.2", "1.1.9"));
        assert!(version_greater("2.0.0-beta.1", "1.9.9"));
        assert!(!version_greater("1.0.0", "1.0.0"));
        assert!(!version_greater("v1.0.0", "1.0.1"));
        assert!(!version_greater("", "1.0.0"));
        assert!(!version_greater("nightly", "1.0.0"));
    }
}
