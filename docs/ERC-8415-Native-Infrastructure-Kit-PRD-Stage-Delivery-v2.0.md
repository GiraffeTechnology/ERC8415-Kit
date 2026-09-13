# ERC-8415 Native Infrastructure Kit (NIK)
# Stage Delivery PRD v2.0

## Product Definition

ERC-8415 NIK is an institutional temporal proof, projection and finality infrastructure layer.

Positioning:

Stripe API + AWS SDK for ERC-8415 Native Assets.

---

# Core Difference

This system is NOT a current-state asset registry.

The core questions are:

- Who is holder as of time t?
- Is that answer final as of time t?
- What evidence admitted that projection?

---

# Core Interfaces

Required semantics:

```solidity
holderAsOf(uint256 tokenId, uint64 instant)
    returns (address holder, bool provisional);

entryAsOf(uint256 tokenId, uint64 instant);

isFinalAsOf(uint256 tokenId, uint64 instant)
    returns (bool);
```

---

# Finality Model

Finality is derived from append-only temporal history.

For t >= firstEntry.effectiveAt:

```text
isFinalAsOf(t) == true
iff
there exists a strictly later admitted entry
```

Therefore:

- later same-holder entry may finalize previous interval;
- holder change is not required;
- blockchain confirmation is not finality;
- proof verification is not finality;
- cancellation is not finality;
- gap closure is not finality.

---

# Projection Kernel

Must enforce:

- append-only history
- consecutive versions
- strictly increasing effectiveAt
- commitment linkage
- temporal queries

Forbidden:

- mutable historical correction
- rewriting admitted entries
- using current ERC-721 owner as historical truth

---

# Proof Profile Layer

Proof Profile controls admission validity.

Architecture:

Evidence
 |
Proof Profile
 |
Admission
 |
Projection Entry
 |
Temporal Query

Proof Profile MUST NOT directly set finality.

---

# Settlement Extension

Settlement/gap workflow is optional and independent.

Mandatory invariant:

```text
cancellation != finality

gap closure != finality
```

---

# Delivery Stages

## Stage A
Canonicalization

## Stage B
Semantic Kernel

## Stage C
Proof Profiles

## Stage D
Settlement Extension

## Stage E
API / Reference Engine

## Stage F
SDK

## Stage G
Conformance Suite

## Stage H
Production Delivery

---

# Definition of Done

The implementation must reject ERC-3643/ERC-721 style shortcuts.

Required:

1. holderAsOf(t)
2. isFinalAsOf(t)
3. provisional/final semantics
4. gap semantics
5. proof-profile admission
6. append-only projection
7. executable conformance tests
