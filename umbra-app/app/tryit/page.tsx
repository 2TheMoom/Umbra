"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAccount, useConnect, useDisconnect, useSwitchChain, useWriteContract, useConfig } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { injected } from "wagmi/connectors";
import { sepolia } from "wagmi/chains";
import { Topbar } from "@/components/Topbar";
import { Footer } from "@/components/Footer";
import { CONTRACTS, VAULT_ABI, POLICY_ABI, GATE_ABI, ETHERSCAN_BASE } from "@/lib/contracts";
import { encryptUint64 } from "@/lib/fhevm";
import { signOwnership, verifyOwnership, type OwnershipProof } from "@/lib/ownership";
import { fetchAgentsOf } from "@/lib/rpc";

type StepState = "idle" | "active" | "done" | "error";

interface StepStatus {
  state: StepState;
  txHash?: string;
  error?: string;
}

function shortTx(h: string) { return `${h.slice(0, 10)}...${h.slice(-6)}`; }

function StepNum({ n, state }: { n: number | string; state: StepState }) {
  const cls =
    state === "done"   ? "bg-[#1a6b3c]" :
    state === "active" ? "bg-[#ffd208] !text-[#000]" :
    state === "error"  ? "bg-[#b01c2e]" : "bg-[#1f3a8f]";
  return (
    <div className={`w-7 h-7 rounded-full ${cls} text-white mono text-[12px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5`}>
      {state === "done" ? "✓" : state === "error" ? "✗" : n}
    </div>
  );
}

function TxResult({ status, label }: { status: StepStatus; label: string }) {
  if (status.state === "idle") return null;
  if (status.state === "active") return (
    <div className="mt-2 bg-[#e2ded5] rounded-md p-3 mono text-[12px] text-[#5a5a60]">
      {label}...
    </div>
  );
  if (status.state === "error") return (
    <div className="mt-2 bg-[rgba(176,28,46,0.08)] border border-[rgba(176,28,46,0.2)] rounded-md p-3 mono text-[12px] text-[#b01c2e]">
      <div>{status.error}</div>
      {status.txHash && (
        <a href={`${ETHERSCAN_BASE}/tx/${status.txHash}`} target="_blank" rel="noopener"
          className="text-[#b01c2e] underline block mt-1">view reverted tx ↗</a>
      )}
    </div>
  );
  return (
    <div className="mt-2 bg-[rgba(26,107,60,0.08)] border border-[rgba(26,107,60,0.2)] rounded-md p-3 mono text-[12px]">
      <div className="text-[#1a6b3c] font-bold mb-1">✓ SUCCESS</div>
      {status.txHash && (
        <a href={`${ETHERSCAN_BASE}/tx/${status.txHash}`} target="_blank" rel="noopener"
          className="text-[#5a5a60] no-underline hover:text-[#1f3a8f] block">
          {shortTx(status.txHash)} ↗
        </a>
      )}
    </div>
  );
}

