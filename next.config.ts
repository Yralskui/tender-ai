import type { NextConfig } from "next";

/** Доступ к dev-серверу с других устройств в Wi‑Fi (иначе React/JS не грузится — вечный спиннер) */
const allowedDevOrigins = [
  ...(process.env.DEV_ALLOWED_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean) ?? []),
  "192.168.0.171",
  "136.169.234.224",
];

const nextConfig: NextConfig = {
  allowedDevOrigins,
  serverExternalPackages: ["pdf-parse", "@napi-rs/canvas", "pdfjs-dist"],
  experimental: {
    proxyClientMaxBodySize: "25mb",
    serverActions: {
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;
