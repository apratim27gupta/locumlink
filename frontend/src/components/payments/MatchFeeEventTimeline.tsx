'use client';

export type MatchFeeInvoiceEventItem = {
  id: string;
  eventType: string;
  label: string;
  detail: string | null;
  actor: string;
  occurredAt: string;
};

export function MatchFeeEventTimeline({
  events,
  compact,
}: {
  events: MatchFeeInvoiceEventItem[];
  compact?: boolean;
}) {
  if (!events.length) return null;

  return (
    <div
      style={{
        marginTop: compact ? 8 : 10,
        padding: compact ? '8px 10px' : '10px 12px',
        background: '#F9FAFB',
        borderRadius: 8,
        border: '1px solid #E5E7EB',
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: '#374151',
          marginBottom: 8,
        }}
      >
        Timeline
      </div>
      <ol
        style={{
          margin: 0,
          paddingLeft: 18,
          display: 'grid',
          gap: 8,
        }}
      >
        {events.map((ev) => (
          <li key={ev.id} style={{ fontSize: 12, color: '#111827' }}>
            <div style={{ fontWeight: 600 }}>{ev.label}</div>
            <div style={{ color: '#6B7280', marginTop: 2 }}>
              {new Date(ev.occurredAt).toLocaleString('en-CA')}
              {ev.detail ? ` · ${ev.detail}` : ''}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
