"use client";

// Zama Relayer SDK — loaded via dynamic import() of the real npm package.
// Using a bare specifier (not a CDN URL) lets webpack/Turbopack resolve it
// from node_modules correctly, while the dynamic import() (not a static
// top-level import) keeps it out of the server-rendered bundle, since this
// package is browser-only (WebAssembly + browser APIs).
//
// This file must only ever be imported by "use client" components.

// Official Sepolia config addresses, from:
// https://docs.zama.org/protocol/relayer-sdk-guides/fhevm-relayer/initialization
export const FHEVM_CONFIG = {
  aclContractAddress: "0x687820221192C5B662b25367F70076A37bc79b6c",
  kmsContractAddress: "0x1364cBBf2cDF5032C47d8226a6f6FBD2AFCDacAC",
  inputVerifierContractAddress: "0xbc91f3daD1A5F19F8390c400196e58073B6a0BC4",
  verifyingContractAddressDecryption: "0xb6E160B1ff80D67Bfe90A85eE06Ce0A2613607D1",
  verifyingContractAddressInputVerification: "0x7048C39f048125eDa9d678AEbaDfB22F7900a29F",
  chainId: 11155111,
  gatewayChainId: 55815,
  network: "https://sepolia.drpc.org",
  relayerUrl: "https://relayer.testnet.zama.cloud",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let instanceCache: any = null;
let initPromise: Promise<unknown> | null = null;

export async function getFhevmInstance() {
  if (typeof window === "undefined") {
    throw new Error("getFhevmInstance must only be called in the browser.");
  }
  if (instanceCache) return instanceCache;

  // Guard against double-init if multiple steps call this concurrently.
  if (!initPromise) {
    initPromise = (async () => {
      // Dynamic import of the real npm package, resolved from node_modules.
      // We import the explicit "/web" subpath because the package's default
      // export (and its types) point at the Node.js build by default, which
      // is wrong for a browser context like this one.
      const sdk = await import("@zama-fhe/relayer-sdk/web");

      // initSDK() loads the WASM binary; required before createInstance().
      if (typeof sdk.initSDK === "function") {
        await sdk.initSDK();
      }

      // CRITICAL FIX: use the SDK's own built-in SepoliaConfig instead of
      // hand-typed addresses from docs.zama.org. Console logging revealed
      // these two sources disagree (different ACL/KMS/InputVerifier
      // addresses), and forcing the docs-page addresses was producing a
      // misconfigured instance that failed to reach the relayer at all
      // (ERR_NAME_NOT_RESOLVED on relayer.testnet.zama.cloud/keyurl).
      //
      // sdk.SepoliaConfig's type is `Omit<FullConfig, "network">`, meaning
      // network is intentionally excluded and must always be supplied
      // separately, it's never part of this object.
      const sepoliaConfig = sdk.SepoliaConfig ?? {};
      const config = {
        ...sepoliaConfig,
        network: FHEVM_CONFIG.network,
        relayerUrl: (sepoliaConfig as { relayerUrl?: string }).relayerUrl ?? FHEVM_CONFIG.relayerUrl,
      };

      console.log("[fhevm] sdk.SepoliaConfig as-is:", sdk.SepoliaConfig);
      console.log("[fhevm] final merged config being used:", config);

      instanceCache = await sdk.createInstance(config);
      console.log("[fhevm] instance created:", instanceCache);
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
  console.log("[fhevm] encryptUint64 called:", { value: value.toString(), contractAddress, userAddress });

  const instance = await getFhevmInstance();
  const input = instance.createEncryptedInput(contractAddress, userAddress);
  input.add64(value);

  console.log("[fhevm] calling input.encrypt()...");
  const encrypted = await input.encrypt();
  console.log("[fhevm] raw encrypted result:", encrypted);
  console.log("[fhevm] handles:", encrypted.handles);
  console.log("[fhevm] inputProof length:", encrypted.inputProof?.length);

  const handle = ("0x" +
    Buffer.from(encrypted.handles[0]).toString("hex")) as `0x${string}`;
  const proof = ("0x" +
    Buffer.from(encrypted.inputProof).toString("hex")) as `0x${string}`;

  console.log("[fhevm] final handle:", handle);
  console.log("[fhevm] final proof (first 100 chars):", proof.slice(0, 100));
  console.log("[fhevm] final proof length:", proof.length);

  return { handle, proof };
}