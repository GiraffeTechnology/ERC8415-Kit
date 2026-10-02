"""Version-bound institutional attestations and explicit lifecycle rules."""
import base64
import hashlib
import json
import time

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

from engine.registry import RegistryError

TRANSITIONS = {
    "REGISTERED": {"VERIFIED", "REVOKED"},
    "VERIFIED": {"ACTIVE", "REVOKED"},
    "ACTIVE": {"TRANSFERRED", "SETTLED", "REVOKED"},
    "TRANSFERRED": {"ACTIVE", "SETTLED", "REVOKED"},
    "SETTLED": set(),
    "REVOKED": set(),
}


def validate_transition(current, target):
    if target not in TRANSITIONS.get(current, set()):
        raise RegistryError(409, "Invalid state transition")


def proof_message(asset, issuer, expires_at):
    return json.dumps(
        {"domain": "erc8415-kit:proof:v1", "asset": asset,
         "issuer": issuer, "expires_at": expires_at},
        sort_keys=True, separators=(",", ":"), ensure_ascii=True,
    ).encode()


class ProofVerifier:
    def __init__(self, trusted_keys=None, clock=time.time):
        self.trusted_keys = trusted_keys or {}
        self.clock = clock

    def verify(self, asset, issuer, expires_at, signature):
        if issuer not in self.trusted_keys:
            raise RegistryError(422, "Untrusted proof issuer")
        if expires_at <= self.clock() or expires_at > self.clock() + 86400:
            raise RegistryError(422, "Proof expiry outside permitted window")
        message = proof_message(asset, issuer, expires_at)
        try:
            key = Ed25519PublicKey.from_public_bytes(
                base64.b64decode(self.trusted_keys[issuer], validate=True)
            )
            key.verify(base64.b64decode(signature, validate=True), message)
        except (ValueError, InvalidSignature) as error:
            raise RegistryError(422, "Invalid proof signature") from error
        return {"issuer": issuer, "expires_at": expires_at,
                "digest": hashlib.sha256(message).hexdigest()}
