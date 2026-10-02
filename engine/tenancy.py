"""Schema-per-tenant isolation and fail-closed production configuration."""
import json
import os
from urllib.parse import unquote, urlsplit

from engine.registry import RegistryError


def tenant_urls():
    production = os.environ.get("KIT_ENV") == "production"
    default = os.environ.get("KIT_DATABASE_URL", "sqlite+pysqlite:///:memory:")
    urls = {"default": default, **json.loads(os.environ.get("KIT_TENANT_DATABASES", "{}"))}
    if not all(isinstance(k, str) and k and isinstance(v, str) for k, v in urls.items()):
        raise ValueError("Invalid tenant database mapping")
    persistent = [
        (parsed.hostname, parsed.port or 3306, unquote(parsed.path).rstrip("/"))
        for url in urls.values() if not url.endswith(":memory:")
        for parsed in [urlsplit(url)]
    ]
    if len(persistent) != len(set(persistent)):
        raise ValueError("Each tenant requires a distinct database schema")
    if production:
        for url in urls.values():
            parsed = urlsplit(url)
            if parsed.scheme != "mysql+pymysql" or parsed.hostname in {
                None, "localhost", "127.0.0.1", "::1"
            } or not parsed.path.strip("/"):
                raise ValueError("Production requires dedicated external MySQL schemas")
    return urls


def tenant_registry(registries, tenant):
    if tenant not in registries:
        raise RegistryError(403, "Institution is not configured")
    return registries[tenant]
