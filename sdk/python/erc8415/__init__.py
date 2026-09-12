"""Institutional API client; no direct blockchain dependency."""
from urllib.parse import quote, urlsplit

import httpx


class APIError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status


class Client:
    def __init__(self, base_url, api_key=None, timeout=10, client=None):
        url = urlsplit(base_url)
        if url.username or url.password or (url.scheme != "https" and not (
            url.scheme == "http" and url.hostname in {"localhost", "127.0.0.1", "::1"}
        )):
            raise ValueError("Use HTTPS or a loopback development URL")
        self.base_url = base_url.rstrip("/")
        self.client = client or httpx.Client(timeout=timeout)
        self.owned = client is None
        self.headers = {"Authorization": "Bearer " + api_key} if api_key else {}

    def close(self):
        if self.owned:
            self.client.close()

    def request(self, method, path, body=None):
        response = self.client.request(method, self.base_url + path, json=body, headers=self.headers)
        try:
            data = response.json()
        except ValueError as error:
            raise APIError(response.status_code, "Invalid API response") from error
        if response.status_code >= 400:
            detail = data.get("detail")
            raise APIError(response.status_code,
                           detail if isinstance(detail, str) else "API request failed")
        return data

    def login(self, username, password):
        result = self.request("POST", "/auth/login", {"username": username, "password": password})
        self.headers["X-CSRF-Token"] = result["csrf"]
        return result

    def logout(self):
        result = self.request("POST", "/auth/logout", {})
        self.headers.pop("X-CSRF-Token", None)
        return result

    def register(self, asset_id, holder, metadata=None):
        return self.request("POST", "/asset/register",
                            {"id": asset_id, "holder": holder, "metadata": metadata or {}})

    def state(self, asset_id):
        return self.request("GET", "/asset/" + quote(asset_id, safe="") + "/state")

    def holder(self, asset_id):
        return self.request("GET", "/asset/" + quote(asset_id, safe="") + "/holder")

    def history(self, asset_id):
        return self.request("GET", "/asset/" + quote(asset_id, safe="") + "/history")

    def assets(self):
        return self.request("GET", "/assets")

    def command(self, path, asset_id, version, **extra):
        return self.request("POST", path, {**extra, "asset_id": asset_id, "expected_version": version})

    def update(self, asset_id, version, state):
        return self.command("/state/update", asset_id, version, state=state)

    def verify(self, asset_id, version, proof):
        return self.command("/proof/verify", asset_id, version, **proof)

    def transfer(self, asset_id, version, holder):
        return self.command("/transfer", asset_id, version, holder=holder)

    def freeze(self, asset_id, version):
        return self.command("/freeze", asset_id, version)

    def revoke(self, asset_id, version):
        return self.command("/revoke", asset_id, version)

    def settle(self, asset_id, version):
        return self.command("/settlement", asset_id, version)
