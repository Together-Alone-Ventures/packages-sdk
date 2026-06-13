# Together Alone — OffSign SDK packages

TypeScript SDK for **OffSign** (backend-attested deletion) and **MKTd03** tombstone receipts on the Internet Computer.

| Package | Install in |
|---------|------------|
| [`@together-alone/zombiedelete-server`](./zombiedelete-server) | Customer Node.js API (recommended) |
| [`@together-alone/zombiedelete-core`](./zombiedelete-core) | Transitive (shared protocol) |
| [`@together-alone/zombiedelete`](./zombiedelete) | Deprecated alias → `zombiedelete-server` |

## Monorepo scripts

```bash
npm install
npm run build
npm run test
```

Build order: `zombiedelete-core` → `zombiedelete-server` → `zombiedelete` (alias).

## OffSign flow (API-only)

1. **DELETE** — remove row from your database.
2. **`offsign()`** — read-only DB absence check + backend attestation signature.
3. **`issueAttestedDeletionReceipt()`** — verify offsign, emit CVDR receipt on MKTd03 (controller key on API).
4. **`attestDeletionProof()` / `issueDeletionCertificate()`** — audit paths with DB re-read.
5. **Restore path** — `guardRestoreAgainstMktd03()` before any INSERT / restore.

See [`demo/`](./demo) for a full booth flow and package READMEs for API details.
