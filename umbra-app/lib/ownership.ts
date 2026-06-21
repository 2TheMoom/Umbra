"use client";

// Wallet ownership proof for Umbra.
//
// Before any encrypted agent data is decrypted (balance, totalSpent,
// totalReceived, frequency counts), the connected wallet must sign a
// structured message that:
//   1. Proves they own the wallet (recovered signer must match)
//   2. Binds the proof to a specific agent ID and timestamp (prevents replay)
//   3. Feeds into the Zama Relayer SDK's EIP-712 user-decryption flow
//
// The signature never leaves the browser. It is used client-side only to
// authorize the FHEVM decryption request.

export interface OwnershipProof {
  agentId: number;
  wallet: string;
  timestamp: number;
  signature: string;
}

// Builds the human-readable message the user signs in MetaMask.
// Accepts an explicit timestamp so that verifyOwnership can reconstruct
// the exact same message that was presented during signing.
export function buildOwnershipMessage(
  agentId: number,
  wallet: string,
  timestamp: number
): string {
  return [
    "Umbra — Prove Agent Ownership",
    "",
    `Agent ID: ${agentId}`,
    `Wallet:   ${wallet}`,
    `Time:     ${timestamp}`,
    "",
    "This signature proves you own this agent.",
    "It never leaves your browser.",
  ].join("\n");
}

// Requests a signature from the connected wallet via MetaMask's
// personal_sign. Returns the full OwnershipProof on success.
export async function signOwnership(
  agentId: number,
  wallet: string
): Promise<OwnershipProof> {
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error("No wallet found.");
  }

  // Capture the timestamp once and pass it into buildOwnershipMessage
  // so the same value is used for both signing and later verification.
  const timestamp = Math.floor(Date.now() / 1000);
  const message = buildOwnershipMessage(agentId, wallet, timestamp);

  // personal_sign prepends "\x19Ethereum Signed Message:\n" automatically.
  const signature = await window.ethereum.request({
    method: "personal_sign",
    params: [message, wallet],
  });

  return { agentId, wallet, timestamp, signature };
}

// Verifies the recovered signer matches the claimed wallet address.
// Uses the timestamp stored in the proof to reconstruct the exact message
// that was signed, then recovers the signer via viem.
export async function verifyOwnership(proof: OwnershipProof): Promise<boolean> {
  try {
    const { recoverMessageAddress } = await import("viem");

    // Use proof.timestamp (not Date.now()) so the message exactly matches
    // what was presented to the wallet during signing.
    const message = buildOwnershipMessage(
      proof.agentId,
      proof.wallet,
      proof.timestamp
    );

    const recovered = await recoverMessageAddress({
      message,
      signature: proof.signature as `0x${string}`,
    });

    return recovered.toLowerCase() === proof.wallet.toLowerCase();
  } catch {
    return false;
  }
}