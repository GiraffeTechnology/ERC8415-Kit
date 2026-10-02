# PR7 bounded review fixes

Review base: 43d58cea5707e1310444097aa135b298b79cd1ec.
Findings: discussion_r3997937787 and discussion_r3997937788.

Authenticated identity is now established before its trusted tenant/user rate bucket is consumed and before RBAC/CSRF authorization. Invalid credentials still count only as unauthenticated; request headers never select the tenant. Regression tests exercise both RBAC and CSRF rejections, bucket exhaustion/429/Retry-After, tenant error metrics and invalid-key attribution.

The API retains its bounded default page of 100. Python and JavaScript assets() retain the list return type and consume pages until exhausted. The dashboard also consumes all pages. A later-page error propagates rather than returning an incomplete list. Tests cover 205 assets in each of two tenant schemas; the live browser and both SDKs each see all 110 assets and exclude the foreign institution.

abcdyi evidence: 99 Python tests passed in 33.09 seconds; coverage 95.24%; Ruff passed. Four JavaScript tests passed with 100% line/branch/function coverage. Live SDK/API/EVM and browser lifecycle plus pagination assertions passed. Two upstream TestClient deprecation warnings remain.

No CI, runner, PR1–6 or merge operation is part of this fix. Findings await control-task review and closure; this report does not mark Stage6 accepted.
