import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.0.66"],
  serverExternalPackages: ["@napi-rs/canvas"],
};

export default nextConfig;
