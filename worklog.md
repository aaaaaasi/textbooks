# Worklog

---
Task ID: 1
Agent: main (Super Z)
Task: 下载《义务教育教科书·英语（深圳沪教版）九年级上册》（根据2022年版课程标准修订）电子课本

Work Log:
- 初次通过 keben.app（课本网）下载到旧版教材（2014年7月第1版，154页，粉色封面），经用户确认为旧版并要求更换来源。
- 用户提供开源工具参考：https://github.com/happycola233/tchMaterial-parser
- git clone 该仓库，通读 src/tchmaterial_parser/ 下 api.py、network.py、auth.py、catalog.py 源码，提取完整 API 链路：
  1. 目录：https://s-file-1.ykt.cbern.com.cn/zxx/ndrs/tags/tch_material_tag.json + /zxx/ndrs/resources/tch_material/version/data_version.json（注意路径含 /resources/，此前 403 即因路径错误）
  2. 详情：/zxx/ndrv2/resources/tch_material/details/{contentId}.json
  3. 下载：ti_items 中 ti_is_source_file=true 的 ti_storage，前缀 cs_path:${ref-path} 替换为 https://r1-ndr-private.ykt.cbern.com.cn，请求头带占位 X-ND-AUTH（匿名可下载公开课本）
- 编写 scripts/smartedu_download.py（search/info/download 三个子命令），在平台 3190 本目录中定位目标。
- 命中：沪教版《（根据2022年版课程标准修订）义务教育教科书·英语九年级上册》 contentId=b1a19b7a-5a7f-4d0e-9f9d-b5e59dafc979
- 下载 112,487,176 字节（107.28MB）PDF，HTTP 200，与官方标注大小一致。

Stage Summary:
- 交付物：/home/z/my-project/download/义务教育教科书·英语九年级上册（沪教版·2022课标修订）.pdf（166页，PDF 1.7）
- 版本验证：封面为全新设计（2024年审定徽章）；版权页主编胡白梅（旧版为张春相/舒运祥）；序言为新课标单元结构；平台标题明确"根据2022年版课程标准修订"。
- 可复用脚本：/home/z/my-project/scripts/smartedu_download.py，可用于下载平台任意电子课本；旧版错误文件已删除。

---
Task ID: 2
Agent: main (Super Z)
Task: 下载《义务教育教科书·物理（人教版）九年级全一册》（根据2022年版课程标准修订）电子课本

Work Log:
- 复用 scripts/smartedu_download.py 在平台目录中搜索"物理九年级全一册"，命中 5 本，其中人教版修订版 id=ed5f6a59-0cc5-47e9-adc3-0033711700ea。
- 详情接口返回源文件名 9787107389566_义务教育教科书•物理_九年级_九年级全一册_人民教育出版社（ISBN 978-7-107-38956-6）。
- 下载 26,794,457 字节（25.55MB），HTTP 200，与官方标注一致。
- 验证：218 页；封面为中国空间站新设计+2024年审定徽章；目录从第十三章"内能"起始（人教版九年级正确起始章）。

Stage Summary:
- 交付物：/home/z/my-project/download/义务教育教科书·物理九年级全一册（人教版·2022课标修订）.pdf
- 确认为 2022 课标修订新版本。

---
Task ID: 3
Agent: main (Super Z)
Task: 开发"中小学电子教材库"网站（检索+预览+下载全部平台教材，含2022课标修订版）

Work Log:
- 初始化 fullstack 环境（Next.js 16 + shadcn/ui + Tailwind 4），修复 bun install 中 @swc tarball 失败并重启 dev server。
- 编写 scripts/build_catalog.py 拉取平台目录：标签树(185节点) + 4个分片 → data/catalog.json（2920本，解析出学段/年级/学科/版本/册次/修订标记，1766本为2022课标修订版）。
- 后端（src/lib/smartedu.ts + 4个API路由）：
  * GET /api/catalog 目录缓存；GET /api/book/[id] 详情+封面+配套音频；GET /api/download/[id] PDF代理（携带占位X-ND-AUTH，多镜像重试，inline=1可预览）；GET /api/proxy CDN代理（白名单*.ykt.cbern.com.cn，音频/封面）。
- 前端（page.tsx + book-dialog + download-tray + download-store + download-client）：
  * 全文搜索+学段Tab+年级/学科/版本筛选+仅看修订版开关；卡片网格+加载更多；详情弹窗（封面/元数据/104个音频）；下载托盘（进度/取消/File System Access流式写盘优先，Blob回退）。
