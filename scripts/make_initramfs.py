"""把 Alpine minirootfs 打成可引导的 initramfs（cpio newc + gzip）。

用途：WRT-UI 自带的 Linux 运行环境。内核用 Alpine 的 vmlinuz-virt，根文件系统
就是这个 initramfs（内含 busybox / apk / musl），完全不需要 WSL、Docker 或宿主机
上的 Linux 工具链。

关键实现约束（Windows 上踩过的坑）：
1. 不能先 tarfile.extractall 再遍历目录 —— Windows 没有符号链接权限时 symlink 会被
   丢弃或退化成普通文件，Alpine 的 /bin/sh -> busybox 一丢，内核就
   "Failed to execute /init"。这里直接读 tar 流，按成员类型写 cpio。
2. Windows 文件系统没有 exec 位，chmod 不生效；权限位必须直接写进 cpio 头
   （普通文件一律 0755，目录 0755，符号链接 0777）。

用法：
    python scripts/make_initramfs.py <minirootfs.tar.gz> <输出.cpio.gz> [init 脚本]
"""
from __future__ import annotations

import gzip
import os
import sys
import tarfile
import time
from pathlib import Path
from typing import BinaryIO

MAGIC = b"070701"
REG = 0o100000
DIR = 0o040000
LNK = 0o120000


def _pad(buf: bytes, limit: int = 4) -> bytes:
    rest = len(buf) % limit
    return buf if rest == 0 else buf + b"\0" * (limit - rest)


def _header(ino: int, mode: int, nlink: int, size: int, name: str) -> bytes:
    name_bytes = name.encode() + b"\0"
    fields = [
        ino,
        mode,
        0,  # uid
        0,  # gid
        nlink,
        int(time.time()),
        size,
        0,  # devmajor
        0,  # devminor
        0,  # rdevmajor
        0,  # rdevminor
        len(name_bytes),
        0,  # check
    ]
    head = MAGIC + b"".join(b"%08X" % f for f in fields)
    return _pad(head + name_bytes)


class CpioWriter:
    def __init__(self, out: BinaryIO) -> None:
        self.out = out
        self.ino = 1
        self.dirs = {"."}
        self.out.write(_header(self.ino, DIR | 0o755, 2, 0, "."))
        self.ino += 1

    def dir(self, name: str) -> None:
        self.out.write(_header(self.ino, DIR | 0o755, 2, 0, name))
        self.ino += 1
        self.dirs.add(name)

    def ensure_dirs(self, path: str) -> None:
        """内核 initramfs 解包器不会自动创建父目录，缺目录条目文件会被静默丢弃。"""
        parts = path.strip("/").split("/")[:-1]
        cur = ""
        for part in parts:
            cur += "/" + part
            if cur not in self.dirs:
                self.dir(cur)

    def file(self, name: str, payload: bytes) -> None:
        self.out.write(_header(self.ino, REG | 0o755, 1, len(payload), name))
        self.out.write(_pad(payload))
        self.ino += 1

    def symlink(self, name: str, target: str) -> None:
        data = target.encode()
        self.out.write(_header(self.ino, LNK | 0o777, 1, len(data), name))
        self.out.write(_pad(data))
        self.ino += 1

    def finish(self) -> None:
        self.out.write(_header(0, 0, 1, 0, "TRAILER!!!"))


def _normalize(name: str) -> str | None:
    cleaned = name.replace("\\", "/")
    while cleaned.startswith("./"):
        cleaned = cleaned[2:]
    cleaned = cleaned.lstrip("/")
    if not cleaned or cleaned in (".", ".."):
        return None
    return "/" + cleaned


def build(
    archive: Path,
    out_path: Path,
    init_script: Path,
    modloop: Path | None = None,
    extra_dir: Path | None = None,
) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(out_path, "wb", compresslevel=9) as gz:
        writer = CpioWriter(gz)
        contents: dict[str, bytes] = {}
        members: list[tuple[str, str, str]] = []

        with tarfile.open(archive, "r:gz") as tar:
            for member in tar.getmembers():
                name = _normalize(member.name)
                if name is None:
                    continue
                if member.isdir():
                    members.append(("d", name, ""))
                elif member.issym():
                    members.append(("l", name, member.linkname))
                elif member.islnk():
                    # 硬链接：稍后复制目标内容（cpio 不共用硬链号）。
                    members.append(("h", name, _normalize(member.linkname) or ""))
                elif member.isreg():
                    body = tar.extractfile(member)
                    payload = body.read() if body is not None else b""
                    contents[name] = payload
                    members.append(("f", name, ""))

        for kind, name, target in members:
            if kind == "d":
                writer.dir(name)
            elif kind == "l":
                writer.symlink(name, target)
            elif kind == "f":
                writer.file(name, contents.get(name, b""))
            elif kind == "h":
                writer.file(name, contents.get(target, b""))

        # 我们自己的 init 最后写入，覆盖 rootfs 里可能存在的同名条目。
        writer.file("/init", init_script.read_bytes())
        # Alpine 的 virt 内核把 virtio/vfat 驱动放在 modloop（squashfs），必须一并带上。
        if modloop is not None and modloop.exists():
            writer.file("/modloop.img", modloop.read_bytes())
        # 额外的内核模块树（例如从 Debian netboot initrd 里挑出来的 virtio_pci 等）。
        if extra_dir is not None and extra_dir.exists():
            for sub in sorted(extra_dir.rglob("*")):
                if sub.is_file():
                    rel = "/wrtmods/" + str(sub.relative_to(extra_dir)).replace(os.sep, "/")
                    writer.ensure_dirs(rel)
                    writer.file(rel, sub.read_bytes())
        writer.finish()

    size_mb = out_path.stat().st_size / 1048576
    print(f"initramfs: {out_path} ({size_mb:.1f} MiB, {writer.ino} 条目)")


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__)
        return 2
    archive = Path(sys.argv[1])
    out_path = Path(sys.argv[2])
    init_script = Path(sys.argv[3]) if len(sys.argv) > 3 else Path(__file__).with_name("vm") / "init"
    modloop = Path(sys.argv[4]) if len(sys.argv) > 4 and sys.argv[4] not in ("-", "") else None
    extra_dir = Path(sys.argv[5]) if len(sys.argv) > 5 else None
    if not archive.exists():
        print(f"缺少 rootfs: {archive}")
        return 2
    if not init_script.exists():
        print(f"缺少 init 脚本: {init_script}")
        return 2
    build(archive, out_path, init_script, modloop, extra_dir)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
