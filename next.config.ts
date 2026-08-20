import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // hwpxcore는 번들 밖에서 require — Skeleton.hwpx 템플릿 자산을 fs로 읽는다
  serverExternalPackages: ["@ubermensch1218/hwpxcore"],
  turbopack: {},
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "k.kakaocdn.net",
      },
      {
        protocol: "https",
        hostname: "img1.kakaocdn.net",
      },
    ],
  },
};

export default nextConfig;
