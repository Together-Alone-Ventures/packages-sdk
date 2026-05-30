# Goneproof SDK demo

End-to-end booth demo: **local JSON databases** (MySQL / PostgreSQL / MongoDB simulators) + **minimal API** signing backend attestations + **React UI** issuing on-chain CVDR receipts.

Uses the monorepo SDK packages via `file:` / Vite aliases (no npm publish required).

## Architecture

```text
demo/web (React + @together-alone/zombiedelete)
   │  DELETE /demo-api/api/:engine/records/:key
   ▼
demo/api (Express + @together-alone/zombiedelete-server)
   │  removes row from demo/api/data/{mysql,postgres,mongo}.json
   │  returns { goneproof: signed attestation }
   ▼
web → issueAttestedDeletionReceipt() → MKTd03 canister
```

## Prerequisites

- Node 18+
- `dfx` local replica (or IC host) + deployed MKTd03 canister id
- SDK packages built: from repo root `npm run build`

Copy dev keys into `demo/shared/` (or use your own):

- `local-dev-ic-identity.json` — IC controller for issuance
- `local-dev-auditor-hmac-key.json` — PDF auditor token

`local-dev-backend-identity.json` is auto-generated on first API start (backend attestation signer).

## Run

Terminal 1 — API (port 8787):

```bash
cd demo/api && npm install && npm run dev
```

Terminal 2 — Web (port 5174):

```bash
cd demo/web && npm install
cp .env.example .env
npm run dev
```

Or from `demo/` after `npm install` at repo root with workspaces wired.

Open http://localhost:5174 — paste any MKTd03 canister id and **Connect** (a new id resets the backend DB to seed data).

## Reset databases

```bash
curl -X POST http://127.0.0.1:8787/api/reset
```
