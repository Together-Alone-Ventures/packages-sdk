const TOKEN_DOMAIN = new TextEncoder().encode('mktd03-auditor-token-v1');
const MAC_LEN = 32;

function parseHex32(hex: string, label: string): Uint8Array {
  const normalized = hex.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new Error(`${label} must be 64 hex characters (32 bytes)`);
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    out[i] = parseInt(normalized.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

async function sha256Concat(chunks: Uint8Array[]): Promise<Uint8Array> {
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

function expiryNsFromNow(ttlHours = 24): bigint {
  const nowNs = BigInt(Date.now()) * 1_000_000n;
  return nowNs + BigInt(ttlHours) * 3_600n * 1_000_000_000n;
}

function writeBeU64(value: bigint): Uint8Array {
  const out = new Uint8Array(8);
  let v = value;
  for (let i = 7; i >= 0; i--) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

/** Matches `audit_access::build_auditor_token` in MKTd03 (SHA-256 domain, not HMAC). */
export async function buildAuditorToken(
  auditorHmacKeyHex: string,
  canisterId: string,
  subjectReference: Uint8Array,
  expiryNs?: bigint
): Promise<Uint8Array> {
  const key = parseHex32(auditorHmacKeyHex, 'auditor HMAC key');
  const expiry = expiryNs ?? expiryNsFromNow();
  const mac = await sha256Concat([
    TOKEN_DOMAIN,
    key,
    new TextEncoder().encode(canisterId),
    subjectReference,
    writeBeU64(expiry),
  ]);
  const token = new Uint8Array(8 + subjectReference.length + MAC_LEN);
  token.set(writeBeU64(expiry), 0);
  token.set(subjectReference, 8);
  token.set(mac.subarray(0, MAC_LEN), 8 + subjectReference.length);
  return token;
}

export function downloadPdfBytes(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([Uint8Array.from(bytes)], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
