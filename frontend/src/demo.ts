export const publicDemo = {
  collateralId: "0xd40b05337194c03bcf85e959c86eac9c0a0255fd751def71b53e7a65826528b6",
  loanId: "2",
  collateralAmount: "100",
  principal: "50",
  borrower: "0xA72E96C5e3397195722017629DB9C325A99b28d3",
  recoveryRecipient: "0x0Cccb788d45F8B864Faa6DA40916F1A3Fbab712F",
  transactions: {
    lock: {
      label: "Collateral locked",
      network: "Ethereum Sepolia",
      hash: "0x7ea3e7352ca356fa8f715cdf23ed6585c96ed02aa74e1e0f140b239440cb6090",
      url: "https://sepolia.etherscan.io/tx/0x7ea3e7352ca356fa8f715cdf23ed6585c96ed02aa74e1e0f140b239440cb6090"
    },
    issue: {
      label: "Loan issued",
      network: "Base Sepolia",
      hash: "0x9fa42a452c2d371ae880c9c39ab5a7629445db7c3785ed02ade67de759b5e616",
      url: "https://sepolia.basescan.org/tx/0x9fa42a452c2d371ae880c9c39ab5a7629445db7c3785ed02ade67de759b5e616"
    },
    pledge: {
      label: "Pledge confirmed",
      network: "Ethereum Sepolia",
      hash: "0x2edebe1a221c960551fddf567831c22731fc2f956baa6f6d20d246d770df54d6",
      url: "https://sepolia.etherscan.io/tx/0x2edebe1a221c960551fddf567831c22731fc2f956baa6f6d20d246d770df54d6"
    },
    liquidation: {
      label: "Default liquidated",
      network: "Base Sepolia",
      hash: "0x6817b7392558209392e203bb6f366ff38eefa9a1f4e2b6668b1084439f2ce6aa",
      url: "https://sepolia.basescan.org/tx/0x6817b7392558209392e203bb6f366ff38eefa9a1f4e2b6668b1084439f2ce6aa"
    },
    recovery: {
      label: "Collateral recovered",
      network: "Ethereum Sepolia",
      hash: "0x77d85fa8c65c17490ac2ab5e99f8d47df7af720194cbd01d20c24d762d2221fe",
      url: "https://sepolia.etherscan.io/tx/0x77d85fa8c65c17490ac2ab5e99f8d47df7af720194cbd01d20c24d762d2221fe"
    }
  },
  attacks: {
    exactReplay: {
      title: "Exact proof replay",
      description: "The same signed message was submitted twice.",
      error: "MessageAlreadyProcessed",
      hash: "0xd5abeb93631fb13cdd29b63e0d2ac3b92f23cac2146206269a61ba3d57ff516c",
      url: "https://sepolia.basescan.org/tx/0xd5abeb93631fb13cdd29b63e0d2ac3b92f23cac2146206269a61ba3d57ff516c"
    },
    doublePledge: {
      title: "Second collateral pledge",
      description: "A new valid signature tried to reuse the same collateral ID.",
      error: "CollateralAlreadyUsed",
      hash: "0x07ec6d07d324ec857cfa284bfe11e1ed92cff8abc53db9dc35789184ccd89907",
      url: "https://sepolia.basescan.org/tx/0x07ec6d07d324ec857cfa284bfe11e1ed92cff8abc53db9dc35789184ccd89907"
    },
    staleProof: {
      title: "Expired lock proof",
      description: "A correctly signed message arrived after its validity window.",
      error: "MessageExpired",
      hash: "0x1c9859b14c8ce1e7de3310a582a025f8e6376321495972db6fe1dbd2983c30ce",
      url: "https://sepolia.basescan.org/tx/0x1c9859b14c8ce1e7de3310a582a025f8e6376321495972db6fe1dbd2983c30ce"
    }
  }
} as const;
