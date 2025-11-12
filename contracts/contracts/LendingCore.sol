// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./CollateralVault.sol";
import "./CreditScoreRegistry.sol";
import "./PriceOracleRouter.sol";

/**
 * @title LendingCore
 * @notice Core lending flows: open loans, repay, liquidate. Tier-based LTV and APR.
 */
contract LendingCore is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    struct Loan {
        address borrower;
        address collateralToken;
        address debtToken;
        uint256 collateralAmount;
        uint256 debtAmount;
        uint256 interestRate; // APR in basis points
        uint256 createdAt;
        uint256 lastAccruedAt;
        bool active;
    }

    struct TierParams {
        uint256 ltvBps; // Loan-to-value in basis points (e.g., 7500 = 75%)
        uint256 aprBps; // Annual percentage rate in basis points
    }

    CollateralVault public immutable vault;
    CreditScoreRegistry public immutable scoreRegistry;
    PriceOracleRouter public immutable oracle;

    address public immutable collateralToken; // WMATIC
    address public immutable debtToken; // USDC

    mapping(uint256 => Loan) public loans;
    mapping(uint8 => TierParams) public tierParams; // tier => params
    uint256 public loanCounter;
    uint256 public liquidationThresholdBps; // e.g., 8500 = 85% of LTV
    uint256 public liquidationBonusBps; // e.g., 500 = 5% bonus

    event LoanOpened(
        uint256 indexed loanId,
        address indexed borrower,
        uint256 collateralAmount,
        uint256 debtAmount,
        uint8 tier
    );
    event LoanRepaid(uint256 indexed loanId, uint256 repayAmount, uint256 remainingDebt);
    event LoanLiquidated(uint256 indexed loanId, address indexed liquidator, uint256 seizedAmount);
    event TierParamsUpdated(uint8 tier, uint256 ltvBps, uint256 aprBps);
    event LiquidationParamsUpdated(uint256 thresholdBps, uint256 bonusBps);

    constructor(
        address _vault,
        address _scoreRegistry,
        address _oracle,
        address _collateralToken,
        address _debtToken,
        address initialOwner
    ) Ownable(initialOwner) {
        vault = CollateralVault(_vault);
        scoreRegistry = CreditScoreRegistry(_scoreRegistry);
        oracle = PriceOracleRouter(_oracle);
        collateralToken = _collateralToken;
        debtToken = _debtToken;

        // Initialize tier params: A=70% LTV/6% APR, B=60% LTV/9% APR, C=50% LTV/12% APR
        tierParams[2] = TierParams(7000, 600); // Tier A
        tierParams[1] = TierParams(6000, 900); // Tier B
        tierParams[0] = TierParams(5000, 1200); // Tier C

        liquidationThresholdBps = 8500; // 85% of LTV
        liquidationBonusBps = 500; // 5% bonus
    }

    /**
     * @notice Open a new loan
     * @param collateralAmount Amount of collateral to deposit
     * @param desiredDebt Desired debt amount
     */
    function openLoan(uint256 collateralAmount, uint256 desiredDebt) external nonReentrant whenNotPaused {
        require(collateralAmount > 0, "Collateral must be > 0");
        require(desiredDebt > 0, "Debt must be > 0");

        uint8 tier = scoreRegistry.getTier(msg.sender);
        require(tier <= 2, "No credit score set");

        TierParams memory params = tierParams[tier];

        // Get collateral value in USD (1e18)
        uint256 collateralPrice = oracle.getPrice();
        uint256 collateralValue = (collateralAmount * collateralPrice) / 1e18;

        // Convert desired debt from 6 decimals (USDC) to 18 decimals for comparison
        uint256 desiredDebt18 = desiredDebt * 1e12;

        // Calculate max debt based on LTV
        uint256 maxDebt = (collateralValue * params.ltvBps) / 10000;
        require(desiredDebt18 <= maxDebt, "Exceeds LTV limit");

        // Transfer collateral to vault and record deposit
        IERC20(collateralToken).safeTransferFrom(msg.sender, address(vault), collateralAmount);
        vault.depositFor(msg.sender, collateralToken, collateralAmount);

        // Transfer debt tokens to borrower
        // Note: Contract must hold sufficient USDC balance to lend
        require(
            IERC20(debtToken).balanceOf(address(this)) >= desiredDebt,
            "Insufficient liquidity"
        );
        IERC20(debtToken).safeTransfer(msg.sender, desiredDebt);

        // Create loan
        uint256 loanId = loanCounter++;
        loans[loanId] = Loan({
            borrower: msg.sender,
            collateralToken: collateralToken,
            debtToken: debtToken,
            collateralAmount: collateralAmount,
            debtAmount: desiredDebt,
            interestRate: params.aprBps,
            createdAt: block.timestamp,
            lastAccruedAt: block.timestamp,
            active: true
        });

        emit LoanOpened(loanId, msg.sender, collateralAmount, desiredDebt, tier);
    }

    /**
     * @notice Repay a loan
     * @param loanId The loan ID
     * @param repayAmount Amount to repay
     */
    function repay(uint256 loanId, uint256 repayAmount) external nonReentrant whenNotPaused {
        Loan storage loan = loans[loanId];
        require(loan.active, "Loan not active");
        require(loan.borrower == msg.sender, "Not borrower");

        // Accrue interest
        _accrueInterest(loanId);

        uint256 currentDebt = loan.debtAmount;
        require(repayAmount <= currentDebt, "Repay exceeds debt");

        // Transfer repayment
        IERC20(debtToken).safeTransferFrom(msg.sender, address(this), repayAmount);

        uint256 remainingDebt = currentDebt - repayAmount;

        if (remainingDebt == 0) {
            // Loan fully repaid, release collateral
            loan.active = false;
            vault.withdraw(loan.borrower, loan.collateralToken, loan.collateralAmount);
        } else {
            loan.debtAmount = remainingDebt;
        }

        emit LoanRepaid(loanId, repayAmount, remainingDebt);
    }

    /**
     * @notice Get health factor for a loan
     * @param loanId The loan ID
     * @return Health factor (1e18 = 1.0, < 1e18 means liquidatable)
     */
    function healthFactor(uint256 loanId) external view returns (uint256) {
        Loan memory loan = loans[loanId];
        require(loan.active, "Loan not active");

        // Accrue interest for calculation
        uint256 currentDebt = _calculateDebtWithInterest(loan);

        // Get collateral value in USD (1e18)
        uint256 collateralPrice = oracle.getPrice();
        uint256 collateralValue = (loan.collateralAmount * collateralPrice) / 1e18;

        // Convert debt from 6 decimals to 18 decimals
        uint256 debtValue = currentDebt * 1e12;

        if (debtValue == 0) return type(uint256).max;

        // Health factor = collateral value / debt value
        return (collateralValue * 1e18) / debtValue;
    }

    /**
     * @notice Liquidate a loan
     * @param loanId The loan ID
     * @param maxRepay Maximum amount to repay
     */
    function liquidate(uint256 loanId, uint256 maxRepay) external nonReentrant whenNotPaused {
        Loan storage loan = loans[loanId];
        require(loan.active, "Loan not active");

        uint256 hf = this.healthFactor(loanId);
        require(hf < 1e18, "Health factor >= 1");

        // Accrue interest
        _accrueInterest(loanId);

        uint256 currentDebt = loan.debtAmount;
        uint256 repayAmount = maxRepay < currentDebt ? maxRepay : currentDebt;

        // Transfer repayment
        IERC20(debtToken).safeTransferFrom(msg.sender, address(this), repayAmount);

        // Calculate liquidation bonus
        uint256 bonus = (repayAmount * liquidationBonusBps) / 10000;
        uint256 seizedAmount = repayAmount + bonus;

        // Convert seized amount from debt token (6 decimals) to collateral (18 decimals)
        // This is simplified - in production, use oracle to get proper exchange rate
        uint256 collateralPrice = oracle.getPrice();
        uint256 seizedCollateral = (seizedAmount * 1e12 * 1e18) / collateralPrice;

        require(seizedCollateral <= loan.collateralAmount, "Seizure exceeds collateral");

        loan.debtAmount = currentDebt - repayAmount;
        if (loan.debtAmount == 0) {
            loan.active = false;
        }

        // Transfer seized collateral to liquidator
        vault.withdraw(msg.sender, loan.collateralToken, seizedCollateral);

        emit LoanLiquidated(loanId, msg.sender, seizedCollateral);
    }

    /**
     * @notice Update tier parameters (owner only)
     */
    function setTierParams(uint8 tier, uint256 ltvBps, uint256 aprBps) external onlyOwner {
        require(tier <= 2, "Invalid tier");
        require(ltvBps <= 10000, "LTV > 100%");
        tierParams[tier] = TierParams(ltvBps, aprBps);
        emit TierParamsUpdated(tier, ltvBps, aprBps);
    }

    /**
     * @notice Update liquidation parameters (owner only)
     */
    function setLiquidationParams(uint256 thresholdBps, uint256 bonusBps) external onlyOwner {
        liquidationThresholdBps = thresholdBps;
        liquidationBonusBps = bonusBps;
        emit LiquidationParamsUpdated(thresholdBps, bonusBps);
    }

    /**
     * @notice Pause contract (owner only)
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @notice Unpause contract (owner only)
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @notice Accrue interest on a loan
     */
    function _accrueInterest(uint256 loanId) internal {
        Loan storage loan = loans[loanId];
        if (loan.debtAmount == 0) return;

        uint256 timeElapsed = block.timestamp - loan.lastAccruedAt;
        if (timeElapsed == 0) return;

        // Simple interest: debt * rate * time / (365 days * 86400 seconds)
        uint256 interest = (loan.debtAmount * loan.interestRate * timeElapsed) / (365 * 86400 * 10000);
        loan.debtAmount += interest;
        loan.lastAccruedAt = block.timestamp;
    }

    /**
     * @notice Calculate debt with accrued interest (view function)
     */
    function _calculateDebtWithInterest(Loan memory loan) internal view returns (uint256) {
        if (loan.debtAmount == 0) return 0;

        uint256 timeElapsed = block.timestamp - loan.lastAccruedAt;
        if (timeElapsed == 0) return loan.debtAmount;

        uint256 interest = (loan.debtAmount * loan.interestRate * timeElapsed) / (365 * 86400 * 10000);
        return loan.debtAmount + interest;
    }
}

