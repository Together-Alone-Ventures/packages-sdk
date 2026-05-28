import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  auditorHmacKeyHexFromViteEnv,
  defaultCanisterIdFromViteEnv,
  signingOptionsFromViteEnv,
} from './vite.js';

describe('vite helpers', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('reads canister id and auditor key from import.meta.env', () => {
    vi.stubEnv('VITE_MKTD03_CANISTER_ID', '  bbb-ccc  ');
    vi.stubEnv('VITE_MKTD03_AUDITOR_HMAC_KEY_HEX', '11'.repeat(64));
    expect(defaultCanisterIdFromViteEnv()).toBe('bbb-ccc');
    expect(auditorHmacKeyHexFromViteEnv()).toBe('11'.repeat(64));
  });

  it('maps VITE_DEMO_SIGNING_MODE to SDK signing modes', () => {
    vi.stubEnv('VITE_IC_HOST', 'http://127.0.0.1:4943');
    vi.stubEnv('VITE_DEMO_SIGNING_MODE', 'ephemeral');
    expect(signingOptionsFromViteEnv().mode).toBe('ephemeral');

    vi.stubEnv('VITE_DEMO_SIGNING_MODE', 'ii');
    expect(signingOptionsFromViteEnv().mode).toBe('internet_identity');
  });

  it('defaults to deploy_key on local replica when mode is unset', () => {
    vi.unstubAllEnvs();
    vi.stubEnv('VITE_IC_HOST', 'http://127.0.0.1:4943');
    expect(signingOptionsFromViteEnv().mode).toBe('deploy_key');
  });
});
