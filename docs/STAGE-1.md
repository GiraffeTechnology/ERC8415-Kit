# Stage 1 asset registry

Run the development service on loopback as described in DEVELOPMENT.md.
Default storage is ephemeral in-memory SQLite, strictly for isolated development/testing.
For persistence configure KIT_DATABASE_URL with an external dedicated CTYun MySQL schema.
No MySQL service runs on abcdyi. The kit schema must be isolated from other applications.

POST /asset/register accepts {"id":"bond","holder":"custodian","metadata":{}}.
GET /asset/bond/state returns the full registry snapshot, including version.
GET /asset/bond/holder returns the holder. GET /asset/bond/history returns ordered audit events.
POST /state/update accepts {"asset_id":"bond","expected_version":1,"state":"ACTIVE"}.
POST /freeze, /revoke and /settlement accept asset_id and expected_version.

Every successful mutation increments the version and appends a snapshot plus mock receipt in
the same database transaction. Stale versions, duplicates, missing assets and unsupported
commands fail. Frozen assets allow revocation only; settled/revoked assets are terminal.
Stage 2 will constrain transitions and proof/finality before real adapters are added.

The current adapter is pure simulation. Its deterministic receipt does not represent blockchain
finality. Atomic SQL transactions are not sufficient for remote chain submission; Stage 3 must
implement transaction coordination before enabling a remote adapter.

This stage is a loopback development MVP. Authentication, tenant isolation and institutional
deployment controls are not yet delivered. Do not expose the service publicly.
