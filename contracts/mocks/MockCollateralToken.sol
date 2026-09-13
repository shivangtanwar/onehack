// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockCollateralToken
/// @notice Faucet ERC-20 used only as native collateral on Chain A test deployments.
contract MockCollateralToken is ERC20 {
    constructor() ERC20("Databaes Collateral", "dCOL") {}

    /// @notice Mint test collateral. This unrestricted faucet must never secure real value.
    function mint(address recipient, uint256 amount) external {
        _mint(recipient, amount);
    }
}
