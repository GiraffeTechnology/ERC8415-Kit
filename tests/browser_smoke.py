"""Explicit browser smoke test against an isolated local API and synthetic users."""
import base64
import json
import os
import subprocess
import threading
import time
from pathlib import Path

import uvicorn
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from playwright.sync_api import sync_playwright
from web3 import EthereumTesterProvider, Web3

from adapters.ethereum import LocalEVMAdapter
from adapters.mock import MockAdapter
from api.main import create_app
from engine.auth import AuthService
from engine.database import Asset, database
from engine.registry import Registry
from engine.verification import ProofVerifier, proof_message
from sdk.python.erc8415 import Client

sessions = database("sqlite+pysqlite:///:memory:")
chain = Web3(EthereumTesterProvider())
artifact = json.loads(Path("contracts/out/KitLifecycle.json").read_text())
factory = chain.eth.contract(abi=artifact["abi"], bytecode=artifact["evm"]["bytecode"]["object"])
receipt = chain.eth.wait_for_transaction_receipt(factory.constructor().transact({"from": chain.eth.accounts[0]}))
contract = chain.eth.contract(address=receipt.contractAddress, abi=artifact["abi"])
signer = Ed25519PrivateKey.generate()
verifier = ProofVerifier({"browser": base64.b64encode(signer.public_key().public_bytes_raw()).decode()})
registry = Registry(sessions, LocalEVMAdapter(chain, contract, chain.eth.accounts[0]), verifier)
AuthService(sessions).create_user("demo-admin", "browser-test-only-2026", "ADMIN")
registry.register("INSTITUTION-BOND-001", "Northbridge Custody", {})
registry.register("REGISTRY-NOTE-002", "Institutional Trust", {})
other = Registry(database("sqlite+pysqlite:///:memory:"), MockAdapter())
with other.sessions.begin() as session:
    session.add(Asset(id="FOREIGN-INSTITUTION", holder="Other"))
app = create_app(registry, {"b": other})
server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=18415, log_level="error"))
thread = threading.Thread(target=server.run, daemon=True)
thread.start()
try:
    for _ in range(100):
        if server.started:
            break
        time.sleep(0.05)
    assert server.started
    identity = {"username": "demo-admin", "role": "ADMIN", "tenant": "default"}
    key = AuthService(sessions).issue_key(identity, "ADMIN", 600)["key"]
    sdk = Client("http://127.0.0.1:18415", api_key=key)
    assert sdk.register("PYTHON-SDK", "SDK Custodian")["state"] == "REGISTERED"
    assert sdk.freeze("PYTHON-SDK", 1)["frozen"]
    assert sdk.revoke("PYTHON-SDK", 2)["state"] == "REVOKED"
    sdk.close()
    subprocess.run(["node", "--input-type=module", "-e",
                    ('import {Client} from "./sdk/javascript/index.js";'
                    'const c=new Client("http://127.0.0.1:18415",{apiKey:process.env.KIT_TEST_KEY});'
                    'await c.register("JS-SDK","SDK Custodian");'
                    'await c.freeze("JS-SDK",1);'
                    'if((await c.revoke("JS-SDK",2)).state!=="REVOKED")throw Error("state");')],
                   env={**os.environ, "KIT_TEST_KEY": key}, check=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=os.environ.get("KIT_BROWSER_PATH"),
                                    headless=True, args=["--no-sandbox"])
        page = browser.new_page(viewport={"width": 1440, "height": 1050})
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto("http://127.0.0.1:18415")
        page.get_by_label("Username", exact=True).first.fill("demo-admin")
        page.get_by_label("Password", exact=True).fill("browser-test-only-2026")
        page.get_by_role("button", name="Sign in", exact=True).click()
        page.get_by_role("heading", name="Asset register", exact=True).wait_for()
        page.get_by_role("button", name="INSTITUTION-BOND-001", exact=True).click()
        page.get_by_role("heading", name="Audit · INSTITUTION-BOND-001").wait_for()
        assert "LOCAL_EVM" in page.locator("#timeline").inner_text()
        asset = registry.get("INSTITUTION-BOND-001")
        expiry = int(time.time()) + 60
        proof = {"issuer": "browser", "expires_at": expiry,
                 "signature": base64.b64encode(signer.sign(proof_message(asset, "browser", expiry))).decode()}
        page.get_by_label("Signed proof (JSON)").fill(json.dumps(proof))
        for action in ["Verify proof", "Activate"]:
            page.get_by_role("button", name=action, exact=True).click()
            page.get_by_role("status").filter(has_text=action + " completed.").wait_for()
        page.get_by_label("New holder", exact=True).fill("Settlement Custodian")
        for action in ["Transfer", "Settle"]:
            page.get_by_role("button", name=action, exact=True).click()
            page.get_by_role("status").filter(has_text=action + " completed.").wait_for()
        assert registry.get("INSTITUTION-BOND-001")["state"] == "SETTLED"
        assert len(contract.events.AssetChanged().get_logs(from_block=0)) == 12
        page.get_by_label("Asset identifier").fill("BROWSER-CREATED")
        page.get_by_label("Confirmed holder").fill("Browser Custodian")
        page.get_by_role("button", name="Register asset", exact=True).click()
        page.get_by_role("button", name="BROWSER-CREATED", exact=True).wait_for()
        Path("work").mkdir(exist_ok=True)
        page.screenshot(path="work/dashboard-desktop.png", full_page=True)
        page.set_viewport_size({"width": 390, "height": 844})
        assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
        page.screenshot(path="work/dashboard-mobile.png", full_page=True)
        with sessions.begin() as session:
            session.add_all([Asset(id=f"PAGED-{i:03}", holder="Pagination Test") for i in range(105)])
        page.get_by_role("button", name="Refresh", exact=True).click()
        page.get_by_role("button", name="PAGED-104", exact=True).wait_for()
        assert page.locator("#assets tr").count() == 110
        assert "FOREIGN-INSTITUTION" not in page.locator("#assets").inner_text()
        sdk = Client("http://127.0.0.1:18415", api_key=key)
        assert len(sdk.assets()) == 110
        assert all(row["institution"] == "default" for row in sdk.assets())
        sdk.close()
        subprocess.run(["node", "--input-type=module", "-e",
                        ('import {Client} from "./sdk/javascript/index.js";'
                         'const c=new Client("http://127.0.0.1:18415",{apiKey:process.env.KIT_TEST_KEY});'
                         'const rows=await c.assets();'
                         'if(rows.length!==110||rows.some(r=>r.institution!=="default"))'
                         'throw Error("Pagination or institution isolation");')],
                       env={**os.environ, "KIT_TEST_KEY": key}, check=True)
        page.get_by_role("button", name="Sign out", exact=True).click()
        page.get_by_role("button", name="Sign in", exact=True).wait_for()
        assert not errors, errors
        browser.close()
    print("PASS: Python and JS SDK to API to local EVM; browser proof/activate/transfer/settle, audit, registration, responsive layout and logout.")
finally:
    server.should_exit = True
    thread.join(5)
    sessions.kw["bind"].dispose()
    other.sessions.kw["bind"].dispose()
