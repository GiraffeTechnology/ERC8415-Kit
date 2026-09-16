# ERC-8415 NIK — Codex Semantic Hardening Task v2

## P0 Product Boundary
ERC-8415 NIK is temporal proof, projection, and finality infrastructure. It is not a generic RWA registry, ERC-3643 clone, NFT admin system, wallet, trading system, or generic CRUD service.

Any implementation reduced to current owner + mutable token state + blockchain confirmation is invalid.

## Source of Truth
Read the entire repository before implementation. Semantic precedence:
1. The ERC-8415 standard text — its definitions and normative rules.
2. The consensus reached in the public discussion thread.
3. The interface and semantic rules in this repository.
4. CODEX_TASK.md and AGENTS.md invariants.
5. Canonicalized v2.0 PRD and the Stage Delivery PRD.
6. Older infrastructure/product documents only where non-conflicting.

Where any two disagree, resolve per the conflict-resolution rule in AGENTS.md.
The standard outranks this repository; a drafting slip in the thread does not
outrank the standard.

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

### Uniqueness scoping
Commitment and registry-reference uniqueness is enforced strictly per token: within a token's projection history a commitment MUST NOT be reused. Do not build global cross-token state and do not reject an entry because another token holds the same commitment or registry reference. Preventing cross-token replay belongs to the registrar or the application; indexers surface collisions.

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

Treat evidence/knowledge GAP as out of scope by default unless the standard explicitly requires it. Create `docs/GAP-SEMANTICS.md` documenting the canonical decision.

The settlement gap carries these settled properties, which the implementation MUST enforce:
- opening a gap MUST NOT block ERC-721 transfers;
- settlement authority is separate from token ownership;
- anyone may relay a proof, and submitting one grants no special rights;
- at most one open projection gap per token;
- admission is atomic — proof consumption, remote-height advancement, entry admission and gap closure succeed or fail together;
- cancellation closes a gap and settles nothing; prior provisional history stays provisional.

There is no rejection event and no veto. A proof that fails verification never becomes an admitted entry, and nothing retroactively invalidates an admitted entry. An indefinitely open gap is a liveness concern, not a veto.

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
16. a confirming entry admitting the same holder finalizes the preceding interval
17. an open gap does not block ERC-721 transfer
18. cancellation leaves prior provisional history provisional
19. a query for an instant preceding the first entry reverts, while isFinalAsOf returns false there without reverting
20. per-token commitment uniqueness holds while the same commitment on a different token is admitted

The suite MUST reject plausible but incorrect ERC-3643/ERC-721 implementations, including assumptions that current owner == historical holder, transfer confirmation == finality, proof-profile success == finality, gap closed == final, not cancelled == final, or latest DB row == holderAsOf(t).

## Vocabulary
State names come from the standard only: open gap / closed gap, provisional / final, admitted, confirmed holder, tradeable position. `Pending`, `Locked`, `Confirmed`, `Rejected`, `Released` and `Refunded` MUST NOT name states, events, enum members, API status values or database columns.

Freshness is not finality. A signal derived from block depth is reorg safety of the projection head, named `REORG_SAFE`, and belongs to the optional non-normative freshness layer — never to `isFinalAsOf`.

## API Hardening
Preserve temporal routes equivalent to:
- `GET /projection/{id}/entry/as-of/{instant}`
- `GET /projection/{id}/holder/as-of/{instant}`
- `GET /projection/{id}/finality/as-of/{instant}`

Admission endpoints MUST validate schema, version, effectiveAt, commitment linkage, and proof profile before append-only persistence.

Temporal reads are point-in-time. Document that a consuming contract should query inside the same transaction as the dependent action, and that an off-chain read taken for display MUST NOT be cached across transactions.

## SDK Hardening
Expose `entryAsOf`, `holderAsOf`, and `isFinalAsOf` directly. Preserve provisional/final semantics in return types.

## Shared Conformance Vectors
Create shared vectors/fixtures for contract, API/reference engine, and SDK where practical. Include positive and negative vectors for temporal boundaries, provisional/final intervals, gap closure without finality, invalid versions, invalid effectiveAt, broken commitments, valid/invalid proof profiles, and replay.

## Delivery Stages
These lettered stages are workstreams executed inside the canonical Stage 0-7 plan in the Stage Delivery PRD; they are not a competing stage numbering.

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
