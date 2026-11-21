use crate::error::{AppError, AppResult};
use crate::models::{Build, Device, Ecosystem, PackageItem, PackagesResult, ProfileInfo, Versions};
use crate::net::{valid_mirror, Fetcher};
use regex::Regex;
use serde::Deserialize;
use serde_json::Value;
use std::collections::{BTreeMap, HashMap};
use std::sync::OnceLock;
use tokio::task::JoinSet;

pub fn valid_version_re() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| {
        Regex::new(
            r"^(23\.(?:0[5-9]|1[0-2])|(?:2[4-9]|[3-9][0-9])\.(?:0[1-9]|1[0-2]))(\.\d+|-SNAPSHOT)$",
        )
        .expect("版本正则常量有效")
    })
}

pub fn valid_version(v: &str) -> bool {
    valid_version_re().is_match(v)
}

pub fn valid_part_re() -> &'static Regex {
    static R: OnceLock<Regex> = OnceLock::new();
    R.get_or_init(|| Regex::new(r"^[A-Za-z0-9][A-Za-z0-9._+,-]*$").expect("名称正则常量有效"))
}

pub fn valid_part(v: &str) -> bool {
    v.len() <= 128 && valid_part_re().is_match(v)
}

pub fn valid_hostname(v: &str) -> bool {
    if v.is_empty() {
        return true;
    }
    v.len() <= 63
        && v.chars()
            .next()
            .map(|c| c.is_ascii_alphanumeric())
            .unwrap_or(false)
        && v.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
}

pub const ZONES: &[(&str, &str)] = &[
    ("UTC", "UTC0"),
    ("Asia/Shanghai", "CST-8"),
    ("Asia/Tokyo", "JST-9"),
    ("Asia/Hong_Kong", "HKT-8"),
];

pub fn zone_value(name: &str) -> Option<&'static str> {
    ZONES.iter().find(|(k, _)| *k == name).map(|(_, v)| *v)
}

/// 默认固件生态：ImmortalWrt（国内用户的主要上游）。
pub fn default_ecosystem() -> Ecosystem {
    Ecosystem::ImmortalWrt
}

/// 从 `.versions.json` 读取发行版本，并为每条发行版本探测真实存在的分支快照。
pub async fn versions(fetcher: &Fetcher, mirror: &str) -> AppResult<Versions> {
    if !valid_mirror(mirror) {
        return Err(AppError::Invalid("镜像地址无效或已禁止".into()));
    }
    #[derive(Deserialize)]
    struct Raw {
        #[serde(default)]
        stable_version: String,
        #[serde(default)]
        versions_list: Vec<String>,
    }
    let raw: Raw = fetcher
        .get_json(&format!("{mirror}/.versions.json"))
        .await?;
    let mut out: Vec<String> = raw
        .versions_list
        .iter()
        .filter(|v| valid_version(v))
        .cloned()
        .collect();
    out.sort_by(|a, b| b.cmp(a));

    let mut seen = std::collections::HashSet::new();
    let mut candidates = Vec::new();
    for v in &out {
        if let Some(i) = v.rfind('.') {
            let candidate = format!("{}-SNAPSHOT", &v[..i]);
            if seen.insert(candidate.clone()) {
                candidates.push(candidate);
            }
        }
    }

    let mut set: JoinSet<(usize, bool)> = JoinSet::new();
    for (i, cand) in candidates.iter().cloned().enumerate() {
        let f = fetcher.clone();
        let url = format!("{mirror}/releases/{cand}/.overview.json");
        set.spawn(async move { (i, f.exists(&url).await) });
    }
    let mut available = vec![false; candidates.len()];
    while let Some(res) = set.join_next().await {
        if let Ok((i, ok)) = res {
            available[i] = ok;
        }
    }
    for (i, cand) in candidates.into_iter().enumerate() {
        if available[i] {
            out.push(cand);
        }
    }
    Ok(Versions {
        stable: raw.stable_version,
        versions: out,
    })
}

#[derive(Deserialize)]
struct Overview {
    #[serde(default)]
    profiles: Vec<OverviewProfile>,
}

