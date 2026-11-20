use crate::runtime;
use crate::state::AppState;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::mpsc;
use wrt_ui_core::error::{AppError, AppResult};
use wrt_ui_core::models::{
    Artifact, Build, CleanupInfo, Device, Environment, Job, JobEvent, JobStatus, LogEvent,
    PackagesResult, ProfileInfo, Settings, UpdateInfo, Versions,
};
use wrt_ui_core::net::{normalize_registry, parse_proxy, valid_mirror};
use wrt_ui_core::scripts;
use wrt_ui_core::store::{is_firmware, validate_build};
use wrt_ui_core::util::{iso_now, new_job_id};

// ---------------------------------------------------------------- 只读目录查询

#[tauri::command(rename_all = "snake_case")]
pub async fn environment(state: State<'_, AppState>) -> Result<Environment, AppError> {
    // Windows 上优先 Docker，再退回 WSL Containers；探测结果写回状态供构建复用。
    let kind = runtime::preferred().await;
    state.set_engine(kind);
    let timeout = Duration::from_secs(8);
    match tokio::time::timeout(timeout, runtime::check(kind)).await {
        Ok(Ok(message)) => Ok(Environment {
            name: kind.name().to_string(),
            available: true,
            message,
        }),
        Ok(Err(e)) => Ok(Environment {
            name: kind.name().to_string(),
            available: false,
            message: e.to_string(),
        }),
        Err(_) => Ok(Environment {
            name: kind.name().to_string(),
            available: false,
            message: "环境检查超时".to_string(),
        }),
    }
}

#[tauri::command(rename_all = "snake_case")]
pub async fn list_versions(
    state: State<'_, AppState>,
    mirror: String,
) -> Result<Versions, AppError> {
    let fetcher = state.fetcher().await;
    wrt_ui_core::upstream::versions(&fetcher, mirror.trim_end_matches('/')).await
}

#[tauri::command(rename_all = "snake_case")]
pub async fn list_devices(
    state: State<'_, AppState>,
    mirror: String,
    version: String,
) -> Result<Vec<Device>, AppError> {
    let fetcher = state.fetcher().await;
    wrt_ui_core::upstream::devices(&fetcher, mirror.trim_end_matches('/'), &version).await
}

#[tauri::command(rename_all = "snake_case")]
pub async fn get_profile(
    state: State<'_, AppState>,
    mirror: String,
    version: String,
    target: String,
    profile: String,
) -> Result<ProfileInfo, AppError> {
    let fetcher = state.fetcher().await;
    wrt_ui_core::upstream::profile(
        &fetcher,
        mirror.trim_end_matches('/'),
        &version,
        &target,
        &profile,
    )
    .await
}

#[tauri::command(rename_all = "snake_case")]
pub async fn list_packages(
    state: State<'_, AppState>,
    mirror: String,
    version: String,
    target: String,
    profile: String,
) -> Result<PackagesResult, AppError> {
    let fetcher = state.fetcher().await;
    wrt_ui_core::upstream::packages(
        &fetcher,
        mirror.trim_end_matches('/'),
        &version,
        &target,
        &profile,
    )
    .await
}

// ---------------------------------------------------------------- 设置

#[tauri::command(rename_all = "snake_case")]
pub async fn get_settings(state: State<'_, AppState>) -> Result<Settings, AppError> {
    Ok(state.settings().await)
}

#[derive(Deserialize)]
pub struct MirrorInput {
    pub name: String,
    pub url: String,
}

