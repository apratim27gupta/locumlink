export type AdminStats = {
  totalUsers: number;
  hostUsers: number;
  verifiedHostUsers: number;
  locumUsers: number;
  verifiedLocumUsers: number;
  pendingVerifications: number;
  activeJobPostings: number;
  totalJobPostings: number;
};

/** Normalize admin stats from Nest or Next API (field names have drifted). */
export function normalizeAdminStats(raw: unknown): AdminStats | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;
  return {
    totalUsers: Number(s.totalUsers ?? 0),
    hostUsers: Number(s.hostUsers ?? 0),
    verifiedHostUsers: Number(
      s.verifiedHostUsers ?? s.verifiedHosts ?? 0,
    ),
    locumUsers: Number(s.locumUsers ?? 0),
    verifiedLocumUsers: Number(
      s.verifiedLocumUsers ?? s.verifiedLocums ?? 0,
    ),
    pendingVerifications: Number(s.pendingVerifications ?? 0),
    activeJobPostings: Number(s.activeJobPostings ?? 0),
    totalJobPostings: Number(s.totalJobPostings ?? 0),
  };
}
