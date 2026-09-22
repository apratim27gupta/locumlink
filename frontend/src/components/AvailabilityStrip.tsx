import type { CSSProperties } from 'react';
import {
  applicationCoveredDays,
  isPartialAvailability,
  formatSpecificDate,
  type ApplicationAvailability,
} from '@/lib/jobSchedule';

const TEAL = '#309BB7';
const TEAL_DARK = '#1B6F86';
const AMBER = '#B45309';
const AMBER_BG = '#FFFBEB';
const AMBER_BORDER = '#FDE68A';

/**
 * Compact one-line view of which of the posting's days a locum is available for,
 * plus a Full N/N (teal) or Partial k/N (amber) badge. Read-only.
 */
export function AvailabilityStrip({
  postingDays,
  app,
  showBadge = true,
  cell = 14,
  style,
}: {
  postingDays: string[];
  app: ApplicationAvailability;
  showBadge?: boolean;
  cell?: number;
  style?: CSSProperties;
}) {
  if (postingDays.length === 0) return null;
  const covered = new Set(applicationCoveredDays(app, postingDays));
  const partial = isPartialAvailability(app);
  const fullCoverage = covered.size === postingDays.length && postingDays.length > 0;
  const badge = partial
    ? {
        label: fullCoverage
          ? `Selected ${covered.size}/${postingDays.length}`
          : `Partial ${covered.size}/${postingDays.length}`,
        color: AMBER,
        bg: AMBER_BG,
        border: AMBER_BORDER,
      }
    : { label: `Full ${postingDays.length}/${postingDays.length}`, color: TEAL_DARK, bg: 'rgba(48,155,183,0.14)', border: 'rgba(48,155,183,0.28)' };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', ...style }}>
      {showBadge && (
        <span
          style={{
            background: badge.bg,
            border: `1px solid ${badge.border}`,
            color: badge.color,
            borderRadius: 999,
            padding: '3px 10px',
            fontSize: 12,
            fontWeight: 700,
            whiteSpace: 'nowrap',
            lineHeight: 1.3,
          }}
        >
          {badge.label}
        </span>
      )}
      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
        {postingDays.map((d) => {
          const on = covered.has(d);
          return (
            <span
              key={d}
              title={`${formatSpecificDate(d)} - ${on ? 'available' : 'not available'}`}
              style={{
                width: cell,
                height: cell,
                borderRadius: 3,
                background: on ? TEAL : 'transparent',
                border: `1px solid ${on ? TEAL : '#D1D5DB'}`,
                flexShrink: 0,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
