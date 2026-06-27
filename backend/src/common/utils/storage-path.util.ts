import { ForbiddenException } from '@nestjs/common';

export function assertOwnsStoragePath(
  path: string,
  userId: string,
): void {
  const normalized = path.trim();
  const expected = `uploads/${userId}/`;
  if (!normalized.startsWith(expected)) {
    throw new ForbiddenException(
      `Invalid storage path: must be under uploads/${userId}/`,
    );
  }
}