#[tauri::command(rename_all = "snake_case")]
pub async fn save_mirrors(
    state: State<'_, AppState>,
    mirrors: Vec<MirrorInput>,
) -> Result<Settings, AppError> {
    if mirrors.is_empty() || mirrors.len() > 32 {
        return Err(AppError::Invalid("请填写 1 到 32 个软件源".into()));
    }
    let mut normalized = Vec::with_capacity(mirrors.len());
    let mut seen = std::collections::HashSet::new();
    for item in mirrors {
        let name = item.name.trim().to_string();
        let url = item.url.trim().trim_end_matches('/').to_string();
        if name.is_empty() || name.chars().count() > 80 || !valid_mirror(&url) {
            return Err(AppError::Invalid(
                "请填写有效的软件源名称和 HTTPS 地址".into(),
            ));
        }
        if !seen.insert(url.clone()) {
            return Err(AppError::Invalid("软件源地址不能重复".into()));
        }
        normalized.push(wrt_ui_core::models::MirrorSource { name, url });
    }
    state
        .update_settings(|s| {
            s.mirrors = normalized;
            Ok(())
        })
        .await
}

#[tauri::command(rename_all = "snake_case")]
pub async fn save_registry(
    state: State<'_, AppState>,
    registry: String,
) -> Result<Settings, AppError> {
    let registry = normalize_registry(&registry)?;
    state
        .update_settings(|s| {
            s.registry = registry;
            Ok(())
        })
        .await
}

#[tauri::command(rename_all = "snake_case")]
pub async fn save_proxy(state: State<'_, AppState>, proxy: String) -> Result<Settings, AppError> {
    parse_proxy(&proxy)?;
    state
        .update_settings(|s| {
            s.proxy = proxy.trim().to_string();
            Ok(())
        })
        .await
}

/// 保存界面偏好（主题、语言）。只改这两个字段，避免覆盖其他设置。
#[tauri::command(rename_all = "snake_case")]
pub async fn save_prefs(
    state: State<'_, AppState>,
    theme: Option<String>,
    language: Option<String>,
) -> Result<Settings, AppError> {
    let theme = match theme {
        Some(value) => {
            let value = value.trim().to_string();
            if value != "light" && value != "dark" {
                return Err(AppError::Invalid("未知的主题".into()));
            }
            Some(value)
        }
        None => None,
    };
    let language = match language {
        Some(value) => {
            let value = value.trim().to_string();
            const LANGS: [&str; 10] = [
                "zh-Hans", "zh-Hant", "en", "ja", "ko", "de", "fr", "es", "it", "ru",
            ];
            if !value.is_empty() && !LANGS.contains(&value.as_str()) {
                return Err(AppError::Invalid("未知的语言".into()));
            }
            Some(value)
        }
        None => None,
    };
    state
        .update_settings(|s| {
            if let Some(theme) = theme.clone() {
                s.theme = theme;
            }
            if let Some(language) = language.clone() {
                s.language = language;
            }
            Ok(())
        })
        .await
}

#[tauri::command(rename_all = "snake_case")]
pub async fn switch_ecosystem(
    state: State<'_, AppState>,
    ecosystem: wrt_ui_core::models::Ecosystem,
) -> Result<Settings, AppError> {
    if state.has_active().await {
        return Err(AppError::Busy);
    }
    state
        .update_settings(|s| {
            if s.ecosystem != ecosystem {
                s.ecosystem = ecosystem;
                s.mirrors = wrt_ui_core::net::default_mirrors(ecosystem);
            }
            Ok(())
        })
        .await
}

// ---------------------------------------------------------------- 任务

#[tauri::command(rename_all = "snake_case")]
pub async fn create_job(
    app: AppHandle,
    state: State<'_, AppState>,
    mut build: Build,
) -> Result<Job, AppError> {
    let settings = state.settings().await;
    build.ecosystem = Some(settings.ecosystem);
    build.registry = settings.registry.clone();
    build.mirror = build.mirror.trim_end_matches('/').to_string();
    validate_build(&build)?;

    let id = new_job_id();
    let job = Job {
        id: id.clone(),
        status: JobStatus::Queued,
        stage: "等待构建".to_string(),
        error: String::new(),
        created: iso_now(),
        request: build.persisted(),
        image: String::new(),
    };
    state.insert_job(job.clone()).await?;

    let app_for_task = app.clone();
    let stored = build.clone();
    let handle = tokio::spawn(async move {
        let state = app_for_task.state::<AppState>();
        run_job(&app_for_task, state.inner(), id.clone(), stored).await;
    });
    match state.register_active(&job.id, handle.abort_handle()).await {
        Ok(()) => Ok(job),
        Err(e) => {
            handle.abort();
            Err(e)
        }
    }
}

