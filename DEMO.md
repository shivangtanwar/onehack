# Five-Minute Judge Demo

The deterministic local path remains the live fallback. A complete public Ethereum Sepolia/Base Sepolia run is already confirmed and linked in `DEPLOYMENTS.md`, so judges can inspect real explorer evidence without waiting for testnet finality on stage.

## Preparation

Install and verify once:

```bash
npm install
npm --prefix frontend install
npm run compile
npm test
npm run frontend:build
```

Expected verified core result: `21 passing`. Do not proceed to a live demo if the suite is red.

Start fresh nodes in Terminal A and Terminal B:

```bash
# Terminal A
npm run node:a
```

```bash
# Terminal B
npm run node:b
```

Deploy and configure in Terminal C:

```bash
npm run deploy:a
npm run deploy:b
npm run configure:a
npm run configure:b
```

Optional dashboard in Terminal D:

```bash
cp frontend/.env.example frontend/.env
npm run frontend:dev
```

Use a browser wallet loaded with a publicly known local Hardhat test account only. Never import a real wallet key.

## Live sequence

Run:

```bash
npm run demo:local
```

For public mode, the app defaults to the deployed contracts and completed public collateral ID. The secret-free record is `deployments/public-demo.json`, and the three attack proofs are in `frontend/public/public-security-evidence.json`. Only run another public lifecycle intentionally:

```bash
PUBLIC_DEMO_ALLOW_REPEAT=true npm run demo:public
```

### 1. Show collateral on Chain A

Point to the initial borrower dCOL balance and zero vault balance. Say:

> “This ERC-20 exists as our collateral only on Chain A. Chain B has a different loan token; we never deploy a wrapper or mint a collateral representation.”

### 2. Lock it

The script approves and calls `lockCollateral(100 dCOL, 50 dUSD, expiry)`. Show the Chain-A transaction hash, globally unique collateral ID, and vault balance of 100 dCOL.

### 3. Show authenticated message

Show the printed payload hash, attestor address, and Chain-B delivery transaction. Explain that the signature also binds source/destination chain, vault/pool, ordered nonce, timestamps, and the destination messenger through EIP-712.

### 4. Show the successful loan

Show loan ID 1, borrower balance +50 dUSD, and `ACTIVE`. Then show the pledge acknowledgement and Chain-A `PLEDGED` state.

### 5. Prove collateral never moved

The vault still reports exactly 100 dCOL after issuance. There is no collateral bridge/wrapper/mint operation anywhere in the transaction sequence.

### 6. Attempt exact reuse

The script resubmits the same envelope. Highlight:

```text
REJECTED — Exact proof replay
on-chain error: MessageAlreadyProcessed
```

### 7. Attempt a real double pledge

The script creates a second envelope with the next valid source nonce, signs it correctly, and uses the same lock payload. This bypasses exact-message replay and reaches the pool. Highlight:

```text
REJECTED — Second signed pledge for same collateral
on-chain error: CollateralAlreadyUsed
```

Say:

> “This is the central invariant. The rejection comes from persistent Chain-B contract state, not from our relayer, UI, or database.”

### 8. Attempt stale proof

Highlight `MessageExpired`. The automated suite separately proves an honest-looking fresh outer envelope cannot revive an expired embedded lock (`LockMessageExpired`).

### 9. Simulate default

The script advances only local Chain-B time beyond the five-minute term, then sends `markDefaulted`. Show `DEFAULTED`. No time manipulation is used on public networks.

### 10. Liquidate on Chain B

Show the liquidation transaction and `LIQUIDATED` loan state. The caller cannot choose the recovery address.

### 11. Deliver recovery to Chain A

Show the authenticated recovery delivery, +100 dCOL treasury delta, zero vault balance, and Chain-A `LIQUIDATED` state.

### 12. Explain assumptions in under one minute

Use this script:

> “We use a domain-separated EIP-712 attestor behind a messenger adapter. It is federated, not trustless: signer compromise can forge remote events, so production should use CCIP or a quorum. Within that model, every proof is bound to both chains, both contracts, payload, nonce, and expiry. The messenger and application each prevent replay. The pool permanently consumes the collateral ID, so even a second correctly signed envelope cannot borrow again. Ordered outcomes make repayment and liquidation mutually exclusive, and only an authenticated terminal result can move the original Chain-A collateral.”

## Dashboard attack panel

`npm run demo:local` writes ignored `frontend/public/local-demo-evidence.json`. Public mode ships confirmed per-attack proof evidence. In the app:

1. open **Security evidence**;
2. show the three mined status-0 cards and their decoded errors;
3. open any **View failed transaction** explorer link; and
4. optionally connect a funded testnet wallet and choose **Re-submit on testnet** while the proof is still valid.

The activity panel translates custom errors but does not pre-approve or block calls.

## Optional repayment proof

The primary live script demonstrates default/recovery. For repayment evidence, run:

```bash
npm test -- --grep "repays on B"
```

This executes lock -> signed issue -> signed pledge -> approve/repay -> signed release and checks that the original owner receives the exact collateral.

## Reset and fallback

- Restart both nodes to reset all local state, then rerun deploy/configure.
- If the UI wallet fails, use the CLI; it prints the same balances, states, signatures, hashes, and reverts.
- If public RPC/faucet/finality is slow, show the local flow and the public deployment configuration. Do not pretend a pending or absent public message was confirmed.
- If a nonce-gap error appears, restart for the demo or deliver the missing prior message. Never skip the contract nonce.
- If local evidence is absent, rerun `npm run demo:local`; public evidence is generated from the confirmed Base issuance transaction with `npm run evidence:public`.

## Acceptance closeout

At the end, open `PLAN.md` §20 and point to the contract, automated test, UI/CLI, and documentation evidence for all ten mandatory requirements.
