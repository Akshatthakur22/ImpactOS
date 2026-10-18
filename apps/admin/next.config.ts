import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@sportdesk/contracts"],
};

export default nextConfig;
