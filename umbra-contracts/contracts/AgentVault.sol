// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import { FHE, euint64, ebool, externalEuint64 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract AgentVault is ZamaEthereumConfig {
    address public immutable deployer;
    address public paymentGate;

    mapping(uint256 => euint64) private _balances;
    mapping(uint256 => euint64) private _totalSpent;
    mapping(uint256 => euint64) private _totalReceived;
    mapping(uint256 => address) public agentOwner;
    mapping(address => uint256[]) private _agentsByOwner;

    event AgentRegistered(uint256 indexed agentId, address indexed owner);
    event Deposited(uint256 indexed agentId, address indexed from);
    event Withdrawn(uint256 indexed agentId, address indexed to);
    event AccessGranted(uint256 indexed agentId, address indexed account);
    event PaymentGateSet(address indexed paymentGate);
    event Settled(uint256 indexed fromAgentId, uint256 indexed toAgentId);

    error NotAgentOwner(uint256 agentId, address caller);
    error AlreadyRegistered(uint256 agentId);
    error NotDeployer(address caller);
    error NotPaymentGate(address caller);
    error PaymentGateAlreadySet();
    error AgentNotRegistered(uint256 agentId);

    modifier onlyAgentOwner(uint256 agentId) {
        if (agentOwner[agentId] != msg.sender) revert NotAgentOwner(agentId, msg.sender);
        _;
    }

    modifier onlyPaymentGate() {
        if (msg.sender != paymentGate) revert NotPaymentGate(msg.sender);
        _;
    }

    constructor() {
        deployer = msg.sender;
    }

    function setPaymentGate(address gate) external {
        if (msg.sender != deployer) revert NotDeployer(msg.sender);
        if (paymentGate != address(0)) revert PaymentGateAlreadySet();
        paymentGate = gate;
        emit PaymentGateSet(gate);
    }

    function registerAgent(uint256 agentId) external {
        if (agentOwner[agentId] != address(0)) revert AlreadyRegistered(agentId);

        agentOwner[agentId]     = msg.sender;
        _balances[agentId]      = FHE.asEuint64(0);
        _totalSpent[agentId]    = FHE.asEuint64(0);
        _totalReceived[agentId] = FHE.asEuint64(0);

        FHE.allowThis(_balances[agentId]);
        FHE.allow(_balances[agentId], msg.sender);

        FHE.allowThis(_totalSpent[agentId]);
        FHE.allow(_totalSpent[agentId], msg.sender);

        FHE.allowThis(_totalReceived[agentId]);
        FHE.allow(_totalReceived[agentId], msg.sender);

        _agentsByOwner[msg.sender].push(agentId);

        emit AgentRegistered(agentId, msg.sender);
    }

    function deposit(uint256 agentId, externalEuint64 encryptedAmount, bytes calldata inputProof)
        external
        onlyAgentOwner(agentId)
    {
        euint64 amount = FHE.fromExternal(encryptedAmount, inputProof);
        _balances[agentId] = FHE.add(_balances[agentId], amount);

        FHE.allowThis(_balances[agentId]);
        FHE.allow(_balances[agentId], msg.sender);

        emit Deposited(agentId, msg.sender);
    }

    function withdraw(uint256 agentId, externalEuint64 encryptedAmount, bytes calldata inputProof)
        external
        onlyAgentOwner(agentId)
    {
        euint64 amount    = FHE.fromExternal(encryptedAmount, inputProof);
        euint64 balance   = _balances[agentId];
        ebool sufficient  = FHE.le(amount, balance);
        euint64 toWithdraw = FHE.select(sufficient, amount, FHE.asEuint64(0));
        _balances[agentId] = FHE.sub(balance, toWithdraw);

        FHE.allowThis(_balances[agentId]);
        FHE.allow(_balances[agentId], msg.sender);

        emit Withdrawn(agentId, msg.sender);
    }

    function settlePayment(uint256 fromAgentId, uint256 toAgentId, euint64 amount)
        external
        onlyPaymentGate
    {
        if (agentOwner[fromAgentId] == address(0)) revert AgentNotRegistered(fromAgentId);
        if (agentOwner[toAgentId]   == address(0)) revert AgentNotRegistered(toAgentId);

        _balances[fromAgentId]      = FHE.sub(_balances[fromAgentId], amount);
        _balances[toAgentId]        = FHE.add(_balances[toAgentId],   amount);
        _totalSpent[fromAgentId]    = FHE.add(_totalSpent[fromAgentId],    amount);
        _totalReceived[toAgentId]   = FHE.add(_totalReceived[toAgentId],   amount);

        address fromOwner = agentOwner[fromAgentId];
        address toOwner   = agentOwner[toAgentId];

        FHE.allowThis(_balances[fromAgentId]);
        FHE.allow(_balances[fromAgentId], fromOwner);
        FHE.allow(_balances[fromAgentId], paymentGate);

        FHE.allowThis(_balances[toAgentId]);
        FHE.allow(_balances[toAgentId], toOwner);
        FHE.allow(_balances[toAgentId], paymentGate);

        FHE.allowThis(_totalSpent[fromAgentId]);
        FHE.allow(_totalSpent[fromAgentId], fromOwner);

        FHE.allowThis(_totalReceived[toAgentId]);
        FHE.allow(_totalReceived[toAgentId], toOwner);

        emit Settled(fromAgentId, toAgentId);
    }

    function grantAccess(uint256 agentId, address account) external onlyAgentOwner(agentId) {
        FHE.allow(_balances[agentId],      account);
        FHE.allow(_totalSpent[agentId],    account);
        FHE.allow(_totalReceived[agentId], account);
        emit AccessGranted(agentId, account);
    }

    function balanceOf(uint256 agentId) external view returns (euint64) {
        return _balances[agentId];
    }

    function totalSpent(uint256 agentId) external view returns (euint64) {
        return _totalSpent[agentId];
    }

    function totalReceived(uint256 agentId) external view returns (euint64) {
        return _totalReceived[agentId];
    }

    function agentsOf(address owner) external view returns (uint256[] memory) {
        return _agentsByOwner[owner];
    }
}