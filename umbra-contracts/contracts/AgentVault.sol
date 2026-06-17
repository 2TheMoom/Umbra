// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import { FHE, euint64, ebool, externalEuint64 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title AgentVault
/// @notice Holds confidential balances for autonomous agents using FHEVM.
///         Balances are stored as encrypted euint64 values, never as
///         plaintext uint256. Only the agent owner, and any contract the
///         owner explicitly grants access to (e.g. PaymentGate), can ever
///         produce a valid decryption of a balance.
/// @dev Part of the Umbra confidential payment gate (Zama Season 3,
///      Builder Track). SpendPolicy and PaymentGate are deployed and wired
///      in separately, see setPaymentGate and settlePayment below.
contract AgentVault is ZamaEthereumConfig {
    /// @notice The address that deployed this contract. Used only to
    ///         authorize the one-time PaymentGate wiring.
    address public immutable deployer;

    /// @notice The PaymentGate contract authorized to call settlePayment.
    ///         Zero until setPaymentGate is called once.
    address public paymentGate;

    /// @notice Encrypted balance per agent ID.
    mapping(uint256 => euint64) private _balances;

    /// @notice Owner address per agent ID. Zero address means unregistered.
    mapping(uint256 => address) public agentOwner;

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

    /// @notice One-time wiring of the PaymentGate contract address.
    /// @dev PaymentGate's constructor needs this vault's address, and this
    ///      vault needs PaymentGate's address, so the order is: deploy
    ///      AgentVault, deploy SpendPolicy, deploy PaymentGate (passing both
    ///      addresses in), then call setPaymentGate here.
    function setPaymentGate(address gate) external {
        if (msg.sender != deployer) revert NotDeployer(msg.sender);
        if (paymentGate != address(0)) revert PaymentGateAlreadySet();
        paymentGate = gate;
        emit PaymentGateSet(gate);
    }

    /// @notice Registers the caller as the owner of an agent ID and
    ///         initializes its encrypted balance to zero.
    /// @dev Standalone for now. Once AgentRegistryAdapter (ERC-8004) is
    ///      wired in, this will be gated behind that registry instead.
    function registerAgent(uint256 agentId) external {
        if (agentOwner[agentId] != address(0)) revert AlreadyRegistered(agentId);

        agentOwner[agentId] = msg.sender;
        _balances[agentId] = FHE.asEuint64(0);

        FHE.allowThis(_balances[agentId]);
        FHE.allow(_balances[agentId], msg.sender);

        emit AgentRegistered(agentId, msg.sender);
    }

    /// @notice Deposits an encrypted amount into an agent's vault.
    /// @param agentId The agent receiving the deposit.
    /// @param encryptedAmount The amount, encrypted client-side via the Relayer SDK.
    /// @param inputProof Proof that encryptedAmount was honestly encrypted for this contract.
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

    /// @notice Withdraws an encrypted amount from an agent's vault.
    /// @dev If the requested amount exceeds the balance, FHE.select resolves
    ///      the withdrawal to zero, the call never reverts based on encrypted
    ///      values, which is what keeps the balance itself private.
    function withdraw(uint256 agentId, externalEuint64 encryptedAmount, bytes calldata inputProof)
        external
        onlyAgentOwner(agentId)
    {
        euint64 amount = FHE.fromExternal(encryptedAmount, inputProof);
        euint64 balance = _balances[agentId];

        ebool sufficient = FHE.le(amount, balance);
        euint64 toWithdraw = FHE.select(sufficient, amount, FHE.asEuint64(0));

        _balances[agentId] = FHE.sub(balance, toWithdraw);

        FHE.allowThis(_balances[agentId]);
        FHE.allow(_balances[agentId], msg.sender);

        emit Withdrawn(agentId, msg.sender);
    }

    /// @notice Settles an approved payment between two registered agents.
    /// @dev Called only by PaymentGate, after it has already resolved
    ///      `amount` via FHE.select, amount is zero for a declined
    ///      payment, so this function is always safe to apply unconditionally.
    ///      PaymentGate must call FHE.allow(amount, address(this)) before
    ///      calling this, so the vault has permission to operate on it.
    function settlePayment(uint256 fromAgentId, uint256 toAgentId, euint64 amount) external onlyPaymentGate {
        if (agentOwner[fromAgentId] == address(0)) revert AgentNotRegistered(fromAgentId);
        if (agentOwner[toAgentId] == address(0)) revert AgentNotRegistered(toAgentId);

        _balances[fromAgentId] = FHE.sub(_balances[fromAgentId], amount);
        _balances[toAgentId] = FHE.add(_balances[toAgentId], amount);

        FHE.allowThis(_balances[fromAgentId]);
        FHE.allow(_balances[fromAgentId], agentOwner[fromAgentId]);
        FHE.allow(_balances[fromAgentId], paymentGate);

        FHE.allowThis(_balances[toAgentId]);
        FHE.allow(_balances[toAgentId], agentOwner[toAgentId]);
        FHE.allow(_balances[toAgentId], paymentGate);

        emit Settled(fromAgentId, toAgentId);
    }

    /// @notice Returns the ciphertext handle for an agent's balance.
    /// @dev This is not the balance itself, it's a handle. Turning it into a
    ///      number requires the EIP-712 user-decryption flow via the Relayer
    ///      SDK, and only succeeds for addresses FHE.allow has been called for.
    function balanceOf(uint256 agentId) external view returns (euint64) {
        return _balances[agentId];
    }

    /// @notice Grants another contract or address permission to operate on
    ///         and decrypt an agent's balance.
    /// @dev Call this with PaymentGate's address before requestPayment can
    ///      run FHE.le against this agent's balance.
    function grantAccess(uint256 agentId, address account) external onlyAgentOwner(agentId) {
        FHE.allow(_balances[agentId], account);
        emit AccessGranted(agentId, account);
    }
}
