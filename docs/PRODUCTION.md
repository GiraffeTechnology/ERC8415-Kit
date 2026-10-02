# Institutional deployment

CI configuration/runners and all final PR merges belong to the artfi control task.
This document does not authorize or execute deployment, DB provisioning, or real-chain operations.

Build/package only on abcdyi. Serve behind an institution-controlled TLS reverse proxy.
The API binds to loopback in docker/kit.service. Run under a dedicated unprivileged account.
Install the tested lock and wheel; protect the environment file (0600, owned by the service user).
Use KIT_ENV=production. Startup rejects in-memory/local DBs and duplicate tenant database identities.
Each institution gets a distinct schema on the dedicated CTYun MySQL service, never abcdyi.
The default schema holds authentication metadata. Institution administrators cannot select a
tenant in API requests: the authenticated account/key fixes it server-side.

Provision schemas and least-privilege service accounts via the database operator.
Use python -m engine.bootstrap interactively for the initial administrator; no default password.
Provision proof issuer public keys through KIT_PROOF_KEYS. Keep signer keys outside the API.
Configure tenant DSNs through KIT_TENANT_DATABASES using the managed secret channel.

Existing Stage 4 databases require a controlled migration before startup:
ALTER TABLE users ADD COLUMN tenant VARCHAR(64) NOT NULL DEFAULT 'default';
ALTER TABLE assets ADD COLUMN execution_status VARCHAR(24) NOT NULL DEFAULT 'SIMULATED';
Startup checks for missing columns and refuses an outdated schema.
New installations create the tables from the model definitions. Back up and test migrations
on a dedicated disposable schema before touching production. No external migration was run.

API keys: ADMIN creates scoped, expiring keys at POST /admin/keys; plaintext is returned once,
only a digest is stored. Revoke via POST /admin/keys/{id}/revoke. Use Authorization: Bearer.
Role changes revoke sessions and keys. Keys are bound to the issuer's institution.

Requests are limited to 64 KiB before parsing. Login attempts and API requests use persisted
rate buckets. Metrics expose per-institution request totals; audit export is paginated JSON.
Do not log Authorization, cookies, passwords, proof material or secret environment values.

Outbox mode persists operation intent atomically with asset/audit/finality. The worker persists
a signed transaction identity before broadcast and retries the identical signed bytes after a
crash. Only a separately approved transport may provide signing and broadcasting in Singapore.
An operation cannot be followed by another while its outbox is unconfirmed. FAILED/REORGED
requires operator reconciliation; the API does not falsely report chain confirmation.
No real transport or signer is provisioned by this delivery.

Backups: database operator must demonstrate encrypted backup, restore and PITR on the dedicated
MySQL host. Monitor readiness, request/error totals, queued/reorged/failed outbox operations,
schema capacity and certificate expiry. Use separate per-institution on-chain contracts until
an approved shared-contract tenant model exists.

Production acceptance remains blocked until dedicated MySQL integration, restore validation,
TLS/identity/issuer configuration, approved chain/profile and actual coordinator-owned CI pass.
The reference contract's fixed-validator limitations remain documented in STAGE-3.md.
