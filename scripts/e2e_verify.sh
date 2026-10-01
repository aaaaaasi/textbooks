#!/bin/bash
# 端到端验证：新资源类型 + 英文搜索 + i18n + 幻灯片阅读 + 原有下载链路
# 沙箱会在命令间回收后台进程，因此服务启动与全部验证必须在同一次调用内完成。
set -u
cd /home/z/my-project

TEACHER=abcb4000-c179-f232-e231-73be454d9397   # 体育与健康教师用书（49页幻灯片）
STUDENT=8c419b19-b3a9-4dbf-a8b4-546b7d337528   # 化学九上（学生教材，有PDF）

# ---------- 启动 ----------
setsid nohup bun run dev > dev.log 2>&1 < /dev/null &
for i in $(seq 1 40); do
  curl -s -o /dev/null -m 2 http://localhost:3000/ && break
  sleep 1
done
echo "== server ready =="

# ---------- API 检查 ----------
echo "== API: catalog =="
curl -s http://localhost:3000/api/catalog | python3 -c "
import json,sys
d=json.load(sys.stdin)
from collections import Counter
print('total:', d['total'], Counter(b.get('res_type','student') for b in d['books']))"

echo "== API: 教师用书 book（应目录兜底+slides）=="
curl -s http://localhost:3000/api/book/$TEACHER | python3 -c "
import json,sys
d=json.load(sys.stdin)
print('resType:', d['resType'], '| pdfUrl:', d['pdfUrl'], '| slideCount:', d['slideCount'])"

echo "== API: 教师用书封面（应200图）=="
curl -s -o /dev/null -w '%{http_code} %{content_type} %{size_download}B\n' http://localhost:3000/api/cover/$TEACHER

echo "== API: 学生教材 book（应有PDF）=="
curl -s http://localhost:3000/api/book/$STUDENT | python3 -c "
import json,sys
d=json.load(sys.stdin)
print('pdfUrl:', bool(d['pdfUrl']), '| size:', d['size'], '| resType:', d['resType'])"

echo "== API: 学生教材下载 Range（应206）=="
curl -s -o /dev/null -w '%{http_code} got %{size_download}B\n' -H 'Range: bytes=0-1023' http://localhost:3000/api/download/$STUDENT

echo "== API: 幻灯片图片直连（应200）=="
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' "https://r1-ndr.ykt.cbern.com.cn/edu_product/esp/assets/$TEACHER.t/zh-CN/1725451150629/transcode/image/1.jpg"

# ---------- 浏览器 E2E ----------
AB="agent-browser"
echo "== E2E: 打开首页 =="
$AB open http://localhost:3000/ >/dev/null 2>&1
$AB wait 3500 >/dev/null 2>&1
$AB get title

echo "== E2E: 英文搜索 history =="
$AB find role textbox fill "History" --name "搜索教材" >/dev/null 2>&1
$AB wait 1200 >/dev/null 2>&1
echo "history 命中卡片数: $($AB get count 'article' 2>/dev/null)"

echo "== E2E: 英文搜索 physics =="
$AB find role textbox fill "physics" >/dev/null 2>&1
$AB wait 1200 >/dev/null 2>&1
echo "physics 命中卡片数: $($AB get count 'article' 2>/dev/null)"
$AB find role textbox fill "" >/dev/null 2>&1

echo "== E2E: 类型筛选=教师用书 =="
$AB find role combobox click --name "类型" >/dev/null 2>&1
$AB wait 600 >/dev/null 2>&1
$AB find role option click --name "教师用书" >/dev/null 2>&1
$AB wait 1200 >/dev/null 2>&1
echo "教师用书卡片数: $($AB get count 'article' 2>/dev/null)"
echo "类型徽章出现次数: $($AB get count 'article span' 2>/dev/null)"

echo "== E2E: 切换英文 =="
$AB find text "EN" click >/dev/null 2>&1
$AB wait 800 >/dev/null 2>&1
echo "品牌字样: $($AB get text 'header span.font-brand' 2>/dev/null)"
echo "语言存储: $($AB storage local get tb-lang 2>/dev/null)"

echo "== E2E: 教师用书详情弹窗（应无下载、有提示）=="
$AB find text "体育与健康教师用书" click >/dev/null 2>&1
$AB wait 2500 >/dev/null 2>&1
DIALOG=$($AB get text '[role=dialog]' 2>/dev/null)
echo "$DIALOG" | rg -o "No source file[^\"]*|Read online|Download PDF" | sort -u
$AB press Escape >/dev/null 2>&1

echo "== E2E: 教师用书预览（图文模式）=="
$AB open "http://localhost:3000/preview/$TEACHER" >/dev/null 2>&1
$AB wait 4500 >/dev/null 2>&1
echo "幻灯片图片数(前两页应立即可用): $($AB get count 'img' 2>/dev/null)"
$AB screenshot scripts/verify-slides.png >/dev/null 2>&1
echo "截图: verify-slides.png"

echo "== E2E: 学生教材预览（PDF 模式）=="
$AB open "http://localhost:3000/preview/$STUDENT" >/dev/null 2>&1
$AB wait 5000 >/dev/null 2>&1
echo "iframe 存在: $($AB get count 'iframe' 2>/dev/null)"
$AB screenshot scripts/verify-pdf-preview.png >/dev/null 2>&1

echo "== E2E: 控制台错误 =="
$AB errors 2>/dev/null | head -10
$AB console 2>/dev/null | rg -iv 'warning|Download the React DevTools' | head -8
$AB close >/dev/null 2>&1
echo "== DONE =="
