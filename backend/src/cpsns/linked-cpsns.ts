import { Role, VerificationStatus } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service.js';
import { hasCpsnsNumber, normalizeCpsns } from './cpsns-verified.js';

export type LinkedCpsns = {
  cpsnsNumber: string;
  verified: boolean;
  verifiedAt: Date | null;
};

/** CPSNS on the same person's other profile (same email, the other of HOST / LOCUM). */
export async function findLinkedCpsns(
  prisma: PrismaService,
  userId: string,
): Promise<LinkedCpsns | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, role: true },
  });
  if (!user) return null;

  let raw: string | null | undefined;
  let status: VerificationStatus | null | undefined;
  let verifiedAt: Date | null | undefined;
  if (user.role === Role.HOST) {
    const other = await prisma.locumProfile.findFirst({
      where: { user: { email: user.email, role: Role.LOCUM } },
      select: {
        cpsnsId: true,
        cpsnsVerificationStatus: true,
        cpsnsVerifiedAt: true,
      },
    });
    raw = other?.cpsnsId;
    status = other?.cpsnsVerificationStatus;
    verifiedAt = other?.cpsnsVerifiedAt;
  } else if (user.role === Role.LOCUM) {
    const other = await prisma.hostProfile.findFirst({
      where: { user: { email: user.email, role: Role.HOST } },
      select: {
        cpsnsNumber: true,
        cpsnsVerificationStatus: true,
        cpsnsVerifiedAt: true,
      },
    });
    raw = other?.cpsnsNumber;
    status = other?.cpsnsVerificationStatus;
    verifiedAt = other?.cpsnsVerifiedAt;
  } else {
    return null;
  }

  if (!hasCpsnsNumber(raw)) return null;
  const verified = status === VerificationStatus.VERIFIED;
  return {
    cpsnsNumber: normalizeCpsns(raw),
    verified,
    verifiedAt: verified ? (verifiedAt ?? null) : null,
  };
}

/** Status patch that carries over a verified CPSNS when the saved number matches it. */
export function linkedCpsnsVerifiedPatch(
  linked: LinkedCpsns | null,
  cpsnsDigits: string,
  currentStatus: VerificationStatus | null | undefined,
): { cpsnsVerificationStatus: VerificationStatus; cpsnsVerifiedAt: Date } | null {
  if (!linked?.verified || !cpsnsDigits) return null;
  if (currentStatus === VerificationStatus.VERIFIED) return null;
  if (linked.cpsnsNumber !== cpsnsDigits) return null;
  return {
    cpsnsVerificationStatus: VerificationStatus.VERIFIED,
    cpsnsVerifiedAt: new Date(),
  };
}
