export type SemanticVersion = {
  major: number;
  minor: number;
  patch: number;
};

export type Receipt = {
  protocol_version: SemanticVersion;
  receipt_version: SemanticVersion;
  core_transition_evidence: {
    subject_reference: Uint8Array | number[];
    pre_state_commitment: Uint8Array | number[];
    post_state_commitment: Uint8Array | number[];
    transition_material: Uint8Array | number[];
    tree_proof: Uint8Array | number[];
    deletion_state_material: { tombstoned_position?: Uint8Array | number[] };
  };
};

/** Backend attestation v1 — signed by the client's API after DB delete. */
export type BackendDeletionAttestationV1 = {
  v: 1;
  subjectReferenceHex: string;
  deletionEventId: string;
  deletedAtUnixMs: number;
  sourceSystem?: string;
  sourceLocator?: string;
  dbEngine?: string;
  dbTransactionId?: string;
};

export type SignedBackendDeletionAttestationV1 = {
  attestation: BackendDeletionAttestationV1;
  signatureHex: string;
  signerPublicKeyHex: string;
};