#[derive(Deserialize)]
struct OverviewProfile {
    id: String,
    #[serde(default)]
    target: String,
    #[serde(default)]
    titles: Vec<OverviewTitle>,
}

#[derive(Deserialize)]
struct OverviewTitle {
    #[serde(default)]
    vendor: String,
    #[serde(default)]
    model: String,
    #[serde(default)]
    variant: String,
    #[serde(default)]
    title: String,
}

pub async fn devices(fetcher: &Fetcher, mirror: &str, version: &str) -> AppResult<Vec<Device>> {
    if !valid_mirror(mirror) || !valid_version(version) {
        return Err(AppError::Invalid("版本或镜像地址无效".into()));
    }
    let data: Overview = fetcher
        .get_json(&format!("{mirror}/releases/{version}/.overview.json"))
        .await?;
    let mut out = Vec::with_capacity(data.profiles.len());
    for p in data.profiles {
        let mut title = p.id.clone();
        if let Some(t) = p.titles.first() {
            let joined = format!(
                "{} {} {}",
                t.vendor.trim(),
                t.model.trim(),
                t.variant.trim()
            );
            title = if t.title.trim().is_empty() {
                joined.trim().to_string()
            } else {
                t.title.trim().to_string()
            };
            title = title.split_whitespace().collect::<Vec<_>>().join(" ");
        }
        out.push(Device {
            id: p.id,
            target: p.target,
            title,
        });
    }
    out.sort_by(|a, b| a.title.cmp(&b.title));
    Ok(out)
}

#[derive(Deserialize)]
struct ProfilesDoc {
    #[serde(default)]
    default_packages: Vec<String>,
    #[serde(default)]
    profiles: BTreeMap<String, Value>,
    #[serde(default)]
    arch_packages: String,
    #[serde(default)]
    version_code: String,
    #[serde(default)]
    linux_kernel: KernelInfo,
}

#[derive(Deserialize, Default, Clone)]
struct KernelInfo {
    #[serde(default)]
    version: String,
    #[serde(default)]
    release: String,
    #[serde(default)]
    vermagic: String,
}

/// 设备资料里的 images 决定是否可以直接调整根分区。
pub fn disk_image(profile: &Value) -> bool {
    let Some(images) = profile.get("images").and_then(|v| v.as_array()) else {
        return false;
    };
    images.iter().any(|img| {
        let name = img
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_lowercase();
        let kind = img.get("type").and_then(|v| v.as_str()).unwrap_or("");
        let suffix_ok =
            name.ends_with(".img") || name.ends_with(".img.gz") || name.ends_with(".img.zst");
        suffix_ok && (kind.contains("combined") || kind == "sysupgrade")
    })
}

pub async fn profile(
    fetcher: &Fetcher,
    mirror: &str,
    version: &str,
    target: &str,
    profile_id: &str,
) -> AppResult<ProfileInfo> {
    validate_target(mirror, version, target, profile_id)?;
    let doc: ProfilesDoc = fetcher
        .get_json(&format!(
            "{mirror}/releases/{version}/targets/{target}/profiles.json"
        ))
        .await?;
    let raw = doc
        .profiles
        .get(profile_id)
        .ok_or_else(|| AppError::Invalid("该版本不包含此设备".into()))?;
    if !valid_part(&doc.arch_packages) {
        return Err(AppError::Format("设备资料缺少软件包架构".into()));
    }
    Ok(ProfileInfo {
        default_packages: doc.default_packages,
        device_packages: raw
            .get("device_packages")
            .and_then(|v| v.as_array())
            .map(|a| {
                a.iter()
                    .filter_map(|x| x.as_str().map(str::to_string))
                    .collect()
            })
            .unwrap_or_default(),
        images: raw
            .get("images")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default(),
        arch: doc.arch_packages,
        revision: doc.version_code,
        rootfs_supported: disk_image(raw),
    })
}

