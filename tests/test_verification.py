import base64
import time

import pytest
from sqlalchemy import select
from test_registry import activate, command, register

from engine.database import Finality
from engine.registry import RegistryError
from engine.verification import TRANSITIONS, ProofVerifier, proof_message, validate_transition


@pytest.mark.parametrize("source", list(TRANSITIONS))
@pytest.mark.parametrize("target", list(TRANSITIONS))
def test_transition_matrix(source, target):
    if target in TRANSITIONS[source]:
        validate_transition(source, target)
    else:
        with pytest.raises(RegistryError):
            validate_transition(source, target)


def test_cannot_skip_verification(client):
    register(client)
    assert command(client, "/state/update", 1, state="ACTIVE").status_code == 409
    assert command(client, "/state/update", 1, state="VERIFIED").status_code == 422
    assert command(client, "/settlement", 1).status_code == 409


@pytest.mark.parametrize("fault", ["issuer", "expiry", "future", "signature", "tamper"])
def test_proof_rejection(registry, fault):
    asset = registry.register("bond", "custodian", {})
    expiry = int(time.time()) + 300
    sig = base64.b64encode(registry.test_key.sign(proof_message(asset, "test", expiry))).decode()
    proof = {"issuer": "test", "expires_at": expiry, "signature": sig}
    if fault == "issuer":
        proof["issuer"] = "unknown"
    elif fault == "expiry":
        proof["expires_at"] = 1
    elif fault == "future":
        proof["expires_at"] = expiry + 90000
    elif fault == "signature":
        proof["signature"] = "not base64"
    else:
        proof["expires_at"] += 1
    with pytest.raises(RegistryError):
        registry.command("verify", "bond", 1, proof=proof)
    assert registry.get("bond")["state"] == "REGISTERED"
    assert len(registry.history("bond")) == 1


def test_transfer_settlement_and_finality(client):
    register(client)
    activate(client)
    assert command(client, "/transfer", 3, holder="custodian").status_code == 422
    assert command(client, "/transfer", 3, holder="new-holder").json()["state"] == "TRANSFERRED"
    assert command(client, "/settlement", 4).json()["state"] == "SETTLED"
    reg = client.app.state.registry
    assert reg.get("bond")["holder"] == "new-holder"
    with reg.sessions() as session:
        rows = session.scalars(select(Finality)).all()
        assert len(rows) == 5
        assert all(row.status == "SIMULATED" for row in rows)
    assert reg.history("bond")[1]["record"]["proof"]["issuer"] == "test"


def test_unconfigured_verifier(registry):
    registry.register("bond", "custodian", {})
    registry.verifier = None
    with pytest.raises(RegistryError):
        registry.command("verify", "bond", 1, proof={})


def test_empty_trust_store():
    with pytest.raises(RegistryError):
        ProofVerifier().verify({}, "unknown", int(time.time()) + 30, "x")
