// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ICrossChainReceiver} from "./interfaces/ICrossChainReceiver.sol";
import {ICrossChainMessenger} from "./interfaces/ICrossChainMessenger.sol";
import {CrossChainTypes} from "./libraries/CrossChainTypes.sol";

/// @title CollateralVault
/// @notice Custodies collateral on Chain A while a loan exists on another chain.
contract CollateralVault is ICrossChainReceiver, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint64 public constant MAX_LOCK_PROOF_LIFETIME = 1 days;

    enum CollateralState {
        NONE,
        LOCKED,
        PLEDGED,
        RELEASED,
        LIQUIDATED
    }

    struct Collateral {
        address owner;
        address asset;
        uint256 amount;
        uint256 requestedPrincipal;
        uint256 loanId;
        uint64 lockNonce;
        uint64 createdAt;
        uint64 validUntil;
        CollateralState state;
    }

    IERC20 public immutable collateralToken;
    ICrossChainMessenger public immutable messenger;
    uint64 public immutable localChainId;
    address public immutable recoveryRecipient;

    uint64 public remoteChainId;
    address public remoteLendingPool;
    bool public peerConfigured;
    uint64 public outboundNonce;
    uint64 public latestRemoteNonce;

    mapping(address owner => uint64 nonce) public ownerLockNonce;
    mapping(bytes32 collateralId => Collateral collateral) public collaterals;
    mapping(bytes32 messageId => bool processed) public processedMessage;

    error ZeroAddress();
    error PeerNotConfigured();
    error PeerAlreadyConfigured();
    error InvalidAmount();
    error InvalidProofExpiry(uint64 supplied, uint64 currentTime);
    error CollateralIdCollision(bytes32 collateralId);
    error UnsupportedFeeOnTransferToken(uint256 expected, uint256 received);
    error UnauthorizedMessenger(address caller);
    error UnauthorizedSource(uint64 sourceChainId, address sourceSender);
    error MessageAlreadyProcessed(bytes32 messageId);
    error InvalidNonce(uint64 supplied, uint64 expected);
    error InvalidAction(CrossChainTypes.Action action);
    error UnknownCollateral(bytes32 collateralId);
    error InvalidCollateralState(
        bytes32 collateralId,
        CollateralState current,
        CollateralState expected
    );
    error OutcomeMismatch(bytes32 collateralId);
    error InvalidLoanId();

    event PeerConfigured(uint64 indexed remoteChainId, address indexed remoteLendingPool);
    event CollateralLocked(
        bytes32 indexed collateralId,
        address indexed owner,
        address indexed asset,
        uint256 amount,
        uint256 requestedPrincipal,
        uint64 lockNonce,
        uint64 validUntil
    );
    event CollateralPledged(bytes32 indexed collateralId, uint256 indexed loanId);
    event CollateralReleased(
        bytes32 indexed collateralId,
        uint256 indexed loanId,
        address indexed owner,
        uint256 amount
    );
    event CollateralLiquidated(
        bytes32 indexed collateralId,
        uint256 indexed loanId,
        address indexed recoveryRecipient,
        uint256 amount
    );
    event OutboundMessagePrepared(
        CrossChainTypes.Action indexed action,
        uint64 indexed destinationChainId,
        address indexed destinationReceiver,
        uint64 nonce,
        bytes payload,
        uint64 createdAt,
        uint64 validUntil
    );

    /// @param collateralToken_ Supported Chain-A collateral token.
    /// @param messenger_ Authenticated messenger adapter on this chain.
    /// @param localChainId_ Logical domain identifier for this chain.
    /// @param recoveryRecipient_ Fixed recipient of collateral after liquidation.
    /// @param initialOwner Account allowed to perform the one-time peer configuration.
    constructor(
        address collateralToken_,
        address messenger_,
        uint64 localChainId_,
        address recoveryRecipient_,
        address initialOwner
    ) Ownable(initialOwner) {
        if (
            collateralToken_ == address(0) ||
            messenger_ == address(0) ||
            localChainId_ == 0 ||
            recoveryRecipient_ == address(0) ||
            initialOwner == address(0)
        ) revert ZeroAddress();
        if (ICrossChainMessenger(messenger_).localChainId() != localChainId_) {
            revert UnauthorizedMessenger(messenger_);
        }

        collateralToken = IERC20(collateralToken_);
        messenger = ICrossChainMessenger(messenger_);
        localChainId = localChainId_;
        recoveryRecipient = recoveryRecipient_;
    }

    /// @notice Configure the only remote pool allowed to control collateral outcomes.
    /// @dev One-time configuration eliminates peer replacement after locks exist.
    function configurePeer(uint64 remoteChainId_, address remoteLendingPool_) external onlyOwner {
        if (peerConfigured) revert PeerAlreadyConfigured();
        if (remoteChainId_ == 0 || remoteLendingPool_ == address(0)) revert ZeroAddress();
        remoteChainId = remoteChainId_;
        remoteLendingPool = remoteLendingPool_;
        peerConfigured = true;
        emit PeerConfigured(remoteChainId_, remoteLendingPool_);
    }

    /// @notice Lock collateral and prepare a Chain-B loan request.
    /// @param amount Exact collateral amount to hold in this vault.
    /// @param requestedPrincipal Desired Chain-B loan amount, checked against LTV by the pool.
    /// @param validUntil Latest timestamp at which the lock proof may issue a loan.
    /// @return collateralId Globally unique identifier for this lock.
    function lockCollateral(
        uint256 amount,
        uint256 requestedPrincipal,
        uint64 validUntil
    ) external nonReentrant returns (bytes32 collateralId) {
        if (!peerConfigured) revert PeerNotConfigured();
        if (amount == 0 || requestedPrincipal == 0) revert InvalidAmount();

        uint64 currentTime = uint64(block.timestamp);
        if (validUntil <= currentTime || validUntil > currentTime + MAX_LOCK_PROOF_LIFETIME)
            revert InvalidProofExpiry(validUntil, currentTime);

        uint64 lockNonce = ownerLockNonce[msg.sender] + 1;
        ownerLockNonce[msg.sender] = lockNonce;
        collateralId = computeCollateralId(msg.sender, amount, lockNonce);
        if (collaterals[collateralId].state != CollateralState.NONE) {
            revert CollateralIdCollision(collateralId);
        }

        collaterals[collateralId] = Collateral({
            owner: msg.sender,
            asset: address(collateralToken),
            amount: amount,
            requestedPrincipal: requestedPrincipal,
            loanId: 0,
            lockNonce: lockNonce,
            createdAt: currentTime,
            validUntil: validUntil,
            state: CollateralState.LOCKED
        });

        uint256 balanceBefore = collateralToken.balanceOf(address(this));
        collateralToken.safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = collateralToken.balanceOf(address(this)) - balanceBefore;
        if (received != amount) revert UnsupportedFeeOnTransferToken(amount, received);

        bytes memory payload = _lockPayload(collateralId, collaterals[collateralId]);
        uint64 messageNonce = outboundNonce + 1;
        outboundNonce = messageNonce;

        emit CollateralLocked(
            collateralId,
            msg.sender,
            address(collateralToken),
            amount,
            requestedPrincipal,
            lockNonce,
            validUntil
        );
        emit OutboundMessagePrepared(
            CrossChainTypes.Action.LOCK,
            remoteChainId,
            remoteLendingPool,
            messageNonce,
            payload,
            currentTime,
            validUntil
        );
    }

    /// @inheritdoc ICrossChainReceiver
    function receiveMessage(
        bytes32 messageId,
        uint64 sourceChainId,
        address sourceSender,
        uint64 sourceNonce,
        bytes calldata payload
    ) external override nonReentrant {
        if (msg.sender != address(messenger)) revert UnauthorizedMessenger(msg.sender);
        if (sourceChainId != remoteChainId || sourceSender != remoteLendingPool) {
            revert UnauthorizedSource(sourceChainId, sourceSender);
        }
        if (processedMessage[messageId]) revert MessageAlreadyProcessed(messageId);

        uint64 expectedNonce = latestRemoteNonce + 1;
        if (sourceNonce != expectedNonce) revert InvalidNonce(sourceNonce, expectedNonce);

        CrossChainTypes.OutcomeMessage memory outcome = abi.decode(
            payload,
            (CrossChainTypes.OutcomeMessage)
        );
        Collateral storage collateral = collaterals[outcome.collateralId];
        if (collateral.state == CollateralState.NONE) {
            revert UnknownCollateral(outcome.collateralId);
        }
        if (
            outcome.borrower != collateral.owner ||
            outcome.collateralAsset != collateral.asset ||
            outcome.collateralAmount != collateral.amount ||
            outcome.lockNonce != collateral.lockNonce
        ) revert OutcomeMismatch(outcome.collateralId);
        if (outcome.loanId == 0) revert InvalidLoanId();

        processedMessage[messageId] = true;
        latestRemoteNonce = sourceNonce;

        if (outcome.action == CrossChainTypes.Action.PLEDGE_CONFIRMED) {
            _requireState(outcome.collateralId, collateral.state, CollateralState.LOCKED);
            collateral.loanId = outcome.loanId;
            collateral.state = CollateralState.PLEDGED;
            emit CollateralPledged(outcome.collateralId, outcome.loanId);
        } else if (outcome.action == CrossChainTypes.Action.RELEASE) {
            _requireState(outcome.collateralId, collateral.state, CollateralState.PLEDGED);
            if (collateral.loanId != outcome.loanId) revert OutcomeMismatch(outcome.collateralId);
            collateral.state = CollateralState.RELEASED;
            emit CollateralReleased(
                outcome.collateralId,
                outcome.loanId,
                collateral.owner,
                collateral.amount
            );
            collateralToken.safeTransfer(collateral.owner, collateral.amount);
        } else if (outcome.action == CrossChainTypes.Action.LIQUIDATE) {
            _requireState(outcome.collateralId, collateral.state, CollateralState.PLEDGED);
            if (collateral.loanId != outcome.loanId) revert OutcomeMismatch(outcome.collateralId);
            collateral.state = CollateralState.LIQUIDATED;
            emit CollateralLiquidated(
                outcome.collateralId,
                outcome.loanId,
                recoveryRecipient,
                collateral.amount
            );
            collateralToken.safeTransfer(recoveryRecipient, collateral.amount);
        } else {
            revert InvalidAction(outcome.action);
        }
    }

    /// @notice Reconstruct the exact ABI payload emitted for a collateral lock.
    function getLockPayload(bytes32 collateralId) external view returns (bytes memory payload) {
        Collateral storage collateral = collaterals[collateralId];
        if (collateral.state == CollateralState.NONE) revert UnknownCollateral(collateralId);
        return _lockPayload(collateralId, collateral);
    }

    /// @notice Compute the unique ID for an owner, amount, and monotonic lock nonce.
    function computeCollateralId(
        address owner,
        uint256 amount,
        uint64 lockNonce
    ) public view returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    localChainId,
                    address(this),
                    address(collateralToken),
                    owner,
                    amount,
                    lockNonce
                )
            );
    }

    function _lockPayload(
        bytes32 collateralId,
        Collateral storage collateral
    ) private view returns (bytes memory) {
        return
            abi.encode(
                CrossChainTypes.LockMessage({
                    action: CrossChainTypes.Action.LOCK,
                    collateralId: collateralId,
                    borrower: collateral.owner,
                    collateralAsset: collateral.asset,
                    collateralAmount: collateral.amount,
                    requestedPrincipal: collateral.requestedPrincipal,
                    lockNonce: collateral.lockNonce,
                    createdAt: collateral.createdAt,
                    validUntil: collateral.validUntil
                })
            );
    }

    function _requireState(
        bytes32 collateralId,
        CollateralState current,
        CollateralState expected
    ) private pure {
        if (current != expected) revert InvalidCollateralState(collateralId, current, expected);
    }
}
