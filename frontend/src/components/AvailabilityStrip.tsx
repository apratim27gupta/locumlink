import type { CSSProperties } from 'react';
import {
  applicationCoveredDays,
  applicationCoveredShiftIds,
  applicationSlotCoverageCounts,
  formatSpecificDate,
  getDaySlotSegments,
  getJobScheduleModel,
  getPostingDays,
  isPartialAvailability,
  type ApplicationAvailability,
  type JobScheduleLike,
} from '@/lib/jobSchedule';

const TEAL = '#309BB7';
const TEAL_DARK = '#1B6F86';
const AMBER = '#B45309';
const AMBER_BG = '#FFFBEB';
const AMBER_BORDER = '#FDE68A';

/**
 * Compact one-line view of which of the posting's days/slots a locum covers,
 * plus a Full/Partial badge. SLOTS jobs use split cells for two halves.
 */
export function AvailabilityStrip({
  postingDays,
  app,
  job,
  showBadge = true,
  cell = 14,
  style,
}: {
  postingDays: string[];
  app: ApplicationAvailability;
  /** When provided and SLOTS, renders slotwise cells. */
  job?: JobScheduleLike | null;
  showBadge?: boolean;
  cell?: number;
  style?: CSSProperties;
}) {
  const days = postingDays.length > 0 ? postingDays : getPostingDays(job);
  if (days.length === 0) return null;

  const isSlots = job != null && getJobScheduleModel(job) === 'SLOTS';
  const slotCounts = isSlots ? applicationSlotCoverageCounts(app, job) : null;
  const useSlots = Boolean(slotCounts && slotCounts.total > 0);

  if (useSlots && job) {
    const coveredIds = new Set(applicationCoveredShiftIds(app, job));
    const segmentsByDay = getDaySlotSegments(job, coveredIds);
    const { covered, total } = slotCounts!;
    const fullCoverage = covered === total && total > 0;
    const partial = isPartialAvailability(app) || covered < total;
    const badge = partial
      ? {
          label: fullCoverage ? `Selected ${covered}/${total} slots` : `Partial ${covered}/${total} slots`,
          color: AMBER,
          bg: AMBER_BG,
          border: AMBER_BORDER,
        }
      : {
          label: `Full ${total}/${total} slots`,
          color: TEAL_DARK,
          bg: 'rgba(48,155,183,0.14)',
          border: 'rgba(48,155,183,0.28)',
        };

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
          {segmentsByDay.map((day) => {
            const segs = day.segments;
            const title = `${formatSpecificDate(day.date)} - ${segs
              .map((s) => `${s.label}${s.covered ? ' (claimed)' : ' (open)'}`)
              .join('; ')}`;
            if (segs.length === 1) {
              const s = segs[0];
              const halfOnly = s.slotKind === 'HALF';
              return (
                <span
                  key={day.date}
                  title={title}
                  style={{
                    width: cell,
                    height: cell,
                    borderRadius: 3,
                    border: `1px solid ${s.covered ? TEAL : '#D1D5DB'}`,
                    background: s.covered
                      ? halfOnly
                        ? `linear-gradient(to bottom, ${TEAL} 50%, transparent 50%)`
                        : TEAL
                      : 'transparent',
                    flexShrink: 0,
                    boxSizing: 'border-box',
                  }}
                />
              );
            }
            return (
              <span
                key={day.date}
                title={title}
                style={{
                  width: cell,
                  height: cell,
                  borderRadius: 3,
                  border: '1px solid #D1D5DB',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  flexShrink: 0,
                  boxSizing: 'border-box',
                }}
              >
                {segs.slice(0, 2).map((s) => (
                  <span
                    key={s.shiftId}
                    style={{
                      flex: 1,
                      background: s.covered ? TEAL : 'transparent',
                      borderBottom: segs.indexOf(s) === 0 ? '1px solid #D1D5DB' : undefined,
                    }}
                  />
                ))}
              </span>
            );
          })}
        </div>
      </div>
    );
  }

  const covered = new Set(applicationCoveredDays(app, days));
  const partial = isPartialAvailability(app);
  const fullCoverage = covered.size === days.length && days.length > 0;
  const badge = partial
    ? {
        label: fullCoverage
          ? `Selected ${covered.size}/${days.length}`
          : `Partial ${covered.size}/${days.length}`,
        color: AMBER,
        bg: AMBER_BG,
        border: AMBER_BORDER,
      }
    : {
        label: `Full ${days.length}/${days.length}`,
        color: TEAL_DARK,
        bg: 'rgba(48,155,183,0.14)',
        border: 'rgba(48,155,183,0.28)',
      };

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
        {days.map((d) => {
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
