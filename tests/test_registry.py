import base64
import time

import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from fastapi.testclient import TestClient
from sqlalchemy import inspect

from adapters.mock import MockAdapter
from api.main import create_app
from engine.auth import AuthService
from engine.database import database
from engine.registry import Registry, RegistryError
from engine.verification import ProofVerifier, proof_message


@pytest.fixture
def registry():
    sessions = database("sqlite+pysqlite:///:memory:")
    key = Ed25519PrivateKey.generate()
    instance = Registry(sessions, MockAdapter(), ProofVerifier({
        "test": base64.b64encode(key.public_key().public_bytes_raw()).decode()
    }))
    instance.test_key = key
    yield instance
    sessions.kw["bind"].dispose()


@pytest.fixture
def client(registry):
    AuthService(registry.sessions).create_user("admin", "test-password-only", "ADMIN")
    with TestClient(create_app(registry), base_url="https://testserver") as client:
        login = client.post("/auth/login", json={"username": "admin", "password": "test-password-only"})
        client.headers["X-CSRF-Token"] = login.json()["csrf"]
        yield client


def register(client, name="bond"):
    return client.post("/asset/register", json={"id": name, "holder": "custodian"})


def command(client, path, version, **extra):
    return client.post(path, json={"asset_id": "bond", "expected_version": version, **extra})


def activate(client):
    reg = client.app.state.registry
    asset = reg.get("bond")
    expiry = int(time.time()) + 300
    signature = base64.b64encode(reg.test_key.sign(proof_message(asset, "test", expiry))).decode()
    assert client.post("/proof/verify", json={"asset_id": "bond", "expected_version": 1,
        "issuer": "test", "expires_at": expiry, "signature": signature}).status_code == 200
    assert command(client, "/state/update", 2, state="ACTIVE").json()["version"] == 3


def test_complete_lifecycle(client):
    assert register(client).status_code == 201
    assert client.get("/asset/bond/state").json()["state"] == "REGISTERED"
    assert client.get("/asset/bond/holder").json()["holder"] == "custodian"
    activate(client)
    assert len(client.get("/asset/bond/history").json()) == 3
    assert command(client, "/freeze", 3).json()["frozen"]
    assert command(client, "/revoke", 4).json()["state"] == "REVOKED"
    history = client.get("/asset/bond/history").json()
    assert [row["operation"] for row in history] == ["register", "verify", "update", "freeze", "revoke"]
    assert all(row["record"]["receipt"]["finality"] == "SIMULATED" for row in history)


def test_settlement_and_terminal_rejection(client):
    register(client)
    activate(client)
    assert command(client, "/settlement", 3).json()["state"] == "SETTLED"
    assert command(client, "/freeze", 4).status_code == 409
    assert len(client.get("/asset/bond/history").json()) == 4


@pytest.mark.parametrize("path", ["state", "holder", "history"])
def test_missing_asset(client, path):
    assert client.get("/asset/missing/" + path).status_code == 404


def test_rejections_leave_history_unchanged(client):
    register(client)
    assert register(client).status_code == 409
    assert command(client, "/freeze", 7).status_code == 409
    assert command(client, "/state/update", 1, state="SETTLED").status_code == 422
    assert command(client, "/state/update", 1, state="REGISTERED").status_code == 422
    assert len(client.get("/asset/bond/history").json()) == 1
    assert command(client, "/freeze", 1).status_code == 200
    assert command(client, "/state/update", 2, state="ACTIVE").status_code == 409


def test_invalid_input(client):
    assert client.post("/asset/register", json={"id": "../x", "holder": "x"}).status_code == 422
    assert client.post("/asset/register", json={"id": "x", "holder": ""}).status_code == 422
    assert command(client, "/freeze", 0).status_code == 422


def test_adapter_failure_rolls_back(registry):
    registry.register("bond", "custodian", {})
    class BrokenAdapter:
        def execute(self, operation, asset):
            raise RuntimeError("simulated outage")
    registry.adapter = BrokenAdapter()
    with pytest.raises(RuntimeError):
        registry.command("freeze", "bond", 1)
    assert not registry.get("bond")["frozen"]
    assert len(registry.history("bond")) == 1


def test_unsupported_operation(registry):
    registry.register("bond", "custodian", {})
    with pytest.raises(RegistryError, match="Unsupported"):
        registry.command("invalid", "bond", 1)


def test_storage_schema_and_configuration(registry):
    with registry.sessions() as session:
        assert set(inspect(session.bind).get_table_names()) == {
            "assets", "asset_history", "permissions", "finality_records", "users", "login_sessions"
        }
    with pytest.raises(ValueError):
        database("sqlite:///production.db")


def test_default_lifespan():
    with TestClient(create_app()) as client:
        assert register(client).status_code == 401
