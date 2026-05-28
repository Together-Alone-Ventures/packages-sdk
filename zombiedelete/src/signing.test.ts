import { Ed25519KeyIdentity } from '@dfinity/identity';
import { describe, expect, it } from 'vitest';
import {
  createSigningSession,
  formatControllerRejectError,
  isLocalReplicaHost,
  resolveAgentHost,
} from './signing.js';

describe('signing', () => {
  it('detects local replica hosts', () => {
    expect(isLocalReplicaHost('http://127.0.0.1:4943')).toBe(true);
    expect(isLocalReplicaHost('http://localhost:4943')).toBe(true);
    expect(isLocalReplicaHost('https://ic0.app')).toBe(false);
  });

  it('normalizes localhost to 127.0.0.1 without dev proxy', () => {
    expect(resolveAgentHost('http://localhost:4943', false)).toBe('http://127.0.0.1:4943');
  });

  it('createSigningSession exposes deploy key principal', async () => {
    const identity = Ed25519KeyIdentity.generate();
    const session = createSigningSession({
      mode: 'deploy_key',
      icHost: 'http://127.0.0.1:4943',
      deployIdentityJson: JSON.stringify(identity.toJSON()),
    });
    const agent = await session.createAgent();
    expect(session.principalText).toBe(identity.getPrincipal().toText());
    expect(session.modeLabel).toContain('deploy');
    expect(agent).toBeDefined();
    session.clear();
  });

  it('formatControllerRejectError adds controller guidance for IC0406', () => {
    const msg = formatControllerRejectError(
      new Error(
        'Canister rejected the message; reject code: 4, begin_tree_receipt_issuance IC0406'
      ),
      'aaaaa-aa',
      'j4mna-i25nw-q2a5z-ireu7-72vp4-awam2-ush76-c6s3k-uoyms-re3ez-yae',
      'deploy key'
    );
    expect(msg).toMatch(/not a canister controller/i);
    expect(msg).toContain('j4mna-i25nw');
    expect(msg).toContain('aaaaa-aa');
  });

  it('formatControllerRejectError passes through unrelated errors', () => {
    expect(formatControllerRejectError(new Error('network down'), 'x', 'y', 'z')).toBe(
      'network down'
    );
  });
});
