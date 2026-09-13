// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title CrossChainTypes
/// @notice Shared wire types used by messenger adapters and protocol receivers.
library CrossChainTypes {
    /// @notice Protocol message action. Zero is intentionally invalid.
    enum Action {
        INVALID,
        LOCK,
        PLEDGE_CONFIRMED,
        RELEASE,
        LIQUIDATE
    }

    /// @notice EIP-712-signed routing envelope.
    struct Envelope {
        uint64 sourceChainId;
        uint64 destinationChainId;
        address sourceSender;
        address destinationReceiver;
        uint64 nonce;
        bytes32 payloadHash;
        uint64 createdAt;
        uint64 validUntil;
    }

    /// @notice Chain-A collateral lock data committed into the signed payload hash.
    struct LockMessage {
        Action action;
        bytes32 collateralId;
        address borrower;
        address collateralAsset;
        uint256 collateralAmount;
        uint256 requestedPrincipal;
        uint64 lockNonce;
        uint64 createdAt;
        uint64 validUntil;
    }

    /// @notice Chain-B loan outcome sent back to Chain A.
    struct OutcomeMessage {
        Action action;
        bytes32 collateralId;
        uint256 loanId;
        address borrower;
        address collateralAsset;
        uint256 collateralAmount;
        uint64 lockNonce;
    }
}
