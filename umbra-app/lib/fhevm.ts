"use client";

// Zama Relayer SDK — loaded from CDN at runtime, not bundled.
// Turbopack cannot bundle the SDK (WebAssembly + browser-only APIs), so we
// skip the npm package entirely and load from the official CDN instead.
// This file must only be imported by "use client" components.

export const FHEVM_CONFIG = {
  aclContractAddress:                        "0x687820221192C5B662b25367F70076A37bc79b6c",
  kmsContractAddress:                        "0x1364cBBf2cDF5032C47d8226a6f6FBD2AFCDacAC",
  inputVerifierContractAddress:              "0xbc91f3daD1A5F19F8390c400196e58073B6a0BC4",
  verifyingContractAddressDecryption:        "0xb6E160B1ff80D67Bfe90A85eE06Ce0A2613607D1",
  verifyingContractAddressInputVerification: "0x7048C39f048125eDa9d678AEbaDfB22F7900a29F",
  chainId: 11155111,
  gatewayChainId: 55815,
  network: "https://ethereum-sepolia-rpc.publicnode.com",
  relayerUrl: "https://relayer.testnet.zama.cloud",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let instanceCache: any = null;

const CDN_URL =
  "https://cdn.jsdelivr.net/npm/@zama-fhe/relayer-sdk@latest/bundle/index.esm.js";

export async function getFhevmInstance() {
  if (typeof window === "undefined") {
    throw new Error("getFhevmInstance must only be called in the browser.");
  }
  if (instanceCache) return instanceCache;

  // Load from CDN — no bundler involvement at all.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { createInstance } = await import(/* webpackIgnore: true */ CDN_URL as any);
  instanceCache = await createInstance(FHEVM_CONFIG);
  return instanceCache;
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
