# Together Alone — OffSign SDK packages

TypeScript SDKs for **OffSign** (backend-attested deletion) and **MKTd03** tombstone receipts on the Internet Computer.

| Package | Install in |
|---------|------------|
| [`@together-alone/zombiedelete`](./zombiedelete) | Browser / React / Vue |
| [`@together-alone/zombiedelete-server`](./zombiedelete-server) | Customer Node.js API |
| [`@together-alone/zombiedelete-core`](./zombiedelete-core) | Transitive (shared protocol) |

## Monorepo scripts

```bash
npm install
npm run build
npm run test
```

Build order: `zombiedelete-core` → `zombiedelete` → `zombiedelete-server`.

## OffSign flow (Lot B)

1. **Server** — after DB DELETE, `offsign({ verifyDeletion, … })` signs the declaration (`zombiedelete-server`).
2. **Optional** — `checkDeclaredDeletionInDatabase()` reconciles a signed declaration with a read-only DB check.
3. **Browser** — `preflightCommercial()` then `issueAttestedDeletionReceipt()` (`zombiedelete`).
4. **Restore path** — `guardRestoreAgainstMktd03()` before any INSERT / restore.

See [`demo/`](./demo) for a full booth flow and package READMEs for API details.
