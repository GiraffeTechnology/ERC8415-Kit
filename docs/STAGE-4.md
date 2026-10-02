# Stage 4 institutional dashboard

GET / serves a same-origin interface for login, registry overview, audit timeline and role
management. It contains no wallet, RPC, token signing or direct blockchain call.
All rendered asset/user data uses textContent. CSP permits only same-origin scripts/styles.

Users authenticate via POST /auth/login. Passwords require 12-128 characters and are salted
PBKDF2-HMAC-SHA256 with 600,000 rounds. Session tokens are random, stored hashed in the database,
expire after one hour and use Secure/HttpOnly/SameSite=Strict cookies. Mutations require a CSRF
token returned at login or /auth/me. Use TLS for the dashboard.

ADMIN manages users/roles and all workflows. CUSTODIAN handles asset lifecycle commands.
VERIFIER may submit institutional proofs. AUDITOR and VIEWER have read access.
Role changes invalidate sessions; an administrator cannot change their own role.
Tenant scoping, API keys, rate limits and production deployment controls are Stage 6 work.

Provision the first administrator through engine.auth.AuthService.create_user using an
operator-supplied password and the dedicated database session factory. No default credentials.
The test suite provisions only disposable synthetic users.

The application defaults to isolated memory storage, so development restarts discard data.
Use the dedicated CTYun MySQL service for a durable deployment.
