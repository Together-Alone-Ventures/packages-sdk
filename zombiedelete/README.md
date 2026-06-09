# @together-alone/zombiedelete

SDK **front** (React, Vue, Angular) : connexion MKTd03, preflight commercial, émission de **reçus de déclaration backend-attestée**, PDF d’audit, garde restore.

Pour signer après DELETE en BDD → `@together-alone/zombiedelete-server` (`offsign`).

## Installation (React / Vite)

```bash
npm install @together-alone/zombiedelete @dfinity/agent @dfinity/identity @dfinity/principal @dfinity/candid
npm install @dfinity/auth-client  # Internet Identity
```

## Usage

```ts
import { ZombieDeleteClient } from '@together-alone/zombiedelete';

const client = await ZombieDeleteClient.connect({ /* … */ });

// Après DELETE API + payload `offsign` signé côté server :
await client.issueAttestedDeletionReceipt({
  signedAttestation: offsign,
  trustedBackendPublicKeyHex: CLIENT_BACKEND_PUBKEY_HEX,
});
// preflight commercial automatique (skipPreflight pour tests)
```

## Garde restore (C9)

```ts
import { guardRestoreAgainstMktd03 } from '@together-alone/zombiedelete';

const guard = await guardRestoreAgainstMktd03({
  subjectReference,
  client,
  policy: { failClosedOnLookupError: true },
});
if (!guard.allowed) throw new Error('Restore blocked — subject tombstoned on-chain');
```

## Preflight commercial

```ts
const preflight = await client.preflightCommercial();
if (!preflight.ok) {
  // exhausted | clone_detected | awaiting_first_injection | …
}
```

## Packages du monorepo

| Package | Où l’installer |
|---------|----------------|
| `@together-alone/zombiedelete` | Front React / Vue |
| `@together-alone/zombiedelete-server` | API Node du client |
| `@together-alone/zombiedelete-core` | Interne (transitif) |

## Build & tests

```bash
npm run build && npm run test
```
