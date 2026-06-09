import type { Receipt, SignedBackendDeletionAttestationV1 } from './types.js';

/** Read-only absence check before signing (callback supplied by integrator). */
export type VerifyDeletionResult = {
  absent: boolean;
  detail?: string;
  checkedAtUnixMs?: number;
};

export type VerifyDeletion = () => Promise<VerifyDeletionResult>;

/** Context passed to verifyDeletion in checkDeclaredDeletionInDatabase. */
export type VerifyDeletionContext = {
  subjectReferenceHex: string;
  sourceLocator?: string;
  deletionEventId: string;
};

export type ContextualVerifyDeletion = (
  ctx: VerifyDeletionContext
) => Promise<VerifyDeletionResult>;

/** Supported database engines for OffSign verification (integrator-owned connection). */
export type DatabaseEngine = 'postgres' | 'mysql' | 'mongo' | (string & {});

export type WiredDeletionDatabaseType = 'postgres' | 'mysql' | 'mongo';

/** Lookup payload for SQL engines (value is always parameterized — never concatenated). */
export type SqlAbsentRecordData = {
  keyField?: string;
  keyValue: string | number | boolean;
};

export type WiredDeletionData =
  | string
  | number
  | boolean
  | SqlAbsentRecordData
  | Record<string, unknown>;

/** Wired DB props — used directly on `offsign()` and `checkDeclaredDeletionInDatabase()`. */
export type WiredDeletionProps = {
  connection: unknown;
  databaseType: WiredDeletionDatabaseType;
  tableOrCollection: string;
  data: WiredDeletionData;
  softDeleteColumn?: string;
};

/** Either inline wired props or a pre-built verifier (advanced). */
export type OffsignDatabaseVerification =
  | (WiredDeletionProps & { databaseVerifier?: never })
  | {
      databaseVerifier: DatabaseVerifier;
      connection?: never;
      databaseType?: never;
      tableOrCollection?: never;
      data?: never;
      softDeleteColumn?: never;
    };

/**
 * Wired database access for OffSign — connection stays with the integrator;
 * the SDK refuses to sign or reconcile without a truthy `connection` and `verifyAbsent`.
 */
export type DatabaseVerifier<TConnection = unknown> = {
  engine: DatabaseEngine;
  /** Client pool/client handle — must be provided (not null/undefined). */
  connection: TConnection;
  /** Read-only absence check using `connection` (same boundary as DELETE). */
  verifyAbsent: ContextualVerifyDeletion;
};

/** Reconcile a signed declaration with a read-only DB check (C7). */
export type DeletionDatabaseCheckResult = {
  ok: boolean;
  absent: boolean;
  attestationVerified: boolean;
  receiptBindingOk?: boolean;
  declaredSubjectReferenceHex: string;
  detail?: string;
  checkedAtUnixMs: number;
};

export type RestoreGuardPolicy = {
  /** Block restore when get_receipt lookup fails (recommended in production). */
  failClosedOnLookupError?: boolean;
};

export type RestoreGuardResult =
  | { allowed: true; receiptLookup: 'not_found' | 'not_yet_issued' | 'invalid_subject' }
  | {
      allowed: false;
      reason: 'tombstoned_on_chain' | 'local_deletion_registry';
      receipt?: Receipt;
      subjectReferenceHex: string;
    };

export type CommercialPreflightStatus = {
  commercialStatus: string;
  remaining: bigint;
  reserved: bigint;
  canEmit: boolean;
  blockedReason: string | null;
};

export type SecurityPreflightResult =
  | { ok: true; allowance: CommercialPreflightStatus }
  | {
      ok: false;
      code: OffSignCommercialErrorCode;
      message: string;
      allowance: CommercialPreflightStatus;
    };

export type OffSignCommercialErrorCode =
  | 'exhausted'
  | 'awaiting_first_injection'
  | 'clone_detected'
  | 'revoked'
  | 'init_rejected'
  | 'expired'
  | 'no_credits'
  | 'commercial_gate_failed'
  | 'lookup_failed';

export class OffSignCommercialError extends Error {
  readonly code: OffSignCommercialErrorCode;
  readonly preflight: SecurityPreflightResult;

  constructor(code: OffSignCommercialErrorCode, message: string, preflight: SecurityPreflightResult) {
    super(message);
    this.name = 'OffSignCommercialError';
    this.code = code;
    this.preflight = preflight;
  }
}

export class OffsignDeletionNotVerifiedError extends Error {
  readonly detail?: string;

  constructor(detail?: string) {
    super(detail ?? 'Deletion not verified absent in database before sign');
    this.name = 'OffsignDeletionNotVerifiedError';
    this.detail = detail;
  }
}

export class OffsignDatabaseVerifierRequiredError extends Error {
  constructor(message?: string) {
    super(
      message ??
        'Wire your DB on offsign: connection + databaseType + tableOrCollection + data (or pass databaseVerifier)'
    );
    this.name = 'OffsignDatabaseVerifierRequiredError';
  }
}

export type CheckDeclaredDeletionParams = {
  signedAttestation: SignedBackendDeletionAttestationV1;
  receipt?: Receipt;
  trustedBackendPublicKeyHex?: string;
  /** Dev/test only — skips live DB reconciliation. */
  skipDatabaseVerification?: boolean;
} & OffsignDatabaseVerification;
