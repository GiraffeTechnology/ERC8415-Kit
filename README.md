# ERC-8415 Native Infrastructure Kit (NIK)

Temporal projection infrastructure for [ERC-8415 — Asynchronous Register Projection for NFTs](https://github.com/GiraffeTechnology/ERC-8415).

**Positioning:** Infrastructure layer for ERC-8415 ecosystems.

ERC8415-Kit is not a wallet, application, marketplace, registry operator or legal adjudication system. It provides the projection, admission and query infrastructure consumed by applications and integration layers.

## Product Role

ERC-8415 separates two sequences:

- **tradeable position** — `ownerOf`, which changes with on-chain transfers;
- **confirmed holder** — the register projection, which changes only when an entry is admitted.

The Kit preserves this distinction.

Architecture boundary:

```
Application / Wallet
        |
        v
Oracle / Integration Layer
        |
        v
ERC8415-Kit
        |
        v
ERC-8415 Projection Contract
```

The Kit implements ERC-8415 infrastructure. Applications decide user experience, settlement policy and downstream actions.

## Current Implementation Status (2026-09-20)

The repository has progressed beyond a specification prototype and contains:

### Projection Core

- append-only projection history;
- consecutive versions;
- strictly increasing `effectiveAt`;
- commitment linkage;
- per-token commitment uniqueness;
- temporal queries:
  - `holderAsOf()`;
  - `entryAsOf()`;
  - `currentEntry()`;
  - `entryAt()`;
  - `entryCount()`;
  - `isFinalAsOf()`.

### Verification and Admission

Implemented:

- Merkle proof profile;
- Ed25519 attestation profile;
- mock zk proof profile;
- admission validation pipeline;
- proof replay and binding checks.

The Kit validates admission according to configured proof profiles. It does not judge the truth of the underlying external register.

### Infrastructure Components

Implemented:

- authenticated HTTP API;
- JavaScript and Python SDKs;
- institutional read-only console;
- API key and tenant isolation primitives;
- audit export primitives;
- metrics and operational boundaries;
- append-only file journal with replay support;
- Ethereum adapter;
- Solidity `RegisterProjection` reference implementation;
- conformance and on-chain test suites.

## ERC-8415 Semantic Boundary

The Kit MUST preserve:

```
ownerOf
    !=
confirmed holder
```

The Kit exposes facts, not conclusions:

- finality is not freshness;
- gap status is not rejection;
- proof verification is not legal validity;
- cancellation is not finality;
- timeout is not finality.

`isFinalAsOf()` follows the ERC-8415 later-admission rule:

```text
true
iff
there exists a later admitted entry
```

Finality is derived from history. It is not an operator-controlled lifecycle state.

## Implementation vs Production Status

### Implemented

- ERC-8415 projection semantics;
- temporal query layer;
- proof-profile admission model;
- reference contract;
- SDK and API surfaces;
- local EVM/on-chain-style verification tests.

### Remaining Production Validation

The following are not claimed as completed:

- live public network production deployment;
- independent registrar operation;
- production proof verifier deployment;
- operational recovery evidence under production load;
- institutional source integration.

Code completion does not equal production delivery.

## Settlement Boundary

The Kit provides settlement-related primitives and supports application settlement patterns, but does not impose a settlement model.

Applications may implement:

- escrow;
- timeout handling;
- refund logic;
- transaction workflows.

Those remain application-layer decisions.

## Verification

```sh
npm ci
npm run verify
```

Verification includes:

- TypeScript checks;
- semantic tests;
- API tests;
- SDK tests;
- on-chain contract tests.

Test success validates implementation behaviour. It does not prove production readiness or live deployment.

## Responsibility Boundary

ERC8415-Kit is:

- projection infrastructure;
- admission infrastructure;
- temporal query infrastructure;
- ecosystem integration infrastructure.

ERC8415-Kit is NOT:

- a wallet;
- ArtFi or any vertical application;
- a marketplace;
- a generic RWA registry;
- a legal title authority;
- a financial product.

## Interfaces

```text
IRegisterProjection
0x6309e170

IProjectionSettlement
0xf4a7d71b
```

The ERC-8415 standard and semantic model remain the source of truth.

## License

[CC0 1.0 Universal (CC0-1.0)](LICENSE).
