// SPDX-License-Identifier: CC0-1.0
pragma solidity ^0.8.20;

/// @title The proof port a settlement contract verifies admissions through.
/// @notice NOT part of ERC-8415. The standard names a verification profile and
/// leaves its contents to the profile; this is the Kit's on-chain form of that
/// separation, mirroring `engine/proof/profile.ts`.
///
/// A verifier decides one thing: whether this evidence may admit this entry.
/// It MUST NOT decide finality. A `true` verdict means the entry enters
/// history; whether any instant is final is computed from that history
/// afterwards, by the later-admission rule and by nothing else.
interface ISettlementProofVerifier {
    /// @notice The profile identity a settlement contract advertises as its
    /// `verificationProfile()`.
    function profileId() external view returns (bytes32 identifier);

    /// @param bindingDigest What this proof is allowed to admit, and nothing
    /// else. The settlement contract computes it; the verifier never
    /// reconstructs it, so a verifier cannot widen its own mandate.
    function verifyAdmission(bytes32 bindingDigest, bytes calldata proofData)
        external view returns (bool admitted);
}
