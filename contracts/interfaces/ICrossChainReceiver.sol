// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ICrossChainReceiver
/// @notice Application interface called by an authenticated messenger adapter.
interface ICrossChainReceiver {
    /// @notice Receive one authenticated, ordered cross-chain message.
    /// @param messageId Domain-separated identifier consumed by the messenger.
    /// @param sourceChainId Logical source chain/domain identifier.
    /// @param sourceSender Authenticated source application contract.
    /// @param sourceNonce Strictly ordered nonce for the source application.
    /// @param payload Application-specific ABI-encoded payload.
    function receiveMessage(
        bytes32 messageId,
        uint64 sourceChainId,
        address sourceSender,
        uint64 sourceNonce,
        bytes calldata payload
    ) external;
}
