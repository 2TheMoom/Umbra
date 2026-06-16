import Link from "next/link";
import { Topbar } from "@/components/Topbar";
import { CONTRACTS, ETHERSCAN_BASE } from "@/lib/contracts";

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      <Topbar />

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-6 py-16 grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
        <div>
          <h1 className="font-bold text-[52px] leading-[1.05] tracking-tight">
            Agent payments, without{" "}
            <span className="text-[#1f3a8f]">the public ledger.</span>
          </h1>
          <p className="text-[17px] text-[#5a5a60] leading-relaxed mt-5 mb-7 max-w-[480px]">
            Umbra is a confidential payment gate for autonomous agents. Balances,
            spend limits, and transfer amounts stay encrypted with FHE.
            Authorization runs entirely on ciphertext. Only approved or declined
            ever goes public.
          </p>
          <div className="flex gap-3 flex-wrap">
            <Link
              href="/dashboard"
              className="flex items-center gap-2 bg-[#1f3a8f] text-white mono text-[12px] font-bold tracking-widest px-5 py-3 rounded-md no-underline"
            >
              OPEN DASHBOARD
            </Link>
            <Link
              href="/tryit"
              className="flex items-center gap-2 border-2 border-[#161719] text-[#161719] mono text-[12px] font-bold tracking-widest px-5 py-3 rounded-md no-underline"
            >
              TRY IT LIVE
            </Link>
          </div>
          <div className="mt-7 mono text-[11px] text-[#5a5a60] flex gap-5 flex-wrap">
            <span><span className="text-[#1a6b3c]">●</span> Sepolia deployed</span>
            <span><span className="text-[#1a6b3c]">●</span> 100% encrypted</span>
            <span><span className="text-[#1a6b3c]">●</span> 9/9 tests passing</span>
          </div>
        </div>

        {/* Decrypt card */}
        <DecryptCard />
      </section>

      {/* Problem */}
      <section className="bg-[#161719] text-[#f0ede7] py-14">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-10">
            {[
              { title: "Balances, public.", body: "Every agent's treasury is visible to every competitor and counterparty, forever." },
              { title: "Fees, public.", body: "Pricing strategy leaks the moment the first transaction lands on chain." },
              { title: "Spend limits, public.", body: "Authorization logic exposes exactly how much an agent can ever pay for anything." },
            ].map((item) => (
              <div key={item.title} className="border-l-[3px] border-[#b01c2e] pl-4">
                <div className="font-bold text-[22px] mb-2">{item.title}</div>
                <div className="text-[14px] text-[#f0ede7]/50 leading-relaxed">{item.body}</div>
              </div>
            ))}
          </div>
          <h2 className="font-bold text-[32px] text-center">
            <span className="text-[#ffd208]">Umbra</span> encrypts all of it.
          </h2>
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <div className="mono text-[11px] tracking-[0.16em] text-[#5a5a60] uppercase mb-2">
          How it works
        </div>
        <h2 className="font-bold text-[34px] mb-10 max-w-[500px]">
          Three steps, none of them touch plaintext.
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {[
            {
              step: "01 / ENCRYPT",
              title: "Client-side encryption",
              body: "The caller's wallet encrypts the payment amount with the Zama Relayer SDK before it ever reaches the chain.",
              code: "FHE.asEuint64(encryptedAmount, inputProof)",
              yellow: false,
            },
            {
              step: "02 / AUTHORIZE",
              title: "FHE authorization",
              body: "PaymentGate checks the vault balance and spend policy, then resolves the transfer, all on ciphertext.",
              code: "FHE.le(amount, balance) && FHE.le(amount, limit)",
              yellow: true,
            },
            {
              step: "03 / SETTLE",
              title: "Confidential settlement",
              body: "Balances update inside AgentVault. The only public trace is a PaymentProcessed event with an approved flag.",
              code: "PaymentProcessed(agentId, serviceId, approved)",
              yellow: false,
            },
          ].map((item) => (
            <div
              key={item.step}
              className="bg-[#f0ede7] border border-[rgba(22,23,25,0.12)] rounded-lg p-5"
            >
              <div className="mono text-[12px] font-bold text-[#1f3a8f] tracking-widest mb-2">
                {item.step}
              </div>
              <h3 className="font-bold text-[20px] mb-2">{item.title}</h3>
              <p className="text-[13px] text-[#5a5a60] leading-relaxed mb-4">{item.body}</p>
              <div
                className={`mono text-[12px] rounded-md px-3 py-2 ${
                  item.yellow
                    ? "bg-[rgba(255,210,8,0.18)] text-[#161719]"
                    : "bg-[#e2ded5] text-[#1f3a8f]"
                }`}
              >
                {item.code}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Composability */}
      <section className="bg-[#f0ede7] border-y border-[rgba(22,23,25,0.12)] py-12">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <div className="mono text-[11px] tracking-[0.16em] text-[#5a5a60] uppercase mb-3">
            Built on
          </div>
          <h2 className="font-bold text-[26px] mb-5">Composable by design</h2>
          <div className="flex justify-center flex-wrap gap-3">
            {["ERC-7984", "ERC-8004", "FHEVM", "x402", "TokenOps SDK"].map((b) => (
              <span
                key={b}
                className="mono text-[12px] font-semibold border-[1.5px] border-[#1f3a8f] text-[#1f3a8f] px-4 py-2 rounded-full"
              >
                {b}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Contracts */}
      <section className="max-w-5xl mx-auto px-6 py-12">
        <div className="mono text-[11px] tracking-[0.16em] text-[#5a5a60] uppercase mb-4">
          Live on Sepolia
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { name: "AgentVault", addr: CONTRACTS.vault },
            { name: "SpendPolicy", addr: CONTRACTS.policy },
            { name: "PaymentGate", addr: CONTRACTS.gate },
          ].map((c) => (
            <a
              key={c.name}
              href={`${ETHERSCAN_BASE}/address/${c.addr}`}
              target="_blank"
              rel="noopener"
              className="bg-[#f0ede7] border border-[rgba(22,23,25,0.12)] rounded-lg p-4 no-underline hover:border-[#1f3a8f] transition-colors"
            >
              <div className="font-bold text-[16px] mb-1">{c.name}</div>
              <div className="mono text-[11px] text-[#5a5a60]">
                {c.addr.slice(0, 8)}...{c.addr.slice(-6)} ↗
              </div>
            </a>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-[#1f3a8f] text-white py-16 text-center">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="font-bold text-[36px] mb-4">
            See it running on Sepolia.
          </h2>
          <p className="text-[15px] text-white/70 mb-7">
            Live contracts, live events, live FHE operations. Nothing is staged.
          </p>
          <div className="flex gap-4 justify-center flex-wrap">
            <Link
              href="/dashboard"
              className="flex items-center gap-2 bg-[#ffd208] text-[#000] mono text-[12px] font-bold tracking-widest px-6 py-3 rounded-md no-underline"
            >
              OPEN DASHBOARD
            </Link>
            <Link
              href="/tryit"
              className="flex items-center gap-2 border-2 border-white text-white mono text-[12px] font-bold tracking-widest px-6 py-3 rounded-md no-underline"
            >
              TRY IT LIVE
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#000] text-[#8a8a8f] py-6 px-6 flex justify-between items-center flex-wrap gap-3">
        <span className="mono text-[12px] tracking-widest">
          UMBRA · CONFIDENTIAL PAYMENT GATE
        </span>
        <a
          href="https://x.com/Olumi441"
          target="_blank"
          rel="noopener"
          className="mono text-[12px] text-[#8a8a8f] no-underline hover:text-white"
        >
          Built by Abu Olumi
        </a>
      </footer>
    </div>
  );
}

function DecryptCard() {
  const fields = [
    { label: "Vault balance", enc: "0x8f2a...e91c", real: "1,250.00 cUSDT" },
    { label: "Spend limit", enc: "0xc31d...0a44", real: "500.00 cUSDT" },
    { label: "Last payment", enc: "0x44b1...7c0a", real: "320.00 cUSDT" },
  ];

  return (
    <div className="bg-[#f0ede7] border-2 border-[#1f3a8f] rounded-xl p-6">
      <div className="flex justify-between items-center border-b border-[rgba(22,23,25,0.12)] pb-3 mb-3">
        <span className="font-bold text-[18px]">Agent #0142</span>
        <span className="mono text-[10px] text-[#5a5a60] tracking-widest">
          SEPOLIA · ERC-7984
        </span>
      </div>
      {fields.map((f) => (
        <div
          key={f.label}
          className="flex justify-between items-baseline py-2.5 border-b border-[rgba(22,23,25,0.12)] last:border-0"
        >
          <span className="text-[#5a5a60] text-[13px]">{f.label}</span>
          <span className="mono text-[13px] text-[#1f3a8f]">{f.enc}</span>
        </div>
      ))}
      <div className="mt-4 bg-[#161719] text-[#f4f4f4] mono text-[11px] font-bold tracking-widest px-4 py-3 rounded-md text-center">
        DECRYPT VIEW (OWNER KEY ONLY)
      </div>
      <p className="mt-3 text-[12px] text-[#5a5a60] leading-relaxed">
        This is what every observer sees by default. Only the owner&apos;s
        EIP-712 signature can reveal the real values.
      </p>
    </div>
  );
}
