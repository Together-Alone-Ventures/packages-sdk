# @together-alone/zombiedelete-server

SDK **Node.js / API OffSign** — entrées publiques pour l'intégrateur :

| Fonction | Rôle |
|----------|------|
| **`offsignDelete()`** | Flux unique : DELETE paramétré → vérif absence BDD (read-only) → signature backend → **CVDR MKTd03**. |
| **`guardedInsert()`** | Garde CVDR (`get_receipt`) puis INSERT paramétré — refuse si sujet tombstoné. |
| **`offsign()`** | Bas niveau : vérif absence + signature après votre propre DELETE. |
| **`issueAttestedDeletionReceipt()`** | Émet le reçu **CVDR** on-chain (begin → metadata → certificate → finalize). |
| **`attestDeletionProof()`** | Reçu CVDR + payload offsign : vérif crypto, binding receipt, re-lecture BDD read-only. |
| **`issueDeletionCertificate()`** | Même gate BDD que `attestDeletionProof`, puis PDF via `render_audit_pdf` sur MKTd03. |

Schéma d'architecture : [`documents/sdk/offsign-sdk-architecture.svg`](../../documents/sdk/offsign-sdk-architecture.svg)

Helpers avancés (verifiers SQL, `checkDeclaredDeletionInDatabase`, …) : `@together-alone/zombiedelete-server/internal`.

## Usage (flux unique DELETE + CVDR)

```ts
import { Ed25519KeyIdentity } from '@dfinity/identity';
import {
  deriveDeletionSubjectReference,
  formatDeletionSourceLocator,
} from '@together-alone/zombiedelete-core';
import { offsignDelete } from '@together-alone/zombiedelete-server';

const backendIdentity = Ed25519KeyIdentity.fromJSON(process.env.OFFSIGN_BACKEND_IDENTITY_JSON!);
const controllerIdentity = Ed25519KeyIdentity.fromJSON(process.env.MKTD03_CONTROLLER_IDENTITY_JSON!);

app.delete('/contacts/:email', async (req, res) => {
  const subjectReference = await deriveDeletionSubjectReference({
    subjectPrefix: 'tenant-acme:',
    databaseType: 'postgres',
    tableOrCollection: 'contacts',
    keyField: 'email',
    keyValue: req.params.email,
  });

  const { signedAttestation, receipt } = await offsignDelete({
    identity: backendIdentity,
    subjectReference,
    deletionEventId: crypto.randomUUID(),
    connection: pool,
    databaseType: 'postgres',
    tableOrCollection: 'contacts',
    data: { keyField: 'email', keyValue: req.params.email },
    sourceLocator: formatDeletionSourceLocator({
      databaseType: 'postgres',
      tableOrCollection: 'contacts',
      recordKey: req.params.email,
    }),
    mktd03: {
      canisterId: process.env.MKTD03_CANISTER_ID!,
      icHost: process.env.MKTD03_IC_HOST ?? 'http://127.0.0.1:4943',
      controllerIdentity,
      trustedBackendPublicKeyHex: Buffer.from(backendIdentity.getPublicKey().toRaw()).toString('hex'),
      audit: { subjectLabel: req.params.email, legalContext: 'GDPR Art. 17' },
    },
  });

  res.json({ ok: true, offsign: signedAttestation, receipt });
});
```

## INSERT protégé (garde CVDR)

```ts
import { guardedInsert } from '@together-alone/zombiedelete-server';

await guardedInsert({
  connection: pool,
  databaseType: 'postgres',
  tableOrCollection: 'contacts',
  subjectReference,
  columns: { email: req.body.email, name: req.body.name },
  client: mktd03Client,
});
```

## Attester une preuve CVDR (C7)

```ts
import { attestDeletionProof } from '@together-alone/zombiedelete-server';

const attestation = await attestDeletionProof({
  signedAttestation: offsignPayload,
  receipt: cvdrReceipt,
  trustedBackendPublicKeyHex: BACKEND_PUBKEY_HEX,
  connection: pool,
  databaseType: 'postgres',
  tableOrCollection: 'contacts',
  data: { keyField: 'email', keyValue: contactEmail },
});
```

Sans `connection` + `databaseType` + `tableOrCollection` + `data`, **`offsign` refuse de signer** et les fonctions d'audit échouent sur la re-lecture BDD.
