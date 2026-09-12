#!/usr/bin/env python3
"""封面缩略图压缩：把 data/covers 下的大原图压成卡片可用的缩略图。
原图平均 1.2MB/张 × 1916 张 ≈ 2.3GB，磁盘撑爆；
压到最长边 480px、JPEG q80 后每张约 30-60KB，总体 ~100MB。
"""
import io
import sys
from pathlib import Path

from PIL import Image

COVER_DIR = Path("/home/z/my-project/data/covers")
MAX_SIDE = 480
QUALITY = 80

def main():
    files = [p for p in COVER_DIR.iterdir() if p.suffix.lower() in (".jpg", ".jpeg", ".png")]
    total_before = total_after = 0
    n_ok = n_skip = 0
    for i, p in enumerate(files):
        try:
            raw = p.read_bytes()
            total_before += len(raw)
            im = Image.open(io.BytesIO(raw))
            im = im.convert("RGB")
            w, h = im.size
            scale = MAX_SIDE / max(w, h)
            if scale < 1:
                im = im.resize((round(w * scale), round(h * scale)), Image.LANCZOS)
            out = io.BytesIO()
            im.save(out, "JPEG", quality=QUALITY, optimize=True, progressive=True)
            data = out.getvalue()
            # 只有确实变小才覆盖，避免异常情况下丢图
            if len(data) < len(raw):
                p.write_bytes(data)
                total_after += len(data)
                n_ok += 1
            else:
                total_after += len(raw)
                n_skip += 1
        except Exception as e:  # noqa: BLE001
            n_skip += 1
            total_after += len(raw) if 'raw' in dir() else 0
            print(f"skip {p.name}: {e}", file=sys.stderr)
        if (i + 1) % 200 == 0:
            print(f"... {i+1}/{len(files)}")
    print(f"done: {n_ok} compressed, {n_skip} skipped")
    print(f"size: {total_before/1e6:.0f}MB -> {total_after/1e6:.0f}MB")

if __name__ == "__main__":
    main()
