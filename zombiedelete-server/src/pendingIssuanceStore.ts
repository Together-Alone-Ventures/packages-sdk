export type PendingIssuanceRecord = {
  canisterId: string;
  subjectReferenceHex: string;
  pendingIdHex: string;
  startedAt: string;
};

export type PendingIssuanceStore = {
  save(record: PendingIssuanceRecord): Promise<void>;
  load(canisterId: string, subjectReferenceHex: string): Promise<PendingIssuanceRecord | null>;
  clear(canisterId: string, subjectReferenceHex: string): Promise<void>;
  list(canisterId: string): Promise<PendingIssuanceRecord[]>;
};
