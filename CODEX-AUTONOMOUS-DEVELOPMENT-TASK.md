# ERC-8415 Native Infrastructure Kit
# Autonomous Development Task Specification

Version: v1.0

Repository: ~/ERC8415-Kit

## Mission

You are the primary engineering agent responsible for completing the ERC-8415 Native Infrastructure Kit.

Build an institutional digital asset infrastructure platform based on ERC-8415.

Final architecture:

```
Institution
    |
API / SDK
    |
ERC-8415 Native Infrastructure Kit
    |
Verification Engine
    |
Blockchain Adapter
    |
Ethereum / L2 / Permissioned Chain
    |
Institutional Dashboard
```

The final system must support the complete lifecycle:

```
Register
 -> Verify
 -> Activate
 -> Update State
 -> Freeze
 -> Transfer
 -> Settlement
 -> Audit
```

---

# Authority Documents

The following files are the only product authority:

- README.md
- AGENTS.md
- docs/ERC8415-Native-Infrastructure-Kit-PRD-Stage-Delivery-v1.0.md

Do not redefine product scope without an Architecture Change Request.

---

# P0 Engineering Rules

## Product Boundary

ERC-8415 Native Infrastructure Kit is:

- Institutional Asset Registry
- Verification Infrastructure
- Blockchain Adapter
- Audit Infrastructure
- SDK Platform

It is NOT:

- NFT marketplace
- Wallet
- Token exchange
- DeFi protocol

## Architecture Rule

All operations must follow:

```
API
 |
Verification Engine
 |
State Machine
 |
Adapter Layer
 |
Blockchain
 |
Audit Layer
```

Frontend must never directly interact with blockchain.

---

# Autonomous Execution Rules

You are authorized to:

- create files
- implement code
- install dependencies
- write tests
- update documentation
- run local environments
- fix bugs

You must not:

- delete approved architecture
- bypass tests
- remove security controls
- expand into unrelated products

---

# Development Strategy

Execute sequentially:

```
Stage 0 Foundation
 |
Stage 1 Asset Registry MVP
 |
Stage 2 Verification Engine
 |
Stage 3 ERC-8415 Adapter
 |
Stage 4 Institutional Dashboard
 |
Stage 5 SDK Platform
 |
Stage 6 Production Infrastructure
```

Each stage must produce:

- Code
- Tests
- Documentation
- Delivery Report

---

# Stage Requirements

## Stage 0 Foundation

Create:

```
api/
engine/
adapters/
contracts/
dashboard/
sdk/
tests/
docker/
```

Deliver:

- development environment
- CI configuration
- architecture documentation

---

## Stage 1 Asset Registry MVP

Implement:

Database:

- assets
- asset_history
- permissions

API:

```
GET /asset/{id}/state
GET /asset/{id}/history
GET /asset/{id}/holder
POST /asset/register
POST /state/update
POST /freeze
POST /revoke
POST /settlement
```

Acceptance:

Asset lifecycle can run without blockchain using mock adapter.

---

## Stage 2 Verification Engine

Implement:

- proof verification
- state transition engine
- finality record

Allowed states:

```
REGISTERED
VERIFIED
ACTIVE
TRANSFERRED
SETTLED
REVOKED
```

Invalid transitions must fail.

---

## Stage 3 ERC-8415 Adapter

Implement:

- Solidity contract
- Ethereum adapter
- transaction monitoring

Contract functions:

```
registerAsset()
updateState()
freezeAsset()
revokeAsset()
settleAsset()
```

---

## Stage 4 Institutional Dashboard

Implement:

- login
- asset overview
- audit timeline
- permission management

Users must manage assets without Web3 knowledge.

---

## Stage 5 SDK Platform

Implement:

JavaScript SDK:

```
@erc8415/sdk
```

Python SDK:

```
erc8415
```

Provide examples and API documentation.

---

## Stage 6 Production Infrastructure

Implement:

- API Key management
- RBAC
- multi tenant support
- monitoring
- audit export

---

# Testing Requirements

Mandatory:

## Unit Tests

Minimum 80% coverage.

## Integration Test

Required flow:

```
Register Asset
 -> Verify Proof
 -> Update State
 -> Settlement
 -> Audit
```

## Blockchain Test

Required:

```
Deploy Contract
 -> Execute Transaction
 -> Verify Event
```

---

# Git Rules

Every stage:

- create implementation branch
- commit changes
- run tests
- generate report
- submit PR

Never push directly to main.

Commit format:

```
feat(stage1): implement asset registry api
feat(stage2): implement verification engine
feat(stage3): implement ethereum adapter
```

---

# Final Delivery

Create:

```
FINAL-DELIVERY-REPORT.md
```

Include:

- architecture overview
- completed stages
- test results
- deployment instructions
- demo instructions

The project is complete only when an institution can manage ERC-8415 assets through API, SDK and Dashboard without directly operating blockchain infrastructure.
