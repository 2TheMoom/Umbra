# Umbra — Contracts

Confidential agent payment gate built on Zama's FHEVM (Zama Developer
Program, Season 3, Builder Track). This package holds the on-chain side:
`AgentVault`, `SpendPolicy`, and `PaymentGate`.

**Deployed and verified on Sepolia:**

| Contract       | Address                                                                                                                              |
|----------------|--------------------------------------------------------------------------------------------------------------------------------------|
| `AgentVault`   | [`0x2CcBF6614159924337A2281d537869ff2c0d0f66`](https://sepolia.etherscan.io/address/0x2CcBF6614159924337A2281d537869ff2c0d0f66#code) |
| `SpendPolicy`  | [`0x959c14a9b51C4257695Db187273F6f6B9D5CC772`](https://sepolia.etherscan.io/address/0x959c14a9b51C4257695Db187273F6f6B9D5CC772#code) |
| `PaymentGate`  | [`0x9b3480B39a07B091574bccA6F044c03f50dD460C`](https://sepolia.etherscan.io/address/0x9b3480B39a07B091574bccA6F044c03f50dD460C#code) |

## What each contract does

| Contract         | Description |
|------------------|-------------|
| `AgentVault.sol`  | Encrypted balances per agent. Stores `euint64` balance, `_totalSpent`, and `_totalReceived` per agent ID. `settlePayment` is callable only by `PaymentGate`. `agentsOf(address)` returns all agent IDs owned by a wallet, used by the frontend for auto-detection on connect. |
| `SpendPolicy.sol` | Encrypted spend limits and frequency limits per agent/service pair. Tracks `_maxCount`, `_paymentCount`, and `_windowStart` (7,200-block rolling window, ~24h on Sepolia). `blocksUntilReset` is a plaintext view used by the dashboard. |
| `PaymentGate.sol` | The payment processor. `requestPayment` runs three FHE checks on ciphertext: `FHE.le(amount, balance)`, `FHE.le(amount, spendLimit)`, and `FHE.lt(count, maxCount)` (frequency, skipped if no limit set). `FHE.and` combines all three. `FHE.select` resolves the transfer amount to zero if any check fails. Increments the frequency counter and emits a publicly decryptable `approved` flag. |

## Important: @fhevm/solidity version

These contracts are compiled against `@fhevm/solidity@0.11.1` using
`ZamaEthereumConfig`. The library's bundled protocol addresses (ACL,
Coprocessor, KMSVerifier) must match what the Zama Relayer SDK expects on
the frontend. An outdated version will compile and deploy without error,
but every `FHE.fromExternal` call will revert on-chain with no decodable
reason. If upgrading either side, verify that the frontend's
`sdk.SepoliaConfig` and `ZamaConfig.sol` agree on all three addresses.

## Setup sequence (per agent, before requestPayment works)

```
vault.registerAgent(agentId)
vault.registerAgent(serviceId)
vault.deposit(agentId, encryptedAmount, inputProof)
policy.registerAgent(agentId)
policy.setLimit(agentId, serviceId, encryptedLimit, inputProof)
policy.setFrequencyLimit(agentId, serviceId, encryptedMaxCount, inputProof)  // optional
vault.grantAccess(agentId, paymentGateAddress)
policy.grantAccess(agentId, serviceId, paymentGateAddress)
```

`PaymentGate` needs FHEVM ACL permission to operate on ciphertext it does
not own. If `grantAccess` is skipped, `requestPayment` reverts on an FHEVM
permission error rather than a Solidity one.

## Setup

```bash
npm install

# One-time config for Sepolia deploys
npx hardhat vars set MNEMONIC
npx hardhat vars set ETHERSCAN_API_KEY
```

## Compile

```bash
npm run compile
```

## Test (FHEVM mock mode, in-memory)

```bash
npm test
```

19 tests across two suites:

**AgentVault.test.ts (8 tests):** registration, double-registration
rejection, encrypted deposit, encrypted withdrawal, over-balance withdrawal
resolves to zero via `FHE.select`, access control on owner-only functions,
`agentsOf` returning all IDs for a wallet, `totalSpent` and `totalReceived`
initializing to zero.

**PaymentGate.test.ts (11 tests):** approved payment within balance and
limit, declined over limit, declined over balance, `totalSpent` updates on
approval, `totalReceived` updates on approval, `totalSpent` unchanged on
decline, frequency limit approve, frequency limit decline after cap hit,
payment without frequency limit set, `blocksUntilReset` before and after
`setFrequencyLimit`.

## Deploy

```bash
# Sepolia
npm run deploy:sepolia

# Verify (PaymentGate needs constructor args)
npx hardhat verify --network sepolia <AGENT_VAULT_ADDRESS>
npx hardhat verify --network sepolia <SPEND_POLICY_ADDRESS>
npx hardhat verify --network sepolia <PAYMENT_GATE_ADDRESS> <AGENT_VAULT_ADDRESS> <SPEND_POLICY_ADDRESS>
```

## Architecture

```
AgentVault          SpendPolicy         PaymentGate
──────────          ───────────         ───────────
euint64 balance     euint64 limit       requestPayment()
euint64 totalSpent  euint64 maxCount      FHE.le(amount, balance)
euint64 totalRcvd   euint64 count         FHE.le(amount, limit)
agentsOf(addr)      windowStart (plain)   FHE.lt(count, maxCount)
settlePayment()     blocksUntilReset()    FHE.and / FHE.select
grantAccess()       grantAccess()         incrementCount()
                                          makePubliclyDecryptable()
```

Every encrypted value is `euint64`. Authorization runs entirely on
ciphertext. The only plaintext output is `PaymentProcessed(agentId,
serviceId, approvedHandle)` where `approvedHandle` is publicly decryptable
via the Zama relayer's public decryption endpoint.

## Roadmap

- Agent-initiated invoices (`InvoiceRegistry.sol`, standalone contract)
- Agent Health Score (0–100 combining spend discipline, frequency compliance, encryption status)
- Agent management actions (modify limits, revoke access, pause agent)
- Privacy mode toggle for the dashboard