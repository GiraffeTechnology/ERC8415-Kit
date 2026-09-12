"""Same-origin dashboard and session routes."""
from pathlib import Path

from fastapi import Request, Response
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from engine.auth import AuthService, authorize
from engine.registry import RegistryError

ROOT = Path(__file__).resolve().parent.parent / "dashboard"


class Login(BaseModel):
    username: str = Field(min_length=1, max_length=128)
    password: str = Field(min_length=1, max_length=128)


class NewUser(Login):
    role: str


class RoleUpdate(BaseModel):
    role: str


def attach_dashboard(app, secure_cookie=True):
    from fastapi.responses import JSONResponse

    @app.middleware("http")
    async def authenticate(request, call_next):
        path = request.url.path
        if path not in {"/health", "/", "/dashboard.js", "/dashboard.css", "/auth/login"}:
            try:
                auth = request.app.state.auth
                identity = auth.identity(request.cookies.get("kit_session"))
                authorize(identity, request.method, path, request.headers.get("x-csrf-token"))
                request.state.identity = identity
            except RegistryError as error:
                return JSONResponse({"detail": error.message}, status_code=error.status)
        response = await call_next(request)
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; script-src 'self'; style-src 'self'; "
            "object-src 'none'; frame-ancestors 'none'; base-uri 'none'"
        )
        response.headers["X-Content-Type-Options"] = "nosniff"
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
    def assets(request: Request):
        return request.app.state.registry.list_assets()

    @app.get("/admin/users")
    def users(request: Request):
        return request.app.state.auth.users()

    @app.post("/admin/users", status_code=201)
    def create_user(body: NewUser, request: Request):
        request.app.state.auth.create_user(body.username, body.password, body.role)
        return {"username": body.username, "role": body.role}

    @app.post("/admin/users/{username}/role")
    def set_role(username: str, body: RoleUpdate, request: Request):
        request.app.state.auth.set_role(username, body.role, request.state.identity["username"])
        return {"username": username, "role": body.role}


def auth_for(registry):
    return AuthService(registry.sessions)
