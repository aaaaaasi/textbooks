#!/usr/bin/env python3
"""对比上游智慧教育平台目录分片与本地 catalog.json 的差异。

用途：回答“上游课本数据多久更新一次 / 现在有没有新数据”。
输出：上游总数、本地总数、新增 id、下架 id（各最多列出 20 条）。
"""
import json
import urllib.request

PARTS = [
    "https://s-file-1.ykt.cbern.com.cn/zxx/ndrs/resources/tch_material/part_100.json",
    "https://s-file-1.ykt.cbern.com.cn/zxx/ndrs/resources/tch_material/part_101.json",
    "https://s-file-2.ykt.cbern.com.cn/zxx/ndrs/resources/tch_material/part_102.json",
    "https://s-file-2.ykt.cbern.com.cn/zxx/ndrs/resources/tch_material/part_103.json",
]

HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
    "Origin": "https://basic.smartedu.cn",
}

CATALOG = "/home/z/my-project/data/catalog.json"


def fetch(url: str):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read().decode("utf-8"))


def main():
    upstream = {}
    for u in PARTS:
        data = fetch(u)
        for item in data:
            # 兼容 id / content_id 字段命名
            bid = item.get("id") or item.get("content_id")
            if bid:
                upstream[bid] = item
    print(f"上游分片合计条目: {len(upstream)}")

    with open(CATALOG, encoding="utf-8") as f:
        local = json.load(f)
    books = local.get("books", [])
    local_ids = {b["id"] for b in books}
    print(f"本地目录条目: {len(books)}  (catalog.updated={local.get('updated')}, total={local.get('total')})")

    added = sorted(set(upstream) - local_ids)
    removed = sorted(local_ids - set(upstream))
    print(f"\n新增 {len(added)} 本:")
    for bid in added[:20]:
        it = upstream[bid]
        print("  +", bid, "|", it.get("title", it.get("product_name", "?")))
    if len(added) > 20:
        print(f"  ... 其余 {len(added) - 20} 条略")

    print(f"\n下架 {len(removed)} 本:")
    for bid in removed[:20]:
        print("  -", bid)
    if len(removed) > 20:
        print(f"  ... 其余 {len(removed) - 20} 条略")

    if not added and not removed:
        print("\n结论：上游集合未变化（可能有字段微调但书目集合一致）。")
    else:
        print(f"\n结论：上游目录有实际变化（+{len(added)}/-{len(removed)}），本地目录已落后。")


if __name__ == "__main__":
    main()
