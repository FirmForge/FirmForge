use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use wrt_ui_core::error::{AppError, AppResult};

/// 一次构建运行时需要的全部信息。用户输入只通过环境变量与文件传递。
#[derive(Debug, Clone)]
pub struct Spec {
    pub job_id: String,
    pub image: String,
    pub revision: String,
    pub version: String,
    pub target: String,
    pub ecosystem: wrt_ui_core::models::Ecosystem,
    pub profile: String,
    pub packages: String,
    pub mirror: String,
    pub rootfs_size: u32,
    pub files: Vec<(String, String)>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EngineKind {
    Docker,
    Wslc,
    Qemu,
}

impl EngineKind {
    pub fn name(self) -> &'static str {
        match self {
            EngineKind::Docker => "Docker Engine",
            EngineKind::Wslc => "WSL Containers",
            EngineKind::Qemu => "内置 VM 引擎",
        }
    }
}

/// Windows 默认用自带 VM 引擎（零外部依赖），其余平台用 Docker Engine。
pub fn current() -> EngineKind {
    if cfg!(windows) {
        EngineKind::Qemu
    } else {
        EngineKind::Docker
    }
}

/// Windows 上优先自带 VM 引擎；引擎资源缺失时才探测 Docker，最后退回 WSL Containers。
pub async fn preferred() -> EngineKind {
    if !cfg!(windows) {
        return EngineKind::Docker;
    }
    if qemu::check().await.is_ok() {
        EngineKind::Qemu
    } else if docker::check().await.is_ok() {
        EngineKind::Docker
    } else {
        EngineKind::Wslc
    }
}

pub type LogFn = Arc<dyn Fn(&str) + Send + Sync>;

pub fn container_name(job_id: &str) -> String {
    format!("wrtkit-{job_id}")
}

fn exe(name: &str) -> String {
    if cfg!(windows) {
        format!("{name}.exe")
    } else {
        name.to_string()
    }
}

/// 执行外部程序并把 stdout/stderr 逐行喂给日志回调。
/// 只接受显式参数数组，不经过 shell，也不拼接用户输入。
async fn run_streamed(program: &str, args: &[String], log: &LogFn) -> AppResult<()> {
    let mut cmd = Command::new(program);
    cmd.args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    // GUI 应用启动控制台子进程时默认会新开一个黑窗，必须显式传 CREATE_NO_WINDOW。
    #[cfg(windows)]
    cmd.creation_flags(0x0800_0000);
    let mut child = cmd
        .spawn()
        .map_err(|e| AppError::Engine(format!("无法启动 {program}: {e}")))?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| AppError::Engine("无法读取输出".into()))?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| AppError::Engine("无法读取错误输出".into()))?;

    let log_out = log.clone();
    let log_err = log.clone();
    let out_task = tokio::spawn(async move {
        let mut lines = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            log_out(&line);
        }
    });
    let err_task = tokio::spawn(async move {
        let mut lines = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            log_err(&line);
        }
    });

    let status = child
        .wait()
        .await
        .map_err(|e| AppError::Engine(e.to_string()))?;
    let _ = out_task.await;
    let _ = err_task.await;
    if !status.success() {
        return Err(AppError::Engine(format!(
            "{program} 退出，状态码 {}",
            status.code().unwrap_or(-1)
        )));
    }
    Ok(())
}

