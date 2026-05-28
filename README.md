# Together Alone — Goneproof SDK packages

TypeScript SDKs for **MKTd03** deletion proofs on the Internet Computer.

| Package | Install in |
|---------|------------|
| [`@together-alone/zombiedelete`](./zombiedelete) | Browser / React / Vue |
| [`@together-alone/zombiedelete-server`](./zombiedelete-server) | Customer Node.js API |
| [`@together-alone/zombiedelete-core`](./zombiedelete-core) | Transitive (shared protocol) |

## Monorepo scripts

```bash
npm install
npm run build
npm test
```

Build order: `zombiedelete-core` → `zombiedelete` → `zombiedelete-server`.

## Flow

1. **Server** — after DB DELETE, sign a `goneproof` attestation (`zombiedelete-server`).
2. **Browser** — verify attestation and issue on-chain CVDR receipt (`zombiedelete`).

See package READMEs for API details.
