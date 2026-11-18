import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async redirects() {
    return [
      {
        source: "/cpp",
        destination: "/w/cpp",
        permanent: false,
      },
      {
        source: "/cpp/:path*",
        destination: "/w/cpp/:path*",
        permanent: false,
      },
      {
        source: "/c",
        destination: "/w/c",
        permanent: false,
      },
      {
        source: "/c/:path*",
        destination: "/w/c/:path*",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
