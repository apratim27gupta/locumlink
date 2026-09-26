import { isPostingGrandfatheredFromMatchFee } from './match-fee.constants';

describe('isPostingGrandfatheredFromMatchFee', () => {
  it('exempts postings created before the start date', () => {
    expect(isPostingGrandfatheredFromMatchFee('2026-09-30', '2026-10-01')).toBe(true);
  });

  it('invoices postings created on or after the start date', () => {
    expect(isPostingGrandfatheredFromMatchFee('2026-10-01', '2026-10-01')).toBe(false);
    expect(isPostingGrandfatheredFromMatchFee('2026-11-15', '2026-10-01')).toBe(false);
  });

  it('invoices everything when the start date is unset or invalid', () => {
    expect(isPostingGrandfatheredFromMatchFee('2020-01-01', undefined)).toBe(false);
    expect(isPostingGrandfatheredFromMatchFee('2020-01-01', '')).toBe(false);
    expect(isPostingGrandfatheredFromMatchFee('2020-01-01', '01-10-2026')).toBe(false);
  });
});
