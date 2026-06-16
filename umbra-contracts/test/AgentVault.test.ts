import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { FhevmType } from "@fhevm/hardhat-plugin";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import type { AgentVault } from "../types";

describe("AgentVault", function () {
  let vault: AgentVault;
  let vaultAddress: string;
  let owner: HardhatEthersSigner;
  let other: HardhatEthersSigner;

  const AGENT_ID = 1;

  before(async function () {
    [owner, other] = await ethers.getSigners();
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      throw new Error("This test suite runs against the FHEVM mock environment only.");
    }

    const factory = await ethers.getContractFactory("AgentVault");
    vault = (await factory.deploy()) as unknown as AgentVault;
    vaultAddress = await vault.getAddress();
  });

  it("registers an agent and initializes its balance to zero", async function () {
    await expect(vault.connect(owner).registerAgent(AGENT_ID))
      .to.emit(vault, "AgentRegistered")
      .withArgs(AGENT_ID, owner.address);

    expect(await vault.agentOwner(AGENT_ID)).to.equal(owner.address);

    const encryptedBalance = await vault.balanceOf(AGENT_ID);
    const balance = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      encryptedBalance,
      vaultAddress,
      owner
    );

    expect(balance).to.equal(0n);
  });

  it("rejects a second registration of the same agent ID", async function () {
    await vault.connect(owner).registerAgent(AGENT_ID);

    await expect(vault.connect(other).registerAgent(AGENT_ID)).to.be.revertedWithCustomError(
      vault,
      "AlreadyRegistered"
    );
  });

  it("deposits an encrypted amount and updates the encrypted balance", async function () {
    await vault.connect(owner).registerAgent(AGENT_ID);

    const depositAmount = 1_250_00n; // 1,250.00 cUSDT, 2 decimals

    const encryptedInput = await fhevm
      .createEncryptedInput(vaultAddress, owner.address)
      .add64(depositAmount)
      .encrypt();

    await expect(
      vault
        .connect(owner)
        .deposit(AGENT_ID, encryptedInput.handles[0], encryptedInput.inputProof)
    )
      .to.emit(vault, "Deposited")
      .withArgs(AGENT_ID, owner.address);

    const encryptedBalance = await vault.balanceOf(AGENT_ID);
    const balance = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      encryptedBalance,
      vaultAddress,
      owner
    );

    expect(balance).to.equal(depositAmount);
  });

  it("withdraws an encrypted amount when sufficient balance is available", async function () {
    await vault.connect(owner).registerAgent(AGENT_ID);

    const depositAmount = 1_250_00n;
    const withdrawAmount = 320_00n;

    const depositInput = await fhevm
      .createEncryptedInput(vaultAddress, owner.address)
      .add64(depositAmount)
      .encrypt();

    await vault
      .connect(owner)
      .deposit(AGENT_ID, depositInput.handles[0], depositInput.inputProof);

    const withdrawInput = await fhevm
      .createEncryptedInput(vaultAddress, owner.address)
      .add64(withdrawAmount)
      .encrypt();

    await expect(
      vault
        .connect(owner)
        .withdraw(AGENT_ID, withdrawInput.handles[0], withdrawInput.inputProof)
    )
      .to.emit(vault, "Withdrawn")
      .withArgs(AGENT_ID, owner.address);

    const encryptedBalance = await vault.balanceOf(AGENT_ID);
    const balance = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      encryptedBalance,
      vaultAddress,
      owner
    );

    expect(balance).to.equal(depositAmount - withdrawAmount);
  });

  it("resolves an over-balance withdrawal to zero instead of reverting", async function () {
    await vault.connect(owner).registerAgent(AGENT_ID);

    const depositAmount = 100_00n;
    const withdrawAmount = 500_00n; // exceeds balance

    const depositInput = await fhevm
      .createEncryptedInput(vaultAddress, owner.address)
      .add64(depositAmount)
      .encrypt();

    await vault
      .connect(owner)
      .deposit(AGENT_ID, depositInput.handles[0], depositInput.inputProof);

    const withdrawInput = await fhevm
      .createEncryptedInput(vaultAddress, owner.address)
      .add64(withdrawAmount)
      .encrypt();

    // Does not revert, FHE.select resolves the withdrawal to zero on-chain.
    await vault
      .connect(owner)
      .withdraw(AGENT_ID, withdrawInput.handles[0], withdrawInput.inputProof);

    const encryptedBalance = await vault.balanceOf(AGENT_ID);
    const balance = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      encryptedBalance,
      vaultAddress,
      owner
    );

    // Balance is unchanged, the zero-withdrawal was subtracted instead.
    expect(balance).to.equal(depositAmount);
  });

  it("reverts when a non-owner tries to deposit, withdraw, or grant access", async function () {
    await vault.connect(owner).registerAgent(AGENT_ID);

    const input = await fhevm
      .createEncryptedInput(vaultAddress, other.address)
      .add64(100n)
      .encrypt();

    await expect(
      vault.connect(other).deposit(AGENT_ID, input.handles[0], input.inputProof)
    ).to.be.revertedWithCustomError(vault, "NotAgentOwner");

    await expect(
      vault.connect(other).withdraw(AGENT_ID, input.handles[0], input.inputProof)
    ).to.be.revertedWithCustomError(vault, "NotAgentOwner");

    await expect(
      vault.connect(other).grantAccess(AGENT_ID, other.address)
    ).to.be.revertedWithCustomError(vault, "NotAgentOwner");
  });
});
