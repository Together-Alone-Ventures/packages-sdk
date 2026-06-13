export function isMktd03InterfaceError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes('ic0536') ||
    msg.includes('method-not-found') ||
    msg.includes('has no query method') ||
    msg.includes('has no update method') ||
    msg.includes('canister has no')
  );
}

export function mktd03CanisterHint(canisterId: string): string {
  return [
    `Le canister ${canisterId} ne répond pas comme un MKTd03 complet (méthode IC introuvable).`,
    'Vérifiez MKTD03_CANISTER_ID dans demo/api/.env (ID affiché après deploy portail).',
    'Si get_allowance_status manque mais get_tree_mode_status fonctionne : DEMO_SKIP_MKTD03_PREFLIGHT=1 dans api/.env.',
  ].join(' ');
}

export function isAllowanceStatusMissing(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return msg.includes('get_allowance_status');
}
