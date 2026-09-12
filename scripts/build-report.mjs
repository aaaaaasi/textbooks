// 部署构建包装器（临时排障用）：
// 平台部署时执行 bun run build → 这里包裹原 next build 链路，
// 把构建成败与输出尾部上报到 ntfy.sh 私有主题——在没有平台部署日志时，
// 用于区分「构建阶段失败」还是「打包上传/FC 启动阶段失败」。
// 上报 5s 超时、全程静默失败，绝不影响构建结果；退出码与原命令保持一致。

import { spawn } from "node:child_process"

const NTFY_URL = "https://ntfy.sh/smartedu-deploy-f53da527"
const CMD =
  'next build && cp -r .next/static .next/standalone/.next/ && cp -r public .next/standalone/'

function report(title, body) {
  try {
    fetch(NTFY_URL, {
      method: "POST",
      headers: { "X-Title": title },
      body,
      signal: AbortSignal.timeout(5000),
    }).catch(() => {})
  } catch {}
}

const startedAt = Date.now()
const binRoot = `${process.cwd()}/node_modules/.bin`

const child = spawn("/bin/bash", ["-c", CMD], {
  stdio: ["inherit", "pipe", "pipe"],
  env: { ...process.env, PATH: `${binRoot}:${process.env.PATH || ""}` },
})

let out = ""
const onChunk = (d) => {
  const s = d.toString()
  out += s
  if (out.length > 20000) out = out.slice(-20000)
  process.stdout.write(s)
}
child.stdout.on("data", onChunk)
child.stderr.on("data", onChunk)

child.on("error", (e) => {
  report("build-spawn-error", JSON.stringify({ msg: String(e) }))
  process.exit(1)
})

child.on("exit", (code) => {
  const durSec = Math.round((Date.now() - startedAt) / 1000)
  if (code === 0) {
    report("build-ok", JSON.stringify({ dur_sec: durSec, node: process.version }))
  } else {
    report(
      "build-failed",
      JSON.stringify({ exit_code: code, dur_sec: durSec, output_tail: out.slice(-2500) }),
    )
  }
  process.exit(code ?? 1)
})
