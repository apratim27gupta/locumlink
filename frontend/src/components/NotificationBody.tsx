'use client';

import type { CSSProperties } from 'react';
import {
  looksLikeRichNotificationHtml,
  sanitizeNotificationHtml,
} from '@/lib/sanitizeNotificationHtml';

type Props = {
  body: string;
  eventType?: string | null;
  className?: string;
  style?: CSSProperties;
};

/** Renders plain text, or sanitized B/I/U HTML for admin broadcast messages. */
export default function NotificationBody({
  body,
  eventType,
  className,
  style,
}: Props) {
  const rich =
    eventType === 'U_001_ADMIN_MESSAGE' || looksLikeRichNotificationHtml(body);

  if (!rich) {
    return (
      <div className={className} style={style}>
        {body}
      </div>
    );
  }

  return (
    <div
      className={className}
      style={style}
      dangerouslySetInnerHTML={{ __html: sanitizeNotificationHtml(body) }}
    />
  );
}
