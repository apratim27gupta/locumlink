/**
 * Normalize punctuation for in-app / email / push notification copy.
 * Em dashes (—) and en dashes (–) become spaced hyphens.
 */
export function sanitizeNotificationCopy(text: string): string {
  return text
    .replace(/\u2014/g, ' - ')
    .replace(/\u2013/g, ' - ')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export function sanitizeNotificationCopyNullable(
  text: string | null | undefined,
): string | null {
  if (text == null) return null;
  return sanitizeNotificationCopy(text);
}
