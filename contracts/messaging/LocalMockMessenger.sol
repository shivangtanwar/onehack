// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ICrossChainMessenger} from "../interfaces/ICrossChainMessenger.sol";
import {ICrossChainReceiver} from "../interfaces/ICrossChainReceiver.sol";
import {CrossChainTypes} from "../libraries/CrossChainTypes.sol";

/// @title LocalMockMessenger
/// @notice Deterministic adapter for local tests. It provides no cryptographic source proof.
contract LocalMockMessenger is ICrossChainMessenger, Ownable, ReentrancyGuard {
    uint64 public immutable override localChainId;
    address public authorizedRelayer;

    mapping(bytes32 messageId => bool processed) public processedMessage;
    mapping(uint64 sourceChainId => mapping(address sourceSender => uint64 nonce))
        public latestNonce;

    error ZeroAddress();
    error UnauthorizedRelayer(address caller);
    error InvalidDestination();
    error InvalidPayloadHash();
    error MessageExpired();
    error MessageAlreadyProcessed(bytes32 messageId);
    error InvalidNonce(uint64 supplied, uint64 expected);

    event AuthorizedRelayerUpdated(address indexed relayer);
    event MessageDelivered(bytes32 indexed messageId, address indexed destinationReceiver);

    constructor(
        uint64 localChainId_,
        address authorizedRelayer_,
        address initialOwner
    ) Ownable(initialOwner) {
        if (localChainId_ == 0 || authorizedRelayer_ == address(0) || initialOwner == address(0)) {
            revert ZeroAddress();
        }
        localChainId = localChainId_;
        authorizedRelayer = authorizedRelayer_;
    }

    /// @notice Update the local-only deliverer.
    function setAuthorizedRelayer(address newRelayer) external onlyOwner {
        if (newRelayer == address(0)) revert ZeroAddress();
        authorizedRelayer = newRelayer;
        emit AuthorizedRelayerUpdated(newRelayer);
    }

    /// @inheritdoc ICrossChainMessenger
    function deliver(
        CrossChainTypes.Envelope calldata envelope,
        bytes calldata payload,
        bytes calldata
    ) external override nonReentrant returns (bytes32 messageId) {
        if (msg.sender != authorizedRelayer) revert UnauthorizedRelayer(msg.sender);
        if (
            envelope.destinationChainId != localChainId ||
            envelope.destinationReceiver == address(0) ||
            envelope.destinationReceiver.code.length == 0
        ) revert InvalidDestination();
        if (envelope.payloadHash != keccak256(payload)) revert InvalidPayloadHash();
        if (envelope.validUntil <= envelope.createdAt || block.timestamp > envelope.validUntil)
            revert MessageExpired();

        messageId = _getMessageId(envelope);
        if (processedMessage[messageId]) revert MessageAlreadyProcessed(messageId);
        uint64 expectedNonce = latestNonce[envelope.sourceChainId][envelope.sourceSender] + 1;
        if (envelope.nonce != expectedNonce) revert InvalidNonce(envelope.nonce, expectedNonce);

        processedMessage[messageId] = true;
        latestNonce[envelope.sourceChainId][envelope.sourceSender] = envelope.nonce;
        ICrossChainReceiver(envelope.destinationReceiver).receiveMessage(
            messageId,
            envelope.sourceChainId,
            envelope.sourceSender,
            envelope.nonce,
            payload
        );

        emit MessageDelivered(messageId, envelope.destinationReceiver);
    }

    /// @inheritdoc ICrossChainMessenger
    function getMessageId(
        CrossChainTypes.Envelope calldata envelope
    ) external view override returns (bytes32 messageId) {
        return _getMessageId(envelope);
    }

    function _getMessageId(
        CrossChainTypes.Envelope calldata envelope
    ) private view returns (bytes32) {
        return keccak256(abi.encode(block.chainid, address(this), envelope));
    }
}
