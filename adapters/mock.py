"""Pure simulated adapter. It never submits transactions or holds keys."""
import hashlib
import json


class MockAdapter:
    mode = "mock"

    def execute(self, operation, asset):
        payload = json.dumps({"operation": operation, "asset": asset}, sort_keys=True)
        return {
            "mode": self.mode,
            "transaction_id": "mock:" + hashlib.sha256(payload.encode()).hexdigest(),
            "finality": "SIMULATED",
        }
