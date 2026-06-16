"use client";

import { useState } from "react";
import { useAccount, useConnect, useDisconnect, useSwitchChain, useWriteContract } from "wagmi";
import { injected } from "wagmi/connectors";
import { sepolia } from "wagmi/chains";
import { Topbar } from "@/components/Topbar";
import { Footer } from "@/components/Footer";
import { CONTRACTS, VAULT_ABI, POLICY_ABI, GATE_ABI, ETHERSCAN_BASE } from "@/lib/contracts";
import { encryptUint64 } from "@/lib/fhevm";

type StepState = "idle" | "active" | "done" | "error";

interface StepStatus {
  state: StepState;
  txHash?: string;
  error?: string;
}

function shortTx(h: string) {
  return `${h.slice(0, 10)}...${h.slice(-6)}`;
}

function StepNum({ n, state }: { n: number; state: StepState }) {
  const cls =
    state === "done" ? "bg-[#1a6b3c]" :
    state === "active" ? "bg-[#ffd208] text-[#000]" :
    state === "error" ? "bg-[#b01c2e]" :
    "bg-[#1f3a8f]";
  return (
    <div className={`w-7 h-7 rounded-full ${cls} text-white mono text-[12px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5`}>
      {state === "done" ? "✓" : state === "error" ? "✗" : n}
    </div>
  );
}

