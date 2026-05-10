export function normalizeCpsns(input: string | null | undefined): string {
    return String(input ?? '').replace(/\D/g, '');
}
export function isCpsnsNineDigitsFormat(input: string | null | undefined): boolean {
    return normalizeCpsns(input).length === 9;
}
export function sanitizeCpsnsInput(raw: string): string {
    return normalizeCpsns(raw).slice(0, 9);
}
const VERIFIED_CPSNS = new Set([
    '895874638',
    '152364789',
    '741258963',
    '582369741',
    '104582731',
    '217406895',
    '398175204',
    '482691357',
    '563820149',
    '674913582',
    '715284936',
    '826507143',
    '937164820',
    '148295673',
    '259736481',
    '361948725',
    '472583916',
    '584107362',
    '695321874',
    '706498251',
    '817235649',
    '928614507',
    '139527864',
    '240683915',
    '351794286',
    '462805731',
    '573916428',
    '684127593',
    '795238164',
    '806349275',
    '917450836',
    '128561947',
    '239672518',
    '340783629',
    '451894730',
    '562905841',
    '673016952',
    '784127063',
    '895238174',
    '906349285',
    '117450396',
    '228561407',
    '339672518',
    '440783629',
]);
export function isCpsnsVerified(cpsns: string | null | undefined): boolean {
    const n = normalizeCpsns(cpsns);
    return n.length > 0 && VERIFIED_CPSNS.has(n);
}
