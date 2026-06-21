"use client";

const NETWORK_RPC = "https://sepolia.gateway.tenderly.co";
const RELAYER_URL = "https://relayer.testnet.zama.cloud";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let instanceCache: any = null;
let initPromise: Promise<unknown> | null = null;

export async function getFhevmInstance() {
  if (typeof window === "undefined") {
    throw new Error("getFhevmInstance must only be called in the browser.");
  }
  if (instanceCache) return instanceCache;

  if (!initPromise) {
    initPromise = (async () => {
      // zama-sdk.js is an ESM module — load it via dynamic import() using
      // a URL relative to the origin so Turbopack never sees it as a module
      // to bundle (it's in /public, not /src or /lib).
      const origin = window.location.origin;
      const sdk = await import(/* webpackIgnore: true */ `${origin}/zama-sdk.js`);

      if (typeof sdk.initSDK === "function") {
        await sdk.initSDK();
      }

      const config = {
        ...sdk.SepoliaConfig,
        network: NETWORK_RPC,
        relayerUrl: sdk.SepoliaConfig?.relayerUrl ?? RELAYER_URL,
      };

      instanceCache = await sdk.createInstance(config);
      return instanceCache;
    })();
  }

  return initPromise;
}

export async function encryptUint64(
  value: bigint,
  contractAddress: string,
  userAddress: string
): Promise<{ handle: `0x${string}`; proof: `0x${string}` }> {
  const instance = await getFhevmInstance();
  const input = instance.createEncryptedInput(contractAddress, userAddress);
  input.add64(value);
  const encrypted = await input.encrypt();

  const handle = ("0x" +
    Buffer.from(encrypted.handles[0]).toString("hex")) as `0x${string}`;
  const proof = ("0x" +
    Buffer.from(encrypted.inputProof).toString("hex")) as `0x${string}`;

  return { handle, proof };
}