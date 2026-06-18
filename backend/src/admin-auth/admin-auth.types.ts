/** JWT payload for admin sessions. `sub` is the sole identity for authorization. */
export type AdminJwtPayload = {
  /** Admin DB id — use for all authorization checks. */
  sub: string;
  /** Display only; always re-load from DB in guards — do not trust for auth decisions. */
  email: string;
  role: 'admin';
};

export type AdminSessionUser = AdminJwtPayload;
