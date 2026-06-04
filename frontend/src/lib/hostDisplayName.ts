export function formatHostDoctorDisplayName(
    firstName?: string | null,
    lastName?: string | null,
): string | null {
    const name = [firstName?.trim(), lastName?.trim()].filter(Boolean).join(' ').trim();
    return name ? `Dr ${name}` : null;
}
