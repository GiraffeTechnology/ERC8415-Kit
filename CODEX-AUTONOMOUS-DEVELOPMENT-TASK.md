# ERC-8415 Native Infrastructure Kit
# Autonomous Development Task Specification

Version: v2.0

Repository: ~/ERC8415-Kit

> Revised. The v1.0 text of this document specified a mutable institutional
> asset registry — a `REGISTERED -> ... -> REVOKED` state machine, freeze and
> revoke authority, and a stored finality record. Those instructions conflicted
> with the ERC-8415 standard and with the discussion-thread consensus, and are
> void. Per the conflict-resolution rule in AGENTS.md, the sections below have
> been brought into line with the projection semantics. Execution rules,
> testing, git and delivery requirements are unchanged.

## Mission

You are the primary engineering agent responsible for completing the ERC-8415 Native Infrastructure Kit.

Build temporal projection infrastructure based on ERC-8415, consumed by
institutional systems through API and SDK.

Final architecture:

```
Institution
    |
API / SDK
    |
ERC-8415 Native Infrastructure Kit
    |
Verification Engine
    |
Blockchain Adapter
    |
Ethereum / L2 / Permissioned Chain
    |
Institutional Console
```

The final system must support the complete admission and query path:

```
Register identity
 -> Evidence
 -> Proof Profile
 -> Admission
 -> Append-only projection entry
 -> Temporal query
 -> Audit
```

There is no mutable asset lifecycle. An entry is admitted or it is not; admitted
history is append-only, and finality is derived from it.

---

# Authority Documents

Product authority, in precedence order:

- the ERC-8415 standard text;
- the consensus reached in the public discussion thread;
- AGENTS.md;
- docs/ERC8415-Native-Infrastructure-Kit-PRD-v2.1.md;
- docs/ERC-8415-Native-Infrastructure-Kit-PRD-Stage-Delivery-v2.0.md;
- docs/ERC8415-SEMANTIC-MODEL.md;
- README.md.

`docs/ERC8415-Native-Infrastructure-Kit-PRD-Stage-Delivery-v1.0.md` is
superseded and carries no authority.

Do not redefine product scope without an Architecture Change Request.

---

# P0 Engineering Rules

## Product Boundary

ERC-8415 Native Infrastructure Kit is:

- Projection Kernel and temporal query infrastructure
- Admission Engine and proof-profile verification
- Blockchain Adapter
- Audit Infrastructure
- SDK Platform

It is NOT:

- a generic RWA or institutional asset registry
- NFT marketplace
- Wallet
- Token exchange
- DeFi protocol
- an adjudicator of legal title, entitlement or remedy

## Architecture Rule

All operations must follow:

```
API
 |
Verification Engine
 |
State Machine
 |
Adapter Layer
 |
Blockchain
 |
Audit Layer
```

Frontend must never directly interact with blockchain.

---

# Autonomous Execution Rules

You are authorized to:

- create files
- implement code
- install dependencies
- write tests
- update documentation
- run local environments
- fix bugs

You must not:

- delete approved architecture
- bypass tests
- remove security controls
- expand into unrelated products

---

# Development Strategy

Execute sequentially:

```
Stage 0 Foundation
 |
Stage 1 ERC-8415 Projection Core
 |
Stage 2 Verification Engine
 |
Stage 3 ERC-8415 Adapter
 |
Stage 4 Settlement Composition Engine MVP
 |
Stage 5 Oracle / Application SDK
 |
Stage 6 Institutional Console
 |
Stage 7 Production Infrastructure
```

This is the canonical stage plan, matching the Stage Delivery PRD.

Each stage must produce:

- Code
- Tests
- Documentation
- Delivery Report

---

# Stage Requirements

## Stage 0 Foundation

Create:

```
api/
engine/
adapters/
contracts/
dashboard/
sdk/
tests/
docker/
```

Deliver:

- development environment
- CI configuration
- architecture documentation

---

## Stage 1 ERC-8415 Projection Core

Implement:

Storage:

- register identity
- append-only projection entries
- gap records

API:

