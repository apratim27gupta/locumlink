'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import DashLayout, { NavIcon } from '@/components/DashLayout';
import { hostApi } from '@/lib/api';
import { useHostProfile } from '@/hooks/useHostProfile';
import { useNextPageClientProps } from '@/lib/use-next-page-client-props';
import { isCpsnsVerificationApproved } from '@/lib/cpsnsVerify';
import { beforeClientNavigation } from '@/lib/topLoader';
const NAV = [
    {
        label: 'My Postings',
        href: '/host/dashboard',
        icon: <NavIcon name="postings"/>,
    },
    { label: 'Profile', href: '/host/profile', icon: <NavIcon name="profile"/> },
    {
        label: 'Messages',
        href: '/host/messages',
        icon: <NavIcon name="messages"/>,
    },
    {
        label: 'Resources',
        href: '/host/resources',
        icon: <NavIcon name="resources"/>,
    },
    {
        label: 'Settings',
        href: '/host/settings',
        icon: <NavIcon name="settings"/>,
    },
];
const inp: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #d0d4e4',
    borderRadius: 8,
    fontSize: 14,
    color: '#0f1523',
    background: '#fff',
    outline: 'none',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
};
const lbl: React.CSSProperties = {
    display: 'block',
    fontSize: 12,
    fontWeight: 500,
    color: '#374151',
    marginBottom: 6,
};
export default function HostPostJobPage(props: {
    params?: Promise<Record<string, string | string[] | undefined>>;
    searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
    useNextPageClientProps(props);
    const router = useRouter();
    const { profile, loading: profileLoading } = useHostProfile();
    const verified = isCpsnsVerificationApproved(profile?.cpsnsVerificationStatus);
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [location, setLocation] = useState('');
    const [expiresAt, setExpiresAt] = useState('');
    const [servicesRaw, setServicesRaw] = useState('');
    const [isRural, setIsRural] = useState(false);
    const [accommodationProvided, setAccommodationProvided] = useState(false);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState('');
    const [savedAsDraft, setSavedAsDraft] = useState(false);
    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setErr('');
        setSavedAsDraft(false);
        const t = title.trim();
        if (!t) {
            setErr('Please enter a job title.');
            return;
        }
        const servicesRequired = servicesRaw
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
        setBusy(true);
        try {
            await hostApi.createJob({
                title: t,
                description: description.trim() || undefined,
                location: location.trim() || undefined,
                expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
                servicesRequired: servicesRequired.length
                    ? servicesRequired
                    : undefined,
                isRural: isRural || undefined,
                accommodationProvided: accommodationProvided || undefined,
                status: verified ? 'ACTIVE' : 'DRAFT',
            });
            if (verified) {
                beforeClientNavigation('/host/dashboard');
                router.push('/host/dashboard');
            }
            else {
                setSavedAsDraft(true);
                setBusy(false);
            }
        }
        catch (e: unknown) {
            const msg = e && typeof e === 'object' && 'message' in e
                ? String((e as {
                    message: string;
                }).message)
                : 'Could not create the job. Please try again.';
            setErr(msg);
            setBusy(false);
        }
    }
    return (<DashLayout navItems={NAV} activeHref="/host/dashboard" topbarFirstName={profile?.contactFirstName} topbarLastName={profile?.contactLastName}>
      <div style={{ maxWidth: 560 }}>
        <h1 style={{
            fontSize: 22,
            fontWeight: 700,
            color: '#0f1523',
            marginBottom: 8,
        }}>
          Post a new job
        </h1>

        
        {!profileLoading && !verified && (<div style={{
                background: '#fff7ed',
                border: '1px solid #fdba74',
                color: '#9a3412',
                padding: '10px 14px',
                borderRadius: 8,
                fontSize: 13,
                marginBottom: 16,
                lineHeight: 1.6,
            }}>
            <strong>Your CPSNS number is pending verification.</strong> You can
            still fill in and save this job, but it will be stored as a{' '}
            <strong>Draft</strong> and won&apos;t be visible to locums until an
            admin verifies your account.
          </div>)}

        
        {savedAsDraft && (<div style={{
                background: '#f0fdf4',
                border: '1px solid #86efac',
                color: '#166534',
                padding: '10px 14px',
                borderRadius: 8,
                fontSize: 13,
                marginBottom: 16,
            }}>
            Shift is saved under &quot;Draft Locum Shifts&quot;. Please post again after profile is verified. Thanks.{' '}
            <button type="button" onClick={() => {
                beforeClientNavigation('/host/dashboard');
                router.push('/host/dashboard');
            }} style={{
                background: 'none',
                border: 'none',
                color: '#166534',
                cursor: 'pointer',
                textDecoration: 'underline',
                fontSize: 13,
                fontFamily: 'inherit',
                padding: 0,
            }}>
              View in Dashboard →
            </button>
          </div>)}

        <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 24 }}>
          {verified
            ? 'Locums will see this listing immediately once published.'
            : 'Fill in the details below and save. Your listing will be activated once verified.'}
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={lbl}>Job title *</label>
            <input style={inp} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Family physician locum — 2 weeks" maxLength={200}/>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={lbl}>Description</label>
            <textarea style={{ ...inp, minHeight: 120, resize: 'vertical' }} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Shift expectations, clinic context, etc."/>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={lbl}>Location</label>
            <input style={inp} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="City, province"/>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={lbl}>Listing expiry</label>
            <input type="datetime-local" style={inp} value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)}/>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={lbl}>Services required</label>
            <input style={inp} value={servicesRaw} onChange={(e) => setServicesRaw(e.target.value)} placeholder="Comma-separated, e.g. ER, Family practice"/>
          </div>

          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            marginBottom: 20,
        }}>
            <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            cursor: 'pointer',
            fontSize: 14,
        }}>
              <input type="checkbox" checked={isRural} onChange={(e) => setIsRural(e.target.checked)}/>
              Rural placement
            </label>
            <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            cursor: 'pointer',
            fontSize: 14,
        }}>
              <input type="checkbox" checked={accommodationProvided} onChange={(e) => setAccommodationProvided(e.target.checked)}/>
              Accommodation provided
            </label>
          </div>

          {err && (<p style={{ fontSize: 13, color: '#dc2626', marginBottom: 12 }}>
              {err}
            </p>)}

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button type="submit" disabled={busy} style={{
            padding: '12px 20px',
            borderRadius: 8,
            border: 'none',
            background: busy
                ? '#9ca3af'
                : verified
                    ? 'linear-gradient(270deg,#3A65DB 0%,#0F2A7A 100%)'
                    : '#6B7280',
            color: '#fff',
            fontWeight: 600,
            fontSize: 15,
            cursor: busy ? 'default' : 'pointer',
            fontFamily: 'inherit',
        }}>
              {busy
            ? verified
                ? 'Publishing…'
                : 'Saving draft…'
            : verified
                ? 'Publish job'
                : 'Save as Draft'}
            </button>
            <button type="button" onClick={() => {
            beforeClientNavigation('/host/dashboard');
            router.push('/host/dashboard');
        }} style={{
            padding: '12px 20px',
            borderRadius: 8,
            border: '1px solid #d0d4e4',
            background: '#fff',
            color: '#374151',
            fontWeight: 500,
            fontSize: 15,
            cursor: 'pointer',
            fontFamily: 'inherit',
        }}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </DashLayout>);
}
