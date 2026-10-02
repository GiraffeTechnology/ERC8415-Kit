# AGENTS.md

# ERC-8415 Native Infrastructure Kit

## Product Boundary

ERC-8415 Native Infrastructure Kit is institutional digital asset infrastructure.

It is NOT:

- NFT marketplace
- Wallet application
- Token trading platform

## Architecture Rules

Mandatory architecture:

```
API
 |
Verification Engine
 |
Adapter Layer
 |
Blockchain
 |
Audit Layer
```

Forbidden:

```
Frontend -> Blockchain
```

## Development Rules

1. Follow the Stage Delivery PRD.
2. Each stage requires independent delivery.
3. Each PR must include code, tests, documentation and evidence.
4. Do not rewrite frozen interfaces without Architecture Change Request.
5. Do not commit secrets, private keys or API credentials.

## Workflow

For every stage:

- create implementation branch;
- complete scoped work only;
- run tests;
- update documentation;
- submit Pull Request.

## Source of Truth

The engineering specification is:

`docs/ERC8415-Native-Infrastructure-Kit-PRD-Stage-Delivery-v1.0.md`
