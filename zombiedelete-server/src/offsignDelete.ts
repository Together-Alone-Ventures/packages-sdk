import type { Ed25519KeyIdentity } from '@dfinity/identity';
import type {
  Receipt,
  SignedBackendDeletionAttestationV1,
  WiredDeletionDatabaseType,
  WiredDeletionData,
} from '@together-alone/zombiedelete-core';
import { executeParameterizedDelete } from './databaseMutations.js';
import type { IssueAttestedDeletionReceiptParams } from './issuanceTypes.js';
import { issueAttestedDeletionReceipt } from './issueAttestedDeletionReceipt.js';
import { offsign } from './offsign.js';

/** MKTd03 issuance params — `signedAttestation` is produced by offsign inside offsignDelete(). */
export type OffsignMktd03Input = Omit<IssueAttestedDeletionReceiptParams, 'signedAttestation'>;

export class OffsignDeleteNotExecutedError extends Error {
  readonly deletedCount: number;

  constructor(deletedCount: number, detail?: string) {
    super(
      detail ??
        (deletedCount === 0
          ? 'DELETE affected zero rows — attestation refused'
          : `DELETE affected ${deletedCount} rows — expected exactly one`)
    );
    this.name = 'OffsignDeleteNotExecutedError';
    this.deletedCount = deletedCount;
  }
}

export type OffsignDeleteInput = {
  identity: Ed25519KeyIdentity;
  subjectReference: Uint8Array;
  deletionEventId: string;
  deletedAtUnixMs?: number;
  sourceSystem?: string;
  sourceLocator?: string;
  dbEngine?: string;
  dbTransactionId?: string;
  connection: unknown;
  databaseType: WiredDeletionDatabaseType;
  tableOrCollection: string;
  data: WiredDeletionData;
  /** When true, refuse if DELETE removes more than one row (default: true). */
  rejectMultiRowDelete?: boolean;
  /** After DB verify + backend sign, issue the CVDR receipt on MKTd03. */
  mktd03: OffsignMktd03Input;
};

export type OffsignDeleteResult = {
  signedAttestation: SignedBackendDeletionAttestationV1;
  deletedCount: number;
  receipt: Receipt;
};

/**
 * OffSign flow: parameterized DELETE, read-only absence check, backend attestation, then MKTd03 CVDR.
 * Table/column names are validated; values are always bound as query parameters.
 */
export async function offsignDelete(input: OffsignDeleteInput): Promise<OffsignDeleteResult> {
  const { deletedCount } = await executeParameterizedDelete({
    connection: input.connection,
    databaseType: input.databaseType,
    tableOrCollection: input.tableOrCollection,
    data: input.data,
  });

  const rejectMulti = input.rejectMultiRowDelete !== false;
  if (deletedCount === 0) {
    throw new OffsignDeleteNotExecutedError(0);
  }
  if (rejectMulti && deletedCount > 1) {
    throw new OffsignDeleteNotExecutedError(
      deletedCount,
      `DELETE affected ${deletedCount} rows — attestation refused (expected exactly one)`
    );
  }

  const offsignInput = {
    identity: input.identity,
    subjectReference: input.subjectReference,
    deletionEventId: input.deletionEventId,
    deletedAtUnixMs: input.deletedAtUnixMs,
    sourceSystem: input.sourceSystem,
    sourceLocator: input.sourceLocator,
    dbEngine: input.dbEngine,
    dbTransactionId: input.dbTransactionId,
    connection: input.connection,
    databaseType: input.databaseType,
    tableOrCollection: input.tableOrCollection,
    data: input.data,
  };

  const signedAttestation = await offsign(offsignInput);

  const receipt = await issueAttestedDeletionReceipt({
    ...input.mktd03,
    signedAttestation,
  });

  return { signedAttestation, deletedCount, receipt };
}
