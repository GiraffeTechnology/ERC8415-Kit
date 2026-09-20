# Delivery Report

ERC-8415 Native Infrastructure Kit: implemented components and outstanding
Stage 0–7 acceptance. This is not a claim that every stage is delivered.

## Architecture and implemented scope

JS/Python SDKs read through the authenticated HTTP gateway, which selects one
tenant's in-process projection store. The console uses a required authentication
callback and enforces directory roles. Admission verifies a configured proof
profile before appending an entry and closing an associated gap.

| Stage | Implemented | Remaining evidence or integration |
| --- | --- | --- |
| 0 Foundation | repository layout, development container, CI configuration | container execution was not rerun for these corrections |
| 1 Projection core | in-memory append-only kernel, temporal queries, admission API | durable deployment is outside the current implementation |
| 2 Verification | Merkle, Ed25519 attestation and explicitly mock zk profiles; pinned verifier and snapshot binding | production succinct verifier remains absent |
| 3 Adapter | frozen interfaces, ABI/selector checks, RPC reader and application-root adapter | concrete deployed contracts, transaction submission, receipt/event monitoring and deploy → transact → verify-event acceptance |
| 4 Settlement | authority, bounded deadlines, initiator-only cancellation after expiry | on-chain execution is part of outstanding Stage 3 work |
| 5 SDK | authenticated JS/Python clients, atomic server resolution and full pagination | HTTP snapshots do not replace same-transaction on-chain reads |
| 6 Console | authenticated transport boundary, role-gated views and timeline | session provider/login integration and deployed acceptance |
| 7 Infrastructure | tenant keys, isolation, metrics and audit export primitives | durable storage, deployment and recovery evidence |

## PR #8 corrections

Nine implementation corrections are committed separately: cancellation rules,
profile pinning, snapshot binding, API authentication, console authentication,
application-root reads, SDK resolution consistency, history pagination and
uint256 token identifiers. A separate documentation commit corrects interface
signatures, examples and delivery claims.

Profile registration now explicitly maps a bytes32 verification identity to one
verifier. Stores capture that mapping at construction. Proof producers must use
`erc8415/admission/v2`, which includes the open settlement's stored snapshot or
zero for projection-only admission. Existing v1 proofs must be regenerated.

`createApi` requires gateway options; clients supply a tenant API key. Both
default SDK transports refuse redirects. `createConsole` requires a credential
or session verifier and has no identity-header fallback. Setup is documented in
`api/README.md`, `console/README.md` and `sdk/README.md`.

`EthereumChainAdapter` requires an application-root contract and getter calldata.
It reads a SHA-256 admission-tree root at a canonical finalized block hash,
trusting the configured RPC. It does not interpret Ethereum's block state root
as this application tree or independently verify MPT/storage proofs.

## Verification

```sh
npm ci
npm run verify                     # typecheck + 161 Node tests + 26 on-chain tests
python3 -B sdk/python/test_client.py # standalone Python checks
```

Local validation used Node 24. Tests include authenticated HTTP integration,
both SDKs reading 205-entry histories, uint256 identifiers, proof binding,
settlement deadline boundaries, Solidity compilation and conformance vectors.
The configured CI matrix also runs Node 22; its result must be checked on the PR.

Independent read-only review of the six security boundary corrections found
no concrete remaining bypass; its SDK quickstart credential omission was fixed.
Focused regression tests and valid admission/read controls pass. The detailed
mapping is in `docs/DELIVERY-EVIDENCE.md`.

## Limits and outstanding work

The zk profile is a mock, and the read adapter is still exercised against a
fake RPC node.

A deployed EVM transaction and event flow is validated. `RegisterProjection` is
deployed, `ProjectionSettlement` is deployed as its sole writer, gaps are
opened, closed and cancelled by mined transactions, admission proofs are
signatures recovered on chain, and events are read back both from receipts and
from the chain's log index. That closes the deployed-contract,
transaction-submission and event-verification gaps for both frozen interfaces.

Stores are no longer only in-process: the projection is backed by an
append-only journal, `fsync`ed on every append and replayed on open. It is a
single-process file, so a database-backed store and concurrent-writer safety
are not covered.

Still outstanding: any live network, so gas economics, reorg behaviour and a
real registrar's operations are unexercised; a succinct verifier behind the
proof port; a console session provider behind the injected `authenticate`
port; a container run; recovery evidence from a real restart under load; and
the plan's 80% coverage target, which has not been measured. These gaps remain
acceptance work; passing unit tests and an in-process chain do not establish
production delivery.

No runtime dependencies were added. TypeScript, Node types, solc,
ethereum-cryptography and, for the on-chain suite only, hardhat and ethers
remain development dependencies. Finality continues to be
the later-admission rule; cancellation changes no projection history.
