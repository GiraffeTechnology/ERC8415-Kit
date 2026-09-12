# Institutional SDKs

JavaScript package: @erc8415/sdk. Python package: erc8415.
Packages are delivered privately, with no public registry publication.
HTTPS is required except for loopback development.

JavaScript example:
```javascript
import { Client } from "@erc8415/sdk";
const kit = new Client(process.env.KIT_API_URL);
await kit.login(process.env.KIT_USERNAME, process.env.KIT_PASSWORD);
const asset = await kit.register("bond-001", "institution-custodian");
console.log(await kit.state(asset.id));
console.log(await kit.history(asset.id));
await kit.logout();
```

Python example:
```python
import os
from erc8415 import Client
kit = Client(os.environ["KIT_API_URL"])
try:
    kit.login(os.environ["KIT_USERNAME"], os.environ["KIT_PASSWORD"])
    asset = kit.register("bond-001", "institution-custodian")
    print(kit.state(asset["id"]))
    print(kit.history(asset["id"]))
finally:
    kit.close()
```

Lifecycle: register -> verify(id, version, proof) -> update(id, version, "ACTIVE") ->
transfer(id, version, holder) -> settle(id, version) -> history.
Use each command's returned version. freeze/revoke are independent controls.
Proof creation belongs to the authorized institution; see STAGE-2.md.
API key constructor options are reserved for Stage 6 authentication.

APIError carries the HTTP status. Transport errors propagate. No automatic write retries:
reconcile state/history before deciding whether to retry. JavaScript uses an AbortSignal
timeout and Python uses the configured HTTP client timeout.
Do not embed credentials in browser bundles or logs.

Build on abcdyi:
```sh
cd sdk/javascript
npm test
npm pack --pack-destination ../../work
cd ../..
.venv/bin/pip wheel --no-deps ./sdk/python -w work
```