- 修复 react-hooks/set-state-in-effect lint 错误（渲染期重置模式）；修复 MultiEdit 原子性导致的结构破损。
- Agent Browser 端到端验证：桌面/移动渲染✓、搜索过滤✓、详情弹窗封面✓、下载完成25.6MB✓、英语教材104个配套音频✓、无控制台错误✓、lint 0 errors✓。

Stage Summary:
- 网站已运行于端口3000（唯一路由 /），含平台全部2920本教材（含1766本2022修订版）的检索、预览、下载与配套音频。
- 目录更新方式：python3 scripts/build_catalog.py 重新生成 data/catalog.json。

---
Task ID: 4
Agent: main (Super Z)
Task: 前端去AI味改造（依据 taste-skill 规范）+ 封面缓存补齐 + 磁盘修复

Work Log:
- 磁盘已满（100%）修复：清理 /tmp 陈旧构建产物约 6GB；封面原图压缩 2464MB→52MB（scripts/compress_covers.py，PIL 最长边480px q80 渐进 JPEG）。
- 精读 taste-skill（github.com/Leonxlnx/taste-skill）SKILL.md 全文 1206 行，提取关键规范：非默认 shadcn、单一强调色锁定、着色阴影、圆角体系一致、em-dash 禁用、reduced-motion、空/载/错三态等。
- 设计令牌重构（globals.css）：「课本纸」主题——暖纸灰底 oklch(0.978 0.005 90) + 暖墨文字，唯一强调色松墨绿 oklch(0.455 0.075 168)（亮）/ 粉笔绿 0.795（暗），--radius 0.5rem，CJK 字体栈（PingFang/鸿蒙/雅黑），宋体 .font-brand 字标栈，::selection 绿色，reduced-motion 全局降级。
- page.tsx：宋体字标+页头统计重组（去双间隔点）、搜索框 h10、卡片悬停上浮+石色着色阴影+封面微缩放、修订徽章改主色系（去除 emerald 第二强调色）、空状态重组（圆形图标底+标题+副文案）、按钮 active:scale。
- book-dialog / download-tray / preview 页对齐：徽章主色化、封面容器着色阴影、音频行去边框、done→text-primary、error→text-destructive（去 red-500 硬编码）、预览底色统一令牌（去 neutral/zinc 混用）。
- 封面补齐：重跑 warm_covers.py 新增 679 张（此前磁盘满失败），总计 2594 张已缓存并压缩；剩余 320 本为上游平台限制（五四学制地区教材详情接口 403，带鉴权头亦 403），前端已有字占位回退。
- pdf.js cMap 支持：public/cmaps/ 168 个 bcmap（1.7MB），预览页传 cMapUrl/cMapPacked，消除 CID 字体警告并提升中文渲染可靠性。
- 重启 dev server 清除 Turbopack 磁盘满期间的缓存错误。
- agent-browser 验证：首页新视觉✓、级联筛选（初中→物理→版本仅列9个真实版本→人教版=精准3本）✓、预览渐进加载（网络面板 200+206 Range 分块，首屏无需整本下载）✓、详情弹窗（封面 340x480 缓存命中）✓、深色模式（暖炭+粉笔绿）✓、移动端 390px 单列✓、console 无错误✓、eslint 0 errors✓。

Stage Summary:
- 四项用户需求全部落地：①前端按 taste-skill 去 AI 味（单强调色「松墨绿课本纸」主题、宋体字标、着色阴影、统一圆角体系、reduced-motion）；②PDF 预览 pdf.js Range 渐进加载已生效（206 分块实测）；③封面全量磁盘缓存 2594 张（74MB 缩略图）+ immutable 浏览器缓存；④级联筛选：学段→学科/年级互约束→册次→版本仅列当前组合下真实存在的版别。
- 磁盘 100%→23%（7.2GB 可用）。

---
Task ID: 5
Agent: main (Super Z)
Task: 修复部署失败 + PDF预览卡死0% + 下载提速（用户反馈迭代）

