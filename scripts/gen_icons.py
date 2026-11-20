"""从唯一品牌源图生成 Tauri 需要的 Windows 图标资源。

源图：https://avatars.githubusercontent.com/u/2528830?s=200&v=4
输出：src-tauri/icons/{32x32,128x128,128x128@2x}.png 与 icon.ico
不重新绘制、不替换品牌视觉，只做等比缩放。
"""
from pathlib import Path

from PIL import Image

SRC = Path(__file__).resolve().parent.parent / "assets" / "wrt-ui-logo.png"
OUT = Path(__file__).resolve().parent.parent / "src-tauri" / "icons"

PNG_SIZES = {"32x32.png": 32, "128x128.png": 128, "128x128@2x.png": 256, "icon.png": 512}
ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"缺少品牌源图: {SRC}")
    OUT.mkdir(parents=True, exist_ok=True)
    base = Image.open(SRC).convert("RGBA")

    for name, size in PNG_SIZES.items():
        resized = base.resize((size, size), Image.Resampling.LANCZOS)
        resized.save(OUT / name, format="PNG")

    base.resize((256, 256), Image.Resampling.LANCZOS).save(
        OUT / "icon.ico",
        format="ICO",
        sizes=[(s, s) for s in ICO_SIZES],
    )
    print("图标已生成:", ", ".join(sorted(p.name for p in OUT.iterdir())))


if __name__ == "__main__":
    main()
