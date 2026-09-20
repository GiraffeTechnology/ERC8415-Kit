# ERC-8415 Native Infrastructure Kit (NIK)

Temporal projection infrastructure for [ERC-8415 — Asynchronous Register Projection for NFTs](https://github.com/GiraffeTechnology/ERC-8415).

**Positioning:** Stripe API + AWS SDK for ERC-8415 native assets.

## Why this exists

An ERC-721 can trade faster than an external register updates. `ownerOf` answers who holds the tradeable position now; it does not answer who the register had confirmed at a past instant.

ERC-8415 keeps those sequences apart:

- **tradeable position** — `ownerOf`, which moves with the market;
- **confirmed holder** — the register's record, which moves when a proof admits an entry.

The Kit records the projection, preserves its history, and answers temporal queries. It does not adjudicate legal title or prescribe settlement remedies.

## Core semantics

- Entries are append-only per token, with consecutive versions, strictly increasing `effectiveAt`, commitment linkage and per-token commitment uniqueness.
- `holderAsOf(tokenId, instant)` returns the confirmed holder only.
- `isFinalAsOf(tokenId, instant)` is derived from the later-admission rule: an interval becomes final only when a later entry is admitted.
- An open or closed gap, cancellation, proof verification and timeout expiry do not create finality.
- Opening a gap does not freeze ERC-721 transfers. Settlement authority is separate from token ownership.
- The Kit records commitments and registry locators, never register contents.

The optional watchtower freshness layer is separate from projection finality; see [the semantic model](docs/ERC8415-SEMANTIC-MODEL.md).

## What is implemented

The current repository contains:

1. an in-process TypeScript projection kernel and admission store;
2. Merkle, Ed25519 attestation and explicitly mock zk proof profiles;
3. in-process settlement gap primitives;
4. authenticated HTTP API and JavaScript/Python SDKs;
5. a read-only institutional console with role checks;
6. an Ethereum read adapter and fake-RPC conformance tests;
7. audit export, API-key, tenant-isolation and metrics primitives;
8. deployable `RegisterProjection` and `ProjectionSettlement` contracts, with
   an attestation proof verifier behind a pluggable verification port;
9. semantic, API, SDK, console, settlement, adapter, Solidity interface and
   on-chain tests.

The Solidity tree carries the frozen ERC-8415 interfaces, selector helpers and
concrete implementations of both of them. The chain they are exercised on is
in-process; no live network deployment exists.

## Stage delivery status

| Stage | Verified implementation | Remaining acceptance work | Status |
| --- | --- | --- | --- |
| 0 Foundation | Repository layout, Docker files, CI and structure tests | Container execution was not rerun for the current corrections | Foundation present |
| 1 Projection Core | In-process kernel/store, temporal API, 20 mandatory semantic tests, and a file-backed append-only journal with replay and crash recovery | Deployed runtime; the journal is not exercised against a database or under concurrent writers | In-process complete; persistence journal-backed |
| 2 Verification Engine | Merkle, Ed25519 and mock zk profiles with binding/replay checks | Production succinct verifier | Test profiles complete |
| 3 ERC-8415 Adapter | Frozen interfaces, ABI/selector checks, fake-RPC reader, application-root adapter, and a deployed `RegisterProjection` driven by real transactions with events verified from receipts and the log index | Live-network deployment and Ethereum MPT proof verification | On-chain complete in-process; no live network |
| 4 Settlement MVP | In-process open/admit/cancel workflow, authority and deadline rules, and a deployed `ProjectionSettlement` that is the register's sole writer, verifying a signed admission binding on chain | Live-network deployment; a succinct verifier behind the same proof port | On-chain complete in-process; no live network |
| 5 Oracle/Application SDK | Authenticated JS/Python clients, pagination, uint64 handling and separate temporal signals | Same-transaction on-chain reads remain an integration responsibility | Code complete |
| 6 Institutional Console | Read-only views, roles, timeline, authentication callback and output escaping | Deployed session provider/login flow and deployed acceptance | Code complete; deployment evidence missing |
| 7 Production Infrastructure | API-key hashing, tenant isolation, refusal metrics, audit export primitives, and journal-based durable persistence | Operational deployment, recovery evidence from a real restart under load, and measured 80% coverage | Primitives only |

The complete Stage 0–7 delivery gate is therefore **not complete**. This conclusion is based on the stage PRD, the source tree, tests, CI configuration and delivery evidence, not on README text alone.

## Verification

Run locally:

```sh
npm ci
npm run verify
python3 -B sdk/python/test_client.py
```

The verification run observed for this tree reports 161 passing in-process
Node tests and 26 passing on-chain tests, covering the mandatory conformance
suite, Solidity ABI checks, authenticated loopback coverage, the journal's
restart and crash-recovery cases, the deployed projection and settlement
contracts, and the Python SDK suite. CI runs the same `npm ci`, typecheck,
Node tests and on-chain tests on Node 22 and Node 24. CI success verifies the
test pipeline, not deployment, live-chain or production-readiness gates.

The acceptance plan additionally requires:

- unit coverage of at least 80%;
- an integration run from register identity through proof verification, admission, temporal query, gap close and audit;
- a chain run of deploy contract → execute transaction → verify event, which
  `npm run test:onchain` performs against an in-process EVM but not a live
  network;
- deployment and recovery evidence.

Those items remain outstanding. See [DELIVERY-EVIDENCE.md](docs/DELIVERY-EVIDENCE.md) and [FINAL-DELIVERY-REPORT.md](FINAL-DELIVERY-REPORT.md).

## Responsibility boundary

The Kit is not a wallet, frontend, marketplace, new blockchain standard, generic RWA registry or legal adjudicator. Applications decide escrow, cancellation, timeout, refund and downstream unwinding policies.

Frozen interface identifiers:

```text
IRegisterProjection     0x6309e170
IProjectionSettlement   0xf4a7d71b
```

The specification and semantic rules are defined by [AGENTS.md](AGENTS.md), [the product PRD](docs/ERC8415-Native-Infrastructure-Kit-PRD-v2.1.md), [the stage delivery PRD](docs/ERC-8415-Native-Infrastructure-Kit-PRD-Stage-Delivery-v2.0.md) and [the semantic model](docs/ERC8415-SEMANTIC-MODEL.md).

## License

[CC0 1.0 Universal (CC0-1.0)](LICENSE). Third-party components retain their respective licenses.
