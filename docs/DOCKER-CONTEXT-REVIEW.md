# Docker context review correction

The image uses explicit runtime COPY paths and a deny-by-default .dockerignore.
Synthetic secrets and local state must never enter the build context.

Reproduce on abcdyi: .venv/bin/python tests/docker_context_check.py.
The script builds a scratch image, inspects its saved layer and verifies runtime source is
present while .env, .env.production, .venv/token, .git/config, work/private, api/.env.secret,
engine/test.db and adapters/key.pem are absent. All canaries are synthetic.
Executed successfully on abcdyi. This is a context-exclusion test, not a production image test.
CI and final PR merges are owned by the artfi control task.
