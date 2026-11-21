"""把 QEMU 运行所需的最小文件集收集到 src-tauri/resources/qemu。

FirmForge 自带 VM 引擎，不依赖用户安装 Docker / WSL / QEMU。这个脚本在构建机器上执行一次，
把 qemu-system-x86_64.exe、它依赖的 MinGW 运行时 DLL、以及 BIOS 放进 resources/qemu，
随 Tauri 安装包一起分发。

用法:
    python scripts/stage-vm.py
    python scripts/stage-vm.py --qemu-dir C:/msys64/ucrt64/bin

依赖: MSYS2 的 objdump（C:/msys64/mingw64/bin/objdump.exe 或 PATH 中）。
"""
from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

# Windows 自带、绝不能随包分发的 DLL（大小写不敏感比较）。
SYSTEM_DLLS = {
    "kernel32.dll", "kernelbase.dll", "user32.dll", "advapi32.dll", "ws2_32.dll",
    "shell32.dll", "ole32.dll", "oleaut32.dll", "gdi32.dll", "gdiplus.dll",
    "comdlg32.dll", "comctl32.dll", "bcrypt.dll", "crypt32.dll", "secur32.dll",
    "iphlpapi.dll", "winmm.dll", "setupapi.dll", "psapi.dll", "dbghelp.dll",
    "uxtheme.dll", "imm32.dll", "msvcrt.dll", "ucrtbase.dll", "ntdll.dll",
    "shlwapi.dll", "version.dll", "winhttp.dll", "dwmapi.dll", "mfplat.dll",
    "opengl32.dll", "d3d9.dll", "d3d11.dll", "dxgi.dll", "wldap32.dll",
    "oleacc.dll", "propsys.dll", "rpcrt4.dll", "sechost.dll", "wtsapi32.dll",
    "netapi32.dll", "userenv.dll", "powrprof.dll", "authz.dll", "cryptbase.dll",
    "msimg32.dll", "usp10.dll", "combase.dll", "ucrtbase.dll", "msvcrt.dll",
}

OBJDUMP_CANDIDATES = [
    Path("C:/msys64/mingw64/bin/objdump.exe"),
    Path("C:/msys64/ucrt64/bin/objdump.exe"),
    Path("objdump"),
]


def find_objdump() -> str:
    for cand in OBJDUMP_CANDIDATES:
        if cand.exists() or cand.name == "objdump":
            return str(cand)
    raise SystemExit("找不到 objdump，请安装 MSYS2 的 binutils")


def imported_dlls(objdump: str, binary: Path) -> list[str]:
    out = subprocess.run(
        [objdump, "-p", str(binary)], capture_output=True, text=True, errors="replace"
    ).stdout
    names = []
    for line in out.splitlines():
        if "DLL Name:" in line:
            names.append(line.split("DLL Name:", 1)[1].strip())
    return names


def collect(objdump: str, root_exe: Path, bin_dir: Path) -> list[Path]:
    """广度优先收集 root_exe 依赖的、位于 bin_dir 的 DLL。"""
    seen: set[str] = set()
    found: list[Path] = []
    queue = [root_exe]
    while queue:
        current = queue.pop(0)
        for name in imported_dlls(objdump, current):
            key = name.lower()
            if key in seen or key in SYSTEM_DLLS:
                continue
            seen.add(key)
            candidate = bin_dir / name
            if not candidate.exists():
                # api-ms-win-* 之类属于系统 UCRT，跳过
                if key.startswith("api-ms-win"):
                    continue
                print(f"  警告: 未找到依赖 {name}（来自 {current.name}）")
                continue
            found.append(candidate)
            queue.append(candidate)
    return found


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--qemu-dir", default="C:/msys64/ucrt64/bin")
    ap.add_argument("--out", default="src-tauri/resources/qemu")
    args = ap.parse_args()

    qemu_dir = Path(args.qemu_dir)
    exe = qemu_dir / "qemu-system-x86_64.exe"
    if not exe.exists():
        raise SystemExit(f"找不到 {exe}，请先把 QEMU 装进 MSYS2（pacman -S mingw-w64-ucrt-x86_64-qemu）")

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    obj = find_objdump()

    print(f"目标目录: {out}")
    shutil.copy2(exe, out / exe.name)
    # 实测：MSYS2 这颗 GTK 版 qemu 启动时会把延迟导入的 GTK/媒体链几乎全部加载。
    # 只按 objdump 导入表递归收集会漏 DLL，结果拷出目录后连 `--version` 都挂住；
    # 直接拷 bin 目录下全部 DLL 才在任何机器上都能起（246 个文件约 270MB）。
    copied = 0
    for dll in sorted(qemu_dir.glob("*.dll")):
        shutil.copy2(dll, out / dll.name)
        copied += 1
    print(f"  已拷贝 {copied} 个 DLL")

    share = Path("C:/msys64/ucrt64/share/qemu/bios-256k.bin")
    if share.exists():
        shutil.copy2(share, out / "bios-256k.bin")
        print(f"  + bios-256k.bin ({share.stat().st_size // 1024} KiB)")

    # QEMU 还要求 share/qemu 下的固件（缺 kvmvapic.bin 会直接启动失败）。
    # 整目录 316MB，其中 ARM/RISC-V/LoongArch 的 edk2 固件用不到，按大小与名字裁掉。
    share_root = Path("C:/msys64/ucrt64/share/qemu")
    if share_root.is_dir():
        dest = out / "share" / "qemu"
        dest.mkdir(parents=True, exist_ok=True)
        keep = 0
        for item in share_root.iterdir():
            if item.is_dir():
                shutil.copytree(item, dest / item.name, dirs_exist_ok=True)
                keep += 1
                continue
            if item.name.startswith(("edk2-arm", "edk2-aarch64", "edk2-riscv", "edk2-loongarch64")):
                continue
            if item.stat().st_size > 8 * 1024 * 1024:
                continue
            shutil.copy2(item, dest / item.name)
            keep += 1
        print(f"  + share/qemu（{keep} 项，已裁剪非 x86 固件）")

    total = sum(p.stat().st_size for p in out.iterdir() if p.is_file())
    print(f"完成: {len(list(out.iterdir()))} 个文件, {total / 1048576:.1f} MiB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
