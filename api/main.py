"""API clients enter the registry engine; no direct adapter or blockchain calls."""
import json
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field

from adapters.mock import MockAdapter
from api.dashboard import attach_dashboard, auth_for
from engine.database import database
from engine.registry import Registry, RegistryError
from engine.verification import ProofVerifier


class RegisterRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")
    holder: str = Field(min_length=1, max_length=128)
    metadata: dict = Field(default_factory=dict)


class CommandRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    asset_id: str = Field(min_length=1, max_length=64)
    expected_version: int = Field(ge=1)


class UpdateRequest(CommandRequest):
    state: str


class VerifyRequest(CommandRequest):
    issuer: str = Field(min_length=1, max_length=128)
    expires_at: int
    signature: str = Field(min_length=1, max_length=128)


class TransferRequest(CommandRequest):
    holder: str = Field(min_length=1, max_length=128)


def create_app(registry=None):
    @asynccontextmanager
    async def lifespan(application):
        if registry is None:
            url = os.environ.get("KIT_DATABASE_URL", "sqlite+pysqlite:///:memory:")
            application.state.registry = Registry(
                database(url), MockAdapter(),
                ProofVerifier(json.loads(os.environ.get("KIT_PROOF_KEYS", "{}"))),
            )
        application.state.auth = auth_for(application.state.registry)
        try:
            yield
        finally:
            if registry is None:
                application.state.registry.sessions.kw["bind"].dispose()

    application = FastAPI(title="ERC-8415 Native Infrastructure Kit",
                          version="0.1.0", lifespan=lifespan)
    application.state.registry = registry

    @application.exception_handler(RegistryError)
    async def registry_error(request, error):
        return JSONResponse(status_code=error.status, content={"detail": error.message})

    @application.get("/health")
    def health():
        return {"status": "ok"}

    @application.post("/asset/register", status_code=201)
    def register(body: RegisterRequest, request: Request):
        return request.app.state.registry.register(body.id, body.holder, body.metadata)

    @application.get("/asset/{asset_id}/state")
    def state(asset_id: str, request: Request):
        return request.app.state.registry.get(asset_id)

    @application.get("/asset/{asset_id}/holder")
    def holder(asset_id: str, request: Request):
        asset = request.app.state.registry.get(asset_id)
        return {"id": asset_id, "holder": asset["holder"]}

    @application.get("/asset/{asset_id}/history")
    def history(asset_id: str, request: Request):
        return request.app.state.registry.history(asset_id)

    @application.post("/state/update")
    def update(body: UpdateRequest, request: Request):
        return request.app.state.registry.command(
            "update", body.asset_id, body.expected_version, state=body.state
        )

    @application.post("/freeze")
    def freeze(body: CommandRequest, request: Request):
        return request.app.state.registry.command("freeze", body.asset_id, body.expected_version)

    @application.post("/revoke")
    def revoke(body: CommandRequest, request: Request):
        return request.app.state.registry.command("revoke", body.asset_id, body.expected_version)

    @application.post("/settlement")
    def settlement(body: CommandRequest, request: Request):
        return request.app.state.registry.command(
            "settlement", body.asset_id, body.expected_version
        )


    @application.post("/proof/verify")
    def verify(body: VerifyRequest, request: Request):
        return request.app.state.registry.command(
            "verify", body.asset_id, body.expected_version,
            proof={"issuer": body.issuer, "expires_at": body.expires_at, "signature": body.signature},
        )

    @application.post("/transfer")
    def transfer(body: TransferRequest, request: Request):
        return request.app.state.registry.command(
            "transfer", body.asset_id, body.expected_version, holder=body.holder
        )

    attach_dashboard(application)
    return application


app = create_app()
