/**
 * Central Prisma re-exports for the Nest app.
 * Prefer importing from here in new code; `@prisma/client` remains valid.
 *
 * After `prisma generate`, run `node scripts/link-prisma-client.cjs` (wired into
 * `npm run prisma:generate` / prep-dev) so TypeScript nodenext resolves the
 * hoisted generated client instead of a stale package-local path.
 */
export {
  Prisma,
  PrismaClient,
  MatchFeeCancelledBy,
  MatchFeeInvoiceEventActor,
  MatchFeeInvoiceEventType,
  MatchFeeInvoiceStatus,
  MatchFeeRefundResolution,
  MatchFeeReplacementStatus,
  SupportTicketStatus,
} from '@prisma/client';

export type * from '@prisma/client';
