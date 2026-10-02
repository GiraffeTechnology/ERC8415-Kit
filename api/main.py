"""API clients enter the registry engine; no direct adapter or blockchain calls."""
import json
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field

from adapters.mock import MockAdapter
from api.dashboard import attach_dashboard, auth_for
from api.limits import BodyLimitMiddleware
from engine.database import database
from engine.operations import OutboxAdapter
from engine.registry import Registry, RegistryError
from engine.tenancy import tenant_urls
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


def create_app(registry=None, tenants=None):
    @asynccontextmanager
    async def lifespan(application):
        if registry is None:
            urls = tenant_urls()
            url = urls["default"]
            application.state.registry = Registry(
                database(url), OutboxAdapter() if os.environ.get("KIT_ADAPTER") == "outbox" else MockAdapter(),
                ProofVerifier(json.loads(os.environ.get("KIT_PROOF_KEYS", "{}"))),
            )
        application.state.registries = {"default": application.state.registry, **(tenants or {})}
        if registry is None:
            for tenant, url in urls.items():
                if tenant != "default":
                    application.state.registries[tenant] = Registry(
                        database(url), OutboxAdapter() if os.environ.get("KIT_ADAPTER") == "outbox"
                        else MockAdapter(),
                        ProofVerifier(json.loads(os.environ.get("KIT_PROOF_KEYS", "{}"))),
                    )
        for tenant, item in application.state.registries.items():
            item.tenant = tenant
        application.state.auth = auth_for(application.state.registry)
        application.state.metrics = {}
        try:
            yield
        finally:
            if registry is None:
                for item in application.state.registries.values():
                    item.sessions.kw["bind"].dispose()

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
        return request.state.registry.register(body.id, body.holder, body.metadata)

    @application.get("/asset/{asset_id}/state")
    def state(asset_id: str, request: Request):
        return request.state.registry.get(asset_id)

    @application.get("/asset/{asset_id}/holder")
    def holder(asset_id: str, request: Request):
        asset = request.state.registry.get(asset_id)
        return {"id": asset_id, "holder": asset["holder"]}

    @application.get("/asset/{asset_id}/history")
    def history(asset_id: str, request: Request):
        return request.state.registry.history(asset_id)

    @application.post("/state/update")
    def update(body: UpdateRequest, request: Request):
        return request.state.registry.command(
            "update", body.asset_id, body.expected_version, state=body.state
        )

    @application.post("/freeze")
    def freeze(body: CommandRequest, request: Request):
        return request.state.registry.command("freeze", body.asset_id, body.expected_version)

    @application.post("/revoke")
    def revoke(body: CommandRequest, request: Request):
        return request.state.registry.command("revoke", body.asset_id, body.expected_version)

    @application.post("/settlement")
    def settlement(body: CommandRequest, request: Request):
        return request.state.registry.command(
            "settlement", body.asset_id, body.expected_version
        )


    @application.post("/proof/verify")
    def verify(body: VerifyRequest, request: Request):
        return request.state.registry.command(
            "verify", body.asset_id, body.expected_version,
            proof={"issuer": body.issuer, "expires_at": body.expires_at, "signature": body.signature},
        )

    @application.post("/transfer")
    def transfer(body: TransferRequest, request: Request):
        return request.state.registry.command(
            "transfer", body.asset_id, body.expected_version, holder=body.holder
        )

    attach_dashboard(application)
    application.add_middleware(BodyLimitMiddleware)
    return application


app = create_app()
