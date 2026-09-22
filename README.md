```
      _______ 
     /       |
    /|   |   |
   / |   |   |
  _  |   |   |
 (_)|   |   |
   |   |   |
   |   |   |
   |   |   |
   |___|___|
```

# Agent Anchor

**Agent Anchor** is a Node.js service that validates agent tool actions against deterministic regex rules and an optional Moss plagiarism‑detection index. It functions as a firewall for LLM‑driven agents, blocking dangerous or unwanted commands before they execute.

---

## Tech Stack

- **Runtime:** Node.js (>=18)
- **Web Framework:** Express
- **Moss Integration:** `@moss-js/moss` SDK
- **Docker:** Multi‑stage build with `node:22-bookworm-slim`
- **Testing:** Custom contract test suite (`scripts/smoke-test.mjs`)
- **Other:** `dotenv` for env config, `express.json` body parsing, SSE for event streaming

---

## Quick Start Sequence

```bash
# 1️⃣ Install dependencies
npm install

# 2️⃣ (Optional) Seed the Moss index – requires Moss project credentials
export MOSS_PROJECT_ID=your_id
export MOSS_PROJECT_KEY=your_key
npm run seed   # runs scripts/seed-moss.mjs

# 3️⃣ Start the service (defaults to 127.0.0.1:3000)
npm start      # or: node service/server.mjs

# 4️⃣ Run the contract smoke test (service must be up)
npm test       # runs scripts/smoke-test.mjs
```

---

## Features

| Feature | Description |
|---|---|
| **Rule‑based blocking** | Regex rules run first; block `rm -rf`, force‑push, SQL drop, pipe‑to‑shell, `.env` reads, self‑tampering, etc. |
| **Moss plagiarism check** | Optional cloud similarity check; requires `MOSS_PROJECT_ID` / `MOSS_PROJECT_KEY`. |
| **Fail‑open / fail‑closed** | `MOSS_FAIL_MODE` controls behaviour when Moss is unavailable. |
| **Configurable threshold** | `MOSS_THRESHOLD` (default 0.6) determines Moss match sensitivity. |
| **Dashboard feed** | SSE endpoint `/events` streams every checked action with verdict, policy, latency and a redacted summary. |
| **Health check** | `GET /health` returns service status, Moss state, threshold and fail mode. |
| **Docker ready** | Multi‑stage Dockerfile + `docker-compose.yml` for reproducible deployment. |

---

## Architecture (Mermaid diagram)

```mermaid
flowchart TD
    A[Client] -->|POST /check-action| B[Express Server]
    B --> C[validate body]
    C -->|invalid| D[return 400 error]
    C -->|valid| E[decide action]
    E --> F[matchRule – regex rules]
    F -->|block| G[return verdict "block" + policy]
    F -->|no match| H[queryMoss]
    H -->|score ≥ threshold| I[return verdict "block" + Moss policy]
    H -->|score < threshold| J[return verdict "allow"]
    E -->|invalid request| D
    B --> K[GET /events SSE – event stream]
    B --> L[GET /health – status endpoint]
```

---

## API Summary

| Endpoint | Method | Description |
|---|---|---|
| `/check-action` | `POST` | Validate and decide if an action is allowed or blocked. Body: `{ harness, tool, command \| file_path, cwd? }`. Returns `{ verdict, matched_policy, latency_ms }`. |
| `/events` | `GET` | Server‑Sent Events stream of all actions (IDs, verdicts, policies, latency, redacted summaries). |
| `/health` | `GET` | Quick health check: `{ ok, moss, moss_error, threshold, fail_mode }`. |

---

## Docker

Build and run locally:

```bash
docker compose up -d      # builds image & starts container
# or manually:
docker build -t agent-anchor .
docker run -p 3000:3000 -e MOSS_FAIL_MODE=closed agent-anchor
```

Environment variables (in `.env` or compose):

- `PORT` – service port (default 3000)
- `HOST` – bind address (`127.0.0.1` loopback, `0.0.0.0` for Docker LAN)
- `MOSS_THRESHOLD` – similarity threshold (default 0.6)
- `MOSS_FAIL_MODE` – `closed` blocks when Moss unavailable, `open` allows
- `MOSS_PROJECT_ID` / `MOSS_PROJECT_KEY` – required for Moss checks
- `POLICIES_PATH` – path to `policies.json`

---

## Testing

The project includes a contract test suite (`npm test`) that posts 21 demo cases against a running service and reports PASS/FAIL for each. Tests cover:

- **Block** cases (`rm -rf`, force‑push, SQL drop, pipe‑to‑shell, `.env` read, self‑tamper)
- **Allow** cases (`ls`, `git status`, `npm test`, reading safe files, normal git push)
- **Malformed** requests (400 responses for unknown tool, missing command, missing file_path)

---

## ASCII Anchor (logo)

The anchor above the title is pure ASCII art, keeping the repo’s visual identity lightweight and terminal‑friendly.

---

*Generated with ❤️ using Node.js, Express, and Moss.*