# ERC-8415 Native Settlement Kit (NIK)
# Stage Delivery PRD v2.1

## Product Definition

ERC-8415 Native Settlement Kit is an application and infrastructure kit for building wallets and applications that manage asynchronous real-world asset settlement.

Positioning:

**Stripe API + AWS SDK for ERC-8415 Native Settlement Applications**

The Kit enables applications to separate:

- fast on-chain execution;
- slow off-chain registry confirmation;
- deterministic settlement completion.

---

# Product Principle

ERC-8415 is not only a projection standard.

It enables an asynchronous settlement model:

```text
Fast Execution Layer
        |
        v
ERC-8415 Projection Layer
        |
        v
Slow Institutional Verification Layer
```

The Kit provides the infrastructure between applications, wallets and ERC-8415 projections.

---

# Architecture

```text
Wallet / Application
        |
Settlement SDK
        |
Settlement Engine
        |
ERC-8415 Adapter
        |
Projection Engine
        |
Institutional Registry
```

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

## 2. Settlement Engine (New Product Layer)

Provides asynchronous settlement lifecycle.

State machine:

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

The engine does not replace ERC-8415 semantics. It consumes projection finality.

---

## 3. Wallet / Application SDK (New Product Layer)

Provides:

- settlement intent creation;
- pending state display;
- locked asset/payment management;
- confirmation handling;
- deterministic release/refund.

The wallet is a settlement client, not only an asset viewer.

---

## 4. Institutional Infrastructure

Existing capability.

Includes:

- registry APIs;
- verification engine;
- institutional dashboard;
- audit records;
- tenant/security controls.

These remain infrastructure components.

---

# Existing Development Preservation

Completed modules are preserved and reclassified:

KEEP:

- registry layer;
- verification engine;
- ERC-8415 adapter;
- SDK foundation;
- institutional controls;
- production infrastructure.

Evolution:

Registry Infrastructure
        +
Settlement Layer
        +
Wallet/Application Layer

becomes ERC-8415 Native Settlement Kit.

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
Wallet/Application SDK

## Stage 6
Institutional Console

## Stage 7
Production Infrastructure

---

# MVP Acceptance

Stage 1-5 MVP demonstrates:

```text
Asset
 |
Application
 |
Settlement Intent
 |
ERC-8415 Projection
 |
Registry Confirmation
 |
Release / Refund
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
- new blockchain standards;
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
- application-visible workflow.

Code completion alone does not equal delivery.
