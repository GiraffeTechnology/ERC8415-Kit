# ERC-8415 Native Infrastructure Kit (NIK)

Reference components, APIs and runnable examples for **ERC-8415: Asynchronous Register Projection for NFTs**. The Kit records an external register's confirmed-holder history and exposes temporal queries for applications, wallets and integration layers.

**Standard status (2026-10-04): Draft.** The [upstream proposal, ethereum/ERCs#2006](https://github.com/ethereum/ERCs/pull/2006), is open and has not been merged. This repository is an implementation toolkit; its tests are not a certification of full conformance or production readiness. The [proposal text at the reviewed revision](https://github.com/GiraffeTechnology/ERCs/blob/12e68aee54c6f94f6910d4db42f1d5677b506de1/ERCS/erc-8415.md) defines the semantics; the [separate reference repository](https://github.com/GiraffeTechnology/ERC-8415) contains additional reference material.

## Quick start

Requirements: **Node.js 22.18 or newer**, npm and Python 3 for the Python SDK checks. CI runs on Node 22 and 24. Hardhat downloads Solidity 0.8.28 on first use, so that run needs access to the compiler host.

```sh
git clone https://github.com/GiraffeTechnology/ERC8415-Kit.git
cd ERC8415-Kit
npm ci
npm run verify
```

`verify` runs TypeScript checks, the Node suite with an 80% line/branch/function coverage gate, and the local-EVM contract suite. No wallet, external RPC endpoint, testnet funds or private key is needed.

To run only the record-date consumer example after installing dependencies:

```sh
npm run test:onchain -- tests/onchain/recordDateClaim.onchain.cjs
```

The four tests deploy the components to Hardhat's in-process EVM and exercise real local transactions. They are the quickest way to see the read-then-act pattern below.

## Example: a record-date payment

[`RecordDateClaim.sol`](contracts/examples/RecordDateClaim.sol) is a minimal, non-normative CC0 consumer for a dividend-style record-date payment. Each deployment is funded for one token, one record date and one native-currency payout. The caller must be the recorded holder at that date, and the claim can succeed only once.

Within the claim transaction, it checks:

1. `isFinalAsOf(tokenId, recordDate)` is true.
2. `holderAsOf(tokenId, recordDate)` is the caller.
3. `openGapOf(tokenId)` is zero. This extra refusal policy belongs to the example; an open gap does not make a historical instant non-final.

It records the claim before the external payout call. This is an integration example, not a complete dividend distribution or escrow system.

The [executable walkthrough](tests/onchain/recordDateClaim.onchain.cjs) uses effective times `1000`, `1500` and `2000`:

- An initial entry names Alice at `1000`; the record date `1500` is covered but provisional.
- A confirming entry naming Alice again, effective at `2000`, makes `1500` final. Alice can claim once while no gap is open; Bob cannot.
- A later entry naming Bob does not change Alice's already-final record-date answer.
- An entry effective exactly at `1500` does **not** make `1500` final.
- If a gap opens earlier in the same block as the claim, the claim sees it and refuses, even though historical finality remains true.

The register's `effectiveAt`, the application's record date and the block in which an entry is admitted are different times. The example resolves the record date against admitted effective-time history, not against the admission timestamp or current ERC-721 owner.

## Core semantics

ERC-8415 keeps two sequences distinct:

- **Tradeable position:** `ownerOf` changes with ERC-721 transfers.
- **Confirmed holder:** `holderAsOf(tokenId, t)` reads the holder reported by the external register for effective time `t`, as recorded in the projection.

The Kit never substitutes `ownerOf` for a historical holder. Record agreement does not establish legal title or prove that both records refer to the same underlying right.

For a token with admitted entries, the exact temporal finality rule is:

```text
isFinalAsOf(tokenId, t) == true
iff firstEntry.effectiveAt <= t < latestEntry.effectiveAt
```

A later entry may confirm the same holder. The latest interval remains provisional until an entry effective strictly after the queried instant is admitted. Before the first entry, `holderAsOf` and `entryAsOf` revert; `isFinalAsOf` returns false.

Keep these signals separate:

- **Final / provisional:** derived from admitted effective-time history.
- **Open / closed gap:** whether a settlement change is in flight; `openedAt` locates its start.
- **Freshness / reorg safety:** optional information with separate trust and timing assumptions.

Proof verification, gap closure, cancellation, timeout expiry and block confirmation depth do not themselves establish historical finality. Cancellation leaves admitted history unchanged. A registrar that stops issuing entries can leave recent instants provisional indefinitely.

### Read and act in one transaction

For an action that depends on projection state, read and validate the required conditions **inside the same transaction as that action**. Earlier RPC or HTTP reads are suitable for display, but may be stale when a transaction executes. Two separate transactions in the same block do not close this window.

Applications choose whether to wait for finality, decline while a gap is open or accept a provisional answer. Escrow, refunds, timeouts and downstream unwinding remain application policies. Neither opening a gap nor cancelling one freezes or reverses ERC-721 transfers.

## What is implemented

### Projection and admission

- Append-only entry history with consecutive versions, strictly increasing `effectiveAt`, commitment linkage and per-token commitment uniqueness.
- `registerId`, `holderAsOf`, `entryAsOf`, `isFinalAsOf`, `currentEntry`, `entryAt` and `entryCount`.
- A TypeScript admission pipeline with proof binding, replay protection and remote-height checks.
- TypeScript Merkle and Ed25519 attestation profiles, plus a **mock zk profile** for testing.
- Solidity projection and optional settlement components, with a pluggable `ISettlementProofVerifier` and an example EIP-191/secp256k1 attestation verifier. This on-chain verifier is distinct from the TypeScript Ed25519 profile.

### API and operational components

- An authenticated [HTTP API](api/README.md) with temporal reads and an admission endpoint.
- [JavaScript and Python SDKs](sdk/README.md) for read-only API consumption. They do not submit on-chain transactions. `resolve` returns holder, finality and gap from one server snapshot; it does not guarantee the state of a later transaction.
- A read-only [console](console/README.md), API-key/RBAC and tenant-isolation primitives, metrics and audit export.
- An [append-only file journal and replay support](engine/persistence/README.md).
- An [Ethereum adapter](adapters/README.md) that reads a configured application's SHA-256 admission-tree root at a canonical finalized block. It trusts the configured RPC, does not independently verify Ethereum state proofs and must be refreshed by its caller.
- Shared [semantic vectors](conformance/projection-vectors.json), Node tests and local-EVM tests.

The repository is source-distributed (`private: true` in `package.json`); the quick start uses a checkout rather than a published npm SDK package.

## Contract assembly and compatibility

The draft defines two discoverable surfaces:

```text
IRegisterProjection     0x6309e170
IProjectionSettlement   0xf4a7d71b
```

The Kit currently supplies separate components:

- [`RegisterProjection`](contracts/RegisterProjection.sol) stores and queries history and advertises the projection interface. Its writes are authority-gated; it does not verify proofs itself.
- [`ProjectionSettlement`](contracts/ProjectionSettlement.sol) advertises the settlement interface and holds the projection's source authority in the tested assembly. It verifies a bound proof before initialization or admission, opens gaps and closes them by admission or cancellation. Settlement authority is separate from token ownership.
- [`RecordDateClaim`](contracts/examples/RecordDateClaim.sol) receives the projection and settlement addresses separately. Its [test setup](tests/onchain/recordDateClaim.onchain.cjs) shows the wiring and verifier configuration.

These contracts do not provide an ERC-721 implementation or a single-address ERC-721/projection/settlement composition. The draft's settlement-conformance level includes projection conformance; advertising an interface on one component does not establish conformance of the whole deployed asset. Integrators must check the composed address surfaces, token-existence behavior, authority and proof profile against the draft before claiming conformance.

Important limits when comparing this assembly with the [reviewed draft](https://github.com/GiraffeTechnology/ERCs/blob/12e68aee54c6f94f6910d4db42f1d5677b506de1/ERCS/erc-8415.md):

- The example on-chain verifier checks an attestor signature over the admission binding. The Solidity path has no consumed remote-height tracking and does not independently verify remote membership or finality. It does not implement the draft's complete settlement-proof requirements; the TypeScript pipeline's checks do not supply those checks on chain.
- The component rejects a second open gap with `GapAlreadyOpen`. The draft permits a profile to forbid supersession where its register cannot absorb it; an integration must make that policy explicit.
- `settlement(unknownId)` returns the zero-value `NONE` record, whereas the draft requires a revert. This is a known compatibility difference.

The current test suite is evidence for the behavior it exercises, not an exhaustive draft-conformance check.

## Trust and production boundaries

The Kit provides projection, admission and query infrastructure. Applications decide the user experience, settlement policy and downstream actions. It is not a wallet, marketplace, registry operator, legal title authority or financial product.

- Accepted proof evidence does not prove the truth or legal validity of the underlying register. Consumers must accept the configured source authority, verifier and profile assumptions.
- Commitment uniqueness is per token. Cross-token uniqueness of commitments or registry references, and continuity across tokens, are registrar or application responsibilities.
- The chain carries commitments and reference locators, not the register's underlying records. Commitments and public transaction data still require privacy review.
- The optional watchtower/freshness guidance is not a watchtower implementation delivered or tested by this Kit. Freshness and reorg safety must not be inferred from `isFinalAsOf`.

The following are **not claimed as completed**: live public-network production deployment, independent registrar operation, a production proof-verifier deployment, recovery under production load or institutional source integration. Local test success is not a security audit or a production-readiness guarantee.

## Reproducible verification

Baseline checked on **2026-10-04**: Kit commit [`93035d2`](https://github.com/GiraffeTechnology/ERC8415-Kit/commit/93035d2c1384dbb6b974a9680326fbff623c2d9b). Its [CI run on Node 22 and 24](https://github.com/GiraffeTechnology/ERC8415-Kit/actions/runs/37026227378) passed type checking, **169 Node tests** with the coverage gate, and **32 local-EVM tests**, including the four record-date tests. These are suite counts for that revision, not counts of external integrations.

To reproduce that baseline in a fresh checkout:

```sh
git checkout 93035d2c1384dbb6b974a9680326fbff623c2d9b
npm ci
npm run verify
```

Individual checks:

```sh
npm run typecheck
npm run coverage
npm run test:onchain
python3 sdk/python/test_client.py
```

The tests cover historical query boundaries, same-holder confirming entries, proof binding and failures, cancellation without finality, transfer/projection separation and the consumer's same-block gap case. The [test-to-implementation evidence map](docs/DELIVERY-EVIDENCE.md) provides historical component evidence; some stage descriptions and suite counts refer to earlier revisions. Use the pinned baseline above for the current verification summary.

## Documentation and contributions

- [Semantic model](docs/ERC8415-SEMANTIC-MODEL.md) and [gap semantics](docs/GAP-SEMANTICS.md)
- [API](api/README.md), [SDKs](sdk/README.md) and [development commands](docs/DEVELOPMENT.md)
- [ERC-8415 discussion](https://ethereum-magicians.org/t/erc-8415-asynchronous-register-projection-for-nfts/29634) and [Kit discussion](https://ethereum-magicians.org/t/erc8415-kit-reference-implementation-now-public-cc0/29724)

Thanks to [babyblueviper1](https://github.com/babyblueviper1) for the record-date consumer contribution in [PR #14](https://github.com/GiraffeTechnology/ERC8415-Kit/pull/14). Reproductions and integration reports are welcome: include the commit, runtime versions, command, expected result and observed result so others can rerun the case.

## License

[CC0 1.0 Universal (CC0-1.0)](LICENSE).
