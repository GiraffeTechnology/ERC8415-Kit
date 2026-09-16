# ERC-8415 Kit Handoff

## Purpose

This repository contains the ERC-8415 Native Infrastructure Kit implementation
task: temporal projection infrastructure, not a registry, wallet or settlement
adjudicator.

## Authority

In precedence order:

1. the ERC-8415 standard text;
2. the consensus reached in the public discussion thread;
3. this repository's documents, starting at AGENTS.md.

Repository documents are the working source, but they do not outrank the
standard. Where they disagree, fix the repository. The conflict-resolution rule
is in AGENTS.md.

## Semantic Requirements

The implementation must preserve:

- holderAsOf(t), entryAsOf(t), isFinalAsOf(t);
- currentEntry / entryAt / entryCount, registerId;
- openGapOf and the gap's openedAt;
- provisional and final semantics, with finality derived from admitted history
  and never stored as a flag;
- append-only temporal projection, unique per token and not across tokens;
- proof-profile admission, applied atomically;
- non-blocking settlement — an open gap never blocks an ERC-721 transfer, and
  settlement authority is separate from token ownership.

Invariants:

```text
cancellation    != finality
gap closure     != finality
proof verified  != finality
timeout expiry  != finality
block depth     != finality
```

A later entry may admit the same holder; such a confirming entry finalizes the
preceding interval without the holder having changed.

There is no rejection event, no veto and no rollback of an admitted entry. State
names come from the standard only — open gap / closed gap, provisional / final,
admitted.

## Execution

Complete the semantic kernel first, then proof profiles, settlement extension,
API, SDK and conformance delivery. The canonical stage plan is Stage 0 through
Stage 7 in the Stage Delivery PRD; lettered stages elsewhere are workstreams
inside it.
