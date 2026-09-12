"""Institutional API entry point. Business operations enter through the engine."""
from fastapi import FastAPI

app = FastAPI(title="ERC-8415 Native Infrastructure Kit", version="0.1.0")


@app.get("/health")
def health():
    return {"status": "ok"}
