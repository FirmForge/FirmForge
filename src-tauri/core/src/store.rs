use crate::error::{AppError, AppResult};
use crate::models::{Build, Job, JobStatus, Settings};
use crate::net::default_mirrors;
use crate::upstream::default_ecosystem;
use std::path::{Path, PathBuf};

/// 数据目录：默认系统应用数据目录，可用环境变量覆盖（自动化测试用）。
pub fn data_dir() -> PathBuf {
    if let Ok(dir) = std::env::var("WRT_UI_DATA_DIR") {
        if !dir.trim().is_empty() {
            return PathBuf::from(dir);
        }
    }
    dirs::data_local_dir()
        .or_else(dirs::data_dir)
        .unwrap_or_else(|| PathBuf::from("."))
        .join("WRT-UI")
}

pub struct Store {
    root: PathBuf,
}

impl Clone for Store {
    fn clone(&self) -> Self {
        Self {
            root: self.root.clone(),
        }
    }
}

impl Store {
    pub fn new(root: PathBuf) -> AppResult<Self> {
        std::fs::create_dir_all(root.join("jobs"))?;
        Ok(Self { root })
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn display_root(&self) -> String {
        self.root.to_string_lossy().to_string()
    }

    fn settings_path(&self) -> PathBuf {
        self.root.join("settings.json")
    }

    fn jobs_path(&self) -> PathBuf {
        self.root.join("jobs.json")
    }

    pub fn job_dir(&self, id: &str) -> PathBuf {
        self.root.join("jobs").join(id)
    }

    pub fn log_path(&self, id: &str) -> PathBuf {
        self.job_dir(id).join("build.log")
    }

    pub fn output_dir(&self, id: &str) -> PathBuf {
        self.job_dir(id).join("output")
    }

    pub fn load_settings(&self) -> AppResult<Settings> {
        let path = self.settings_path();
        if path.exists() {
            let raw = std::fs::read_to_string(&path)?;
            match serde_json::from_str::<Settings>(&raw) {
                Ok(mut s) => {
                    s.data_dir = self.display_root();
                    if s.mirrors.is_empty() {
                        s.mirrors = default_mirrors(s.ecosystem);
                    }
                    return Ok(s);
                }
                Err(_) => {
                    // 配置损坏时备份原文件再用默认值启动，避免应用无法打开、也不丢用户数据。
                    let backup = self.root.join("settings.broken.json");
                    let _ = std::fs::rename(&path, &backup);
                }
            }
        }
        let settings = Settings {
            ecosystem: default_ecosystem(),
            mirrors: default_mirrors(default_ecosystem()),
            registry: String::new(),
            proxy: String::new(),
            theme: "light".to_string(),
            language: String::new(),
            data_dir: self.display_root(),
        };
        self.save_settings(&settings)?;
        Ok(settings)
    }

    pub fn save_settings(&self, settings: &Settings) -> AppResult<()> {
        let path = self.settings_path();
        let tmp = path.with_extension("json.tmp");
        let body = serde_json::to_vec_pretty(settings)?;
        std::fs::write(&tmp, body)?;
        std::fs::rename(&tmp, &path)?;
        Ok(())
    }

    pub fn load_jobs(&self) -> AppResult<Vec<Job>> {
        let path = self.jobs_path();
        if !path.exists() {
            return Ok(Vec::new());
        }
        let raw = std::fs::read_to_string(&path)?;
        let mut jobs: Vec<Job> = match serde_json::from_str(&raw) {
            Ok(jobs) => jobs,
            Err(_) => {
                // 记录文件损坏时先备份，再以空列表启动（避免整个应用起不来）。
                let backup = self.root.join("jobs.broken.json");
                let _ = std::fs::rename(&path, &backup);
                Vec::new()
            }
        };
        // 上次运行未完成的任务标记为中断，避免界面显示永远"进行中"。
        for job in jobs.iter_mut() {
            if !job.status.is_terminal() {
                job.status = JobStatus::Interrupted;
                job.stage = "程序中断".to_string();
                job.error = "程序退出，任务未完成".to_string();
            }
        }
        jobs.sort_by(|a, b| b.created.cmp(&a.created));
        Ok(jobs)
    }

    pub fn save_jobs(&self, jobs: &[Job]) -> AppResult<()> {
        let path = self.jobs_path();
        let tmp = path.with_extension("json.tmp");
        let body = serde_json::to_vec_pretty(jobs)?;
        std::fs::write(&tmp, body)?;
        std::fs::rename(&tmp, &path)?;
        Ok(())
    }

    pub fn ensure_job_dir(&self, id: &str) -> AppResult<PathBuf> {
        let dir = self.job_dir(id);
        std::fs::create_dir_all(&dir)?;
        Ok(dir)
    }

    pub fn append_log(&self, id: &str, text: &str) -> AppResult<()> {
        use std::io::Write;
        let dir = self.ensure_job_dir(id)?;
        let mut f = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(dir.join("build.log"))?;
        f.write_all(text.as_bytes())?;
        Ok(())
    }

    pub fn read_log(&self, id: &str, offset: usize) -> AppResult<(String, usize)> {
        let path = self.log_path(id);
        if !path.exists() {
            return Ok((String::new(), offset));
        }
        let raw = std::fs::read(&path)?;
        let total = raw.len();
        let start = offset.min(total);
        // 只回传新增部分，但窗口上限 256 KiB，避免一次拉满内存。
        let window_start = total.saturating_sub(256 << 10).max(start);
        let bytes = &raw[window_start..];
        let text = String::from_utf8_lossy(bytes).to_string();
        Ok((text, total))
    }
}

/// 产物文件名：只保留 basename，且必须是可识别的固件后缀。
pub fn is_firmware(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    const EXT: &[&str] = &[
        ".bin", ".img", ".img.gz", ".img.zst", ".itb", ".ubi", ".trx", ".chk", ".tar", ".tar.gz",
        ".tar.zst", ".iso", ".vmdk", ".vdi", ".qcow2", ".zip",
    ];
    EXT.iter().any(|e| lower.ends_with(e))
}

pub fn validate_build(b: &Build) -> AppResult<()> {
    use crate::net::{normalize_registry, valid_mirror};
    use crate::upstream::{valid_hostname, valid_part, valid_version, zone_value};
    let parts: Vec<&str> = b.target.split('/').collect();
    if !valid_version(&b.version)
        || parts.len() != 2
        || !valid_part(parts[0])
        || !valid_part(parts[1])
        || !valid_part(&b.profile)
        || !valid_mirror(&b.mirror)
    {
        return Err(AppError::Invalid("版本、平台、设备或镜像地址无效".into()));
    }
    if b.script.len() > 128 << 10 {
        return Err(AppError::Invalid("高级脚本不能超过 128 KiB".into()));
    }
    for p in b.packages.iter().chain(b.remove.iter()) {
        if !valid_part(p) || p.len() > 128 {
            return Err(AppError::Invalid(format!("软件包名称无效: {p}")));
        }
    }
    let selected: std::collections::HashSet<&String> = b.packages.iter().collect();
    for p in &b.remove {
        if selected.contains(p) {
            return Err(AppError::Invalid(format!("软件包不能同时添加和移除: {p}")));
        }
    }
    if !valid_hostname(&b.hostname) {
        return Err(AppError::Invalid("主机名无效".into()));
    }
    if !b.address.is_empty() && crate::scripts::parse_cidr(&b.address).is_none() {
        return Err(AppError::Invalid("管理地址需使用 IPv4/CIDR 格式".into()));
    }
    if !b.timezone.is_empty() && zone_value(&b.timezone).is_none() {
        return Err(AppError::Invalid("不支持此时区".into()));
    }
    normalize_registry(&b.registry)?;
    crate::scripts::validate_quick(b)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::Ecosystem;

    fn tmp_store(tag: &str) -> Store {
        let dir = std::env::temp_dir().join(format!("wrtui-store-{tag}"));
        let _ = std::fs::remove_dir_all(&dir);
        Store::new(dir).expect("创建临时数据目录")
    }

    #[test]
    fn settings_roundtrip_and_defaults() {
        let store = tmp_store("settings");
        let s = store.load_settings().unwrap();
        assert_eq!(s.ecosystem, Ecosystem::ImmortalWrt);
        assert!(!s.mirrors.is_empty());
        assert!(s.data_dir.contains("wrtui-store-settings"));
        let mut changed = s.clone();
        changed.proxy = "socks5://127.0.0.1:1080".into();
        changed.theme = "dark".into();
        changed.language = "ko".into();
        store.save_settings(&changed).unwrap();
        let loaded = store.load_settings().unwrap();
        assert_eq!(loaded.proxy, changed.proxy);
        // 主题与语言必须跟着 settings.json 落盘，重启后由前端回填。
        assert_eq!(loaded.theme, "dark");
        assert_eq!(loaded.language, "ko");
    }

    #[test]
    fn settings_without_theme_falls_back_to_light() {
        // 旧版本 settings.json 没有 theme/language 字段，读取时必须给出默认值。
        let parsed: Settings =
            serde_json::from_str(r#"{"ecosystem":"openwrt","mirrors":[],"data_dir":"x"}"#).unwrap();
        assert_eq!(parsed.theme, "light");
        assert!(parsed.language.is_empty());
    }

    #[test]
    fn jobs_are_marked_interrupted_after_crash() {
        let store = tmp_store("jobs");
        let job = Job {
            id: "aaaabbbbcccc".into(),
            status: JobStatus::Running,
            stage: "下载镜像并构建".into(),
            error: String::new(),
            created: "2026-11-17T12:00:00Z".into(),
            request: Build::default(),
            image: String::new(),
        };
        store.save_jobs(&[job]).unwrap();
        let loaded = store.load_jobs().unwrap();
        assert_eq!(loaded[0].status, JobStatus::Interrupted);
        assert_eq!(loaded[0].stage, "程序中断");
    }

    #[test]
    fn firmware_suffix_whitelist() {
        assert!(is_firmware("immortalwrt-ax3000-squashfs-sysupgrade.bin"));
        assert!(is_firmware("x86-64-generic-squashfs-combined.img.gz"));
        assert!(is_firmware("a.tar.zst"));
        assert!(!is_firmware("profiles.json"));
        assert!(!is_firmware("build.log"));
    }

    #[test]
    fn log_reader_returns_increment_only() {
        let store = tmp_store("log");
        store.append_log("id1", "line-1\n").unwrap();
        let (text, end) = store.read_log("id1", 0).unwrap();
        assert_eq!(text, "line-1\n");
        store.append_log("id1", "line-2\n").unwrap();
        let (text2, end2) = store.read_log("id1", end).unwrap();
        assert_eq!(text2, "line-2\n");
        assert!(end2 > end);
    }

    #[test]
    fn build_validation_rejects_conflicting_packages() {
        let mut b = Build {
            version: "24.10.5".into(),
            target: "mediatek/filogic".into(),
            profile: "glinet_ax3000".into(),
            mirror: "https://mirror.nju.edu.cn/immortalwrt".into(),
            hostname: "WRT-UI".into(),
            address: "192.168.2.1/24".into(),
            timezone: "Asia/Shanghai".into(),
            packages: vec!["curl".into()],
            remove: vec!["curl".into()],
            ..Build::default()
        };
        assert!(validate_build(&b).is_err());
        b.remove.clear();
        assert!(validate_build(&b).is_ok());
        b.address = "192.168.2.1".into();
        assert!(validate_build(&b).is_err(), "缺少前缀长度必须被拒绝");
    }
}
