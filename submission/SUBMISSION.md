# Databaes - ONE HACK submission

## Form values

**Your name:** Shivang Tanwar  
**Team name:** Databaes  
**Problem statement:** W3A-3 - Cross-chain collateralized lending

### Description

Databaes lets a borrower receive credit on Base Sepolia while their original collateral remains locked on Ethereum Sepolia. We built Solidity vault and lending-pool contracts, an EIP-712 authenticated messaging adapter, a persistent relay worker, and a responsive React dashboard for borrowing, tracking loans, repayment, default, liquidation, and security evidence. Collateral is never bridged, wrapped, or represented by a newly minted collateral token on the destination chain.

The protocol binds each proof to its source, destination, payload, expiry, and ordered nonce. Independent on-chain replay checks and a permanent collateral-use registry prevent the same lock from issuing twice. Public explorer-linked evidence shows a completed default/recovery lifecycle and mined rejections of replay, double pledge, and expired proofs. Repayment and collateral release are also covered by automated contract tests.

The live HTTPS app includes separate one-click setup buttons for Ethereum Sepolia and Base Sepolia, wallet-scoped loan discovery, progress views, activity filtering, and CSV export. Verification includes 21 passing contract tests and 20 passing browser/wallet tests. Source code, deployment records, security assumptions, and reproduction instructions are public.

This is a testnet-only hackathon prototype using valueless dCOL/dUSD mock tokens. Its single attestor is explicitly trusted; we do not claim trustless messaging, a security audit, or readiness for real-value lending.

### GitHub proof

https://github.com/shivangtanwar/onehack

### URL proof

https://onehack.shivang.me

### Drive proof

https://drive.google.com/drive/folders/1RIBstMCPo8jTPbV2IeFnaeCszbxS02kn

### Note to host

Team Databaes | W3A-3 | Branch: main. Start with the live public workspace (no wallet required), then open Safety & contracts to inspect deployment addresses and recorded attack evidence. The proof PDF provides clickable explorer links. For a hands-on loan, use only faucet-funded Ethereum Sepolia and Base Sepolia; add both networks on New loan, connect a wallet, mint test dCOL, approve, and lock. Source messages wait for 12 confirmations, so allow several minutes for issuance and collateral return. The demo loan term is 180 seconds from issuance. README, DEMO.md, SECURITY.md, and ops/README.md document the workflow, trust assumptions, and operation. No mainnet assets or real funds are used.

## 90-second walkthrough

1. Open the live overview and explain the central promise: collateral stays on its native network.
2. Open the completed public loan and point out the collateral, principal, state transitions, and explorer links.
3. Open New loan. Show the two network buttons, collateral/principal limits, and review/acknowledgement step.
4. Open Safety & contracts. Show replay, double-pledge, and stale-proof evidence alongside the deployed contracts.
5. Close with the trust boundary: signed federated messaging today; quorum/CCIP and a safe cancellation protocol are future work.

Use a longer live session for actual transactions because confirmation waits exceed a short walkthrough. The PDF and JSON evidence remain independently inspectable if an RPC provider is slow.
