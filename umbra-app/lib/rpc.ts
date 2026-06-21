import { SEPOLIA_RPC, CONTRACTS } from "./contracts";

export interface ChainEvent {
  type: "payment" | "register" | "deposit" | "settle" | "withdrawn" | "limitset";
  transactionHash: string;
  blockNumber: number;
  logIndex: number;
  agentId?: number;
  serviceId?: number;
  toAgentId?: number;
}

// Correct keccak256(eventSignature) topic0 hashes, computed directly from
// the event signatures declared in each contract. This replaces the old
// guess-by-topic-shape heuristic, which could not reliably distinguish
// AgentRegistered from Deposited (both have an address as topics[2]).
const TOPIC0 = {
  AgentRegistered: "0xba9d3be5149ecab5ff8e380633795e5d9153c2f0e1ec952dd1de4611d661c9f5",
  Deposited:        "0x21d3f238b5a9e25ffc48b8320bc1d58882b1d90d0b4fcc7ba9707e3aebfedf16",
  Withdrawn:        "0x8c7cdad0d12a8db3e23561b42da6f10c8137914c97beff202213a410e1f520a3",
  Settled:          "0xf5b268a3ff315cc44ccceeef86259c9e8eef81ceecb14001543809115380dd62",
  AccessGranted:    "0x3c3a9147a1fc73dd51a32f4d10c43d457e8cb826eb6f35cac6349eb965ba82b4",
  PaymentGateSet:   "0xfee5dc4c57f11640a94c9801c0b892a519ac8de44f3b3016cc5362f4a55695b3",
  LimitSet:         "0xe7b7c9d28d0b9d21ed87f4d4ffeedb1aec79db14a27944e751a7add24c50868e",
  PaymentProcessed: "0x84a85c727daf3ea50a42f1bcfca4e66b55705aec2d39a7fe6bf289258c4daa65",
} as const;