async fn capture(program: &str, args: &[String]) -> AppResult<String> {
    let mut cmd = Command::new(program);
    cmd.args(args).stdin(Stdio::null()).kill_on_drop(true);
    #[cfg(windows)]
    cmd.creation_flags(0x0800_0000);
    let out = cmd
        .output()
        .await
        .map_err(|e| AppError::Engine(format!("无法启动 {program}: {e}")))?;
    if !out.status.success() {
        let msg = String::from_utf8_lossy(&out.stderr).trim().to_string();
        return Err(AppError::Engine(if msg.is_empty() {
            format!("{program} 执行失败")
        } else {
            msg
        }));
    }
    Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

/// WSL Containers（Windows）。
pub mod wslc {
    use super::*;

    fn binary() -> String {
        exe("wslc")
    }

    pub async fn check() -> AppResult<String> {
        match capture(&binary(), &["info".to_string()]).await {
            Ok(out) => Ok(if out.is_empty() {
                "wslc 已就绪".to_string()
            } else {
                out
            }),
            Err(e) => Err(AppError::Engine(format!("wslc 不可用: {e}"))),
        }
    }

    pub async fn run(spec: &Spec, log: &LogFn, out_dir: &Path) -> AppResult<()> {
        let bin = binary();
        let name = container_name(&spec.job_id);
        run_streamed(&bin, &["pull".to_string(), spec.image.clone()], log).await?;
        let args = vec![
            "create".to_string(),
            "--name".into(),
            name.clone(),
            "--label".into(),
            format!("io.wrtkit.job={}", spec.job_id),
            "-e".into(),
            "WRT_ROOTFS_SIZE=".to_string() + &spec.rootfs_size.to_string(),
            "-e".into(),
            format!("WRT_REVISION={}", spec.revision),
            "-e".into(),
            format!("WRT_PROFILE={}", spec.profile),
            "-e".into(),
            format!("WRT_PACKAGES={}", spec.packages),
            "-e".into(),
            format!("WRT_MIRROR={}", spec.mirror),
            spec.image.clone(),
            "sh".into(),
            "/tmp/wrtkit/run.sh".into(),
        ];
        run_streamed(&bin, &args, log).await?;

        // 先把文件树写到临时目录，再整体复制进容器。
        let staging = staging_dir()?;
        write_files(&staging, &spec.files)?;
        let src = staging.join("wrtkit").to_string_lossy().to_string();
        let dst = format!("{name}:/tmp");
        let result = async {
            run_streamed(&bin, &["container".to_string(), "cp".into(), src, dst], log).await?;
            run_streamed(&bin, &["start".to_string(), "-a".into(), name.clone()], log).await?;
            std::fs::create_dir_all(out_dir)?;
            let src_out = format!("{name}:/tmp/wrtkit-work/output/.");
            let dst_out = out_dir.to_string_lossy().to_string();
            run_streamed(
                &bin,
                &["container".to_string(), "cp".into(), src_out, dst_out],
                log,
            )
            .await
        }
        .await;
        let _ = tokio::fs::remove_dir_all(&staging).await;
        let cleanup = run_streamed(
            &bin,
            &[
                "container".to_string(),
                "rm".into(),
                "-f".into(),
                name.clone(),
            ],
            log,
        )
        .await;
        match cleanup {
            Ok(()) => log("\n构建容器已清理"),
            Err(e) => log(&format!("\n清理构建容器失败：{e}")),
        }
        result
    }

    pub async fn remove_image(image: &str) -> AppResult<()> {
        let silent: LogFn = Arc::new(|_: &str| {});
        match run_streamed(
            &binary(),
            &["image".to_string(), "remove".into(), image.to_string()],
            &silent,
        )
        .await
        {
            Ok(()) => Ok(()),
            Err(e) => {
                let text = e.to_string();
                if text.contains("WSLC_E_IMAGE_NOT_FOUND") || text.contains("not found") {
                    Ok(())
                } else {
                    Err(e)
                }
            }
        }
    }

    pub async fn remove_container(job_id: &str) -> AppResult<()> {
        let name = container_name(job_id);
        let silent: LogFn = Arc::new(|_: &str| {});
        match run_streamed(
            &binary(),
            &["container".to_string(), "rm".into(), "-f".into(), name],
            &silent,
        )
        .await
        {
            Ok(()) => Ok(()),
            Err(e) => {
                let text = e.to_string();
                if text.contains("not found") || text.contains("WSLC_E") {
                    Ok(())
                } else {
                    Err(e)
                }
            }
        }
    }
}

/// Docker Engine（Linux，或安装了 Docker CLI 的 Windows）。
pub mod docker {
    use super::*;

    pub async fn check() -> AppResult<String> {
        let version = capture(
            &exe("docker"),
            &[
                "version".to_string(),
                "--format".into(),
                "{{.Server.Version}}".into(),
            ],
        )
        .await
        .map_err(|e| AppError::Engine(format!("Docker 不可用: {e}")))?;
        Ok(format!("Docker Engine {version}"))
    }

    pub async fn run(spec: &Spec, log: &LogFn, out_dir: &Path) -> AppResult<()> {
        let bin = exe("docker");
        let name = container_name(&spec.job_id);
        run_streamed(&bin, &["pull".to_string(), spec.image.clone()], log).await?;
        let args = vec![
            "create".to_string(),
            "--name".into(),
            name.clone(),
            "--label".into(),
            format!("io.wrtkit.job={}", spec.job_id),
            "-e".into(),
            format!("WRT_ROOTFS_SIZE={}", spec.rootfs_size),
            "-e".into(),
            format!("WRT_REVISION={}", spec.revision),
            "-e".into(),
            format!("WRT_PROFILE={}", spec.profile),
            "-e".into(),
            format!("WRT_PACKAGES={}", spec.packages),
            "-e".into(),
            format!("WRT_MIRROR={}", spec.mirror),
            spec.image.clone(),
            "sh".into(),
            "/tmp/wrtkit/run.sh".into(),
        ];
        run_streamed(&bin, &args, log).await?;
        let staging = staging_dir()?;
        write_files(&staging, &spec.files)?;
        let src = staging.join("wrtkit").to_string_lossy().to_string();
        let dst = format!("{name}:/tmp");
        let result = async {
            run_streamed(&bin, &["cp".to_string(), src, dst], log).await?;
            run_streamed(&bin, &["start".to_string(), "-a".into(), name.clone()], log).await?;
            std::fs::create_dir_all(out_dir)?;
            let src_out = format!("{name}:/tmp/wrtkit-work/output/.");
            let dst_out = out_dir.to_string_lossy().to_string();
            run_streamed(&bin, &["cp".to_string(), src_out, dst_out], log).await
        }
        .await;
        let _ = tokio::fs::remove_dir_all(&staging).await;
        match run_streamed(&bin, &["rm".to_string(), "-f".into(), name], log).await {
            Ok(()) => log("\n构建容器已清理"),
            Err(e) => log(&format!("\n清理构建容器失败：{e}")),
        }
        result
    }

    pub async fn remove_image(image: &str) -> AppResult<()> {
        let silent: LogFn = Arc::new(|_| {});
        match run_streamed(
            &exe("docker"),
            &["rmi".to_string(), image.to_string()],
            &silent,
        )
        .await
        {
            Ok(()) => Ok(()),
            Err(e) => {
                let text = e.to_string();
                if text.contains("No such image") {
                    Ok(())
                } else {
                    Err(e)
                }
            }
        }
    }

    pub async fn remove_container(job_id: &str) -> AppResult<()> {
        let name = container_name(job_id);
        let silent: LogFn = Arc::new(|_| {});
        match run_streamed(
            &exe("docker"),
            &["rm".to_string(), "-f".into(), name],
            &silent,
        )
        .await
        {
            Ok(()) => Ok(()),
            Err(e) => {
                let text = e.to_string();
                if text.contains("No such container") {
                    Ok(())
                } else {
                    Err(e)
                }
            }
        }
    }
}

/// 内置 QEMU 引擎：用随包分发的 Alpine 微型 VM 跑 ImageBuilder 构建，
/// 不需要 Docker、WSL 或用户自己安装任何 Linux 环境。
pub mod qemu {
    use super::*;
    use wrt_ui_core::models::Ecosystem;

    const KERNEL: &str = "vmlinuz-virt";
    const INITRAMFS: &str = "initramfs.cpio.gz";
    const BIOS: &str = "bios-256k.bin";

    fn exe_name() -> &'static str {
        if cfg!(windows) {
            "qemu-system-x86_64.exe"
        } else {
            "qemu-system-x86_64"
        }
    }

    /// 候选目录：环境变量覆盖 > 数据目录下的 engine > 可执行文件同级 resources。
    fn candidate_dirs() -> Vec<PathBuf> {
        let mut dirs = Vec::new();
        for var in ["WRT_UI_ENGINE_DIR", "WRT_UI_QEMU_DIR"] {
            if let Ok(value) = std::env::var(var) {
                if !value.trim().is_empty() {
                    dirs.push(PathBuf::from(value));
                }
            }
        }
        if let Ok(root) = std::env::var("WRT_UI_DATA_DIR") {
            dirs.push(PathBuf::from(root).join("engine"));
        } else if let Some(base) = dirs::data_dir() {
            dirs.push(base.join("WRT-UI").join("engine"));
        }
        if let Ok(exe) = std::env::current_exe() {
            if let Some(dir) = exe.parent() {
                dirs.push(dir.join("resources").join("engine"));
                // 打包后的实际布局：resources/vm/（内核）与 resources/qemu/（QEMU）。
                dirs.push(dir.join("resources").join("qemu"));
                dirs.push(dir.join("resources"));
                // 开发构建时目标文件在 target/<profile>/ 下，源码资源在 ../../../src-tauri/resources
                if let Some(up) = dir.parent().and_then(|p| p.parent()) {
                    dirs.push(up.join("src-tauri").join("resources"));
                }
            }
        }
        // 开发机兜底：MSYS2 自带 QEMU。
        if cfg!(windows) {
            dirs.push(PathBuf::from("C:/msys64/ucrt64/bin"));
        }
        dirs
    }

    fn first_with<F>(probe: F) -> Option<PathBuf>
    where
        F: Fn(&Path) -> bool,
    {
        candidate_dirs().into_iter().find(|dir| probe(dir))
    }

    /// QEMU 可执行文件所在目录。
    pub fn qemu_dir() -> Option<PathBuf> {
        let exe = exe_name();
        first_with(|dir| dir.join(exe).is_file()).or_else(|| {
            // PATH 里的 qemu（用户自行安装的情况）
            std::env::var_os("PATH").and_then(|paths| {
                std::env::split_paths(&paths)
                    .map(|p| p.join(exe))
                    .find(|p| p.is_file())
                    .and_then(|p| p.parent().map(|d| d.to_path_buf()))
            })
        })
    }

    /// 内核 + initramfs（可能和数据目录 engine/vm 或 bundle resources/vm 放在一起）。
    pub fn vm_dir() -> Option<PathBuf> {
        first_with(|dir| {
            (dir.join(KERNEL).is_file() && dir.join(INITRAMFS).is_file())
                || (dir.join("vm").join(KERNEL).is_file()
                    && dir.join("vm").join(INITRAMFS).is_file())
        })
        .map(|dir| {
            if dir.join(KERNEL).is_file() {
                dir
            } else {
                dir.join("vm")
            }
        })
    }

    fn bios_dir(qemu: &Path, vm: &Path) -> PathBuf {
        // QEMU 需要 share/qemu 下的固件（kvmvapic.bin / linuxboot_dma.bin / bios-256k.bin），
        // 只给 bios 不够，缺文件会直接报 "Failed to open file kvmvapic.bin" 启动失败。
        let share = qemu.join("share").join("qemu");
        if share.join("kvmvapic.bin").is_file() {
            return share;
        }
        if qemu.join("kvmvapic.bin").is_file() {
            return qemu.to_path_buf();
        }
        if vm.join(BIOS).is_file() {
            return vm.to_path_buf();
        }
        share
    }

    pub async fn check() -> AppResult<String> {
        let qemu =
            qemu_dir().ok_or_else(|| AppError::Engine("内置 VM 引擎未安装：找不到 qemu".into()))?;
        let vm = vm_dir()
            .ok_or_else(|| AppError::Engine("内置 VM 引擎未安装：缺少内核或 initramfs".into()))?;
        let size = std::fs::metadata(vm.join(INITRAMFS))
            .map(|m| m.len() / 1048576)
            .unwrap_or(0);
        Ok(format!(
            "内置 VM 引擎（QEMU {}，系统镜像 {} MiB）",
            qemu.display(),
            size
        ))
    }

    /// 生成 VM 内的构建脚本：装依赖、拉 ImageBuilder、校验版本、构建、产物落共享盘。
    pub fn build_script(spec: &Spec) -> String {
        let eco = match spec.ecosystem {
            Ecosystem::ImmortalWrt => "immortalwrt",
            Ecosystem::OpenWrt => "openwrt",
        };
        let target_file = spec.target.replace('/', "-");
        let file = format!(
            "{eco}-imagebuilder-{v}-{t}.Linux-x86_64.tar.zst",
            v = spec.version,
            t = target_file
        );
        let url = format!(
            "{base}/releases/{v}/targets/{t}/{file}",
            base = spec.mirror.trim_end_matches('/'),
            v = spec.version,
            t = spec.target
        );
        let packages = crate::runtime::shell_quote_packages(&spec.packages);
        let rootfs = if spec.rootfs_size > 0 {
            format!("ROOTFS_PARTSIZE=\"{}\"", spec.rootfs_size)
        } else {
            String::new()
        };
        format!(
            r#"#!/bin/sh
set -u
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
log() {{ echo "[build] $*"; }}

log "安装构建依赖"
apk add --no-cache make tar bash coreutils findutils patch diffutils zstd gawk grep gzip unzip bzip2 wget file python3 py3-setuptools perl >/host/apk.log 2>&1
# ImageBuilder 的 Makefile 用 $(shell which xxx) 解析 SHELL，Alpine 的 busybox 没有 which，
# 缺这个垫片会报 "env: 'bash': No such file or directory" 并在 _check_profile 处失败。
printf '#!/bin/sh\ncommand -v "$1"\n' > /usr/local/bin/which && chmod +x /usr/local/bin/which
[ -x /usr/bin/nproc ] && ln -sf /usr/bin/nproc /usr/local/bin/nproc
export SHELL=/bin/bash
command -v make >/dev/null 2>&1 || {{ log "构建依赖安装失败，详见 apk.log"; exit 10; }}

mkdir -p /work && cd /work || exit 11
log "下载 ImageBuilder"
log "{url}"
wget -O ib.tar.zst "{url}" 2>&1 | tail -1
if [ ! -s ib.tar.zst ]; then log "ImageBuilder 下载失败"; exit 12; fi
log "解压 ImageBuilder"
tar --zstd -xf ib.tar.zst || {{ log "解压失败"; exit 13; }}
IB=$(ls -d /work/{eco}-imagebuilder-* 2>/dev/null | head -1)
[ -n "$IB" ] && cd "$IB" || {{ log "未找到解压目录"; exit 14; }}
# 构建期下载与固件内软件源都切到所选镜像（ImageBuilder 的源在 repositories.conf，
# 固件里的默认源在 include/version.mk 的 VERSION_REPO）。
for f in repositories.conf include/version.mk; do
  if [ -f "$f" ]; then
    sed -i "s|https://downloads.immortalwrt.org|{mirror}|g;s|https://downloads.openwrt.org|{mirror}|g;s|https://mirrors.vsean.net/openwrt|{mirror}|g" "$f"
  fi
done
log "软件源已切到 {mirror}"
if grep -q "REVISION:=" include/version.mk 2>/dev/null; then
  log "版本信息: $(grep -m1 'REVISION:=' include/version.mk)"
fi
mkdir -p /host/output
log "开始构建固件"
make image PROFILE={profile} PACKAGES={packages} FILES=/host/files BIN_DIR=/host/output {rootfs}
rc=$?
# 镜像同步会有偶发的个别包下载失败，失败就原样重试一次（opkg 会复用已下载的包）。
if [ $rc -ne 0 ]; then
  log "首次构建失败（退出码 $rc），重试一次"
  make image PROFILE={profile} PACKAGES={packages} FILES=/host/files BIN_DIR=/host/output {rootfs}
  rc=$?
fi
log "make 退出码 $rc"
ls -l /host/output || true
exit $rc
"#,
            eco = eco,
            url = url,
            profile = spec.profile,
            packages = packages,
            rootfs = rootfs,
            mirror = spec.mirror.trim_end_matches('/')
        )
    }

    pub async fn run(spec: &Spec, log: &LogFn, out_dir: &Path) -> AppResult<()> {
        let qemu =
            qemu_dir().ok_or_else(|| AppError::Engine("内置 VM 引擎未安装：找不到 qemu".into()))?;
        let vm = vm_dir()
            .ok_or_else(|| AppError::Engine("内置 VM 引擎未安装：缺少内核或 initramfs".into()))?;
        let bios = bios_dir(&qemu, &vm);

        // 共享目录：父目录下的 vm-<job>，QEMU 用 vvfat 直接映射，产物写 output/。
        let work = out_dir
            .parent()
            .map(|p| p.join(format!("vm-{}", spec.job_id)))
            .unwrap_or_else(|| out_dir.to_path_buf());
        let _ = std::fs::remove_dir_all(&work);
        std::fs::create_dir_all(&work)?;
        std::fs::create_dir_all(work.join("output"))?;

        std::fs::write(work.join("run.sh"), build_script(spec))?;
        let mut wrote = 0;
        for (name, contents) in &spec.files {
            let Some(rel) = name.strip_prefix("wrtkit/files/") else {
                continue;
            };
            if rel.contains("..") || rel.starts_with('/') {
                return Err(AppError::Invalid(format!("文件层路径无效: {name}")));
            }
            let path = work
                .join("files")
                .join(rel.replace('/', std::path::MAIN_SEPARATOR_STR));
            if let Some(parent) = path.parent() {
                std::fs::create_dir_all(parent)?;
            }
            std::fs::write(&path, contents)?;
            wrote += 1;
        }
        log(&format!(
            "内置 VM 引擎启动：{}，文件层 {wrote} 个，工作目录 {}\n",
            qemu.display(),
            work.display()
        ));

        let exe = qemu.join(exe_name());
        let mut cmd = Command::new(&exe);
        cmd.arg("-L")
            .arg(&bios)
            .arg("-kernel")
            .arg(vm.join(KERNEL))
            .arg("-initrd")
            .arg(vm.join(INITRAMFS))
            .arg("-m")
            // ImmortalWrt 的 mediatek/filogic ImageBuilder 解压后接近 1GB（tar.zst 本身 720MB），
            // 根文件系统是 ramfs，内存必须留足，否则解压阶段就被 OOM 打断。
            .arg("8192")
            .arg("-smp")
            .arg("4")
            .arg("-display")
            .arg("none")
            .arg("-serial")
            .arg("stdio")
            .arg("-no-reboot")
            .arg("-drive")
            .arg(format!(
                "file=fat:rw:{},format=raw,if=virtio",
                work.display()
            ))
            .arg("-netdev")
            .arg("user,id=n0")
            .arg("-device")
            .arg("e1000,netdev=n0")
            .arg("-append")
            .arg("console=ttyS0 panic=-1")
            .current_dir(&qemu)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);
        #[cfg(windows)]
        cmd.creation_flags(0x0800_0000);
        let mut child = cmd
            .spawn()
            .map_err(|e| AppError::Engine(format!("无法启动 qemu（{}）: {e}", exe.display())))?;

        let mut stdout = child
            .stdout
            .take()
            .ok_or_else(|| AppError::Engine("无法读取 qemu 输出".into()))?;
        let mut stderr = child
            .stderr
            .take()
            .ok_or_else(|| AppError::Engine("无法读取 qemu 错误输出".into()))?;
        let log_out = log.clone();
        let log_err = log.clone();
        let out_task = tokio::spawn(async move {
            let mut buf = Vec::new();
            let mut line = String::new();
            use tokio::io::AsyncBufReadExt;
            let mut reader = tokio::io::BufReader::new(&mut stdout).lines();
            while let Ok(Some(text)) = reader.next_line().await {
                line.clear();
                line.push_str(&text);
                buf.push(line.clone());
                log_out(&text);
            }
            buf
        });
        let err_task = tokio::spawn(async move {
            use tokio::io::AsyncBufReadExt;
            let mut reader = tokio::io::BufReader::new(&mut stderr).lines();
            while let Ok(Some(text)) = reader.next_line().await {
                if !text.trim().is_empty() {
                    log_err(&format!("[qemu] {text}"));
                }
            }
        });

        let status = child
            .wait()
            .await
            .map_err(|e| AppError::Engine(e.to_string()))?;
        let _ = out_task.await;
        let _ = err_task.await;

        let code = std::fs::read_to_string(work.join("exitcode"))
            .ok()
            .and_then(|t| t.trim().parse::<i32>().ok());
        match code {
            Some(0) => {}
            Some(other) => return Err(AppError::Engine(format!("构建脚本失败，退出码 {other}"))),
            None => {
                return Err(AppError::Engine(format!(
                    "VM 没有回写退出码（qemu 状态 {:?}）",
                    status.code()
                )))
            }
        }

        // 产物从 output/ 复制到任务产物目录。
        std::fs::create_dir_all(out_dir)?;
        let produced = work.join("output");
        if let Ok(entries) = std::fs::read_dir(&produced) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() {
                    if let Some(name) = path.file_name() {
                        std::fs::copy(&path, out_dir.join(name))?;
                    }
                }
            }
        }
        log("\n构建完成，已取出产物");
        Ok(())
    }

    pub async fn remove_image(_image: &str) -> AppResult<()> {
        // 内置引擎没有容器镜像需要清理。
        Ok(())
    }

    pub async fn remove_container(job_id: &str) -> AppResult<()> {
        // 只在数据目录里收拾该任务的 VM 工作目录。
        if let Some(base) = dirs::data_dir() {
            let dir = base.join("WRT-UI").join("jobs").join(job_id);
            let _ = std::fs::remove_dir_all(dir.join(format!("vm-{job_id}")));
        }
        Ok(())
    }
}

