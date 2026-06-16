// Server-side stub for @zama-fhe/relayer-sdk.
// The real SDK is browser-only and loads from CDN at runtime via lib/fhevm.ts.
// Turbopack resolves this file instead of the real package during SSR.

export const createInstance = () => {
  throw new Error("Zama SDK is browser-only. Do not call on the server.");
};
