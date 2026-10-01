#!/bin/bash
# 聚焦复测：类型筛选 + 教师用书弹窗 + 幻灯片修复验证
set -u
cd /home/z/my-project
TEACHER=abcb4000-c179-f232-e231-73be454d9397
STUDENT=8c419b19-b3a9-4dbf-a8b4-546b7d337528

setsid nohup bun run dev > dev.log 2>&1 < /dev/null &
for i in $(seq 1 40); do curl -s -o /dev/null -m 2 http://localhost:3000/ && break; sleep 1; done
echo "== server ready =="

AB="agent-browser"
$AB close >/dev/null 2>&1
echo "== A. 幻灯片修复验证 =="
$AB open "http://localhost:3000/preview/$TEACHER" >/dev/null 2>&1
$AB wait 5000 >/dev/null 2>&1
echo "img 总数: $($AB get count 'img')"
echo "代理请求数: $($AB network requests --filter proxy 2>/dev/null | wc -l)"
$AB eval "fetch('/api/proxy?url='+encodeURIComponent('https://r1-ndr.ykt.cbern.com.cn/edu_product/esp/assets/$TEACHER.t/zh-CN/1725451150629/transcode/image/2.jpg')).then(r=>document.title='PROXY:'+r.status)" >/dev/null 2>&1
$AB wait 2500 >/dev/null 2>&1
$AB get title
$AB screenshot scripts/verify-slides.png >/dev/null 2>&1

echo "== B. 首页类型筛选 =="
$AB open http://localhost:3000/ >/dev/null 2>&1
$AB wait 3000 >/dev/null 2>&1
$AB snapshot -i -c 2>/dev/null | rg -i 'combobox|select' | head -8
echo "--- 用 JS 直改不可行，走点击：打开类型下拉 ---"
$AB find role combobox click --name "类型" 2>&1 | head -2
$AB wait 800 >/dev/null 2>&1
$AB snapshot -i -c 2>/dev/null | rg -i 'option|教师用书' | head -8

echo "== C. 学生教材下载按钮存在性（粗查） =="
echo "首页按钮含 下载 的数量: $($AB snapshot -c 2>/dev/null | rg -c '下载' || echo 0)"
$AB close >/dev/null 2>&1
echo "== DONE =="
