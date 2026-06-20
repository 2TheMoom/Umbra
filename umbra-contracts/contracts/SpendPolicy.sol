// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import { FHE, euint64, externalEuint64 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract SpendPolicy is ZamaEthereumConfig {
    uint256 public constant WINDOW_SIZE = 7200;

    mapping(uint256 => mapping(uint256 => euint64)) private _limits;
    mapping(uint256 => mapping(uint256 => euint64)) private _maxCount;
    mapping(uint256 => mapping(uint256 => euint64)) private _paymentCount;
    mapping(uint256 => mapping(uint256 => uint256)) public windowStart;
    mapping(uint256 => address) public agentOwner;

    event AgentRegistered(uint256 indexed agentId, address indexed owner);
    event LimitSet(uint256 indexed agentId, uint256 indexed serviceId);
    event FrequencyLimitSet(uint256 indexed agentId, uint256 indexed serviceId);
    event AccessGranted(uint256 indexed agentId, uint256 indexed serviceId, address indexed account);

    error NotAgentOwner(uint256 agentId, address caller);
    error AlreadyRegistered(uint256 agentId);

    modifier onlyAgentOwner(uint256 agentId) {
        if (agentOwner[agentId] != msg.sender) revert NotAgentOwner(agentId, msg.sender);
        _;
    }

    function registerAgent(uint256 agentId) external {
        if (agentOwner[agentId] != address(0)) revert AlreadyRegistered(agentId);
        agentOwner[agentId] = msg.sender;
        emit AgentRegistered(agentId, msg.sender);
    }

    function setLimit(
        uint256 agentId,
        uint256 serviceId,
        externalEuint64 encryptedLimit,
        bytes calldata inputProof
    ) external onlyAgentOwner(agentId) {
        euint64 limit = FHE.fromExternal(encryptedLimit, inputProof);
        _limits[agentId][serviceId] = limit;

        FHE.allowThis(_limits[agentId][serviceId]);
        FHE.allow(_limits[agentId][serviceId], msg.sender);

        emit LimitSet(agentId, serviceId);
    }

    function setFrequencyLimit(
        uint256 agentId,
        uint256 serviceId,
        externalEuint64 encryptedMaxCount,
        bytes calldata inputProof
    ) external onlyAgentOwner(agentId) {
        euint64 maxCount = FHE.fromExternal(encryptedMaxCount, inputProof);
        _maxCount[agentId][serviceId]     = maxCount;
        _paymentCount[agentId][serviceId] = FHE.asEuint64(0);
        windowStart[agentId][serviceId]   = block.number;

        FHE.allowThis(_maxCount[agentId][serviceId]);
        FHE.allow(_maxCount[agentId][serviceId], msg.sender);

        FHE.allowThis(_paymentCount[agentId][serviceId]);
        FHE.allow(_paymentCount[agentId][serviceId], msg.sender);

        emit FrequencyLimitSet(agentId, serviceId);
    }

    function incrementCount(uint256 agentId, uint256 serviceId, address gateAddress) external {
        uint256 ws = windowStart[agentId][serviceId];
        if (ws == 0) return;

        if (block.number - ws >= WINDOW_SIZE) {
            _paymentCount[agentId][serviceId] = FHE.asEuint64(0);
            windowStart[agentId][serviceId]   = block.number;
        }

        _paymentCount[agentId][serviceId] = FHE.add(
            _paymentCount[agentId][serviceId],
            FHE.asEuint64(1)
        );

        FHE.allowThis(_paymentCount[agentId][serviceId]);
        FHE.allow(_paymentCount[agentId][serviceId], agentOwner[agentId]);
        FHE.allow(_paymentCount[agentId][serviceId], gateAddress);
    }

    function grantAccess(uint256 agentId, uint256 serviceId, address account)
        external
        onlyAgentOwner(agentId)
    {
        FHE.allow(_limits[agentId][serviceId],       account);
        FHE.allow(_maxCount[agentId][serviceId],     account);
        FHE.allow(_paymentCount[agentId][serviceId], account);
        emit AccessGranted(agentId, serviceId, account);
    }

    function getLimit(uint256 agentId, uint256 serviceId) external view returns (euint64) {
        return _limits[agentId][serviceId];
    }

    function getMaxCount(uint256 agentId, uint256 serviceId) external view returns (euint64) {
        return _maxCount[agentId][serviceId];
    }

    function getPaymentCount(uint256 agentId, uint256 serviceId) external view returns (euint64) {
        return _paymentCount[agentId][serviceId];
    }

    function blocksUntilReset(uint256 agentId, uint256 serviceId) external view returns (uint256) {
        uint256 ws = windowStart[agentId][serviceId];
        if (ws == 0) return 0;
        uint256 elapsed = block.number - ws;
        if (elapsed >= WINDOW_SIZE) return 0;
        return WINDOW_SIZE - elapsed;
    }
}