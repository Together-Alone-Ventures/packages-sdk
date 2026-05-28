import { describe, expect, it } from 'vitest';
import { buildAuditorToken } from './audit.js';

const TOKEN_DOMAIN = new TextEncoder().encode('mktd03-auditor-token-v1');
const MAC_LEN = 32;

function writeBeU64(value: bigint): Uint8Array {
  const out = new Uint8Array(8);
  let v = value;
  for (let i = 7; i >= 0; i--) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

async function tokenMacRustCompatible(
  key: Uint8Array,
  canisterId: string,
  subject: Uint8Array,
  expiryNs: bigint
): Promise<Uint8Array> {
  const chunks = [
    TOKEN_DOMAIN,
    key,
    new TextEncoder().encode(canisterId),
    subject,
    writeBeU64(expiryNs),
  ];
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  const digest = await crypto.subtle.digest('SHA-256', merged);
  return new Uint8Array(digest);
}

describe('buildAuditorToken', () => {
  const keyHex = 'ab'.repeat(32);
  const subject = new Uint8Array([0x01, 0x02]);
  const canisterId = 'aaaaa-bbbbb';
  const expiryNs = 9_000_000_000n;

  it('matches MKTd03 audit_access::token_mac layout (Rust round-trip vector)', async () => {
    const token = await buildAuditorToken(keyHex, canisterId, subject, expiryNs);
    expect(token.length).toBe(8 + subject.length + MAC_LEN);

    const expiryBytes = token.subarray(0, 8);
    expect(expiryBytes).toEqual(writeBeU64(expiryNs));

    const tokenSubject = token.subarray(8, 8 + subject.length);
    expect(tokenSubject).toEqual(subject);

    const mac = token.subarray(8 + subject.length);
    const key = new Uint8Array(32).fill(0xab);
    const expectedMac = await tokenMacRustCompatible(key, canisterId, subject, expiryNs);
    expect(mac).toEqual(expectedMac);
  });

  it('rejects invalid auditor key hex', async () => {
    await expect(buildAuditorToken('not-hex', canisterId, subject, expiryNs)).rejects.toThrow(
      /64 hex/
    );
  });

  it('produces distinct tokens for distinct subjects', async () => {
    const a = await buildAuditorToken(keyHex, canisterId, new Uint8Array([1]), expiryNs);
    const b = await buildAuditorToken(keyHex, canisterId, new Uint8Array([2]), expiryNs);
    expect(a).not.toEqual(b);
  });
});
