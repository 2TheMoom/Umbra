// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import { FHE, euint64, externalEuint64 } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title SpendPolicy
/// @notice Stores per-agent, per-service encrypted spend limits.
/// @dev Part of the Umbra confidential payment gate. PaymentGate reads
///      these limits (via getLimit, after grantAccess) to authorize
///      payments on ciphertext, the limit value itself is never exposed
///      on-chain.
contract SpendPolicy is SepoliaConfig {
    /// @notice limit[agentId][serviceId] = encrypted max spend per call
    mapping(uint256 => mapping(uint256 => euint64)) private _limits;

    /// @notice Owner address per agent ID. Mirrors AgentVault's
    ///         registration for now; both are replaced by
    ///         AgentRegistryAdapter in a later pass.
    mapping(uint256 => address) public agentOwner;

    event AgentRegistered(uint256 indexed agentId, address indexed owner);
    event LimitSet(uint256 indexed agentId, uint256 indexed serviceId);
    event AccessGranted(uint256 indexed agentId, uint256 indexed serviceId, address indexed account);

    error NotAgentOwner(uint256 agentId, address caller);
    error AlreadyRegistered(uint256 agentId);

    modifier onlyAgentOwner(uint256 agentId) {
        if (agentOwner[agentId] != msg.sender) revert NotAgentOwner(agentId, msg.sender);
        _;
    }

    /// @dev TODO: replace with AgentRegistryAdapter lookup once that
    ///      contract is wired in, so AgentVault and SpendPolicy share one
    ///      source of truth for ownership instead of each tracking it.
    function registerAgent(uint256 agentId) external {
        if (agentOwner[agentId] != address(0)) revert AlreadyRegistered(agentId);
        agentOwner[agentId] = msg.sender;
        emit AgentRegistered(agentId, msg.sender);
    }

    /// @notice Sets the encrypted max spend for an agent against a service.
    /// @dev An unset limit defaults to encrypted zero, so PaymentGate will
    ///      decline any payment until a limit has been explicitly set.
    function setLimit(uint256 agentId, uint256 serviceId, externalEuint64 encryptedLimit, bytes calldata inputProof)
        external
        onlyAgentOwner(agentId)
    {
        euint64 limit = FHE.fromExternal(encryptedLimit, inputProof);
        _limits[agentId][serviceId] = limit;

        FHE.allowThis(_limits[agentId][serviceId]);
        FHE.allow(_limits[agentId][serviceId], msg.sender);

        emit LimitSet(agentId, serviceId);
    }

    /// @notice Returns the ciphertext handle for an agent's spend limit
    ///         against a given service.
    function getLimit(uint256 agentId, uint256 serviceId) external view returns (euint64) {
        return _limits[agentId][serviceId];
    }

    /// @notice Grants another contract or address (e.g. PaymentGate)
    ///         permission to operate on and decrypt a limit.
    function grantAccess(uint256 agentId, uint256 serviceId, address account) external onlyAgentOwner(agentId) {
        FHE.allow(_limits[agentId][serviceId], account);
        emit AccessGranted(agentId, serviceId, account);
    }
}
