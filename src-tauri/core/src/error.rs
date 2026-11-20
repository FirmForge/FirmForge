use serde::ser::{Serialize, Serializer};

/// 统一错误类型：分类用于日志，序列化后只暴露可安全展示的中文消息。
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("{0}")]
    Message(String),
    #[error("网络请求失败: {0}")]
    Network(String),
    #[error("数据格式错误: {0}")]
    Format(String),
    #[error("IO 错误: {0}")]
    Io(String),
    #[error("构建环境不可用: {0}")]
    Engine(String),
    #[error("参数无效: {0}")]
    Invalid(String),
    #[error("任务不存在")]
    NotFound,
    #[error("已有构建任务正在运行")]
    Busy,
}

impl AppError {
    pub fn code(&self) -> &'static str {
        match self {
            AppError::Message(_) => "message",
            AppError::Network(_) => "network",
            AppError::Format(_) => "format",
            AppError::Io(_) => "io",
            AppError::Engine(_) => "engine",
            AppError::Invalid(_) => "invalid",
            AppError::NotFound => "not_found",
            AppError::Busy => "busy",
        }
    }
}

impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&format!("{}\u{1}{}", self.code(), self))
    }
}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        AppError::Io(e.to_string())
    }
}

impl From<reqwest::Error> for AppError {
    fn from(e: reqwest::Error) -> Self {
        if e.is_timeout() {
            AppError::Network("请求超时".into())
        } else if e.is_connect() {
            AppError::Network(format!("无法连接服务器: {e}"))
        } else {
            AppError::Network(e.to_string())
        }
    }
}

impl From<serde_json::Error> for AppError {
    fn from(e: serde_json::Error) -> Self {
        AppError::Format(e.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;
