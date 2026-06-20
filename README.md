# Umbra

Confidential payment authorization for autonomous agents, built on Zama's
FHEVM. Balances, spend limits, and transfer amounts stay encrypted end to
end. The only thing that ever goes on-chain in plaintext is whether a
payment was approved or declined.

Built for the [Zama Developer Program](https://www.zama.org), Season 3,
Builder Track.

## The problem

Autonomous agents that pay each other today do it on public ledgers. Every
balance, every fee, every spend limit is visible to every competitor and
counterparty, forever. An agent's entire pricing strategy and treasury
leak the moment its first transaction lands on chain.

## What Umbra does

Umbra is a private payment gate that sits between agents. An agent deposits
funds into an encrypted vault, sets an encrypted per-service spend limit,
and from then on every payment request is authorized entirely on
ciphertext, no plaintext amount is ever submitted, computed on, or stored
on-chain.

```
1. ENCRYPT    →  caller's wallet encrypts the amount client-side
2. AUTHORIZE  →  FHE.le(amount, balance) && FHE.le(amount, limit)
3. SETTLE     →  balances update on ciphertext; only an approved/declined
                  flag is ever made public
```

## Live on Sepolia

| Contract       | Address                                       |
|----------------|------------------------------------------------|
| `AgentVault`   | `0x2CcBF6614159924337A2281d537869ff2c0d0f66`    |
| `SpendPolicy`  | `0x959c14a9b51C4257695Db187273F6f6B9D5CC772`     |
| `PaymentGate`  | `0x9b3480B39a07B091574bccA6F044c03f50dD460C`     |

## Repo structure

```
umbra-contracts/   Solidity contracts, tests, deploy scripts (Hardhat + FHEVM)
umbra-app/         Next.js app: landing page, live dashboard, try-it widget
```

Each package has its own README with setup, test, and deploy instructions:

- [`umbra-contracts/README.md`](./umbra-contracts/README.md)
- [`umbra-app/README.md`](./umbra-app/README.md)

## Try it

The live dashboard reads real Sepolia events directly from the deployed
contracts, no backend, no indexer. The try-it widget walks through the
full flow (register → encrypt & deposit → set limit → grant access → send
a confidential payment) against the addresses above, using the
[Zama Relayer SDK](https://docs.zama.org/protocol/relayer-sdk-guides) to
encrypt every input client-side before it ever reaches the chain.

## Built on

`ERC-7984` · `ERC-8004` · `FHEVM` · `x402` · Zama Relayer SDK

## Author

Built by [Abu Olumi](https://x.com/Olumi441).
