// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title CreditScoreRegistry
 * @notice Stores credit score hash and tier per user. Owner-only setter.
 */
contract CreditScoreRegistry is Ownable {
    struct UserScore {
        bytes32 scoreHash;
        uint8 tier; // 0 = C, 1 = B, 2 = A
    }

    mapping(address => UserScore) public userScores;

    event ScoreSet(address indexed user, bytes32 scoreHash, uint8 tier);

    constructor(address initialOwner) Ownable(initialOwner) {}

    /**
     * @notice Set score hash and tier for a user (only owner, typically API)
     * @param user The user address
     * @param scoreHash The hash of the score
     * @param tier The credit tier (0=C, 1=B, 2=A)
     */
    function setScoreHash(address user, bytes32 scoreHash, uint8 tier) external onlyOwner {
        require(tier <= 2, "Invalid tier");
        userScores[user] = UserScore(scoreHash, tier);
        emit ScoreSet(user, scoreHash, tier);
    }

    /**
     * @notice Get tier for a user
     * @param user The user address
     * @return The credit tier (0=C, 1=B, 2=A)
     */
    function getTier(address user) external view returns (uint8) {
        return userScores[user].tier;
    }

    /**
     * @notice Get full score data for a user
     * @param user The user address
     * @return scoreHash The score hash
     * @return tier The credit tier
     */
    function getScore(address user) external view returns (bytes32 scoreHash, uint8 tier) {
        UserScore memory score = userScores[user];
        return (score.scoreHash, score.tier);
    }
}