/// 包列表转成单个 shell 参数：整体加引号，内部不允许出现引号或换行。
pub fn shell_quote_packages(packages: &str) -> String {
    let cleaned: String = packages
        .chars()
        .filter(|c| !matches!(c, '\'' | '"' | '\n' | '\r' | '\0'))
        .collect();
    format!("'{}'", cleaned.trim())
}

pub fn staging_dir() -> AppResult<PathBuf> {
    let base = std::env::temp_dir().join(format!("wrtkit-input-{}", std::process::id()));
    std::fs::create_dir_all(&base)?;
    Ok(base)
}

/// 文件层落到磁盘；所有相对路径都在 `wrtkit/` 下，并且只接受普通文件名。
pub fn write_files(root: &Path, files: &[(String, String)]) -> AppResult<()> {
    for (name, contents) in files {
        if name.contains("..") || name.starts_with('/') {
            return Err(AppError::Invalid(format!("文件层路径无效: {name}")));
        }
        let path: PathBuf = root.join(name.replace('/', std::path::MAIN_SEPARATOR_STR));
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(&path, contents)?;
    }
    Ok(())
}

pub async fn check(kind: EngineKind) -> AppResult<String> {
    match kind {
        EngineKind::Docker => docker::check().await,
        EngineKind::Wslc => wslc::check().await,
        EngineKind::Qemu => qemu::check().await,
    }
}

