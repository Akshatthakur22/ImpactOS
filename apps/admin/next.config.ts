import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@sportdesk/contracts"],
  devIndicators: false,
};

export default nextConfig;
