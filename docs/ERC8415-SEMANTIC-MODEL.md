# ERC-8415 Semantic Model

## Execution State vs Projection State

ERC-8415 separates blockchain execution from institutional projection.

```
Execution State
      |
      X
Projection State
```

Current token ownership is not a replacement for historical projection semantics.

## Temporal Queries

The semantic layer provides:

- holderAsOf(tokenId, instant)
- entryAsOf(tokenId, instant)
- isFinalAsOf(tokenId, instant)

## Admission

A projection entry becomes part of history only after successful proof admission.

```
Evidence
 |
Proof Profile
 |
Admission
 |
Projection Entry
```

## Finality

Finality is derived, not manually assigned.

A historical interval becomes final when a later admitted entry closes that interval.

## Provisional State

The latest admitted projection may remain provisional until later history confirms the interval.

## Gap

Settlement gaps are workflow states. They do not define historical truth.

```
Gap closure != finality
Cancellation != finality
```

## Application Boundary

Applications decide how to compose provisional states with economic workflows.

The protocol provides deterministic projection semantics, not a universal settlement policy.
