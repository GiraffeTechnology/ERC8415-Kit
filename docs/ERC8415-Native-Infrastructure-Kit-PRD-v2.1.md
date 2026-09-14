# ERC-8415 Native Infrastructure Kit (NIK)
# PRD v2.1 — Ecosystem Infrastructure Evolution

## Product Definition

ERC-8415 NIK is a temporal projection infrastructure layer for ERC-8415 ecosystems.

It is not a generic RWA registry. It provides infrastructure for:

- admission of verified projection entries;
- temporal asset queries;
- derived finality semantics;
- ecosystem integrations.

## Core Model

```
Evidence
  |
Proof Profile
  |
Admission
  |
Append-only Projection History
  |
Temporal Queries
```

## Core Questions

The infrastructure answers:

1. Who is the holder as of time t?
2. Is that historical answer final as of time t?
3. What evidence admitted that projection?

## Core Modules

### 1. Projection Kernel

Provides:

- holderAsOf(tokenId, instant)
- entryAsOf(tokenId, instant)
- isFinalAsOf(tokenId, instant)

Requirements:

- append-only history;
- consecutive versions;
- strict effectiveAt ordering;
- commitment linkage.

### 2. Admission Engine

Proof Profile determines whether evidence can admit an entry.

Proof Profile MUST NOT directly set finality.

### 3. Finality Engine

Finality is derived from admitted temporal history.

For t >= firstEntry.effectiveAt:

isFinalAsOf(t) == true iff there exists a strictly later admitted entry.

### 4. Settlement Composition Layer

Settlement workflow is optional application composition.

Invariant:

cancellation != finality

gap closure != finality

### 5. Ecosystem Layer

Support:

- wallet integrations;
- exchange integrations;
- custody systems;
- institutional applications.

## Strategic Position

ERC-8415 NIK is the infrastructure layer between ERC-8415 protocol semantics and application ecosystems.
