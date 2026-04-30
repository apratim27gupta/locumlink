'use client';
import { useMemo } from 'react';
import AdminLayout from '@/components/AdminLayout';
function StatCard({ label, value, hint, tone }: {
    label: string;
    value: string;
    hint: string;
    tone: 'blue' | 'green' | 'gray';
}) {
    const tones: Record<typeof tone, { bg: string; border: string; value: string }> = {
        blue: { bg: 'rgba(59,79,216,0.08)', border: 'rgba(59,79,216,0.18)', value: '#1B31D2' },
        green: { bg: 'rgba(34,197,94,0.10)', border: 'rgba(34,197,94,0.22)', value: '#166534' },
        gray: { bg: '#F9FAFB', border: '#E5E7EB', value: '#0f1523' },
    };
    const t = tones[tone];
    return (<div style={{
            background: '#fff',
            border: '1px solid #E5E7EB',
            borderRadius: 12,
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            minWidth: 0,
        }}>
      <div style={{ fontSize: 12, color: '#6B7280', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: 12,
        }}>
        <div style={{
            fontSize: 28,
            fontWeight: 800,
            color: '#0f1523',
            lineHeight: 1,
        }}>
          {value}
        </div>
        <div style={{
            padding: '4px 10px',
            borderRadius: 999,
            background: t.bg,
            border: `1px solid ${t.border}`,
            color: t.value,
            fontSize: 12,
            fontWeight: 700,
            whiteSpace: 'nowrap',
        }}>
          Live
        </div>
      </div>
      <div style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.4 }}>
        {hint}
      </div>
    </div>);
}
function Panel({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
    return (<div style={{
            background: '#fff',
            border: '1px solid #E5E7EB',
            borderRadius: 12,
            overflow: 'hidden',
        }}>
      <div style={{
            padding: '14px 16px',
            borderBottom: '1px solid #F3F4F6',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
        }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: '#0f1523' }}>{title}</div>
        {right ? <div>{right}</div> : null}
      </div>
      <div style={{ padding: 16 }}>{children}</div>
    </div>);
}
export default function AdminOverviewPage() {
    const stats = useMemo(() => ([
        { label: 'Pending verifications', value: '12', hint: 'Locum profiles awaiting CPSNS review.', tone: 'blue' as const },
        { label: 'Active users', value: '1,284', hint: 'Total users with ACTIVE status.', tone: 'gray' as const },
        { label: 'Active job postings', value: '84', hint: 'Jobs currently visible to locums.', tone: 'green' as const },
    ]), []);
    return (<AdminLayout title="Overview" subtitle="Quick operational snapshot. (UI-only for now; we’ll wire real data to admin APIs next.)" right={(<button type="button" style={{
            padding: '10px 12px',
            borderRadius: 10,
            border: '1px solid #E5E7EB',
            background: '#fff',
            fontSize: 13,
            fontWeight: 700,
            color: '#0f1523',
            cursor: 'pointer',
            fontFamily: 'inherit',
        }}>
          Refresh
        </button>)}>
      <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gap: 14,
            marginBottom: 14,
        }}>
        {stats.map((s) => (<StatCard key={s.label} label={s.label} value={s.value} hint={s.hint} tone={s.tone}/>))}
      </div>

      <div style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)',
            gap: 14,
        }}>
        <Panel title="Today’s activity">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
                { title: 'User role updated', meta: 'admin@locumlink • 2m ago', detail: 'Changed role: LOCUM → HOST' },
                { title: 'Verification approved', meta: 'admin@locumlink • 14m ago', detail: 'CPSNS verified for Dr A. S.' },
                { title: 'Job posting removed', meta: 'admin@locumlink • 42m ago', detail: 'Removed: “Urgent weekend coverage”' },
            ].map((e, i) => (<div key={i} style={{
                    padding: '12px 12px',
                    border: '1px solid #F3F4F6',
                    borderRadius: 10,
                    background: '#fff',
                }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 4 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#0f1523' }}>{e.title}</div>
                <div style={{ fontSize: 12, color: '#9CA3AF', whiteSpace: 'nowrap' }}>{e.meta}</div>
              </div>
              <div style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.4 }}>{e.detail}</div>
            </div>))}
          </div>
        </Panel>

        <Panel title="Admin checklist" right={<span style={{ fontSize: 12, color: '#9CA3AF', fontWeight: 700 }}>This week</span>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
                { t: 'Review pending CPSNS verifications', d: 'Keep queue under 24h.' },
                { t: 'Check rejected verifications', d: 'Ensure reasons are actionable.' },
                { t: 'Spot-check job postings', d: 'Remove spam or unsafe content.' },
            ].map((x) => (<div key={x.t} style={{
                    padding: '12px 12px',
                    borderRadius: 10,
                    border: '1px solid #F3F4F6',
                }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#0f1523', marginBottom: 4 }}>{x.t}</div>
              <div style={{ fontSize: 13, color: '#6B7280' }}>{x.d}</div>
            </div>))}
          </div>
        </Panel>
      </div>
    </AdminLayout>);
}

