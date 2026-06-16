import { HardhatUserConfig, vars } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@fhevm/hardhat-plugin";
import "hardhat-deploy";

// Set these once with:
//   npx hardhat vars set MNEMONIC
//   npx hardhat vars set INFURA_API_KEY
//   npx hardhat vars set ETHERSCAN_API_KEY
const MNEMONIC = vars.get(
  "MNEMONIC",
  "test test test test test test test test test test test junk"
);
const SEPOLIA_RPC_URL = vars.get("SEPOLIA_RPC_URL", "https://ethereum-sepolia-rpc.publicnode.com");
const ETHERSCAN_API_KEY = vars.get("ETHERSCAN_API_KEY", "");

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      evmVersion: "cancun",
    },
  },
  namedAccounts: {
    deployer: {
      default: 0,
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
    },
    localhost: {
      chainId: 31337,
      url: "http://127.0.0.1:8545",
    },
    sepolia: {
      chainId: 11155111,
      url: SEPOLIA_RPC_URL,
      accounts: {
        mnemonic: MNEMONIC,
      },
    },
  },
  etherscan: {
    apiKey: ETHERSCAN_API_KEY,
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};

export default config;
