# ERC-8415 Native Infrastructure Kit
# CODEX_TASK.md

## Execution Authority

Authority, in precedence order:

1. the ERC-8415 standard text;
2. the consensus reached in the public discussion thread;
3. this repository's documents.

Read first:

1. AGENTS.md
2. CODEX-ITERATION-TASK-v2.1.md
3. CODEX-SEMANTIC-HARDENING-TASK-v2.md
4. docs/ERC8415-Native-Infrastructure-Kit-PRD-v2.1.md
5. docs/ERC-8415-Native-Infrastructure-Kit-PRD-Stage-Delivery-v2.0.md
6. docs/ERC8415-SEMANTIC-MODEL.md

Resolve any disagreement per the conflict-resolution rule in AGENTS.md, and
record the resolution where the conflicting text lives.

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
- currentEntry / entryAt / entryCount
- openGapOf(tokenId) and the gap's openedAt
- registerId
- provisional/final temporal semantics
- append-only projection history
- consecutive versions
- strict effectiveAt ordering
- commitment linkage, unique per token and not across tokens
- Proof Profile based admission, applied atomically
- non-blocking settlement: an open gap never blocks an ERC-721 transfer

Finality rule:

For t >= firstEntry.effectiveAt:

isFinalAsOf(t) == true
iff
there exists a strictly later admitted entry.

A later entry may admit the same holder. Such a confirming entry finalizes the
preceding interval without the holder having changed.

Proof Profile validates admission. It does NOT directly set finality. Neither
does cancellation, gap closure, timeout expiry, block depth or a freshness
classification.

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

These lettered stages are workstreams inside the canonical Stage 0-7 plan in the
Stage Delivery PRD, not a competing stage numbering.

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
8. a confirming entry finalizing an interval without a holder change
9. an open gap not blocking transfer
10. no rejection or veto path, and no rollback of an admitted entry
11. semantic conformance suite
12. ecosystem integration examples
