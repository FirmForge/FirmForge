mod commands;
mod runtime;
mod state;

use state::AppState;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Manager, PhysicalPosition, PhysicalSize, WindowEvent};

/// 窗口几何记忆。自己存而不是用 window-state 插件：该插件在没有历史状态时
/// 会把窗口恢复到屏幕外（实测 -25600,-25600 且 159×27），这里加了合法性校验。
#[derive(serde::Serialize, serde::Deserialize)]
struct WindowGeometry {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    maximized: bool,
}

const MIN_WIDTH: u32 = 960;
const MIN_HEIGHT: u32 = 620;

fn geometry_path(app: &tauri::AppHandle) -> std::path::PathBuf {
    app.state::<AppState>().store.root().join("window.json")
}

fn restore_geometry(app: &tauri::AppHandle) {
    let Ok(raw) = std::fs::read_to_string(geometry_path(app)) else {
        return;
    };
    let Ok(geo) = serde_json::from_str::<WindowGeometry>(&raw) else {
        return;
    };
    // 尺寸或位置明显非法时直接用配置文件里的默认窗口，不让界面跑到屏幕外。
    if geo.width < MIN_WIDTH || geo.height < MIN_HEIGHT || geo.width > 10_000 || geo.height > 10_000
    {
        return;
    }
    let in_view = app
        .available_monitors()
        .unwrap_or_default()
        .iter()
        .any(|m| {
            let p = m.position();
            let s = m.size();
            let right = geo.x.saturating_add(geo.width as i32);
            let bottom = geo.y.saturating_add(geo.height as i32);
            geo.x >= p.x - 40
                && geo.y >= p.y - 40
                && right <= p.x + s.width as i32 + 40
                && bottom <= p.y + s.height as i32 + 40
        });
    if !in_view {
        return;
    }
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_size(PhysicalSize::new(geo.width, geo.height));
        let _ = window.set_position(PhysicalPosition::new(geo.x, geo.y));
        if geo.maximized {
            let _ = window.maximize();
        }
    }
}

fn save_geometry(app: &tauri::AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    if window.is_minimized().unwrap_or(false) {
        return;
    }
    let (Ok(size), Ok(pos)) = (window.outer_size(), window.outer_position()) else {
        return;
    };
    if size.width < MIN_WIDTH || size.height < MIN_HEIGHT {
        return;
    }
    let geo = WindowGeometry {
        x: pos.x,
        y: pos.y,
        width: size.width,
        height: size.height,
        maximized: window.is_maximized().unwrap_or(false),
    };
    let path = geometry_path(app);
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    if let Ok(body) = serde_json::to_vec(&geo) {
        let _ = std::fs::write(path, body);
    }
}

/// 唤起主窗口：托盘左键与第二实例启动都走这里。
fn focus_main(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn open_data_dir(app: &tauri::AppHandle) {
    let dir = app.state::<AppState>().store.root().to_path_buf();
    let _ = std::process::Command::new("explorer").arg(dir).spawn();
}

fn build_tray(app: &tauri::AppHandle) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "显示主窗口", true, None::<&str>)?;
    let data = MenuItem::with_id(app, "data", "打开数据目录", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &data, &quit])?;

    let mut builder = TrayIconBuilder::with_id("wrt-ui-tray")
        .tooltip("WRT-UI 固件构建器")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => focus_main(app),
            "data" => open_data_dir(app),
            "quit" => {
                save_geometry(app);
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                focus_main(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon().cloned() {
        builder = builder.icon(icon);
    }
    builder.build(app)?;
    Ok(())
}

pub fn run() {
    let dir = wrt_ui_core::store::data_dir();
    let store = match wrt_ui_core::store::Store::new(dir) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("无法初始化数据目录: {e}");
            return;
        }
    };
    let state = match AppState::new(store) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("无法初始化应用状态: {e}");
            return;
        }
    };

    let result = tauri::Builder::default()
        // Tauri 3：webview 运行时改为显式选择，不选会在启动时报 RuntimeNotConfigured
        .runtime(tauri_runtime_wry::Wry::default())
        // 单实例必须最先注册：重复启动时唤起已有窗口后自己退出。
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            focus_main(app);
        }))
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            commands::environment,
            commands::list_versions,
            commands::list_devices,
            commands::get_profile,
            commands::list_packages,
            commands::get_settings,
            commands::save_mirrors,
            commands::save_proxy,
            commands::save_prefs,
            commands::switch_ecosystem,
            commands::create_job,
            commands::list_jobs,
            commands::get_job,
            commands::cancel_job,
            commands::read_log,
            commands::list_artifacts,
            commands::save_artifact,
            commands::cleanup_preview,
            commands::cleanup_job,
            commands::open_data_dir,
            commands::set_data_dir,
            commands::open_output_dir,
            commands::open_url,
            commands::open_devtools,
            commands::uwp_loopback_list,
            commands::uwp_loopback_add,
        ])
        .setup(|app| {
            build_tray(app.handle())?;
            restore_geometry(app.handle());
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
            }
            Ok(())
        })
        // 关闭按钮 = 收进托盘；真正退出只走托盘菜单。
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    save_geometry(window.app_handle());
                    let _ = window.hide();
                }
            }
        })
        .run(tauri::generate_context!());

    if let Err(e) = result {
        eprintln!("应用启动失败: {e}");
    }
}