```
GET /projection/{id}/entry/as-of/{instant}
GET /projection/{id}/holder/as-of/{instant}
GET /projection/{id}/finality/as-of/{instant}
GET /projection/{id}/entries
POST /projection/{id}/admission
```

Admission endpoints MUST validate schema, version, effectiveAt, commitment
linkage and proof profile before append-only persistence. No endpoint mutates
or deletes an admitted entry, and none writes finality.

Acceptance:

Admission and temporal queries run without a live chain using a mock adapter,
including the exact later-admission finality rule and a confirming entry that
finalises an interval without changing the holder.

---

## Stage 2 Verification Engine

Implement:

- proof verification behind a proof-profile interface;
- admission evaluation;
- derived finality queries.

There is no mutable asset state machine. The only admitted transition is
evidence becoming an entry:

```
Evidence
 -> Proof Profile
 -> Admission Evaluation
 -> Projection Entry
```

A proof profile decides admission validity and MUST NOT set finality. Finality
is computed from admitted history on query, never stored as a flag. Invalid
admissions must fail: non-consecutive versions, equal or backwards effectiveAt,
broken commitment linkage, failed proofs and replays.

---

## Stage 3 ERC-8415 Adapter

Implement:

- Solidity contract
- Ethereum adapter
- transaction monitoring

Contract surface, per the frozen interfaces `IRegisterProjection`
(`0x6309e170`) and `IProjectionSettlement` (`0xf4a7d71b`):

```
holderAsOf()
entryAsOf()
isFinalAsOf()
currentEntry() / entryAt() / entryCount()
registerId()
openGapOf() / openedAt()
beginSettlement() / finalizeSettlement() / cancelSettlement()
```

No freeze, revoke, override or rollback function exists. Opening a gap MUST NOT
block ERC-721 transfers, and settlement authority is separate from token
ownership.

---

## Stage 4 Settlement Composition Engine MVP

Implement gap primitives consumed by Oracle and applications:

- open a gap;
- close a gap by admission;
- close a gap by cancellation, leaving provisional history provisional.

Prove the invariants: cancellation, gap closure, proof verification and timeout
expiry each fail to produce finality.

---

## Stage 5 Oracle / Application SDK

Implement:

JavaScript SDK:

```
@erc8415/sdk
```

Python SDK:

```
erc8415
```

Provide examples and API documentation.

---

## Stage 6 Institutional Console

Implement:

- login
- projection overview, showing the tradeable position and the confirmed holder
  as separate facts;
- audit timeline over admitted entries and gap transitions;
- permission management.

Users must read a projection without Web3 knowledge. The console MUST NOT merge
final/provisional, open/closed gap and freshness into a single status, and MUST
NOT display register contents — the chain carries a commitment and a locator,
never the record.

---

## Stage 7 Production Infrastructure

Implement:

- API Key management
- RBAC
- multi tenant support
- monitoring
- audit export

---

# Testing Requirements

Mandatory:

## Unit Tests

Minimum 80% coverage.

## Integration Test

Required flow:

```
Register identity
 -> Verify Proof
 -> Admit Entry
 -> Temporal Query
 -> Gap open / close
 -> Audit
```

Negative cases are mandatory: current ERC-721 ownership must never rewrite a
historical projection answer; a closed gap over a non-final instant; a cancelled
settlement; and an instant preceding the first entry.

## Blockchain Test

Required:

```
Deploy Contract
 -> Execute Transaction
 -> Verify Event
```

---

# Git Rules

Every stage:

- create implementation branch
- commit changes
- run tests
- generate report
- submit PR

Never push directly to main.

Commit format:

```
feat(stage1): implement projection core api
feat(stage2): implement verification engine
feat(stage3): implement ethereum adapter
```

---

# Final Delivery

Create:

```
FINAL-DELIVERY-REPORT.md
```

Include:

- architecture overview
- completed stages
- test results
- deployment instructions
- demo instructions

The project is complete only when an institution can admit projection entries
and resolve any instant to its confirmed holder, its finality and its gap state
through API, SDK and Console, without directly operating blockchain
infrastructure and without any of those three signals being collapsed into one.
