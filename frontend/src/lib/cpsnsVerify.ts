export function normalizeCpsns(input: string | null | undefined): string {
  return String(input ?? '').replace(/\D/g, '');
}

// Temporary manual verification list until admin verification is implemented.
// Keep in sync with backend/src/cpsns/cpsns-verified.ts
const VERIFIED_CPSNS = new Set([
  '895874638',
  '152364789',
  '741258963',
  '582369741',
]);

export function isCpsnsVerified(cpsns: string | null | undefined): boolean {
  const n = normalizeCpsns(cpsns);
  return n.length > 0 && VERIFIED_CPSNS.has(n);
}

