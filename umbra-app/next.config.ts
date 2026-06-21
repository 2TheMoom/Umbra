import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@zama-fhe/relayer-sdk"],

  turbopack: {
    resolveAlias: {
      // Point the Zama SDK's browser import to an empty shim at build time.
      // The real SDK is loaded at runtime via dynamic import() in the browser.
      // This prevents Turbopack from trying to bundle the WASM at build time.
      "@zama-fhe/relayer-sdk/web": { browser: "./lib/zama-shim.ts" },
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