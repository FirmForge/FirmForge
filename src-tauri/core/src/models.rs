use serde::{Deserialize, Serialize};

/// 固件生态。JSON 与前端保持一致：`immortalwrt` / `openwrt`。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum Ecosystem {
    #[serde(rename = "immortalwrt")]
    #[default]
    ImmortalWrt,
    #[serde(rename = "openwrt")]
    OpenWrt,
}

impl Ecosystem {
    pub fn image_repo(self) -> &'static str {
        match self {
            Ecosystem::ImmortalWrt => "immortalwrt/imagebuilder",
            Ecosystem::OpenWrt => "openwrt/imagebuilder",
        }
    }
}

/// 一次构建请求。密码字段只在内存中流转，持久化前会被清空。
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Build {
    #[serde(default)]
    pub ecosystem: Option<Ecosystem>,
    pub version: String,
    pub target: String,
    pub profile: String,
    pub device: String,
    #[serde(default)]
    pub packages: Vec<String>,
    #[serde(default)]
    pub remove: Vec<String>,
    pub mirror: String,
    #[serde(default)]
    pub registry: String,
    pub hostname: String,
    pub address: String,
    pub timezone: String,
    #[serde(default)]
    pub script: String,
    #[serde(default)]
    pub theme: String,
    #[serde(default)]
    pub wifi_ssid: String,
    #[serde(default)]
    pub wifi_password: String,
    #[serde(default)]
    pub root_password: String,
    #[serde(default)]
    pub ppp_username: String,
    #[serde(default)]
    pub ppp_password: String,
    #[serde(default)]
    pub rootfs_size: u32,
}

impl Build {
    /// 落库副本：清空所有凭据，并补上生态。
    pub fn persisted(&self) -> Build {
        let mut b = self.clone();
        b.root_password.clear();
        b.wifi_password.clear();
        b.ppp_password.clear();
        b.ppp_username.clear();
        b
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum JobStatus {
    Queued,
    Running,
    Success,
    Failed,
    Cancelled,
    Interrupted,
    Cleaned,
}

impl JobStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            JobStatus::Queued => "queued",
            JobStatus::Running => "running",
            JobStatus::Success => "success",
            JobStatus::Failed => "failed",
            JobStatus::Cancelled => "cancelled",
            JobStatus::Interrupted => "interrupted",
            JobStatus::Cleaned => "cleaned",
        }
    }

    pub fn is_terminal(self) -> bool {
        !matches!(self, JobStatus::Queued | JobStatus::Running)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Job {
    pub id: String,
    pub status: JobStatus,
    pub stage: String,
    #[serde(default)]
    pub error: String,
    pub created: String,
    pub request: Build,
    /// 该任务使用过的镜像引用，用于清理。
    #[serde(default)]
    pub image: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Device {
    pub id: String,
    pub target: String,
    pub title: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfileInfo {
    pub default_packages: Vec<String>,
    pub device_packages: Vec<String>,
    pub images: Vec<serde_json::Value>,
    pub arch: String,
    pub revision: String,
    pub rootfs_supported: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PackageItem {
    pub name: String,
    pub version: String,
    pub feed: String,
    pub category: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PackagesResult {
    pub arch: String,
    pub items: Vec<PackageItem>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct MirrorSource {
    pub name: String,
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    pub ecosystem: Ecosystem,
    pub mirrors: Vec<MirrorSource>,
    #[serde(default)]
    pub registry: String,
    #[serde(default)]
    pub proxy: String,
    /// 界面主题：light / dark。与语言一起保存在 settings.json，重启后由前端回填。
    #[serde(default = "default_theme")]
    pub theme: String,
    /// 界面语言代码；空表示跟随系统。
    #[serde(default)]
    pub language: String,
    pub data_dir: String,
}

fn default_theme() -> String {
    "light".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Versions {
    pub stable: String,
    pub versions: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Environment {
    pub name: String,
    pub available: bool,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Artifact {
    pub name: String,
    pub size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CleanupInfo {
    pub id: String,
    pub path: String,
    pub bytes: u64,
    pub image: String,
}

/// 前端订阅的构建进度事件。
#[derive(Debug, Clone, Serialize)]
pub struct JobEvent<'a> {
    pub id: &'a str,
    pub status: &'a str,
    pub stage: &'a str,
    pub error: &'a str,
}

/// 日志增量事件。
#[derive(Debug, Clone, Serialize)]
pub struct LogEvent<'a> {
    pub id: &'a str,
    pub text: &'a str,
}

/// 更新检查结果：只描述「是否有新版本」，不负责下载与安装。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateInfo {
    pub current: String,
    pub latest: String,
    pub available: bool,
    pub notes: String,
    pub url: String,
    pub published_at: String,
}
