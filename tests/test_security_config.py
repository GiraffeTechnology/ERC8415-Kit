"""Regression checks for reviewed-only CI and a minimal Docker context."""
from pathlib import Path


def test_docker_context_denies_local_secrets_and_state():
    rules = Path(".dockerignore").read_text().splitlines()
    assert rules[0] == "**"
    assert "**/.env*" in rules
    assert "**/*.pem" in rules and "**/*.key" in rules and "**/*.db" in rules
    assert not any(line.startswith("!.") for line in rules)
    dockerfile = Path("docker/Dockerfile").read_text()
    assert "COPY . ." not in dockerfile
    assert "COPY api/" in dockerfile
    assert "USER 10001" in dockerfile
