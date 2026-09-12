# Stage 6 delivery report

Status: implemented and locally verified; submitted for coordinator-owned CI and merge.
Date: 2026-09-13. All build/package and test execution: abcdyi.

## Implementation
- Expiring, hashed API keys with explicit roles, tenant binding, list and revocation.
- RBAC on every protected request; role changes invalidate sessions and API keys.
- Institution identity comes from authentication; isolated database schemas and snapshot-bound proofs prevent cross-tenant access.
- Dedicated external MySQL configuration checks, duplicate schema detection and missing-column startup guard.
- Persisted rate buckets, 64 KiB request limit, tenant metrics, readiness and paginated audit export.
- Transactional outbox with persisted signed identity before broadcast and repeat-safe transport contract. Chain execution status is separate from business state.
- API-only dashboard lifecycle controls; installation wheel includes its static assets.
- Deployment, migration and first administrator instructions in PRODUCTION.md.

## Validation
- 96 Python tests passed; API/engine/adapters coverage 95.24% (minimum 80%).
- JavaScript SDK: two suites passed; line/branch/function coverage 100%.
- Browser: Python and JavaScript SDKs called the live local API and EVM; browser completed signed proof verification, activation, transfer, settlement and audit. Desktop/mobile layout and logout passed.
- Actual Docker context image excludes all eight synthetic secret/state canaries.
- Ruff passed. Service wheel built on abcdyi. Two upstream TestClient deprecation warnings remain.
- No external database, real network transaction, production deployment, package publication or merge was performed.

## Operational limits
Use one API process and one outbox worker per tenant until multi-process concurrency and load are qualified on dedicated MySQL. The outbox transport is an extension contract; no production signer/transport is installed. FAILED/REORGED transactions need operator reconciliation. Reference ERC-8415 projection and the KitLifecycle workflow ledger are separate contracts; the dashboard lifecycle is not a claim of full production projection-profile conformance.

The final production acceptance gates are in FINAL-DELIVERY-REPORT.md. CI/runners and all PR merges belong to Artfi总控.
