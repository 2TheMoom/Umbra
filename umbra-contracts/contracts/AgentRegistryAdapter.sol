// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

/// @title AgentRegistryAdapter
/// @notice Thin adapter over an ERC-8004 agent identity registry.
/// @dev STUB. Milestone 2 wires this to the real ERC-8004 registry
///      (reusing the existing Agent ID pattern from CeloSense). For now
///      AgentVault and SpendPolicy each track ownership locally; once this
///      contract exists, that local bookkeeping is replaced by calls here.
contract AgentRegistryAdapter {
    /// @dev TODO milestone 2: point this at the deployed ERC-8004 registry
    ///      address and forward isRegisteredAgent / ownerOf to it.
    address public erc8004Registry;

    constructor(address registry) {
        erc8004Registry = registry;
    }

    function isRegisteredAgent(uint256 /* agentId */ ) external pure returns (bool) {
        // TODO milestone 2: forward to erc8004Registry
        return false;
    }

    function ownerOf(uint256 /* agentId */ ) external pure returns (address) {
        // TODO milestone 2: forward to erc8004Registry
        return address(0);
    }
}
