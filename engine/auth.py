"""Password/session authentication and institutional role enforcement."""
import hashlib
import hmac
import secrets
import time

from sqlalchemy import Integer, String, delete, select
from sqlalchemy.orm import Mapped, mapped_column

from engine.database import Base, Permission
from engine.registry import RegistryError

ROLES = {"ADMIN", "VERIFIER", "CUSTODIAN", "AUDITOR", "VIEWER"}


class User(Base):
    __tablename__ = "users"
    username: Mapped[str] = mapped_column(String(128), primary_key=True)
    password_hash: Mapped[str] = mapped_column(String(256))


class LoginSession(Base):
    __tablename__ = "login_sessions"
    digest: Mapped[str] = mapped_column(String(64), primary_key=True)
    username: Mapped[str] = mapped_column(String(128), index=True)
    csrf: Mapped[str] = mapped_column(String(64))
    expires_at: Mapped[int] = mapped_column(Integer)


def password_hash(password, salt=None):
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), 600000)
    return salt + ":" + digest.hex()


def token_hash(token):
    return hashlib.sha256(token.encode()).hexdigest()


class AuthService:
    def __init__(self, sessions):
        self.sessions = sessions

    def create_user(self, username, password, role):
        if role not in ROLES or not 12 <= len(password) <= 128 or not username.strip():
            raise RegistryError(422, "Invalid user or password policy")
        with self.sessions.begin() as session:
            if session.get(User, username):
                raise RegistryError(409, "User already exists")
            session.add(User(username=username, password_hash=password_hash(password)))
            session.add(Permission(principal=username, role=role, asset_id=None))

    def login(self, username, password):
        with self.sessions.begin() as session:
            user = session.get(User, username)
            saved = user.password_hash if user else ("00" * 16 + ":" + "00" * 32)
            candidate = password_hash(password, saved.split(":")[0])
            if not hmac.compare_digest(candidate, saved):
                raise RegistryError(401, "Invalid credentials")
            token = secrets.token_urlsafe(32)
            csrf = secrets.token_urlsafe(32)
            session.add(LoginSession(digest=token_hash(token), username=username, csrf=csrf,
                                     expires_at=int(time.time()) + 3600))
            return token, csrf

    def identity(self, token):
        with self.sessions() as session:
            record = session.get(LoginSession, token_hash(token or ""))
            if record is None or record.expires_at <= time.time():
                raise RegistryError(401, "Authentication required")
            permission = session.scalar(select(Permission).where(
                Permission.principal == record.username, Permission.asset_id.is_(None)
            ))
            if permission is None:
                raise RegistryError(403, "No permission assigned")
            return {"username": record.username, "role": permission.role, "csrf": record.csrf}

    def logout(self, token):
        with self.sessions.begin() as session:
            session.execute(delete(LoginSession).where(LoginSession.digest == token_hash(token or "")))

    def users(self):
        with self.sessions() as session:
            return [{"username": row.principal, "role": row.role}
                    for row in session.scalars(select(Permission).where(Permission.asset_id.is_(None)))]

    def set_role(self, username, role, actor):
        if role not in ROLES:
            raise RegistryError(422, "Invalid role")
        if username == actor:
            raise RegistryError(409, "Cannot change your own role")
        with self.sessions.begin() as session:
            row = session.scalar(select(Permission).where(
                Permission.principal == username, Permission.asset_id.is_(None)
            ))
            if row is None:
                raise RegistryError(404, "User not found")
            row.role = role
            session.execute(delete(LoginSession).where(LoginSession.username == username))


def authorize(identity, method, path, csrf):
    role = identity["role"]
    if method not in {"GET", "HEAD"} and not hmac.compare_digest(identity["csrf"], csrf or ""):
        raise RegistryError(403, "CSRF validation failed")
    if path.startswith("/admin/") and role != "ADMIN":
        raise RegistryError(403, "Administrator role required")
    if method in {"GET", "HEAD"} or role == "ADMIN" or path == "/auth/logout":
        return
    allowed = ({"/proof/verify"} if role == "VERIFIER" else
               {"/asset/register", "/state/update", "/freeze", "/revoke", "/settlement", "/transfer"}
               if role == "CUSTODIAN" else set())
    if path not in allowed:
        raise RegistryError(403, "Role does not permit this operation")
