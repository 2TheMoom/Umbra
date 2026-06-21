import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Zama relayer SDK is browser-only (WebAssembly + browser APIs).
  // This tells Next.js's server bundler to leave it alone rather than
  // trying to resolve/bundle it for SSR.
  serverExternalPackages: ["@zama-fhe/relayer-sdk"],

  // Disable Turbopack — it has a bundling conflict with the Zama Relayer
  // SDK's WebAssembly module. Webpack handles it cleanly.
  turbopack: undefined,

  // Cross-Origin headers required by the Zama Relayer SDK's WASM threading.
  // Without these, SharedArrayBuffer (used by the WASM binary) is blocked
  // by the browser's cross-origin isolation policy.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Cross-Origin-Opener-Policy",   value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy",  value: "require-corp" },
        ],
      },
    ];
  },
};

export default nextConfig;