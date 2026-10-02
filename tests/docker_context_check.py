import io
import json
import shutil
import subprocess
import tarfile
from pathlib import Path

root = Path.cwd()
context = root / "work" / "docker-context-review"
context.mkdir(parents=True, exist_ok=True)
shutil.copy(root / ".dockerignore", context / ".dockerignore")
(context / "Dockerfile").write_text("FROM scratch\nCOPY . /context/\n")
for name in ("pyproject.toml", "requirements.lock"):
    shutil.copy(root / name, context / name)
for folder in ("api", "engine", "adapters", "dashboard"):
    shutil.copytree(root / folder, context / folder, dirs_exist_ok=True)
canaries = [".env", ".env.production", ".venv/token", ".git/config", "work/private",
            "api/.env.secret", "engine/test.db", "adapters/key.pem"]
for name in canaries:
    target = context / name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text("SYNTHETIC_CONTEXT_CANARY")
subprocess.run(["docker", "build", "-t", "erc8415-kit:context-review", str(context)], check=True)
archive = root / "work" / "docker-context-review.tar"
subprocess.run(["docker", "save", "-o", str(archive), "erc8415-kit:context-review"], check=True)
names = []
with tarfile.open(archive) as image:
    for name in json.load(image.extractfile("manifest.json"))[0]["Layers"]:
        if name:
            with tarfile.open(fileobj=io.BytesIO(image.extractfile(name).read())) as layer:
                names.extend(item.name.rstrip("/") for item in layer.getmembers())
assert "context/api/main.py" in names, names
for name in canaries:
    assert "context/" + name not in names, name
print("PASS: actual Docker image includes runtime source and excludes all eight secret/state canaries.")
