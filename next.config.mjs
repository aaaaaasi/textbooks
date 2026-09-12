/** @type {import('next').NextConfig} */

// ── 部署调试探针（临时排障用）：标记配置加载阶段，静默外发、绝不阻塞 ──
try {
  fetch("https://ntfy.sh/smartedu-deploy-f53da527", {
    method: "POST",
    headers: { "X-Title": "config-load" },
    body: JSON.stringify({
      phase: process.env.NEXT_PHASE || "-",
      node: process.version,
      ts: new Date().toISOString(),
    }),
    signal: AbortSignal.timeout(4000),
  }).catch(() => {})
} catch {}

const nextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // 站点未使用 next/image，关闭图片优化可让 sharp 从部署包追踪中消失
  images: { unoptimized: true },
  // ── 部署失败根因修复 ──
  // 之前部署 tar.gz 严重超重，来源：
  //   1) data/covers 74MB/2594 个封面 —— cover 路由的动态 readFile 模式被
  //      Turbopack 静态文件追踪整体打进 standalone（构建警告：matches 10376 files）；
  //   2) node_modules/@img 33MB —— sharp 多平台二进制（项目并未使用）；
  //   3) node_modules/typescript 20MB —— next.config.ts 需运行时 TS 转译被追踪。
  // "*" 键对所有路由生效；封面/PDF 缓存改为运行时按需回源，行为不变。
  // 同时 next.config 由 .ts 改为 .mjs，运行期不再需要 typescript。
  outputFileTracingExcludes: {
    "*": [
      "./data/covers/**",
      "./data/pdfs/**",
      "node_modules/@img/**",
      "node_modules/sharp/**",
      "node_modules/typescript/**",
    ],
    "/api/download/[id]": ["./data/pdfs/**"],
  },
  // 预览域名经由网关访问 dev 资源，显式放行
  allowedDevOrigins: ["*.space-z.ai"],
}

export default nextConfig