#[tauri::command(rename_all = "snake_case")]
pub async fn list_jobs(state: State<'_, AppState>) -> Result<Vec<Job>, AppError> {
    let mut jobs = state.jobs().await;
    for job in &mut jobs {
        // 列表不携带用户脚本内容，避免把长脚本塞进每一行。
        job.request.script.clear();
        job.request.root_password.clear();
        job.request.wifi_password.clear();
        job.request.ppp_password.clear();
    }
    Ok(jobs)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn get_job(state: State<'_, AppState>, id: String) -> Result<Job, AppError> {
    state.job(&id).await.ok_or(AppError::NotFound)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn cancel_job(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<(), AppError> {
    let handle = state
        .take_active(&id)
        .await
        .ok_or_else(|| AppError::Invalid("任务未运行".into()))?;
    handle.abort();
    state.drop_active(&id).await;
    let jobs = state
        .set_status(&id, JobStatus::Cancelled, "已取消", "")
        .await;
    emit_job(&app, &id, &jobs);
    let kind = state.engine();
    let store = state.store.clone();
    let _ = runtime::remove_job_container(kind, &id).await;
    let _ = store.ensure_job_dir(&id);
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn read_log(
    state: State<'_, AppState>,
    id: String,
    offset: usize,
) -> Result<LogChunk, AppError> {
    let store = state.store.clone();
    let (text, next) = tokio::task::spawn_blocking(move || store.read_log(&id, offset))
        .await
        .map_err(|e| AppError::Io(e.to_string()))??;
    Ok(LogChunk { text, next })
}

#[derive(Serialize, Deserialize)]
pub struct LogChunk {
    pub text: String,
    pub next: usize,
}

#[tauri::command(rename_all = "snake_case")]
pub async fn list_artifacts(
    state: State<'_, AppState>,
    id: String,
) -> Result<Vec<Artifact>, AppError> {
    let job = state.job(&id).await.ok_or(AppError::NotFound)?;
    if job.status != JobStatus::Success {
        return Err(AppError::Invalid("构建产物不可用".into()));
    }
    let store = state.store.clone();
    let dir = store.output_dir(&id);
    let mut out = Vec::new();
    let mut reader = tokio::fs::read_dir(&dir)
        .await
        .map_err(|_| AppError::Invalid("构建产物不可用".into()))?;
    while let Some(entry) = reader
        .next_entry()
        .await
        .map_err(|e| AppError::Io(e.to_string()))?
    {
        let meta = entry
            .metadata()
            .await
            .map_err(|e| AppError::Io(e.to_string()))?;
        if meta.is_file() {
            out.push(Artifact {
                name: entry.file_name().to_string_lossy().to_string(),
                size: meta.len(),
            });
        }
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(out)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn save_artifact(
    state: State<'_, AppState>,
    id: String,
    name: String,
) -> Result<String, AppError> {
    if name
        != Path::new(&name)
            .file_name()
            .map(|v| v.to_string_lossy().to_string())
            .unwrap_or_default()
        || name.contains(['/', '\\'])
        || !is_firmware(&name)
    {
        return Err(AppError::Invalid("文件名无效".into()));
    }
    let job = state.job(&id).await.ok_or(AppError::NotFound)?;
    if job.status != JobStatus::Success {
        return Err(AppError::Invalid("构建产物不可用".into()));
    }
    let store = state.store.clone();
    let src = store.output_dir(&id).join(&name);
    if !src.exists() {
        return Err(AppError::NotFound);
    }
    let target_dir = dirs::download_dir()
        .unwrap_or_else(|| store.root().to_path_buf())
        .join("WRT-UI");
    tokio::fs::create_dir_all(&target_dir)
        .await
        .map_err(|e| AppError::Io(e.to_string()))?;
    let mut dst = target_dir.join(&name);
    let mut index = 1;
    while dst.exists() {
        let stem = Path::new(&name)
            .file_stem()
            .map(|v| v.to_string_lossy().to_string())
            .unwrap_or_else(|| "firmware".into());
        let ext = Path::new(&name)
            .extension()
            .map(|v| format!(".{}", v.to_string_lossy()))
            .unwrap_or_default();
        dst = target_dir.join(format!("{stem}({index}){ext}"));
        index += 1;
        if index > 99 {
            return Err(AppError::Io("目标目录中同名文件过多".into()));
        }
    }
    let dst_for_copy = dst.clone();
    tokio::task::spawn_blocking(move || std::fs::copy(&src, &dst_for_copy))
        .await
        .map_err(|e| AppError::Io(e.to_string()))?
        .map_err(|e| AppError::Io(e.to_string()))?;
    Ok(dst.to_string_lossy().to_string())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn cleanup_preview(
    state: State<'_, AppState>,
    id: String,
) -> Result<CleanupInfo, AppError> {
    let job = state.job(&id).await.ok_or(AppError::NotFound)?;
    if job.status == JobStatus::Cleaned {
        return Err(AppError::Invalid("该任务产物已清理".into()));
    }
    let store = state.store.clone();
    let dir = store.output_dir(&id);
    let bytes = dir_size(&dir).await;
    Ok(CleanupInfo {
        id,
        path: dir.to_string_lossy().to_string(),
        bytes,
        image: job.image,
    })
}

#[tauri::command(rename_all = "snake_case")]
pub async fn cleanup_job(state: State<'_, AppState>, id: String) -> Result<u64, AppError> {
    if state.has_active().await {
        return Err(AppError::Busy);
    }
    let job = state.job(&id).await.ok_or(AppError::NotFound)?;
    if job.status == JobStatus::Cleaned {
        return Err(AppError::Invalid("该任务产物已清理".into()));
    }
    let store = state.store.clone();
    let dir = store.output_dir(&id);
    let bytes = dir_size(&dir).await;
    tokio::fs::remove_dir_all(&dir).await.ok();
    let kind = state.engine();
    let mut failures = Vec::new();
    if !job.image.is_empty() {
        if let Err(e) = runtime::remove_job_container(kind, &id).await {
            failures.push(format!("删除容器失败: {e}"));
        }
        if let Err(e) = runtime::remove_image(kind, &job.image).await {
            failures.push(format!("删除镜像失败: {e}"));
        }
    }
    if !failures.is_empty() {
        return Err(AppError::Engine(failures.join("；")));
    }
    state.mark_cleaned(&id).await?;
    Ok(bytes)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn open_data_dir(state: State<'_, AppState>) -> Result<String, AppError> {
    let dir = state.store.root().to_path_buf();
    let path = dir.to_string_lossy().to_string();
    let program = if cfg!(windows) {
        "explorer"
    } else {
        "xdg-open"
    };
    std::process::Command::new(program)
        .arg(&path)
        .spawn()
        .map_err(|e| AppError::Io(e.to_string()))?;
    Ok(path)
}

async fn dir_size(dir: &Path) -> u64 {
    let mut total = 0u64;
    let mut stack = vec![dir.to_path_buf()];
    while let Some(path) = stack.pop() {
        let Ok(reader) = std::fs::read_dir(&path) else {
            continue;
        };
        for entry in reader.flatten() {
            let Ok(meta) = entry.metadata() else { continue };
            if meta.is_dir() {
                stack.push(entry.path());
            } else {
                total += meta.len();
            }
        }
    }
    total
}

fn emit_job(app: &AppHandle, id: &str, jobs: &[Job]) {
    if let Some(job) = jobs.iter().find(|j| j.id == id) {
        let _ = app.emit(
            "job-update",
            JobEvent {
                id: &job.id,
                status: job.status.as_str(),
                stage: &job.stage,
                error: &job.error,
            },
        );
    }
}

/// 系统通知：构建结束后无论成败都给用户一个桌面提示。
fn notify_build(app: &AppHandle, success: bool, detail: &str) {
    use tauri_plugin_notification::NotificationExt;
    let title = if success {
        "WRT-UI 构建完成"
    } else {
        "WRT-UI 构建失败"
    };
    let body = if detail.len() > 200 {
        format!("{}…", &detail[..200])
    } else {
        detail.to_string()
    };
    let _ = app.notification().builder().title(title).body(body).show();
}

// ---------------------------------------------------------------- 构建执行

async fn set_state(
    app: &AppHandle,
    state: &AppState,
    id: &str,
    status: JobStatus,
    stage: &str,
    error: &str,
) {
    let jobs = state.set_status(id, status, stage, error).await;
    emit_job(app, id, &jobs);
}

async fn run_job(app: &AppHandle, state: &AppState, id: String, build: Build) {
    let result = run_job_inner(app, state, &id, &build).await;
    state.drop_active(&id).await;
    match result {
        Ok(()) => {
            set_state(app, state, &id, JobStatus::Success, "构建完成", "").await;
            notify_build(app, true, "固件构建完成，可在结果页保存产物");
        }
        Err(e) => {
            let status = if matches!(&e, AppError::Message(m) if m == "任务已取消") {
                JobStatus::Cancelled
            } else {
                JobStatus::Failed
            };
            let message = e.to_string();
            let stage = if status == JobStatus::Cancelled {
                "已取消"
            } else {
                "构建未完成"
            };
            set_state(app, state, &id, status, stage, &message).await;
            notify_build(app, false, &message);
        }
    }
}

async fn run_job_inner(
    app: &AppHandle,
    state: &AppState,
    id: &str,
    build: &Build,
) -> AppResult<()> {
    let store = state.store.clone();
    store.ensure_job_dir(id)?;
    store.append_log(id, "开始构建\n")?;

    set_state(app, state, id, JobStatus::Running, "检查构建环境", "").await;
    let kind = state.engine();
    runtime::check(kind)
        .await
        .map_err(|e| AppError::Engine(e.to_string()))?;

    set_state(app, state, id, JobStatus::Running, "检查设备和构建镜像", "").await;
    // 内置 VM 引擎直接拉 ImageBuilder，不需要容器镜像与 digest 钉住。
    let (image, revision) = if matches!(kind, runtime::EngineKind::Qemu) {
        store.append_log(
            id,
            "内置 VM 引擎：直接使用 ImageBuilder 构建，跳过容器镜像校验\n",
        )?;
        (String::new(), String::new())
    } else {
        let fetcher = state.fetcher().await;
        let (image, revision) =
            wrt_ui_core::upstream::preflight(&fetcher, build, &state.hub_base).await?;
        let image = wrt_ui_core::net::image_reference(&build.registry, &image);
        store.append_log(id, &format!("已确认构建镜像: {image}\n"))?;
        state.set_image(id, &image).await;
        (image, revision)
    };

    set_state(app, state, id, JobStatus::Running, "下载镜像并构建", "").await;
    let mut packages = build.packages.clone();
    for p in &build.remove {
        packages.push(format!("-{p}"));
    }
    packages.sort();
    if !build.theme.is_empty() {
        packages.push(build.theme.clone());
    }
    if !build.ppp_username.is_empty() {
        packages.push("ppp-mod-pppoe".to_string());
    }
    let files = scripts::files_for(build)?;

    let (tx, mut rx) = mpsc::unbounded_channel::<String>();
    let log: runtime::LogFn = Arc::new(move |line| {
        let _ = tx.send(format!("{line}\n"));
    });

    let flusher_store = store.clone();
    let flusher_app = app.clone();
    let flusher_id = id.to_string();
    let flusher = tokio::spawn(async move {
        let mut buffer = String::new();
        let mut ticker = tokio::time::interval(Duration::from_millis(150));
        loop {
            tokio::select! {
                maybe = rx.recv() => {
                    match maybe {
                        Some(line) => buffer.push_str(&line),
                        None => break,
                    }
                }
                _ = ticker.tick() => {
                    if !buffer.is_empty() {
                        let _ = flusher_store.append_log(&flusher_id, &buffer);
                        let _ = flusher_app.emit("job-log", LogEvent { id: &flusher_id, text: &buffer });
                        buffer.clear();
                    }
                }
            }
        }
        if !buffer.is_empty() {
            let _ = flusher_store.append_log(&flusher_id, &buffer);
            let _ = flusher_app.emit(
                "job-log",
                LogEvent {
                    id: &flusher_id,
                    text: &buffer,
                },
            );
        }
    });

    let spec = runtime::Spec {
        job_id: id.to_string(),
        image: image.clone(),
        revision,
        version: build.version.clone(),
        target: build.target.clone(),
        ecosystem: build.ecosystem.unwrap_or_default(),
        profile: build.profile.clone(),
        packages: packages.join(" "),
        mirror: build.mirror.clone(),
        rootfs_size: build.rootfs_size,
        files,
    };
    let out_dir = store.output_dir(id);
    let run_result = runtime::run(kind, &spec, &log, &out_dir).await;
    drop(log);
    let _ = flusher.await;
    run_result?;

    let mut found = false;
    if let Ok(mut reader) = tokio::fs::read_dir(&out_dir).await {
        while let Some(entry) = reader.next_entry().await.unwrap_or(None) {
            let path = entry.path();
            if path.is_file() {
                let name = path
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_string();
                if is_firmware(&name) {
                    found = true;
                    break;
                }
            }
        }
    }
    if !found {
        return Err(AppError::Invalid(
            "构建结束但没有找到可识别的固件文件".into(),
        ));
    }
    Ok(())
}

// ---------------------------------------------------------------- 更新检查

/// 当前应用版本，供界面在检查失败时仍能显示版本号。
#[tauri::command(rename_all = "snake_case")]
pub fn app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// 检查 GitHub 上的最新发布。版本号由 cargo 包版本注入，避免前后端各写一份。
#[tauri::command(rename_all = "snake_case")]
pub async fn check_update(state: State<'_, AppState>) -> Result<UpdateInfo, AppError> {
    let fetcher = state.fetcher().await;
    wrt_ui_core::upstream::latest_release(&fetcher, env!("CARGO_PKG_VERSION")).await
}

/// 打开发布页。只接受本仓库的 releases 链接，避免把 IPC 变成任意 URL 打开器。
#[tauri::command(rename_all = "snake_case")]
pub async fn open_release_page(url: String) -> Result<(), AppError> {
    const PREFIX: &str = "https://github.com/MinimaxFlora/WRT-UI/releases";
    // 只允许纯 ASCII 的 https 链接，避免把控制字符或引号带进 ShellExecute。
    let clean = url.is_ascii() && !url.bytes().any(|b| b <= b' ' || b == b'"' || b == 0x5c);
    if !url.starts_with(PREFIX) || !clean {
        return Err(AppError::Invalid("仅允许打开 WRT-UI 的发布页".into()));
    }
    #[cfg(windows)]
    {
        // rundll32 走 ShellExecute，等价于双击链接；不经 cmd，无需引号转义。
        std::process::Command::new("rundll32")
            .args(["url.dll,FileProtocolHandler", &url])
            .spawn()
            .map(|_| ())
            .map_err(|e| AppError::Message(format!("无法打开发布页: {e}")))
    }
    #[cfg(not(windows))]
    {
        let _ = url;
        Err(AppError::Message("当前平台不支持自动打开浏览器".into()))
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn settings_command_surface_keeps_ecosystem_consistent() {
        // 生态切换会重置镜像列表，避免 OpenWrt 使用 immortalwrt 源。
        let mirrors = wrt_ui_core::net::default_mirrors(wrt_ui_core::models::Ecosystem::OpenWrt);
        assert!(mirrors.iter().all(|m| !m.url.contains("immortalwrt")));
    }
}
