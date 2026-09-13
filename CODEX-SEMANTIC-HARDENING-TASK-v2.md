# ERC-8415 NIK — Codex Semantic Hardening Task v2

## P0 Product Boundary
ERC-8415 NIK is temporal proof, projection, and finality infrastructure. It is not a generic RWA registry, ERC-3643 clone, NFT admin system, wallet, trading system, or generic CRUD service.

Any implementation reduced to current owner + mutable token state + blockchain confirmation is invalid.

## Source of Truth
Read the entire repository before implementation. Core semantic precedence:
1. Draft #1356-aligned interface and semantic rules in this repository.
2. CODEX_TASK.md and AGENTS.md invariants.
3. Canonicalized v2.0 PRD.
4. Older infrastructure/product documents only where non-conflicting.

Preserve the Draft #1356-aligned interface shape:

```solidity
holderAsOf(uint256 tokenId, uint64 instant)
    returns (address holder, bool provisional);

isFinalAsOf(uint256 tokenId, uint64 instant)
    returns (bool);
```

Preserve locked ERC-165 IDs:

```text
IRegisterProjection      0x6309e170
IProjectionSettlement   0xf4a7d71b
```

## P0 Semantic Invariants

### Temporal holder semantics
`holderAsOf(tokenId,t)` is a historical projection query and MUST NOT alias current ERC-721 ownership.

### Independent finality semantics
`holderAsOf(t)` and `isFinalAsOf(t)` are separate questions. A holder may be known while the answer remains provisional.

### Exact finality rule
For `t >= firstEntry.effectiveAt`:

```text
isFinalAsOf(t) == true
iff
there exists a strictly later admitted entry.
```

Therefore an interval `[entry[n].effectiveAt, entry[n+1].effectiveAt)` is final once entry `n+1` is admitted. The latest interval remains provisional.

Consequences:
- same-holder later admission may close/finalize the previous interval;
- holder change is not required for finality;
- blockchain confirmation is not finality;
- proof verification is not finality;
- cancellation is not finality;
- gap closure is not finality;
- timeout expiry is not finality.

### FINAL is derived, not mutable state
Do not implement FINAL as a lifecycle flag that can be set by an operator, proof profile, settlement workflow, cancellation, or timeout. FINAL is a temporal query result derived from admitted history.

### Cancellation != finality
Mandatory invariant:

```text
CANCELLATION != FINALITY
```

Absence of cancellation, cancellation, gap closure, or expiry of a cancellation workflow does not establish finality.

### Gap independence
Settlement/workflow gap state is independent from historical finality. Opening, closing, cancelling, or resolving a gap MUST NOT directly change `isFinalAsOf`.

### Append-only history
Admitted projection history is append-only. No rewrite/delete of admitted entries; no retroactive mutation of effectiveAt, commitment, or historical holder.

### Consecutive versions
Enforce:

```text
version[n+1] == version[n] + 1
```

Reject skipped, duplicated, reordered, or replayed versions.

### Strict temporal ordering
Enforce:

```text
effectiveAt[n+1] > effectiveAt[n]
```

Reject equal or backwards effectiveAt.

### Commitment linkage
Where required, enforce:

```text
entry[n+1].previousCommitment == commitment(entry[n])
```

### Proof Profile boundary
Proof Profile decides whether a candidate entry may be admitted. It MUST NOT directly set or override finality.

Required architecture:

```text
Evidence / Proof Primitives
        ↓
Proof Profile
        ↓
Admission Evaluation
        ↓
Projection Entry
        ↓
Temporal / Finality Queries
```

Implement testable MockMerkleProfile and MockZkProfile behind IProofProfile or canonical equivalent.

## Gap Semantics
Distinguish optional settlement/workflow gap from any evidence/knowledge gap concept.

Treat evidence/knowledge GAP as out of scope by default unless the normative repository source explicitly requires it. Create `docs/GAP-SEMANTICS.md` documenting the canonical decision.

## Concrete Implementation
Interfaces alone are not delivery. Implement concrete projection contracts/modules enforcing:
- append-only admission
- consecutive versions
- strictly increasing effectiveAt
- commitment linkage
- proof-profile admission
- holderAsOf
- entryAsOf
- isFinalAsOf

Keep optional settlement extension separate from core projection semantics.

## Mandatory Conformance Tests
Replace all semantic TODO/stub/fake tests. Implement at least:
1. append-only history
2. consecutive versions
3. strict effectiveAt ordering
4. holderAsOf boundaries
5. exact isFinalAsOf later-entry rule
6. provisional holder
7. gap closure does not finalize
8. finality independent of gap
9. proof-profile success
10. proof-profile failure
11. proof replay rejection where required
12. commitment chain validation
13. historical holder stability while later admission may change finality knowledge
14. core works without settlement extension
15. current ERC-721 ownership cannot rewrite historical ERC-8415 projection answers

The suite MUST reject plausible but incorrect ERC-3643/ERC-721 implementations, including assumptions that current owner == historical holder, transfer confirmation == finality, proof-profile success == finality, gap closed == final, not cancelled == final, or latest DB row == holderAsOf(t).

## API Hardening
Preserve temporal routes equivalent to:
- `GET /projection/{id}/entry/as-of/{instant}`
- `GET /projection/{id}/holder/as-of/{instant}`
- `GET /projection/{id}/finality/as-of/{instant}`

Admission endpoints MUST validate schema, version, effectiveAt, commitment linkage, and proof profile before append-only persistence.

## SDK Hardening
Expose `entryAsOf`, `holderAsOf`, and `isFinalAsOf` directly. Preserve provisional/final semantics in return types.

## Shared Conformance Vectors
Create shared vectors/fixtures for contract, API/reference engine, and SDK where practical. Include positive and negative vectors for temporal boundaries, provisional/final intervals, gap closure without finality, invalid versions, invalid effectiveAt, broken commitments, valid/invalid proof profiles, and replay.

## Delivery Stages
A. Canonicalization — create `docs/PRD-CANONICALIZATION-REPORT.md` and `docs/GAP-SEMANTICS.md`.
B. Semantic Kernel — concrete projection and temporal/finality rules.
C. Proof Profiles — profile admission and negative tests.
D. Settlement Extension — prove cancellation/gap independence from finality.
E. API / Reference Engine — remove semantic shortcuts.
F. SDK — complete temporal/finality API.
G. Cross-layer Conformance — shared vectors across layers.
H. Final Delivery — produce final evidence.

Do not stop after planning. Continue A→H autonomously unless blocked by a genuine external dependency.

## Final Evidence
Create:
- `FINAL-DELIVERY-REPORT.md`
- `delivery-evidence-v2.md`

`delivery-evidence-v2.md` MUST map every P0 invariant to implementation file, test file, test name, and status.

## Definition of Done
Do not declare completion until all are implemented and tested end-to-end:
1. holderAsOf(t)
2. isFinalAsOf(t)
3. PROVISIONAL / FINAL separation
4. canonical gap semantics
5. cancellation != finality
6. composable Proof Profile admission
7. append-only temporal projection history
8. executable semantic conformance gates
