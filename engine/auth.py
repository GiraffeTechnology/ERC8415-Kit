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
    tenant: Mapped[str] = mapped_column(String(64), default="default", index=True)
    password_hash: Mapped[str] = mapped_column(String(256))


class LoginSession(Base):
    __tablename__ = "login_sessions"
    digest: Mapped[str] = mapped_column(String(64), primary_key=True)
    username: Mapped[str] = mapped_column(String(128), index=True)
    csrf: Mapped[str] = mapped_column(String(64))
    expires_at: Mapped[int] = mapped_column(Integer)


class APIKey(Base):
    __tablename__ = "api_keys"
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    digest: Mapped[str] = mapped_column(String(64), unique=True)
    username: Mapped[str] = mapped_column(String(128), index=True)
    tenant: Mapped[str] = mapped_column(String(64), index=True)
    role: Mapped[str] = mapped_column(String(24))
    expires_at: Mapped[int] = mapped_column(Integer)


class RateBucket(Base):
    __tablename__ = "rate_buckets"
    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    count: Mapped[int] = mapped_column(Integer)
    reset_at: Mapped[int] = mapped_column(Integer)


def password_hash(password, salt=None):
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), 600000)
    return salt + ":" + digest.hex()


def token_hash(token):
    return hashlib.sha256(token.encode()).hexdigest()


class AuthService:
    def __init__(self, sessions):
        self.sessions = sessions
        self.lock = sessions.kit_lock

    def create_user(self, username, password, role, tenant="default"):
        if role not in ROLES or not 12 <= len(password) <= 128 or not username.strip():
            raise RegistryError(422, "Invalid user or password policy")
        with self.lock, self.sessions.begin() as session:
            if session.get(User, username):
                raise RegistryError(409, "User already exists")
            session.add(User(username=username, password_hash=password_hash(password), tenant=tenant))
            session.add(Permission(principal=username, role=role, asset_id=None))

    def login(self, username, password):
        with self.lock, self.sessions.begin() as session:
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
        with self.lock, self.sessions() as session:
            record = session.get(LoginSession, token_hash(token or ""))
            if record is None or record.expires_at <= time.time():
                raise RegistryError(401, "Authentication required")
            permission = session.scalar(select(Permission).where(
                Permission.principal == record.username, Permission.asset_id.is_(None)
            ))
            if permission is None:
                raise RegistryError(403, "No permission assigned")
            user = session.get(User, record.username)
            if user is None:
                raise RegistryError(401, "Authentication required")
            return {"username": record.username, "role": permission.role, "csrf": record.csrf,
                    "tenant": user.tenant, "auth_type": "session"}

    def logout(self, token):
        with self.lock, self.sessions.begin() as session:
            session.execute(delete(LoginSession).where(LoginSession.digest == token_hash(token or "")))

    def users(self, tenant="default"):
        with self.lock, self.sessions() as session:
            return [{"username": row.principal, "role": row.role}
                    for row in session.scalars(select(Permission).join(
                        User, User.username == Permission.principal
                    ).where(Permission.asset_id.is_(None), User.tenant == tenant))]

    def set_role(self, username, role, actor, tenant="default"):
        if role not in ROLES:
            raise RegistryError(422, "Invalid role")
        if username == actor:
            raise RegistryError(409, "Cannot change your own role")
        with self.lock, self.sessions.begin() as session:
            row = session.scalar(select(Permission).where(
                Permission.principal == username, Permission.asset_id.is_(None)
            ))
            user = session.get(User, username)
            if row is None or user is None or user.tenant != tenant:
                raise RegistryError(404, "User not found")
            row.role = role
            session.execute(delete(LoginSession).where(LoginSession.username == username))
            session.execute(delete(APIKey).where(APIKey.username == username))


    def issue_key(self, identity, role, lifetime=86400):
        if role not in ROLES or not 60 <= lifetime <= 90 * 86400:
            raise RegistryError(422, "Invalid key policy")
        token = secrets.token_urlsafe(32)
        key_id = secrets.token_hex(12)
        with self.lock, self.sessions.begin() as session:
            session.add(APIKey(id=key_id, digest=token_hash(token), username=identity["username"],
                               tenant=identity["tenant"], role=role,
                               expires_at=int(time.time()) + lifetime))
        return {"id": key_id, "key": token, "role": role}

    def key_identity(self, token):
        with self.lock, self.sessions() as session:
            key = session.scalar(select(APIKey).where(APIKey.digest == token_hash(token)))
            if key is None or key.expires_at <= time.time():
                raise RegistryError(401, "Invalid API key")
            return {"username": key.username, "tenant": key.tenant, "role": key.role,
                    "csrf": "", "auth_type": "api_key"}

    def keys(self, tenant):
        with self.lock, self.sessions() as session:
            return [{"id": key.id, "role": key.role, "expires_at": key.expires_at}
                    for key in session.scalars(select(APIKey).where(APIKey.tenant == tenant))]

    def revoke_key(self, key_id, tenant):
        with self.lock, self.sessions.begin() as session:
            key = session.get(APIKey, key_id)
            if key is None or key.tenant != tenant:
                raise RegistryError(404, "API key not found")
            session.delete(key)

    def rate_limit(self, key, limit=120):
        current = int(time.time())
        with self.lock, self.sessions.begin() as session:
            digest = token_hash(key)
            row = session.scalar(select(RateBucket).where(
                RateBucket.key == digest
            ).with_for_update())
            if row is None:
                session.add(RateBucket(key=digest, count=1, reset_at=current + 60))
            elif row.reset_at <= current:
                row.count = 1
                row.reset_at = current + 60
            elif row.count >= limit:
                raise RegistryError(429, "Rate limit exceeded")
            else:
                row.count += 1


def authorize(identity, method, path, csrf):
    role = identity["role"]
    if (identity.get("auth_type") != "api_key" and method not in {"GET", "HEAD"}
            and not hmac.compare_digest(identity["csrf"], csrf or "")):
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
