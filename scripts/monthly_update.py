# -*- coding: utf-8 -*-
"""月度目录更新 + 缓存清理（由 src/lib/scheduler.ts 每月空闲时段自动触发，也可手动执行）

流程：
  1. 文件锁防并发（data/catalog_update.lock）
  2. 子进程执行 build_catalog.py 全量重建目录（原子写入 catalog.json）
  3. 清空 PDF 磁盘缓存 data/pdfs（教材可能被新版本替换，避免旧 PDF 长期占盘）
  4. 裁剪孤儿封面 data/covers（新目录中已不存在的 book id）
  5. 写 data/last_update.json 记录本次结果，供调度器判断下次到期时间

用法：python3 scripts/monthly_update.py
"""

import fcntl
import json
import os
import shutil
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(ROOT, "data")
LOCK_FILE = os.path.join(DATA_DIR, "catalog_update.lock")
LAST_UPDATE = os.path.join(DATA_DIR, "last_update.json")
BUILD_SCRIPT = os.path.join(ROOT, "scripts", "build_catalog.py")


def log(msg: str) -> None:
    print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {msg}", flush=True)


def main() -> int:
    os.makedirs(DATA_DIR, exist_ok=True)

    # 文件锁：独占打开，调度器与手动执行互斥
    lock_fp = open(LOCK_FILE, "w")
    try:
        fcntl.flock(lock_fp, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        log("已有更新在进行中，本次跳过")
        return 0

    result = {
        "started_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "ok": False,
        "total": 0,
        "revised": 0,
        "cleared_pdfs": 0,
        "pruned_covers": 0,
    }

    try:
        # ---- 1. 全量重建目录 ----
        log("开始全量更新目录 ...")
        r = subprocess.run(
            [sys.executable, BUILD_SCRIPT],
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=30 * 60,
        )
        sys.stdout.write(r.stdout)
        if r.returncode != 0:
            sys.stderr.write(r.stderr)
            log(f"目录构建失败，退出码 {r.returncode}；保留旧目录不动")
            return 1

        catalog_path = os.path.join(DATA_DIR, "catalog.json")
        with open(catalog_path, encoding="utf-8") as f:
            catalog = json.load(f)
        books = catalog.get("books", [])
        ids = {b.get("id") for b in books if b.get("id")}
        result["total"] = catalog.get("total", len(ids))
        result["revised"] = sum(1 for b in books if b.get("revised"))
        log(f"新目录 {result['total']} 本（2022修订版 {result['revised']} 本）")

        # ---- 2. 清空 PDF 磁盘缓存 ----
        pdfs_dir = os.path.join(DATA_DIR, "pdfs")
        if os.path.isdir(pdfs_dir):
            for name in os.listdir(pdfs_dir):
                p = os.path.join(pdfs_dir, name)
                try:
                    os.remove(p)
                    result["cleared_pdfs"] += 1
                except OSError:
                    shutil.rmtree(p, ignore_errors=True)
        log(f"PDF 缓存已清空（{result['cleared_pdfs']} 个文件，下次预览/下载自动重建）")

        # ---- 3. 裁剪孤儿封面（新目录已不存在的 id）----
        covers_dir = os.path.join(DATA_DIR, "covers")
        if os.path.isdir(covers_dir):
            for name in os.listdir(covers_dir):
                stem = name.rsplit(".", 1)[0]
                if stem not in ids:
                    try:
                        os.remove(os.path.join(covers_dir, name))
                        result["pruned_covers"] += 1
                    except OSError:
                        pass
        log(f"裁剪孤儿封面 {result['pruned_covers']} 张")

        result["ok"] = True
        return 0
    finally:
        result["finished_at"] = time.strftime("%Y-%m-%d %H:%M:%S")
        tmp = LAST_UPDATE + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
        os.replace(tmp, LAST_UPDATE)
        log(f"更新{'成功' if result['ok'] else '失败'}：{json.dumps(result, ensure_ascii=False)}")
        fcntl.flock(lock_fp, fcntl.LOCK_UN)
        lock_fp.close()
        try:
            os.remove(LOCK_FILE)
        except OSError:
            pass


if __name__ == "__main__":
    sys.exit(main())
