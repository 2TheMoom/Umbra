import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const deployAgentVault: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy, log } = deployments;
  const { deployer } = await getNamedAccounts();

  const agentVault = await deploy("AgentVault", {
    from: deployer,
    log: true,
    args: [],
  });

  log(`AgentVault deployed at: ${agentVault.address}`);
};

deployAgentVault.tags = ["AgentVault"];

export default deployAgentVault;
