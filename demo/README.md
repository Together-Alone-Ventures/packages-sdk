# OffSign SDK demo

End-to-end booth demo: **local JSON databases** (MySQL / PostgreSQL / MongoDB simulators) + **minimal API** (`offsign` with `verifyDeletion`) + **React UI** issuing **backend-attested** MKTd03 receipts.

Uses the monorepo SDK packages via workspaces (no npm publish required).

## Architecture

```text
demo/web (React + @together-alone/zombiedelete)
   │  DELETE /demo-api/api/:engine/records/:key
   ▼
demo/api (Express + @together-alone/zombiedelete-server)
   │  offsign({ verifyDeletion }) — Postgres example in verifyDeletion.ts
   │  returns { offsign: signed attestation } (+ legacy goneproof alias)
   ▼
web → preflightCommercial → issueAttestedDeletionReceipt() → MKTd03
   │  POST /api/check-declared-deletion (post-receipt reconciliation)
   ▼
restore → guardRestoreAgainstMktd03 + POST .../restore (409 if blocked)
```

## Prerequisites

- Node 18+
- `dfx` local replica (or IC host) + deployed MKTd03 canister id
- SDK packages built: from `packages-sdk/` run `npm run build`

Copy dev keys into `demo/shared/` (or use your own):

- `local-dev-ic-identity.json` — IC controller for issuance
- `local-dev-auditor-hmac-key.json` — PDF auditor token

`local-dev-backend-identity.json` is auto-generated on first API start (backend attestation signer).

## Run

Terminal 1 — API (port 8787):

```bash
cd packages-sdk/demo/api && npm install && npm run dev
```

Terminal 2 — Web (port 5174):

```bash
cd packages-sdk/demo/web && npm install
cp .env.example .env
npm run dev
```

Open http://localhost:5174 — paste any MKTd03 canister id and **Connect**.

## Reset databases

```bash
curl -X POST http://127.0.0.1:8787/api/reset
```

## Postgres verifyDeletion example

See `demo/api/src/verifyDeletion.ts` — `verifyPostgresDeletionAbsent()` documents the production SQL pattern; the demo uses `postgres.json` as a stand-in.
