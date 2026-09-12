// Next.js instrumentation 钩子：服务启动时执行一次。
// 1) 部署调试探针：上报「服务已启动」与运行期未捕获异常（无平台日志时的救命通道）
// 2) 拉起月度目录自动更新调度器（仅 Node.js 运行时）
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return
  const { probe } = await import("@/lib/deploy-probe")

  probe("server-boot", {
    node: process.version,
    env: process.env.NODE_ENV,
    cwd: process.cwd(),
    port: process.env.PORT || "-",
    pid: process.pid,
  })

  process.on("uncaughtException", (e) => {
    probe("uncaughtException", {
      msg: e?.message,
      stack: String(e?.stack || "").slice(0, 1200),
    })
  })
  process.on("unhandledRejection", (e) => {
    const err = e as Error
    probe("unhandledRejection", {
      msg: err?.message ?? String(e),
      stack: String(err?.stack || "").slice(0, 1200),
    })
  })

  const { startCatalogScheduler } = await import("@/lib/scheduler")
  startCatalogScheduler()
}
