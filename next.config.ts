import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Turbopack 호환을 위한 빈 설정
  turbopack: {},
};

export default nextConfig;
