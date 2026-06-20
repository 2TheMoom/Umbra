export const CONTRACTS = {
  vault: "0x2CcBF6614159924337A2281d537869ff2c0d0f66",
  policy: "0x959c14a9b51C4257695Db187273F6f6B9D5CC772",
  gate: "0x9b3480B39a07B091574bccA6F044c03f50dD460C",
} as const;

export const SEPOLIA_CHAIN_ID = 11155111;
export const SEPOLIA_RPC = "https://ethereum-sepolia-rpc.publicnode.com";
export const ETHERSCAN_BASE = "https://sepolia.etherscan.io";

export const VAULT_ABI = [
  {
    type: "event",
    name: "AgentRegistered",
    inputs: [
      { name: "agentId", type: "uint256", indexed: true },
      { name: "owner", type: "address", indexed: true },
    ],
  },
  {
    type: "event",
    name: "Deposited",
    inputs: [
      { name: "agentId", type: "uint256", indexed: true },
      { name: "from", type: "address", indexed: true },
    ],
  },
  {
    type: "event",
    name: "Withdrawn",
    inputs: [
      { name: "agentId", type: "uint256", indexed: true },
      { name: "to", type: "address", indexed: true },
    ],
  },
  {
    type: "event",
    name: "Settled",
    inputs: [
      { name: "fromAgentId", type: "uint256", indexed: true },
      { name: "toAgentId", type: "uint256", indexed: true },
    ],
  },
  {
    type: "event",
    name: "AccessGranted",
    inputs: [
      { name: "agentId", type: "uint256", indexed: true },
      { name: "account", type: "address", indexed: true },
    ],
  },
  {
    type: "function",
    name: "registerAgent",
    stateMutability: "nonpayable",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "deposit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "encryptedAmount", type: "bytes32" },
      { name: "inputProof", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "encryptedAmount", type: "bytes32" },
      { name: "inputProof", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "grantAccess",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "account", type: "address" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "agentOwner",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{ name: "", type: "bytes32" }],
  },
  {
    type: "function",
    name: "paymentGate",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

export const POLICY_ABI = [
  {
    type: "event",
    name: "AgentRegistered",
    inputs: [
      { name: "agentId", type: "uint256", indexed: true },
      { name: "owner", type: "address", indexed: true },
    ],
  },
  {
    type: "event",
    name: "LimitSet",
    inputs: [
      { name: "agentId", type: "uint256", indexed: true },
      { name: "serviceId", type: "uint256", indexed: true },
    ],
  },
  {
    type: "function",
    name: "registerAgent",
    stateMutability: "nonpayable",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "setLimit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "serviceId", type: "uint256" },
      { name: "encryptedLimit", type: "bytes32" },
      { name: "inputProof", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "grantAccess",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "serviceId", type: "uint256" },
      { name: "account", type: "address" },
    ],
    outputs: [],
  },
] as const;

export const GATE_ABI = [
  {
    type: "event",
    name: "PaymentProcessed",
    inputs: [
      { name: "agentId", type: "uint256", indexed: true },
      { name: "serviceId", type: "uint256", indexed: true },
      { name: "approvedHandle", type: "bytes32", indexed: false },
    ],
  },
  {
    type: "function",
    name: "requestPayment",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "serviceId", type: "uint256" },
      { name: "encryptedAmount", type: "bytes32" },
      { name: "inputProof", type: "bytes" },
    ],
    outputs: [],
  },
] as const;