fn validate_target(mirror: &str, version: &str, target: &str, profile_id: &str) -> AppResult<()> {
    let parts: Vec<&str> = target.split('/').collect();
    if !valid_mirror(mirror)
        || !valid_version(version)
        || parts.len() != 2
        || !valid_part(parts[0])
        || !valid_part(parts[1])
        || !valid_part(profile_id)
    {
        return Err(AppError::Invalid("版本、平台或设备参数无效".into()));
    }
    Ok(())
}

/// 索引里没有分类字段，这里只做保守的代理工具识别（包名前缀）。
pub fn category_for(name: &str) -> &'static str {
    static R: OnceLock<Regex> = OnceLock::new();
    let re = R.get_or_init(|| {
        Regex::new(r"(?i)(proxy|passwall|shadowsocks|ssr|sing-box|singbox|v2ray|xray|hysteria|trojan|tuic|clash|mihomo|nikki|(^|-)dae(d)?($|-)|brook|redsocks|microsocks|socks)")
            .expect("代理分类正则有效")
    });
    if re.is_match(name) {
        "proxy"
    } else {
        ""
    }
}

pub fn parse_feeds(text: &str) -> Vec<String> {
    let mut seen = std::collections::HashSet::new();
    let mut out = Vec::new();
    for line in text.lines() {
        let fields: Vec<&str> = line.split_whitespace().collect();
        // 上游同时存在 `src-git` / `src-git-full` 与原生的 `src/gz` 两种写法。
        if fields.len() < 3 || !(fields[0].starts_with("src-") || fields[0].starts_with("src/")) {
            continue;
        }
        let third = fields[2];
        // `src-git*` 的第三列是 git 地址（可能带 ^commit），索引目录名要退回第二列；
        // `src/gz` 的第三列才是索引目录，末段即目录名。
        let looks_like_git = third.contains('^') || third.ends_with(".git");
        let raw = if looks_like_git {
            fields[1]
        } else {
            third
                .trim_end_matches('/')
                .rsplit('/')
                .next()
                .unwrap_or(fields[1])
        };
        // 第二列常带发行版前缀（`openwrt_base`、`immortalwrt_luci`），去掉后才是镜像目录名。
        let name = raw
            .strip_prefix("openwrt_")
            .or_else(|| raw.strip_prefix("openwrt-"))
            .or_else(|| raw.strip_prefix("immortalwrt_"))
            .or_else(|| raw.strip_prefix("immortalwrt-"))
            .unwrap_or(raw);
        let name = name.split(['?', '#']).next().unwrap_or(name);
        if !valid_part(name) || !seen.insert(name.to_string()) {
            continue;
        }
        out.push(name.to_string());
        if out.len() == 32 {
            break;
        }
    }
    out
}

/// 发布镜像通常不带 feeds.conf，读不到就用常见源列表，不当成异常。
async fn discover_feeds(fetcher: &Fetcher, url: &str) -> Vec<String> {
    let fallback = vec![
        "base".to_string(),
        "luci".to_string(),
        "packages".to_string(),
        "routing".to_string(),
        "telephony".to_string(),
    ];
    match fetcher.get_text(url, crate::net::MAX_TEXT_LIMIT).await {
        Ok(text) => {
            let feeds = parse_feeds(&text);
            if feeds.is_empty() {
                fallback
            } else {
                feeds
            }
        }
        Err(_) => fallback,
    }
}

#[derive(Deserialize, Default)]
struct PackageIndex {
    #[serde(default)]
    packages: Option<HashMap<String, String>>,
}

