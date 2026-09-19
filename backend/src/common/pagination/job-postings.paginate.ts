import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PostingStatus } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { browseShiftStartActiveSql } from '../../host/job-schedule.util.js';
import {
  getReviewPlaygroundEmails,
  reviewPlaygroundHostSql,
  reviewPlaygroundHostWhere,
  type ReviewPlaygroundMode,
} from '../../config/review-playground.util.js';
import { buildCursorQuery, decodeCursor, toPaginatedResult } from './cursor.util.js';
import type { PaginatedResult, PaginationParams } from './pagination.types.js';

export type JobPostingPaginateFilters = {
  status?: PostingStatus;
  hostProfileId?: string;
  isDeleted?: boolean;
  /** Exclude postings whose shift start (date + time) is in the past. */
  excludePassedStartDate?: boolean;
  /**
   * Review playground isolation: review accounts only see review-host jobs;
   * real/anonymous viewers never see review-host jobs.
   */
  playgroundMode?: ReviewPlaygroundMode;
};

async function paginateJobPostingsWithShiftFilter(
  prisma: PrismaService,
  filters: JobPostingPaginateFilters,
  pagination: PaginationParams,
  include?: Prisma.JobPostingInclude,
): Promise<PaginatedResult<Prisma.JobPostingGetPayload<{ include: Prisma.JobPostingInclude }>>> {
  const { cursor, limit, direction } = pagination;
  const shiftActive = browseShiftStartActiveSql();
  let cursorId: string | null = null;
  if (cursor) {
    try {
      cursorId = decodeCursor(cursor);
    } catch {
      throw new BadRequestException('Invalid cursor');
    }
  }

  const statusClause = filters.status
    ? Prisma.sql`AND status = ${filters.status}::"PostingStatus"`
    : Prisma.empty;
  const deletedClause =
    filters.isDeleted !== undefined
      ? Prisma.sql`AND is_deleted = ${filters.isDeleted}`
      : Prisma.empty;
  const hostClause = filters.hostProfileId
    ? Prisma.sql`AND "hostProfileId" = ${filters.hostProfileId}`
    : Prisma.empty;
  const playgroundClause = filters.playgroundMode
    ? reviewPlaygroundHostSql(
        filters.playgroundMode,
        getReviewPlaygroundEmails(),
      )
    : Prisma.empty;
  const cursorClause =
    cursorId && direction === 'desc'
      ? Prisma.sql`AND id < ${cursorId}`
      : cursorId && direction === 'asc'
        ? Prisma.sql`AND id > ${cursorId}`
        : Prisma.empty;
  const orderClause =
    direction === 'desc' ? Prisma.raw('DESC') : Prisma.raw('ASC');

  const idRows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM job_postings
    WHERE ${shiftActive}
    ${statusClause}
    ${deletedClause}
    ${hostClause}
    ${playgroundClause}
    ${cursorClause}
    ORDER BY id ${orderClause}
    LIMIT ${limit + 1}
  `;

  const ids = idRows.map((r) => r.id);
  if (ids.length === 0) {
    return { items: [], nextCursor: null, hasNextPage: false };
  }

  const rows = await prisma.jobPosting.findMany({
    where: { id: { in: ids } },
    include,
    orderBy: { id: direction },
  });

  const byId = new Map(rows.map((r) => [r.id, r]));
  const ordered = ids
    .map((id) => byId.get(id))
    .filter((r): r is (typeof rows)[number] => r != null);

  return toPaginatedResult(ordered, limit);
}

export async function paginateJobPostings(
  prisma: PrismaService,
  filters: JobPostingPaginateFilters,
  pagination: PaginationParams,
  include?: Prisma.JobPostingInclude,
): Promise<PaginatedResult<Prisma.JobPostingGetPayload<{ include: Prisma.JobPostingInclude }>>> {
  if (filters.excludePassedStartDate) {
    return paginateJobPostingsWithShiftFilter(
      prisma,
      filters,
      pagination,
      include,
    );
  }

  const { cursor, limit, direction } = pagination;
  const where: Prisma.JobPostingWhereInput = {
    ...(filters.hostProfileId ? { hostProfileId: filters.hostProfileId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.isDeleted !== undefined ? { isDeleted: filters.isDeleted } : {}),
    ...(filters.playgroundMode
      ? reviewPlaygroundHostWhere(
          filters.playgroundMode,
          getReviewPlaygroundEmails(),
        )
      : {}),
    ...buildCursorQuery(cursor, direction),
  };

  const rows = await prisma.jobPosting.findMany({
    where,
    orderBy: { id: direction },
    take: limit + 1,
    include,
  });

  return toPaginatedResult(rows, limit);
}

export async function countBrowseActiveJobPostings(
  prisma: PrismaService,
  playgroundMode: ReviewPlaygroundMode = 'exclude-review',
): Promise<number> {
  const shiftActive = browseShiftStartActiveSql();
  const playgroundClause = reviewPlaygroundHostSql(
    playgroundMode,
    getReviewPlaygroundEmails(),
  );
  const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
    FROM job_postings
    WHERE status = 'ACTIVE'::"PostingStatus"
      AND is_deleted = false
      AND ${shiftActive}
      ${playgroundClause}
  `;
  return Number(rows[0]?.count ?? 0);
}
