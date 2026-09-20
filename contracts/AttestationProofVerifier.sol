// SPDX-License-Identifier: CC0-1.0
pragma solidity ^0.8.20;

import {ISettlementProofVerifier} from "./ISettlementProofVerifier.sol";

/// @title A verifier that admits on a named attestor's signature over the binding.
/// @notice The on-chain counterpart of the Kit's attestation proof profile:
/// the weakest profile that is still a real one, so the settlement path can be
/// deployed and exercised end to end without a succinct verifier.
///
/// The attestor signs the binding digest and nothing else. Because the
/// settlement contract computes that digest from the settlement's own record,
/// a signature produced for one chain, contract, token, settlement, holder,
/// commitment pair, version or effective time cannot be replayed against
/// another one.
contract AttestationProofVerifier is ISettlementProofVerifier {
    bytes32 private immutable _profileId;
    address private immutable _attestor;

    error AttestorInvalid();

    constructor(bytes32 profileIdentifier, address signer) {
        if (signer == address(0)) revert AttestorInvalid();
        _profileId = profileIdentifier;
        _attestor = signer;
    }

    function profileId() external view returns (bytes32) {
        return _profileId;
    }

    function attestor() external view returns (address) {
        return _attestor;
    }

    /// @notice Recovers the signer of `proofData` over the EIP-191 personal
    /// message form of the digest and compares it with the attestor.
    ///
    /// A malformed signature refuses rather than reverts: refusal is the
    /// verifier's ordinary answer, and the settlement contract turns it into
    /// the error the caller sees. `ecrecover` returns the zero address for an
    /// unrecoverable signature, which the constructor has already excluded
    /// from being the attestor.
    function verifyAdmission(bytes32 bindingDigest, bytes calldata proofData)
        external view returns (bool)
    {
        if (proofData.length != 65) return false;

        bytes32 r = bytes32(proofData[0:32]);
        bytes32 s = bytes32(proofData[32:64]);
        uint8 v = uint8(proofData[64]);
        if (v < 27) v += 27;

        // Reject the upper half of the curve order, so one attestation has one
        // encoding and a relayer cannot mint a second distinct signature for
        // the same admission.
        if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) {
            return false;
        }
        if (v != 27 && v != 28) return false;

        bytes32 message = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", bindingDigest)
        );
        return ecrecover(message, v, r, s) == _attestor;
    }
}
