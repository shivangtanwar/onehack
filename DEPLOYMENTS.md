# Deployments and Network Configuration

## Status

| Environment                       | Chain A                     | Chain B              | Status                                                                   |
| --------------------------------- | --------------------------- | -------------------- | ------------------------------------------------------------------------ |
| Automated Hardhat logical domains | 10001                       | 20002                | Verified: 21 passing tests                                               |
| Two local RPC nodes               | 31337                       | 31338                | **Verified:** peer configuration, lifecycle, mined attacks, and recovery |
| Public testnets                   | Ethereum Sepolia (11155111) | Base Sepolia (84532) | **Verified:** deployed, peered, loan issued, attacks rejected, recovered |

Only confirmed public transactions are recorded here.

## Messaging endpoint

The selected mechanism does not use a CCIP/LayerZero/Axelar router. `SignedRelayerMessenger` is the destination verification endpoint. Its route identity is:

```text
(destination EVM chainId, destination messenger address,
 source logical chainId, source application address,
 destination logical chainId, destination receiver address)
```

The EIP-712 domain additionally commits to the destination EVM chain ID and messenger address.

## Last ephemeral local deployment check

These addresses and transaction hashes were produced by real local deployments on 2026-09-11. The nodes were intentionally stopped afterward, so hashes are evidence of that ephemeral run, not permanent explorer links. Fresh deterministic nodes normally recreate the addresses; hashes may differ with block metadata.

### Chain A — local 31337, RPC `http://127.0.0.1:8545`

| Contract               | Address                                      | Deployment transaction                                               |
| ---------------------- | -------------------------------------------- | -------------------------------------------------------------------- |
| MockCollateralToken    | `0x5FbDB2315678afecb367f032d93F642f64180aa3` | `0xa4e91a65dd291e85dee74544c7fd5ec6ee60f1f720a41e6fb3cf7277196fd6ed` |
| SignedRelayerMessenger | `0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512` | `0x2a564b942d27671ab1823788f8302aad02e75d9b50188bbc15ec39e3e4a171ec` |
| CollateralVault        | `0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0` | `0x14363a413c4e81ba7317e5703fea8274ccf1f78ae3abb2fcfdeb8222996746d2` |

### Chain B — local 31338, RPC `http://127.0.0.1:9545`

| Contract               | Address                                      | Deployment transaction                                               |
| ---------------------- | -------------------------------------------- | -------------------------------------------------------------------- |
| SignedRelayerMessenger | `0x5FbDB2315678afecb367f032d93F642f64180aa3` | `0x4c26860bf4ceff6310163b3f681e8d1e116d2b3a478717195b133bca5b832600` |
| MockLoanToken          | `0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512` | `0xa7716ae2fd66232a88432cabc0db84fa6439c03fc3a66eca5144240760f60114` |
| LendingPool            | `0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0` | `0x17890218ac2dc93246d274a23dd36dbf3b9195776a519e80dcdf2c70a002010f` |

Identical 20-byte application addresses across separate local chains are expected from deterministic deployer nonces; chain/domain IDs disambiguate them and are signed.

### Verified local peer and lifecycle evidence

| Action                                                  | Transaction                                                          |
| ------------------------------------------------------- | -------------------------------------------------------------------- |
| Chain-A vault trusts Chain-B pool                       | `0x3c1c882a4762c2f31da19394c746486e9ff1d573cec1fcd4887a4dd55788b58e` |
| Chain-B pool trusts Chain-A vault                       | `0x4a73d06a79e38aab942df5ff2fe696cebe400625a21b3e6aa22a8b59b42dc111` |
| Lock 100 dCOL on Chain A                                | `0x17d447074786a4e3fd46fcc5bdadc5da524a16353b71c516a1e661636d76c3ed` |
| Authenticate and issue 50 dUSD on Chain B               | `0x22781314c9bffbbb934cc98516b8123118fd74c7632ca0bf5a209eb4198e466f` |
| Pledge acknowledgement on Chain A                       | `0x854a2a3f7ff8a2bf6aa74bdeff2b633001c6d6d83d599418e865707c1c31e8e2` |
| Rejected exact replay (`MessageAlreadyProcessed`)       | `0xdd4664b3894a81e52e06858118b395ee36e7b02a2a4b874a81d7630d1adbe1c7` |
| Rejected second signed pledge (`CollateralAlreadyUsed`) | `0x3cd9f675dc519a04ab110fea5b052bdf98f07168e3df35ee1bc0db9aa1119565` |
| Rejected stale proof (`MessageExpired`)                 | `0xc8add99f67e2d7842fe1933318baa05ba5b27e04bb0ea78099e3a4392078853a` |
| Mark default                                            | `0xa8400a1a698f3fe0ba29446c3b3eabf3d10d9475beaf376570eae7a86f4ab382` |
| Liquidate on Chain B                                    | `0x99322a1efaabc0d58d7cd696094fcee3885b9c4ae08d48eb75420b7bae1724e8` |
| Recover 100 dCOL to Chain-A treasury                    | `0xae6034ed5cd55af303cea0a3ff74dc5ca0ba6ce21010a6a8acd810d99c548a84` |

