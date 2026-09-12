#!/usr/bin/env python3
"""实测上游CDN速度：单流 vs 并行Range分块，评估下载优化空间。"""
import time, threading, requests, sys

DETAILS = "https://s-file-1.ykt.cbern.com.cn/zxx/ndrv2/resources/tch_material/details/{}.json"
# 物理教材（25.5MB，较小便于测速）
CID = "ed5f6a59-0cc5-47e9-adc3-0033711700ea"
HEADERS = {
    "Authorization": "Bearer 0",
    "Origin": "https://basic.smartedu.cn",
    "Referer": "https://basic.smartedu.cn/",
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
    "X-ND-AUTH": 'MAC id="0",nonce="0",mac="0"',
}

def get_pdf_url(cid):
    d = requests.get(DETAILS.format(cid), headers=HEADERS, timeout=15).json()
    for it in d.get("ti_items", []):
        if it.get("ti_is_source_file"):
            st = it["ti_storage"]
            return st.replace("cs_path:${ref-path}", "https://r1-ndr.ykt.cbern.com.cn"), it.get("ti_size", 0)
    return None, 0

def timed_stream(url, headers, max_bytes, label):
    """读 max_bytes 字节计时"""
    t0 = time.time()
    got = 0
    with requests.get(url, headers=headers, stream=True, timeout=30) as r:
        for chunk in r.iter_content(65536):
            got += len(chunk)
            if got >= max_bytes:
                break
    dt = time.time() - t0
    print(f"  {label}: {got/1048576:.1f}MB in {dt:.2f}s = {got/1048576/dt:.2f} MB/s (status {r.status_code})")
    return got / dt

url, total = get_pdf_url(CID)
print(f"PDF url: {url[:80]}... total={total/1048576:.1f}MB")

print("\n[1] 单流顺序读 8MB:")
single = timed_stream(url, HEADERS, 8*1048576, "single-stream")

print("\n[2] 6线程并行各读 2MB (模拟并行Range):")
results = []
def worker(i, results):
    h = dict(HEADERS); h["Range"] = f"bytes={i*2*1048576}-{(i+1)*2*1048576-1}"
    t0 = time.time()
    got = 0
    r = requests.get(url, headers=h, stream=True, timeout=30)
    for chunk in r.iter_content(65536):
        got += len(chunk)
    dt = time.time() - t0
    results.append((got, dt, r.status_code))

threads = [threading.Thread(target=worker, args=(i, results)) for i in range(6)]
t0 = time.time()
for t in threads: t.start()
for t in threads: t.join()
wall = time.time() - t0
total_mb = sum(g for g, _, _ in results) / 1048576
print(f"  并行6x2MB: {total_mb:.1f}MB in {wall:.2f}s = {total_mb/wall:.2f} MB/s 墙钟时间 (statuses: {[s for _,_,s in results]})")

print("\n[3] 检查镜像域名解析差异:")
for host in ["r1-ndr.ykt.cbern.com.cn", "r2-ndr.ykt.cbern.com.cn", "r3-ndr.ykt.cbern.com.cn"]:
    try:
        import socket
        ip = socket.gethostbyname(host)
        print(f"  {host} -> {ip}")
    except Exception as e:
        print(f"  {host} -> FAIL {e}")