pub async fn run(kind: EngineKind, spec: &Spec, log: &LogFn, out_dir: &Path) -> AppResult<()> {
    match kind {
        EngineKind::Docker => docker::run(spec, log, out_dir).await,
        EngineKind::Wslc => wslc::run(spec, log, out_dir).await,
        EngineKind::Qemu => qemu::run(spec, log, out_dir).await,
    }
}

pub async fn remove_image(kind: EngineKind, image: &str) -> AppResult<()> {
    match kind {
        EngineKind::Docker => docker::remove_image(image).await,
        EngineKind::Wslc => wslc::remove_image(image).await,
        EngineKind::Qemu => qemu::remove_image(image).await,
    }
}

pub async fn remove_job_container(kind: EngineKind, job_id: &str) -> AppResult<()> {
    match kind {
        EngineKind::Docker => docker::remove_container(job_id).await,
        EngineKind::Wslc => wslc::remove_container(job_id).await,
        EngineKind::Qemu => qemu::remove_container(job_id).await,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn container_names_are_prefixed_and_path_safe() {
        assert_eq!(container_name("abcdef123456"), "wrtkit-abcdef123456");
    }

    #[test]
    fn write_files_rejects_traversal() {
        let dir = std::env::temp_dir().join("wrtui-test-layer");
        let _ = std::fs::remove_dir_all(&dir);
        let ok = write_files(&dir, &[("wrtkit/run.sh".into(), "echo ok\n".into())]);
        assert!(ok.is_ok(), "{ok:?}");
        assert!(dir.join("wrtkit").join("run.sh").exists());
        let bad = write_files(&dir, &[("wrtkit/../../evil.sh".into(), "x".into())]);
        assert!(bad.is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn engine_selection_is_platform_specific() {
        let kind = current();
        if cfg!(windows) {
            assert_eq!(kind, EngineKind::Qemu);
        } else {
            assert_eq!(kind, EngineKind::Docker);
        }
        assert!(!kind.name().is_empty());
    }

    #[test]
    fn build_script_points_at_imagebuilder_archive() {
        let spec = Spec {
            job_id: "t".into(),
            image: String::new(),
            revision: String::new(),
            version: "24.10.5".into(),
            target: "mediatek/filogic".into(),
            ecosystem: wrt_ui_core::models::Ecosystem::ImmortalWrt,
            profile: "glinet_ax3000".into(),
            packages: "luci-ssl -dropbear".into(),
            mirror: "https://mirror.nju.edu.cn/immortalwrt".into(),
            rootfs_size: 512,
            files: Vec::new(),
        };
        let script = qemu::build_script(&spec);
        assert!(script.contains(
            "https://mirror.nju.edu.cn/immortalwrt/releases/24.10.5/targets/mediatek/filogic/immortalwrt-imagebuilder-24.10.5-mediatek-filogic.Linux-x86_64.tar.zst"
        ));
        assert!(script.contains("PROFILE=glinet_ax3000"));
        assert!(script.contains("ROOTFS_PARTSIZE=\"512\""));
        assert!(!script.contains("\\nmake image"), "构建行必须在脚本里");
    }
}
