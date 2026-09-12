// SPDX-License-Identifier: CC0-1.0
pragma solidity ^0.8.20;

/// @notice Kit workflow ledger. This is NOT an ERC-8415 projection or token.
/// Projection settlement is separately verified by RegisterProjectionReference.
contract KitLifecycle {
    enum State { NONE, REGISTERED, VERIFIED, ACTIVE, TRANSFERRED, SETTLED, REVOKED }
    struct Asset { bytes32 holder; State state; bool frozen; uint64 version; }
    address public immutable operator;
    mapping(bytes32 => Asset) public assets;
    event AssetChanged(bytes32 indexed id, uint64 version, State state, bytes32 holder, bool frozen);
    error Unauthorized();
    error InvalidCommand();

    constructor() { operator = msg.sender; }
    modifier onlyOperator() { if (msg.sender != operator) revert Unauthorized(); _; }

    function registerAsset(bytes32 id, bytes32 holder) external onlyOperator {
        if (id == bytes32(0) || holder == bytes32(0) || assets[id].version != 0) revert InvalidCommand();
        assets[id] = Asset(holder, State.REGISTERED, false, 1);
        _emit(id);
    }
    function updateState(bytes32 id, uint64 version, State next, bytes32 holder) external onlyOperator {
        Asset storage a = _check(id, version);
        if (a.frozen) revert InvalidCommand();
        bool valid = (a.state == State.REGISTERED && next == State.VERIFIED)
            || (a.state == State.VERIFIED && next == State.ACTIVE)
            || (a.state == State.ACTIVE && next == State.TRANSFERRED)
            || (a.state == State.TRANSFERRED && next == State.ACTIVE);
        if (!valid || holder == bytes32(0)) revert InvalidCommand();
        if (next != State.TRANSFERRED && holder != a.holder) revert InvalidCommand();
        if (next == State.TRANSFERRED && holder == a.holder) revert InvalidCommand();
        a.state = next;
        a.holder = holder;
        ++a.version;
        _emit(id);
    }
    function freezeAsset(bytes32 id, uint64 version) external onlyOperator {
        Asset storage a = _check(id, version);
        if (a.frozen) revert InvalidCommand();
        a.frozen = true;
        ++a.version;
        _emit(id);
    }
    function revokeAsset(bytes32 id, uint64 version) external onlyOperator {
        Asset storage a = _check(id, version);
        a.state = State.REVOKED;
        ++a.version;
        _emit(id);
    }
    function settleAsset(bytes32 id, uint64 version) external onlyOperator {
        Asset storage a = _check(id, version);
        if (a.frozen || (a.state != State.ACTIVE && a.state != State.TRANSFERRED))
            revert InvalidCommand();
        a.state = State.SETTLED;
        ++a.version;
        _emit(id);
    }
    function _check(bytes32 id, uint64 version) private view returns (Asset storage a) {
        a = assets[id];
        if (a.version == 0 || a.version != version || a.state == State.SETTLED
            || a.state == State.REVOKED) revert InvalidCommand();
    }
    function _emit(bytes32 id) private {
        Asset storage a = assets[id];
        emit AssetChanged(id, a.version, a.state, a.holder, a.frozen);
    }
}
