# OffSign SDK demo

Démo bout-en-bout : **MySQL / PostgreSQL / MongoDB** + API (`offsign` → `issueAttestedDeletionReceipt`) + UI React.

Deux modes de stockage :

| Mode | Variable | Usage |
|------|----------|--------|
| **JSON** (défaut) | `DEMO_STORAGE_MODE=json` | Salon / sans Docker — fichiers `api/data/*.json` |
| **Réel** | `DEMO_STORAGE_MODE=real` | Tests intégration — vrais SGBD via `docker compose` |

## Architecture

```text
demo/web (React + zombiedelete-core / API)
   │  POST .../prove-deletion
   ▼
demo/api (Express + @together-alone/zombiedelete-server)
   │  DELETE réel + offsign({ connection, databaseType, tableOrCollection, data })
   │  issueAttestedDeletionReceipt → MKTd03
   ▼
Postgres 5433 · MySQL 3307 · Mongo 27018  (mode real)
```

## Prérequis

- Node 18+
- `dfx` local + canister MKTd03 — ID dans **`demo/api/.env`** : `MKTD03_CANISTER_ID=…`
- SDK build : `cd packages-sdk && npm run build`
- Clés dans `demo/shared/` :
  - `local-dev-ic-identity.json` — contrôleur IC pour l’émission
  - `local-dev-auditor-hmac-key.json` — PDF (optionnel)

## Mode réel (Postgres + MySQL + Mongo)

```bash
cd packages-sdk/demo
docker compose up -d          # ou npm run db:up
cd api && npm install
cp .env.example .env          # DEMO_STORAGE_MODE=real
npm run db:seed
npm run dev:real              # API avec auto-seed au démarrage
```

Terminal 2 — Web :

```bash
cd packages-sdk/demo/web && npm run dev
```

Ouvrir http://localhost:5174 — **Connect** (l’ID vient de `MKTD03_CANISTER_ID` sur l’API).

### Reset

```bash
curl -X POST http://127.0.0.1:8787/api/reset
```

Réensemence les 3 BDD (mode real) ou les JSON (mode json).

## Mode JSON (sans Docker)

```bash
cd packages-sdk/demo/api && npm run dev
cd packages-sdk/demo/web && npm run dev
```

## Erreurs fréquentes

**« This row is not in the backend database anymore »**  
État UI désynchronisé : **Reset demo DB** dans l’UI + `curl -X POST …/api/reset`.

**`get_allowance_status` / IC0536 method not found**  
Mauvais canister ID (ex. canister dfx générique). Utilisez l’ID **MKTd03** du deploy portail. La connexion appelle `get_tree_mode_status` pour valider l’ID.

**Preflight commercial**  
Sur un vrai MKTd03 local, l’allowance initiale est injectée par le portail. Pour tester offsign seul : `DEMO_SKIP_MKTD03_PREFLIGHT=1` dans `api/.env`.

## Postgres verifyDeletion (production)

Voir `api/src/verifyDeletion.ts` — en mode `real`, le SDK utilise `createWiredDeletionVerifier` avec `pg.Pool`, `mysql2`, `mongodb`.
