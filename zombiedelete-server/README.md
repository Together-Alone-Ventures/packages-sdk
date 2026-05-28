# @together-alone/zombiedelete-server

SDK **Node.js / API** pour le client : signer une attestation d’effacement **après** un DELETE réussi en base.

Installe dans l’API du client (Express, Nest, etc.) — **pas** dans le bundle React.

## Installation

```bash
npm install @together-alone/zombiedelete-server @dfinity/identity
```

## Usage (DELETE handler)

```ts
import { Ed25519KeyIdentity } from '@dfinity/identity';
import { buildGoneproofDeletePayload, sha256 } from '@together-alone/zombiedelete-server';

const backendIdentity = Ed25519KeyIdentity.fromJSON(process.env.GONEPROOF_BACKEND_IDENTITY_JSON!);

app.delete('/contacts/:id', async (req, res) => {
  await db.deleteContact(req.params.id);

  const subjectReference = await sha256(`tenant-acme:contact:${req.params.id}`);
  const goneproof = await buildGoneproofDeletePayload({
    identity: backendIdentity,
    subjectReference,
    deletionEventId: crypto.randomUUID(),
    sourceSystem: 'CRM Acme',
    dbEngine: 'postgres',
  });

  res.json({ ok: true, goneproof });
});
```

Le front React utilise `@together-alone/zombiedelete` avec `issueAttestedDeletionReceipt({ signedAttestation: goneproof })`.
