import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false,
  devIndicators: false,
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
