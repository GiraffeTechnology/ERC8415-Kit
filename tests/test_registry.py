import pytest
from fastapi.testclient import TestClient
from sqlalchemy import inspect

from adapters.mock import MockAdapter
from api.main import create_app
from engine.database import database
from engine.registry import Registry, RegistryError


@pytest.fixture
def registry():
    sessions = database("sqlite+pysqlite:///:memory:")
    yield Registry(sessions, MockAdapter())
    sessions.kw["bind"].dispose()


@pytest.fixture
def client(registry):
    with TestClient(create_app(registry)) as client:
        yield client


def register(client, name="bond"):
    return client.post("/asset/register", json={"id": name, "holder": "custodian"})


def command(client, path, version, **extra):
    return client.post(path, json={"asset_id": "bond", "expected_version": version, **extra})


def test_complete_lifecycle(client):
    assert register(client).status_code == 201
    assert client.get("/asset/bond/state").json()["state"] == "REGISTERED"
    assert client.get("/asset/bond/holder").json()["holder"] == "custodian"
    assert command(client, "/state/update", 1, state="ACTIVE").json()["version"] == 2
    assert len(client.get("/asset/bond/history").json()) == 2
    assert command(client, "/freeze", 2).json()["frozen"]
    assert command(client, "/revoke", 3).json()["state"] == "REVOKED"
    history = client.get("/asset/bond/history").json()
    assert [row["operation"] for row in history] == ["register", "update", "freeze", "revoke"]
    assert all(row["record"]["receipt"]["finality"] == "SIMULATED" for row in history)


def test_settlement_and_terminal_rejection(client):
    register(client)
    assert command(client, "/settlement", 1).json()["state"] == "SETTLED"
    assert command(client, "/freeze", 2).status_code == 409
    assert len(client.get("/asset/bond/history").json()) == 2


@pytest.mark.parametrize("path", ["state", "holder", "history"])
def test_missing_asset(client, path):
    assert client.get("/asset/missing/" + path).status_code == 404


def test_rejections_leave_history_unchanged(client):
    register(client)
    assert register(client).status_code == 409
    assert command(client, "/freeze", 7).status_code == 409
    assert command(client, "/state/update", 1, state="SETTLED").status_code == 422
    assert command(client, "/state/update", 1, state="REGISTERED").status_code == 409
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
            "assets", "asset_history", "permissions"
        }
    with pytest.raises(ValueError):
        database("sqlite:///production.db")


def test_default_lifespan():
    with TestClient(create_app()) as client:
        assert register(client).status_code == 201
