# ERC-8415 Native Settlement Kit (NIK)
# Stage Delivery PRD v2.2

## Product Definition

ERC-8415 Native Settlement Kit is ERC-8415-aligned settlement infrastructure consumed by Oracle and application ecosystems.

Positioning:

**Stripe API + AWS SDK for ERC-8415 Native Settlement Infrastructure**

The Kit enables Oracle and application layers to separate:

- fast on-chain execution;
- slow off-chain registry confirmation;
- deterministic settlement completion.

---

# Product Boundary

The Kit is NOT the wallet and NOT the application layer.

Product relationship:

```text
Wallet / Application
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

Oracle is responsible for connecting ERC-8415 infrastructure with vertical applications such as ArtFi.

---

# Core Principle

ERC-8415 enables asynchronous settlement.

```text
Fast Execution Layer
        |
        v
ERC-8415 Projection Layer
        |
        v
Institutional Verification Layer
```

The Kit provides the infrastructure required for Oracle to consume projection state and manage settlement workflows.

---

# Core Modules

## 1. Projection Infrastructure

Existing capability.

Provides:

- register identity;
- projection entries;
- temporal history;
- holderAsOf(t);
- entryAsOf(t);
- isFinalAsOf(t).

---

## 2. Settlement Engine

Infrastructure capability consumed by Oracle.

Provides asynchronous settlement lifecycle:

```text
Pending
  |
Locked
  |
Confirmed
  |
Released
```

Failure path:

```text
Rejected
  |
Refunded
```

The Settlement Engine MUST NOT redefine ERC-8415 semantics.

---

## 3. SDK Layer

Provides infrastructure SDKs for Oracle and application developers.

Includes:

- settlement interaction;
- projection queries;
- state handling;
- integration interfaces.

---

## 4. Institutional Infrastructure

Existing capability.

Includes:

- registry APIs;
- verification engine;
- institutional controls;
- audit records;
- tenant/security controls.

---

# Existing Development Preservation

Completed modules are preserved.

KEEP:

- registry layer;
- verification engine;
- ERC-8415 adapter;
- SDK foundation;
- institutional controls;
- production infrastructure.

Evolution:

```text
Registry Infrastructure
        +
Settlement Layer
        +
Oracle Integration Layer

becomes

ERC-8415 Native Settlement Kit
```

---

# Delivery Stages

## Stage 0
Foundation

## Stage 1
ERC-8415 Projection Core

## Stage 2
Verification Engine

## Stage 3
ERC-8415 Adapter

## Stage 4
Settlement Engine MVP

## Stage 5
Oracle/Application SDK

## Stage 6
Institutional Console

## Stage 7
Production Infrastructure

---

# MVP Acceptance

MVP demonstrates:

```text
Application
 |
Oracle
 |
ERC-8415 Settlement Kit
 |
Projection Confirmation
 |
Settlement Result
```

Required:

- asynchronous settlement lifecycle;
- projection consumption;
- finality-aware workflow;
- executable tests;
- evidence.

---

# Non Goals

Not included:

- replacing ERC-8415 semantics;
- wallet frontend product;
- ArtFi application logic;
- custody authority;
- legal registry authority;
- generic NFT marketplace.

---

# Definition of Done

Delivery requires:

- implementation;
- tests;
- documentation;
- deployment evidence;
- Oracle/application integration validation.

Code completion alone does not equal delivery completion.
