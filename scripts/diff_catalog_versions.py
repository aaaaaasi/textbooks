#!/usr/bin/env python3
"""对比 git HEAD 版 catalog.json 与工作区版本的差集。"""
import json
import subprocess

old_raw = subprocess.run(
    ["git", "-C", "/home/z/my-project", "show", "HEAD:data/catalog.json"],
    capture_output=True, text=True, check=True,
).stdout
new_raw = open("/home/z/my-project/data/catalog.json", encoding="utf-8").read()

old = json.loads(old_raw)
new = json.loads(new_raw)

old_ids = {b["id"]: b for b in old["books"]}
new_ids = {b["id"]: b for b in new["books"]}

added = sorted(set(new_ids) - set(old_ids))
removed = sorted(set(old_ids) - set(new_ids))

print(f"旧: {len(old_ids)} 本  新: {len(new_ids)} 本")
print(f"\n新增 {len(added)} 本:")
for i in added:
    b = new_ids[i]
    print("  +", i[:8], "|", b.get("name", "?"), "|", b.get("subject", ""), b.get("grade", ""))

print(f"\n下架 {len(removed)} 本:")
for i in removed:
    b = old_ids[i]
    print("  -", i[:8], "|", b.get("name", "?"))


def count_pe(d):
    return sum(1 for b in d["books"] if "体育" in (b.get("name") or ""))


print(f"\n体育类书目: 旧 {count_pe(old)} -> 新 {count_pe(new)}")
