# Codex Iteration Task v2.1

## Objective

Evolve ERC8415-Kit from implementation support into ERC-8415 ecosystem infrastructure.

## Read First

The ERC-8415 standard text and the discussion-thread consensus rank above every
document below; see the conflict-resolution rule in AGENTS.md.

1. AGENTS.md
2. CODEX_TASK.md
3. docs/ERC8415-Native-Infrastructure-Kit-PRD-v2.1.md
4. docs/ERC-8415-Native-Infrastructure-Kit-PRD-Stage-Delivery-v2.0.md
5. docs/ERC8415-SEMANTIC-MODEL.md

## Mandatory Changes

Preserve:

- holderAsOf
- entryAsOf
- isFinalAsOf
- currentEntry / entryAt / entryCount
- openGapOf and openedAt
- provisional/final semantics
- append-only projection
- Proof Profile admission
- non-blocking settlement

Do not introduce:

- current-state registry shortcuts;
- rollback-based finality;
- rejection/veto lifecycle;
- Pending / Locked / Confirmed / Rejected / Released / Refunded state names;
- finality stored as a flag rather than derived;
- freeze, revoke or override authority over a token or an entry;
- mutable historical correction;
- cross-token commitment or registry-reference enforcement.

## Development Direction

Prioritize, in this order. These are workstreams inside the canonical Stage 0-7
plan in the Stage Delivery PRD, not a competing stage numbering:

1. Semantic Model
2. Projection Kernel
3. Admission Engine
4. Proof Profiles
5. Ecosystem SDK patterns

## Ecosystem Validation

Prepare examples for:

- wallet applications;
- exchange settlement;
- custody systems;
- institutional integrations.

## Delivery

Every iteration requires:

- implementation;
- tests;
- documentation;
- evidence.
