# AGENTS.md

# ERC-8415 Native Settlement Kit

## Repository Execution Rule

Codex MUST use repository-local files only.

Required reading order:

1. AGENTS.md
2. CODEX_TASK.md
3. docs/ERC-8415-Native-Infrastructure-Kit-PRD-Stage-Delivery-v2.0.md

If requirements are missing:

STOP.
Do not infer product scope.

---

## Product Boundary

ERC-8415 Native Settlement Kit is ERC-8415-aligned settlement infrastructure for wallets and applications.

It provides:

- projection infrastructure;
- settlement state management;
- wallet/application SDK capability;
- institutional integration.

It is NOT:

- a generic RWA registry;
- an ERC-3643 replacement;
- a marketplace;
- a token trading platform;
- a new blockchain standard.

---

## Semantic Rules

The implementation MUST preserve:

- holderAsOf(tokenId, instant);
- entryAsOf(tokenId, instant);
- isFinalAsOf(tokenId, instant);
- append-only projection history;
- temporal finality semantics;
- proof-profile admission model.

Settlement workflows MUST NOT redefine ERC-8415 semantics.

---

## Architecture

```text
Wallet/Application
 |
Settlement Engine
 |
ERC-8415 Adapter
 |
Projection Infrastructure
 |
Institutional Registry
```

---

## Development Rule

Existing useful engineering is preserved.

Classify work:

KEEP
FINISH-NOW
FREEZE-LATER
REMOVE

Do not delete completed infrastructure when product positioning evolves.

---

## Delivery Rule

Each stage requires:

- implementation;
- tests;
- documentation;
- evidence;
- user/application validation where applicable.

Code completion alone does not equal delivery completion.
