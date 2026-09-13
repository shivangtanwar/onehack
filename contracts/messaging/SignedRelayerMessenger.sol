// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ICrossChainMessenger} from "../interfaces/ICrossChainMessenger.sol";
import {ICrossChainReceiver} from "../interfaces/ICrossChainReceiver.sol";
import {CrossChainTypes} from "../libraries/CrossChainTypes.sol";

/// @title SignedRelayerMessenger
/// @notice Verifies EIP-712 attestations from one explicitly trusted signer and dispatches them.
/// @dev This adapter is federated, not trustless. A compromised signer can forge source events.
contract SignedRelayerMessenger is ICrossChainMessenger, EIP712, Ownable, ReentrancyGuard {
    bytes32 public constant ENVELOPE_TYPEHASH =
        keccak256(
            "Envelope(uint64 sourceChainId,uint64 destinationChainId,address sourceSender,address destinationReceiver,uint64 nonce,bytes32 payloadHash,uint64 createdAt,uint64 validUntil)"
        );

    uint64 public constant MAX_FUTURE_SKEW = 5 minutes;

    uint64 public immutable override localChainId;
    address public trustedSigner;

    mapping(bytes32 messageId => bool processed) public processedMessage;
    mapping(uint64 sourceChainId => mapping(address sourceSender => uint64 nonce))
        public latestNonce;

    error ZeroAddress();
    error InvalidDestinationChain(uint64 supplied, uint64 expected);
    error InvalidDestinationReceiver(address receiver);
    error InvalidPayloadHash(bytes32 supplied, bytes32 actual);
    error InvalidValidityWindow(uint64 createdAt, uint64 validUntil);
    error MessageNotYetValid(uint64 createdAt, uint64 currentTime);
    error MessageExpired(uint64 validUntil, uint64 currentTime);
    error MessageAlreadyProcessed(bytes32 messageId);
    error InvalidNonce(uint64 supplied, uint64 expected);
    error InvalidSignature(address expectedSigner);

    event TrustedSignerUpdated(address indexed previousSigner, address indexed newSigner);
    event MessageDelivered(
        bytes32 indexed messageId,
        uint64 indexed sourceChainId,
        address indexed sourceSender,
        address destinationReceiver,
        uint64 nonce
    );

    /// @param localChainId_ Logical chain/domain accepted as the envelope destination.
    /// @param trustedSigner_ EOA or ERC-1271 contract authorized to attest source events.
    /// @param initialOwner Account allowed to rotate the attestor key.
    constructor(
        uint64 localChainId_,
        address trustedSigner_,
        address initialOwner
    ) EIP712("DatabaesCrossChainMessenger", "1") Ownable(initialOwner) {
        if (localChainId_ == 0 || trustedSigner_ == address(0) || initialOwner == address(0)) {
            revert ZeroAddress();
        }
        localChainId = localChainId_;
        trustedSigner = trustedSigner_;
    }

    /// @notice Rotate the explicitly trusted attestor.
    function setTrustedSigner(address newSigner) external onlyOwner {
        if (newSigner == address(0)) revert ZeroAddress();
        address previousSigner = trustedSigner;
        trustedSigner = newSigner;
        emit TrustedSignerUpdated(previousSigner, newSigner);
    }

    /// @inheritdoc ICrossChainMessenger
    function deliver(
        CrossChainTypes.Envelope calldata envelope,
        bytes calldata payload,
        bytes calldata proof
    ) external override nonReentrant returns (bytes32 messageId) {
        if (envelope.destinationChainId != localChainId) {
            revert InvalidDestinationChain(envelope.destinationChainId, localChainId);
        }
        if (
            envelope.sourceChainId == 0 ||
            envelope.sourceSender == address(0) ||
            envelope.destinationReceiver == address(0) ||
            envelope.destinationReceiver.code.length == 0
        ) {
            revert InvalidDestinationReceiver(envelope.destinationReceiver);
        }

        bytes32 actualPayloadHash = keccak256(payload);
        if (envelope.payloadHash != actualPayloadHash) {
            revert InvalidPayloadHash(envelope.payloadHash, actualPayloadHash);
        }
        if (envelope.validUntil <= envelope.createdAt) {
            revert InvalidValidityWindow(envelope.createdAt, envelope.validUntil);
        }

        uint64 currentTime = uint64(block.timestamp);
        if (envelope.createdAt > currentTime + MAX_FUTURE_SKEW) {
            revert MessageNotYetValid(envelope.createdAt, currentTime);
        }
        if (currentTime > envelope.validUntil) {
            revert MessageExpired(envelope.validUntil, currentTime);
        }

        messageId = _hashTypedDataV4(_hashEnvelope(envelope));
        if (processedMessage[messageId]) revert MessageAlreadyProcessed(messageId);

        uint64 expectedNonce = latestNonce[envelope.sourceChainId][envelope.sourceSender] + 1;
        if (envelope.nonce != expectedNonce) {
            revert InvalidNonce(envelope.nonce, expectedNonce);
        }
        if (!SignatureChecker.isValidSignatureNow(trustedSigner, messageId, proof)) {
            revert InvalidSignature(trustedSigner);
        }

        processedMessage[messageId] = true;
        latestNonce[envelope.sourceChainId][envelope.sourceSender] = envelope.nonce;

        ICrossChainReceiver(envelope.destinationReceiver).receiveMessage(
            messageId,
            envelope.sourceChainId,
            envelope.sourceSender,
            envelope.nonce,
            payload
        );

        emit MessageDelivered(
            messageId,
            envelope.sourceChainId,
            envelope.sourceSender,
            envelope.destinationReceiver,
            envelope.nonce
        );
    }

    /// @inheritdoc ICrossChainMessenger
    function getMessageId(
        CrossChainTypes.Envelope calldata envelope
    ) external view override returns (bytes32 messageId) {
        return _hashTypedDataV4(_hashEnvelope(envelope));
    }

    function _hashEnvelope(
        CrossChainTypes.Envelope calldata envelope
    ) private pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    ENVELOPE_TYPEHASH,
                    envelope.sourceChainId,
                    envelope.destinationChainId,
                    envelope.sourceSender,
                    envelope.destinationReceiver,
                    envelope.nonce,
                    envelope.payloadHash,
                    envelope.createdAt,
                    envelope.validUntil
                )
            );
    }
}
