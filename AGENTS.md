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

ERC-8415 Native Settlement Kit is ERC-8415-aligned settlement infrastructure.

The Kit is consumed by:

- Oracle integration layer;
- wallet/application developers;
- institutional asset systems.

The Kit provides:

- projection infrastructure;
- settlement state management;
- SDK capability;
- institutional integration primitives.

The Kit is NOT:

- a wallet product;
- an application frontend;
- ArtFi itself;
- a marketplace;
- a new blockchain standard.

---

## Integration Boundary

Architecture:

```text
Application / Wallet
        |
        v
Oracle
        |
        v
ERC-8415 Native Settlement Kit
        |
        v
Institutional Registry
```

Oracle is the integration layer between ERC-8415 infrastructure and vertical applications.

Applications consume Oracle capabilities. They do not directly redefine Kit semantics.

---

## Semantic Rules

Implementation MUST preserve:

- holderAsOf(tokenId, instant);
- entryAsOf(tokenId, instant);
- isFinalAsOf(tokenId, instant);
- append-only projection history;
- temporal finality semantics;
- proof-profile admission model.

Settlement workflows MUST consume ERC-8415 semantics and MUST NOT redefine them.

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
- integration validation where applicable.

Code completion alone does not equal delivery completion.