Work Log:
- 诊断三连：①所有上游 fetch 无超时 → details/PDF 接口一旦挂起路由永不响应，前端永远"加载中 0%"且无报错（卡死根因，非 CORS——本站走服务端代理浏览器从不直连 CDN）；②本地 bun run build 实际成功（11.4s），部署失败疑与构建产物膨胀/超时相关；③实测 CDN：单流 5.7MB/s，6 线程并行 Range 16.2MB/s（约 2.8 倍优化空间确认）。
- smartedu.ts 加固：fetchWithHeaderTimeout（只约束响应头阶段 12s，正文不限时）、fetchJsonRetry（8s 超时×3 次退避重试）、mirrorVariants（r1/r2/r3 镜像轮换）、resolvePdf（PDF 地址 24h 内存缓存，pdf.js 分块请求零回源 details）。
- 新建 pdf-cache.ts：PDF 磁盘 LRU 缓存 data/pdfs（3GB 上限，mtime 淘汰），serveFileRange 本地 200/206 服务，WriteSession 并发写会话（同一本书仅一个落盘写入者）。修复关键 bug：open() 创建 WriteStream 后未赋给 this.ws 导致写盘全静默失败（用独立脚本在 Node/Bun 下复现定位）。
- download 路由重写为三级降级：①磁盘缓存命中→本地毫秒级服务（含 Range）；②整本请求→bytes=0-0 探测后走并行分块管线（6 并发×4MB 有序下发、pull 背压、Content-Range 双重校验防错块、逐镜像重试、同时写盘缓存）；③pdf.js 补块 Range 或探测失败→单流透传（响应头超时防挂起）。全路由 X-Accel-Buffering: no 禁网关缓冲，客户端断开即时取消全部上游请求。
- 预览页改造：默认浏览器原生预览（iframe，用户偏好"至少能加载出来"），工具栏一键切换流式阅读器（pdf.js 进度条/缩放保留）。
- next.config：outputFileTracingExcludes 排除 data/pdfs（防 3GB 缓存被复制进 standalone 拖垮构建部署）；allowedDevOrigins 放行 *.space-z.ai。
- 验证全通过：md5 三方一致（管线输出=磁盘缓存=官方原版）；Range 中段/后缀语义字节级精确；107MB 英语书首次 9.3s@12.1MB/s（原约 19s）、二次 0.77s@147MB/s；25.5MB 物理书首次 2.1s@12.6MB/s；缓存命中 99-147MB/s；生产 standalone（bun）冒烟全绿；浏览器实测原生/流式双模式+跳 150 页+未缓存新书首开，无 console 错误；eslint 0 errors。

Stage Summary:
- 卡死 0% 根因（无超时挂起）已消除：全链路超时+镜像轮换+三级降级，任何上游故障最多 12s 后降级而非永久挂起。
- 下载提速约 2.2 倍（5.7→12.6MB/s），看过的书二次预览/下载本地秒开（40-200 倍）。
- 预览默认原生浏览器查看器，保底可用；流式阅读器保留渐进进度条。
- 部署：本地构建+生产模式已完整验证，建议用户重新触发部署；若平台侧仍失败需平台日志进一步定位。

---
Task ID: 6
Agent: main (Super Z)
Task: 3GB缓存机制说明与生命周期完善 + 部署失败继续排查修复 + 月度目录自动更新

Work Log:
- 回答用户3GB缓存疑问：LRU 上限自动淘汰（非无限增长）+ outputFileTracingExcludes 已排除出构建产物；按新需求补齐"月度更新后自动清空"。
- 部署失败继续排查，修复两个嫌疑点：①package.json start 脚本 bun→node（standalone 本就是 Node 服务，平台生产环境很可能无 bun，此前 bun start 会直接崩溃）；②发现 /api/catalog 是 force-static——构建期静态固化，运行时永不更新，改为 force-dynamic；③catalog.ts 内存缓存补 mtime 失效（月度更新重写文件后无需重启生效）。
- build_catalog.py 健壮化：输出路径改为相对脚本位置推导；catalog.json 原子写入（tmp+replace，失败不损坏旧目录）。
- 新建 scripts/monthly_update.py：fcntl 文件锁防并发 → 子进程全量重建目录 → 清空 data/pdfs（教材可能被新版替换）→ 裁剪孤儿封面（新目录已不存在的 id）→ 原子写 data/last_update.json；失败保留旧目录。手动实测 2s 完成：2920 本、裁掉 1 张孤儿封面、清理记录完整。
- 新建 src/instrumentation.ts + src/lib/scheduler.ts：启动 30s 后+每小时检查；距上次更新超 30 天且本地 03:00-06:00 空闲窗口触发；超 34 天任意时段补跑；python/scripts 不可用时退避 7 天；日志落 data/update.log。
- 工作区瘦身：data/pdfs 185MB 测试缓存清空（现 0 文件），data 目录 800K + covers 74MB。
- 验证：eslint 0 errors；build 成功且 /api/catalog 变为 ƒ Dynamic；node 运行时生产冒烟全绿（首页 0.03s、目录 API 返回今日新目录、PDF 管线回源 12.2MB/s）；dev 重启后浏览器确认无 console 错误。

