# Malawi Food Price Intelligence automation integration — status

Last updated: 2026-11-09
Branch: `coolify-selfhost-migration`

## Completed in this continuation

- After user-confirmed admin-auth setup, made a fresh protected Node-RED backup: `/home/i9i/.config/malawi_food_security/backups/nodered/live-data-post-auth-20261109.tar.gz` (flows, credentials file, settings, runtime config; mode 0600).
- Persisted Node-RED's current 64-character auto-generated credential key as `NODE_RED_CREDENTIAL_SECRET` in `/opt/nodered/nodered.env` (mode 0600); `settings.js` now reads that variable. `/opt/nodered/compose.yaml` pins the current image digest, keeps `/opt/nodered/data:/data`, `unless-stopped`, and `127.0.0.1:1880` binding. Compose config validates.
- Recreated Node-RED from the pinned digest with rollback container retained. It is healthy; runtime verifies `credentialSecret` equals the environment value, `adminAuth` remains enabled, and unauthenticated `GET /flows` returns 401. The 17 existing flows and AI Assistant tab are unchanged; startup reports flows started and Dashboard 2.0 active. Ollama responds 200 and reports `qwen3:1.7b` available.
- Confirmed the Ollama HTTP request node has no configured authentication and none of the AI flow nodes stores node credentials; the 79-byte encrypted credentials file hash is unchanged across restart. Node-RED logs `Encrypted credentials not found`, consistent with no flow node requiring stored credentials; no secret was altered or disclosed.
- Merged the 30-node Malawi automation export into `automation/node-red/flows.json` with no Node ID collisions. The combined export contains 47 nodes and retains the original 17-node export unchanged.
- Added `merge_flows.py`; it rejects duplicate IDs, partial collisions, and dangling wires, and appends atomically. Its 3 focused tests pass, including preservation and idempotency.
- Took a fresh full PostgreSQL custom-format backup before migration: `/home/i9i/.config/malawi_food_security/backups/postgres_pre_automation_20261109.dump` (mode 0600, 2,414,613 bytes; `pg_restore --list` succeeded).
- Reviewed and rehearsed `SQL/04_automation_schema.sql` against production inside a transaction and rolled it back. Then applied the additive migration; verified all seven new tables exist and the app role has the expected table and sequence privileges. Existing price/spike tables were not altered.
- Python runtime discovery: the local Hermes interpreter is not the project environment. The deployed API image uses Python 3.13.18 and already contains FastAPI 0.118.0, Pydantic 2.14.3, psycopg2-binary 2.9.13, asyncpg 0.32.0, and Uvicorn 0.38.0; no missing production dependencies needed installation.
- Phase 2 validation: all 30 backend tests pass in the deployed API image; `api.main` imports and registers all nine automation endpoints. The frontend typecheck and production build pass. The Coolify API and frontend environment records were backed up (root-only inside Coolify at `/var/www/html/storage/app/mfs-automation-backup-20261109.json`). A 64-character automation token is stored in the API app as a runtime-only variable; its secret value is kept in a local mode-0600 file and was not printed. It takes effect on the next API deployment.
- Confirmed host capacity before changing deployment: 54G free disk, 5.3Gi available RAM, load averages below 1.4; no new service added.

## Not complete / production gates

- Phase 1 — Node-RED security is complete: the user's production authentication remains enabled; `/flows` returns 401 without credentials; the editor remains localhost-bound. A durable environment-backed credential secret and pinned Compose deployment are in place, and the service restarted healthy with all original flows started. The current Ollama HTTP flow uses a local endpoint without node credentials; `qwen3:1.7b` was reachable. The encrypted credentials file is unchanged.
- FastAPI/Next.js automation changes have NOT been deployed. Backend source imports successfully in the production image and the complete 30-test suite passes there; endpoints have not yet been exercised live.
- Notification channels beyond the dashboard are not configured; the flow currently logs alert events to Node-RED debug rather than sending email/WhatsApp/SMS. Do not claim administrator notifications are operational.
- No complete end-to-end integration test, Node-RED restart test, or authenticated/unauthenticated live API test has been performed.
- The API and frontend are Coolify apps on branch `coolify-selfhost-migration`; their current Coolify FQDN values are HTTP and the API has no automation token variable yet. Node-RED is a standalone Docker container on the default bridge, not in Coolify's network.
- External HTTPS probes show both generated domains serve the Traefik default certificate (`CN=TRAEFIK DEFAULT CERT`), while HTTP returns 200; SSLIP DNS resolves to the VPS. No valid certificate is currently configured. The user prefers trying valid TLS on generated hostnames and has no custom domain.
- No changes were pushed to GitHub; pushing this branch may trigger production deployments before remaining checks are complete. `frontend/package-lock.json` remains modified as it was before this continuation and was not edited here.

## Next safe steps

1. Set user-owned Node-RED editor credentials and `credentialSecret` through the protected deployment configuration; confirm access control before exposing any editor access.
2. Validate automation API/router tests in the project's supported runtime, inspect request/response compatibility with Node-RED, then deploy API and frontend through Coolify and verify live health.
3. Push/export only after confirming the deployed branch/build behavior; preserve the existing AI flow and verify persistence with a controlled restart.
4. Configure supported notification provider credentials, exercise deduplication/retries, and run the requested end-to-end workflows.
5. Configure a domain and valid certificate, then verify HTTPS externally.
