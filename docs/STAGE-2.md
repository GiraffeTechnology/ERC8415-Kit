# Stage 2 verification and finality

Proof verification uses Ed25519 institutional attestations with an operator-configured public
key allowlist. KIT_PROOF_KEYS is a JSON mapping from issuer names to base64 raw Ed25519 public
keys. No private key belongs in the API, repository or environment template.

Sign engine.verification.proof_message(snapshot, issuer, expires_at). It includes a domain,
complete asset snapshot and optimistic version. Expiry must be in the next 24 hours.
POST /proof/verify takes asset_id, expected_version, issuer, expires_at and base64 signature.
A valid attestation changes REGISTERED to VERIFIED. Replays fail the version/state checks.
A signature demonstrates an authorized attestation, not independent truth about a physical asset.

Allowed transitions:
REGISTERED -> VERIFIED or REVOKED;
VERIFIED -> ACTIVE or REVOKED;
ACTIVE -> TRANSFERRED, SETTLED or REVOKED;
TRANSFERRED -> ACTIVE, SETTLED or REVOKED.
SETTLED and REVOKED are terminal. Freeze is an independent guard; a frozen asset may only revoke.
POST /state/update now only accepts ACTIVE. Verification and transfer use dedicated commands.
POST /transfer takes asset_id, expected_version and a different holder.

Every mutation adds a finality_records entry in the same SQL transaction as audit and asset.
Mock entries are SIMULATED, never chain-confirmed. Stage 3 extends receipt monitoring.
This extends the unapproved Stage 1 candidate to enforce Stage 2 requirements; no frozen
approved interface has been rewritten. Endpoint shapes from Stage 1 remain available.
