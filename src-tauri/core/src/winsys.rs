//! Windows 专有的系统集成小工具：UWP 环回豁免名单解析。
//! 放在 core 里是为了能在没有 WebView2 依赖的情况下跑单元测试。

/// 解析 `CheckNetIsolation LoopbackExempt -s` 的输出。
///
/// 中文 Windows 的控制台输出是 GBK，且标签文字随语言变化，
/// 所以不认标签，只认最后一个“像包族名”的 token：`家族名_13位base32`。
pub fn parse_loopback(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    for line in text.lines() {
        let Some(token) = line.split_whitespace().last() else {
            continue;
        };
        let Some((family, suffix)) = token.rsplit_once('_') else {
            continue;
        };
        let ok_suffix = suffix.len() == 13
            && suffix
                .chars()
                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit());
        let ok_family = family.len() >= 3
            && family
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_');
        if ok_suffix && ok_family && !out.contains(&token.to_string()) {
            out.push(token.to_string());
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::parse_loopback;

    #[test]
    fn handles_english_and_localized_labels() {
        let en = "List of Loopback-Exempt AppContainers \n\n    Name: Microsoft.WindowsStore_8wekyb3d8bbwe\n\nDone.";
        assert_eq!(
            parse_loopback(en),
            vec!["Microsoft.WindowsStore_8wekyb3d8bbwe".to_string()]
        );

        // 中文标签（GBK 解码后为有效中文，包名仍是 ASCII）
        let zh = "\u{5217}\u{51fa}\u{6709}\u{73af}\u{56de}\u{8c41}\u{514d}\u{7684} AppContainer\n    \u{540d}\u{79f0}: Microsoft.WindowsStore_8wekyb3d8bbwe\n";
        assert_eq!(
            parse_loopback(zh),
            vec!["Microsoft.WindowsStore_8wekyb3d8bbwe".to_string()]
        );
    }

    #[test]
    fn ignores_noise_and_dedupes() {
        let text = "\u{5b8c}\u{6210}\u{3002}\n    Name: A.B_8wekyb3d8bbwe\n    Name: A.B_8wekyb3d8bbwe\n    Name: bad\n";
        assert_eq!(parse_loopback(text), vec!["A.B_8wekyb3d8bbwe".to_string()]);
        assert!(parse_loopback("").is_empty());
    }
}

/// 主机物理内存与可用内存（MiB）。拿不到时返回 None，让调用方走保守默认值。
#[cfg(windows)]
pub fn memory_mb() -> Option<(u64, u64)> {
    use windows_sys::Win32::System::SystemInformation::{GlobalMemoryStatusEx, MEMORYSTATUSEX};
    let mut status = MEMORYSTATUSEX {
        dwLength: std::mem::size_of::<MEMORYSTATUSEX>() as u32,
        ..Default::default()
    };
    // SAFETY: 结构体已按 API 要求填好 dwLength，指针在本栈帧内有效。
    let ok = unsafe { GlobalMemoryStatusEx(&mut status) };
    if ok == 0 {
        return None;
    }
    let mb = 1024 * 1024;
    Some((
        status.ullTotalPhys / mb,
        status.ullAvailPhys / mb,
    ))
}

#[cfg(not(windows))]
pub fn memory_mb() -> Option<(u64, u64)> {
    let text = std::fs::read_to_string("/proc/meminfo").ok()?;
    let get = |key: &str| -> Option<u64> {
        text.lines()
            .find(|l| l.starts_with(key))
            .and_then(|l| l.split_whitespace().nth(1))
            .and_then(|v| v.parse::<u64>().ok())
            .map(|kb| kb / 1024)
    };
    Some((get("MemTotal:")?, get("MemAvailable:")?))
}

/// 给内置虚拟机选内存：默认 8 GiB，但不能把宿主拖垮。
///
/// ImageBuilder 的根文件系统是 ramfs，解压大 target（filogic）需要 ~1 GiB 以上。
/// 可用内存不足时按“峰值 8 GiB、至少 2 GiB、给宿主留 1.5 GiB”取较小值。
pub fn vm_memory_mb() -> u64 {
    const WANT: u64 = 8192;
    const MIN: u64 = 2048;
    const HOST_RESERVE: u64 = 1536;
    let Some((total, avail)) = memory_mb() else {
        return MIN;
    };
    let by_total = total.saturating_sub(HOST_RESERVE).max(MIN);
    let by_avail = avail.saturating_sub(HOST_RESERVE).max(MIN);
    WANT.min(by_total).min(by_avail).max(MIN)
}

#[cfg(test)]
mod memory_tests {
    use super::vm_memory_mb;

    #[test]
    fn vm_memory_is_inside_sane_bounds() {
        let mb = vm_memory_mb();
        assert!((2048..=8192).contains(&mb), "{mb}");
    }
}
