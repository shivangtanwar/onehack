# Databaes workspace

A responsive loan workspace for the existing Ethereum Sepolia / Base Sepolia contracts.

## Run

```bash
npm install
npm run dev
```

The app opens at http://127.0.0.1:5173. Public testnet contracts are configured by default; copy `.env.example` to `.env` for the local two-chain setup.

## Everyday flows

- **Overview:** personal collateral totals, outstanding debt, open and completed loans, wallet balances, and the next repayment. Without a wallet, personal pages show a connection prompt with a link to the public demo.
- **My loans:** automatically discover locks created by the connected wallet, search and filter loans, track a public collateral ID, and save a descriptive name. Loan details show the deadline, remaining time, separate network outcomes, repayment review, and transaction history.
- **New loan:** choose amounts, check balance and borrowing limits, review actual contract terms, acknowledge the lock, then approve and lock through separate wallet confirmations. A successful lock opens its tracking view.
- **Activity & history:** confirmed contract events on both networks with search, network/type/date filters, pagination, CSV export, and transaction links.
- **Public demo:** a read-only walkthrough of the recorded loan, with a collateral summary, chronological transaction timeline, recovery explanation, and expandable record details. It remains separate from personal loans and balances.
- **Safety & contracts:** a plain-language explanation of custody and the relay dependency, a six-contract directory, and inspectable public rejection evidence.

Repayment confirmation and collateral return are separate statuses. Likewise, liquidation and treasury recovery remain separate until the vault confirms the final outcome. Closing a modal never cancels a pending wallet transaction.

## Data and persistence

Balances and loan states come directly from the configured contracts and refresh every 12 seconds. Wallet changes reset the displayed portfolio. Personal overview totals exclude third-party watched loans.

Wallet loan discovery reads `CollateralLocked` events, including locks that have not yet issued a loan. It also checks the lending pool’s loan registry with a wallet-specific cursor, so issued loans can be found even when historical event responses are incomplete. History reads events from both application contracts, in 9,000-block chunks, and keeps an incremental cache with a 12-block overlap. Its initial range starts at the known public deployments, or at block zero for a custom deployment. For another deployment, set the following to each application contract's deployment block:

```dotenv
VITE_CHAIN_A_START_BLOCK=0
VITE_CHAIN_B_START_BLOCK=0
```

Names and tracked IDs are stored in `localStorage`, scoped by wallet, chain IDs, and application addresses. Event caches are scoped by deployment. These are browser-local conveniences; a fresh browser rediscovers the wallet's loans but not custom names. Disconnecting the workspace does not revoke token allowances or the wallet extension's site permission.

The app does not operate a relayer. Issuance, pledge acknowledgement, collateral return, and recovery require the existing relay operator. A pending lock cannot be cancelled under the current contracts.

## Verify

```bash
npm run build
npx playwright install chromium
npm run test:e2e
```

The browser suite mocks public RPC responses and a wallet provider. It covers discovery, account changes, repayment and return states, input validation, separate approval/lock steps, successful locking and repayment, cancellation, persistent naming, tracking, history filters/export, unavailable networks, and mobile navigation. Tests do not submit transactions to a real network.

To reuse a local Chromium installation, set `PLAYWRIGHT_EXECUTABLE_PATH` to its executable when running the tests.
