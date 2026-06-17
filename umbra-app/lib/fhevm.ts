"use client";

// Zama Relayer SDK — loaded via dynamic import() of the real npm package.
// Using a bare specifier (not a CDN URL) lets webpack/Turbopack resolve it
// from node_modules correctly, while the dynamic import() (not a static
// top-level import) keeps it out of the server-rendered bundle, since this
// package is browser-only (WebAssembly + browser APIs).
//
// This file must only ever be imported by "use client" components.

// We import the explicit "/web" subpath because the package's default
// export (and its types) point at the Node.js build by default, which
// is wrong for a browser context like this one.
//
// We use the SDK's own built-in SepoliaConfig for the protocol contract
// addresses (ACL, Coprocessor, KMSVerifier), rather than hand-typed
// addresses. Those addresses are tied to whatever @fhevm/solidity version
// the deployed contracts were compiled against; our contracts are compiled
// against @fhevm/solidity@0.11.1 with ZamaEthereumConfig, which matches
// the SDK's SepoliaConfig exactly. If contracts are ever redeployed against
// a different @fhevm/solidity version, this needs to stay in sync.
const NETWORK_RPC = "https://sepolia.drpc.org";
const RELAYER_URL = "https://relayer.testnet.zama.cloud";

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
      const sdk = await import("@zama-fhe/relayer-sdk/web");

      // initSDK() loads the WASM binary; required before createInstance().
      if (typeof sdk.initSDK === "function") {
        await sdk.initSDK();
      }

      // sdk.SepoliaConfig's type is `Omit<FullConfig, "network">`, network
      // is intentionally excluded and must always be supplied separately.
      const config = {
        ...sdk.SepoliaConfig,
        network: NETWORK_RPC,
        relayerUrl: (sdk.SepoliaConfig as { relayerUrl?: string })?.relayerUrl ?? RELAYER_URL,
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