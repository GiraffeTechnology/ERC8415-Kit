// SPDX-License-Identifier: CC0-1.0
pragma solidity ^0.8.20;

import {IRegisterProjection} from "../IRegisterProjection.sol";
import {IProjectionSettlement} from "../IProjectionSettlement.sol";

/// @title  Record-date claim: a minimal ERC-8415 consumer (non-normative example)
/// @notice Pays the holder of record at `recordDate`, once. It shows the integration shape
///         AGENTS.md recommends: read the projection and act on it in the SAME transaction,
///         never on an earlier RPC or HTTP snapshot.
///
///         Two different kinds of check, kept apart on purpose:
///
///         - ERC-8415 finality. `isFinalAsOf(tokenId, recordDate)` must be true. A record date
///           is final only once an entry effective STRICTLY AFTER it has been admitted; a
///           confirming entry for the same holder does that without an ownership change.
///
///         - Consumer policy, NOT an ERC-8415 rule. This example also refuses to pay while a
///           settlement gap is open on the token (`openGapOf != 0`). An open gap does not make
///           an already-final instant non-final, and the projection still answers
///           `isFinalAsOf` exactly as before. Refusing here is this consumer's choice to wait
///           out a change in flight, and it is checked inside the claim transaction, so a gap
///           opened earlier in the same block is seen.
///
///         Nothing in the specification depends on this contract. CC0.
contract RecordDateClaim {
    error NotFinal();
    error NotHolder();
    error GapOpen();
    error AlreadyClaimed();
    error PayoutFailed();

    event Claimed(uint256 indexed tokenId, uint64 indexed recordDate, address indexed holder, uint256 amount);

    IRegisterProjection public immutable projection;
    IProjectionSettlement public immutable settlement;
    uint256 public immutable tokenId;
    uint64 public immutable recordDate;
    uint256 public immutable amount;

    /// @dev One holder per instant, so one claim per record date.
    bool public claimed;

    constructor(
        IRegisterProjection projection_,
        IProjectionSettlement settlement_,
        uint256 tokenId_,
        uint64 recordDate_,
        uint256 amount_
    ) payable {
        projection = projection_;
        settlement = settlement_;
        tokenId = tokenId_;
        recordDate = recordDate_;
        amount = amount_;
    }

    function claim() external {
        if (claimed) revert AlreadyClaimed();

        // ERC-8415: the answer at recordDate must be final, and must name the caller.
        if (!projection.isFinalAsOf(tokenId, recordDate)) revert NotFinal();
        if (projection.holderAsOf(tokenId, recordDate) != msg.sender) revert NotHolder();

        // Consumer policy (see contract notes): no payout while a change is in flight.
        if (settlement.openGapOf(tokenId) != bytes32(0)) revert GapOpen();

        // Effects before the external call.
        claimed = true;
        emit Claimed(tokenId, recordDate, msg.sender, amount);

        (bool ok, ) = msg.sender.call{value: amount}("");
        if (!ok) revert PayoutFailed();
    }
}
