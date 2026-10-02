"""Same-origin institutional interface with tenant-bound authentication."""
from pathlib import Path

from fastapi import Query, Request, Response
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from engine.auth import AuthService, authorize
from engine.registry import RegistryError
from engine.tenancy import tenant_registry

ROOT = Path(__file__).resolve().parent.parent / "dashboard"


class Login(BaseModel):
    username: str = Field(min_length=1, max_length=128)
    password: str = Field(min_length=1, max_length=128)


class NewUser(Login):
    role: str


class RoleUpdate(BaseModel):
    role: str


class KeyRequest(BaseModel):
    role: str
    lifetime: int = Field(default=86400, ge=60, le=7776000)


def attach_dashboard(app, secure_cookie=True):
    @app.middleware("http")
    async def authenticate(request, call_next):
        path = request.url.path
        tenant = "_unauthenticated"
        try:
            if path == "/auth/login":
                request.app.state.auth.rate_limit("login:" + request.client.host, limit=10)
            if path not in {"/health", "/", "/dashboard.js", "/dashboard.css", "/auth/login"}:
                auth = request.app.state.auth
                bearer = request.headers.get("authorization", "")
                identity = (auth.key_identity(bearer[7:]) if bearer.startswith("Bearer ")
                            else auth.identity(request.cookies.get("kit_session")))
                tenant = identity["tenant"]
                request.state.identity = identity
                request.state.registry = tenant_registry(request.app.state.registries, tenant)
                auth.rate_limit("api:" + tenant + ":" + identity["username"])
                authorize(identity, request.method, path, request.headers.get("x-csrf-token"))
            response = await call_next(request)
        except RegistryError as error:
            response = JSONResponse({"detail": error.message}, status_code=error.status)
            if error.status == 429:
                response.headers["Retry-After"] = "60"
        metrics = getattr(request.app.state, "metrics", {})
        key = (tenant, response.status_code)
        metrics[key] = metrics.get(key, 0) + 1
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; script-src 'self'; style-src 'self'; "
            "object-src 'none'; frame-ancestors 'none'; base-uri 'none'"
        )
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Strict-Transport-Security"] = "max-age=31536000"
        response.headers["Cache-Control"] = "no-store"
        return response

    @app.get("/", include_in_schema=False)
    def dashboard():
        return FileResponse(ROOT / "index.html")

    @app.get("/dashboard.js", include_in_schema=False)
    def javascript():
        return FileResponse(ROOT / "dashboard.js", media_type="text/javascript")

    @app.get("/dashboard.css", include_in_schema=False)
    def styles():
        return FileResponse(ROOT / "dashboard.css", media_type="text/css")

    @app.post("/auth/login")
    def login(body: Login, request: Request, response: Response):
        token, csrf = request.app.state.auth.login(body.username, body.password)
        response.set_cookie("kit_session", token, httponly=True, secure=secure_cookie,
                            samesite="strict", max_age=3600)
        return {"csrf": csrf}

    @app.get("/auth/me")
    def me(request: Request):
        return request.state.identity

    @app.post("/auth/logout")
    def logout(request: Request, response: Response):
        request.app.state.auth.logout(request.cookies.get("kit_session"))
        response.delete_cookie("kit_session", secure=secure_cookie, httponly=True, samesite="strict")
        return {"status": "signed out"}

    @app.get("/assets")
    def assets(request: Request, limit: int = Query(100, ge=1, le=1000),
               offset: int = Query(0, ge=0)):
        return request.state.registry.list_assets(limit, offset)

    @app.get("/admin/users")
    def users(request: Request):
        return request.app.state.auth.users(request.state.identity["tenant"])

    @app.post("/admin/users", status_code=201)
    def create_user(body: NewUser, request: Request):
        request.app.state.auth.create_user(
            body.username, body.password, body.role, request.state.identity["tenant"]
        )
        return {"username": body.username, "role": body.role}

    @app.post("/admin/users/{username}/role")
    def set_role(username: str, body: RoleUpdate, request: Request):
        identity = request.state.identity
        request.app.state.auth.set_role(username, body.role, identity["username"], identity["tenant"])
        return {"username": username, "role": body.role}

    @app.post("/admin/keys", status_code=201)
    def issue_key(body: KeyRequest, request: Request):
        return request.app.state.auth.issue_key(request.state.identity, body.role, body.lifetime)

    @app.get("/admin/keys")
    def keys(request: Request):
        return request.app.state.auth.keys(request.state.identity["tenant"])

    @app.post("/admin/keys/{key_id}/revoke")
    def revoke_key(key_id: str, request: Request):
        request.app.state.auth.revoke_key(key_id, request.state.identity["tenant"])
        return {"status": "revoked"}

    @app.get("/admin/metrics", response_class=PlainTextResponse)
    def metrics(request: Request):
        tenant = request.state.identity["tenant"]
        values = request.app.state.metrics
        return "\n".join(
            f'kit_http_requests_total{{status="{status}"}} {count}'
            for (item, status), count in sorted(values.items()) if item == tenant
        ) + "\n"

    @app.get("/audit/export")
    def export(request: Request, limit: int = Query(100, ge=1, le=1000),
               offset: int = Query(0, ge=0)):
        registry = request.state.registry
        assets = registry.list_assets(limit, offset)
        return JSONResponse(
            {"institution": request.state.identity["tenant"], "offset": offset,
             "next_offset": offset + len(assets) if len(assets) == limit else None,
             "records": [{"asset": asset, "history": registry.history(asset["id"])}
                         for asset in assets]},
            headers={"Content-Disposition": 'attachment; filename="audit.json"'},
        )

    @app.get("/ready")
    def ready(request: Request):
        try:
            with request.state.registry.sessions() as session:
                session.execute(text("SELECT 1"))
        except SQLAlchemyError:
            return JSONResponse({"status": "unavailable"}, status_code=503)
        return {"status": "ready"}


def auth_for(registry):
    return AuthService(registry.sessions)