function TxResult({ status, label }: { status: StepStatus; label: string }) {
  if (status.state === "idle") return null;
  if (status.state === "active") {
    return (
      <div className="mt-2 bg-[#e2ded5] rounded-md p-3 mono text-[12px] text-[#5a5a60]">
        <span className="spinner" style={{ borderTopColor: "#5a5a60", borderColor: "rgba(90,90,96,0.2)" }} /> {label}...
      </div>
    );
  }
  if (status.state === "error") {
    return (
      <div className="mt-2 bg-[rgba(176,28,46,0.08)] border border-[rgba(176,28,46,0.2)] rounded-md p-3 mono text-[12px] text-[#b01c2e]">
        {status.error}
      </div>
    );
  }
  return (
    <div className="mt-2 bg-[rgba(26,107,60,0.08)] border border-[rgba(26,107,60,0.2)] rounded-md p-3 mono text-[12px]">
      <div className="text-[#1a6b3c] font-bold mb-1">✓ SUCCESS</div>
      {status.txHash && (
        <a
          href={`${ETHERSCAN_BASE}/tx/${status.txHash}`}
          target="_blank"
          rel="noopener"
          className="text-[#5a5a60] no-underline hover:text-[#1f3a8f] block"
        >
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

  const [payerId, setPayerId] = useState("100");
  const [serviceId, setServiceId] = useState("101");
  const [depositAmt, setDepositAmt] = useState("100000");
  const [limitAmt, setLimitAmt] = useState("50000");
  const [paymentAmt, setPaymentAmt] = useState("30000");

  const [steps, setSteps] = useState<Record<number, StepStatus>>({
    1: { state: "idle" },
    2: { state: "idle" },
    3: { state: "idle" },
    4: { state: "idle" },
    5: { state: "idle" },
  });

  function setStep(n: number, s: Partial<StepStatus>) {
    setSteps(prev => ({ ...prev, [n]: { ...prev[n], ...s } }));
  }

  async function handleConnect() {
    connect({ connector: injected() });
    try { await switchChain({ chainId: sepolia.id }); } catch {}
  }

  async function runStep(n: number, fn: () => Promise<string | void>) {
    setStep(n, { state: "active", error: undefined });
    try {
      const txHash = await fn();
      setStep(n, { state: "done", txHash: txHash as string | undefined });
    } catch (e: unknown) {
      const err = e as { shortMessage?: string; message?: string };
      setStep(n, { state: "error", error: err?.shortMessage ?? err?.message ?? "Transaction failed" });
    }
  }

  // Step 1: register both agents in vault + payer in policy
  async function step1() {
    await runStep(1, async () => {
      await writeContractAsync({ address: CONTRACTS.vault, abi: VAULT_ABI, functionName: "registerAgent", args: [BigInt(payerId)] });
      await writeContractAsync({ address: CONTRACTS.vault, abi: VAULT_ABI, functionName: "registerAgent", args: [BigInt(serviceId)] });
      const tx = await writeContractAsync({ address: CONTRACTS.policy, abi: POLICY_ABI, functionName: "registerAgent", args: [BigInt(payerId)] });
      return tx;
    });
  }

  // Step 2: encrypt deposit and call vault.deposit
  async function step2() {
    await runStep(2, async () => {
      if (!address) throw new Error("Wallet not connected");
      const { handle, proof } = await encryptUint64(BigInt(depositAmt), CONTRACTS.vault, address);
      const tx = await writeContractAsync({
        address: CONTRACTS.vault,
        abi: VAULT_ABI,
        functionName: "deposit",
        args: [BigInt(payerId), handle, proof],
      });
      return tx;
    });
  }

  // Step 3: encrypt limit and call policy.setLimit
  async function step3() {
    await runStep(3, async () => {
      if (!address) throw new Error("Wallet not connected");
      const { handle, proof } = await encryptUint64(BigInt(limitAmt), CONTRACTS.policy, address);
      const tx = await writeContractAsync({
        address: CONTRACTS.policy,
        abi: POLICY_ABI,
        functionName: "setLimit",
        args: [BigInt(payerId), BigInt(serviceId), handle, proof],
      });
      return tx;
    });
  }

  // Step 4: grant PaymentGate ACL access
  async function step4() {
    await runStep(4, async () => {
      await writeContractAsync({
        address: CONTRACTS.vault,
        abi: VAULT_ABI,
        functionName: "grantAccess",
        args: [BigInt(payerId), CONTRACTS.gate],
      });
      const tx = await writeContractAsync({
        address: CONTRACTS.policy,
        abi: POLICY_ABI,
        functionName: "grantAccess",
        args: [BigInt(payerId), BigInt(serviceId), CONTRACTS.gate],
      });
      return tx;
    });
  }

  // Step 5: encrypt payment and call gate.requestPayment
  async function step5() {
    await runStep(5, async () => {
      if (!address) throw new Error("Wallet not connected");
      const { handle, proof } = await encryptUint64(BigInt(paymentAmt), CONTRACTS.gate, address);
      const tx = await writeContractAsync({
        address: CONTRACTS.gate,
        abi: GATE_ABI,
        functionName: "requestPayment",
        args: [BigInt(payerId), BigInt(serviceId), handle, proof],
      });
      return tx;
    });
  }

  const canStep = (n: number) => {
    if (!isConnected) return false;
    if (n === 1) return steps[1].state !== "active";
    return steps[n - 1].state === "done" && steps[n].state !== "active";
  };

  return (
    <div className="min-h-screen">
      <Topbar subtitle="TRY IT LIVE" />

      <div className="max-w-[480px] mx-auto px-4 pb-16">
        {/* Header */}
        <div className="pt-5 pb-4">
          <h1 className="font-bold text-[28px]">Try It Live</h1>
          <p className="text-[14px] text-[#5a5a60] mt-1 leading-relaxed">
            Register an agent, deposit encrypted funds, set a spend limit, and fire
            a real confidential payment on Sepolia. No amounts ever appear in
            plaintext on-chain.
          </p>
        </div>

        {/* Wallet */}
        <div className="bg-[#f0ede7] border border-[rgba(22,23,25,0.12)] rounded-lg p-4 flex justify-between items-center gap-3 mb-4">
          <div>
            <div className="mono text-[10px] tracking-widest text-[#5a5a60] uppercase mb-1">Wallet</div>
            <div className="mono text-[13px] font-semibold">
              {isConnected && address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "Not connected"}
            </div>
            {isConnected && <div className="mono text-[11px] text-[#5a5a60]">Sepolia testnet</div>}
          </div>
          {isConnected ? (
            <button
              onClick={() => disconnect()}
              className="bg-[#161719] text-white mono text-[11px] font-bold tracking-widest px-4 py-2 rounded-md"
            >
              DISCONNECT
            </button>
          ) : (
            <button
              onClick={handleConnect}
              className="bg-[#1f3a8f] text-white mono text-[11px] font-bold tracking-widest px-4 py-2 rounded-md"
            >
              CONNECT
            </button>
          )}
        </div>

        {/* Notice */}
        <div className="bg-[rgba(31,58,143,0.08)] border border-[rgba(31,58,143,0.2)] rounded-lg p-3 mb-5 text-[13px] text-[#5a5a60] leading-relaxed">
          <span className="text-[#1f3a8f] font-bold">Before you start:</span> Make sure
          MetaMask is on <strong>Sepolia testnet</strong> with at least 0.01 ETH for gas.
          Get test ETH from{" "}
          <a href="https://www.alchemy.com/faucets/ethereum-sepolia" target="_blank" rel="noopener" className="text-[#1f3a8f]">
            Alchemy Faucet
          </a>.
        </div>

        {/* Agent IDs */}
        <div className="bg-[#f0ede7] border border-[rgba(22,23,25,0.12)] rounded-lg p-4 mb-4">
          <div className="mono text-[11px] tracking-widest text-[#5a5a60] uppercase mb-3">Agent IDs</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="mono text-[10px] text-[#5a5a60] mb-1">PAYER ID</div>
              <input
                type="number"
                value={payerId}
                onChange={e => setPayerId(e.target.value)}
                className="w-full bg-[#e2ded5] border border-[rgba(22,23,25,0.12)] rounded-md px-3 py-2 mono text-[13px] outline-none focus:border-[#1f3a8f]"
              />
            </div>
            <div>
              <div className="mono text-[10px] text-[#5a5a60] mb-1">SERVICE ID</div>
              <input
                type="number"
                value={serviceId}
                onChange={e => setServiceId(e.target.value)}
                className="w-full bg-[#e2ded5] border border-[rgba(22,23,25,0.12)] rounded-md px-3 py-2 mono text-[13px] outline-none focus:border-[#1f3a8f]"
              />
            </div>
          </div>
        </div>

        {/* Steps */}
        <div className="bg-[#f0ede7] border border-[rgba(22,23,25,0.12)] rounded-lg p-4 space-y-5">

          {/* Step 1 */}
          <div className="flex gap-3">
            <StepNum n={1} state={steps[1].state} />
            <div className="flex-1 border-l border-dashed border-[rgba(22,23,25,0.12)] pl-4">
              <div className="font-semibold text-[16px]">Register Agents</div>
              <div className="text-[13px] text-[#5a5a60] mt-1 mb-3">Registers payer and service in AgentVault and SpendPolicy.</div>
              <button
                disabled={!canStep(1)}
                onClick={step1}
                className="w-full bg-[#1f3a8f] disabled:opacity-40 text-white mono text-[11px] font-bold tracking-widest py-3 rounded-md"
              >
                REGISTER AGENTS
              </button>
              <TxResult status={steps[1]} label="Registering" />
            </div>
          </div>

          {/* Step 2 */}
          <div className="flex gap-3">
            <StepNum n={2} state={steps[2].state} />
            <div className="flex-1 border-l border-dashed border-[rgba(22,23,25,0.12)] pl-4">
              <div className="font-semibold text-[16px]">Encrypt &amp; Deposit</div>
              <div className="text-[13px] text-[#5a5a60] mt-1 mb-2">Amount is encrypted client-side via Zama Relayer SDK before hitting the chain.</div>
              <div className="mb-3">
                <div className="mono text-[10px] text-[#5a5a60] mb-1">DEPOSIT AMOUNT (base units, e.g. 100000 = 1000.00)</div>
                <input
                  type="number"
                  value={depositAmt}
                  onChange={e => setDepositAmt(e.target.value)}
                  className="w-full bg-[#e2ded5] border border-[rgba(22,23,25,0.12)] rounded-md px-3 py-2 mono text-[13px] outline-none focus:border-[#1f3a8f]"
                />
              </div>
              <button
                disabled={!canStep(2)}
                onClick={step2}
                className="w-full bg-[#1f3a8f] disabled:opacity-40 text-white mono text-[11px] font-bold tracking-widest py-3 rounded-md"
              >
                ENCRYPT &amp; DEPOSIT
              </button>
              <TxResult status={steps[2]} label="Encrypting and depositing" />
            </div>
          </div>

          {/* Step 3 */}
          <div className="flex gap-3">
            <StepNum n={3} state={steps[3].state} />
            <div className="flex-1 border-l border-dashed border-[rgba(22,23,25,0.12)] pl-4">
              <div className="font-semibold text-[16px]">Set Spend Limit</div>
              <div className="text-[13px] text-[#5a5a60] mt-1 mb-2">Encrypted per-service cap. PaymentGate runs FHE.le against this on ciphertext.</div>
              <div className="mb-3">
                <div className="mono text-[10px] text-[#5a5a60] mb-1">SPEND LIMIT (same units)</div>
                <input
                  type="number"
                  value={limitAmt}
                  onChange={e => setLimitAmt(e.target.value)}
                  className="w-full bg-[#e2ded5] border border-[rgba(22,23,25,0.12)] rounded-md px-3 py-2 mono text-[13px] outline-none focus:border-[#1f3a8f]"
                />
              </div>
              <button
                disabled={!canStep(3)}
                onClick={step3}
                className="w-full bg-[#1f3a8f] disabled:opacity-40 text-white mono text-[11px] font-bold tracking-widest py-3 rounded-md"
              >
                SET LIMIT
              </button>
              <TxResult status={steps[3]} label="Encrypting limit" />
            </div>
          </div>

          {/* Step 4 */}
          <div className="flex gap-3">
            <StepNum n={4} state={steps[4].state} />
            <div className="flex-1 border-l border-dashed border-[rgba(22,23,25,0.12)] pl-4">
              <div className="font-semibold text-[16px]">Grant PaymentGate Access</div>
              <div className="text-[13px] text-[#5a5a60] mt-1 mb-3">Allows PaymentGate to run FHE.le on your encrypted balance and limit.</div>
              <button
                disabled={!canStep(4)}
                onClick={step4}
                className="w-full bg-[#1f3a8f] disabled:opacity-40 text-white mono text-[11px] font-bold tracking-widest py-3 rounded-md"
              >
                GRANT ACCESS
              </button>
              <TxResult status={steps[4]} label="Granting ACL access" />
            </div>
          </div>

          {/* Step 5 */}
          <div className="flex gap-3">
            <StepNum n={5} state={steps[5].state} />
            <div className="flex-1 pl-4">
              <div className="font-semibold text-[16px]">Send Confidential Payment</div>
              <div className="text-[13px] text-[#5a5a60] mt-1 mb-2">
                Encrypts the amount, fires requestPayment(). FHE.le checks balance + limit.
                FHE.select resolves transfer. Only approved/declined is ever public.
              </div>
              <div className="mb-3">
                <div className="mono text-[10px] text-[#5a5a60] mb-1">PAYMENT AMOUNT (must be ≤ limit)</div>
                <input
                  type="number"
                  value={paymentAmt}
                  onChange={e => setPaymentAmt(e.target.value)}
                  className="w-full bg-[#e2ded5] border border-[rgba(22,23,25,0.12)] rounded-md px-3 py-2 mono text-[13px] outline-none focus:border-[#1f3a8f]"
                />
              </div>
              <button
                disabled={!canStep(5)}
                onClick={step5}
                className="w-full bg-[#ffd208] disabled:opacity-40 text-[#000] mono text-[11px] font-bold tracking-widest py-3 rounded-md"
              >
                SEND ENCRYPTED PAYMENT
              </button>
              <TxResult status={steps[5]} label="Encrypting and sending" />
            </div>
          </div>

        </div>

        <p className="mono text-[11px] text-[#5a5a60] leading-relaxed mt-4">
          All encrypted values are generated client-side using the Zama Relayer SDK.
          No amount is ever submitted in plaintext. The only public trace is a
          PaymentProcessed(agentId, serviceId, approvedHandle) event on Sepolia.
        </p>
      </div>

      <Footer />
    </div>
  );
}