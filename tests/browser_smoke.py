"""Explicit browser smoke test against an isolated local API and synthetic users."""
import os
import threading
import time
from pathlib import Path

import uvicorn
from playwright.sync_api import sync_playwright

from adapters.mock import MockAdapter
from api.main import create_app
from engine.auth import AuthService
from engine.database import database
from engine.registry import Registry

sessions = database("sqlite+pysqlite:///:memory:")
registry = Registry(sessions, MockAdapter())
AuthService(sessions).create_user("demo-admin", "browser-test-only-2026", "ADMIN")
registry.register("INSTITUTION-BOND-001", "Northbridge Custody", {})
registry.register("REGISTRY-NOTE-002", "Institutional Trust", {})
app = create_app(registry)
server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=18415, log_level="error"))
thread = threading.Thread(target=server.run, daemon=True)
thread.start()
try:
    for _ in range(100):
        if server.started:
            break
        time.sleep(0.05)
    assert server.started
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
        assert "SIMULATED" in page.locator("#timeline").inner_text()
        page.get_by_label("Asset identifier").fill("BROWSER-CREATED")
        page.get_by_label("Confirmed holder").fill("Browser Custodian")
        page.get_by_role("button", name="Register asset", exact=True).click()
        page.get_by_role("button", name="BROWSER-CREATED", exact=True).wait_for()
        Path("work").mkdir(exist_ok=True)
        page.screenshot(path="work/dashboard-desktop.png", full_page=True)
        page.set_viewport_size({"width": 390, "height": 844})
        assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
        page.screenshot(path="work/dashboard-mobile.png", full_page=True)
        page.get_by_role("button", name="Sign out", exact=True).click()
        page.get_by_role("button", name="Sign in", exact=True).wait_for()
        assert not errors, errors
        browser.close()
    print("PASS: browser login, overview, audit, registration, desktop/mobile layout, logout.")
finally:
    server.should_exit = True
    thread.join(5)
    sessions.kw["bind"].dispose()
