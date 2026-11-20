use crate::runtime::{current, EngineKind};
use std::collections::HashMap;
use tokio::sync::{Mutex, RwLock};
use tokio::task::AbortHandle;
use wrt_ui_core::error::{AppError, AppResult};
use wrt_ui_core::models::{Job, JobStatus, Settings};
use wrt_ui_core::net::Fetcher;
use wrt_ui_core::store::Store;

/// 桌面应用共享状态：设置、任务清单、活动构建与下载器。
pub struct AppState {
    pub store: Store,
    engine: std::sync::RwLock<EngineKind>,
    pub hub_base: String,
    settings: RwLock<Settings>,
    fetcher: RwLock<Fetcher>,
    jobs: RwLock<Vec<Job>>,
    active: Mutex<HashMap<String, AbortHandle>>,
}

impl AppState {
    pub fn new(store: Store) -> AppResult<Self> {
        let settings = store.load_settings()?;
        let fetcher = Fetcher::new(wrt_ui_core::net::parse_proxy(&settings.proxy)?)?;
        let jobs = store.load_jobs()?;
        store.save_jobs(&jobs)?;
        Ok(Self {
            store,
            engine: std::sync::RwLock::new(current()),
            hub_base: "https://hub.docker.com".to_string(),
            settings: RwLock::new(settings),
            fetcher: RwLock::new(fetcher),
            jobs: RwLock::new(jobs),
            active: Mutex::new(HashMap::new()),
        })
    }

    pub async fn settings(&self) -> Settings {
        self.settings.read().await.clone()
    }

    pub async fn fetcher(&self) -> Fetcher {
        self.fetcher.read().await.clone()
    }

    pub async fn update_settings<F>(&self, f: F) -> AppResult<Settings>
    where
        F: FnOnce(&mut Settings) -> AppResult<()>,
    {
        let mut guard = self.settings.write().await;
        let mut next = guard.clone();
        f(&mut next)?;
        next.data_dir = self.store.display_root();
        self.store.save_settings(&next)?;
        let proxy = wrt_ui_core::net::parse_proxy(&next.proxy)?;
        let fetcher = Fetcher::new(proxy)?;
        *guard = next.clone();
        *self.fetcher.write().await = fetcher;
        Ok(next)
    }

    pub async fn jobs(&self) -> Vec<Job> {
        self.jobs.read().await.clone()
    }

    pub async fn job(&self, id: &str) -> Option<Job> {
        self.jobs.read().await.iter().find(|j| j.id == id).cloned()
    }

    pub async fn insert_job(&self, job: Job) -> AppResult<()> {
        let snapshot = {
            let mut jobs = self.jobs.write().await;
            jobs.insert(0, job);
            jobs.clone()
        };
        self.store.save_jobs(&snapshot)
    }

    /// 更新任务状态并落盘；返回快照供事件推送。
    pub async fn set_status(
        &self,
        id: &str,
        status: JobStatus,
        stage: &str,
        error: &str,
    ) -> Vec<Job> {
        let snapshot = {
            let mut jobs = self.jobs.write().await;
            if let Some(j) = jobs.iter_mut().find(|j| j.id == id) {
                j.status = status;
                j.stage = stage.to_string();
                j.error = error.to_string();
            }
            jobs.clone()
        };
        let _ = self.store.save_jobs(&snapshot);
        snapshot
    }

    pub async fn set_image(&self, id: &str, image: &str) {
        let snapshot = {
            let mut jobs = self.jobs.write().await;
            if let Some(j) = jobs.iter_mut().find(|j| j.id == id) {
                j.image = image.to_string();
            }
            jobs.clone()
        };
        let _ = self.store.save_jobs(&snapshot);
    }

    pub async fn mark_cleaned(&self, id: &str) -> AppResult<()> {
        let snapshot = {
            let mut jobs = self.jobs.write().await;
            if let Some(j) = jobs.iter_mut().find(|j| j.id == id) {
                j.status = JobStatus::Cleaned;
                j.stage = "产物已清理".to_string();
                j.error.clear();
            }
            jobs.clone()
        };
        self.store.save_jobs(&snapshot)
    }

    pub async fn register_active(&self, id: &str, handle: AbortHandle) -> AppResult<()> {
        let mut active = self.active.lock().await;
        if !active.is_empty() {
            return Err(AppError::Busy);
        }
        active.insert(id.to_string(), handle);
        Ok(())
    }

    pub async fn take_active(&self, id: &str) -> Option<AbortHandle> {
        let active = self.active.lock().await;
        let handle = active.get(id).cloned();
        handle
    }

    pub async fn drop_active(&self, id: &str) {
        self.active.lock().await.remove(id);
    }

    pub async fn has_active(&self) -> bool {
        !self.active.lock().await.is_empty()
    }

    /// 当前选用的构建引擎（探测结果会在 `environment` 命令里刷新）。
    pub fn engine(&self) -> EngineKind {
        *self.engine.read().unwrap_or_else(|e| e.into_inner())
    }

    pub fn set_engine(&self, kind: EngineKind) {
        if let Ok(mut guard) = self.engine.write() {
            *guard = kind;
        }
    }
}
