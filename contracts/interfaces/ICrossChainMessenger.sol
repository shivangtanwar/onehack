// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CrossChainTypes} from "../libraries/CrossChainTypes.sol";

/// @title ICrossChainMessenger
/// @notice Adapter boundary that decouples protocol contracts from message verification providers.
interface ICrossChainMessenger {
    /// @notice Verify and deliver an envelope to its destination receiver.
    function deliver(
        CrossChainTypes.Envelope calldata envelope,
        bytes calldata payload,
        bytes calldata proof
    ) external returns (bytes32 messageId);

    /// @notice Return the adapter-specific ID for an envelope.
    function getMessageId(
        CrossChainTypes.Envelope calldata envelope
    ) external view returns (bytes32 messageId);

    /// @notice Logical chain/domain configured for this adapter.
    function localChainId() external view returns (uint64);
}
