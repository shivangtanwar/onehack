export const erc20Abi = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function mint(address,uint256)",
  "function symbol() view returns (string)"
];

export const vaultAbi = [
  "function lockCollateral(uint256 amount,uint256 requestedPrincipal,uint64 validUntil) returns (bytes32)",
  "function recoveryRecipient() view returns (address)",
  "function collaterals(bytes32) view returns (address owner,address asset,uint256 amount,uint256 requestedPrincipal,uint256 loanId,uint64 lockNonce,uint64 createdAt,uint64 validUntil,uint8 state)",
  "event CollateralLocked(bytes32 indexed collateralId,address indexed owner,address indexed asset,uint256 amount,uint256 requestedPrincipal,uint64 lockNonce,uint64 validUntil)",
  "event CollateralPledged(bytes32 indexed collateralId,uint256 indexed loanId)",
  "event CollateralReleased(bytes32 indexed collateralId,uint256 indexed loanId,address indexed owner,uint256 amount)",
  "event CollateralLiquidated(bytes32 indexed collateralId,uint256 indexed loanId,address indexed recoveryRecipient,uint256 amount)",
  "error InvalidAmount()",
  "error InvalidProofExpiry(uint64 supplied,uint64 currentTime)",
  "error InvalidCollateralState(bytes32 collateralId,uint8 current,uint8 expected)"
];

export const poolAbi = [
  "function annualInterestBps() view returns (uint16)",
  "function loanCount() view returns (uint256)",
  "function loanByCollateral(bytes32) view returns (uint256)",
  "function maxLtvBps() view returns (uint16)",
  "function loanDuration() view returns (uint64)",
  "function loans(uint256) view returns (bytes32 collateralId,address borrower,address collateralAsset,uint256 collateralAmount,uint256 principal,uint64 startTime,uint64 deadline,uint64 sourceChainId,address sourceVault,uint64 lockNonce,uint8 state)",
  "function amountDue(uint256) view returns (uint256)",
  "event LoanIssued(uint256 indexed loanId,bytes32 indexed collateralId,address indexed borrower,uint256 principal,uint64 deadline,uint64 sourceChainId,address sourceVault)",
  "event LoanRepaid(uint256 indexed loanId,bytes32 indexed collateralId,address indexed payer,uint256 amountPaid)",
  "event LoanDefaulted(uint256 indexed loanId,bytes32 indexed collateralId)",
  "event LoanLiquidated(uint256 indexed loanId,bytes32 indexed collateralId)",
  "function repay(uint256)",
  "function markDefaulted(uint256)",
  "function liquidate(uint256)",
  "error CollateralAlreadyUsed(bytes32 collateralId,uint256 existingLoanId)",
  "error InvalidLoanState(uint256 loanId,uint8 current,uint8 expected)",
  "error LoanNotOverdue(uint256 loanId,uint64 deadline,uint64 currentTime)",
  "error LockMessageExpired(uint64 validUntil,uint64 currentTime)"
];

export const messengerAbi = [
  "function deliver((uint64 sourceChainId,uint64 destinationChainId,address sourceSender,address destinationReceiver,uint64 nonce,bytes32 payloadHash,uint64 createdAt,uint64 validUntil) envelope,bytes payload,bytes proof) returns (bytes32)",
  "error MessageAlreadyProcessed(bytes32 messageId)",
  "error MessageExpired(uint64 validUntil,uint64 currentTime)",
  "error InvalidNonce(uint64 supplied,uint64 expected)",
  "error InvalidSignature(address expectedSigner)",
  "error InvalidDestinationChain(uint64 supplied,uint64 expected)"
];
