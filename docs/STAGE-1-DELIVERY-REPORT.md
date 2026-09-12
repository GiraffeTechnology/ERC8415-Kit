# Stage 1 delivery report

Task: Core asset registry MVP.
Status: Direct abcdyi validation passed; institutional deployment is not yet delivered.
Implementation: assets, asset_history and permissions schema; all eight required endpoints;
mock adapter; optimistic versions; transactional history; frozen/terminal asset rejection.

Tests: 12 passed; 97.80% statement coverage (182 statements, 4 missed).
Lint: PASS. Prior locked dependency audit: no known vulnerabilities.
Evidence: tests/test_registry.py exercises register/query/update/history/freeze/revoke,
settlement, missing IDs, duplicates, invalid inputs, stale versions, and adapter-failure rollback.
Commands: .venv/bin/ruff check api engine adapters tests; .venv/bin/pytest.
Host: abcdYi; dedicated isolated checkout; no database service installed.

Limits: storage validated with isolated in-memory SQLite. Dedicated CTYun MySQL credentials/schema
are not provided, so external MySQL integration is unverified. No actual blockchain finality.
CI dedicated runner remains an external dependency. Two upstream TestClient deprecation warnings.
API is a loopback development service pending Stage 4/6 authentication and deployment controls.

PR stacks on Stage 0 to keep the diff focused; no merge or main push is performed.
Next action: Stage 2 proof verification, strict transition rules and finality records.
