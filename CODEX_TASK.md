# ERC-8415 Native Infrastructure Kit
# CODEX_TASK.md

## Execution Authority

Codex MUST execute from repository-local documents only.

Read first:

1. AGENTS.md
2. CODEX-SEMANTIC-HARDENING-TASK-v2.md
3. this file
4. docs/ERC-8415-Native-Infrastructure-Kit-PRD-Stage-Delivery-v2.0.md
5. HANDOFF.md

Do not depend on external ZIP files or chat context.

---

# Mission

Build ERC-8415 Native Infrastructure Kit (NIK):

a temporal proof, projection and finality infrastructure for institutional assets.

This is NOT a generic RWA registry, ERC-3643 clone, NFT platform, wallet, or mutable token CRUD system.

---

# Core Semantic Requirements (P0)

The implementation MUST preserve:

- holderAsOf(tokenId, instant)
- entryAsOf(tokenId, instant)
- isFinalAsOf(tokenId, instant)
- provisional/final temporal semantics
- append-only projection history
- consecutive versions
- strict effectiveAt ordering
- commitment linkage
- cancellation != finality
- gap closure != finality
- Proof Profile based admission

Finality rule:

For t >= firstEntry.effectiveAt:

isFinalAsOf(t) == true
iff
there exists a strictly later admitted entry.

Proof Profile validates admission. It does NOT directly set finality.

---

# Execution Stages

## Stage A
Canonicalization

Resolve repository PRD authority and create semantic documentation.

## Stage B
Semantic Kernel

Implement concrete projection contracts/reference engine:

- append-only admission
- holderAsOf
- entryAsOf
- isFinalAsOf
- version validation
- temporal validation

## Stage C
Proof Profiles

Implement proof admission abstraction and executable profiles/tests.

## Stage D
Settlement Extension

Keep settlement gap independent from finality.

Prove:

cancellation != finality

gap closure != finality

## Stage E
API / Indexer / Engine

Expose temporal queries and enforce admission rules.

## Stage F
SDK

Expose ERC-8415 semantic APIs.

## Stage G
Cross-layer Conformance

Run shared semantic vectors across contracts, API and SDK.

## Stage H
Final Delivery

Create:

FINAL-DELIVERY-REPORT.md
delivery-evidence-v2.md

---

# Completion Gate

Do not declare completion until tests prove:

1. holderAsOf(t)
2. isFinalAsOf(t)
3. provisional/final separation
4. canonical gap semantics
5. cancellation != finality
6. Proof Profile admission
7. append-only history
8. semantic conformance suite

