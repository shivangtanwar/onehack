// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockLoanToken
/// @notice Faucet stablecoin-like ERC-20 used only for Chain B test loans.
contract MockLoanToken is ERC20 {
    constructor() ERC20("Databaes USD", "dUSD") {}

    /// @notice Mint test liquidity. This unrestricted faucet must never secure real value.
    function mint(address recipient, uint256 amount) external {
        _mint(recipient, amount);
    }
}
