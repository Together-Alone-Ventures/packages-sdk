import { IDL } from '@dfinity/candid';

export const mktd03IdlFactory: IDL.InterfaceFactory = ({ IDL }) => {
  const SemanticVersion = IDL.Record({
    major: IDL.Nat32,
    minor: IDL.Nat32,
    patch: IDL.Nat32,
  });

  const Compatibility = IDL.Variant({
    compatible: IDL.Null,
    conditionally_compatible: IDL.Null,
    unsupported: IDL.Null,
  });

  const BuildIdentity = IDL.Record({
    build_version: SemanticVersion,
    build_label: IDL.Opt(IDL.Text),
    module_hash: IDL.Opt(IDL.Vec(IDL.Nat8)),
  });

  const BlockedCode = IDL.Variant({
    rebuild_required: IDL.Null,
    rebuild_consistency_failure: IDL.Null,
    initialisation_incomplete: IDL.Null,
    operator_hold: IDL.Null,
    unsupported_version: IDL.Null,
    incompatible_status_surface: IDL.Null,
    unknown_blocked_state: IDL.Null,
  });

  const BlockedReason = IDL.Record({
    code: BlockedCode,
    description: IDL.Text,
  });

  const LifecycleState = IDL.Variant({
    uninitialised: IDL.Null,
    initialising: IDL.Null,
    ready: IDL.Null,
    rebuilding: IDL.Null,
    failed: IDL.Null,
  });

  const OperationContext = IDL.Variant({
    none: IDL.Null,
    receipt_retrieval: IDL.Null,
    status_check: IDL.Null,
    version_check: IDL.Null,
    readiness_check: IDL.Null,
  });

  const StatusSurface = IDL.Record({
    protocol_version: SemanticVersion,
    status_schema_version: SemanticVersion,
    interface_version: SemanticVersion,
    build_identity: BuildIdentity,
    lifecycle_state: LifecycleState,
    is_blocked: IDL.Bool,
    blocked_reason: IDL.Opt(BlockedReason),
    compatibility: Compatibility,
    operation_context: IDL.Opt(OperationContext),
  });

  const DeletionStateMaterial = IDL.Variant({
    tombstoned_position: IDL.Vec(IDL.Nat8),
    empty_position: IDL.Vec(IDL.Nat8),
  });

  const CoreTransitionEvidence = IDL.Record({
    subject_reference: IDL.Vec(IDL.Nat8),
    scope_reference: IDL.Opt(IDL.Vec(IDL.Nat8)),
    pre_state_commitment: IDL.Vec(IDL.Nat8),
    post_state_commitment: IDL.Vec(IDL.Nat8),
    transition_material: IDL.Vec(IDL.Nat8),
    transition_derivation_version: SemanticVersion,
    tree_proof: IDL.Vec(IDL.Nat8),
    deletion_state_material: DeletionStateMaterial,
  });

  const CertificationProvenancePosture = IDL.Variant({
    inline_payload: IDL.Null,
    route_dependent_payload: IDL.Null,
    no_payload_for_route: IDL.Null,
  });

  const CertificationProvenanceRoute = IDL.Variant({
    direct_inline: IDL.Null,
    route_context_required: IDL.Null,
    route_context_only: IDL.Null,
  });

  const IssuanceEnvironment = IDL.Variant({
    mainnet: IDL.Null,
    local_dev: IDL.Null,
  });

  const CertificationProvenanceBlock = IDL.Record({
    posture: CertificationProvenancePosture,
    route: CertificationProvenanceRoute,
    issuance_environment: IssuanceEnvironment,
    trust_anchor_fingerprint: IDL.Vec(IDL.Nat8),
    certification_material: IDL.Opt(IDL.Vec(IDL.Nat8)),
    provenance_material: IDL.Opt(IDL.Vec(IDL.Nat8)),
    route_context_material: IDL.Opt(IDL.Vec(IDL.Nat8)),
  });

  const Receipt = IDL.Record({
    protocol_version: SemanticVersion,
    receipt_version: SemanticVersion,
    core_transition_evidence: CoreTransitionEvidence,
    certification_provenance: CertificationProvenanceBlock,
  });

  const ReceiptError = IDL.Variant({
    not_found: IDL.Null,
    not_yet_issued: IDL.Null,
    invalid_subject_reference: IDL.Null,
    unsupported_version: IDL.Null,
  });

  const ReceiptResult = IDL.Variant({
    ok: Receipt,
    err: ReceiptError,
  });

  const BeginTreeReceiptIssuanceRequest = IDL.Record({
    subject_reference: IDL.Vec(IDL.Nat8),
    scope_reference: IDL.Opt(IDL.Vec(IDL.Nat8)),
    transition_material: IDL.Vec(IDL.Nat8),
    deletion_state_material: IDL.Vec(IDL.Nat8),
  });

  const PendingReceiptInfo = IDL.Record({
    pending_id: IDL.Vec(IDL.Nat8),
    certified_commitment: IDL.Vec(IDL.Nat8),
  });

  const IssuanceApiError = IDL.Variant({
    invalid_subject_reference: IDL.Null,
    invalid_scope_reference: IDL.Null,
    invalid_transition_material: IDL.Null,
    invalid_deletion_state_material: IDL.Null,
    pending_issuance_in_progress: IDL.Null,
    no_pending_issuance: IDL.Null,
    pending_id_mismatch: IDL.Null,
    certificate_unavailable: IDL.Null,
    issuance_failed: IDL.Null,
    validation_failed: IDL.Null,
    storage_unavailable: IDL.Null,
  });

  const BeginTreeReceiptIssuanceResult = IDL.Variant({
    ok: PendingReceiptInfo,
    err: IssuanceApiError,
  });

  const PendingCertificateMaterial = IDL.Record({
    pending_id: IDL.Vec(IDL.Nat8),
    certified_commitment: IDL.Vec(IDL.Nat8),
    certificate_material: IDL.Vec(IDL.Nat8),
  });

  const PendingCertificateMaterialResult = IDL.Variant({
    ok: PendingCertificateMaterial,
    err: IssuanceApiError,
  });

  const FinalizeTreeReceiptRequest = IDL.Record({
    pending_id: IDL.Vec(IDL.Nat8),
    certificate_material: IDL.Vec(IDL.Nat8),
  });

  const FinalizeTreeReceiptResult = IDL.Variant({
    ok: Receipt,
    err: IssuanceApiError,
  });

  const AuditMetadataInput = IDL.Record({
    subject_label: IDL.Opt(IDL.Text),
    data_category: IDL.Opt(IDL.Text),
    source_system: IDL.Opt(IDL.Text),
    source_locator: IDL.Opt(IDL.Text),
    legal_context: IDL.Opt(IDL.Text),
    locale: IDL.Opt(IDL.Text),
    gate_mode: IDL.Opt(
      IDL.Variant({
        P1_on_chain_per_cvdr: IDL.Null,
        P3_off_ledger_allowance: IDL.Null,
        none: IDL.Null,
      })
    ),
    oem_identifier: IDL.Opt(IDL.Text),
    extensions: IDL.Opt(IDL.Vec(IDL.Tuple(IDL.Text, IDL.Text))),
  });

  const AuditRecordApiError = IDL.Variant({
    invalid_subject_reference: IDL.Null,
    not_found: IDL.Null,
    not_yet_issued: IDL.Null,
    metadata_rejected: IDL.Null,
    storage_unavailable: IDL.Null,
    not_implemented: IDL.Null,
    wrong_principal: IDL.Null,
    invalid_token: IDL.Null,
    verification_failed: IDL.Null,
    commercial_gate_failed: IDL.Null,
  });

  const RenderAuditPdfResult = IDL.Variant({
    Ok: IDL.Vec(IDL.Nat8),
    Err: AuditRecordApiError,
  });

  const SetAuditMetadataResult = IDL.Variant({
    Ok: IDL.Null,
    Err: AuditRecordApiError,
  });

  const CommercialStatus = IDL.Variant({
    operational: IDL.Null,
    awaiting_first_injection: IDL.Null,
    exhausted: IDL.Null,
    expired: IDL.Null,
    revoked: IDL.Null,
    clone_suspected: IDL.Null,
    init_rejected: IDL.Null,
    dev_bypass: IDL.Null,
  });

  const CommercialApiError = IDL.Variant({
    unauthorized_caller: IDL.Null,
    invalid_signature: IDL.Null,
    invalid_payload: IDL.Null,
    canister_id_mismatch: IDL.Null,
    deployment_mismatch: IDL.Null,
    org_mismatch: IDL.Null,
    seq_replay: IDL.Null,
    bundle_replay: IDL.Null,
    commercial_disabled: IDL.Null,
    clone_suspected: IDL.Null,
    storage_unavailable: IDL.Null,
  });

  const AllowanceStatus = IDL.Record({
    commercial_status: CommercialStatus,
    remaining: IDL.Nat64,
    reserved: IDL.Nat64,
    allowance_seq: IDL.Nat64,
    deployment_id: IDL.Opt(IDL.Text),
    org_id: IDL.Opt(IDL.Text),
    dev_bypass: IDL.Bool,
  });

  const SecuritySurface = IDL.Record({
    commercial_status: CommercialStatus,
    deployment_id: IDL.Opt(IDL.Text),
    org_id: IDL.Opt(IDL.Text),
    module_hash: IDL.Opt(IDL.Vec(IDL.Nat8)),
    blocked_reason: IDL.Opt(IDL.Text),
    can_emit: IDL.Bool,
  });

  const AllowanceStatusResult = IDL.Variant({ Ok: AllowanceStatus, Err: CommercialApiError });
  const SecurityStatusResult = IDL.Variant({ Ok: SecuritySurface, Err: CommercialApiError });

  return IDL.Service({
    get_tree_mode_status: IDL.Func([], [StatusSurface], ['query']),
    get_receipt: IDL.Func([IDL.Vec(IDL.Nat8)], [ReceiptResult], ['query']),
    begin_tree_receipt_issuance: IDL.Func(
      [BeginTreeReceiptIssuanceRequest],
      [BeginTreeReceiptIssuanceResult],
      []
    ),
    get_pending_certificate_material: IDL.Func(
      [IDL.Vec(IDL.Nat8)],
      [PendingCertificateMaterialResult],
      ['query']
    ),
    finalize_tree_receipt: IDL.Func(
      [FinalizeTreeReceiptRequest],
      [FinalizeTreeReceiptResult],
      []
    ),
    set_audit_metadata: IDL.Func(
      [IDL.Vec(IDL.Nat8), AuditMetadataInput],
      [SetAuditMetadataResult],
      []
    ),
    render_audit_pdf: IDL.Func(
      [IDL.Vec(IDL.Nat8), IDL.Vec(IDL.Nat8)],
      [RenderAuditPdfResult],
      []
    ),
    get_allowance_status: IDL.Func([], [AllowanceStatusResult], ['query']),
    get_security_status: IDL.Func([], [SecurityStatusResult], ['query']),
  });
};