All three attack transactions were mined with status `0`. Final state: loan `LIQUIDATED`, collateral `LIQUIDATED`, vault balance `0 dCOL`, recovery treasury delta `+100 dCOL`. The React dashboard was rendered against these two live RPC nodes and visually verified with every lifecycle step complete.

## Local deployment

```bash
npm run node:a                    # terminal 1
npm run node:b                    # terminal 2

npm run deploy:a                  # terminal 3
npm run deploy:b
npm run configure:a
npm run configure:b
npm run demo:local
```

Generated `deployments/local-a.json` and `local-b.json` contain addresses and deployment hashes, never keys, and are gitignored because the nodes are ephemeral.

## Public targets

| Setting                            | Ethereum Sepolia / Chain A                    | Base Sepolia / Chain B                       |
| ---------------------------------- | --------------------------------------------- | -------------------------------------------- |
| EVM/logical chain ID               | 11155111                                      | 84532                                        |
| Public RPC                         | `https://ethereum-sepolia-rpc.publicnode.com` | `https://sepolia.base.org`                   |
| Example public explorer            | `https://sepolia.etherscan.io`                | `https://sepolia.basescan.org`               |
| Recommended starting confirmations | 12                                            | 12 (adjust to current finality guidance)     |
| Application                        | `CollateralVault`                             | `LendingPool`                                |
| Verification endpoint              | `SignedRelayerMessenger`                      | `SignedRelayerMessenger`                     |
| Current application address        | `0xd5b4a096de2d668Db01eab08D76c11a563b38Bf3`  | `0x3d38c71541ED82c313EBEBFdAb20a0CDEbb76770` |

Both RPC endpoints returned their expected chain IDs on 2026-09-11.

### Faucet wallets

| Role                         | Address                                      | Funding needed          |
| ---------------------------- | -------------------------------------------- | ----------------------- |
| Deployer                     | `0xA72E96C5e3397195722017629DB9C325A99b28d3` | Funded on both testnets |
| Attestor / message submitter | `0x0Cccb788d45F8B864Faa6DA40916F1A3Fbab712F` | Funded on both testnets |

These are disposable, project-only wallets. Private keys exist only in ignored `.env` mode `0600`; they are not present in documentation, deployment JSON, logs, or responses. Never fund them with mainnet assets.

## Confirmed Ethereum Sepolia deployment

