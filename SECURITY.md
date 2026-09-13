# Security Model

## Scope and status

This is unaudited hackathon/testnet software. The security objective is an explicit, testable cross-chain state machine—not production custody. Mock faucets are unrestricted. Do not use assets with real value.

## Trust assumptions

1. **Attestor honesty/key security:** one configured EOA or ERC-1271 signer attests finalized source events. This is a trusted federation point, not a trustless light client.
2. **Finality policy:** the signer waits enough confirmations before signing. Contracts cannot determine whether a remote event survived reorgs.
3. **Chain consensus:** both chains execute deployed bytecode correctly.
4. **Deployment configuration:** owner sets the correct messenger, logical domains, peer vault/pool, treasury, LTV, term, and signer.
5. **Token semantics:** supported assets use standard ERC-20 balance/transfer semantics and consistent decimals/valuation assumptions.

### What a compromised signer can do

- Forge a nonexistent lock and cause the pool to issue unbacked dUSD.
- Forge a repayment or liquidation outcome with fields matching a real lock and thereby release or seize collateral.
- Censor or delay all messages.

### What a compromised signer still cannot do through valid contract execution

- Issue twice from the same `collateralId`.
- Process an already consumed `messageId` again.
- skip or roll back the stored exact source nonce;
- redirect an existing signature to another chain, messenger, or receiver;
- modify signed payload bytes;
- release/liquidate a collateral record twice; or
- choose a liquidation recipient different from the vault's configured treasury.

These limits do not make signer compromise acceptable; they bound classes of replay/state corruption. Production must replace one signer with CCIP or M-of-N/HSM-backed attestation.

## Invariants

|   # | Invariant                                    | Enforcement                                                                  |
| --: | -------------------------------------------- | ---------------------------------------------------------------------------- |
|   1 | Every lock ID is unique                      | source domain/vault/token/owner/amount/monotonic nonce hash; collision check |
|   2 | At most one loan per collateral ID           | permanent `LendingPool.collateralUsed` and `loanByCollateral`                |
|   3 | Receivers retain consumed messages           | messenger and application `processedMessage` mappings                        |
|   4 | One proof cannot issue twice                 | EIP-712 message ID plus permanent collateral use                             |
|   5 | Proof binds all security fields              | typed envelope `payloadHash`; encoded lock payload                           |
|   6 | Expired proof fails                          | messenger outer expiry and pool embedded lock expiry                         |
|   7 | Versions are monotonic                       | owner lock nonce and exact per-peer message nonces                           |
|   8 | Router/source are authenticated              | receiver caller, source domain, and peer checks                              |
|   9 | Active collateral cannot be released locally | no withdrawal/cancel function; authenticated outcome only                    |
|  10 | Repay/liquidate are exclusive                | explicit loan enum and expected-state checks                                 |
|  11 | Duplicate terminal delivery is harmless      | replay ID and terminal vault state                                           |
|  12 | External calls are safe                      | `SafeERC20`, `ReentrancyGuard`, CEI, one-time/owner access                   |
|  13 | UI is not a boundary                         | all validation repeated in Solidity                                          |

## Threat analysis

| Threat                             | Control                                                          | Residual risk                                                           |
| ---------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Exact message replay               | EIP-712 message ID consumed in messenger and receiver            | Storage/state growth                                                    |
| Same lock, new message             | Permanent `collateralUsed`                                       | Compromised signer may forge different collateral IDs/nonexistent locks |
| Old lock wrapped in fresh envelope | Embedded lock timestamp checked by pool                          | Honest signer must use emitted bytes                                    |
| Wrong source chain/vault           | Pool route allowlist and vault fixed peer                        | Owner misconfiguration                                                  |
| Wrong destination                  | Signed logical domain/receiver plus EIP-712 chain/messenger      | None under signature security                                           |
| Payload tampering                  | Signed `keccak256(payload)` and application field checks         | ABI decoding denial only; transaction reverts                           |
| Out-of-order delivery              | Exact next per-peer nonce in messenger and receiver              | Missing message blocks later messages                                   |
| Reentrant/malicious ERC-20         | Reentrancy guard, state before transfer, exact received amount   | Exotic tokens beyond fee-on-transfer remain out of scope                |
| Premature liquidation              | Timestamp must be strictly greater than deadline; two-step state | Timestamp manipulation within normal block bounds                       |
| Recovery theft by caller           | Fixed vault treasury, not caller-provided                        | Compromised signer/owner configuration                                  |
| Relayer offline                    | Anyone may submit an already signed proof; events persist        | No signature means no liveness                                          |
| Source reorg                       | Off-chain confirmation threshold                                 | Finality policy failure                                                 |
| Admin key compromise               | Vault peer is one-time; signer/pool routes remain owner-managed  | Signer rotation and source allowlist can be abused                      |

