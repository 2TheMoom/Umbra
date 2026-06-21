# Umbra

Confidential payment authorization for autonomous agents, built on Zama's
FHEVM. Balances, spend limits, frequency limits, and transfer amounts stay
encrypted end to end. The only thing that ever goes on-chain in plaintext
is whether a payment was approved or declined.

Built for the [Zama Developer Program](https://www.zama.org), Season 3,
Builder Track.

## The problem

Autonomous agents that pay each other today do it on public ledgers. Every
balance, every fee, every spend limit is visible to every competitor and
counterparty, forever. An agent's entire pricing strategy and treasury
leak the moment its first transaction lands on chain.

## What Umbra does

Umbra is a private payment gate that sits between agents. An agent deposits
funds into an encrypted vault, sets an encrypted per-service spend limit
and frequency cap, and from then on every payment request is authorized
entirely on ciphertext. No plaintext amount is ever submitted, computed on,
or stored on-chain.

```
1. ENCRYPT    →  caller's wallet encrypts the amount client-side via Zama Relayer SDK
2. AUTHORIZE  →  FHE.le(amount, balance)
                 FHE.le(amount, spendLimit)
                 FHE.lt(paymentCount, maxCount)   // frequency check
                 FHE.and across all three
3. SETTLE     →  FHE.select resolves transfer to zero if any check fails
                 balances update on ciphertext
                 only an approved/declined flag is ever made public
```

## Live on Sepolia

| Contract       | Address                                                                                                                              |
|----------------|--------------------------------------------------------------------------------------------------------------------------------------|
| `AgentVault`   | [`0x2CcBF6614159924337A2281d537869ff2c0d0f66`](https://sepolia.etherscan.io/address/0x2CcBF6614159924337A2281d537869ff2c0d0f66#code) |
| `SpendPolicy`  | [`0x959c14a9b51C4257695Db187273F6f6B9D5CC772`](https://sepolia.etherscan.io/address/0x959c14a9b51C4257695Db187273F6f6B9D5CC772#code) |
| `PaymentGate`  | [`0x9b3480B39a07B091574bccA6F044c03f50dD460C`](https://sepolia.etherscan.io/address/0x9b3480B39a07B091574bccA6F044c03f50dD460C#code) |

## Features

**Confidential balances** — agent vault holds `euint64` balances that are
never exposed. Only the agent owner, holding the right EIP-712 signature,
can decrypt their own balance via the Zama relayer's user-decryption
endpoint.

**Encrypted spend limits** — per-service spend caps stored as `euint64`.
`PaymentGate` runs `FHE.le(amount, limit)` before settling, entirely on
ciphertext. Neither the limit value nor the payment amount is ever visible.

**Frequency limiting** — per-service payment caps within a rolling 7,200-
block window (~24h on Sepolia). The count stays encrypted; only the window
start block is public. `FHE.lt(count, maxCount)` adds a third authorization
layer on top of balance and spend checks.

**Encrypted spend analytics** — `AgentVault` tracks `_totalSpent` and
`_totalReceived` as encrypted running totals, updated inside
`settlePayment`. Owners can decrypt all four values (balance, limit, spent,
received) in a single EIP-712 user-decryption request from the dashboard.

**Wallet auto-detect** — `agentsOf(address)` returns all agent IDs
registered to a wallet. The dashboard and try-it page call this on connect
and skip the registration step if agents are already found.

**Wallet ownership proof** — before any decryption, the user signs a
`personal_sign` message binding their wallet to a specific agent ID and
timestamp. Verified client-side via viem's `recoverMessageAddress`.

## Repo structure

```
umbra-contracts/   Solidity contracts, tests, deploy scripts (Hardhat + FHEVM)
umbra-app/         Next.js app: landing page, live dashboard, try-it widget
```

Each package has its own README:

- [`umbra-contracts/README.md`](./umbra-contracts/README.md)
- [`umbra-app/README.md`](./umbra-app/README.md)

## Try it

The live dashboard reads real Sepolia events directly from the deployed
contracts, no backend, no indexer. The try-it widget walks through the
full 6-step flow:

```
1. Register agents (skipped automatically if wallet already has one)
2. Encrypt & deposit
3. Set spend limit
4. Set frequency limit
5. Grant PaymentGate FHE access
6. Send confidential payment
```

Every input is encrypted client-side by the
[Zama Relayer SDK](https://docs.zama.org/protocol/relayer-sdk-guides)
before it touches the chain.

## Test results

```
AgentVault  (8/8)   PaymentGate  (11/11)
────────────────    ──────────────────────
✔ registration      ✔ approved within limit
✔ deposit           ✔ declined over limit
✔ withdrawal        ✔ declined over balance
✔ safe over-bal     ✔ totalSpent on approve
✔ access control    ✔ totalReceived on approve
✔ agentsOf          ✔ totalSpent on decline
✔ totalSpent init   ✔ freq approve
✔ totalRcvd init    ✔ freq decline at cap
                    ✔ no freq limit set
                    ✔ blocksUntilReset=0 before
                    ✔ blocksUntilReset>0 after
```

19/19 passing, FHEVM mock mode.

## Built on

`@fhevm/solidity@0.11.1` · `@zama-fhe/relayer-sdk@0.4.3` · `ERC-7984` ·
`ERC-8004` · `x402` · Next.js 16 · wagmi v2 · viem

## Roadmap

- Agent-initiated invoices (`InvoiceRegistry.sol`, standalone contract)
- Agent Health Score (0–100 combining spend discipline, frequency compliance, encryption status)
- Agent management actions (modify limits, revoke access, pause agent)
- Privacy mode toggle for the dashboard

## Author

Built by [Abu Olumi](https://x.com/Olumi441).