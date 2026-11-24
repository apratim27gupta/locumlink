/**
 * One-off backfill: create a PRIMARY match-fee invoice for completed matches
 * whose posting predates the match-fee feature (grandfathered) and so never
 * got invoiced automatically.
 *
 * Reuses the real PaymentsService.createMatchFeeInvoice so the amount, HST,
 * tier, INVOICED event and host notification are all produced by app logic.
 * A minimal module (PaymentsModule only) is booted so no cron scheduler runs.
 *
 * Env is loaded from backend/.env.production + backend/.env by ConfigModule,
 * so just run from the backend/ directory — no shell `source` needed.
 *
 * Usage (from backend/, after build):
 *   # Discover application ids by locum name / posting / clinic:
 *   node dist/scripts/backfill-match-fee-invoice.js --find "Obiora Onyeabo"
 *   # Dry-run a specific application (prints what WOULD be created):
 *   node dist/scripts/backfill-match-fee-invoice.js --app <id>
 *   # Actually create (writes + notifies host), due 7 days out:
 *   node dist/scripts/backfill-match-fee-invoice.js --app <id> --app <id> --apply
 *   # Custom due window:
 *   node dist/scripts/backfill-match-fee-invoice.js --app <id> --apply --due-days 7
 */
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { PaymentsModule } from '../payments/payments.module.js';
import { PaymentsService } from '../payments/payments.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  computeMatchFeeAmountCents,
  computeMatchFeeTaxCents,
  MATCH_FEE_HST_RATE_BPS,
  matchFeeTierFromHours,
  isPostingGrandfatheredFromMatchFee,
} from '../payments/match-fee.constants.js';
import { computeApplicationClaimedHours } from '../host/job-schedule.util.js';

// Load env from the backend dir's files (run with cwd = backend). ConfigModule
// uses dotenv, which parses quoted/space values correctly — no shell `source`
// needed. .env.production is listed first so its values win over .env.
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.production', '.env'],
    }),
    PaymentsModule,
  ],
})
class BackfillModule {}

function cad(cents: number): string {
  return `CA$${(cents / 100).toFixed(2)}`;
}

type Args = {
  apply: boolean;
  dueDays: number;
  appIds: string[];
  finds: string[];
};

function parseArgs(argv: string[]): Args {
  const args: Args = { apply: false, dueDays: 7, appIds: [], finds: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') args.apply = true;
    else if (a === '--due-days') args.dueDays = Number(argv[++i]);
    else if (a === '--app') args.appIds.push(argv[++i]);
    else if (a === '--find') args.finds.push(argv[++i]);
    else throw new Error(`Unknown argument: ${a}`);
  }
  if (!Number.isFinite(args.dueDays) || args.dueDays <= 0) {
    throw new Error('--due-days must be a positive number');
  }
  return args;
}

async function runFind(prisma: PrismaService, text: string): Promise<void> {
  console.log(`\n=== FIND "${text}" ===`);
  const apps = await prisma.application.findMany({
    where: {
      OR: [
        { locumProfile: { firstName: { contains: text, mode: 'insensitive' } } },
        { locumProfile: { lastName: { contains: text, mode: 'insensitive' } } },
        { locumProfile: { user: { email: { contains: text, mode: 'insensitive' } } } },
        { jobPosting: { title: { contains: text, mode: 'insensitive' } } },
        { jobPosting: { hostProfile: { practiceName: { contains: text, mode: 'insensitive' } } } },
      ],
    },
    select: {
      id: true,
      status: true,
      locumAcceptedAt: true,
      locumProfile: { select: { firstName: true, lastName: true } },
      jobPosting: {
        select: {
          title: true,
          createdAt: true,
          startDate: true,
          endDate: true,
          hostProfile: { select: { practiceName: true, user: { select: { email: true } } } },
        },
      },
      matchFeeInvoices: { select: { id: true, kind: true, status: true } },
    },
    orderBy: { locumAcceptedAt: 'desc' },
    take: 25,
  });
  if (apps.length === 0) {
    console.log('  (no matching applications)');
    return;
  }
  for (const a of apps) {
    const locum = `${a.locumProfile?.firstName ?? ''} ${a.locumProfile?.lastName ?? ''}`.trim();
    const gf = isPostingGrandfatheredFromMatchFee(a.jobPosting.createdAt);
    const inv = a.matchFeeInvoices
      .map((i) => `${i.kind}:${i.status}`)
      .join(', ') || 'none';
    console.log(
      `  appId=${a.id}\n    locum="${locum}"  clinic="${a.jobPosting.hostProfile?.practiceName ?? ''}"\n    posting="${a.jobPosting.title}"  status=${a.status}  accepted=${a.locumAcceptedAt ? 'yes' : 'NO'}\n    dates=${a.jobPosting.startDate?.toISOString().slice(0, 10)}→${a.jobPosting.endDate?.toISOString().slice(0, 10)}  postingCreated=${a.jobPosting.createdAt.toISOString().slice(0, 10)}  grandfathered=${gf}\n    hostEmail=${a.jobPosting.hostProfile?.user?.email ?? '?'}  existingInvoices=${inv}`,
    );
  }
}

