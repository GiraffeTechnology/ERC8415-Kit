import base64
import time

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from adapters.mock import MockAdapter
from api.main import create_app
from engine.auth import APIKey, AuthService
from engine.database import database
from engine.operations import Outbox, OutboxAdapter, OutboxWorker
from engine.registry import Registry, RegistryError
from engine.tenancy import tenant_urls
from engine.verification import proof_message


def test_tenant_isolation_and_admin_boundaries(registry):
    other_sessions = database("sqlite+pysqlite:///:memory:")
    other = Registry(other_sessions, MockAdapter(), registry.verifier)
    auth = AuthService(registry.sessions)
    auth.create_user("a-admin", "test-password-only", "ADMIN")
    auth.create_user("b-admin", "test-password-only", "ADMIN", tenant="b")
    app = create_app(registry, {"b": other})
    try:
        with (TestClient(app, base_url="https://testserver") as a,
              TestClient(app, base_url="https://testserver") as b):
            for client, username in [(a, "a-admin"), (b, "b-admin")]:
                r = client.post("/auth/login", json={
                    "username": username, "password": "test-password-only"
                })
                client.headers["X-CSRF-Token"] = r.json()["csrf"]
                assert client.post("/asset/register", json={
                    "id": "same", "holder": username
                }).status_code == 201
            assert a.get("/asset/same/holder").json()["holder"] == "a-admin"
            assert b.get("/asset/same/holder").json()["holder"] == "b-admin"
            assert b.get("/assets", headers={"X-Tenant": "default"}).json()[0]["institution"] == "b"
            assert a.post("/admin/users/b-admin/role", json={"role": "VIEWER"}).status_code == 404
            assert a.get("/admin/users").json() == [{"username": "a-admin", "role": "ADMIN"}]
            exported = b.get("/audit/export").json()
            assert exported["institution"] == "b"
            assert exported["records"][0]["asset"]["holder"] == "b-admin"
            assert b.get("/ready").json()["status"] == "ready"
            assert "kit_http_requests_total" in b.get("/admin/metrics").text
            key = b.post("/admin/keys", json={"role": "VIEWER"}).json()
            assert a.post("/admin/keys/" + key["id"] + "/revoke", json={}).status_code == 404
    finally:
        other_sessions.kw["bind"].dispose()


def test_api_key_lifecycle_and_scopes(client):
    result = client.post("/admin/keys", json={"role": "VIEWER"})
    assert result.status_code == 201
    key = result.json()
    rows = client.get("/admin/keys").json()
    assert len(rows) == 1 and "key" not in rows[0]
    assert client.get("/assets", headers={"Authorization": "Bearer " + key["key"]}).status_code == 200
    assert client.post("/asset/register", json={"id": "x", "holder": "h"},
                       headers={"Authorization": "Bearer " + key["key"]}).status_code == 403
    assert client.post("/admin/keys/" + key["id"] + "/revoke", json={}).status_code == 200
    assert client.get("/assets", headers={"Authorization": "Bearer " + key["key"]}).status_code == 401
    assert client.post("/admin/keys", json={"role": "INVALID"}).status_code == 422


def test_expired_key_and_rate_limit(client):
    key = client.post("/admin/keys", json={"role": "VIEWER"}).json()
    with client.app.state.auth.sessions.begin() as session:
        session.scalar(select(APIKey).where(APIKey.id == key["id"])).expires_at = 1
    assert client.get("/assets", headers={"Authorization": "Bearer " + key["key"]}).status_code == 401
    auth = client.app.state.auth
    auth.rate_limit("test", limit=1)
    with pytest.raises(RegistryError):
        auth.rate_limit("test", limit=1)


def test_body_limit_and_login_throttle(registry):
    with TestClient(create_app(registry)) as client:
        r = client.post("/auth/login", content=b"x" * 65537)
        assert r.status_code == 413
        for _ in range(10):
            assert client.post("/auth/login", json={"username": "bad", "password": "bad"}).status_code == 401
        assert client.post("/auth/login", json={"username": "bad", "password": "bad"}).status_code == 429


def test_cross_institution_proof_rejected(registry):
    asset = registry.register("same", "h", {})
    expiry = int(time.time()) + 60
    proof = {"issuer": "test", "expires_at": expiry,
             "signature": base64.b64encode(
                 registry.test_key.sign(proof_message(asset, "test", expiry))
             ).decode()}
    registry.tenant = "other"
    with pytest.raises(RegistryError):
        registry.command("verify", "same", 1, proof=proof)


def test_production_configuration(monkeypatch):
    monkeypatch.setenv("KIT_ENV", "production")
    with pytest.raises(ValueError):
        tenant_urls()
    monkeypatch.setenv("KIT_DATABASE_URL", "mysql+pymysql://user:password@db.invalid/default")
    assert tenant_urls()["default"].endswith("/default")
    monkeypatch.setenv("KIT_TENANT_DATABASES",
                       '{"b":"mysql+pymysql://user:password@db.invalid/default"}')
    with pytest.raises(ValueError):
        tenant_urls()


