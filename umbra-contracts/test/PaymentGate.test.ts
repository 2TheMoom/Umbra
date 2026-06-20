import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { FhevmType } from "@fhevm/hardhat-plugin";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import type { AgentVault, SpendPolicy, PaymentGate } from "../types";

describe("PaymentGate", function () {
  let vault: AgentVault;
  let policy: SpendPolicy;
  let gate: PaymentGate;
  let vaultAddress: string;
  let policyAddress: string;
  let gateAddress: string;
  let payer: HardhatEthersSigner;
  let service: HardhatEthersSigner;

  const AGENT_ID   = 1;
  const SERVICE_ID = 2;
  const DEPOSIT_AMOUNT = 1_250_00n;
  const LIMIT_AMOUNT   = 500_00n;

  beforeEach(async function () {
    if (!fhevm.isMock) throw new Error("Mock environment only.");
    [payer, service] = await ethers.getSigners();

    vault  = (await (await ethers.getContractFactory("AgentVault")).deploy())  as unknown as AgentVault;
    policy = (await (await ethers.getContractFactory("SpendPolicy")).deploy())  as unknown as SpendPolicy;
    vaultAddress  = await vault.getAddress();
    policyAddress = await policy.getAddress();
    gate = (await (await ethers.getContractFactory("PaymentGate")).deploy(vaultAddress, policyAddress)) as unknown as PaymentGate;
    gateAddress = await gate.getAddress();

    await vault.connect(payer).setPaymentGate(gateAddress);
    await vault.connect(payer).registerAgent(AGENT_ID);
    await vault.connect(service).registerAgent(SERVICE_ID);
    await policy.connect(payer).registerAgent(AGENT_ID);

    const depositInput = await fhevm.createEncryptedInput(vaultAddress, payer.address).add64(DEPOSIT_AMOUNT).encrypt();
    await vault.connect(payer).deposit(AGENT_ID, depositInput.handles[0], depositInput.inputProof);

    const limitInput = await fhevm.createEncryptedInput(policyAddress, payer.address).add64(LIMIT_AMOUNT).encrypt();
    await policy.connect(payer).setLimit(AGENT_ID, SERVICE_ID, limitInput.handles[0], limitInput.inputProof);

    await vault.connect(payer).grantAccess(AGENT_ID, gateAddress);
    await policy.connect(payer).grantAccess(AGENT_ID, SERVICE_ID, gateAddress);
  });

  async function getApprovedHandle(tx: Awaited<ReturnType<typeof gate.requestPayment>>) {
    const receipt = await tx.wait();
    const event = receipt!.logs
      .map((log) => { try { return gate.interface.parseLog(log); } catch { return null; } })
      .find((p) => p?.name === "PaymentProcessed");
    expect(event, "PaymentProcessed event not found").to.not.be.undefined;
    return event!.args.approvedHandle as string;
  }

  async function requestPayment(amount: bigint) {
    const input = await fhevm.createEncryptedInput(gateAddress, payer.address).add64(amount).encrypt();
    return gate.connect(payer).requestPayment(AGENT_ID, SERVICE_ID, input.handles[0], input.inputProof);
  }

  it("approves and settles a payment within balance and spend limit", async function () {
    const paymentAmount = 320_00n;
    const approved = await fhevm.publicDecryptEbool(await getApprovedHandle(await requestPayment(paymentAmount)));
    expect(approved).to.equal(true);
    const payerBalance = await fhevm.userDecryptEuint(FhevmType.euint64, await vault.balanceOf(AGENT_ID), vaultAddress, payer);
    expect(payerBalance).to.equal(DEPOSIT_AMOUNT - paymentAmount);
    const serviceBalance = await fhevm.userDecryptEuint(FhevmType.euint64, await vault.balanceOf(SERVICE_ID), vaultAddress, service);
    expect(serviceBalance).to.equal(paymentAmount);
  });

  it("declines a payment over the spend limit and leaves balances unchanged", async function () {
    const approved = await fhevm.publicDecryptEbool(await getApprovedHandle(await requestPayment(800_00n)));
    expect(approved).to.equal(false);
    const payerBalance = await fhevm.userDecryptEuint(FhevmType.euint64, await vault.balanceOf(AGENT_ID), vaultAddress, payer);
    expect(payerBalance).to.equal(DEPOSIT_AMOUNT);
    const serviceBalance = await fhevm.userDecryptEuint(FhevmType.euint64, await vault.balanceOf(SERVICE_ID), vaultAddress, service);
    expect(serviceBalance).to.equal(0n);
  });

  it("declines a payment over the available balance", async function () {
    const approved = await fhevm.publicDecryptEbool(await getApprovedHandle(await requestPayment(2_000_00n)));
    expect(approved).to.equal(false);
  });

  it("totalSpent updates after an approved payment", async function () {
    const paymentAmount = 320_00n;
    const approved = await fhevm.publicDecryptEbool(await getApprovedHandle(await requestPayment(paymentAmount)));
    expect(approved).to.equal(true);
    const spent = await fhevm.userDecryptEuint(FhevmType.euint64, await vault.totalSpent(AGENT_ID), vaultAddress, payer);
    expect(spent).to.equal(paymentAmount);
  });

  it("totalReceived updates after an approved payment", async function () {
    const paymentAmount = 320_00n;
    const approved = await fhevm.publicDecryptEbool(await getApprovedHandle(await requestPayment(paymentAmount)));
    expect(approved).to.equal(true);
    const received = await fhevm.userDecryptEuint(FhevmType.euint64, await vault.totalReceived(SERVICE_ID), vaultAddress, service);
    expect(received).to.equal(paymentAmount);
  });

  it("totalSpent does not update after a declined payment", async function () {
    const approved = await fhevm.publicDecryptEbool(await getApprovedHandle(await requestPayment(800_00n)));
    expect(approved).to.equal(false);
    const spent = await fhevm.userDecryptEuint(FhevmType.euint64, await vault.totalSpent(AGENT_ID), vaultAddress, payer);
    expect(spent).to.equal(0n);
  });

  it("approves a payment within a frequency limit", async function () {
    const freqInput = await fhevm.createEncryptedInput(policyAddress, payer.address).add64(5n).encrypt();
    await policy.connect(payer).setFrequencyLimit(AGENT_ID, SERVICE_ID, freqInput.handles[0], freqInput.inputProof);
    await policy.connect(payer).grantAccess(AGENT_ID, SERVICE_ID, gateAddress);
    const approved = await fhevm.publicDecryptEbool(await getApprovedHandle(await requestPayment(100_00n)));
    expect(approved).to.equal(true);
  });

  it("declines a payment that exceeds the frequency limit", async function () {
    const freqInput = await fhevm.createEncryptedInput(policyAddress, payer.address).add64(1n).encrypt();
    await policy.connect(payer).setFrequencyLimit(AGENT_ID, SERVICE_ID, freqInput.handles[0], freqInput.inputProof);
    await policy.connect(payer).grantAccess(AGENT_ID, SERVICE_ID, gateAddress);
    const approved1 = await fhevm.publicDecryptEbool(await getApprovedHandle(await requestPayment(100_00n)));
    expect(approved1).to.equal(true);
    const approved2 = await fhevm.publicDecryptEbool(await getApprovedHandle(await requestPayment(100_00n)));
    expect(approved2).to.equal(false);
  });

  it("payment succeeds without a frequency limit set", async function () {
    const approved = await fhevm.publicDecryptEbool(await getApprovedHandle(await requestPayment(100_00n)));
    expect(approved).to.equal(true);
  });

  it("blocksUntilReset returns zero before any frequency limit is set", async function () {
    expect(await policy.blocksUntilReset(AGENT_ID, SERVICE_ID)).to.equal(0n);
  });

  it("blocksUntilReset returns a positive value after setFrequencyLimit", async function () {
    const freqInput = await fhevm.createEncryptedInput(policyAddress, payer.address).add64(10n).encrypt();
    await policy.connect(payer).setFrequencyLimit(AGENT_ID, SERVICE_ID, freqInput.handles[0], freqInput.inputProof);
    expect(await policy.blocksUntilReset(AGENT_ID, SERVICE_ID)).to.be.greaterThan(0n);
  });
});