/// 直接读镜像上的索引，不下载任何包文件。
pub async fn packages(
    fetcher: &Fetcher,
    mirror: &str,
    version: &str,
    target: &str,
    profile_id: &str,
) -> AppResult<PackagesResult> {
    validate_target(mirror, version, target, profile_id)?;
    let doc: ProfilesDoc = fetcher
        .get_json(&format!(
            "{mirror}/releases/{version}/targets/{target}/profiles.json"
        ))
        .await?;
    if !doc.profiles.contains_key(profile_id) || !valid_part(&doc.arch_packages) {
        return Err(AppError::Invalid("无法找到设备或软件包架构".into()));
    }
    let arch = doc.arch_packages.clone();
    let feeds = discover_feeds(
        fetcher,
        &format!("{mirror}/releases/{version}/packages/{arch}/feeds.conf"),
    )
    .await;

    let mut targets: Vec<(String, String)> = feeds
        .iter()
        .map(|f| {
            (
                f.clone(),
                format!("{mirror}/releases/{version}/packages/{arch}/{f}/index.json"),
            )
        })
        .collect();
    targets.push((
        "target".to_string(),
        format!("{mirror}/releases/{version}/targets/{target}/packages/index.json"),
    ));
    if valid_part(&doc.linux_kernel.version)
        && valid_part(&doc.linux_kernel.release)
        && valid_part(&doc.linux_kernel.vermagic)
    {
        let kernel = format!(
            "{}-{}-{}",
            doc.linux_kernel.version, doc.linux_kernel.release, doc.linux_kernel.vermagic
        );
        targets.push((
            "kmods".to_string(),
            format!("{mirror}/releases/{version}/targets/{target}/kmods/{kernel}/index.json"),
        ));
    }

    let mut set: JoinSet<(String, AppResult<PackageIndex>)> = JoinSet::new();
    for (feed, url) in targets {
        let f = fetcher.clone();
        set.spawn(async move {
            let res = f.get_json::<PackageIndex>(&url).await.and_then(|idx| {
                if idx.packages.is_none() {
                    Err(AppError::Format("索引格式无效".into()))
                } else {
                    Ok(idx)
                }
            });
            (feed, res)
        });
    }

    let mut items: Vec<PackageItem> = Vec::new();
    let mut warnings: Vec<String> = Vec::new();
    while let Some(res) = set.join_next().await {
        match res {
            Ok((feed, Ok(idx))) => {
                for (name, version) in idx.packages.unwrap_or_default() {
                    if valid_part(&name) {
                        items.push(PackageItem {
                            category: category_for(&name).to_string(),
                            name,
                            version,
                            feed: feed.clone(),
                        });
                    }
                }
            }
            Ok((feed, Err(e))) => warnings.push(format!("{feed}: {e}")),
            Err(e) => warnings.push(format!("索引读取任务失败: {e}")),
        }
    }
    if items.is_empty() {
        return Err(AppError::Format(format!(
            "未能读取软件包索引：{}",
            warnings.join("；")
        )));
    }
    items.sort_by(|a, b| a.name.cmp(&b.name).then_with(|| a.feed.cmp(&b.feed)));
    warnings.sort();
    Ok(PackagesResult {
        arch,
        items,
        warnings,
    })
}

