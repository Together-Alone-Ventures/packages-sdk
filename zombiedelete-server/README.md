# @together-alone/zombiedelete-server

SDK **Node.js / API OffSign** — quatre entrées publiques pour l’intégrateur :

| Fonction | Rôle |
|----------|------|
| **`offsign()`** | Après DELETE métier : re-lecture BDD (absence) puis signature de l’attestation backend. |
| **`issueAttestedDeletionReceipt()`** | Vérifie l’offsign, puis émet le reçu **CVDR** on-chain (begin → metadata → certificate → finalize). Signé par la clé contrôleur MKTd03 côté API. |
| **`attestDeletionProof()`** | À partir d’un reçu **CVDR** + payload offsign : vérif crypto, binding receipt, re-lecture BDD read-only. |
| **`issueDeletionCertificate()`** | Même gate BDD que `attestDeletionProof`, puis génération du **PDF** via `render_audit_pdf` sur MKTd03. |

Helpers avancés (verifiers SQL, `checkDeclaredDeletionInDatabase`, …) : `@together-alone/zombiedelete-server/internal`.

## Usage (DELETE + issuance sur l’API)

```ts
import { Ed25519KeyIdentity } from '@dfinity/identity';
import { sha256 } from '@together-alone/zombiedelete-core';
import { offsign, issueAttestedDeletionReceipt } from '@together-alone/zombiedelete-server';

const backendIdentity = Ed25519KeyIdentity.fromJSON(process.env.OFFSIGN_BACKEND_IDENTITY_JSON!);
const controllerIdentity = Ed25519KeyIdentity.fromJSON(process.env.MKTD03_CONTROLLER_IDENTITY_JSON!);

app.delete('/contacts/:id', async (req, res) => {
  await db.deleteContact(req.params.id);

  const subjectReference = await sha256(`tenant-acme:contact:${req.params.id}`);
  const offsignPayload = await offsign({
    identity: backendIdentity,
    subjectReference,
    deletionEventId: crypto.randomUUID(),
    connection: pool,
    databaseType: 'postgres',
    tableOrCollection: 'contacts',
    data: { keyField: 'id', keyValue: req.params.id },
  });

  const receipt = await issueAttestedDeletionReceipt({
    canisterId: process.env.MKTD03_CANISTER_ID!,
    icHost: process.env.MKTD03_IC_HOST ?? 'http://127.0.0.1:4943',
    controllerIdentity,
    signedAttestation: offsignPayload,
    trustedBackendPublicKeyHex: Buffer.from(backendIdentity.getPublicKey().toRaw()).toString('hex'),
    audit: { subjectLabel: `Contact ${req.params.id}`, legalContext: 'GDPR Art. 17' },
  });

  res.json({ ok: true, offsign: offsignPayload, receipt });
});
```

La même identité peut servir pour `offsign` et `controllerIdentity` si ce principal est contrôleur du canister MKTd03.

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
  data: { keyField: 'id', keyValue: contactId },
});
```

## Certificat PDF (après gate BDD)

```ts
import { issueDeletionCertificate } from '@together-alone/zombiedelete-server';

const { pdf, attestation } = await issueDeletionCertificate({
  signedAttestation: offsignPayload,
  receipt: cvdrReceipt,
  trustedBackendPublicKeyHex: BACKEND_PUBKEY_HEX,
  connection: pool,
  databaseType: 'postgres',
  tableOrCollection: 'contacts',
  data: { keyField: 'id', keyValue: contactId },
  canisterId: process.env.MKTD03_CANISTER_ID!,
  icHost: process.env.MKTD03_IC_HOST ?? 'http://127.0.0.1:4943',
  auditorHmacKeyHex: process.env.MKTD03_AUDITOR_HMAC_KEY_HEX!,
});
```

Sans `connection` + `databaseType` + `tableOrCollection` + `data`, **`offsign` refuse de signer** et les deux autres fonctions échouent sur la re-lecture BDD.
