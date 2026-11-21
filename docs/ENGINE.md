# 内置 VM 构建引擎（QEMU + Alpine）

FirmForge 在 Windows 上默认不依赖任何外部 Linux 环境：安装包自带一套极小的 Linux（Alpine 内核 +
initramfs）和一个 QEMU，构建固件时由应用启动虚拟机，在 VM 里跑官方的 ImageBuilder。

## 组件

| 组件 | 位置（安装后） | 大小 | 说明 |
| --- | --- | --- | --- |
| QEMU | `resources/qemu/qemu-system-x86_64.exe` + `*.dll` | ~271 MiB | MSYS2 的 GTK 构建；启动时会把延迟导入的整条 GTK/媒体链加载进来，所以 DLL 必须成套 |
| QEMU 固件 | `resources/qemu/share/qemu/` | ~28 MiB | `bios-256k.bin`、`kvmvapic.bin`、`linuxboot_dma.bin` 等（已裁掉 ARM/RISC-V/LoongArch 的 edk2） |
| Linux 内核 | `resources/vm/vmlinuz-virt` | 12 MiB | Alpine v3.21 `netboot` 的 virt 内核（6.12） |
| 根文件系统 | `resources/vm/initramfs.cpio.gz` | 3.6 MiB | Alpine minirootfs → cpio newc + gzip，含本项目的 `/init` |
| 驱动模块 | 同上（initramfs 内 `/wrtmods/kernel`） | 0.7 MiB | `virtio_blk`、`e1000`、`fat`/`vfat`/`nls_*`（从 modloop 里取） |

## 一次构建的数据流

1. Rust 在 `%LOCALAPPDATA%\FirmForge\jobs\<id>\vm-<id>\` 下生成 `run.sh`（构建脚本）和 `files/`（FILES 层）。
2. 启动 QEMU：`-kernel vmlinuz-virt -initrd initramfs.cpio.gz -m 4096 -smp 4 -display none
   -serial stdio -drive file=fat:rw:<该目录>,format=raw,if=virtio -netdev user,id=n0
   -device e1000,netdev=n0 -append "console=ttyS0 panic=-1"`。
3. VM 的 `/init`：挂 proc/sysfs/devtmpfs → `insmod` 驱动 → 挂 `/dev/vda1` 到 `/host` →
   配 slirp 网络（10.0.2.15/24，gw 10.0.2.2，DNS 10.0.2.3）→ 执行 `/host/run.sh`。
4. `run.sh`：`apk add` 构建依赖（含 GNU 工具链与 perl）→ 补 `which` 垫片 → 下载 ImageBuilder
   `tar.zst` → 把 `repositories.conf` 与 `include/version.mk` 的源切到所选镜像 → `make image
   PROFILE=... PACKAGES=... FILES=/host/files BIN_DIR=/host/output`（失败自动重试一次）。
5. VM 结束前把退出码写 `/host/exitcode` 并 `poweroff -f`；Rust 读退出码，把 `output/` 里的固件
   复制到任务的产物目录。

## 资源定位顺序

`FIRMFORGE_ENGINE_DIR` / `FIRMFORGE_QEMU_DIR` → 数据目录 `engine/` → 可执行文件同级 `resources/`
→ `PATH` 里的 qemu（自行安装）。

## 已知限制

- QEMU 用纯软件模拟（TCG），没有启用 WHPX 加速：构建耗时约为原生 2–5 倍，x86/64 最小固件实测
  约 15 分钟（下载 ImageBuilder 与软件包占大头）。
- 引擎二进制体积大（约 300 MiB），安装包因此约 120 MiB；如果后续换成 SDL-only 的 QEMU 构建可以显著缩小。
- VM 内存上限 4 GiB（ramfs 根文件系统要在内存里解压 ImageBuilder，约 500 MiB）。

## 复现构建资源

```bash
# 1. 拉内核 / minirootfs / modloop（Alpine v3.21，国内镜像同路径）
# 2. 生成 initramfs（含 /init 与驱动模块）
python scripts/make_initramfs.py <alpine-minirootfs.tar.gz> resources/vm/initramfs.cpio.gz \
    scripts/vm/init - <从 modloop 解出的模块目录>
# 3. 收集 QEMU 可执行文件、全部 DLL 与裁剪后的 share/qemu
python scripts/stage-vm.py
```
