import { Prisma } from '@prisma/client';
import type { ConfigService } from '@nestjs/config';

/**
 * App Store / QA sandbox accounts — isolated from real job inventory.
 * Always applied in local, staging, and production (fixed OTP + job playground).
 * Optional REVIEW_OTP_EMAILS env adds more addresses; it does not replace this list.
 */
export const DEFAULT_REVIEW_PLAYGROUND_EMAILS = [
  'reviewlocum@locumlink.ca',
  'reviewlocum1@locumlink.ca',
  'reviewlocum2@locumlink.ca',
  'reviewlocum3@locumlink.ca',
];

export type ReviewPlaygroundMode = 'only-review' | 'exclude-review';

/**
 * Emails in the review playground (same list as fixed review OTP).
 *
 * Create both HOST and LOCUM users with the same email (role is part of the
 * unique key). Fixed OTP applies on production; staging may use FIXED_OTP_CODE.
 */
export function getReviewPlaygroundEmails(
  configOrRaw?: ConfigService | string | null,
): string[] {
  let raw: string | undefined;
  if (configOrRaw && typeof configOrRaw === 'object' && 'get' in configOrRaw) {
    raw = configOrRaw.get<string>('REVIEW_OTP_EMAILS')?.trim();
  } else if (typeof configOrRaw === 'string') {
    raw = configOrRaw.trim();
  } else {
    raw = process.env.REVIEW_OTP_EMAILS?.trim();
  }

  const extras = raw
    ? raw
        .split(',')
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean)
    : [];

  return [...new Set([...DEFAULT_REVIEW_PLAYGROUND_EMAILS, ...extras])];
}

export function isReviewPlaygroundEmail(
  email: string | null | undefined,
  emails: string[] = getReviewPlaygroundEmails(),
): boolean {
  if (!email?.trim()) return false;
  return emails.includes(email.trim().toLowerCase());
}

/** Review viewers only see review-host jobs; everyone else (incl. anonymous) excludes them. */
export function playgroundModeForViewer(
  email: string | null | undefined,
  emails: string[] = getReviewPlaygroundEmails(),
): ReviewPlaygroundMode {
  return isReviewPlaygroundEmail(email, emails) ? 'only-review' : 'exclude-review';
}

/** Raw-SQL filter on job_postings."hostProfileId" by host user email. */
export function reviewPlaygroundHostSql(
  mode: ReviewPlaygroundMode,
  emails: string[] = getReviewPlaygroundEmails(),
): Prisma.Sql {
  if (emails.length === 0) return Prisma.empty;
  const list = Prisma.join(emails.map((e) => e.toLowerCase()));
  const hostIds = Prisma.sql`
    SELECT hp.id FROM "host_profiles" hp
    INNER JOIN "users" u ON u.id = hp."userId"
    WHERE LOWER(u.email) IN (${list})
  `;
  return mode === 'only-review'
    ? Prisma.sql`AND "hostProfileId" IN (${hostIds})`
    : Prisma.sql`AND "hostProfileId" NOT IN (${hostIds})`;
}

/** Prisma where-clause equivalent of {@link reviewPlaygroundHostSql}. */
export function reviewPlaygroundHostWhere(
  mode: ReviewPlaygroundMode,
  emails: string[] = getReviewPlaygroundEmails(),
): Prisma.JobPostingWhereInput {
  if (emails.length === 0) return {};
  const emailList = emails.map((e) => e.toLowerCase());
  if (mode === 'only-review') {
    return { hostProfile: { user: { email: { in: emailList } } } };
  }
  return { hostProfile: { user: { email: { notIn: emailList } } } };
}