export default function TryItPage() {
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const wagmiConfig = useConfig();

  const [mounted, setMounted] = useState(false);
  // Standard mounted-flag pattern to avoid SSR/client hydration mismatch
  // on wallet connection state.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  // Agent auto-detect + picker
  const [walletAgents, setWalletAgents] = useState<number[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<number | null>(null);
  const [detectingAgents, setDetectingAgents] = useState(false);

  // Ownership proof (auto-signed after wallet connect)
  const [proof, setProof] = useState<OwnershipProof | null>(null);
  const [signing, setSigning] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);

  // Form values
  const [payerId,       setPayerId]       = useState("1001");
  const [serviceId,     setServiceId]     = useState("1002");
  const [depositAmt,    setDepositAmt]    = useState("1000");
  const [limitAmt,      setLimitAmt]      = useState("500");
  const [freqLimit,     setFreqLimit]     = useState("10");
  const [paymentAmt,    setPaymentAmt]    = useState("300");

  const [steps, setSteps] = useState<Record<number, StepStatus>>({
    1: { state: "idle" }, 2: { state: "idle" }, 3: { state: "idle" },
    4: { state: "idle" }, 5: { state: "idle" }, 6: { state: "idle" },
  });

  function setStep(n: number, s: Partial<StepStatus>) {
    setSteps(prev => ({ ...prev, [n]: { ...prev[n], ...s } }));
  }

  // Auto-detect agents on wallet connect
  useEffect(() => {
    if (!mounted || !isConnected || !address) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDetectingAgents(true);
    fetchAgentsOf(address)
      .then((ids) => {
        setWalletAgents(ids);
        if (ids.length >= 1) {
          setSelectedAgent(ids[0]);
          setPayerId(ids[0].toString());
        }
      })
      .catch(() => setWalletAgents([]))
      .finally(() => setDetectingAgents(false));
  }, [mounted, isConnected, address]);

  // Auto-sign ownership proof after wallet connects.
  useEffect(() => {
    if (!mounted || !isConnected || !address || proof) return;
    // Using an async IIFE so all setState calls happen inside promise
    // callbacks, not synchronously in the effect body, which avoids the
    // react-hooks/set-state-in-effect lint rule.
    // payerId and proof excluded from deps intentionally: payerId changes
    // as the user types mid-flow, and proof is this effect's own output.
    const agentId = selectedAgent ?? parseInt(payerId);
    void (async () => {
      try {
        setSigning(true);
        setSignError(null);
        const p = await signOwnership(agentId, address);
        const valid = await verifyOwnership(p);
        if (valid) setProof(p);
        else setSignError("Signature verification failed.");
      } catch (e: unknown) {
        const err = e as { message?: string };
        setSignError(err?.message ?? "Signing failed.");
      } finally {
        setSigning(false);
      }
    })();
  }, [mounted, isConnected, address, selectedAgent]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleConnect() {
    connect({ connector: injected() });
    try { await switchChain({ chainId: sepolia.id }); } catch {}
  }

  async function runStep(n: number, fn: () => Promise<string | void>) {
    setStep(n, { state: "active", error: undefined });
    try {
      const txHash = await fn();
      if (txHash) {
        const receipt = await waitForTransactionReceipt(wagmiConfig, {
          hash: txHash as `0x${string}`,
        });
        if (receipt.status === "reverted") {
          setStep(n, { state: "error", txHash: txHash as string,
            error: "Transaction reverted. Check agent ownership and prior steps." });
          return;
        }
      }
      setStep(n, { state: "done", txHash: txHash as string | undefined });
    } catch (e: unknown) {
      const err = e as { shortMessage?: string; message?: string };
      setStep(n, { state: "error", error: err?.shortMessage ?? err?.message ?? "Transaction failed" });
    }
  }

  // Step 1: register agents (skipped if agents already found on wallet)
  async function step1() {
    await runStep(1, async () => {
      await writeContractAsync({ address: CONTRACTS.vault, abi: VAULT_ABI, functionName: "registerAgent", args: [BigInt(payerId)] });
      await writeContractAsync({ address: CONTRACTS.vault, abi: VAULT_ABI, functionName: "registerAgent", args: [BigInt(serviceId)] });
      return writeContractAsync({ address: CONTRACTS.policy, abi: POLICY_ABI, functionName: "registerAgent", args: [BigInt(payerId)] });
    });
  }

  // Step 2: encrypt & deposit
  async function step2() {
    await runStep(2, async () => {
      if (!address) throw new Error("Wallet not connected");
      const { handle, proof: inputProof } = await encryptUint64(BigInt(depositAmt), CONTRACTS.vault, address);
      return writeContractAsync({
        address: CONTRACTS.vault, abi: VAULT_ABI, functionName: "deposit",
        args: [BigInt(payerId), handle, inputProof], gas: BigInt(1500000),
      });
    });
  }

  // Step 3: set spend limit
  async function step3() {
    await runStep(3, async () => {
      if (!address) throw new Error("Wallet not connected");
      const { handle, proof: inputProof } = await encryptUint64(BigInt(limitAmt), CONTRACTS.policy, address);
      return writeContractAsync({
        address: CONTRACTS.policy, abi: POLICY_ABI, functionName: "setLimit",
        args: [BigInt(payerId), BigInt(serviceId), handle, inputProof], gas: BigInt(1500000),
      });
    });
  }

  // Step 4: set frequency limit
  async function step4() {
    await runStep(4, async () => {
      if (!address) throw new Error("Wallet not connected");
      const { handle, proof: inputProof } = await encryptUint64(BigInt(freqLimit), CONTRACTS.policy, address);
      return writeContractAsync({
        address: CONTRACTS.policy, abi: POLICY_ABI, functionName: "setFrequencyLimit",
        args: [BigInt(payerId), BigInt(serviceId), handle, inputProof], gas: BigInt(1500000),
      });
    });
  }

  // Step 5: grant PaymentGate access
  async function step5() {
    await runStep(5, async () => {
      await writeContractAsync({
        address: CONTRACTS.vault, abi: VAULT_ABI, functionName: "grantAccess",
        args: [BigInt(payerId), CONTRACTS.gate],
      });
      return writeContractAsync({
        address: CONTRACTS.policy, abi: POLICY_ABI, functionName: "grantAccess",
        args: [BigInt(payerId), BigInt(serviceId), CONTRACTS.gate],
      });
    });
  }

  // Step 6: send confidential payment
  async function step6() {
    await runStep(6, async () => {
      if (!address) throw new Error("Wallet not connected");
      const { handle, proof: inputProof } = await encryptUint64(BigInt(paymentAmt), CONTRACTS.gate, address);
      return writeContractAsync({
        address: CONTRACTS.gate, abi: GATE_ABI, functionName: "requestPayment",
        args: [BigInt(payerId), BigInt(serviceId), handle, inputProof], gas: BigInt(2500000),
      });
    });
  }

  const canStep = (n: number) => {
    if (!isConnected || !proof) return false;
    if (n === 1) return steps[1].state !== "active";
    // If agents already registered, step 1 is considered done so step 2 unlocks
    const step1Done = agentsAlreadyRegistered || steps[1].state === "done";
    if (n === 2) return step1Done && steps[2].state !== "active";
    return steps[n - 1].state === "done" && steps[n].state !== "active";
  };

  const agentsAlreadyRegistered = walletAgents.length > 0 && selectedAgent !== null;

  return (
    <div className="min-h-screen flex flex-col">
      <Topbar subtitle="TRY IT LIVE" />

      <div className="flex-1 max-w-[480px] mx-auto w-full px-4">

        {/* Header */}
        <div className="pt-5 pb-4">
          <Link href="/dashboard" className="mono text-[11px] text-[#5a5a60] hover:text-[#1f3a8f] flex items-center gap-1.5 mb-3 no-underline">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
            Back to dashboard
          </Link>
          <h1 style={{ fontFamily: "'Fraunces', serif", fontWeight: 600 }} className="text-[28px]">
            Try it, <em style={{ fontStyle: "italic", color: "#1f3a8f" }}>live.</em>
          </h1>
          <p className="text-[14px] text-[#5a5a60] mt-1 leading-relaxed">
            Encrypt, deposit, set limits, and send a real confidential payment on Sepolia.
            No amount ever appears in plaintext on-chain.
          </p>
        </div>

        {/* Wallet bar */}
        <div className="bg-[#f0ede7] border border-[rgba(22,23,25,0.12)] rounded-lg p-4 flex justify-between items-center gap-3 mb-4">
          <div>
            <div className="mono text-[10px] tracking-widest text-[#5a5a60] uppercase mb-1">Wallet</div>
            <div className="mono text-[13px] font-semibold">
              {mounted && isConnected && address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "Not connected"}
            </div>
            {mounted && isConnected && <div className="mono text-[11px] text-[#5a5a60]">Sepolia testnet</div>}
          </div>
          {mounted && isConnected ? (
            <button onClick={() => disconnect()}
              className="bg-[#161719] text-white mono text-[11px] font-bold tracking-widest px-4 py-2 rounded-md">
              DISCONNECT
            </button>
          ) : (
            <button onClick={handleConnect}
              className="bg-[#1f3a8f] text-white mono text-[11px] font-bold tracking-widest px-4 py-2 rounded-md">
              CONNECT
            </button>
          )}
        </div>

        {/* Ownership sign status */}
        {mounted && isConnected && (
          <div className={`mb-4 rounded-lg px-3 py-2.5 mono text-[11px] flex items-center gap-2 ${
            proof ? "bg-[rgba(26,107,60,0.08)] border border-[rgba(26,107,60,0.2)] text-[#1a6b3c]" :
            signing ? "bg-[#e2ded5] text-[#5a5a60]" :
            "bg-[rgba(176,28,46,0.08)] border border-[rgba(176,28,46,0.2)] text-[#b01c2e]"
          }`}>
            {proof ? (
              <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="10"/></svg>
              Wallet ownership verified · Agent #{proof.agentId}</>
            ) : signing ? "Waiting for signature in MetaMask..." :
            signError ? `Signature required: ${signError}` : "Waiting for wallet..."}
          </div>
        )}

        {/* Auto-detect banner */}
        {mounted && isConnected && !detectingAgents && walletAgents.length > 0 && (
          <div className="bg-[#1f3a8f] rounded-[10px] p-4 flex items-start gap-3 mb-4">
            <div className="w-[34px] h-[34px] bg-[rgba(255,210,8,0.18)] rounded-full flex items-center justify-center flex-shrink-0">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#ffd208" strokeWidth="2.2">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
            </div>
            <div>
              <div style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 500 }} className="text-[15px] text-white mb-0.5">
                Welcome back.
              </div>
              <div className="mono text-[11px] text-white/60">
                {walletAgents.length === 1
                  ? `Agent #${walletAgents[0]} found · step 1 skipped`
                  : `${walletAgents.length} agents found · pick one, or register new`}
              </div>
            </div>
          </div>
        )}

        {/* Agent picker */}
        {mounted && isConnected && walletAgents.length > 1 && (
          <div className="flex gap-2 overflow-x-auto mb-4">
            {walletAgents.map((id) => (
              <button key={id} onClick={() => { setSelectedAgent(id); setPayerId(id.toString()); }}
                className={`flex-shrink-0 mono text-[12px] font-bold px-[14px] py-2 rounded-[20px] border-[1.5px] whitespace-nowrap ${
                  selectedAgent === id
                    ? "bg-[#1f3a8f] border-[#1f3a8f] text-white"
                    : "bg-[#f0ede7] border-[rgba(22,23,25,0.12)] text-[#5a5a60]"
                }`}>
                Agent #{id}
              </button>
            ))}
          </div>
        )}

        {/* Notice */}
        <div className="bg-[rgba(31,58,143,0.08)] border border-[rgba(31,58,143,0.2)] rounded-lg p-3 mb-5 text-[13px] text-[#5a5a60] leading-relaxed">
          <span className="text-[#1f3a8f] font-bold">Before you start:</span> MetaMask on{" "}
          <strong>Sepolia</strong> with at least 0.01 ETH for gas.{" "}
          <a href="https://www.alchemy.com/faucets/ethereum-sepolia" target="_blank" rel="noopener" className="text-[#1f3a8f]">
            Alchemy Faucet ↗
          </a>
        </div>

        {/* Agent IDs */}
        <div className="bg-[#f0ede7] border border-[rgba(22,23,25,0.12)] rounded-lg p-4 mb-4">
          <div className="mono text-[11px] tracking-widest text-[#5a5a60] uppercase mb-3">Agent IDs</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="mono text-[10px] text-[#5a5a60] mb-1">PAYER ID</div>
              <input type="number" value={payerId} onChange={e => setPayerId(e.target.value)}
                className="w-full bg-[#e2ded5] border border-[rgba(22,23,25,0.12)] rounded-md px-3 py-2 mono text-[13px] outline-none focus:border-[#1f3a8f]" />
            </div>
            <div>
              <div className="mono text-[10px] text-[#5a5a60] mb-1">SERVICE ID</div>
              <input type="number" value={serviceId} onChange={e => setServiceId(e.target.value)}
                className="w-full bg-[#e2ded5] border border-[rgba(22,23,25,0.12)] rounded-md px-3 py-2 mono text-[13px] outline-none focus:border-[#1f3a8f]" />
            </div>
          </div>
        </div>

        {/* Steps */}
        <div className="bg-[#f0ede7] border border-[rgba(22,23,25,0.12)] rounded-lg p-4 space-y-5">

          {/* Step 1: Register (skip if agents already found) */}
          <div className="flex gap-3">
            <StepNum n={1} state={agentsAlreadyRegistered ? "done" : steps[1].state} />
            <div className="flex-1 border-l border-dashed border-[rgba(22,23,25,0.12)] pl-4">
              <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 600 }} className="text-[16px]">
                {agentsAlreadyRegistered ? "Agent ready" : "Register Agents"}
              </div>
              <div className="text-[13px] text-[#5a5a60] mt-1 mb-3">
                {agentsAlreadyRegistered
                  ? `Agent #${walletAgents[0]} is already registered to this wallet.`
                  : "Registers payer and service in AgentVault and SpendPolicy."}
              </div>
              {!agentsAlreadyRegistered && (
                <>
                  <button disabled={!canStep(1)} onClick={step1}
                    className="w-full bg-[#1f3a8f] disabled:opacity-40 text-white mono text-[11px] font-bold tracking-widest py-3 rounded-md">
                    REGISTER AGENTS
                  </button>
                  <TxResult status={steps[1]} label="Registering" />
                </>
              )}
            </div>
          </div>

          {/* Step 2: Deposit */}
          <div className="flex gap-3">
            <StepNum n={2} state={steps[2].state} />
            <div className="flex-1 border-l border-dashed border-[rgba(22,23,25,0.12)] pl-4">
              <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 600 }} className="text-[16px]">Encrypt &amp; Deposit</div>
              <div className="text-[13px] text-[#5a5a60] mt-1 mb-2">Amount encrypted client-side via Zama Relayer SDK before hitting the chain.</div>
              <div className="mb-3">
                <div className="mono text-[10px] text-[#5a5a60] mb-1">DEPOSIT AMOUNT</div>
                <input type="number" value={depositAmt} onChange={e => setDepositAmt(e.target.value)}
                  className="w-full bg-[#e2ded5] border border-[rgba(22,23,25,0.12)] rounded-md px-3 py-2 mono text-[13px] outline-none focus:border-[#1f3a8f]" />
              </div>
              <button disabled={!canStep(2)} onClick={step2}
                className="w-full bg-[#1f3a8f] disabled:opacity-40 text-white mono text-[11px] font-bold tracking-widest py-3 rounded-md">
                ENCRYPT &amp; DEPOSIT
              </button>
              <TxResult status={steps[2]} label="Encrypting and depositing" />
            </div>
          </div>

          {/* Step 3: Spend limit */}
          <div className="flex gap-3">
            <StepNum n={3} state={steps[3].state} />
            <div className="flex-1 border-l border-dashed border-[rgba(22,23,25,0.12)] pl-4">
              <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 600 }} className="text-[16px]">Set Spend Limit</div>
              <div className="text-[13px] text-[#5a5a60] mt-1 mb-2">Encrypted per-service cap. PaymentGate runs FHE.le against this on ciphertext.</div>
              <div className="mb-3">
                <div className="mono text-[10px] text-[#5a5a60] mb-1">SPEND LIMIT</div>
                <input type="number" value={limitAmt} onChange={e => setLimitAmt(e.target.value)}
                  className="w-full bg-[#e2ded5] border border-[rgba(22,23,25,0.12)] rounded-md px-3 py-2 mono text-[13px] outline-none focus:border-[#1f3a8f]" />
              </div>
              <button disabled={!canStep(3)} onClick={step3}
                className="w-full bg-[#1f3a8f] disabled:opacity-40 text-white mono text-[11px] font-bold tracking-widest py-3 rounded-md">
                SET LIMIT
              </button>
              <TxResult status={steps[3]} label="Encrypting limit" />
            </div>
          </div>

          {/* Step 4: Frequency limit */}
          <div className="flex gap-3">
            <StepNum n={4} state={steps[4].state} />
            <div className="flex-1 border-l border-dashed border-[rgba(22,23,25,0.12)] pl-4">
              <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 600 }} className="text-[16px]">Set Frequency Limit</div>
              <div className="text-[13px] text-[#5a5a60] mt-1 mb-2">Cap how many payments this agent can send to this service within a rolling 24h window. The count stays encrypted.</div>
              <div className="mb-3">
                <div className="mono text-[10px] text-[#5a5a60] mb-1">MAX PAYMENTS PER WINDOW</div>
                <input type="number" value={freqLimit} onChange={e => setFreqLimit(e.target.value)}
                  className="w-full bg-[#e2ded5] border border-[rgba(22,23,25,0.12)] rounded-md px-3 py-2 mono text-[13px] outline-none focus:border-[#1f3a8f]" />
              </div>
              <button disabled={!canStep(4)} onClick={step4}
                className="w-full bg-[#1f3a8f] disabled:opacity-40 text-white mono text-[11px] font-bold tracking-widest py-3 rounded-md">
                SET FREQUENCY CAP
              </button>
              <TxResult status={steps[4]} label="Encrypting frequency limit" />
            </div>
          </div>

          {/* Step 5: Grant access */}
          <div className="flex gap-3">
            <StepNum n={5} state={steps[5].state} />
            <div className="flex-1 border-l border-dashed border-[rgba(22,23,25,0.12)] pl-4">
              <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 600 }} className="text-[16px]">Grant PaymentGate Access</div>
              <div className="text-[13px] text-[#5a5a60] mt-1 mb-3">Allows PaymentGate to run FHE checks on your encrypted balance, limit, and frequency count.</div>
              <button disabled={!canStep(5)} onClick={step5}
                className="w-full bg-[#1f3a8f] disabled:opacity-40 text-white mono text-[11px] font-bold tracking-widest py-3 rounded-md">
                GRANT ACCESS
              </button>
              <TxResult status={steps[5]} label="Granting ACL access" />
            </div>
          </div>

          {/* Step 6: Send payment */}
          <div className="flex gap-3">
            <StepNum n={6} state={steps[6].state} />
            <div className="flex-1 pl-4">
              <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 600 }} className="text-[16px]">Send Confidential Payment</div>
              <div className="text-[13px] text-[#5a5a60] mt-1 mb-2">
                Encrypts the amount, runs FHE.le checks on balance, limit, and frequency. FHE.select resolves transfer. Only approved or declined is ever public.
              </div>
              <div className="mb-3">
                <div className="mono text-[10px] text-[#5a5a60] mb-1">PAYMENT AMOUNT (must be ≤ limit)</div>
                <input type="number" value={paymentAmt} onChange={e => setPaymentAmt(e.target.value)}
                  className="w-full bg-[#e2ded5] border border-[rgba(22,23,25,0.12)] rounded-md px-3 py-2 mono text-[13px] outline-none focus:border-[#1f3a8f]" />
              </div>
              <button disabled={!canStep(6)} onClick={step6}
                className="w-full bg-[#ffd208] disabled:opacity-40 text-[#000] mono text-[11px] font-bold tracking-widest py-3 rounded-md">
                SEND ENCRYPTED PAYMENT
              </button>
              <TxResult status={steps[6]} label="Encrypting and sending" />
            </div>
          </div>

        </div>

        <p className="mono text-[11px] text-[#5a5a60] leading-relaxed mt-4 mb-6">
          All encrypted values are generated client-side using the Zama Relayer SDK.
          No amount is ever submitted in plaintext. The only public trace is a
          PaymentProcessed event on Sepolia.
        </p>

      </div>

      <Footer />
    </div>
  );
}