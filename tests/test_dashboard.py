import pytest
from fastapi.testclient import TestClient

from api.main import create_app
from engine.auth import AuthService


def test_static_dashboard_and_auth_boundary(registry):
    with TestClient(create_app(registry), base_url="https://testserver") as client:
        assert client.get("/").status_code == 200
        assert "Content-Security-Policy" in client.get("/").headers
        assert client.get("/dashboard.js").status_code == 200
        assert client.get("/dashboard.css").status_code == 200
        assert client.get("/assets").status_code == 401
        assert client.post("/auth/login", json={"username": "nobody", "password": "wrong"}).status_code == 401


def test_admin_management_and_session_revocation(client):
    assert client.get("/auth/me").json()["role"] == "ADMIN"
    assert client.get("/assets").json() == []
    body = {"username": "auditor", "password": "test-password-only", "role": "AUDITOR"}
    assert client.post("/admin/users", json=body).status_code == 201
    assert client.post("/admin/users", json=body).status_code == 409
    assert len(client.get("/admin/users").json()) == 2
    assert client.post("/admin/users/admin/role", json={"role": "VIEWER"}).status_code == 409
    assert client.post("/admin/users/missing/role", json={"role": "VIEWER"}).status_code == 404
    assert client.post("/admin/users/auditor/role", json={"role": "bad"}).status_code == 422
    assert client.post("/admin/users/auditor/role", json={"role": "VIEWER"}).status_code == 200
    assert client.post("/auth/logout", json={}).status_code == 200
    assert client.get("/assets").status_code == 401


@pytest.mark.parametrize("role", ["VIEWER", "AUDITOR", "VERIFIER", "CUSTODIAN"])
def test_role_permissions(registry, role):
    AuthService(registry.sessions).create_user("person", "test-password-only", role)
    with TestClient(create_app(registry), base_url="https://testserver") as client:
        result = client.post("/auth/login", json={"username": "person", "password": "test-password-only"})
        assert "Secure" in result.headers["set-cookie"]
        assert "HttpOnly" in result.headers["set-cookie"]
        client.headers["X-CSRF-Token"] = result.json()["csrf"]
        assert client.get("/assets").status_code == 200
        assert client.get("/admin/users").status_code == 403
        result = client.post("/asset/register", json={"id": "x", "holder": "h"})
        assert result.status_code == (201 if role == "CUSTODIAN" else 403)


def test_csrf_and_password_policy(client):
    client.headers["X-CSRF-Token"] = "wrong"
    assert client.post("/asset/register", json={"id": "x", "holder": "h"}).status_code == 403
    with pytest.raises(Exception, match="Invalid user"):
        client.app.state.auth.create_user("short", "weak", "VIEWER")
