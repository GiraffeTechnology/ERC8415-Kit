# AGENTS.md

# ERC-8415 Native Infrastructure Kit

## Product Boundary

ERC-8415 Native Infrastructure Kit is ERC-8415-specific temporal proof, projection, and finality infrastructure.

It is NOT:

- a generic RWA registry
- an ERC-3643 clone
- an NFT marketplace
- a wallet application
- a token trading platform
- a generic mutable blockchain CRUD service

Any implementation reduced to `current owner + mutable token state + blockchain confirmation` is architecturally invalid.

---

## Mandatory Repository-Local Execution

All Codex execution materials are stored in this repository. Do NOT depend on an external ZIP, chat attachment, or unpublished handoff file.

Before implementation, read at minimum:

1. `AGENTS.md`
2. `CODEX-SEMANTIC-HARDENING-TASK-v2.md`
3. `CODEX_TASK.md`
4. `README.md`
5. `HANDOFF.md`
6. the v2.0 ERC-8415 PRD file(s)
7. relevant contract interfaces, semantic docs, tests, fixtures, and delivery evidence

If repository files conflict, use the semantic precedence defined in `CODEX-SEMANTIC-HARDENING-TASK-v2.md`.

Do not ask the user to re-upload documents that are already present in the repository.

---

## P0 ERC-8415 Semantic Rules

The implementation MUST preserve all of the following:

1. `holderAsOf(tokenId, instant)` as a historical projection query.
2. `isFinalAsOf(tokenId, instant)` as an independent temporal finality query.
3. PROVISIONAL / FINAL as derived temporal semantics, not mutable token lifecycle flags.
4. append-only admitted projection history.
5. consecutive versions.
6. strictly increasing `effectiveAt`.
7. commitment linkage where required.
8. `cancellation != finality`.
9. settlement gap state is independent from historical finality.
10. Proof Profile governs admission validity, NOT finality.

Exact finality rule:

```text
For t >= firstEntry.effectiveAt:

isFinalAsOf(t) == true
iff
there exists a strictly later admitted entry.
```

Therefore:

- same-holder later admission may finalize the preceding interval;
- holder change is not required for finality;
- blockchain confirmation is not finality;
- proof verification is not finality;
- cancellation is not finality;
- gap closure is not finality;
- timeout expiry is not finality.

---

## Interface Preservation

Preserve the Draft #1356-aligned interface shape unless the normative Draft source in the repository changes:

```solidity
holderAsOf(uint256 tokenId, uint64 instant)
    returns (address holder, bool provisional);

isFinalAsOf(uint256 tokenId, uint64 instant)
    returns (bool);
```

Preserve the locked ERC-165 identifiers:

```text
IRegisterProjection      0x6309e170
IProjectionSettlement   0xf4a7d71b
```

Do not silently downgrade interfaces based on older PRD excerpts.

---

## Architecture Rules

Core architecture:

```text
Evidence / Proof Primitives
        |
Proof Profile
        |
Admission Evaluation
        |
Append-only Projection History
        |
Temporal Queries
        |-- holderAsOf(t)
        |-- entryAsOf(t)
        `-- isFinalAsOf(t)
```

Optional settlement/gap workflow must remain independent from finality.

Forbidden shortcuts:

```text
Frontend -> Blockchain as source of historical truth
Current ERC-721 owner -> holderAsOf(t)
Proof success -> FINAL
Gap closed/cancelled -> FINAL
Mutable state update -> historical correction
```

---

## Development Rules

1. Execute `CODEX-SEMANTIC-HARDENING-TASK-v2.md` autonomously and sequentially.
2. Do not stop after planning; continue through implementation, tests, conformance, and delivery.
3. Each stage must include code, executable tests, documentation, and evidence.
4. No semantic acceptance test may remain a placeholder, fake assertion, skipped test, or TODO.
5. Do not rewrite frozen interfaces or ERC-8415 semantics for convenience.
6. Do not expand scope into marketplace, DeFi, trading, wallet UX, or generic Web3 features before semantic conformance is green.
7. Do not commit secrets, private keys, RPC secrets, or production credentials.

---

## Conformance Requirement

The conformance suite MUST reject plausible ERC-3643/ERC-721-style implementations that assume any of the following:

```text
current owner == historical holder
transfer confirmation == finality
proof-profile success == finality
gap closed == final
not cancelled == final
latest DB row == holderAsOf(t)
mutable state update == historical correction
```

If a generic current-state token registry can pass the suite, the suite is insufficient.

---

## Required Final Delivery

Before declaring completion, create/update:

- `FINAL-DELIVERY-REPORT.md`
- `delivery-evidence-v2.md`

The evidence file MUST map every P0 invariant to:

```text
implementation file | test file | test name | status
```

Do not declare completion until the following are implemented and tested end-to-end:

1. `holderAsOf(t)`
2. `isFinalAsOf(t)`
3. PROVISIONAL / FINAL separation
4. canonical gap semantics
5. `cancellation != finality`
6. composable Proof Profile admission
7. append-only temporal projection history
8. executable semantic conformance gates
