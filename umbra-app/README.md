# Umbra — App

Next.js 16 frontend for Umbra: landing page, live dashboard, and the
try-it widget. Reads directly from Sepolia, no backend, no indexer.

## Pages

| Route        | What it does |
|--------------|--------------|
| `/`          | Landing page: the problem, how it works, contract addresses |
| `/dashboard` | Live protocol status, real Sepolia event feed, FHE operations log |
| `/tryit`     | Connects a wallet and walks through the full payment flow against the deployed contracts |

## Setup

```bash
npm install
```

## Run

```bash
npm run dev -- --webpack
```

The `--webpack` flag is currently required. Turbopack (Next.js 16's
default) has a bundling conflict with the Zama Relayer SDK's WebAssembly
module that causes an internal crash; webpack mode handles it cleanly.

Open `http://localhost:3000`.

## Stack

- **Next.js 16** (App Router, webpack mode)
- **wagmi v2** + **viem** for wallet connection and contract calls
- **@zama-fhe/relayer-sdk** for client-side FHE encryption, loaded via the
  SDK's own `SepoliaConfig` rather than hand-typed addresses (the two can
  drift out of sync; always prefer the SDK's built-in config)
- **Tailwind v4** for styling

## Structure

```
app/
  page.tsx              landing page
  dashboard/page.tsx    live dashboard
  tryit/page.tsx        5-step payment flow widget
  layout.tsx            shared layout, fonts, providers
components/
  Topbar.tsx
  Footer.tsx
lib/
  contracts.ts           addresses + ABIs
  rpc.ts                 event fetching via eth_getLogs, matched by real
                          keccak256 topic0 hashes (not topic-shape guessing)
  fhevm.ts                Zama Relayer SDK wrapper, browser-only
  providers.tsx           wagmi + react-query setup
```

## Notes on the FHEVM integration

`lib/fhevm.ts` dynamically imports `@zama-fhe/relayer-sdk/web` (the `/web`
subpath specifically, the package's default export points at a Node.js
build that doesn't work in the browser) and initializes the relayer
instance using the SDK's own exported `SepoliaConfig`, with `network` and
`relayerUrl` filled in separately since `SepoliaConfig`'s type explicitly
excludes `network`.

Three contract calls (`deposit`, `setLimit`, `requestPayment`) use explicit
gas limits rather than relying on auto-estimation, since FHE operations on
ciphertext can produce unusually high gas estimates that some RPC
providers reject outright.

## Author

Built by [Abu Olumi](https://x.com/Olumi441).