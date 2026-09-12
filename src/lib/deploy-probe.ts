// 部署调试探针（临时排障用，问题定位后可整体移除）
//
// 作用：平台部署失败时拿不到任何日志，这里把「构建完成 / 服务启动 / 运行期崩溃」
// 三类关键事件无凭据地发往 ntfy.sh 的私有随机主题，用于在无平台日志的情况下
// 判断部署到底死在哪一环（构建 → 打包上传 → FC 健康检查）。
//
// 安全性：只发送时间戳/版本号/错误摘要，不含密钥与用户数据；
// 4s 超时 + 全程静默失败 + 单进程最多 20 条，绝不影响业务流程。

const NTFY_URL = "https://ntfy.sh/smartedu-deploy-f53da527"
const MAX_SENDS = 20
let sent = 0

export function probe(title: string, data: Record<string, unknown> = {}): void {
  if (sent >= MAX_SENDS) return
  sent += 1
  try {
    fetch(NTFY_URL, {
      method: "POST",
      headers: { "X-Title": title.slice(0, 80) },
      body: JSON.stringify({ ...data, at: new Date().toISOString() }),
      signal: AbortSignal.timeout(4000),
    }).catch(() => {})
  } catch {
    // 探针永不抛错
  }
}
