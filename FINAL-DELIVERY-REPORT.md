# ERC-8415 Kit final engineering delivery

Date: 2026-09-13
Status: Stage 0–6 engineering implementation and local acceptance complete; production acceptance pending.
Authority: CODEX-AUTONOMOUS-DEVELOPMENT-TASK.md v1.0, AGENTS.md and docs/PRD.md.
No direct push to main. CI and merges are owned by Artfi总控.

## Architecture
API, Python SDK, JavaScript SDK and same-origin dashboard -> authenticated tenant/RBAC boundary -> verification and versioned state engine -> adapter -> transactional audit/finality.
Mock mode and the in-process EVM are explicit test modes. Queued operations carry independent execution status. Production institutions require separate schemas on dedicated CTYun MySQL, never abcdyi. Real-chain transport must run through the approved Singapore environment and requires separate authorization.

ERC-8415 draft authority was read at GiraffeTechnology/ERCs commit c9bf1a59c3e65e791fcdeddd79c185128ae02ce3. The unchanged CC0 reference contract provides ERC-721 ownership, confirmed-holder projection, transfer-gap and settlement evidence semantics. KitLifecycle separately implements the requested register/update/freeze/revoke/settle workflow. It does not advertise the reference projection interface. The reference fixed-validator assumptions and the production profile gap are documented in docs/STAGE-3.md.

## Stage delivery
| Stage | Delivered | PR |
|---|---|---|
| 0 | Repository structure, API baseline, locks, Docker and test foundation | #1 |
| 1 | Asset registration, state, holder and audit API | #2 |
| 2 | Signed proof validation, state graph, transfer and settlement | #3 |
| 3 | Solidity contracts, Ethereum/L2/permissioned adapter boundaries and monitoring | #4 |
| 4 | Login, asset register, audit and role administration | #5 |
| 5 | @erc8415/sdk and erc8415 packages, examples and API documentation | #6 |
| 6 | API keys, institution isolation, metrics, audit export and operational controls | codex/stage6-infrastructure |

Each stage has a docs/STAGE-N-DELIVERY-REPORT.md and a focused stacked PR. Review/merge in order. Earlier reports record stage-local evidence; the final result below supersedes their aggregate test counts. Docker-context and provider-binding review fixes were propagated across the stack.

## Tests and build evidence
On abcdyi: 96 Python tests passed, 95.24% combined API/engine/adapters coverage. Minimum required: 80%. JavaScript SDK tests passed with 100% line, branch and function coverage. Ruff passed. Two upstream TestClient deprecation warnings do not fail the suite.
Required API integration: register -> trusted proof -> activate -> settlement -> audit.
Blockchain integration: deploy in-process EVM contracts -> execute transactions -> assert events. Additional tests mutate proof fields, distinguish owner from confirmed holder, and verify gap/settlement behavior.
Final live integration: both SDKs -> local HTTP API -> EVM; browser -> verify -> activate -> transfer -> settle -> audit. Screenshots include desktop and mobile. No frontend wallet or direct chain call.
Actual Docker context-image inspection excluded eight synthetic secret/state canaries.
Service wheel and both SDK packages were built on abcdyi; nothing was published publicly.
These are direct test results, not a claim that GitHub CI has passed.

## Deployment
See docs/PRODUCTION.md and docker/kit.service.
1. Database operator provisions dedicated per-institution MySQL schemas, least-privilege accounts and validates backup/restore. Supply secrets through the managed channel.
2. Install requirements.lock and the erc8415-kit wheel on the authorized target. Set KIT_ENV=production and tenant DSNs; apply documented migrations on a disposable schema first.
3. Run python -m engine.bootstrap interactively against the default authentication schema, setting KIT_TENANT for additional institution administrators.
4. Provision trusted proof public keys and institution TLS. Bind the API to loopback behind the TLS proxy.
5. Configure KIT_ADAPTER=outbox only with a separately reviewed Singapore signer/transport and explicit real-chain authorization.
6. Complete coordinator-owned CI, review, production acceptance and merge. No production deployment was executed by this task.

## Demo on abcdyi
From the isolated checkout with the development lock installed:
- Compile contracts: cd contracts && npm ci && node compile.cjs.
- Run the unit/integration suite: .venv/bin/pytest -q.
- Run SDK checks from sdk/javascript: npm test.
- Run tests/browser_smoke.py with PYTHONPATH=. and KIT_BROWSER_PATH pointing to the installed headless Chromium.
The smoke script starts an ephemeral loopback API, creates synthetic users/keys, deploys only an in-process EVM and shuts down afterward. It produces work/dashboard-desktop.png and work/dashboard-mobile.png. Its test password and signer are synthetic and are not production credentials.

## Remaining production acceptance
- Dedicated CTYun MySQL integration, migration, concurrent-worker qualification and backup/restore evidence.
- Institution TLS, identity/issuer configuration, key custody and production signing/transport.
- Approved ERC-8415 projection and settlement profile, including validator/finality trust policy; the lifecycle demo is not production profile certification.
- Load, operational monitoring, reconciliation and deployment acceptance in the target environment.
- Actual GitHub CI and all final merges, assigned to Artfi总控.
Until these are satisfied, this is a verified engineering candidate, not a production-ready institutional service.
