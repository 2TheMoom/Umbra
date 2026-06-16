"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Topbar } from "@/components/Topbar";
import { Footer } from "@/components/Footer";
import { CONTRACTS, ETHERSCAN_BASE } from "@/lib/contracts";
import { fetchAllEvents, checkContract, getBlockNumber, type ChainEvent } from "@/lib/rpc";

type ContractStatus = "checking" | "connected" | "error";

interface Status {
  vault: ContractStatus;
  policy: ContractStatus;
  gate: ContractStatus;
  block: number | null;
}

const hexChars = "0123456789abcdef";
function randomHex() {
  let s = "0x";
  for (let i = 0; i < 4; i++) s += hexChars[Math.floor(Math.random() * 16)];
  return s + "..." + Array(4).fill(0).map(() => hexChars[Math.floor(Math.random() * 16)]).join("");
}

export default function DashboardPage() {
  const [status, setStatus] = useState<Status>({ vault: "checking", policy: "checking", gate: "checking", block: null });
  const [events, setEvents] = useState<ChainEvent[]>([]);
  const [stats, setStats] = useState({ payments: 0, agents: 0, deposits: 0, settled: 0 });
  const [loading, setLoading] = useState(true);
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});

  useEffect(() => {
    async function load() {
      // Check contracts
      const [v, p, g, block] = await Promise.all([
        checkContract(CONTRACTS.vault).catch(() => false),
        checkContract(CONTRACTS.policy).catch(() => false),
        checkContract(CONTRACTS.gate).catch(() => false),
        getBlockNumber().catch(() => null),
      ]);
      setStatus({
        vault: v ? "connected" : "error",
        policy: p ? "connected" : "error",
        gate: g ? "connected" : "error",
        block,
      });

      // Fetch events
      try {
        const data = await fetchAllEvents();
        setEvents(data.events);
        setStats({
          payments: data.totalPayments,
          agents: data.totalAgents,
          deposits: data.totalDeposits,
          settled: data.totalSettled,
        });
      } catch {
        // no events yet
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const pillClass = (s: ContractStatus) =>
    s === "connected"
      ? "bg-[#1a6b3c] text-white"
      : s === "error"
      ? "bg-[#b01c2e] text-white"
      : "bg-[#5a5a60] text-white";

  const pillLabel = (s: ContractStatus) =>
    s === "connected" ? "CONNECTED" : s === "error" ? "ERROR" : "CHECKING";

  return (
    <div className="min-h-screen">
      <Topbar />

      {/* Hero stat */}
      <div className="bg-[#1f3a8f] mx-4 mt-4 rounded-lg px-5 py-4 text-center">
        <div className="font-bold text-[40px] leading-none text-[#ffd208]">
          100<span className="text-[22px]">%</span>
        </div>
        <div className="mono text-[11px] tracking-[0.16em] text-white mt-1">
          ENCRYPTED BY DEFAULT
        </div>
        <p className="text-[12px] text-white/60 mt-2 max-w-xs mx-auto leading-snug">
          Balances, limits, and transfer amounts never touch the chain in plaintext.
        </p>
      </div>

      {/* Actions */}
      <div className="grid grid-cols-2 gap-3 mx-4 mt-3">
        <a
          href={`${ETHERSCAN_BASE}/address/${CONTRACTS.gate}`}
          target="_blank"
          rel="noopener"
          className="bg-[#161719] text-white mono text-[11px] font-bold tracking-widest px-3 py-3 rounded-md flex items-center justify-center gap-2 no-underline"
        >
          PAYMENTGATE ↗
        </a>
        <Link
          href="/tryit"
          className="bg-[#161719] text-white mono text-[11px] font-bold tracking-widest px-3 py-3 rounded-md flex items-center justify-center gap-2 no-underline"
        >
          TRY IT LIVE
        </Link>
      </div>

      {/* Protocol status */}
      <div className="mx-4 mt-5">
        <div className="mono text-[11px] tracking-[0.16em] text-[#161719] uppercase mb-2.5 pb-1.5 border-b-2 border-[#1f3a8f]">
          PROTOCOL STATUS
        </div>
        <div className="bg-[#f0ede7] border-2 border-[#1f3a8f] rounded-lg p-4 space-y-3">
          {[
            { name: "AgentVault", addr: CONTRACTS.vault, s: status.vault, sub: "ERC-7984" },
            { name: "SpendPolicy", addr: CONTRACTS.policy, s: status.policy, sub: "" },
            { name: "PaymentGate", addr: CONTRACTS.gate, s: status.gate, sub: "" },
            {
              name: "Network",
              addr: null,
              s: status.block ? "connected" : "checking",
              sub: status.block ? `Sepolia · block ${status.block.toLocaleString()}` : "Syncing...",
            },
          ].map((row) => (
            <div key={row.name} className="flex justify-between items-center">
              <div>
                <div className="font-semibold text-[15px]">{row.name}</div>
                {row.addr ? (
                  <a
                    href={`${ETHERSCAN_BASE}/address/${row.addr}`}
                    target="_blank"
                    rel="noopener"
                    className="mono text-[10px] text-[#5a5a60] no-underline hover:text-[#1f3a8f]"
                  >
                    {row.addr.slice(0, 8)}...{row.addr.slice(-6)}{row.sub ? ` · ${row.sub}` : ""} ↗
                  </a>
                ) : (
                  <span className="mono text-[10px] text-[#5a5a60]">{row.sub}</span>
                )}
              </div>
              <span className={`mono text-[10px] font-bold tracking-widest px-2 py-1 rounded ${pillClass(row.s as ContractStatus)}`}>
                {pillLabel(row.s as ContractStatus)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Stat grid */}
      <div className="mx-4 mt-5 grid grid-cols-2 gap-3">
        {[
          { label: "Payments Processed", val: stats.payments, color: "navy", foot: "all-time" },
          { label: "Registered Agents", val: stats.agents, color: "navy", foot: "unique" },
          { label: "Deposits", val: stats.deposits, color: "green", foot: "funded vaults" },
          { label: "Settlements", val: stats.settled, color: "crimson", foot: "on-chain" },
        ].map((s) => (
          <div
            key={s.label}
            className={`bg-[#f0ede7] border border-[rgba(22,23,25,0.12)] rounded-lg p-4 border-t-[4px] ${
              s.color === "navy" ? "border-t-[#1f3a8f]" : s.color === "green" ? "border-t-[#1a6b3c]" : "border-t-[#b01c2e]"
            }`}
          >
            <div className="mono text-[10px] tracking-widest text-[#5a5a60] uppercase mb-2">{s.label}</div>
            <div
              className={`font-bold text-[36px] leading-none ${
                s.color === "navy" ? "text-[#1f3a8f]" : s.color === "green" ? "text-[#1a6b3c]" : "text-[#b01c2e]"
              }`}
            >
              {loading ? "—" : s.val}
            </div>
            <div className="mono text-[11px] text-[#5a5a60] mt-1.5">{s.foot}</div>
          </div>
        ))}
      </div>

      {/* Dark stats bar */}
      <div className="mx-4 mt-3 bg-[#161719] rounded-lg p-4 grid grid-cols-3 gap-4">
        {[
          { label: "Total Payments", val: stats.payments },
          { label: "Deposits", val: stats.deposits },
          { label: "Value Locked", val: null, locked: true },
        ].map((item) => (
          <div key={item.label} className={`text-center ${item.locked ? "bg-[rgba(255,210,8,0.1)] border border-[rgba(255,210,8,0.3)] rounded-md py-1" : ""}`}>
            <div className="mono text-[9px] tracking-widest text-[#8a8a8f] uppercase mb-1.5">{item.label}</div>
            <div className={`mono text-[14px] font-bold ${item.locked ? "text-[#ffd208]" : "text-white"}`}>
              {item.locked ? "●●●●●" : loading ? "—" : item.val}
            </div>
          </div>
        ))}
      </div>

      {/* Live event feed */}
      <div className="mx-4 mt-5">
        <div className="mono text-[11px] tracking-[0.16em] text-[#161719] uppercase mb-2.5 pb-1.5 border-b-2 border-[#1a6b3c] flex justify-between items-center">
          LIVE EVENT FEED
          <span className="bg-[#000] text-[#ffd208] mono text-[10px] font-bold px-2 py-0.5 rounded">
            {loading ? "LOADING" : `${events.length} EVENTS`}
          </span>
        </div>
        <div className="bg-[#f0ede7] border border-[rgba(22,23,25,0.12)] rounded-lg p-4">
          {loading ? (
            <div className="mono text-[12px] text-[#5a5a60] text-center py-4">
              <span className="spinner" /> Fetching from Sepolia...
            </div>
          ) : events.length === 0 ? (
            <div className="mono text-[12px] text-[#5a5a60] text-center py-4">
              No events yet. Try the live widget to generate your first payment.
            </div>
          ) : (
            <div className="space-y-0">
              {events.map((e, i) => (
                <div key={i} className="flex justify-between items-start py-2.5 border-b border-[rgba(22,23,25,0.08)] last:border-0 gap-3">
                  <div>
                    <div className="mono text-[12px] font-bold text-[#1f3a8f]">
                      {e.type === "payment" ? "PaymentProcessed" :
                       e.type === "register" ? "AgentRegistered" :
                       e.type === "deposit" ? "Deposited" :
                       e.type === "settle" ? "Settled" :
                       e.type === "limitset" ? "LimitSet" : "Withdrawn"}
                    </div>
                    <div className="mono text-[11px] text-[#5a5a60] mt-0.5">
                      {e.agentId !== undefined && `agent #${e.agentId}`}
                      {e.serviceId !== undefined && ` → service #${e.serviceId}`}
                      {e.toAgentId !== undefined && ` → #${e.toAgentId}`}
                      {" · "}block {e.blockNumber.toLocaleString()}
                    </div>
                    <a
                      href={`${ETHERSCAN_BASE}/tx/${e.transactionHash}`}
                      target="_blank"
                      rel="noopener"
                      className="mono text-[10px] text-[#5a5a60] no-underline hover:text-[#1f3a8f] block mt-0.5"
                    >
                      {e.transactionHash.slice(0, 10)}...{e.transactionHash.slice(-6)} ↗
                    </a>
                  </div>
                  <span className={`mono text-[10px] font-bold px-2 py-0.5 rounded whitespace-nowrap flex-shrink-0 ${
                    e.type === "payment" ? "bg-[rgba(31,58,143,0.1)] text-[#1f3a8f]" :
                    e.type === "deposit" ? "bg-[rgba(26,107,60,0.1)] text-[#1a6b3c]" :
                    e.type === "settle" ? "bg-[rgba(26,107,60,0.1)] text-[#1a6b3c]" :
                    e.type === "limitset" ? "bg-[rgba(255,210,8,0.18)] text-[#161719]" :
                    "bg-[rgba(31,58,143,0.1)] text-[#1f3a8f]"
                  }`}>
                    {e.type === "payment" ? "ENCRYPTED" :
                     e.type === "deposit" ? "FUNDED" :
                     e.type === "settle" ? "SETTLED" :
                     e.type === "limitset" ? "POLICY" : "VAULT"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* FHE operations log */}
      <div className="mx-4 mt-5 mb-10">
        <div className="mono text-[11px] tracking-[0.16em] text-[#161719] uppercase mb-2.5 pb-1.5 border-b-2 border-[#ffd208] flex justify-between items-center">
          FHE OPERATIONS
          <span className="bg-[#000] text-[#ffd208] mono text-[10px] font-bold px-2 py-0.5 rounded">ENCRYPTED</span>
        </div>

        {loading ? (
          <div className="mono text-[12px] text-[#5a5a60] text-center py-4">
            <span className="spinner" /> Fetching FHE operations...
          </div>
        ) : events.filter(e => e.type === "payment").length === 0 ? (
          <div className="mono text-[12px] text-[#5a5a60] text-center py-4 bg-[#f0ede7] rounded-lg border border-[rgba(22,23,25,0.12)]">
            No PaymentProcessed events yet. Use the Try It widget to generate one.
          </div>
        ) : (
          <div className="space-y-2">
            {events.filter(e => e.type === "payment").slice(0, 5).map((e, i) => (
              <div
                key={i}
                className="border-l-[3px] border-[#ffd208] bg-[#e2ded5] rounded-r-lg p-3 flex justify-between items-center gap-3"
              >
                <div className="mono min-w-0">
                  <div className="text-[12px] font-bold text-[#1f3a8f] truncate">
                    PaymentProcessed({e.agentId} → {e.serviceId})
                  </div>
                  <div className="text-[10px] text-[#5a5a60] mt-0.5">block {e.blockNumber.toLocaleString()}</div>
                  <a
                    href={`${ETHERSCAN_BASE}/tx/${e.transactionHash}`}
                    target="_blank"
                    rel="noopener"
                    className="text-[10px] text-[#5a5a60] no-underline hover:text-[#1f3a8f] block"
                  >
                    tx: {e.transactionHash.slice(0, 10)}...{e.transactionHash.slice(-6)} ↗
                  </a>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="mono text-[12px] text-[#1f3a8f]">
                    {revealed[i] ? "owner only" : randomHex()}
                  </span>
                  <button
                    onClick={() => setRevealed(r => ({ ...r, [i]: !r[i] }))}
                    className={`w-7 h-7 rounded border flex items-center justify-center cursor-pointer ${
                      revealed[i]
                        ? "border-[#1f3a8f] bg-[rgba(31,58,143,0.08)] text-[#1f3a8f]"
                        : "border-[rgba(22,23,25,0.12)] bg-[#f0ede7] text-[#5a5a60]"
                    }`}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="4" y="11" width="16" height="9" rx="2"/>
                      <path d="M8 11V7a4 4 0 0 1 8 0v4"/>
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="mono text-[12px] text-[#5a5a60] leading-relaxed mt-3">
          Every value above is encrypted on chain. Tap the lock icon to simulate
          the EIP-712 user-decryption flow, only the agent owner can unlock these
          in production.
        </p>
      </div>

      <Footer />
    </div>
  );
}