# Development

Build and package on abcdyi in /home/dev/workspace/erc8415-kit-delivery.
Do not use existing ArtFi, Oracle, ERCs or ERC-xxxx checkouts.

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements.lock
.venv/bin/pip install --no-deps -e .
.venv/bin/ruff check api engine adapters tests
.venv/bin/pytest
.venv/bin/pip-audit -r requirements.lock
.venv/bin/uvicorn api.main:app --host 127.0.0.1 --port 8415
```

GET /health returns {"status":"ok"}. The Stage 0 service has no asset operations.
Only bind to loopback during development. Do not store credentials in the checkout.

Stage 1 plan: define SQLAlchemy assets/history/permissions tables, inject a mock adapter,
implement the required eight endpoints, validate failure paths and atomic audit persistence,
then document requests and lifecycle evidence. Use isolated in-memory SQLite for unit tests;
integration with dedicated CTYun MySQL requires a separately provisioned kit database.
