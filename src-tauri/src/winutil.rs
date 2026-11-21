//! Windows 进程创建辅助：确保子进程不会弹出控制台窗口。
//!
//! FirmForge 是 GUI 应用，任何 `Command::spawn()` 若未显式指定
//! `CREATE_NO_WINDOW`，Windows 都会为新进程分配一个控制台并闪一下。

use std::process::Command;

/// 给命令加上 `CREATE_NO_WINDOW`，避免控制台窗口闪屏。
pub fn no_window(cmd: &mut Command) -> &mut Command {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

/// 枚举顶层窗口标题里是否已经有 WebView2 的 DevTools 窗口。
///
/// Tauri 的 `open_devtools()` 在某些 WebView2 版本上会静默失败，
/// 这时需要回退到「带 `--auto-open-devtools-for-tabs` 重启」。
#[cfg(windows)]
pub fn has_devtools_window() -> bool {
    use windows_sys::Win32::Foundation::{HWND, LPARAM, TRUE};
    use windows_sys::core::BOOL;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetWindowTextLengthW, GetWindowTextW,
    };

    unsafe extern "system" fn cb(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let found = lparam as *mut bool;
        let len = unsafe { GetWindowTextLengthW(hwnd) };
        if len > 0 {
            let mut buf = vec![0u16; len as usize + 1];
            let n = unsafe { GetWindowTextW(hwnd, buf.as_mut_ptr(), buf.len() as i32) };
            if n > 0 {
                let title = String::from_utf16_lossy(&buf[..n as usize]).to_lowercase();
                if title.contains("devtools") {
                    unsafe { *found = true };
                    return 0; // 找到就停止枚举
                }
            }
        }
        TRUE
    }

    let mut found = false;
    unsafe {
        EnumWindows(Some(cb), &mut found as *mut bool as LPARAM);
    }
    found
}

#[cfg(not(windows))]
pub fn has_devtools_window() -> bool {
    false
}
