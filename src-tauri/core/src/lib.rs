//! WRT-UI 业务核心。
//!
//! 这一层不依赖 Tauri / WebView / 桌面窗口，只做上游数据读取、脚本生成、
//! 配置与任务的持久化和校验。桌面层（`src-tauri`）通过 IPC 命令调用它，
//! 单元测试也在这里运行（不链接 WebView2，可在 CI/无桌面环境跑）。

pub mod error;
pub mod models;
pub mod net;
pub mod scripts;
pub mod store;
pub mod upstream;
pub mod util;
