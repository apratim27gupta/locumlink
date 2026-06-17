import type { PostingStatus, Prisma } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { browseShiftStartActiveSql } from '../../host/job-schedule.util.js';
import { buildCursorQuery, decodeCursor, toPaginatedResult } from './cursor.util.js';
import type { PaginatedResult, PaginationParams } from './pagination.types.js';

export type JobPostingPaginateFilters = {
  status?: PostingStatus;
  hostProfileId?: string;
  isDeleted?: boolean;
  /** Exclude postings whose shift start (date + time) is in the past. */
  excludePassedStartDate?: boolean;
};

async function paginateJobPostingsWithShiftFilter(
  prisma: PrismaService,
  filters: JobPostingPaginateFilters,
  pagination: PaginationParams,
  include?: Prisma.JobPostingInclude,
): Promise<PaginatedResult<Prisma.JobPostingGetPayload<{ include: Prisma.JobPostingInclude }>>> {
  const { cursor, limit, direction } = pagination;
  const shiftActive = browseShiftStartActiveSql();
  const cursorId = cursor ? decodeCursor(cursor) : null;

  const statusClause = filters.status
    ? Prisma.sql`AND status = ${filters.status}::"PostingStatus"`
    : Prisma.empty;
  const deletedClause =
    filters.isDeleted !== undefined
      ? Prisma.sql`AND is_deleted = ${filters.isDeleted}`
      : Prisma.empty;
  const hostClause = filters.hostProfileId
    ? Prisma.sql`AND host_profile_id = ${filters.hostProfileId}`
    : Prisma.empty;
  const cursorClause =
    cursorId && direction === 'desc'
      ? Prisma.sql`AND id < ${cursorId}`
      : cursorId && direction === 'asc'
        ? Prisma.sql`AND id > ${cursorId}`
        : Prisma.empty;
  const orderClause =
    direction === 'desc' ? Prisma.sql`DESC` : Prisma.sql`ASC`;

  const idRows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM job_postings
    WHERE ${shiftActive}
    ${statusClause}
    ${deletedClause}
    ${hostClause}
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
): Promise<number> {
  const shiftActive = browseShiftStartActiveSql();
  const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
    FROM job_postings
    WHERE status = 'ACTIVE'::"PostingStatus"
      AND is_deleted = false
      AND ${shiftActive}
  `;
  return Number(rows[0]?.count ?? 0);
}
