# -*- coding: utf-8 -*-
# 构建智慧教育平台电子教材目录缓存 data/catalog.json
# 数据源：国家中小学智慧教育平台公开目录接口（与 tchMaterial-parser 相同链路）

import json
import os
import sys
from collections import deque

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from smartedu_download import get  # noqa: E402

OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
OUT_FILE = os.path.join(OUT_DIR, "catalog.json")

DIM_NAMES = {
    "zxxxd": "stage",
    "zxxxk": "subject",
    "zxxbb": "version",
    "zxxnj": "grade",
    "zxxcc": "volume",
}


def flatten_tags(hierarchies: list) -> dict:
    """BFS 展开标签树，得到 tag_id -> {name, dim}。"""
    info = {}
    queue = deque()
    for root in hierarchies:
        for child in root.get("children", []):
            queue.append(child)
    while queue:
        node = queue.popleft()
        tid = node.get("tag_id")
        if not tid:
            continue
        info[tid] = {
            "name": node.get("tag_name", ""),
            "dim": node.get("tag_dimension_id", ""),
        }
        for h in node.get("hierarchies") or []:
            for c in h.get("children", []):
                queue.append(c)
    return info


def main() -> None:
    print("拉取标签树 ...")
    tags = get("https://s-file-1.ykt.cbern.com.cn/zxx/ndrs/tags/tch_material_tag.json").json()
    tag_info = flatten_tags(tags["hierarchies"])
    print(f"标签节点 {len(tag_info)} 个")

    print("拉取目录版本 ...")
    dv = get("https://s-file-1.ykt.cbern.com.cn/zxx/ndrs/resources/tch_material/version/data_version.json").json()
    urls = [u.strip() for u in dv["urls"].split(",") if u.strip()]
    print(f"分片文件 {len(urls)} 个")

    books = []
    seen = set()
    for i, u in enumerate(urls):
        try:
            part = get(u).json()
        except Exception as e:
            print(f"  分片 {i} 失败: {e}")
            continue
        for b in part:
            if not b.get("tag_paths") or b["id"] in seen:
                continue
            seen.add(b["id"])

            rec = {
                "id": b["id"],
                "title": (b.get("title") or b.get("name") or "").strip(),
                "stage": "", "grade": "", "subject": "", "version": "", "volume": "",
                "container": b.get("container"),
            }
            # 通过 tag_paths 解析层级字段
            for tid in b["tag_paths"][0].split("/"):
                meta = tag_info.get(tid)
                if not meta:
                    continue
                field = DIM_NAMES.get(meta["dim"])
                if field and not rec[field]:
                    rec[field] = meta["name"]
            # 兼容：从 tag_list 补充版别
            if not rec["version"]:
                for t in b.get("tag_list") or []:
                    if t.get("tag_dimension_id") == "zxxbb" and t.get("tag_name"):
                        rec["version"] = t["tag_name"]
                        break
            rec["revised"] = ("2022年版课程标准修订" in rec["title"]) or ("2022年版课程标准" in rec["title"])
            books.append(rec)
        print(f"  [{i+1}/{len(urls)}] 累计 {len(books)} 本")

    os.makedirs(OUT_DIR, exist_ok=True)
    # 原子写入：先写临时文件再 replace，失败不会留下损坏的目录文件
    tmp = OUT_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump({"updated": __import__("time").strftime("%Y-%m-%d %H:%M"), "total": len(books), "books": books},
                  f, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, OUT_FILE)
    print(f"已写入 {OUT_FILE}（{len(books)} 本，{os.path.getsize(OUT_FILE)/1048576:.1f} MB）")

    # 统计
    from collections import Counter
    stages = Counter(b["stage"] for b in books)
    rev = sum(1 for b in books if b["revised"])
    print("学段分布:", dict(stages))
    print(f"2022课标修订版: {rev} 本")


if __name__ == "__main__":
    main()