class FakeTransport:
    def __init__(self):
        self.prepares = 0
        self.broadcasts = []
        self.fail_once = True

    def prepare(self, operation, payload):
        self.prepares += 1
        return {"transaction_id": "synthetic-hash", "signed_transaction": "synthetic-bytes"}

    def broadcast(self, prepared):
        self.broadcasts.append(prepared["signed_transaction"])
        if self.fail_once:
            self.fail_once = False
            raise ConnectionError("simulated acknowledgement loss")

    def monitor(self, transaction_id):
        return {"transaction_id": transaction_id, "finality": "CONFIRMED"}


def test_outbox_crash_recovery_uses_identical_transaction(registry):
    registry.adapter = OutboxAdapter()
    registry.register("queued", "holder", {})
    assert registry.get("queued")["execution_status"] == "QUEUED"
    with registry.sessions() as session:
        operation_id = session.scalar(select(Outbox.id))
    with pytest.raises(RegistryError):
        registry.command("freeze", "queued", 1)
    transport = FakeTransport()
    worker = OutboxWorker(registry.sessions, transport)
    with pytest.raises(ConnectionError):
        worker.process(operation_id)
    assert worker.process(operation_id) == "CONFIRMED"
    assert worker.process(operation_id) == "CONFIRMED"
    assert transport.prepares == 1
    assert transport.broadcasts == ["synthetic-bytes", "synthetic-bytes"]
    assert registry.get("queued")["version"] == 1
    assert registry.get("queued")["execution_status"] == "CONFIRMED"
    assert registry.history("queued")[-1]["operation"] == "chain_confirmed"
    with pytest.raises(ValueError):
        worker.process("missing")


def test_same_schema_with_different_credentials_rejected(monkeypatch):
    monkeypatch.setenv("KIT_DATABASE_URL", "mysql+pymysql://a:p@db.invalid/schema")
    monkeypatch.setenv("KIT_TENANT_DATABASES",
                       '{"b":"mysql+pymysql://b:q@db.invalid:3306/schema"}')
    with pytest.raises(ValueError, match="distinct database"):
        tenant_urls()


@pytest.mark.parametrize("role,csrf", [("VIEWER", True), ("ADMIN", False)])
def test_authenticated_rejections_are_limited_and_attributed(registry, role, csrf):
    other = Registry(database("sqlite+pysqlite:///:memory:"), MockAdapter())
    auth = AuthService(registry.sessions)
    auth.create_user("rejected", "test-password-only", role, tenant="b")
    auth.create_user("observer", "test-password-only", "ADMIN", tenant="b")
    app = create_app(registry, {"b": other})
    try:
        with (TestClient(app, base_url="https://testserver") as rejected,
              TestClient(app, base_url="https://testserver") as observer):
            token = rejected.post("/auth/login", json={
                "username": "rejected", "password": "test-password-only"
            }).json()["csrf"]
            if csrf:
                rejected.headers["X-CSRF-Token"] = token
            # Leave two requests in the authenticated user's real rate bucket.
            for _ in range(118):
                auth.rate_limit("api:b:rejected")
            for _ in range(2):
                response = rejected.post("/asset/register", json={"id": "x", "holder": "h"},
                                         headers={"X-Tenant": "default"})
                assert response.status_code == 403
            response = rejected.post("/asset/register", json={"id": "x", "holder": "h"})
            assert response.status_code == 429
            assert response.headers["Retry-After"] == "60"
            assert app.state.metrics[("b", 403)] == 2
            assert app.state.metrics[("b", 429)] == 1
            assert ("default", 403) not in app.state.metrics
            assert ("_unauthenticated", 403) not in app.state.metrics
            observer.post("/auth/login", json={
                "username": "observer", "password": "test-password-only"
            })
            assert 'status="403"} 2' in observer.get("/admin/metrics").text
            assert not other.list_assets()
            invalid = observer.get("/assets", headers={
                "Authorization": "Bearer invalid", "X-Tenant": "b"
            })
            assert invalid.status_code == 401
            assert app.state.metrics[("_unauthenticated", 401)] == 1
            assert ("b", 401) not in app.state.metrics
    finally:
        other.sessions.kw["bind"].dispose()


def test_sdk_pagination_over_100_assets_is_tenant_bound(registry):
    from erc8415 import Client

    from engine.database import Asset

    other = Registry(database("sqlite+pysqlite:///:memory:"), MockAdapter())
    auth = AuthService(registry.sessions)
    auth.create_user("default-reader", "test-password-only", "VIEWER")
    auth.create_user("other-reader", "test-password-only", "VIEWER", tenant="b")
    for tenant_registry in (registry, other):
        with tenant_registry.sessions.begin() as session:
            session.add_all([Asset(id=f"asset-{i:03}", holder="holder") for i in range(205)])
    try:
        with TestClient(create_app(registry, {"b": other}), base_url="https://testserver") as http:
            for username, tenant in [("default-reader", "default"), ("other-reader", "b")]:
                sdk = Client("https://testserver", client=http)
                sdk.login(username, "test-password-only")
                records = sdk.assets()
                assert len(records) == 205
                assert len({item["id"] for item in records}) == 205
                assert {item["institution"] for item in records} == {tenant}
                assert records[-1]["id"] == "asset-204"
                assert len(http.get("/assets").json()) == 100
                assert http.get("/assets?limit=100&offset=205").json() == []
                sdk.logout()
    finally:
        other.sessions.kw["bind"].dispose()
