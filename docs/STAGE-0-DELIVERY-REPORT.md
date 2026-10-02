# Stage 0 delivery report

Task: Foundation.
Status: Implemented; direct abcdyi validation passed. PR/CI acceptance remains separate.
Authority main commit: 18a6ef24d59b85333280b2f33655d66779a24abe.
Task specification blob: 13528add10396730b0daaf894ef434fb0cd58664 (v1.0).

Delivered: api, engine, adapters, contracts, dashboard, sdk, tests and docker directories;
health endpoint; installable Python project; resolved dependency lock; CI definition;
architecture and development instructions; Stage 1 implementation plan.

Validation on abcdYi, Python 3.13.5:
- ruff check api engine adapters tests: PASS.
- pytest: 1 passed, 100% statement coverage (5 statements), minimum 80%.
- pip-audit -r requirements.lock: No known vulnerabilities found.
- Editable wheel built successfully in isolated .venv on abcdyi.
Two upstream TestClient deprecation warnings are non-failing.

Evidence: exact test commands are in docs/DEVELOPMENT.md; requirements.lock records all
resolved test dependencies. No blockchain, external database or production deployment was tested.
Docker definition is supplied but image build is not yet validated.

Environment: dedicated /home/dev/workspace/erc8415-kit-delivery. Source was exported using
the GitHub connector, then transferred over SSH. Its local Git root records the authority
snapshot; GitHub implementation commits use the actual upstream parent through the connector.
No CTYun-to-GitHub direct connection was made.

Blocker: dedicated abcdyi GitHub runner registration/routing is not established.
CI must use Singapore bridge for GitHub network access; queued CI is not passing CI.
This does not prevent isolated direct tests or sequential implementation.

Next action: Stage 1 asset registry with a mock adapter and transactionally recorded history.
The current user instruction authorizes sequential execution after passing stage requirements.
