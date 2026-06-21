"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAccount, useConnect } from "wagmi";
import { injected } from "wagmi/connectors";
import { Topbar } from "@/components/Topbar";
import { Footer } from "@/components/Footer";
import { CONTRACTS, ETHERSCAN_BASE, SEPOLIA_RPC } from "@/lib/contracts";
import { fetchAllEvents, checkContract, getBlockNumber, fetchAgentsOf, type ChainEvent } from "@/lib/rpc";
import { signOwnership, verifyOwnership, type OwnershipProof } from "@/lib/ownership";
import { getFhevmInstance } from "@/lib/fhevm";

type ContractStatus = "checking" | "connected" | "error";

interface Status {
  vault: ContractStatus;
  policy: ContractStatus;
  gate: ContractStatus;
  block: number | null;
}

interface AgentAnalytics {
  agentId: number;
  balance: string;
  totalSpent: string;
  totalReceived: string;
  decryptedAt: Date;
}

interface FrequencyData {
  serviceId: number;
  blocksLeft: number;
  // count and max are encrypted; shown as locked until decrypt
}

export default function DashboardPage() {
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const [mounted, setMounted] = useState(false);

  const [status, setStatus] = useState<Status>({
    vault: "checking", policy: "checking", gate: "checking", block: null,
  });
  const [events, setEvents] = useState<ChainEvent[]>([]);
  const [stats, setStats] = useState({ payments: 0, agents: 0, deposits: 0, settled: 0 });
  const [loading, setLoading] = useState(true);

  // Agent auto-detect
  const [walletAgents, setWalletAgents] = useState<number[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<number | null>(null);
  const [detectingAgents, setDetectingAgents] = useState(false);

  // Ownership proof + decrypted analytics
  const [, setProof] = useState<OwnershipProof | null>(null);
  const [analytics, setAnalytics] = useState<AgentAnalytics | null>(null);
  const [decrypting, setDecrypting] = useState(false);
  const [decryptError, setDecryptError] = useState<string | null>(null);

  // Frequency data (plaintext: blocksUntilReset only, counts remain encrypted)
  const [freqData, setFreqData] = useState<FrequencyData[]>([]);

  // Standard mounted-flag pattern to avoid SSR/client hydration mismatch.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setMounted(true); }, []);

  // Auto-detect agents when wallet connects
  useEffect(() => {
    if (!mounted || !isConnected || !address) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDetectingAgents(true);
    fetchAgentsOf(address)
      .then((ids) => {
        setWalletAgents(ids);
        if (ids.length === 1) setSelectedAgent(ids[0]);
      })
      .catch(() => setWalletAgents([]))
      .finally(() => setDetectingAgents(false));
  }, [mounted, isConnected, address]);

  // Fetch frequency limit data for the selected agent.
  // blocksUntilReset is plaintext so no decryption needed.
  // We check a fixed set of likely service IDs from the activity feed.
  useEffect(() => {
    if (selectedAgent === null) return;

    async function loadFreq() {
      // Derive service IDs from events that involve this agent as payer
      const serviceIds = [...new Set(
        events
          .filter(e => e.type === "payment" && e.agentId === selectedAgent)
          .map(e => e.serviceId)
          .filter((id): id is number => id !== undefined)
      )];

      if (serviceIds.length === 0) {
        setFreqData([]);
        return;
      }

      // blocksUntilReset(uint256 agentId, uint256 serviceId) selector: 0x3a215ec2
      const results = await Promise.all(
        serviceIds.map(async (serviceId) => {
          try {
            const data =
              "0x3a215ec2" +
              selectedAgent!.toString(16).padStart(64, "0") +
              serviceId.toString(16).padStart(64, "0");
            const res = await fetch(SEPOLIA_RPC, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                jsonrpc: "2.0", id: 1,
                method: "eth_call",
                params: [{ to: CONTRACTS.policy, data }, "latest"],
              }),
            });
            const json = await res.json();
            const blocksLeft = json.result && json.result !== "0x"
              ? parseInt(json.result, 16)
              : 0;
            return { serviceId, blocksLeft };
          } catch {
            return { serviceId, blocksLeft: 0 };
          }
        })
      );

      setFreqData(results.filter(r => r.blocksLeft > 0 || true));
    }

    loadFreq();
  }, [selectedAgent, events]);

  // Load events and protocol status on mount
  useEffect(() => {
    async function load() {
      const [v, p, g, block] = await Promise.all([
        checkContract(CONTRACTS.vault).catch(() => false),
        checkContract(CONTRACTS.policy).catch(() => false),
        checkContract(CONTRACTS.gate).catch(() => false),
        getBlockNumber().catch(() => null),
      ]);
      setStatus({
        vault:  v ? "connected" : "error",
        policy: p ? "connected" : "error",
        gate:   g ? "connected" : "error",
        block,
      });

      try {
        const data = await fetchAllEvents();
        setEvents(data.events);
        setStats({
          payments: data.totalPayments,
          agents:   data.totalAgents,
          deposits: data.totalDeposits,
          settled:  data.totalSettled,
        });
      } catch (err) {
        console.error("[dashboard] fetchAllEvents failed:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Sign message to prove ownership and decrypt agent analytics
  async function handleDecrypt() {
    if (!address || selectedAgent === null) return;
    setDecrypting(true);
    setDecryptError(null);

    try {
      // Step 1: sign ownership message
      const ownershipProof = await signOwnership(selectedAgent, address);
      const valid = await verifyOwnership(ownershipProof);
      if (!valid) throw new Error("Signature verification failed.");
      setProof(ownershipProof);

      // Step 2: use the FHEVM instance to decrypt the agent's encrypted values
      const instance = await getFhevmInstance();

      // Read raw ciphertext handles from the contract via eth_call on the RPC node.
      async function callView(fnSelector: string, agentId: number): Promise<string> {
        const data = fnSelector + agentId.toString(16).padStart(64, "0");
        const res = await fetch(SEPOLIA_RPC, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0", id: 1,
            method: "eth_call",
            params: [{ to: CONTRACTS.vault, data }, "latest"],
          }),
        });
        const json = await res.json();
        return json.result;
      }

      // Correct keccak256 selectors (verified via ethers.id):
      // balanceOf(uint256):     0x9cc7f708
      // totalSpent(uint256):    0x0ca32959
      // totalReceived(uint256): 0x9776d9c7
      const [balHandle, spentHandle, receivedHandle] = await Promise.all([
        callView("0x9cc7f708", selectedAgent),
        callView("0x0ca32959", selectedAgent),
        callView("0x9776d9c7", selectedAgent),
      ]);

      // Decrypt all three handles in one userDecrypt call using the correct
      // relayer-sdk 0.4.x API (instance.userDecrypt, not instance.decrypt).
      const validHandles = [balHandle, spentHandle, receivedHandle].filter(
        (h) => h && h !== "0x" && h !== "0x" + "0".repeat(64)
      );

      if (validHandles.length === 0) {
        throw new Error("No valid ciphertext handles returned from contract.");
      }

      const keypair = instance.generateKeypair();
      const handleContractPairs = validHandles.map((handle) => ({
        handle,
        contractAddress: CONTRACTS.vault,
      }));
      const startTimeStamp = Math.floor(Date.now() / 1000); // number, not string
      const durationDays   = 10;                             // number, not string
      const contractAddresses = [CONTRACTS.vault];

      const eip712 = instance.createEIP712(
        keypair.publicKey,
        contractAddresses,
        startTimeStamp,
        durationDays
      );

      const sig = await window.ethereum.request({
        method: "eth_signTypedData_v4",
        // Serialize BigInt values as strings to avoid JSON.stringify failure
        params: [address, JSON.stringify(eip712, (_, v) => typeof v === "bigint" ? v.toString() : v)],
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let decryptedResults: Record<string, any>;
      try {
        decryptedResults = await instance.userDecrypt(
          handleContractPairs,
          keypair.privateKey,
          keypair.publicKey,
          (sig as string).replace("0x", ""),
          contractAddresses,
          address!,
          startTimeStamp,
          durationDays
        );
      } catch (e: unknown) {
        const msg = (e as { message?: string })?.message ?? "";
        if (msg.includes("Bad JSON") || msg.includes("Relayer") || msg.includes("JSON")) {
          throw new Error(
            "Zama relayer is temporarily unavailable. Please try again in a few minutes."
          );
        }
        throw e;
      }

      // Read results by position since the SDK may key by a different handle
      // format than what eth_call returned, causing key-lookup misses.
      console.log("[decrypt] raw decryptedResults:", decryptedResults);
      console.log("[decrypt] keys:", Object.keys(decryptedResults));
      console.log("[decrypt] values:", Object.values(decryptedResults));
      const resultValues = Object.values(decryptedResults);
      const balance  = BigInt(resultValues[0] ?? 0);
      const spent    = BigInt(resultValues[1] ?? 0);
      const received = BigInt(resultValues[2] ?? 0);

      // Format as 2-decimal cUSDT display values
      function fmt(val: bigint): string {
        const str = val.toString().padStart(3, "0");
        return str.slice(0, -2) + "." + str.slice(-2);
      }

      setAnalytics({
        agentId:       selectedAgent,
        balance:       fmt(balance),
        totalSpent:    fmt(spent),
        totalReceived: fmt(received),
        decryptedAt:   new Date(),
      });

    } catch (e: unknown) {
      const err = e as { message?: string };
      setDecryptError(err?.message ?? "Decryption failed.");
    } finally {
      setDecrypting(false);
    }
  }

  const pillClass = (s: ContractStatus) =>
    s === "connected" ? "bg-[#1a6b3c] text-white" :
    s === "error"     ? "bg-[#b01c2e] text-white" :
                        "bg-[#5a5a60] text-white";

  const pillLabel = (s: ContractStatus) =>
    s === "connected" ? "CONNECTED" : s === "error" ? "ERROR" : "CHECKING";

  return (
    <div className="min-h-screen flex flex-col">
      <Topbar />

      <div className="flex-1 max-w-[480px] mx-auto w-full px-4">

        {/* ── Wallet auto-detect banner ─────────────────────────────── */}
        {mounted && isConnected && address && (
          <div className="mt-4 bg-[#1f3a8f] rounded-[10px] p-4 flex items-start gap-3">
            <div className="w-[34px] h-[34px] bg-[rgba(255,210,8,0.18)] rounded-full flex items-center justify-center flex-shrink-0">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#ffd208" strokeWidth="2.2">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
            </div>
            <div>
              {detectingAgents ? (
                <div className="mono text-[13px] text-white/60">Scanning for registered agents...</div>
              ) : walletAgents.length === 0 ? (
                <>
                  <div style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500 }} className="text-[15px] text-white mb-0.5">No agents found.</div>
                  <div className="mono text-[11px] text-white/60">Use the <Link href="/tryit" className="underline text-white/80">Try it</Link> page to register your first agent.</div>
                </>
              ) : walletAgents.length === 1 ? (
                <>
                  <div style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500 }} className="text-[15px] text-white mb-0.5">Welcome back.</div>
                  <div className="mono text-[11px] text-white/60">Agent #{walletAgents[0]} found on this wallet</div>
                </>
              ) : (
                <>
                  <div style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500 }} className="text-[15px] text-white mb-0.5">Welcome back.</div>
                  <div className="mono text-[11px] text-white/60">{walletAgents.length} agents found · select one below</div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ── Agent picker (multi-agent wallets) ───────────────────── */}
        {mounted && isConnected && walletAgents.length > 1 && (
          <div className="mt-3 flex gap-2 overflow-x-auto pb-0.5">
            {walletAgents.map((id) => (
              <button
                key={id}
                onClick={() => { setSelectedAgent(id); setAnalytics(null); setProof(null); }}
                className={`flex-shrink-0 mono text-[12px] font-bold px-[14px] py-2 rounded-[20px] border-[1.5px] whitespace-nowrap ${
                  selectedAgent === id
                    ? "bg-[#1f3a8f] border-[#1f3a8f] text-white"
                    : "bg-[#f0ede7] border-[rgba(22,23,25,0.12)] text-[#5a5a60]"
                }`}
              >
                Agent #{id}
              </button>
            ))}
          </div>
        )}

        {/* ── Wallet Overview ───────────────────────────────────────── */}
        {mounted && isConnected && walletAgents.length > 0 && (
          <div className="mt-4">
            <div className="mono text-[11px] tracking-[0.14em] text-[#161719] uppercase mb-2.5 pb-1.5 border-b-2 border-[#1a6b3c]">
              Wallet Overview
            </div>
            <div className="bg-[#f0ede7] border border-[rgba(22,23,25,0.12)] rounded-lg p-4">
              <div className="grid grid-cols-3 gap-0">
                {[
                  { label: "Agents",   val: walletAgents.length.toString() },
                  { label: "Balance",  val: analytics ? analytics.balance : "●●●●●" },
                  { label: "Services", val: String(new Set(events.filter(e => e.type === "payment" && e.agentId === selectedAgent).map(e => e.serviceId).filter(Boolean)).size) },
                ].map((item) => (
                  <div key={item.label} className="text-center py-1">
                    <div className="mono text-[9px] text-[#5a5a60] uppercase tracking-[0.05em] mb-1">{item.label}</div>
                    <div className="mono text-[17px] font-bold text-[#161719]">{item.val}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── My Agent: Card 1 (Balance & Limit) ───────────────────── */}
        {selectedAgent !== null && (
          <div className="mt-4">
            <div className="mono text-[11px] tracking-[0.14em] text-[#161719] uppercase mb-2.5 pb-1.5 border-b-2 border-[#1f3a8f]">
              My Agent
            </div>

            {/* Primary card */}
            <div className="bg-[#f0ede7] border-2 border-[#1f3a8f] rounded-lg p-4">
              <div className="flex justify-between items-center mb-3">
                <div>
                  <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 600 }} className="text-[19px]">
                    Agent #{selectedAgent}
                  </div>
                  <div className="mono text-[10px] text-[#5a5a60]">
                    {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : ""}
                  </div>
                </div>
                {analytics ? (
                  <div className="bg-[#1a6b3c] text-white mono text-[10px] font-bold tracking-widest px-3 py-1.5 rounded-md flex items-center gap-1.5">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="10"/></svg>
                    DECRYPTED
                  </div>
                ) : (
                  <button
                    onClick={handleDecrypt}
                    disabled={decrypting || !isConnected}
                    className="bg-[#1f3a8f] disabled:opacity-40 text-white mono text-[10px] font-bold tracking-widest px-3 py-1.5 rounded-md"
                  >
                    {decrypting ? "SIGNING..." : "DECRYPT MY DATA"}
                  </button>
                )}
              </div>

              {analytics && (
                <div className="mono text-[10px] text-[#1a6b3c] mb-3 flex items-center gap-1.5">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="10"/></svg>
                  Verified via EIP-712 · {analytics.decryptedAt.toLocaleTimeString()}
                </div>
              )}

              {decryptError && (
                <div className="mono text-[11px] text-[#b01c2e] mb-3 bg-[rgba(176,28,46,0.08)] rounded-md px-3 py-2">
                  {decryptError}
                </div>
              )}

              {/* Primary stats: balance (large) + limit placeholder */}
              <div className="grid grid-cols-[1.3fr_1fr] gap-2.5">
                <div className="bg-[#1f3a8f] rounded-lg p-3.5">
                  <div className="mono text-[10px] text-white/65 uppercase tracking-widest mb-1">Current Balance</div>
                  <div className="mono text-[24px] font-bold text-[#ffd208]">
                    {analytics ? analytics.balance : "●●●●●"}
                  </div>
                </div>
                <div className="bg-[#e2ded5] rounded-lg p-3.5">
                  <div className="mono text-[10px] text-[#5a5a60] uppercase tracking-widest mb-1">Spend Limit</div>
                  <div className="mono text-[20px] font-bold text-[#161719]">●●●●●</div>
                </div>
              </div>

              {/* Spend usage bar (shown only after decrypt) */}
              {analytics && (
                <div className="mt-3">
                  <div className="flex justify-between items-center mb-1.5">
                    <span style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic" }} className="text-[13px] text-[#5a5a60]">Spend limit used</span>
                    <span className="mono text-[10px] font-bold text-[#1a6b3c]">Decrypted</span>
                  </div>
                  <div className="mono text-[13px] tracking-[1px]">
                    <span className="text-[#1a6b3c]">■■■■■■</span>
                    <span className="text-[rgba(22,23,25,0.12)]">□□□□</span>
                    <span className="text-[#5a5a60] ml-2 text-[11px]">{analytics.totalSpent} spent</span>
                  </div>
                </div>
              )}
            </div>

            {/* Secondary card: analytics detail */}
            <div className="bg-[#f0ede7] border border-[rgba(22,23,25,0.12)] rounded-lg p-4 mt-2.5">
              {[
                { label: "Total Spent",    val: analytics?.totalSpent    ?? null },
                { label: "Total Received", val: analytics?.totalReceived ?? null },
              ].map((row) => (
                <div key={row.label} className="flex justify-between items-center py-2.5 border-b border-[rgba(22,23,25,0.08)] last:border-0 last:pb-0 first:pt-0">
                  <span style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic" }} className="text-[14px] text-[#5a5a60]">{row.label}</span>
                  <span className="mono text-[13px] font-semibold">{row.val ?? "●●●●●"}</span>
                </div>
              ))}
              {analytics && (
                <div className="mono text-[10px] text-[#1a6b3c] mt-2.5 pt-2.5 border-t border-[rgba(22,23,25,0.08)] flex items-center gap-1.5">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="10"/></svg>
                  Verified via EIP-712 · updated {analytics.decryptedAt.toLocaleTimeString()}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Frequency Limits ──────────────────────────────────────── */}
        {selectedAgent !== null && (
          <div className="mt-4">
            <div className="mono text-[11px] tracking-[0.14em] text-[#161719] uppercase mb-2.5 pb-1.5 border-b-2 border-[#ffd208]">
              Frequency Limits
            </div>
            <div className="bg-[#f0ede7] border border-[rgba(22,23,25,0.12)] rounded-lg p-4">
              {freqData.length === 0 ? (
                <div className="mono text-[12px] text-[#5a5a60] text-center py-2">
                  No frequency limits set yet. Add one in the{" "}
                  <Link href="/tryit" className="text-[#1f3a8f] underline">Try it</Link> flow.
                </div>
              ) : freqData.map((fd) => (
                <div key={fd.serviceId} className="py-3 border-t border-[rgba(22,23,25,0.08)] first:border-t-0 first:pt-0">
                  <div style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic" }} className="text-[15px] font-medium mb-2">
                    Service #{fd.serviceId}
                  </div>
                  <div className="flex justify-between items-center mb-1.5">
                    <div className="mono text-[15px] tracking-[1px]">
                      <span className="text-[#5a5a60]">●●●</span>
                      <span className="text-[rgba(22,23,25,0.12)] ml-1">□□□□□□□</span>
                      <span className="mono text-[11px] text-[#5a5a60] ml-2">●●/●●</span>
                    </div>
                    <span className="mono text-[10px] font-bold px-2 py-0.5 rounded bg-[rgba(31,58,143,0.1)] text-[#1f3a8f]">ENCRYPTED</span>
                  </div>
                  <div className="mono text-[10px] text-[#5a5a60]">
                    Resets in {fd.blocksLeft > 0 ? `~${Math.round(fd.blocksLeft * 12 / 3600)}h` : "next payment"}
                  </div>
                </div>
              ))}
            </div>
            <Link
              href="/tryit"
              className="mt-3 flex items-center justify-between w-full bg-[#1f3a8f] text-white rounded-lg px-4 py-3 no-underline"
            >
              <div>
                <div style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic" }} className="text-[15px] font-medium">
                  Run the payment flow
                </div>
                <div className="mono text-[10px] text-white/60 mt-0.5">
                  Encrypt · deposit · set limits · pay
                </div>
              </div>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </Link>
          </div>
        )}

        {/* ── Protocol Status ───────────────────────────────────────── */}
        <div className="mt-4">
          <div className="mono text-[11px] tracking-[0.14em] text-[#161719] uppercase mb-2.5 pb-1.5 border-b-2 border-[#1f3a8f]">
            Protocol Status
          </div>
          <div className="bg-[#f0ede7] border-2 border-[#1f3a8f] rounded-lg p-4 space-y-3">
            {[
              { name: "AgentVault",  addr: CONTRACTS.vault,  s: status.vault,  sub: "ERC-7984" },
              { name: "SpendPolicy", addr: CONTRACTS.policy, s: status.policy, sub: "" },
              { name: "PaymentGate", addr: CONTRACTS.gate,   s: status.gate,   sub: "" },
              { name: "Network", addr: null, s: status.block ? "connected" : "checking",
                sub: status.block ? `Sepolia · block ${status.block.toLocaleString()}` : "Syncing..." },
            ].map((row) => (
              <div key={row.name} className="flex justify-between items-center">
                <div>
                  <div className="font-semibold text-[15px]">{row.name}</div>
                  {row.addr ? (
                    <a href={`${ETHERSCAN_BASE}/address/${row.addr}`} target="_blank" rel="noopener"
                      className="mono text-[10px] text-[#5a5a60] no-underline hover:text-[#1f3a8f]">
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

        {/* ── Activity Timeline (agent-scoped if signed, else protocol-wide) */}
        <div className="mt-4 mb-2">
          <div className="mono text-[11px] tracking-[0.14em] text-[#161719] uppercase mb-2.5 pb-1.5 border-b-2 border-[#1f3a8f] flex justify-between items-center">
            Activity Timeline
            <span className="bg-[#000] text-[#ffd208] mono text-[10px] font-bold px-2 py-0.5 rounded">
              {loading ? "LOADING" : `${events.length} EVENTS`}
            </span>
          </div>
          <div className="bg-[#f0ede7] border border-[rgba(22,23,25,0.12)] rounded-lg p-4">
            {loading ? (
              <div className="mono text-[12px] text-[#5a5a60] text-center py-4">
                Fetching from Sepolia...
              </div>
            ) : events.length === 0 ? (
              <div className="mono text-[12px] text-[#5a5a60] text-center py-4">
                No events yet. <Link href="/tryit" className="text-[#1f3a8f] underline">Try the payment flow.</Link>
              </div>
            ) : (
              <div>
                {events.map((e, i) => {
                  const dotColor =
                    e.type === "payment" ? "bg-[#1f3a8f]" :
                    e.type === "deposit" ? "bg-[#1a6b3c]" :
                    e.type === "limitset" ? "bg-[#ffd208]" : "bg-[#1f3a8f]";

                  const label =
                    e.type === "payment"  ? "Payment Authorized" :
                    e.type === "register" ? "Agent Registered" :
                    e.type === "deposit"  ? "Deposited" :
                    e.type === "settle"   ? "Settled" :
                    e.type === "limitset" ? "Limit Set" : "Withdrawn";

                  const detail =
                    e.agentId !== undefined ? `Agent #${e.agentId}` +
                    (e.serviceId !== undefined ? ` → #${e.serviceId}` : "") +
                    (e.toAgentId !== undefined ? ` → #${e.toAgentId}` : "") : "";

                  return (
                    <div key={i} className="flex gap-2.5 py-2.5 border-t border-[rgba(22,23,25,0.08)] first:border-t-0 first:pt-0">
                      <div className={`w-2 h-2 rounded-full ${dotColor} mt-[5px] flex-shrink-0`} />
                      <div>
                        <div className="text-[13px] font-semibold leading-snug">{label}
                          {detail && <span className="font-normal text-[#5a5a60]"> — {detail}</span>}
                        </div>
                        <div className="mono text-[10px] text-[#5a5a60] mt-0.5">
                          block {e.blockNumber.toLocaleString()} ·{" "}
                          <a href={`${ETHERSCAN_BASE}/tx/${e.transactionHash}`} target="_blank" rel="noopener"
                            className="hover:text-[#1f3a8f]">
                            {e.transactionHash.slice(0, 10)}...{e.transactionHash.slice(-6)} ↗
                          </a>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Connect prompt if not connected ──────────────────────── */}
        {mounted && !isConnected && (
          <div className="mt-4 bg-[#f0ede7] border border-[rgba(22,23,25,0.12)] rounded-lg p-6 text-center">
            <div style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic" }} className="text-[18px] mb-2">
              Connect a wallet to see your agents.
            </div>
            <p className="text-[13px] text-[#5a5a60] mb-4">Protocol stats and events are visible to anyone. Your decrypted analytics require your wallet.</p>
            <button
              onClick={() => connect({ connector: injected() })}
              className="bg-[#1f3a8f] text-white mono text-[11px] font-bold tracking-widest px-5 py-2.5 rounded-md"
            >
              CONNECT WALLET
            </button>
          </div>
        )}

      </div>

      <Footer />
    </div>
  );
}