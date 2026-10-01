import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // PDF 磁盘缓存属运行时临时数据（LRU 自动淘汰），禁止被打包追踪进
  // standalone 构建产物（否则最多 3GB 被复制，拖垮构建/部署）
  outputFileTracingExcludes: {
    "/api/download/[id]": ["./data/pdfs/**"],
  },
  // 预览域名经由网关访问 dev 资源，显式放行
  allowedDevOrigins: ["*.space-z.ai"],
};

export default nextConfig;
