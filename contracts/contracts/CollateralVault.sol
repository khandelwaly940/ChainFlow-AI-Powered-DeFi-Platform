// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title CollateralVault
 * @notice Holds ERC20 collateral securely. Owner can withdraw to users when loans close.
 */
contract CollateralVault is Ownable {
    using SafeERC20 for IERC20;

    event Deposit(address indexed user, address indexed token, uint256 amount);
    event Withdraw(address indexed user, address indexed token, uint256 amount);

    mapping(address => mapping(address => uint256)) public balances; // user => token => amount

    constructor(address initialOwner) Ownable(initialOwner) {}

    /**
     * @notice Deposit collateral tokens
     * @param token The ERC20 token address
     * @param amount The amount to deposit
     */
    function deposit(address token, uint256 amount) external {
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        balances[msg.sender][token] += amount;
        emit Deposit(msg.sender, token, amount);
    }

    /**
     * @notice Deposit collateral on behalf of a user (owner only, typically LendingCore)
     * @param user The user to deposit for
     * @param token The ERC20 token address
     * @param amount The amount to deposit
     */
    function depositFor(address user, address token, uint256 amount) external onlyOwner {
        // Token must already be in vault (transferred by LendingCore)
        require(IERC20(token).balanceOf(address(this)) >= amount, "Insufficient balance in vault");
        balances[user][token] += amount;
        emit Deposit(user, token, amount);
    }

    /**
     * @notice Withdraw collateral tokens (only owner, typically LendingCore)
     * @param user The user to withdraw for
     * @param token The ERC20 token address
     * @param amount The amount to withdraw
     */
    function withdraw(address user, address token, uint256 amount) external onlyOwner {
        require(balances[user][token] >= amount, "Insufficient balance");
        balances[user][token] -= amount;
        IERC20(token).safeTransfer(user, amount);
        emit Withdraw(user, token, amount);
    }

    /**
     * @notice Get user's balance for a token
     * @param user The user address
     * @param token The ERC20 token address
     * @return The balance amount
     */
    function getBalance(address user, address token) external view returns (uint256) {
        return balances[user][token];
    }
}

