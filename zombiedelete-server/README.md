# @together-alone/zombiedelete-server

SDK **Node.js / API** (OffSign) : signer une **déclaration de suppression** après un DELETE réussi, avec re-lecture BDD **obligatoire**.

## Usage (DELETE handler)

```ts
import { Ed25519KeyIdentity } from '@dfinity/identity';
import { offsign, sha256 } from '@together-alone/zombiedelete-server';

const backendIdentity = Ed25519KeyIdentity.fromJSON(process.env.OFFSIGN_BACKEND_IDENTITY_JSON!);

app.delete('/contacts/:id', async (req, res) => {
  await db.deleteContact(req.params.id);

  const subjectReference = await sha256(`tenant-acme:contact:${req.params.id}`);
  const offsignPayload = await offsign({
    identity: backendIdentity,
    subjectReference,
    deletionEventId: crypto.randomUUID(),
    sourceLocator: `contacts/${req.params.id}`,
    // BDD branchée directement sur offsign :
    connection: pool,
    databaseType: 'postgres',
    tableOrCollection: 'contacts',
    data: { keyField: 'id', keyValue: req.params.id },
  });

  res.json({ ok: true, offsign: offsignPayload });
});
```

MySQL : `databaseType: 'mysql'` · Mongo : `databaseType: 'mongo'`, `data: { _id: ... }`, `connection` = collection avec `findOne`.

## Reconciliation canister ↔ BDD (C7)

```ts
await checkDeclaredDeletionInDatabase({
  signedAttestation: offsignPayload,
  receipt,
  trustedBackendPublicKeyHex: BACKEND_PUBKEY_HEX,
  connection: pool,
  databaseType: 'postgres',
  tableOrCollection: 'contacts',
  data: { keyField: 'id', keyValue: contactId },
});
```

Cas avancé : passer `databaseVerifier` pré-construit à la place des props inline.

Sans `connection` + `databaseType` + `tableOrCollection` + `data`, **`offsign` refuse de signer**.