## Checks-effects-interactions review

- Vault lock stores state before `safeTransferFrom`; any failure reverts state. Reentrancy is blocked and the received balance delta must equal the requested amount.
- Pool issuance consumes message, nonce, collateral, and loan state before transferring dUSD. Any transfer failure reverts consumption.
- Repayment sets `REPAID` before pulling tokens; failure reverts the state.
- Release/liquidation sets the terminal collateral state before transferring; failure reverts the state.
- Messenger consumes message/nonce before receiver dispatch; receiver failure reverts messenger state atomically.

## Custom error evidence

Key judge-visible errors:

- `MessageAlreadyProcessed(messageId)` — exact proof/duplicate delivery.
- `CollateralAlreadyUsed(collateralId, loanId)` — second signed pledge for the same lock.
- `MessageExpired(validUntil, currentTime)` — stale outer envelope.
- `LockMessageExpired(validUntil, currentTime)` — stale embedded lock.
- `InvalidNonce(supplied, expected)` — stale/skipped ordering.
- `UnauthorizedSource(chainId, sender)` — wrong source route.
- `InvalidDestinationChain(supplied, expected)` and `InvalidSignature(expectedSigner)` — domain binding.
- `InvalidCollateralState` / `InvalidLoanState` — illegal or duplicate lifecycle transition.

Run `npm run test:security` to execute the attack suite.

## Test coverage inventory

The 21 tests cover:

- issue/pledge custody, repay/release, default/liquidate/recovery, interest, terminal exclusivity;
- exact proof replay and a new valid envelope for an already-used collateral ID;
- expired outer and embedded messages, future timestamps, malformed windows, skipped nonce;
- wrong source chain, source contract, destination chain, destination contract, and messenger;
- altered payload, wrong signer, forged collateral ID;
- zero amounts, expiry boundary, and LTV boundary;
- unauthorized direct receiver access, premature recovery, duplicate terminal delivery; and
- signer rotation access control and the local adapter's authorization/replay checks.

`npm run coverage` passed with 95.65% statements, 90.43% lines, 90.63% functions, and 45.24% branches. The lower branch percentage reflects many defensive custom-error combinations; the judge-critical adversarial paths listed above are explicit tests.

## Operational guidance

- Use separate disposable deployer and attestor testnet accounts.
- Do not pass private keys as command-line values; use ignored `.env` or a secret manager.
- Record source block hash/number and required confirmation count for each signed message.
- Process each `(sourceDomain, sourceSender)` stream in nonce order.
- Stop signing if source RPCs disagree, a reorg crosses the threshold, or deployed code/config hashes change.
- Never rotate a signer mid-flight without coordinating queued signed envelopes.
- Verify deployed source and transfer ownership/configuration to a multisig before any non-demo use.

## Known gaps

- No audit, formal verification, oracle, pause, rate limiting, quorum, partial liquidation, or safe unused-lock cancellation.
- Linear LTV compares raw token units and assumes matched 18-decimal mock prices.
- An outcome expiry can delay collateral terminalization; a new correctly ordered signed envelope is required after expiry.
- Owner powers and signer trust are too broad for production.