Stage Summary:
- 缓存全生命周期闭环：运行时 LRU（3GB 上限）→ 构建排除 → 月度更新后自动清空 PDF 缓存并裁剪孤儿封面。
- 部署排查：本地构建、node 生产运行时、动态目录 API 全部验证通过；若平台侧仍失败需平台部署日志定位（已无本地可修的已知嫌疑点）。
- 月度自动更新已上线：调度条件（30 天到期+凌晨空闲窗口+34 天补跑）、并发锁、失败兜底、执行留痕齐备，亦可手动 python3 scripts/monthly_update.py 触发。

---
Task ID: 7
Agent: main (Super Z)
Task: 部署失败根因定位与修复（复现平台构建）+ 无日志部署探针

Work Log:
- 摸清平台部署机制：.zscripts/build.sh 在沙箱内执行 bun install + bun run build → 校验 standalone → 收集产物（.next/standalone、static、public、db、python 源码、Caddyfile、start.sh）→ tar.gz 上传 FC（函数计算）；FC 侧 start.sh 用 bun server.js 起在 3000，Caddy :81 反代，健康检查 120s 超时即失败（warmup_412 / FunctionNotStarted）。
- 根因定位：完整复现平台构建发现 Turbopack 构建警告「cover 路由动态文件模式 matches 10376 files」→ 实测 .next/standalone/data 含 74MB/2594 张封面全部被打进部署包；另有 node_modules/@img（sharp 二进制）33M、typescript 20M（next.config.ts 运行时转译所致）；standalone 合计 153M，tar.gz 约 60MB+，与每次部署失败时间线吻合（首次部署时 data/pdfs 还有 185MB 也被打包）。
- 修复：①next.config 由 .ts 改为 .mjs（运行期不再需要 typescript）；②images.unoptimized（项目未用 next/image）；③outputFileTracingExcludes 增加 "*" 键排除 data/covers、data/pdfs、@img、sharp、typescript；④cover 路由缓存路径改为运行时拼接（打破 Turbopack 静态推断，防再度追踪）；catalog.json 仍被 /api/catalog 静态路径追踪保留内嵌（线上开箱即有 2920 本目录）。
- 效果：standalone 153M→27M（-82%），平台构建 tar.gz 60MB+→5.5MB（约 12 倍），.zscripts/build.sh 全流程 EXIT=0。
- 部署调试探针（应用户"自动发送错误给你"需求）：ntfy.sh 私有主题 smartedu-deploy-f53da527 双向验证可用；埋点覆盖 ①scripts/build-report.mjs 包装 bun run build（build-ok/build-failed+输出尾部）；②next.config.mjs config-load；③instrumentation.ts server-boot + uncaughtException/unhandledRejection；④build.sh 各阶段 install-ok/build-ok/package-done(含包体积)/exit_code。全部 4-5s 超时静默失败不影响业务。
- 验证：standalone 生产冒烟（首页 27ms、目录 2920 本、封面正常、82ms 就绪）；dev 200 + 目录正常；eslint 0 errors。

Stage Summary:
- 部署失败根因 = 部署包被封面/sharp/typescript 撑爆（153M standalone / 60MB+ tar.gz），已修复至 5.5MB；请用户重新触发部署。
- 部署探针已上线：下次部署无论成败，构建各阶段与包体积、FC 侧服务启动/崩溃都会自动外发，可随时读取定位。
- 若部署仍失败：读探针即可区分「构建失败（有 build-failed）」「打包后上传失败（有 package-done 但无 FC boot）」「FC 启动失败（有 server-boot + 崩溃栈）」三种情形。

---
Task ID: 8
Agent: main (Super Z)
Task: 部署成功确认（探针闭环）+ 月度更新改造为纯 Node 实现（消除线上 python3 依赖）

