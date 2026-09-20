// SPDX-License-Identifier: CC0-1.0
pragma solidity ^0.8.20;

import {IERC165} from "./IERC165.sol";
import {IRegisterProjection} from "./IRegisterProjection.sol";
import {IProjectionSettlement} from "./IProjectionSettlement.sol";
import {ISettlementProofVerifier} from "./ISettlementProofVerifier.sol";

/// @notice The admission entry point of a register projection. Not part of
/// ERC-8415: `IRegisterProjection` is the read surface the standard freezes,
/// and how entries get written is the implementation's business. Declared
/// narrowly here so the settlement contract holds exactly the authority it
/// needs over the register and no more.
interface IRegisterAdmission {
    function initialize(
        uint256 tokenId,
        bytes32 recordCommitment,
        bytes32 registryReference,
        address holder,
        uint64 effectiveAt
    ) external;

    function admit(
        uint256 tokenId,
        bytes32 recordCommitment,
        bytes32 previousCommitment,
        bytes32 registryReference,
        address holder,
        uint64 effectiveAt
    ) external;
}

/// @title A conforming ERC-8415 settlement surface over a register projection.
/// @notice The on-chain form of `engine/settlement/engine.ts`. It is the
/// register's source authority, so admission reaches history only through the
/// gap it was opened for.
///
/// Three things this contract deliberately cannot do:
///
/// - it cannot block a transfer. An open gap is a record beside the
///   projection, never a lock on it, and nothing here touches ERC-721;
/// - it cannot finalise anything. Opening, cancelling, expiring and closing a
///   gap all leave `isFinalAsOf` exactly where it was. Closing a gap does
///   append an entry, and that entry closes the *preceding* interval - which
///   is the later-admission rule doing its ordinary work, not settlement
///   conferring finality on what it just admitted;
/// - it cannot reject an entry. There is no rejection path and no rejection
///   event: an admission whose proof does not verify never becomes an entry,
///   and one that does is permanent.
///
/// `GapStatus.SUPERSEDED` and `SettlementSuperseded` are declared by the
/// interface and never produced here. A token holds at most one open gap, and
/// replacing an open gap with another would be a second way to close one
/// without either admitting or cancelling. The in-process engine has no such
/// path either; the member stays for interface conformance.
contract ProjectionSettlement is IProjectionSettlement {
    error NotSettlementAuthority();
    error SettlementExists();
    error SettlementUnknown();
    error NoOpenGap();
    error GapAlreadyOpen();
    error SettlementExpired();
    error DeadlineOutOfRange();
    error ProofRefused();
    error CommitmentInvalid();
    error SnapshotInvalid();
    error SettlementIdInvalid();
    error HolderInvalid();
    error RegisterInvalid();
    error VerifierInvalid();
    error SettlementPeriodInvalid();

    /// Domain separator, kept byte-identical to the off-chain binding tag in
    /// `engine/proof/binding.ts` so both sides name the same thing.
    bytes32 private constant _BINDING_DOMAIN = keccak256("erc8415/admission/v2");

    IRegisterProjection private immutable _projection;
    IRegisterAdmission private immutable _admission;
    ISettlementProofVerifier private immutable _verifier;
    uint64 private immutable _settlementPeriod;

    mapping(bytes32 => Settlement) private _settlements;
    mapping(uint256 => bytes32) private _openGap;
    /// Who may open a gap. Fixed at construction: the standard says settlement
    /// authority is separate from token ownership, and a mutable list would
    /// add a governance surface the standard does not describe.
    mapping(address => bool) private _authorities;

    constructor(
        address register,
        address proofVerifier,
        uint64 maximumInterval,
        address[] memory authorities
    ) {
        if (register == address(0)) revert RegisterInvalid();
        if (proofVerifier == address(0)) revert VerifierInvalid();
        if (maximumInterval == 0) revert SettlementPeriodInvalid();

        _projection = IRegisterProjection(register);
        _admission = IRegisterAdmission(register);
        _verifier = ISettlementProofVerifier(proofVerifier);
        _settlementPeriod = maximumInterval;

        for (uint256 i = 0; i < authorities.length; i++) {
            if (authorities[i] == address(0)) revert NotSettlementAuthority();
            _authorities[authorities[i]] = true;
        }
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IERC165).interfaceId
            || interfaceId == type(IProjectionSettlement).interfaceId;
    }

    function projection() external view returns (address) {
        return address(_projection);
    }

    function settlement(bytes32 settlementId) external view returns (Settlement memory) {
        return _settlements[settlementId];
    }

    /// @notice The settlement currently open on a token, or zero. Separate
    /// from `isFinalAsOf`: an open gap says a change is in flight, not that
    /// anything has stopped being final.
    function openGapOf(uint256 tokenId) external view returns (bytes32) {
        return _openGap[tokenId];
    }

    function settlementPeriod() external view returns (uint64) {
        return _settlementPeriod;
    }

    function verificationProfile() external view returns (bytes32) {
        return _verifier.profileId();
    }

    function verifier() external view returns (address) {
        return address(_verifier);
    }

    /// @notice Never consults ownership. The token id is accepted because the
    /// interface takes one and a richer policy would need it; this policy is
    /// an allow-list and does not.
    function isSettlementAuthority(uint256, address account) public view returns (bool) {
        return _authorities[account];
    }

    /// @notice Write the register's first entry for a token.
    ///
    /// This exists because the register's source authority is immutable and is
    /// this contract: if settlement could not initialize, nothing could, and
    /// no gap would ever have a register to close over.
    ///
    /// It is not a gap and carries no proof. Invariant 1 says the first entry
    /// has version 1 and no predecessor, so there is no preceding interval for
    /// a settlement to cover and nothing for evidence to be bound to. It also
    /// confers no finality: until a second entry is admitted, the register's
    /// whole span is provisional.
    function initializeRegister(
        uint256 tokenId,
        bytes32 recordCommitment,
        bytes32 registryReference,
        address holder,
        uint64 effectiveAt
    ) external {
        if (!isSettlementAuthority(tokenId, msg.sender)) revert NotSettlementAuthority();
        _admission.initialize(tokenId, recordCommitment, registryReference, holder, effectiveAt);
    }

    /// @notice Open a gap. The initiator is the caller, so the record names
    /// who actually opened it rather than who the call said opened it.
    function beginSettlement(
        uint256 tokenId,
        bytes32 settlementId,
        address expectedHolder,
        bytes32 snapshotHash,
        uint64 deadline
    ) external {
        if (settlementId == bytes32(0)) revert SettlementIdInvalid();
        if (expectedHolder == address(0)) revert HolderInvalid();
        if (snapshotHash == bytes32(0)) revert SnapshotInvalid();
        if (!isSettlementAuthority(tokenId, msg.sender)) revert NotSettlementAuthority();
        if (_settlements[settlementId].status != GapStatus.NONE) revert SettlementExists();
        if (_openGap[tokenId] != bytes32(0)) revert GapAlreadyOpen();

        uint64 openedAt = uint64(block.timestamp);
        if (deadline <= openedAt) revert DeadlineOutOfRange();
        if (deadline - openedAt > _settlementPeriod) revert DeadlineOutOfRange();

        _settlements[settlementId] = Settlement({
            tokenId: tokenId,
            initiator: msg.sender,
            expectedHolder: expectedHolder,
            snapshotHash: snapshotHash,
            openedAt: openedAt,
            deadline: deadline,
            status: GapStatus.OPEN
        });
        _openGap[tokenId] = settlementId;

        emit SettlementStarted(settlementId, tokenId, msg.sender, expectedHolder, snapshotHash, deadline);
    }

    /// @notice What a proof for this settlement is allowed to admit.
    ///
    /// Exposed so a relayer can compute off chain exactly what the contract
    /// will check, and so the binding is auditable rather than implicit.
    function admissionBinding(
        bytes32 settlementId,
        bytes32 recordCommitment,
        bytes32 registryReference,
        uint64 effectiveAt
    ) public view returns (bytes32) {
        Settlement storage record = _settlements[settlementId];
        if (record.status == GapStatus.NONE) revert SettlementUnknown();

        IRegisterProjection.RegisterEntry memory previous = _projection.currentEntry(record.tokenId);

        // abi.encode over fixed-width fields only, so no two different
        // bindings share an encoding.
        return keccak256(
            abi.encode(
                _BINDING_DOMAIN,
                block.chainid,
                address(this),
                record.tokenId,
                settlementId,
                record.snapshotHash,
                record.expectedHolder,
                previous.recordCommitment,
                recordCommitment,
                previous.version + 1,
                effectiveAt,
                registryReference
            )
        );
    }

    /// @notice Close a gap by admitting the entry it was opened for.
    ///
    /// Anyone may relay. The submitter is not checked and gains nothing by
    /// submitting: what is checked is the proof, and the proof is bound to
    /// this settlement, so relaying someone else's proof admits their entry
    /// rather than one of the relayer's choosing.
    function finalizeSettlement(
        bytes32 settlementId,
        bytes32 recordCommitment,
        bytes32 registryReference,
        uint64 effectiveAt,
        bytes calldata proofData
    ) external {
        Settlement storage record = _settlements[settlementId];
        if (record.status != GapStatus.OPEN) revert NoOpenGap();
        if (uint64(block.timestamp) > record.deadline) revert SettlementExpired();
        if (recordCommitment == bytes32(0)) revert CommitmentInvalid();

        // Reverts when the register holds no entry for the token: a gap can
        // only be closed over a register that has been initialized.
        IRegisterProjection.RegisterEntry memory previous = _projection.currentEntry(record.tokenId);

        bytes32 binding = admissionBinding(settlementId, recordCommitment, registryReference, effectiveAt);
        if (!_verifier.verifyAdmission(binding, proofData)) revert ProofRefused();

        uint64 version = previous.version + 1;

        // The register enforces the four projection invariants. A candidate
        // that breaks one reverts here rather than being recorded as a
        // rejection, because there is no rejection to record.
        _admission.admit(
            record.tokenId,
            recordCommitment,
            previous.recordCommitment,
            registryReference,
            record.expectedHolder,
            effectiveAt
        );

        record.status = GapStatus.ADMITTED;
        delete _openGap[record.tokenId];

        emit SettlementFinalized(settlementId, record.tokenId, recordCommitment, version, effectiveAt);
    }

    /// @notice Close a gap without admitting anything.
    ///
    /// This settles nothing. The projection is untouched, and every instant
    /// that was provisional before is provisional after. Only the initiator
    /// may cancel, and only strictly after the deadline: before it, the
    /// counterparty still has the time the gap promised them.
    function cancelSettlement(bytes32 settlementId, bytes32 reasonHash) external {
        Settlement storage record = _settlements[settlementId];
        if (record.status != GapStatus.OPEN) revert NoOpenGap();
        if (msg.sender != record.initiator) revert NotSettlementAuthority();
        if (uint64(block.timestamp) <= record.deadline) revert DeadlineOutOfRange();

        record.status = GapStatus.CANCELLED;
        delete _openGap[record.tokenId];

        emit SettlementCancelled(settlementId, record.tokenId, reasonHash);
    }
}