/// 构建前检查：设备存在、根分区可调、主题在该版本软件源里真实存在。
/// 内置 VM 引擎直接用 ImageBuilder 构建，不需要容器镜像摘要。
pub async fn preflight(fetcher: &Fetcher, build: &Build) -> AppResult<()> {
    validate_target(&build.mirror, &build.version, &build.target, &build.profile)?;
    let doc: ProfilesDoc = fetcher
        .get_json(&format!(
            "{}/releases/{}/targets/{}/profiles.json",
            build.mirror, build.version, build.target
        ))
        .await
        .map_err(|e| AppError::Network(format!("读取设备资料失败: {e}")))?;
    let raw = doc
        .profiles
        .get(&build.profile)
        .ok_or_else(|| AppError::Invalid(format!("所选版本与平台不包含设备 {}", build.profile)))?;
    if build.rootfs_size > 0 && !disk_image(raw) {
        return Err(AppError::Invalid(
            "此设备资料中没有可调整根分区的磁盘镜像".into(),
        ));
    }
    if !valid_part(&doc.version_code) {
        return Err(AppError::Format("设备资料未提供有效的版本修订号".into()));
    }
    if !build.theme.is_empty() {
        if !valid_part(&doc.arch_packages) {
            return Err(AppError::Format("设备资料缺少软件包架构".into()));
        }
        let idx: PackageIndex = fetcher
            .get_json(&format!(
                "{}/releases/{}/packages/{}/luci/index.json",
                build.mirror, build.version, doc.arch_packages
            ))
            .await
            .map_err(|e| AppError::Network(format!("读取主题目录失败: {e}")))?;
        let has_theme = idx
            .packages
            .as_ref()
            .map(|p| p.contains_key(&build.theme))
            .unwrap_or(false);
        if !has_theme {
            return Err(AppError::Invalid(format!(
                "当前版本的软件源没有主题 {}",
                build.theme
            )));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn build(ecosystem: Ecosystem, version: &str, target: &str) -> Build {
        Build {
            ecosystem: Some(ecosystem),
            version: version.to_string(),
            target: target.to_string(),
            ..Build::default()
        }
    }

    #[test]
    fn version_filter_accepts_release_and_snapshot() {
        assert!(valid_version("24.10.5"));
        assert!(valid_version("25.12.0"));
        assert!(valid_version("23.05.7"));
        assert!(valid_version("25.12-SNAPSHOT"));
        assert!(!valid_version("24.10"));
        assert!(!valid_version("22.03.7"));
        assert!(!valid_version("../24.10.5"));
        assert!(!valid_version("25.12.0-rc1"));
    }

    /// 真实响应体（ImmortalWrt 25.12.2 发布镜像），关键点是 `src-git-full` + ^commit。
    const REAL_FEEDS: &str = "src-git-full base https://github.com/immortalwrt/immortalwrt.git^3682a14dd5ec6382af65d7e72b5b415b5f3173a8
src-git packages https://github.com/immortalwrt/packages.git^fa25995d74a720c1c98bf6265d3dd8b4eb620d1f
src-git luci https://github.com/immortalwrt/luci.git^c38e5665e826f5e6e2ac9168e167ee368d0969d9
src-git routing https://github.com/openwrt/routing.git^48c808034414a2112cf9d5261a20a320e8d0d170
src-git telephony https://github.com/openwrt/telephony.git^c58ec5a6703966dcccb53d0919698c8aba3a9ef5";

    #[test]
    fn feeds_parser_reads_git_full_style() {
        assert_eq!(
            parse_feeds(REAL_FEEDS),
            vec!["base", "packages", "luci", "routing", "telephony"]
        );
    }

    #[test]
    fn feeds_parser_skips_noise_and_dedupes() {
        let text = "# comment\nsrc/gz openwrt-base https://example.invalid/base\nsrc/gz openwrt-base https://example.invalid/base\nsrc/gz openwrt-luci https://example.invalid/luci\ndst/gz wrong https://example.invalid/x\n";
        assert_eq!(
            parse_feeds(text),
            vec!["base".to_string(), "luci".to_string()]
        );
    }

    #[test]
    fn proxy_category_is_name_based_only() {
        assert_eq!(category_for("luci-app-passwall2"), "proxy");
        assert_eq!(category_for("sing-box"), "proxy");
        assert_eq!(category_for("mihomo-tui"), "proxy");
        assert_eq!(category_for("luci-app-filebrowser"), "");
        assert_eq!(category_for("kmod-dae4"), "");
    }

    #[test]
    fn hostname_and_zone_rules() {
        assert!(valid_hostname("FirmForge"));
        assert!(valid_hostname("my-router"));
        assert!(!valid_hostname("-bad"));
        assert!(!valid_hostname("bad host"));
        assert_eq!(zone_value("Asia/Shanghai"), Some("CST-8"));
        assert_eq!(zone_value("Europe/Berlin"), None);
    }

    #[test]
    fn disk_image_requires_combined_or_sysupgrade() {
        let ok =
            serde_json::json!({"images":[{"name":"a-squashfs-combined.img.gz","type":"combined"}]});
        assert!(disk_image(&ok));
        let no = serde_json::json!({"images":[{"name":"a-initramfs-kernel.bin","type":"kernel"}]});
        assert!(!disk_image(&no));
        assert!(!disk_image(&serde_json::json!({})));
    }
}

// ---------------------------------------------------------------- 更新检查
