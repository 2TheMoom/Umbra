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
| `AgentVault`   | `0xE59c34aea43C5f1b52a753983e84178eDDFd6de2`    |
| `SpendPolicy`  | `0x2421a4742734BcC9d9A9BDb548de4273d7e27330`     |
| `PaymentGate`  | `0xE655863bA1349241201A1a7DcD971d9fcD22D751`     |

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