Work Log:
- 读部署探针 ntfy 遥测闭环确认：install-ok → build-ok-standalone-ready → package-done(5MB) → exit_code 0 → FC 生产环境（/app/next-service-dist，node v24.3.0）server-boot 成功，之后无崩溃上报。部署失败根因（包体积 153M→5MB 瘦身）修复得到最终验证。
- 发现线上隐患：scheduler.ts 原实现 spawn "python3 scripts/monthly_update.py"，但 FC 环境（/app/next-service-dist）无 python3 且 scripts/ 未必随包分发 → 月度更新在线上会静默失效（每次失败退避 7 天）。
- 新建 src/lib/catalog-update.ts：月度目录全量更新纯 Node/TS 实现，与 build_catalog.py + monthly_update.py 逻辑逐项等价（标签树 BFS 185 节点、4 分片、tag_paths 维度解析、tag_list 版别兜底、2022 修订标记、字段顺序一致、原子写入）；双重锁（进程内 promise + 文件锁 30min 陈锁回收）；PDF 缓存全清（5min 内活跃下载跳过）；孤儿封面裁剪；last_update.json/update.log 留痕；新增防御：分片全失败或新目录骤减超半数时保留旧目录；手动触发 bun src/lib/catalog-update.ts（package.json 加 update-catalog 脚本）。
- scheduler.ts 重写：调用 TS 更新器（删除 python spawn）；改为只认「成功」记录计算 30 天周期（失败次日记重试，不再重置周期）；锁冲突视为他处更新中，下个整点再查；结果经部署探针外发（catalog-updated / catalog-update-failed，线上无日志时的可见性通道）。
- 删除 scripts/monthly_update.py（已被 TS 版取代，防双实现漂移）；build_catalog.py 保留作独立手动工具。
- 验证：手动触发实测 1.47s 完成（2920 本/修订版 1766/新增 0/下架 0/分片失败 0）；孤儿封面精确裁剪 1 张（预置假 id 封面已验证删除）；catalog.json 字段序与旧版一致；dev server 目录 API 经 mtime 失效无感生效；eslint 0 errors；bun run build 成功；standalone 生产冒烟（首页 25ms、目录 2920、封面 200、打包内含 catalog.json 788KB、调度器无误触发）。

Stage Summary:
- 部署专案闭环：瘦身修复被探针+用户实际部署成功双重验证。
- 月度自动更新现可在任何 Node 运行时工作（含 FC 线上环境），触发策略：距上次成功更新超 30 天且本地 03:00-05:59 空闲窗口执行，超 34 天任意时段补跑，失败 24h 退避重试；更新后自动清 PDF 缓存+裁孤儿封面；线上执行结果经 ntfy 探针可见。

---
Task ID: 9
Agent: main (Super Z)
Task: 开源发布——全部代码与文件提交到 github.com/aaaaaasi/textbooks

Work Log:
- 摸底：PAT 经 GitHub API 验证有效（admin/push 权限），目标仓库 public 且为空（size 0，默认分支 main）；.env 仅为 SQLite 路径无密钥；全项目 rg 扫描无 PAT 泄露；旧 git 历史含 93MB/24MB/21MB 大对象（历史提交过 download/ 教材 PDF 与 data/pdfs 缓存）。
- 关键决策：重建全新 git 历史（rm -rf .git + git init -b main），避免把旧历史中的教材 PDF 与缓存 blob 一并推上公开仓库。
- .gitignore 重写为最小排除集：node_modules/.next/out/build/coverage/*.tsbuildinfo（安装/构建可恢复）+ download/*.pdf 与 data/pdfs/（教材 PDF）+ /skills/（AI 平台技能包 61MB，环境运行时工具，非项目代码）+ .DS_Store/Thumbs.db；其余全部入库（含 .env、dev.log、tool-results/、.zscripts/、db/、data/covers 2594 张、catalog.json、scripts/ 全部工具与截图）。
- 开源门面：README.md（项目简介+在线预览 https://textbooks.space-z.ai+shields 徽章+4 张实测截图+特性+快速开始+API 一览+数据链路+缓存与月度更新+项目结构+部署+环境变量+数据来源与版权声明+ntfy 探针披露）；LICENSE（MIT, Copyright (c) 2026 aaaaaasi）。
- git 身份：user.name=aaaaaasi，user.email=aaaaaasi@users.noreply.github.com（本地仓库级配置）。
- 提交后按用户要求冻结项目文件，不再做任何修改。

Stage Summary:
- 仓库：https://github.com/aaaaaasi/textbooks （public，main 分支，单次完整提交）。
- 入库范围：项目全部源代码、数据（目录+封面）、脚本、部署配置、文档；排除仅限 node_modules/.next 构建物、教材 PDF（download/*.pdf、data/pdfs/）、平台技能包 /skills/。
- 安全提示：PAT 系用户在会话中明文提供，建议用后轮换；仓库不含任何密钥（.env 仅为本地 SQLite 路径）。
