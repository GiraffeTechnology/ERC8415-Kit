// SPDX-License-Identifier: CC0-1.0
pragma solidity ^0.8.20;

import {IERC165} from "./IERC165.sol";
import {IRegisterProjection} from "./IRegisterProjection.sol";

/// @title A conforming ERC-8415 register projection.
/// @notice Implements the four projection invariants and the finality rule, so
/// the Kit has something deployable rather than interfaces alone.
///
/// Finality is derived on every call and never stored. There is no field an
/// operator, a proof or a workflow could write to make an instant final: the
/// only thing that finalises an interval is a strictly later admitted entry.
///
/// There is no freeze, revoke, override or rollback, and no path that rewrites
/// an admitted entry. `supersededAt` on the preceding entry is the single
/// field the standard writes after admission, exactly once.
///
/// ## Trust model: authority-gated, not proof-gated
///
/// `initialize` and `admit` are gated on `sourceAuthority` and take no proof
/// data. This contract performs no proof-profile verification, no remote-height
/// advancement and no replay check: it enforces the four projection invariants
/// and nothing about where an entry came from. Whoever holds the source
/// authority key can append any holder, commitment, reference and effective
/// time the invariants permit, and no later transaction can take it back.
///
/// That is the boundary this artifact sits on, not an omission. Proof-profile
/// verification is the admission engine's job (`engine/verification`), and the
/// on-chain path that carries `proofData` is `IProjectionSettlement`, which
/// this contract does not implement — it advertises `IRegisterProjection`
/// only. A deployment that needs admissions verified on chain must put a
/// verifier-backed settlement contract in front of this one, or hold the
/// authority key behind one; this contract will not do it for them.
///
/// `ProjectionSettlement` in this repository is that contract. It implements
/// `IProjectionSettlement`, holds the source authority, and verifies a bound
/// proof before every write it makes - the register's first entry included.
contract RegisterProjection is IRegisterProjection {
    error NotSourceAuthority();
    error RegisterIdInvalid();
    error EntryUnknown();
    error NoEntryAsOf();
    error VersionNotConsecutive();
    error EffectiveAtNotIncreasing();
    error CommitmentLinkBroken();
    error CommitmentReused();
    error CommitmentInvalid();
    error HolderInvalid();
    error AlreadyInitialized();

    bytes32 private immutable _registerId;
    address private immutable _sourceAuthority;

    mapping(uint256 => RegisterEntry[]) private _entries;
    /// Per token, never global: cross-token replay is a registrar or
    /// application concern and would need state the standard does not assume.
    mapping(uint256 => mapping(bytes32 => bool)) private _commitmentSeen;

    constructor(bytes32 registerIdentifier, address sourceAuthority) {
        if (registerIdentifier == bytes32(0)) revert RegisterIdInvalid();
        if (sourceAuthority == address(0)) revert NotSourceAuthority();
        _registerId = registerIdentifier;
        _sourceAuthority = sourceAuthority;
    }

    modifier onlySourceAuthority() {
        if (msg.sender != _sourceAuthority) revert NotSourceAuthority();
        _;
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IERC165).interfaceId
            || interfaceId == type(IRegisterProjection).interfaceId;
    }

    function registerId() external view returns (bytes32) {
        return _registerId;
    }

    function sourceAuthority() external view returns (address) {
        return _sourceAuthority;
    }

    /// @notice Invariant 1: the first entry is version 1 with a zero
    /// previousCommitment, and emits RegisterInitialized.
    function initialize(
        uint256 tokenId,
        bytes32 recordCommitment,
        bytes32 registryReference,
        address holder,
        uint64 effectiveAt
    ) external onlySourceAuthority {
        if (_entries[tokenId].length != 0) revert AlreadyInitialized();
        if (recordCommitment == bytes32(0)) revert CommitmentInvalid();
        if (holder == address(0)) revert HolderInvalid();

        _entries[tokenId].push(
            RegisterEntry({
                recordCommitment: recordCommitment,
                previousCommitment: bytes32(0),
                registryReference: registryReference,
                holder: holder,
                version: 1,
                effectiveAt: effectiveAt,
                supersededAt: 0
            })
        );
        _commitmentSeen[tokenId][recordCommitment] = true;
        emit RegisterInitialized(tokenId, recordCommitment, holder, 1, effectiveAt);
    }

    /// @notice Invariant 2: append version n+1, link the prior commitment, set
    /// the prior entry's supersededAt to this entry's effectiveAt, and emit
    /// RegisterSuperseded. The prior interval is closed by the register's own
    /// effective time, not by when the chain learned of the change.
    ///
    /// Takes no proof and verifies none. See the trust-model note on the
    /// contract: the caller being the source authority is the whole check.
    function admit(
        uint256 tokenId,
        bytes32 recordCommitment,
        bytes32 previousCommitment,
        bytes32 registryReference,
        address holder,
        uint64 effectiveAt
    ) external onlySourceAuthority {
        RegisterEntry[] storage list = _entries[tokenId];
        if (list.length == 0) revert EntryUnknown();
        if (recordCommitment == bytes32(0)) revert CommitmentInvalid();
        if (holder == address(0)) revert HolderInvalid();

        RegisterEntry storage previous = list[list.length - 1];
        if (previousCommitment != previous.recordCommitment) revert CommitmentLinkBroken();
        // Invariant 3: strictly increasing, so no instant has two answers.
        if (effectiveAt <= previous.effectiveAt) revert EffectiveAtNotIncreasing();
        // Invariant 4: a commitment is never reused inside one token.
        if (_commitmentSeen[tokenId][recordCommitment]) revert CommitmentReused();

        uint64 nextVersion = previous.version + 1;
        previous.supersededAt = effectiveAt;

        list.push(
            RegisterEntry({
                recordCommitment: recordCommitment,
                previousCommitment: previousCommitment,
                registryReference: registryReference,
                holder: holder,
                version: nextVersion,
                effectiveAt: effectiveAt,
                supersededAt: 0
            })
        );
        _commitmentSeen[tokenId][recordCommitment] = true;
        emit RegisterSuperseded(
            tokenId, nextVersion, recordCommitment, previousCommitment, holder, effectiveAt
        );
    }

    function entryCount(uint256 tokenId) external view returns (uint64) {
        return uint64(_entries[tokenId].length);
    }

    function currentEntry(uint256 tokenId) external view returns (RegisterEntry memory) {
        RegisterEntry[] storage list = _entries[tokenId];
        if (list.length == 0) revert EntryUnknown();
        return list[list.length - 1];
    }

    /// @notice Indexed by version. An unknown version reverts.
    function entryAt(uint256 tokenId, uint64 version) external view returns (RegisterEntry memory) {
        RegisterEntry[] storage list = _entries[tokenId];
        if (version == 0 || version > list.length) revert EntryUnknown();
        return list[version - 1];
    }

    /// @notice The entry whose effective interval contains the instant.
    /// Reverts for an instant preceding the first entry: the projection does
    /// not cover it.
    function entryAsOf(uint256 tokenId, uint64 instant) public view returns (RegisterEntry memory) {
        RegisterEntry[] storage list = _entries[tokenId];
        if (list.length == 0 || instant < list[0].effectiveAt) revert NoEntryAsOf();

        uint256 low;
        uint256 high = list.length - 1;
        while (low < high) {
            uint256 middle = (low + high + 1) / 2;
            if (list[middle].effectiveAt <= instant) low = middle;
            else high = middle - 1;
        }
        return list[low];
    }

    function holderAsOf(uint256 tokenId, uint64 instant) external view returns (address) {
        return entryAsOf(tokenId, instant).holder;
    }

    /// @notice Final if and only if the instant is at or after the first
    /// entry's effectiveAt and strictly before the latest entry's. Never
    /// reverts, including for an instant the projection does not cover.
    function isFinalAsOf(uint256 tokenId, uint64 instant) external view returns (bool) {
        RegisterEntry[] storage list = _entries[tokenId];
        if (list.length == 0) return false;
        return instant >= list[0].effectiveAt && instant < list[list.length - 1].effectiveAt;
    }
}
