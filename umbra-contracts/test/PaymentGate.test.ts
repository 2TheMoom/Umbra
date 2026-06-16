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

  const AGENT_ID = 1; // the paying agent
  const SERVICE_ID = 2; // the receiving service, also tracked as an agent in AgentVault

  const DEPOSIT_AMOUNT = 1_250_00n; // 1,250.00 cUSDT
  const LIMIT_AMOUNT = 500_00n; // 500.00 cUSDT spend limit, AGENT_ID -> SERVICE_ID

  beforeEach(async function () {
    if (!fhevm.isMock) {
      throw new Error("This test suite runs against the FHEVM mock environment only.");
    }

    [payer, service] = await ethers.getSigners();

    const vaultFactory = await ethers.getContractFactory("AgentVault");
    vault = (await vaultFactory.deploy()) as unknown as AgentVault;
    vaultAddress = await vault.getAddress();

    const policyFactory = await ethers.getContractFactory("SpendPolicy");
    policy = (await policyFactory.deploy()) as unknown as SpendPolicy;
    policyAddress = await policy.getAddress();

    const gateFactory = await ethers.getContractFactory("PaymentGate");
    gate = (await gateFactory.deploy(vaultAddress, policyAddress)) as unknown as PaymentGate;
    gateAddress = await gate.getAddress();

    // One-time wiring, deployer of AgentVault (= payer, signers[0]) only.
    await vault.connect(payer).setPaymentGate(gateAddress);

    // Register the payer's agent and the service as agents in the vault,
    // settlePayment requires both sides to be registered.
    await vault.connect(payer).registerAgent(AGENT_ID);
    await vault.connect(service).registerAgent(SERVICE_ID);

    // Register the payer's agent in the spend policy.
    await policy.connect(payer).registerAgent(AGENT_ID);

    // Fund the payer's vault.
    const depositInput = await fhevm
      .createEncryptedInput(vaultAddress, payer.address)
      .add64(DEPOSIT_AMOUNT)
      .encrypt();
    await vault.connect(payer).deposit(AGENT_ID, depositInput.handles[0], depositInput.inputProof);

    // Set the spend limit for AGENT_ID -> SERVICE_ID.
    const limitInput = await fhevm
      .createEncryptedInput(policyAddress, payer.address)
      .add64(LIMIT_AMOUNT)
      .encrypt();
    await policy
      .connect(payer)
      .setLimit(AGENT_ID, SERVICE_ID, limitInput.handles[0], limitInput.inputProof);

    // Grant PaymentGate permission to operate on the balance and the limit.
    // Without these two calls, requestPayment reverts on an FHEVM ACL error,
    // not a logic error, this is the step that's easy to forget.
    await vault.connect(payer).grantAccess(AGENT_ID, gateAddress);
    await policy.connect(payer).grantAccess(AGENT_ID, SERVICE_ID, gateAddress);
  });

  /** Pulls the PaymentProcessed event out of a transaction receipt. */
  async function getApprovedHandle(tx: Awaited<ReturnType<typeof gate.requestPayment>>) {
    const receipt = await tx.wait();
    const event = receipt!.logs
      .map((log) => {
        try {
          return gate.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((parsed) => parsed?.name === "PaymentProcessed");

    expect(event, "PaymentProcessed event not found").to.not.be.undefined;
    return event!.args.approvedHandle as string;
  }

  it("approves and settles a payment within balance and spend limit", async function () {
    const paymentAmount = 320_00n; // within both the 1,250 balance and the 500 limit

    const paymentInput = await fhevm
      .createEncryptedInput(gateAddress, payer.address)
      .add64(paymentAmount)
      .encrypt();

    const tx = await gate
      .connect(payer)
      .requestPayment(AGENT_ID, SERVICE_ID, paymentInput.handles[0], paymentInput.inputProof);

    const approvedHandle = await getApprovedHandle(tx);
    const approved = await fhevm.publicDecryptEbool(approvedHandle);
    expect(approved).to.equal(true);

    const payerBalance = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      await vault.balanceOf(AGENT_ID),
      vaultAddress,
      payer
    );
    expect(payerBalance).to.equal(DEPOSIT_AMOUNT - paymentAmount);

    const serviceBalance = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      await vault.balanceOf(SERVICE_ID),
      vaultAddress,
      service
    );
    expect(serviceBalance).to.equal(paymentAmount);
  });

  it("declines a payment over the spend limit and leaves balances unchanged", async function () {
    const paymentAmount = 800_00n; // exceeds the 500 limit, within the 1,250 balance

    const paymentInput = await fhevm
      .createEncryptedInput(gateAddress, payer.address)
      .add64(paymentAmount)
      .encrypt();

    const tx = await gate
      .connect(payer)
      .requestPayment(AGENT_ID, SERVICE_ID, paymentInput.handles[0], paymentInput.inputProof);

    const approvedHandle = await getApprovedHandle(tx);
    const approved = await fhevm.publicDecryptEbool(approvedHandle);
    expect(approved).to.equal(false);

    const payerBalance = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      await vault.balanceOf(AGENT_ID),
      vaultAddress,
      payer
    );
    expect(payerBalance).to.equal(DEPOSIT_AMOUNT);

    const serviceBalance = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      await vault.balanceOf(SERVICE_ID),
      vaultAddress,
      service
    );
    expect(serviceBalance).to.equal(0n);
  });

  it("declines a payment over the available balance", async function () {
    const paymentAmount = 2_000_00n; // exceeds the 1,250 balance entirely

    const paymentInput = await fhevm
      .createEncryptedInput(gateAddress, payer.address)
      .add64(paymentAmount)
      .encrypt();

    const tx = await gate
      .connect(payer)
      .requestPayment(AGENT_ID, SERVICE_ID, paymentInput.handles[0], paymentInput.inputProof);

    const approvedHandle = await getApprovedHandle(tx);
    const approved = await fhevm.publicDecryptEbool(approvedHandle);
    expect(approved).to.equal(false);
  });
});
