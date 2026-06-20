// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import { FHE, euint64, ebool, externalEuint64 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";
import { AgentVault } from "./AgentVault.sol";
import { SpendPolicy } from "./SpendPolicy.sol";

contract PaymentGate is ZamaEthereumConfig {
    AgentVault  public immutable vault;
    SpendPolicy public immutable policy;

    event PaymentProcessed(
        uint256 indexed agentId,
        uint256 indexed serviceId,
        bytes32 approvedHandle
    );

    constructor(address vaultAddress, address policyAddress) {
        vault  = AgentVault(vaultAddress);
        policy = SpendPolicy(policyAddress);
    }

    function requestPayment(
        uint256 agentId,
        uint256 serviceId,
        externalEuint64 encryptedAmount,
        bytes calldata inputProof
    ) external {
        euint64 amount  = FHE.fromExternal(encryptedAmount, inputProof);
        euint64 balance = vault.balanceOf(agentId);
        euint64 limit   = policy.getLimit(agentId, serviceId);

        ebool hasFunds    = FHE.le(amount, balance);
        ebool withinLimit = FHE.le(amount, limit);
        ebool approved    = FHE.and(hasFunds, withinLimit);

        if (policy.windowStart(agentId, serviceId) > 0) {
            euint64 count    = policy.getPaymentCount(agentId, serviceId);
            euint64 maxCount = policy.getMaxCount(agentId, serviceId);
            ebool withinFreq = FHE.lt(count, maxCount);
            approved = FHE.and(approved, withinFreq);
        }

        euint64 transferAmount = FHE.select(approved, amount, FHE.asEuint64(0));

        FHE.allowThis(transferAmount);
        FHE.allow(transferAmount, address(vault));

        vault.settlePayment(agentId, serviceId, transferAmount);

        policy.incrementCount(agentId, serviceId, address(this));

        FHE.makePubliclyDecryptable(approved);

        emit PaymentProcessed(agentId, serviceId, ebool.unwrap(approved));
    }
}