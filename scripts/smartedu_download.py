# -*- coding: utf-8 -*-
# 基于开源项目 tchMaterial-parser (https://github.com/happycola233/tchMaterial-parser) 的
# 解析逻辑，从国家中小学智慧教育平台下载电子教材 PDF。
# 用法:
#   python smartedu_download.py search 关键词...
#   python smartedu_download.py info <contentId>
#   python smartedu_download.py download <contentId> <输出文件名>

import json
import re
import sys
import time
from urllib.parse import unquote, urlsplit

import requests

SESSION = requests.Session()
SESSION.trust_env = False

BASE_HEADERS = {
    "Authorization": "Bearer 0",
    "Origin": "https://basic.smartedu.cn",
    "Referer": "https://basic.smartedu.cn/",
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
    "X-ND-AUTH": 'MAC id="0",nonce="0",mac="0"',
}

NONCE_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"


def generate_nonce(diff: int = 0) -> str:
    import math
    import random
    suffix = "".join(NONCE_ALPHABET[math.ceil(35 * random.random())] for _ in range(8))
    return f"{int(time.time() * 1000) + int(diff)}:{suffix}"


def signature_string(url: str, method: str, nonce: str) -> str:
    parts = urlsplit(url)
    relative = unquote(parts.path) + (f"?{parts.query}" if parts.query else "")
    return f"{nonce}\n{method.upper()}\n{relative}\n{parts.hostname or ''}\n"


def build_nd_auth(url: str, method: str = "GET", access_token: str = "",
                  mac_key: str | None = None, diff: int = 0) -> str:
    token_id = access_token or "0"
    if not mac_key:
        return f'MAC id="{token_id}",nonce="0",mac="0"'
    import base64
    import hashlib
    import hmac
    nonce = generate_nonce(diff)
    mac = base64.b64encode(
        hmac.new(mac_key.encode("utf-8"), signature_string(url, method, nonce).encode("utf-8"), hashlib.sha256).digest()
    ).decode("ascii")
    return f'MAC id="{token_id}",nonce="{nonce}",mac="{mac}"'


def request_headers(url: str, method: str = "GET") -> dict:
    # 匿名模式：占位 X-ND-AUTH（平台上公开的电子课本通常可匿名下载）
    result = dict(BASE_HEADERS)
    return result


def get(url: str, **kw) -> requests.Response:
    return SESSION.get(url, headers=request_headers(url), timeout=60, **kw)


def fetch_book_list() -> list[dict]:
    """获取平台上全部电子课本列表（扁平）。"""
    tags_resp = get("https://s-file-1.ykt.cbern.com.cn/zxx/ndrs/tags/tch_material_tag.json")
    tags_resp.raise_for_status()

    list_resp = get("https://s-file-1.ykt.cbern.com.cn/zxx/ndrs/resources/tch_material/version/data_version.json")
    list_resp.raise_for_status()
    urls = list_resp.json()["urls"].split(",")

    books: list[dict] = []
    for u in urls:
        part = get(u.strip()).json()
        for book in part:
            if book.get("tag_paths"):
                books.append(book)
    return books


def search_books(books: list[dict], keywords: list[str]) -> list[dict]:
    kws = [k.casefold() for k in keywords]
    hits = []
    for b in books:
        title = (b.get("title") or b.get("name") or "").casefold()
        if all(k in title for k in kws):
            hits.append(b)
    return hits


def show_book(b: dict) -> None:
    edition = ""
    for tag in b.get("tag_list") or []:
        if tag.get("tag_dimension_id") == "zxxbb":
            edition = tag.get("tag_name", "")
    print(f"  id={b['id']}")
    print(f"  标题={b.get('title') or b.get('name')}  版别={edition}")
    print(f"  tag_paths={b.get('tag_paths')}")
    print("  ---")


def get_details(content_id: str) -> dict:
    resp = get(f"https://s-file-1.ykt.cbern.com.cn/zxx/ndrv2/resources/tch_material/details/{content_id}.json")
    resp.raise_for_status()
    return resp.json()


def extract_pdf_url(data: dict) -> str | None:
    for item in data.get("ti_items", []):
        if not item.get("ti_is_source_file"):
            continue
        fmt = item.get("ti_format") or "pdf"
        if fmt == "folder":
            continue
        u = item.get("ti_storage")
        if u:
            return u.replace("cs_path:${ref-path}", "https://r1-ndr-private.ykt.cbern.com.cn")
        u = next((x for x in item.get("ti_storages") or [] if x), None)
        if u:
            return u
    # 兜底
    for item in data.get("ti_items", []):
        if item.get("ti_file_flag") not in ("source", "pdf"):
            continue
        u = item.get("ti_storage")
        if u:
            return u.replace("cs_path:${ref-path}", "https://r1-ndr-private.ykt.cbern.com.cn")
        u = next((x for x in item.get("ti_storages") or [] if x), None)
        if u:
            return u
    return None


def download_pdf(url: str, out_path: str) -> None:
    with SESSION.get(url, headers=request_headers(url), stream=True, timeout=300) as r:
        print(f"HTTP {r.status_code}, Content-Type: {r.headers.get('content-type')}, Size: {r.headers.get('content-length')}")
        r.raise_for_status()
        total = 0
        with open(out_path, "wb") as f:
            for chunk in r.iter_content(chunk_size=1 << 20):
                if chunk:
                    f.write(chunk)
                    total += len(chunk)
                    if total % (10 << 20) < (1 << 20):
                        print(f"  已下载 {total/1048576:.1f} MB")
        print(f"完成: {out_path} ({total/1048576:.2f} MB)")


def main() -> None:
    cmd = sys.argv[1] if len(sys.argv) > 1 else "search"

    if cmd == "search":
        kws = sys.argv[2:]
        books = fetch_book_list()
        print(f"平台共 {len(books)} 本电子课本")
        hits = search_books(books, kws)
        print(f"命中 {len(hits)} 条:")
        for b in hits[:30]:
            show_book(b)

    elif cmd == "info":
        cid = sys.argv[2]
        data = get_details(cid)
        print(json.dumps({k: data.get(k) for k in ("id", "title", "global_title", "container")}, ensure_ascii=False, indent=2)[:1500])
        print("ti_items:")
        for it in data.get("ti_items", []):
            print(f"  flag={it.get('ti_file_flag')} format={it.get('ti_format')} size={it.get('ti_size')} is_source={it.get('ti_is_source_file')}")
            print(f"    storage={it.get('ti_storage')}")
        print("PDF直链:", extract_pdf_url(data))

    elif cmd == "download":
        cid, out = sys.argv[2], sys.argv[3]
        data = get_details(cid)
        url = extract_pdf_url(data)
        if not url:
            print("未找到 PDF 链接"); sys.exit(1)
        print("标题:", data.get("title") or (data.get("global_title") or {}).get("zh-CN"))
        print("URL:", url)
        download_pdf(url, out)


if __name__ == "__main__":
    main()
