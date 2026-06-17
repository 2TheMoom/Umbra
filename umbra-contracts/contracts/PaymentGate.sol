// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import { FHE, euint64, ebool, externalEuint64 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";
import { AgentVault } from "./AgentVault.sol";
import { SpendPolicy } from "./SpendPolicy.sol";

/// @title PaymentGate
/// @notice The x402-style payment processor for Umbra. Checks an agent's
///         AgentVault balance and SpendPolicy limit, both on ciphertext,
///         then resolves and settles the transfer via FHE.select.
/// @dev Before requestPayment can run for a given agentId/serviceId pair,
///      the agent owner must:
///        1. vault.registerAgent(agentId) and vault.registerAgent(serviceId)
///        2. vault.deposit(agentId, ...) to fund the vault
///        3. policy.registerAgent(agentId)
///        4. policy.setLimit(agentId, serviceId, ...)
///        5. vault.grantAccess(agentId, address(paymentGate))
///        6. policy.grantAccess(agentId, serviceId, address(paymentGate))
///      Steps 5 and 6 are what let this contract run FHE.le against
///      ciphertext it does not own. Without them, requestPayment reverts
///      with an FHEVM ACL error, not a logic error.
contract PaymentGate is ZamaEthereumConfig {
    AgentVault public immutable vault;
    SpendPolicy public immutable policy;

    /// @notice Emitted after every payment request.
    /// @param approvedHandle The ciphertext handle for the approved/declined
    ///        ebool. It is made publicly decryptable in this same call, so
    ///        anyone can resolve it via the Relayer SDK's public decryption
    ///        endpoint, no signature required. This is the only thing about
    ///        the payment that is ever public besides the agent and service IDs.
    event PaymentProcessed(uint256 indexed agentId, uint256 indexed serviceId, bytes32 approvedHandle);

    constructor(address vaultAddress, address policyAddress) {
        vault = AgentVault(vaultAddress);
        policy = SpendPolicy(policyAddress);
    }

    /// @notice Requests a confidential payment from agentId to serviceId.
    /// @dev Runs FHE.le against both the vault balance and the spend policy
    ///      limit, entirely on ciphertext. FHE.select resolves the actual
    ///      transfer amount to zero if either check fails, so the call
    ///      never reverts based on encrypted values. The resolved approval
    ///      boolean is made publicly decryptable and is the only signal
    ///      this function ever exposes.
    function requestPayment(
        uint256 agentId,
        uint256 serviceId,
        externalEuint64 encryptedAmount,
        bytes calldata inputProof
    ) external {
        euint64 amount = FHE.fromExternal(encryptedAmount, inputProof);

        euint64 balance = vault.balanceOf(agentId);
        euint64 limit = policy.getLimit(agentId, serviceId);

        ebool hasFunds = FHE.le(amount, balance);
        ebool withinLimit = FHE.le(amount, limit);
        ebool approved = FHE.and(hasFunds, withinLimit);

        euint64 transferAmount = FHE.select(approved, amount, FHE.asEuint64(0));

        // Grant the vault permission to operate on this freshly computed
        // ciphertext before asking it to settle the payment.
        FHE.allowThis(transferAmount);
        FHE.allow(transferAmount, address(vault));

        vault.settlePayment(agentId, serviceId, transferAmount);

        FHE.makePubliclyDecryptable(approved);

        emit PaymentProcessed(agentId, serviceId, ebool.unwrap(approved));
    }
}
