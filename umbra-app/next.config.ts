import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@zama-fhe/relayer-sdk"],

  turbopack: {
  resolveAlias: {
    "@zama-fhe/relayer-sdk/web": {
      browser: "@zama-fhe/relayer-sdk/web",
      default: "./lib/zama-shim.ts",
    },
  },
},

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Cross-Origin-Opener-Policy",  value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
        ],
      },
    ];
  },
};

export default nextConfig;