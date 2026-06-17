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
    'Pour le solde réel : upgrade MKTd03 3.4.0+ avec couche commercial à l\'init (get_allowance_status).',
    'Pour émettre sans preflight sur un ancien WASM : DEMO_SKIP_MKTD03_PREFLIGHT=1.',
    'Pour un compteur local fictif : DEMO_ALLOWANCE_ESTIMATE=1 (pas on-chain).',
  ].join(' ');
}

export function isAllowanceStatusMissing(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return msg.includes('get_allowance_status');
}
