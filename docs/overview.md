# Agent Anchor — Structured Documentation

## Overview

**Agent Anchor** is a lightweight Node.js service that acts as an agent firewall, validating tool actions against a set of deterministic rules and an optional Moss plagiarism‑detection index.

### Core Features

| Feature | Description |
|---|---|
| **Rule‑based blocking** | Regex rules that block destructive or unsafe commands (e.g., `rm -rf`, force‑push, SQL drop, piping to shell, reading `.env` files, self‑tampering). |
| **Moss plagiarism check** | Optional cloud‑based similarity check against an indexed set of policies. Requires `MOSS_PROJECT_ID` and `MOSS_PROJECT_KEY`. |
| **Configurable thresholds** | `MOSS_THRESHOLD` (default 0.6) controls when Moss‑derived blocks fire. |
| **Fail‑open / fail‑closed** | `MOSS_FAIL_MODE` determines whether the service blocks or allows requests when Moss is unavailable. |
| **Dashboard feed** | SSE `/events` endpoint streams every checked action with verdict, policy, latency, and a redacted summary. |
| **Health check** | GET `/health` returns service status, Moss state, and current configuration. |

### Quick Start

```bash
# 1. Install dependencies
npm install

# 2. (Optional) Seed the Moss index — requires Moss credentials
export MOSS_PROJECT_ID=your_id
export MOSS_PROJECT_KEY=your_key
npm run seed

# 3. Start the service (defaults to 127.0.0.1:3000)
npm start     # or: node server.mjs

# 4. Run the contract smoke test (service must be up)
npm test
```

### Architecture

- **`server.mjs`** — Express entry point, request validation, rule+Moss decision, event broadcasting.
- **`src/rules.mjs`** — Deterministic regex rules that run **before** Moss so the demo never depends on a similarity threshold.
- **`src/moss.mjs`** — Moss adapter: loads a pre‑created index into memory, then queries it locally.
- **`policies/policies.json`** — Human‑readable deny policies (ids, actions, applicable tools, descriptions).
- **`scripts/smoke-test.mjs`** — Contract test suite against a running instance.
- **`docker/`** — Dockerfile + `docker-compose.yml` for containerised deployment.

### Screenshot

![Agent Firewall Logs](ag-log01.png)

*The image above captures a typical log snapshot from the running service, showing allowed and blocked actions with their matched policies.*