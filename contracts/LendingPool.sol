// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ICrossChainReceiver} from "./interfaces/ICrossChainReceiver.sol";
import {ICrossChainMessenger} from "./interfaces/ICrossChainMessenger.sol";
import {CrossChainTypes} from "./libraries/CrossChainTypes.sol";

/// @title LendingPool
/// @notice Issues Chain-B liquidity against authenticated collateral locks on other chains.
contract LendingPool is ICrossChainReceiver, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant BPS = 10_000;
    uint256 public constant YEAR = 365 days;
    uint64 public constant OUTCOME_MESSAGE_LIFETIME = 1 days;
    uint64 public constant MAX_FUTURE_SKEW = 5 minutes;

    enum LoanState {
        NONE,
        ACTIVE,
        REPAID,
        DEFAULTED,
        LIQUIDATED
    }

    struct Loan {
        bytes32 collateralId;
        address borrower;
        address collateralAsset;
        uint256 collateralAmount;
        uint256 principal;
        uint64 startTime;
        uint64 deadline;
        uint64 sourceChainId;
        address sourceVault;
        uint64 lockNonce;
        LoanState state;
    }

    IERC20 public immutable loanToken;
    ICrossChainMessenger public immutable messenger;
    uint64 public immutable localChainId;
    uint64 public immutable loanDuration;
    uint16 public immutable maxLtvBps;
    uint16 public immutable annualInterestBps;

    uint256 public loanCount;

    mapping(uint64 sourceChainId => mapping(address vault => bool trusted)) public trustedVaults;
    mapping(uint64 sourceChainId => mapping(address vault => uint64 nonce))
        public latestRemoteNonce;
    mapping(uint64 destinationChainId => mapping(address vault => uint64 nonce))
        public outboundNonce;
    mapping(bytes32 messageId => bool processed) public processedMessage;
    mapping(bytes32 collateralId => bool used) public collateralUsed;
    mapping(bytes32 collateralId => uint256 loanId) public loanByCollateral;
    mapping(uint256 loanId => Loan loan) public loans;

    error ZeroAddress();
    error InvalidConfiguration();
    error UnauthorizedMessenger(address caller);
    error UnauthorizedSource(uint64 sourceChainId, address sourceSender);
    error MessageAlreadyProcessed(bytes32 messageId);
    error InvalidNonce(uint64 supplied, uint64 expected);
    error InvalidAction(CrossChainTypes.Action action);
    error InvalidLockMessage();
    error LockMessageExpired(uint64 validUntil, uint64 currentTime);
    error LockMessageNotYetValid(uint64 createdAt, uint64 currentTime);
    error CollateralIdMismatch(bytes32 supplied, bytes32 expected);
    error CollateralAlreadyUsed(bytes32 collateralId, uint256 existingLoanId);
    error LtvExceeded(uint256 requestedPrincipal, uint256 maximumPrincipal);
    error InvalidLoanState(uint256 loanId, LoanState current, LoanState expected);
    error LoanNotOverdue(uint256 loanId, uint64 deadline, uint64 currentTime);

    event TrustedVaultSet(uint64 indexed sourceChainId, address indexed vault, bool trusted);
    event LoanIssued(
        uint256 indexed loanId,
        bytes32 indexed collateralId,
        address indexed borrower,
        uint256 principal,
        uint64 deadline,
        uint64 sourceChainId,
        address sourceVault
    );
    event LoanRepaid(
        uint256 indexed loanId,
        bytes32 indexed collateralId,
        address indexed payer,
        uint256 amountPaid
    );
    event LoanDefaulted(uint256 indexed loanId, bytes32 indexed collateralId);
    event LoanLiquidated(uint256 indexed loanId, bytes32 indexed collateralId);
    event OutboundMessagePrepared(
        CrossChainTypes.Action indexed action,
        uint64 indexed destinationChainId,
        address indexed destinationReceiver,
        uint64 nonce,
        bytes payload,
        uint64 createdAt,
        uint64 validUntil
    );

    /// @param loanToken_ Chain-B liquidity token held by this pool.
    /// @param messenger_ Authenticated messenger adapter on this chain.
    /// @param localChainId_ Logical domain identifier for this chain.
    /// @param loanDuration_ Fixed duration after which an active loan may default.
    /// @param maxLtvBps_ Maximum principal as basis points of collateral amount.
    /// @param annualInterestBps_ Linear annual interest in basis points.
    /// @param initialOwner Account allowed to configure trusted source vaults.
    constructor(
        address loanToken_,
        address messenger_,
        uint64 localChainId_,
        uint64 loanDuration_,
        uint16 maxLtvBps_,
        uint16 annualInterestBps_,
        address initialOwner
    ) Ownable(initialOwner) {
        if (
            loanToken_ == address(0) ||
            messenger_ == address(0) ||
            localChainId_ == 0 ||
            initialOwner == address(0)
        ) revert ZeroAddress();
        if (
            loanDuration_ == 0 ||
            loanDuration_ > 365 days ||
            maxLtvBps_ == 0 ||
            maxLtvBps_ > BPS ||
            annualInterestBps_ > BPS
        ) revert InvalidConfiguration();
        if (ICrossChainMessenger(messenger_).localChainId() != localChainId_) {
            revert UnauthorizedMessenger(messenger_);
        }

        loanToken = IERC20(loanToken_);
        messenger = ICrossChainMessenger(messenger_);
        localChainId = localChainId_;
        loanDuration = loanDuration_;
        maxLtvBps = maxLtvBps_;
        annualInterestBps = annualInterestBps_;
    }

    /// @notice Allow or revoke a Chain-A vault as an authenticated collateral source.
    function setTrustedVault(uint64 sourceChainId, address vault, bool trusted) external onlyOwner {
        if (sourceChainId == 0 || vault == address(0)) revert ZeroAddress();
        trustedVaults[sourceChainId][vault] = trusted;
        emit TrustedVaultSet(sourceChainId, vault, trusted);
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
        if (!trustedVaults[sourceChainId][sourceSender]) {
            revert UnauthorizedSource(sourceChainId, sourceSender);
        }
        if (processedMessage[messageId]) revert MessageAlreadyProcessed(messageId);

        uint64 expectedNonce = latestRemoteNonce[sourceChainId][sourceSender] + 1;
        if (sourceNonce != expectedNonce) revert InvalidNonce(sourceNonce, expectedNonce);

        CrossChainTypes.LockMessage memory lockMessage = abi.decode(
            payload,
            (CrossChainTypes.LockMessage)
        );
        _validateLockMessage(sourceChainId, sourceSender, lockMessage);

        if (collateralUsed[lockMessage.collateralId]) {
            revert CollateralAlreadyUsed(
                lockMessage.collateralId,
                loanByCollateral[lockMessage.collateralId]
            );
        }

        uint256 maximumPrincipal = Math.mulDiv(lockMessage.collateralAmount, maxLtvBps, BPS);
        if (lockMessage.requestedPrincipal > maximumPrincipal) {
            revert LtvExceeded(lockMessage.requestedPrincipal, maximumPrincipal);
        }

        uint256 loanId = loanCount + 1;
        loanCount = loanId;
        uint64 startTime = uint64(block.timestamp);
        uint64 deadline = startTime + loanDuration;

        processedMessage[messageId] = true;
        latestRemoteNonce[sourceChainId][sourceSender] = sourceNonce;
        collateralUsed[lockMessage.collateralId] = true;
        loanByCollateral[lockMessage.collateralId] = loanId;
        loans[loanId] = Loan({
            collateralId: lockMessage.collateralId,
            borrower: lockMessage.borrower,
            collateralAsset: lockMessage.collateralAsset,
            collateralAmount: lockMessage.collateralAmount,
            principal: lockMessage.requestedPrincipal,
            startTime: startTime,
            deadline: deadline,
            sourceChainId: sourceChainId,
            sourceVault: sourceSender,
            lockNonce: lockMessage.lockNonce,
            state: LoanState.ACTIVE
        });

        emit LoanIssued(
            loanId,
            lockMessage.collateralId,
            lockMessage.borrower,
            lockMessage.requestedPrincipal,
            deadline,
            sourceChainId,
            sourceSender
        );

        loanToken.safeTransfer(lockMessage.borrower, lockMessage.requestedPrincipal);
        _prepareOutcome(loans[loanId], loanId, CrossChainTypes.Action.PLEDGE_CONFIRMED);
    }

    /// @notice Repay an active loan; any payer may repay on behalf of the borrower.
    function repay(uint256 loanId) external nonReentrant {
        Loan storage loan = loans[loanId];
        _requireLoanState(loanId, loan.state, LoanState.ACTIVE);
        uint256 due = amountDue(loanId);

        loan.state = LoanState.REPAID;
        loanToken.safeTransferFrom(msg.sender, address(this), due);

        emit LoanRepaid(loanId, loan.collateralId, msg.sender, due);
        _prepareOutcome(loan, loanId, CrossChainTypes.Action.RELEASE);
    }

    /// @notice Mark an active fixed-term loan defaulted after its deadline.
    function markDefaulted(uint256 loanId) external {
        Loan storage loan = loans[loanId];
        _requireLoanState(loanId, loan.state, LoanState.ACTIVE);
        uint64 currentTime = uint64(block.timestamp);
        if (currentTime <= loan.deadline) {
            revert LoanNotOverdue(loanId, loan.deadline, currentTime);
        }
        loan.state = LoanState.DEFAULTED;
        emit LoanDefaulted(loanId, loan.collateralId);
    }

    /// @notice Finalize a default and prepare authenticated Chain-A collateral recovery.
    function liquidate(uint256 loanId) external {
        Loan storage loan = loans[loanId];
        _requireLoanState(loanId, loan.state, LoanState.DEFAULTED);
        loan.state = LoanState.LIQUIDATED;
        emit LoanLiquidated(loanId, loan.collateralId);
        _prepareOutcome(loan, loanId, CrossChainTypes.Action.LIQUIDATE);
    }

    /// @notice Return current principal plus linear accrued interest for an active loan.
    function amountDue(uint256 loanId) public view returns (uint256) {
        Loan storage loan = loans[loanId];
        if (loan.state == LoanState.NONE) {
            revert InvalidLoanState(loanId, LoanState.NONE, LoanState.ACTIVE);
        }
        uint256 elapsed = block.timestamp - loan.startTime;
        uint256 interest = Math.mulDiv(
            loan.principal,
            uint256(annualInterestBps) * elapsed,
            BPS * YEAR
        );
        return loan.principal + interest;
    }

    function _validateLockMessage(
        uint64 sourceChainId,
        address sourceSender,
        CrossChainTypes.LockMessage memory lockMessage
    ) private view {
        if (lockMessage.action != CrossChainTypes.Action.LOCK) {
            revert InvalidAction(lockMessage.action);
        }
        if (
            lockMessage.collateralId == bytes32(0) ||
            lockMessage.borrower == address(0) ||
            lockMessage.collateralAsset == address(0) ||
            lockMessage.collateralAmount == 0 ||
            lockMessage.requestedPrincipal == 0 ||
            lockMessage.lockNonce == 0 ||
            lockMessage.validUntil <= lockMessage.createdAt
        ) revert InvalidLockMessage();

        uint64 currentTime = uint64(block.timestamp);
        if (lockMessage.createdAt > currentTime + MAX_FUTURE_SKEW) {
            revert LockMessageNotYetValid(lockMessage.createdAt, currentTime);
        }
        if (currentTime > lockMessage.validUntil) {
            revert LockMessageExpired(lockMessage.validUntil, currentTime);
        }

        bytes32 expectedId = keccak256(
            abi.encode(
                sourceChainId,
                sourceSender,
                lockMessage.collateralAsset,
                lockMessage.borrower,
                lockMessage.collateralAmount,
                lockMessage.lockNonce
            )
        );
        if (lockMessage.collateralId != expectedId) {
            revert CollateralIdMismatch(lockMessage.collateralId, expectedId);
        }
    }

    function _prepareOutcome(
        Loan storage loan,
        uint256 loanId,
        CrossChainTypes.Action action
    ) private {
        bytes memory payload = abi.encode(
            CrossChainTypes.OutcomeMessage({
                action: action,
                collateralId: loan.collateralId,
                loanId: loanId,
                borrower: loan.borrower,
                collateralAsset: loan.collateralAsset,
                collateralAmount: loan.collateralAmount,
                lockNonce: loan.lockNonce
            })
        );

        uint64 messageNonce = outboundNonce[loan.sourceChainId][loan.sourceVault] + 1;
        outboundNonce[loan.sourceChainId][loan.sourceVault] = messageNonce;
        uint64 createdAt = uint64(block.timestamp);
        uint64 validUntil = createdAt + OUTCOME_MESSAGE_LIFETIME;
        emit OutboundMessagePrepared(
            action,
            loan.sourceChainId,
            loan.sourceVault,
            messageNonce,
            payload,
            createdAt,
            validUntil
        );
    }

    function _requireLoanState(uint256 loanId, LoanState current, LoanState expected) private pure {
        if (current != expected) revert InvalidLoanState(loanId, current, expected);
    }
}
