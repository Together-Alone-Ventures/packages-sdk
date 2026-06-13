import { Actor, HttpAgent } from '@dfinity/agent';
import { IDL } from '@dfinity/candid';
import { Principal } from '@dfinity/principal';
import { asBytes, auditErrorLabel, buildAuditorToken } from '@together-alone/zombiedelete-core';

const mktd03AuditPdfIdlFactory: IDL.InterfaceFactory = ({ IDL: I }) => {
  const AuditRecordApiError = I.Variant({
    not_found: I.Null,
    invalid_subject_reference: I.Null,
    invalid_metadata: I.Null,
    invalid_token: I.Null,
    verification_failed: I.Null,
    commercial_gate_failed: I.Null,
  });
  const RenderAuditPdfResult = I.Variant({
    Ok: I.Vec(I.Nat8),
    Err: AuditRecordApiError,
  });
  return I.Service({
    render_audit_pdf: I.Func(
      [I.Vec(I.Nat8), I.Vec(I.Nat8)],
      [RenderAuditPdfResult],
      []
    ),
  });
};

type AuditPdfActor = {
  render_audit_pdf: (
    subjectReference: Uint8Array | number[],
    token: Uint8Array | number[]
  ) => Promise<Record<string, unknown>>;
};

function needsFetchRootKey(host: string): boolean {
  try {
    const u = new URL(host.includes('://') ? host : `http://${host}`);
    const h = u.hostname.toLowerCase();
    return h === '127.0.0.1' || h === 'localhost' || h.endsWith('.localhost');
  } catch {
    return false;
  }
}

export async function renderAuditPdfOnCanister(opts: {
  canisterId: string;
  icHost: string;
  subjectReference: Uint8Array;
  auditorHmacKeyHex: string;
}): Promise<Uint8Array> {
  const host = opts.icHost.trim().replace(/\/$/, '') || 'http://127.0.0.1:4943';
  const agent = new HttpAgent({ host });
  if (needsFetchRootKey(host)) {
    await agent.fetchRootKey();
  }

  const actor = Actor.createActor(mktd03AuditPdfIdlFactory, {
    agent,
    canisterId: Principal.fromText(opts.canisterId.trim()),
  }) as AuditPdfActor;

  const token = await buildAuditorToken(
    opts.auditorHmacKeyHex,
    opts.canisterId.trim(),
    opts.subjectReference
  );

  const result = await actor.render_audit_pdf(opts.subjectReference, token);
  if ('Err' in result) {
    throw new Error(auditErrorLabel(result.Err as Record<string, unknown>));
  }
  const pdf = asBytes((result as { Ok: number[] }).Ok);
  if (pdf.length < 5 || String.fromCharCode(...pdf.subarray(0, 5)) !== '%PDF-') {
    throw new Error('Canister returned invalid PDF bytes.');
  }
  return pdf;
}
