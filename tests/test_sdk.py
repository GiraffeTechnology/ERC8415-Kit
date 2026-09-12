import base64
import time

import httpx
import pytest
from erc8415 import APIError, Client

from engine.verification import proof_message


def test_sdk_api_lifecycle(client):
    sdk = Client("https://testserver", client=client)
    sdk.login("admin", "test-password-only")
    asset = sdk.register("sdk-bond", "custodian")
    assert sdk.holder("sdk-bond")["holder"] == "custodian"
    assert len(sdk.assets()) == 1
    registry = client.app.state.registry
    expiry = int(time.time()) + 300
    signature = base64.b64encode(registry.test_key.sign(proof_message(asset, "test", expiry))).decode()
    sdk.verify("sdk-bond", 1, {"issuer": "test", "expires_at": expiry, "signature": signature})
    sdk.update("sdk-bond", 2, "ACTIVE")
    sdk.transfer("sdk-bond", 3, "new-holder")
    sdk.settle("sdk-bond", 4)
    assert sdk.state("sdk-bond")["state"] == "SETTLED"
    assert len(sdk.history("sdk-bond")) == 5
    with pytest.raises(APIError) as error:
        sdk.freeze("sdk-bond", 5)
    assert error.value.status == 409
    sdk.register("revoked", "holder")
    sdk.freeze("revoked", 1)
    sdk.revoke("revoked", 2)
    sdk.logout()
    with pytest.raises(APIError):
        sdk.assets()
    sdk.close()


def test_sdk_transport_failures():
    with pytest.raises(ValueError):
        Client("http://external.test")
    with pytest.raises(ValueError):
        Client("https://user:pass@example.test")
    def broken(request):
        return httpx.Response(502, text="bad gateway")
    client = httpx.Client(transport=httpx.MockTransport(broken))
    sdk = Client("https://example.test", api_key="synthetic", client=client)
    with pytest.raises(APIError):
        sdk.assets()
    client.close()
    with httpx.Client(transport=httpx.MockTransport(
        lambda request: httpx.Response(422, json={"detail": []})
    )) as transport, pytest.raises(APIError):
        Client("https://example.test", client=transport).assets()
    Client("https://example.test").close()
