// SPDX-License-Identifier: CC0-1.0
pragma solidity ^0.8.20;

import {IRegisterProjection} from "../IRegisterProjection.sol";
import {IProjectionSettlement} from "../IProjectionSettlement.sol";

/**
 * A minimal consumer of an ERC-8415 projection: one distribution, paid once to
 * whoever the register confirms held the token at a fixed record date.
 *
 * It exists to show the read-and-act boundary in executable form. The Kit
 * recommends performing the projection read inside the transaction that acts on
 * it; documentation alone leaves that as advice, and advice is what an
 * integrator drops first. Everything here is deliberately small — the only
 * thing worth copying is where the reads happen and what they are allowed to
 * mean.
 *
 * Three separate things are checked, and they are separate on purpose:
 *
 *   1. PROTOCOL FINALITY at the record date. `isFinalAsOf` answers this and
 *      nothing else does. It becomes true only once an entry is admitted whose
 *      `effectiveAt` is strictly after the record date, which a confirming
 *      entry for the same holder can supply without any change of hands. Until
 *      then the answer at that instant is provisional and this contract will
 *      not pay on it.
 *
 *   2. WHO the register confirms at that instant, read with `holderAsOf`. Never
 *      `ownerOf`: the tradeable position is a different fact, and a consumer
 *      that pays the current owner is paying the wrong question's answer.
 *
 *   3. AN OPEN GAP, which is THIS CONTRACT'S POLICY and not an ERC-8415 rule.
 *      An open gap does not make an already-final historical instant
 *      non-final. A distribution that would rather wait out an in-flight
 *      change than pay during one is a commercial choice, so it is written
 *      here, named as a policy, and checked inside the claim — not presented
 *      as protocol finality.
 *
 * `claim` takes a token id and nothing else. That is the point: there is no
 * parameter through which a caller could hand this contract a holder, a
 * version or an instant it read earlier over RPC. An earlier snapshot cannot
 * authorize a later action if the action never accepts one.
 */
contract RecordDateClaim {
    /// The register said someone else held the token at the record date.
    error NotConfirmed();
    /// Paid already. A distribution is paid once.
    error AlreadyClaimed();
    /// The record date is not yet final: a later admission can still change it.
    error RecordDateNotFinal();
    /// This contract's own policy, deliberately not an ERC-8415 finality rule.
    error GapOpenPolicy();
    /// Nothing left to pay with.
    error NotFunded();
    /// The payment did not reach the holder, so nothing is recorded as paid.
    error TransferFailed();

    event Claimed(
        uint256 indexed tokenId,
        address indexed holder,
        uint64 entryVersion,
        uint64 entryEffectiveAt,
        uint256 amount
    );

    IRegisterProjection public immutable projection;
    IProjectionSettlement public immutable settlement;
    /// Fixed before any claim, so no claim can choose the instant it is judged at.
    uint64 public immutable recordDate;
    uint256 public immutable amountPerToken;

    mapping(uint256 tokenId => bool) public claimed;

    constructor(
        IRegisterProjection projection_,
        IProjectionSettlement settlement_,
        uint64 recordDate_,
        uint256 amountPerToken_
    ) payable {
        projection = projection_;
        settlement = settlement_;
        recordDate = recordDate_;
        amountPerToken = amountPerToken_;
    }

    receive() external payable {}

    /**
     * Claim the distribution for `tokenId`.
     *
     * Every fact this decision rests on is read here, in this transaction,
     * against the deployed projection. Nothing is carried in from an earlier
     * RPC call, an indexer, or a previous block.
     */
    function claim(uint256 tokenId) external {
        if (claimed[tokenId]) revert AlreadyClaimed();

        // Policy first, so a refusal during an in-flight change is attributable
        // to this contract rather than mistaken for the protocol's answer.
        if (settlement.openGapOf(tokenId) != bytes32(0)) revert GapOpenPolicy();

        // Protocol finality at the record date, taken from the contract. It is
        // never recomputed here from entry timestamps: that arithmetic is the
        // register's, and duplicating it is how consumers drift from it.
        if (!projection.isFinalAsOf(tokenId, recordDate)) revert RecordDateNotFinal();

        address holder = projection.holderAsOf(tokenId, recordDate);
        if (holder != msg.sender) revert NotConfirmed();

        IRegisterProjection.RegisterEntry memory entry = projection.entryAsOf(tokenId, recordDate);

        uint256 amount = amountPerToken;
        if (address(this).balance < amount) revert NotFunded();

        // Consume the application's own state before any external effect, so a
        // reentrant call finds the claim already spent.
        claimed[tokenId] = true;
        emit Claimed(tokenId, holder, entry.version, entry.effectiveAt, amount);

        (bool sent, ) = holder.call{value: amount}("");
        if (!sent) revert TransferFailed();
    }

    /**
     * Why the claim would be refused right now, for a caller deciding whether
     * to send one. It reads the same facts in the same order.
     *
     * This is a convenience, not an authorization: its answer is a snapshot of
     * the block it runs in, and `claim` re-reads everything regardless. A
     * consumer that skipped the checks in `claim` because this returned "ok"
     * would have reintroduced exactly the gap this example exists to close.
     */
    function claimability(uint256 tokenId, address claimant)
        external
        view
        returns (bool eligible, bytes32 reason)
    {
        if (claimed[tokenId]) return (false, "ALREADY_CLAIMED");
        if (settlement.openGapOf(tokenId) != bytes32(0)) return (false, "GAP_OPEN_POLICY");
        if (!projection.isFinalAsOf(tokenId, recordDate)) return (false, "RECORD_DATE_NOT_FINAL");
        if (projection.holderAsOf(tokenId, recordDate) != claimant) return (false, "NOT_CONFIRMED");
        if (address(this).balance < amountPerToken) return (false, "NOT_FUNDED");
        return (true, bytes32(0));
    }
}
