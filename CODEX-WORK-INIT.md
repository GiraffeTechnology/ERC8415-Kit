# Codex Work Instruction

> Revised. This document previously named the superseded v1.0 stage PRD as sole
> execution authority and opened Stage 1 as a Core Asset Registry MVP. Both
> conflicted with the ERC-8415 standard and the discussion-thread consensus and
> are corrected below, per the conflict-resolution rule in AGENTS.md.

## Task

Initialize ERC-8415 Native Infrastructure Kit repository.

Repository:

`GiraffeTechnology/ERC8415-Kit`

---

## Objective

Prepare the repository for staged engineering delivery.

The repository is currently in Stage 0.

---

## Mandatory Reading

Before any implementation:

1. AGENTS.md
2. docs/ERC8415-Native-Infrastructure-Kit-PRD-v2.1.md
3. docs/ERC-8415-Native-Infrastructure-Kit-PRD-Stage-Delivery-v2.0.md
4. docs/ERC8415-SEMANTIC-MODEL.md
5. README.md

The ERC-8415 standard text and the discussion-thread consensus rank above all
of them; see the conflict-resolution rule in AGENTS.md. The v1.0 stage PRD is
superseded and carries no authority.

---

## Stage 0 Completion Checklist

Complete:

- verify repository structure;
- verify documentation exists;
- create development environment definition;
- create initial CI configuration if required;
- prepare Stage 1 implementation plan.

---

## Restrictions

Do not:

- implement future stages early;
- redesign ERC-8415 semantics;
- introduce a mutable asset state machine, freeze, revoke, rollback or override;
- store finality as a flag instead of deriving it;
- introduce unrelated features;
- bypass Verification Engine architecture;
- connect frontend directly to blockchain.

---

## Delivery Requirement

Submit PR containing:

- changed files;
- test results;
- documentation update;
- implementation evidence.

After Stage 0 approval, start:

`Stage 1 - ERC-8415 Projection Core`

---

END
