import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  images: {
    // allow local image proxy URLs with query strings (e.g. /api/yt/img?u=…);
    // omitting `search` allows any query string (see next/image localPatterns)
    localPatterns: [
      { pathname: "/api/yt/img" },
      { pathname: "/api/img" },
      { pathname: "/covers/**" },
      { pathname: "/artists/**" },
    ],
  },
};

export default nextConfig;
