# -*- coding: utf-8 -*-
# 全量预热课本封面到 data/covers/{id}.{jpg|png}
# 断点续传：已存在的封面直接跳过；并发 16，失败可重跑。

import json
import os
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from smartedu_download import get  # noqa: E402

COVER_DIR = "/home/z/my-project/data/covers"
CATALOG = "/home/z/my-project/data/catalog.json"
DETAIL_URL = "https://s-file-1.ykt.cbern.com.cn/zxx/ndrv2/resources/tch_material/details/{}.json"
PUBLIC_CDN = "https://r1-ndr.ykt.cbern.com.cn"


def to_public(u: str) -> str:
    """封面走公共镜像域（r1-ndr，无需鉴权）；private 域图片会 401/400。"""
    return u.replace("cs_path:${ref-path}", PUBLIC_CDN).replace("-private.ykt.cbern.com.cn", ".ykt.cbern.com.cn")


def pick_cover(data: dict) -> str | None:
    items = data.get("ti_items", [])
    for it in items:  # 优先单页缩略图 thumbnail_1
        if it.get("ti_file_flag") == "thumbnail_1" and it.get("ti_format") in ("jpg", "png"):
            u = it.get("ti_storage") or next(iter(it.get("ti_storages") or []), None)
            if u:
                return to_public(u)
    for it in items:  # 其次任意 jpg/png 项
        if it.get("ti_format") in ("jpg", "png"):
            u = it.get("ti_storage") or next(iter(it.get("ti_storages") or []), None)
            if u:
                return to_public(u)
    for it in items:  # 兜底：thumbnail 目录拼首页图 1.jpg
        if it.get("ti_file_flag") == "thumbnail" or it.get("ti_format") == "folder":
            u = it.get("ti_storage") or next(iter(it.get("ti_storages") or []), None)
            if u:
                return to_public(u).rstrip("/") + "/1.jpg"
    return None


def warm_one(book_id: str) -> str:
    for ext in ("jpg", "png"):
        if os.path.exists(os.path.join(COVER_DIR, f"{book_id}.{ext}")):
            return "skip"
    resp = get(DETAIL_URL.format(book_id))
    resp.raise_for_status()
    url = pick_cover(resp.json())
    if not url:
        return "nocover"
    img = get(url)
    img.raise_for_status()
    ctype = img.headers.get("content-type", "image/jpeg")
    ext = "png" if "png" in ctype else "jpg"
    tmp = os.path.join(COVER_DIR, f".{book_id}.tmp")
    with open(tmp, "wb") as f:
        f.write(img.content)
    os.replace(tmp, os.path.join(COVER_DIR, f"{book_id}.{ext}"))
    return "ok"


def main() -> None:
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else 0  # 每批最多新下载数量，0=不限
    os.makedirs(COVER_DIR, exist_ok=True)
    with open(CATALOG, encoding="utf-8") as f:
        ids = [b["id"] for b in json.load(f)["books"]]
    todo = [i for i in ids if not os.path.exists(os.path.join(COVER_DIR, f"{i}.jpg"))
            and not os.path.exists(os.path.join(COVER_DIR, f"{i}.png"))]
    if limit:
        todo = todo[:limit]
    print(f"待处理 {len(todo)}/{len(ids)} 本", flush=True)
    if not todo:
        print("完成: 全部已缓存", flush=True)
        return

    stats = {"ok": 0, "skip": 0, "nocover": 0, "fail": 0}
    done = 0
    with ThreadPoolExecutor(max_workers=12) as pool:
        futures = {pool.submit(warm_one, i): i for i in todo}
        for fut in as_completed(futures):
            done += 1
            try:
                stats[fut.result()] += 1
            except Exception:
                stats["fail"] += 1
            if done % 100 == 0 or done == len(todo):
                print(f"进度 {done}/{len(todo)}  {stats}", flush=True)

    print("完成:", stats)
    # 失败清单落盘，便于排查重跑
    fails = []
    for fut, bid in futures.items():
        if fut.exception() is not None:
            fails.append(bid)
    if fails:
        with open(os.path.join(COVER_DIR, "_failed.json"), "w", encoding="utf-8") as f:
            json.dump(fails, f)
        print(f"失败 {len(fails)} 个，已写入 _failed.json，可重跑本脚本补齐")


if __name__ == "__main__":
    try:
        import urllib3

        urllib3.disable_warnings()
    except Exception:
        pass
    main()
