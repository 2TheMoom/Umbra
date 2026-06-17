# Umbra — Contracts

Confidential agent payment gate built on Zama's FHEVM (Zama Developer
Program, Season 3, Builder Track). This package holds the on-chain side:
`AgentVault`, `SpendPolicy`, and `PaymentGate`.

**Deployed and verified on Sepolia:**

| Contract       | Address                                       |
|----------------|------------------------------------------------|
| `AgentVault`   | [`0xE59c34aea43C5f1b52a753983e84178eDDFd6de2`](https://sepolia.etherscan.io/address/0xE59c34aea43C5f1b52a753983e84178eDDFd6de2) |
| `SpendPolicy`  | [`0x2421a4742734BcC9d9A9BDb548de4273d7e27330`](https://sepolia.etherscan.io/address/0x2421a4742734BcC9d9A9BDb548de4273d7e27330) |
| `PaymentGate`  | [`0xE655863bA1349241201A1a7DcD971d9fcD22D751`](https://sepolia.etherscan.io/address/0xE655863bA1349241201A1a7DcD971d9fcD22D751) |

## Status

| Contract              | Status                                      |
|------------------------|---------------------------------------------|
| `AgentVault.sol`        | **Implemented and deployed.** Encrypted deposit/withdraw, FHE.select-based safe withdrawal, `settlePayment` for PaymentGate, access control via `FHE.allow`. |
| `SpendPolicy.sol`       | **Implemented and deployed.** Encrypted per-agent/per-service spend limits. |
| `PaymentGate.sol`       | **Implemented and deployed.** `requestPayment` runs `FHE.le` against balance and limit, `FHE.and`, `FHE.select`, settles via AgentVault, and makes the approval flag publicly decryptable. |
| `AgentRegistryAdapter.sol` | Stub, not deployed. `AgentVault` and `SpendPolicy` track agent ownership locally for now; this will forward to the existing ERC-8004 registry in a later milestone. |

**Important:** these contracts are compiled against `@fhevm/solidity@0.11.1`
using `ZamaEthereumConfig`. The library's bundled protocol addresses (ACL,
Coprocessor, KMSVerifier) must match what the Zama Relayer SDK expects on
the frontend. An outdated `@fhevm/solidity` version will compile and
deploy without error, but every `FHE.fromExternal` call will revert
on-chain with no decodable reason, since the deployed bytecode trusts
different coprocessor addresses than the ones the relayer's proofs are
valid for. If upgrading either side, check that the frontend's
`sdk.SepoliaConfig` and this package's `ZamaConfig.sol` agree.

## Setup sequence (per agent, before requestPayment works)

PaymentGate needs FHEVM ACL permission to operate on ciphertext it doesn't
own. This is the part that's easy to miss, if it's skipped, `requestPayment`
reverts on an FHEVM permission error rather than a Solidity one.

```
vault.registerAgent(agentId)
vault.registerAgent(serviceId)        // the receiving side is an agent too
vault.deposit(agentId, ...)           // fund the vault
policy.registerAgent(agentId)
policy.setLimit(agentId, serviceId, ...)
vault.grantAccess(agentId, paymentGateAddress)
policy.grantAccess(agentId, serviceId, paymentGateAddress)
```

`PaymentGate.test.ts` does all of this in `beforeEach` and covers three
cases: approved (within balance and limit), declined for exceeding the
spend limit, and declined for exceeding the balance.

## Setup

```bash
npm install

# One-time config for Sepolia deploys
npx hardhat vars set MNEMONIC
npx hardhat vars set INFURA_API_KEY
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

`AgentVault.test.ts` covers: agent registration, double-registration
rejection, encrypted deposit, encrypted withdrawal, the over-balance
withdrawal case (resolves to zero via `FHE.select` instead of reverting),
and access control on all owner-only functions.

## Deploy

```bash
# Local FHEVM-ready node
npx hardhat node
npm run deploy:localhost

# Sepolia
npm run deploy:sepolia
npm run verify:sepolia <CONTRACT_ADDRESS>
```

## Architecture

See the full spec and architecture diagram for how `AgentVault`,
`SpendPolicy`, `PaymentGate`, and `AgentRegistryAdapter` fit together,
and the security model: balances, limits, and amounts are `euint64`
ciphertext end to end, authorization runs via `FHE.le` / `FHE.select`
on ciphertext, and the only thing that ever goes on-chain in plaintext
is a `PaymentProcessed(agentId, serviceId, approved)` event.
