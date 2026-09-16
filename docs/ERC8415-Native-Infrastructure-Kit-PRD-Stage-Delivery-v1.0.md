# ERC-8415 Native Infrastructure Kit

## Stage Delivery Engineering PRD v1.0

> Superseded. Kept for delivery history only. The current stage plan is
> `ERC-8415-Native-Infrastructure-Kit-PRD-Stage-Delivery-v2.0.md`, and the
> current semantics are `ERC8415-Native-Infrastructure-Kit-PRD-v2.1.md` and
> `ERC8415-SEMANTIC-MODEL.md`. Where this document conflicts with them, they
> win, per the conflict-resolution rule in AGENTS.md. Specifically void below:
> the `REGISTERED -> ... -> REVOKED` mutable state machine, freeze and revoke
> authority, `updateState` / `freezeAsset` / `revokeAsset` / `settleAsset`,
> finality recorded as stored state, and the Stage 0-6 numbering. Projection
> state is open gap / closed gap, provisional / final, and admitted; finality is
> derived from admitted history on query.

## Product Definition

ERC-8415 Native Infrastructure Kit (NIK) is an institutional digital asset infrastructure layer.

Positioning:

Stripe API + AWS SDK for ERC-8415 Native Assets.

---

# Delivery Principle

The system MUST be delivered incrementally by stages.

Each stage must provide:

- runnable artifacts;
- tests;
- documentation;
- delivery evidence.

Future stages must extend, not replace, approved interfaces.

---

# Roadmap

```
Stage 0  Foundation
Stage 1  Asset Registry MVP
Stage 2  Verification Engine
Stage 3  ERC-8415 Blockchain Adapter
Stage 4  Institutional Dashboard
Stage 5  SDK Platform
Stage 6  Production Infrastructure
```

---

# Stage 0 - Foundation

Objective:

Create repository architecture and engineering rules.

Deliverables:

- README.md
- AGENTS.md
- docs structure
- development environment

Acceptance:

Repository can be initialized and developed by Codex.

---

# Stage 1 - Core Asset Registry MVP

Objective:

Implement asset registration and lifecycle management without real blockchain dependency.

Modules:

- Asset database
- Register API
- Mock Adapter
- Audit history

Required APIs:

```
GET /asset/{id}/state
GET /asset/{id}/history
GET /asset/{id}/holder
POST /state/update
POST /freeze
POST /revoke
POST /settlement
```

Acceptance:

Complete lifecycle:

```
Register
 -> Query
 -> Update State
 -> History
 -> Freeze
 -> Revoke
```

---

# Stage 2 - Verification Engine

Implement:

- proof verification;
- state transition validation;
- finality recording.

State machine:

```
REGISTERED
 |
VERIFIED
 |
ACTIVE
 |
SETTLED
```

Invalid transitions must fail.

---

# Stage 3 - ERC-8415 Adapter

Implement blockchain abstraction layer.

Required adapters:

- Ethereum
- L2
- Permissioned chain interface

Smart contract functions:

```
registerAsset()
updateState()
freezeAsset()
revokeAsset()
settleAsset()
```

---

# Stage 4 - Institutional Dashboard

Provide non-Web3 institutional interface.

Functions:

- asset status;
- audit trail;
- permission management.

Roles:

```
ADMIN
VERIFIER
CUSTODIAN
AUDITOR
VIEWER
```

---

# Stage 5 - SDK Platform

Provide:

- JavaScript SDK
- Python SDK
- developer documentation

---

# Stage 6 - Production Infrastructure

Implement:

- multi tenant;
- security controls;
- monitoring;
- institutional deployment capability.

---

# Definition of Done

Complete lifecycle:

```
Institution
 |
API / SDK
 |
Registry
 |
Verification Engine
 |
ERC-8415 Adapter
 |
Blockchain
 |
Dashboard Audit
```

must run end-to-end.
