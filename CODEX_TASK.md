# ERC-8415 Native Infrastructure Kit
# CODEX_TASK.md

## Execution Authority

Codex MUST execute from repository-local documents only.

Read first:

1. AGENTS.md
2. CODEX-ITERATION-TASK-v2.1.md
3. CODEX-SEMANTIC-HARDENING-TASK-v2.md
4. docs/ERC8415-Native-Infrastructure-Kit-PRD-v2.1.md
5. docs/ERC8415-SEMANTIC-MODEL.md

Do not depend on external ZIP files or chat context.

---

# Mission

Build ERC-8415 Native Infrastructure Kit (NIK):

a temporal projection infrastructure layer for ERC-8415 ecosystems.

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
- Proof Profile based admission

Finality rule:

For t >= firstEntry.effectiveAt:

isFinalAsOf(t) == true
iff
there exists a strictly later admitted entry.

Proof Profile validates admission. It does NOT directly set finality.

---

# Ecosystem Infrastructure Direction

The Kit MUST evolve from API implementation support into infrastructure consumed by:

- wallets;
- exchanges;
- custody systems;
- institutional applications.

Applications consume ERC-8415 semantics and compose their own settlement behavior.

---

# Execution Stages

## Stage A
Semantic model and architecture alignment.

## Stage B
Projection Kernel.

## Stage C
Admission Engine and Proof Profiles.

## Stage D
Settlement Composition Layer.

## Stage E
API / Indexer / Engine.

## Stage F
SDK and ecosystem examples.

## Stage G
Cross-layer Conformance.

## Stage H
Final Delivery.

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
9. ecosystem integration examples
