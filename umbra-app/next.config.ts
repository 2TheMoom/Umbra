import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Zama relayer SDK is browser-only (WebAssembly + browser APIs).
  // This tells Next.js's server bundler to leave it alone rather than
  // trying to resolve/bundle it for SSR.
  serverExternalPackages: ["@zama-fhe/relayer-sdk"],
};

export default nextConfig;