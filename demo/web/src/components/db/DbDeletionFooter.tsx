type Props = {
  removed: number;
  deletableTotal: number;
  engineLabel: string;
  footerClass?: string;
};

export function DbDeletionFooter({
  removed,
  deletableTotal,
  engineLabel,
  footerClass = 'db-modal-footer',
}: Props) {
  return (
    <div className={footerClass}>
      {removed > 0 ? (
        <p className="text-amber-300/90">
          {removed} of {deletableTotal} demo-linked row{deletableTotal === 1 ? '' : 's'} removed
          after verified on-chain erasure. They no longer appear in this {engineLabel} view.
        </p>
      ) : (
        <p className="text-slate-500">
          Live view of platform storage ({engineLabel}). Erase a record in the demo to see linked
          rows disappear here.
        </p>
      )}
    </div>
  );
}
