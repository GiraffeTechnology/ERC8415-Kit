# Codex Iteration Task v2.1

## Objective

Evolve ERC8415-Kit from implementation support into ERC-8415 ecosystem infrastructure.

## Read First

1. AGENTS.md
2. CODEX_TASK.md
3. docs/ERC8415-Native-Infrastructure-Kit-PRD-v2.1.md
4. docs/ERC8415-SEMANTIC-MODEL.md

## Mandatory Changes

Preserve:

- holderAsOf
- entryAsOf
- isFinalAsOf
- provisional/final semantics
- append-only projection
- Proof Profile admission

Do not introduce:

- current-state registry shortcuts;
- rollback-based finality;
- rejection/veto lifecycle;
- mutable historical correction.

## Development Direction

Prioritize:

Stage 1: Semantic Model
Stage 2: Projection Kernel
Stage 3: Admission Engine
Stage 4: Proof Profiles
Stage 5: Ecosystem SDK patterns

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