async function previewApp(prisma: PrismaService, appId: string, dueAt: Date): Promise<boolean> {
  const app = await prisma.application.findUnique({
    where: { id: appId },
    include: {
      shiftClaims: { select: { shiftId: true } },
      locumProfile: { select: { firstName: true, lastName: true } },
      jobPosting: {
        select: {
          title: true,
          createdAt: true,
          scheduleModel: true,
          startDate: true,
          endDate: true,
          startTime: true,
          endTime: true,
          shifts: { select: { id: true, date: true, shiftType: true, startTime: true, endTime: true } },
          hostProfile: { select: { practiceName: true, user: { select: { email: true } } } },
        },
      },
      matchFeeInvoices: { select: { id: true, kind: true, status: true } },
    },
  });
  if (!app) {
    console.log(`  appId=${appId}: NOT FOUND`);
    return false;
  }
  const locum = `${app.locumProfile?.firstName ?? ''} ${app.locumProfile?.lastName ?? ''}`.trim();
  const hours = computeApplicationClaimedHours(app.jobPosting, {
    availabilityKind: app.availabilityKind,
    availableDates: app.availableDates,
    requestedShiftIds: app.requestedShiftIds,
    shiftClaims: app.shiftClaims,
  });
  const amountCents = computeMatchFeeAmountCents(hours);
  const taxCents = computeMatchFeeTaxCents(amountCents, MATCH_FEE_HST_RATE_BPS);
  const tier = matchFeeTierFromHours(hours);
  const existingPrimary = app.matchFeeInvoices.find((i) => i.kind === 'PRIMARY');
  const terminal = ['REFUNDED', 'CANCELLED', 'CREDITED'];
  const blocked = existingPrimary && !terminal.includes(existingPrimary.status);
  console.log(
    `  appId=${appId}\n    locum="${locum}"  posting="${app.jobPosting.title}"  clinic="${app.jobPosting.hostProfile?.practiceName ?? ''}"\n    accepted=${app.locumAcceptedAt ? 'yes' : 'NO'}  claimedHours=${hours}  tier=${tier}\n    fee=${cad(amountCents)} + ${cad(taxCents)} HST = ${cad(amountCents + taxCents)}\n    dueAt(will set)=${dueAt.toISOString().slice(0, 10)}  hostEmail=${app.jobPosting.hostProfile?.user?.email ?? '?'}\n    existingPrimaryInvoice=${existingPrimary ? existingPrimary.status : 'none'}${blocked ? '  → WOULD SKIP (active invoice exists)' : ''}`,
  );
  if (!app.locumAcceptedAt) {
    console.log('    ⚠ no locumAcceptedAt → createMatchFeeInvoice will no-op');
  }
  return Boolean(app.locumAcceptedAt) && !blocked;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const ctx = await NestFactory.createApplicationContext(BackfillModule, {
    logger: ['error', 'warn'],
  });
  const prisma = ctx.get(PrismaService);
  const payments = ctx.get(PaymentsService);

  const dueAt = new Date(Date.now() + args.dueDays * 24 * 60 * 60 * 1000);

  try {
    for (const f of args.finds) {
      await runFind(prisma, f);
    }

    if (args.appIds.length > 0) {
      console.log(`\n=== ${args.apply ? 'APPLY' : 'DRY-RUN'} (${args.appIds.length} application(s)) ===`);
      const creatable: string[] = [];
      for (const id of args.appIds) {
        const ok = await previewApp(prisma, id, dueAt);
        if (ok) creatable.push(id);
      }

      if (!args.apply) {
        console.log('\nDry-run only. Re-run with --apply to create the invoice(s).');
      } else {
        for (const id of creatable) {
          console.log(`\n→ Creating invoice for ${id} ...`);
          await payments.createMatchFeeInvoice(id, {
            ignoreGrandfather: true,
            dueAtOverride: dueAt,
          });
          const inv = await prisma.matchFeeInvoice.findUnique({
            where: { applicationId_kind: { applicationId: id, kind: 'PRIMARY' } },
            select: { id: true, status: true, amountCents: true, taxCents: true, dueAt: true },
          });
          if (inv) {
            console.log(
              `  ✓ invoice=${inv.id} status=${inv.status} ${cad(inv.amountCents)} + ${cad(inv.taxCents)} HST due ${inv.dueAt.toISOString().slice(0, 10)}`,
            );
          } else {
            console.log('  ⚠ no invoice found after create (check logs — posting may lack acceptance)');
          }
        }
        const skipped = args.appIds.filter((id) => !creatable.includes(id));
        if (skipped.length > 0) {
          console.log(`\nSkipped (not creatable): ${skipped.join(', ')}`);
        }
        console.log('\nDone.');
      }
    } else if (args.finds.length === 0) {
      console.log('Nothing to do. Pass --find <text> and/or --app <id> [--apply].');
    }
  } finally {
    await ctx.close();
  }
}

main().catch((err) => {
  console.error('backfill failed:', err);
  process.exit(1);
});
