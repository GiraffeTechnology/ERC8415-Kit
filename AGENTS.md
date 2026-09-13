# AGENTS.md

# ERC-8415 Native Infrastructure Kit

## Repository Execution Rule

Codex MUST use repository-local files only.

External ZIP files, chat attachments, and unpublished handoff documents are NOT execution sources.

Required reading order:

1. `AGENTS.md`
2. `CODEX_TASK.md`
3. `CODEX-SEMANTIC-HARDENING-TASK-v2.md`
4. `docs/ERC-8415-Native-Infrastructure-Kit-PRD-Stage-Delivery-v2.0.md`
5. `HANDOFF.md`

If any required file is missing:

STOP.
Do not infer requirements.
Do not search externally.
Report repository inconsistency.

---

## Product Boundary

ERC-8415 Native Infrastructure Kit is ERC-8415-specific temporal proof, projection and finality infrastructure.

It is NOT:

- generic RWA registry
- ERC-3643 clone
- NFT marketplace
- wallet
- token trading platform
- mutable blockchain CRUD system

---

## P0 Semantic Rules

The implementation MUST preserve:

- `holderAsOf(tokenId, instant)`
- `entryAsOf(tokenId, instant)`
- `isFinalAsOf(tokenId, instant)`
- provisional/final derived temporal semantics
- append-only projection history
- consecutive versions
- strict effectiveAt ordering
- commitment linkage
- cancellation != finality
- gap closure != finality
- Proof Profile admission model

Finality rule:

```text
For t >= firstEntry.effectiveAt:

isFinalAsOf(t) == true
iff
there exists a strictly later admitted entry.
```

---

## Architecture

```text
Evidence
 |
Proof Profile
 |
Admission
 |
Append-only Projection History
 |
Temporal Queries
 |
 + holderAsOf(t)
 + entryAsOf(t)
 + isFinalAsOf(t)
```

Forbidden:

```text
current ERC-721 owner -> historical holder
proof success -> finality
gap closed -> finality
cancellation -> finality
mutable update -> historical correction
```

---

## Development Rule

Execute:

`CODEX_TASK.md`

autonomously.

Each stage requires:

- implementation
- executable tests
- documentation
- evidence

No semantic TODO, fake assertion, skipped conformance test, or placeholder acceptance is allowed.

---

## Final Delivery

Required:

- `FINAL-DELIVERY-REPORT.md`
- `delivery-evidence-v2.md`

Completion requires all ERC-8415 semantic conformance gates to pass.