async function rpc(method: string, params: unknown[] = []) {
  const res = await fetch(SEPOLIA_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.result;
}

export async function getBlockNumber(): Promise<number> {
  const hex = await rpc("eth_blockNumber");
  return parseInt(hex, 16);
}

export async function checkContract(address: string): Promise<boolean> {
  const code = await rpc("eth_getCode", [address, "latest"]);
  return code && code !== "0x";
}

// Calls AgentVault.agentsOf(owner) to get all agent IDs for a wallet,
// then filters to only those also registered in SpendPolicy (payer agents).
// Service-only agents appear in the vault but not policy, so this
// distinguishes payers from services when both use the same wallet.
export async function fetchAgentsOf(ownerAddress: string): Promise<number[]> {
  const selector  = "0x13844f22"; // keccak256("agentsOf(address)")
  const paddedAddr = ownerAddress.slice(2).toLowerCase().padStart(64, "0");
  const data = selector + paddedAddr;

  const result = await rpc("eth_call", [
    { to: CONTRACTS.vault, data },
    "latest",
  ]);

  if (!result || result === "0x") return [];

  const hex = result.slice(2);
  if (hex.length < 128) return [];

  const length = parseInt(hex.slice(64, 128), 16);
  if (length === 0) return [];

  const agentIds: number[] = [];
  for (let i = 0; i < length; i++) {
    const start = 128 + i * 64;
    const end = start + 64;
    if (end > hex.length) break;
    agentIds.push(parseInt(hex.slice(start, end), 16));
  }

  // Cross-check with SpendPolicy: only keep agents registered there too.
  // agentOwner(uint256) selector: 0x6f6bf118
  // This filters out service-only agents that were registered in the vault
  // by the same wallet but never in SpendPolicy (i.e. not payer agents).
  const policyOwnerSelector = "0x6f6bf118";
  const payerAgents: number[] = [];
  await Promise.all(
    agentIds.map(async (id) => {
      const paddedId = id.toString(16).padStart(64, "0");
      const ownerResult = await rpc("eth_call", [
        { to: CONTRACTS.policy, data: policyOwnerSelector + paddedId },
        "latest",
      ]);
      // Non-zero address means it's registered in policy
      if (ownerResult && ownerResult !== "0x" &&
          ownerResult !== "0x" + "0".repeat(64)) {
        payerAgents.push(id);
      }
    })
  );

  return payerAgents;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getLogs(address: string): Promise<any[]> {
  // sepolia.drpc.org caps eth_getLogs at a 50,000 block range. Since these
  // contracts were just deployed, we only need recent history anyway, not
  // the full chain from genesis. 45,000 blocks (~6 days on Sepolia) gives
  // headroom under the cap while comfortably covering anything since deploy.
  const latest = await getBlockNumber();
  const fromBlock = "0x" + Math.max(0, latest - 9000).toString(16);
  return rpc("eth_getLogs", [{ address, fromBlock, toBlock: "latest" }]);
}

function parseTopicUint(topic: string | undefined): number {
  return topic ? parseInt(topic, 16) : 0;
}

export async function fetchAllEvents(): Promise<{
  events: ChainEvent[];
  totalPayments: number;
  totalAgents: number;
  totalDeposits: number;
  totalSettled: number;
}> {
  const [gateLogs, vaultLogs, policyLogs] = await Promise.all([
    getLogs(CONTRACTS.gate),
    getLogs(CONTRACTS.vault),
    getLogs(CONTRACTS.policy),
  ]);

  const events: ChainEvent[] = [];
  const registeredAgentIds = new Set<number>();

  // PaymentGate: PaymentProcessed(agentId indexed, serviceId indexed, approvedHandle)
  for (const l of gateLogs || []) {
    if (l.topics[0]?.toLowerCase() !== TOPIC0.PaymentProcessed) continue;
    events.push({
      type: "payment",
      transactionHash: l.transactionHash,
      blockNumber: parseInt(l.blockNumber, 16),
      logIndex: parseInt(l.logIndex, 16),
      agentId: parseTopicUint(l.topics[1]),
      serviceId: parseTopicUint(l.topics[2]),
    });
  }

  // AgentVault: AgentRegistered, Deposited, Withdrawn, Settled
  for (const l of vaultLogs || []) {
    const topic0 = l.topics[0]?.toLowerCase();
    const base = {
      transactionHash: l.transactionHash,
      blockNumber: parseInt(l.blockNumber, 16),
      logIndex: parseInt(l.logIndex, 16),
    };

    if (topic0 === TOPIC0.AgentRegistered) {
      const agentId = parseTopicUint(l.topics[1]);
      registeredAgentIds.add(agentId);
      events.push({ type: "register", ...base, agentId });
    } else if (topic0 === TOPIC0.Deposited) {
      events.push({ type: "deposit", ...base, agentId: parseTopicUint(l.topics[1]) });
    } else if (topic0 === TOPIC0.Withdrawn) {
      events.push({ type: "withdrawn", ...base, agentId: parseTopicUint(l.topics[1]) });
    } else if (topic0 === TOPIC0.Settled) {
      events.push({
        type: "settle",
        ...base,
        agentId: parseTopicUint(l.topics[1]),
        toAgentId: parseTopicUint(l.topics[2]),
      });
    }
    // AccessGranted and PaymentGateSet are intentionally not surfaced in the
    // feed, they're setup/admin actions rather than payment activity.
  }

  // SpendPolicy: AgentRegistered (separate from vault's), LimitSet
  for (const l of policyLogs || []) {
    const topic0 = l.topics[0]?.toLowerCase();
    if (topic0 === TOPIC0.LimitSet) {
      events.push({
        type: "limitset",
        transactionHash: l.transactionHash,
        blockNumber: parseInt(l.blockNumber, 16),
        logIndex: parseInt(l.logIndex, 16),
        agentId: parseTopicUint(l.topics[1]),
        serviceId: parseTopicUint(l.topics[2]),
      });
    } else if (topic0 === TOPIC0.AgentRegistered) {
      registeredAgentIds.add(parseTopicUint(l.topics[1]));
    }
  }

  events.sort((a, b) => b.blockNumber - a.blockNumber || b.logIndex - a.logIndex);

  const totalPayments = events.filter((e) => e.type === "payment").length;
  const totalDeposits = events.filter((e) => e.type === "deposit").length;
  const totalSettled = events.filter((e) => e.type === "settle").length;

  return {
    events: events.slice(0, 20),
    totalPayments,
    totalAgents: registeredAgentIds.size,
    totalDeposits,
    totalSettled,
  };
}