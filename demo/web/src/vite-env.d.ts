/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_IC_HOST?: string;
  readonly VITE_DEMO_API_URL?: string;
  readonly VITE_MKTD03_AUDITOR_HMAC_KEY_HEX?: string;
  readonly VITE_DEMO_BACKEND_PUBKEY_HEX?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
