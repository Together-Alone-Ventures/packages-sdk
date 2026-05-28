# @together-alone/zombiedelete

SDK **front** (React, Vue, Angular) : connexion au canister MKTd03, émission de reçus CVDR, PDF d’audit, vérification des attestations backend.

Pour l’**API Node du client** (signer après DELETE en BDD) → `@together-alone/zombiedelete-server`.

## Installation (React / Vite)

```bash
npm install @together-alone/zombiedelete @dfinity/agent @dfinity/identity @dfinity/principal @dfinity/candid
# Internet Identity en dev/prod navigateur :
npm install @dfinity/auth-client
```

## Usage

```ts
import { ZombieDeleteClient, sha256 } from '@together-alone/zombiedelete';

const client = await ZombieDeleteClient.connect({ /* … */ });

// Après DELETE API client + payload `goneproof` signé côté server :
await client.issueAttestedDeletionReceipt({
  signedAttestation: goneproof,
  trustedBackendPublicKeyHex: CLIENT_BACKEND_PUBKEY_HEX,
});
```

## Packages du monorepo

| Package | Où l’installer |
|---------|----------------|
| `@together-alone/zombiedelete` | Front React / Vue |
| `@together-alone/zombiedelete-server` | API Node du client |
| `@together-alone/zombiedelete-core` | Interne (transitif) |

## Build & tests

```bash
cd packages/zombiedelete-core && npm run build && npm test
cd packages/zombiedelete && npm run build && npm test
cd packages/zombiedelete-server && npm run build && npm test
```
