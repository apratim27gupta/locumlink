import type { Role } from '@/lib/auth';

/** Short hover guides for Host vs Locum entry points. */
export const ROLE_GUIDE = {
  clinic: 'I need a doctor to cover my practice',
  locum: 'I am a doctor looking for locum work',
} as const;

/** Host = brand navy; Locum = logo “Link” cyan (#38C6C6). */
export const ROLE_ACCENT = {
  clinic: {
    primary: '#0F2A7A',
    primaryHover: '#1E3FAF',
    light: '#E8EDF8',
    sidebarGradient: 'linear-gradient(180deg, #0F2A7A 0%, #1E3FAF 100%)',
    sidebarShadow: '4px 0 24px rgba(15, 42, 122, 0.18)',
    sidebarActive: '#38C6C6',
    sidebarActiveBg: 'rgba(56, 198, 198, 0.15)',
    badgeFg: '#0F2A7A',
  },
  locum: {
    primary: '#38C6C6',
    primaryHover: '#2BB0B0',
    light: '#E8F9F9',
    sidebarGradient: 'linear-gradient(180deg, #0E6E6E 0%, #1A9A9A 100%)',
    sidebarShadow: '4px 0 24px rgba(56, 198, 198, 0.22)',
    sidebarActive: '#38C6C6',
    sidebarActiveBg: 'rgba(56, 198, 198, 0.22)',
    badgeFg: '#0F2A7A',
  },
} as const;

export type RoleAccent = (typeof ROLE_ACCENT)[Role];

export function roleAccent(role: Role | null | undefined): RoleAccent {
  return role === 'clinic' ? ROLE_ACCENT.clinic : ROLE_ACCENT.locum;
}

/** Prefer URL path over cookie so host/locum chrome always matches the page. */
export function roleFromPathname(pathname: string | null | undefined): Role {
  if (pathname?.startsWith('/host')) return 'clinic';
  if (pathname?.startsWith('/locum')) return 'locum';
  return 'locum';
}
