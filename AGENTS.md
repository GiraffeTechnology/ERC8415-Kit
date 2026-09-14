# ERC-8415 Native Settlement Kit

## Repository Execution Rule

Codex MUST use repository-local files only.

Required reading order:

1. AGENTS.md
2. CODEX_TASK.md
3. CODEX-ITERATION-TASK-v2.1.md
4. docs/ERC8415-Native-Infrastructure-Kit-PRD-v2.1.md
5. docs/ERC8415-SEMANTIC-MODEL.md

If requirements are missing:

STOP.
Do not infer product scope.

---

## Product Boundary

ERC-8415 Native Infrastructure Kit is temporal projection infrastructure for ERC-8415 ecosystems.

The Kit provides:

- projection infrastructure;
- admission primitives;
- temporal query capability;
- proof-profile integration;
- ecosystem integration primitives.

The Kit is NOT:

- a wallet product;
- an application frontend;
- a marketplace;
- a new blockchain standard;
- a generic RWA registry.

---

## Semantic Rules

Implementation MUST preserve:

- holderAsOf(tokenId, instant);
- entryAsOf(tokenId, instant);
- isFinalAsOf(tokenId, instant);
- append-only projection history;
- derived temporal finality;
- proof-profile admission model.

Proof Profile determines admission validity. It MUST NOT directly set finality.

Settlement workflows consume ERC-8415 semantics and MUST NOT redefine them.

Mandatory invariants:

```text
cancellation != finality
gap closure != finality
```

---

## Ecosystem Boundary

The Kit supports:

- wallet integrations;
- exchange integrations;
- custody systems;
- institutional asset systems.

Applications compose settlement behavior according to their own risk model while consuming common ERC-8415 semantics.

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
