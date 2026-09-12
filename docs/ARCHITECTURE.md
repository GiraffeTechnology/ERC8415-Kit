# Architecture and stage boundaries

All asset commands follow API -> Verification Engine -> State Machine -> Adapter -> Blockchain
(or mock) -> Audit. Queries enter the API and read registry/audit projections.
Dashboard and SDK communicate exclusively with the API.

Implementation baseline: Python 3.11+, FastAPI, SQLAlchemy, MySQL via PyMySQL.
An in-memory test database may simulate persistence; deployed database services must use
the dedicated CTYun MySQL host. No database service is installed on abcdyi.
Python engine interfaces are extended stage by stage and frozen upon approval.
Any change to an approved interface requires an Architecture Change Request.

Stage 0 supplies only process health, package layout, development setup and validation.
Stage 1 adds assets, history, permissions and lifecycle via mock adapter.
Stage 2 enforces proof validation, transitions and finality.
Stage 3 adds contracts, Ethereum/L2 adapters and a permissioned chain interface.
Stage 4 adds login, overview, audit and role administration.
Stage 5 adds JavaScript and Python SDKs.
Stage 6 adds tenant isolation, API keys, RBAC, metrics and export.

No real chain transaction or funds are authorized by this plan. Contract tests use local
simulation on abcdyi; any real on-chain operation requires separately established authorization
and Singapore execution. GitHub access from CTYun must traverse the Singapore bridge.
This delivery uses the GitHub connector and SSH source transfer instead.

CI targets a dedicated abcdyi runner label. Runner registration and repository access must be
supplied by the environment owner; a queued workflow is not a passing test.
