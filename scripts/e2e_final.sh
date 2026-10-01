#!/bin/bash
# 幻灯片页 + 类型筛选 终验（长等待，捕获页面异常）
set -u
cd /home/z/my-project
TEACHER=abcb4000-c179-f232-e231-73be454d9397

setsid nohup bun run dev > dev.log 2>&1 < /dev/null &
for i in $(seq 1 40); do curl -s -o /dev/null -m 2 http://localhost:3000/ && break; sleep 1; done
echo "== server ready =="
# 预热两个路由
curl -s -o /dev/null http://localhost:3000/preview/$TEACHER
sleep 3

AB="agent-browser"
$AB close >/dev/null 2>&1

echo "== A. 幻灯片页（EN已持久化） =="
$AB open "http://localhost:3000/preview/$TEACHER" >/dev/null 2>&1
$AB wait 8000 >/dev/null 2>&1
echo "页面异常: $($AB errors 2>/dev/null | head -3 | tr '\n' ' ')"
echo "img 数量: $($AB get count 'img')"
echo "页头文字: $($AB get text 'header h1' 2>/dev/null)"
$AB eval "(()=>{const i=document.querySelector('img');return i?i.naturalWidth+'x'+i.naturalHeight+' '+i.currentSrc.slice(0,60):'no-img'})()" 2>/dev/null
$AB screenshot scripts/verify-slides.png >/dev/null 2>&1

echo "== B. 清掉语言偏好，回中文 =="
$AB storage local clear >/dev/null 2>&1

echo "== C. 首页：类型筛选=教师用书 =="
$AB open http://localhost:3000/ >/dev/null 2>&1
$AB wait 5000 >/dev/null 2>&1
$AB find role combobox click --name "类型" >/dev/null 2>&1
$AB wait 600 >/dev/null 2>&1
$AB find role option click --name "教师用书" >/dev/null 2>&1
$AB wait 1500 >/dev/null 2>&1
echo "教师用书卡片数: $($AB get count 'article')"
echo "徽章样本: $($AB eval "(()=>{const b=document.querySelector('article span');return b?b.textContent:'none'})()" 2>/dev/null)"
echo "下载按钮数量(应为0): $($AB snapshot -c 2>/dev/null | rg -c '下载' || true)"

echo "== D. 教师用书详情弹窗 =="
$AB eval "document.querySelector('article h3').click()" >/dev/null 2>&1
$AB wait 3000 >/dev/null 2>&1
$AB eval "(()=>{const d=document.querySelector('[role=dialog]');return d?d.textContent.slice(0,200):'no-dialog'})()" 2>/dev/null
$AB screenshot scripts/verify-teacher-dialog.png >/dev/null 2>&1
$AB press Escape >/dev/null 2>&1
$AB close >/dev/null 2>&1
echo "== DONE =="
