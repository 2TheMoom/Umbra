import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const deployPaymentGate: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, ethers } = hre;
  const { deploy, log, get } = deployments;
  const { deployer } = await getNamedAccounts();

  const agentVault = await get("AgentVault");

  const spendPolicy = await deploy("SpendPolicy", {
    from: deployer,
    log: true,
    args: [],
  });

  const paymentGate = await deploy("PaymentGate", {
    from: deployer,
    log: true,
    args: [agentVault.address, spendPolicy.address],
  });

  // One-time wiring: tell AgentVault which PaymentGate is allowed to call
  // settlePayment. Only the original deployer can do this, and only once.
  const vault = await ethers.getContractAt("AgentVault", agentVault.address);
  const currentGate = await vault.paymentGate();

  if (currentGate === ethers.ZeroAddress) {
    const tx = await vault.setPaymentGate(paymentGate.address);
    await tx.wait();
    log(`AgentVault.setPaymentGate -> ${paymentGate.address}`);
  } else {
    log(`AgentVault.paymentGate already set to ${currentGate}, skipping`);
  }
};

deployPaymentGate.tags = ["PaymentGate"];
deployPaymentGate.dependencies = ["AgentVault"];

export default deployPaymentGate;
