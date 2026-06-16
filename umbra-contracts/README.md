# Umbra — Contracts

Confidential agent payment gate built on Zama's FHEVM (Mainnet Season 3,
Builder Track). This package holds the on-chain side: `AgentVault`,
`SpendPolicy`, `PaymentGate`, and `AgentRegistryAdapter`.

## Status

| Contract              | Status                                      |
|------------------------|---------------------------------------------|
| `AgentVault.sol`        | **Implemented.** Encrypted deposit/withdraw, FHE.select-based safe withdrawal, `settlePayment` for PaymentGate, access control via `FHE.allow`. |
| `SpendPolicy.sol`       | **Implemented.** Encrypted per-agent/per-service spend limits. |
| `PaymentGate.sol`       | **Implemented.** `requestPayment` runs `FHE.le` against balance and limit, `FHE.and`, `FHE.select`, settles via AgentVault, and makes the approval flag publicly decryptable. |
| `AgentRegistryAdapter.sol` | Stub. Will forward to the existing ERC-8004 registry. Milestone 3. |

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