| Contract/action                  | Address                                                                                          | Confirmed transaction                                                                                               |
| -------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| MockCollateralToken              | [`0xF11d…4868`](https://sepolia.etherscan.io/address/0xF11dfC764Ac5526E7D690183fAEFDFfF0DC74868) | [`0x8b66…71f9`](https://sepolia.etherscan.io/tx/0x8b66dff8ef10f86c1fb05ecd0da4262ecf92fc17db7a1a2a3752a12a492171f9) |
| SignedRelayerMessenger           | [`0x3BA4…54d3`](https://sepolia.etherscan.io/address/0x3BA4CADeD1F5A98e5A88728e9CF4218091A754d3) | [`0xca38…d076`](https://sepolia.etherscan.io/tx/0xca384b578387a2ada17e19e94d304e7d6ece56f1cc4b1380b1be3a451862d076) |
| CollateralVault                  | [`0xd5b4…8Bf3`](https://sepolia.etherscan.io/address/0xd5b4a096de2d668Db01eab08D76c11a563b38Bf3) | [`0x591f…1ca0`](https://sepolia.etherscan.io/tx/0x591fc38a6e0e92b87b3d2cda0f11300173821bf51ae417b5595ccf0aabf91ca0) |
| Mint 1,000 dCOL to demo borrower | Deployer wallet                                                                                  | [`0x1d38…dfe9`](https://sepolia.etherscan.io/tx/0x1d38fdd881dde0a13b5981c9ee53dc88ff3ab139bae473176a4ba3598021dfe9) |

The current vault peer is configured exactly once to Base Sepolia domain `84532` and its deployed pool. Its fixed recovery recipient is the separate treasury/attestor wallet, so a default demonstrably seizes collateral away from the borrower. The initial vault/messenger route remains on-chain with zero custody after completing loan 1, but is superseded by this current route.

## Confirmed Base Sepolia deployment

| Contract/action             | Address                                                                                          | Confirmed transaction                                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| SignedRelayerMessenger      | [`0xF11d…4868`](https://sepolia.basescan.org/address/0xF11dfC764Ac5526E7D690183fAEFDFfF0DC74868) | [`0xe129…5254`](https://sepolia.basescan.org/tx/0xe129ffa669e6ea597f3b0215fcc8b4707d3caad09bc3f71aad82ff3defc05254) |
| MockLoanToken               | [`0x4D1a…bA52`](https://sepolia.basescan.org/address/0x4D1aE7eBcfE1bEdc3c5aFb592871d8B3ec76bA52) | [`0xb77d…cd75`](https://sepolia.basescan.org/tx/0xb77d481e2f127ed1a691884a266b13aefb87317020a544f9450a6d905079cd75) |
| LendingPool                 | [`0x3d38…6770`](https://sepolia.basescan.org/address/0x3d38c71541ED82c313EBEBFdAb20a0CDEbb76770) | [`0x985c…dd3e`](https://sepolia.basescan.org/tx/0x985c3fb892c17e0a99f8004085f34a01a36e4b7f148df30488223af7068bdd3e) |
| Mint 1,000,000 dUSD to pool | Lending pool                                                                                     | [`0xebfa…3fe2`](https://sepolia.basescan.org/tx/0xebfa63bc5f4ca2327107748c764b935e708b1fac10cf8119c27f06cd29503fe2) |

The loan duration is 180 seconds for a judge-friendly public default without timestamp manipulation. Maximum LTV is 50%; demo APR is 0%.

## Confirmed public cross-chain lifecycle

| Action                                    | Network          | Confirmed transaction/result                                                                                                                               |
| ----------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Configure vault → pool peer               | Ethereum Sepolia | [`0x65a5…667d`](https://sepolia.etherscan.io/tx/0x65a5de3263e4ec220d99e21ce5941319c6173446b95b00d17aec407cfede667d)                                        |
| Configure trusted source vault            | Base Sepolia     | [`0x2fd8…8c71`](https://sepolia.basescan.org/tx/0x2fd81cfff605be7f90dcf8a8282641fb190b785d7ef45b60ca400ba661ad8c71)                                        |
| Approve 100 dCOL                          | Ethereum Sepolia | [`0x4e23…33fe`](https://sepolia.etherscan.io/tx/0x4e237c80e31ff264b20c4380c4d58b50bcfe282bc01abeee9ee7a4b2adf233fe)                                        |
| Lock 100 dCOL                             | Ethereum Sepolia | [`0x7ea3…6090`](https://sepolia.etherscan.io/tx/0x7ea3e7352ca356fa8f715cdf23ed6585c96ed02aa74e1e0f140b239440cb6090)                                        |
| Issue 50 dUSD after 12 confirmations      | Base Sepolia     | [`0x9fa4…e616`](https://sepolia.basescan.org/tx/0x9fa42a452c2d371ae880c9c39ab5a7629445db7c3785ed02ade67de759b5e616)                                        |
| Acknowledge pledge after 12 confirmations | Ethereum Sepolia | [`0x2ede…54d6`](https://sepolia.etherscan.io/tx/0x2edebe1a221c960551fddf567831c22731fc2f956baa6f6d20d246d770df54d6)                                        |
| Reject exact replay                       | Base Sepolia     | [`0xd5ab…516c`](https://sepolia.basescan.org/tx/0xd5abeb93631fb13cdd29b63e0d2ac3b92f23cac2146206269a61ba3d57ff516c), status `0`, `MessageAlreadyProcessed` |
| Reject second signed pledge               | Base Sepolia     | [`0x07ec…9907`](https://sepolia.basescan.org/tx/0x07ec6d07d324ec857cfa284bfe11e1ed92cff8abc53db9dc35789184ccd89907), status `0`, `CollateralAlreadyUsed`   |
| Reject stale proof                        | Base Sepolia     | [`0x1c98…30ce`](https://sepolia.basescan.org/tx/0x1c9859b14c8ce1e7de3310a582a025f8e6376321495972db6fe1dbd2983c30ce), status `0`, `MessageExpired`          |
| Mark loan defaulted                       | Base Sepolia     | [`0x26fa…340e`](https://sepolia.basescan.org/tx/0x26fae11576e73695059437ea6df552ae357930cce4754fff534665689dc7340e)                                        |
| Liquidate loan                            | Base Sepolia     | [`0x6817…e6aa`](https://sepolia.basescan.org/tx/0x6817b7392558209392e203bb6f366ff38eefa9a1f4e2b6668b1084439f2ce6aa)                                        |
| Recover 100 dCOL after 12 confirmations   | Ethereum Sepolia | [`0x77d8…21fe`](https://sepolia.etherscan.io/tx/0x77d85fa8c65c17490ac2ab5e99f8d47df7af720194cbd01d20c24d762d2221fe)                                        |

Public collateral ID: `0xd40b05337194c03bcf85e959c86eac9c0a0255fd751def71b53e7a65826528b6`. Loan ID: `2`. Final loan and collateral states are both `LIQUIDATED`; vault balance is `0 dCOL`; the borrower lost `100 dCOL`; the distinct recovery treasury gained `100 dCOL`. Full machine-readable evidence is in `deployments/public-demo.json`.

## Source verification

All six current contracts are Sourcify `exact_match` for both creation and runtime bytecode:

- [Sepolia dCOL verification](https://sourcify.dev/server/v2/contract/11155111/0xF11dfC764Ac5526E7D690183fAEFDFfF0DC74868)
- [Sepolia messenger verification](https://sourcify.dev/server/v2/contract/11155111/0x3BA4CADeD1F5A98e5A88728e9CF4218091A754d3)
- [Sepolia vault verification](https://sourcify.dev/server/v2/contract/11155111/0xd5b4a096de2d668Db01eab08D76c11a563b38Bf3)
- [Base messenger verification](https://sourcify.dev/server/v2/contract/84532/0xF11dfC764Ac5526E7D690183fAEFDFfF0DC74868)
- [Base dUSD verification](https://sourcify.dev/server/v2/contract/84532/0x4D1aE7eBcfE1bEdc3c5aFb592871d8B3ec76bA52)
- [Base pool verification](https://sourcify.dev/server/v2/contract/84532/0x3d38c71541ED82c313EBEBFdAb20a0CDEbb76770)

Run `npm run verify:sourcify` to reproduce or recheck submission.

## Public deployment commands

Create an ignored `.env` from `.env.example` with disposable testnet-only accounts:

```bash
bash scripts/hardhat.sh run scripts/deploy-chain-a.ts --network sepolia
bash scripts/hardhat.sh run scripts/deploy-chain-b.ts --network baseSepolia

CHAIN_A_DEPLOYMENT_FILE=sepolia.json CHAIN_B_DEPLOYMENT_FILE=baseSepolia.json \
  bash scripts/hardhat.sh run scripts/configure-chain-a.ts --network sepolia
CHAIN_A_DEPLOYMENT_FILE=sepolia.json CHAIN_B_DEPLOYMENT_FILE=baseSepolia.json \
  bash scripts/hardhat.sh run scripts/configure-chain-b.ts --network baseSepolia
```

The vault remote peer is one-time. Check every chain ID/address twice before configuration.

## One-shot relayer

`scripts/relayer.ts` reads a confirmed `OutboundMessagePrepared` event, validates its emitting address and destination network, signs the exact envelope, checks that its signer matches the messenger, submits delivery, and waits for a successful receipt.

Set these variables in an ignored environment:

```text
SOURCE_RPC_URL
DESTINATION_RPC_URL
SOURCE_APP_ADDRESS
DESTINATION_MESSENGER_ADDRESS
SOURCE_TX_HASH
SOURCE_CONFIRMATIONS
ATTESTOR_PRIVATE_KEY
```

Then run:

```bash
npm run relayer
```

Run once A -> B for `LOCK`, then B -> A for `PLEDGE_CONFIRMED`, `RELEASE`, or `LIQUIDATE`. Peer messages must be relayed in event nonce order.

## Transaction evidence checklist

For each public deployment/demo, append only confirmed data:

- deployed address and deployment transaction;
- verified source-code URL;
- one Chain-A lock transaction and block/confirmations;
- A -> B message ID, signature-recovered signer, and delivery transaction;
- Chain-B loan transaction/event;
- rejected replay/double-use transaction or reproducible `eth_call` and decoded error;
- default/liquidation and B -> A delivery transactions;
- final Chain-A treasury transfer; and
- explorer URLs for both chains.

Do not include private keys, signed arbitrary wallet messages unrelated to this protocol, or unconfirmed/pending hashes.
