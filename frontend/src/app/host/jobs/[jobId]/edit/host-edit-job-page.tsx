'use client';
import { useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useRouter } from 'next/navigation';
import HostDashboard from '@/app/host/dashboard/host-dashboard-page';
import { hostApi } from '@/lib/api';
import { useHostProfile } from '@/hooks/useHostProfile';
import { isCpsnsVerified } from '@/lib/cpsnsVerify';
import { beforeClientNavigation } from '@/lib/topLoader';
import { sortStringsLocale } from '@/lib/sortLocale';
import { useNextPageClientProps } from '@/lib/use-next-page-client-props';
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
const sectionCard: React.CSSProperties = {
    border: '1px solid #E5E7EB',
    borderRadius: 10,
    padding: '16px 18px 18px',
    marginBottom: 0,
};
const sectionStack: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    marginTop: 14,
};
const CREDENTIAL_OPTIONS = sortStringsLocale([
    'CPSNS Full License',
    'CFPC Eligible',
    'CMPA coverage',
    'BLS (ACLS preferred)',
    'DEA License',
    'PALS Certified',
]);
function fmtIsoToMmDdYyyy(iso: string | null | undefined): string {
    if (!iso)
        return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime()))
        return '';
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const yyyy = String(d.getFullYear());
    return `${mm}-${dd}-${yyyy}`;
}
function parseMmDdYyyyToIso(input: string): string {
    const t = input.trim();
    if (!t)
        return '';
    const m = t.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (!m)
        return '';
    const mm = Number(m[1]);
    const dd = Number(m[2]);
    const yyyy = Number(m[3]);
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31 || yyyy < 1900 || yyyy > 2100)
        return '';
    const iso = `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
    const d = new Date(`${iso}T12:00:00`);
    return d.getFullYear() === yyyy && d.getMonth() + 1 === mm && d.getDate() === dd
        ? iso
        : '';
}
function toDatetimeLocalValue(iso: string | null | undefined): string {
    if (!iso)
        return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime()))
        return '';
    const z = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`;
}
export default function HostEditJobPage(props: {
    params?: Promise<Record<string, string | string[] | undefined>>;
    searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
    useNextPageClientProps(props);
    const params = useParams();
    const jobId = typeof params?.jobId === 'string' ? params.jobId : '';
    const router = useRouter();
    const { profile, loading: profileLoading } = useHostProfile();
    const verified = isCpsnsVerified(profile?.cpsnsNumber);
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [keyResponsibilities, setKeyResponsibilities] = useState('');
    const [location, setLocation] = useState('');
    const [startDateInput, setStartDateInput] = useState('');
    const [endDateInput, setEndDateInput] = useState('');
    const [startTime, setStartTime] = useState('05:00');
    const [endTime, setEndTime] = useState('14:00');
    const [flexible, setFlexible] = useState(false);
    const [ratePerDay, setRatePerDay] = useState('');
    const [expiresAt, setExpiresAt] = useState('');
    const [servicesRaw, setServicesRaw] = useState('');
    const [isRural, setIsRural] = useState(false);
    const [accommodationProvided, setAccommodationProvided] = useState(false);
    const [yearsExp, setYearsExp] = useState('');
    const [credentials, setCredentials] = useState<string[]>([
        'CPSNS Full License',
    ]);
    const [customCredential, setCustomCredential] = useState('');
    const [travelReq, setTravelReq] = useState(false);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState('');
    const [loadBusy, setLoadBusy] = useState(true);
    const [jobLoaded, setJobLoaded] = useState(false);
    const [overlayMounted, setOverlayMounted] = useState(false);
    useLayoutEffect(() => {
        setOverlayMounted(true);
    }, []);
    function toggleCredential(c: string) {
        setCredentials((p) => p.includes(c) ? p.filter((x) => x !== c) : [...p, c]);
    }
    function addCustomCredential(raw: string) {
        const v = raw.trim();
        if (!v)
            return;
        setCredentials((prev) => (prev.includes(v) ? prev : [...prev, v]));
        setCustomCredential('');
    }
    useEffect(() => {
        if (!jobId) {
            setErr('Invalid job link.');
            setLoadBusy(false);
            setJobLoaded(false);
            return;
        }
        let cancelled = false;
        setLoadBusy(true);
        setJobLoaded(false);
        setErr('');
        hostApi
            .getJob(jobId)
            .then(({ job }) => {
            if (cancelled)
                return;
            setTitle(job.title ?? '');
            setDescription(typeof job.description === 'string' ? job.description : '');
            const kr = (job as {
                keyResponsibilities?: unknown;
            }).keyResponsibilities;
            setKeyResponsibilities(Array.isArray(kr) ? kr.join('\n') : typeof kr === 'string' ? kr : '');
            setLocation(typeof job.location === 'string' ? job.location : '');
            setStartDateInput(fmtIsoToMmDdYyyy(job.startDate));
            setEndDateInput(fmtIsoToMmDdYyyy(job.endDate));
            setStartTime(typeof job.startTime === 'string' ? job.startTime : '05:00');
            setEndTime(typeof job.endTime === 'string' ? job.endTime : '14:00');
            setFlexible(Boolean((job as {
                scheduleFlexible?: unknown;
            }).scheduleFlexible));
            const ppd = (job as {
                payPerDay?: unknown;
            }).payPerDay ??
                (job as {
                    ratePerDay?: unknown;
                }).ratePerDay;
            setRatePerDay(ppd === null || ppd === undefined || ppd === '' ? '' : String(ppd));
            setExpiresAt(toDatetimeLocalValue(job.expiresAt as string | undefined));
            const sr = (job as {
                servicesRequired?: unknown;
            }).servicesRequired;
            setServicesRaw(Array.isArray(sr) ? sr.join(', ') : typeof sr === 'string' ? sr : '');
            setIsRural(Boolean(job.isRural));
            setAccommodationProvided(Boolean(job.accommodationProvided));
            const ye = (job as {
                minYearsExperience?: unknown;
            }).minYearsExperience;
            setYearsExp(ye === null || ye === undefined || ye === '' ? '' : String(ye));
            const rc = (job as {
                requiredCredentials?: unknown;
            }).requiredCredentials;
            setCredentials(Array.isArray(rc) && rc.length ? rc.filter((x) => typeof x === 'string') : ['CPSNS Full License']);
            setTravelReq(Boolean((job as {
                travelRequired?: unknown;
            }).travelRequired));
            setJobLoaded(true);
            setLoadBusy(false);
        })
            .catch((e: unknown) => {
            if (cancelled)
                return;
            const msg = e && typeof e === 'object' && 'message' in e
                ? String((e as {
                    message: string;
                }).message)
                : 'Could not load this job.';
            setErr(msg);
            setJobLoaded(false);
            setLoadBusy(false);
        });
        return () => {
            cancelled = true;
        };
    }, [jobId]);
    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setErr('');
        const t = title.trim();
        if (!t) {
            setErr('Please enter a job title.');
            return;
        }
        const startIso = parseMmDdYyyyToIso(startDateInput);
        const endIso = parseMmDdYyyyToIso(endDateInput);
        if (startDateInput.trim() && !startIso) {
            setErr('Start date must be a valid date in MM-DD-YYYY format.');
            return;
        }
        if (endDateInput.trim() && !endIso) {
            setErr('End date must be a valid date in MM-DD-YYYY format.');
            return;
        }
        const rateNum = ratePerDay.trim() ? Number(ratePerDay) : NaN;
        if (!Number.isFinite(rateNum) || rateNum <= 0) {
            setErr('Enter a valid rate per day (CAD).');
            return;
        }
        const yearsNum = yearsExp.trim() ? Number(yearsExp) : NaN;
        if (yearsExp.trim() && !Number.isFinite(yearsNum)) {
            setErr('Years of experience must be a number.');
            return;
        }
        const servicesRequired = servicesRaw
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
        setBusy(true);
        try {
            await hostApi.updateJob(jobId, {
                title: t,
                description: description.trim() || undefined,
                keyResponsibilities: keyResponsibilities
                    .split('\n')
                    .map((s) => s.trim())
                    .filter(Boolean),
                location: location.trim() || undefined,
                startDate: startIso || undefined,
                endDate: endIso || undefined,
                startTime: startTime || undefined,
                endTime: endTime || undefined,
                payPerDay: rateNum,
                minYearsExperience: yearsExp.trim() && Number.isFinite(yearsNum) ? yearsNum : undefined,
                requiredCredentials: credentials,
                travelRequired: travelReq,
                scheduleFlexible: flexible,
                expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
                servicesRequired: servicesRequired.length ? servicesRequired : [],
                isRural,
                accommodationProvided,
            });
            beforeClientNavigation('/host/dashboard');
            router.push('/host/dashboard');
        }
        catch (e: unknown) {
            const msg = e && typeof e === 'object' && 'message' in e
                ? String((e as {
                    message: string;
                }).message)
                : 'Could not save changes. Please try again.';
            setErr(msg);
            setBusy(false);
        }
    }
    if (!jobId) {
        return (<>
      <HostDashboard />
      <div style={{
                position: 'fixed',
                inset: 0,
                zIndex: 250,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'none',
            }}>
        <div style={{
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: '1px solid #FECACA',
                    background: '#FEF2F2',
                    color: '#991B1B',
                    fontSize: 13,
                    fontFamily: 'Inter, sans-serif',
                }}>
          Invalid job link.
        </div>
      </div>
    </>);
    }
    const editOverlay = (<>
      
      <div onClick={() => {
            beforeClientNavigation('/host/dashboard');
            router.push('/host/dashboard');
        }} style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(28, 50, 130, 0.45)',
            zIndex: 200,
        }}/>
      <div style={{
            position: 'fixed',
            top: 0,
            right: 0,
            width: 480,
            height: '100vh',
            background: '#fff',
            zIndex: 201,
            display: 'flex',
            flexDirection: 'column',
            fontFamily: 'Inter, sans-serif',
            boxShadow: '-4px 0 24px rgba(0,0,0,0.12)',
        }}>
        
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '22px 24px 18px',
            borderBottom: '1px solid #F3F4F6',
            flexShrink: 0,
        }}>
          <span style={{ fontSize: 20, fontWeight: 700, color: '#0B0F1F' }}>
            Edit job
          </span>
          <button type="button" onClick={() => {
            beforeClientNavigation('/host/dashboard');
            router.push('/host/dashboard');
        }} aria-label="Close" style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 22,
            color: '#6B7280',
            lineHeight: 1,
            padding: 0,
        }}>
            ×
          </button>
        </div>

        
        <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '20px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
        }}>
          {!profileLoading && !verified && (<div style={{
                background: '#fff7ed',
                border: '1px solid #fdba74',
                color: '#9a3412',
                padding: '10px 14px',
                borderRadius: 8,
                fontSize: 13,
                lineHeight: 1.6,
            }}>
              <strong>Your CPSNS number is pending verification.</strong> Edits
              are saved; listings stay as drafts until verified.
            </div>)}

          {loadBusy && (<p style={{ fontSize: 14, color: '#6b7280' }}>Loading job…</p>)}

          {!loadBusy && !jobLoaded && err && (<p style={{ fontSize: 14, color: '#dc2626' }}>{err}</p>)}

          {!loadBusy && jobLoaded && (<form onSubmit={handleSubmit} style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
                minHeight: 0,
            }}>
              
              <div style={sectionCard}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#0B0F1F' }}>
                  Details
                </div>

                <div style={sectionStack}>
                  <div>
                    <label style={lbl}>Job title *</label>
                    <input style={inp} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Family physician locum — 2 weeks" maxLength={200}/>
                  </div>

                  <div>
                    <label style={lbl}>Job Description</label>
                    <textarea style={{ ...inp, minHeight: 110, resize: 'vertical' }} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Shift expectations, clinic context, etc."/>
                  </div>

                  <div>
                    <label style={lbl}>Key Responsibilities (one per line)</label>
                    <textarea style={{ ...inp, minHeight: 90, resize: 'vertical' }} value={keyResponsibilities} onChange={(e) => setKeyResponsibilities(e.target.value)} placeholder="List key responsibilities…"/>
                  </div>
                </div>
              </div>

              
              <div style={sectionCard}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#0B0F1F' }}>
                  Schedule
                </div>
                <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>
                  Set dates, times, and pay
                </div>

                <div style={sectionStack}>
                  <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 12,
                alignItems: 'start',
            }}>
                    <div style={{ minWidth: 0 }}>
                      <label style={lbl}>Start Date *</label>
                      <input type="text" inputMode="numeric" autoComplete="off" placeholder="MM-DD-YYYY" pattern="[0-9]{1,2}-[0-9]{1,2}-[0-9]{4}" title="MM-DD-YYYY" style={inp} value={startDateInput} onChange={(e) => setStartDateInput(e.target.value)}/>
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <label style={lbl}>End Date *</label>
                      <input type="text" inputMode="numeric" autoComplete="off" placeholder="MM-DD-YYYY" pattern="[0-9]{1,2}-[0-9]{1,2}-[0-9]{4}" title="MM-DD-YYYY" style={inp} value={endDateInput} onChange={(e) => setEndDateInput(e.target.value)}/>
                    </div>
                  </div>

                  <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 12,
                alignItems: 'start',
            }}>
                    <div style={{ minWidth: 0 }}>
                      <label style={lbl}>Start Time *</label>
                      <input type="time" style={inp} value={startTime} onChange={(e) => setStartTime(e.target.value)}/>
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <label style={lbl}>End Time *</label>
                      <input type="time" style={inp} value={endTime} onChange={(e) => setEndTime(e.target.value)}/>
                    </div>
                  </div>

                  <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                fontSize: 14,
                color: '#374151',
                cursor: 'pointer',
            }}>
                    <input type="checkbox" checked={flexible} onChange={(e) => setFlexible(e.target.checked)} style={{
                width: 16,
                height: 16,
                flexShrink: 0,
                accentColor: '#1C32D2',
            }}/>
                    Schedule is flexible
                  </label>

                  <div>
                    <label style={lbl}>Rate per Day (CAD) *</label>
                    <input style={inp} type="number" value={ratePerDay} onChange={(e) => setRatePerDay(e.target.value)} placeholder="e.g. 2000"/>
                  </div>
                </div>
              </div>

              
              <div style={sectionCard}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#0B0F1F' }}>
                  Requirements
                </div>
                <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>
                  List mandatory licenses and experience
                </div>

                <div style={sectionStack}>
                  <div>
                    <label style={lbl}>Years of Experience</label>
                    <input style={{ ...inp, maxWidth: '100%' }} type="number" value={yearsExp} onChange={(e) => setYearsExp(e.target.value)} placeholder="e.g. 3"/>
                  </div>

                  <div>
                    <label style={{ ...lbl, marginBottom: 10 }}>
                      Required Credentials
                    </label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {(() => {
                const all = [
                    ...CREDENTIAL_OPTIONS,
                    ...credentials.filter((c) => !CREDENTIAL_OPTIONS.includes(c)),
                ];
                const seen = new Set<string>();
                const unique = all.filter((c) => {
                    const k = c.trim();
                    if (!k)
                        return false;
                    if (seen.has(k))
                        return false;
                    seen.add(k);
                    return true;
                });
                const selected = unique.filter((c) => credentials.includes(c));
                const rest = unique.filter((c) => !credentials.includes(c));
                return [...selected, ...rest];
            })().map((c) => {
                const on = credentials.includes(c);
                return (<span key={c} onClick={() => toggleCredential(c)} style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '5px 12px',
                        borderRadius: 20,
                        cursor: 'pointer',
                        fontSize: 13,
                        userSelect: 'none',
                        background: on ? '#EEF0FB' : '#fff',
                        border: `1px solid ${on ? '#3B4FD8' : '#D0D5DD'}`,
                        color: on ? '#1C32D2' : '#374151',
                    }}>
                          {c}
                          {on && (<span onClick={(e) => {
                            e.stopPropagation();
                            toggleCredential(c);
                        }} style={{
                            fontSize: 14,
                            color: '#1C32D2',
                            lineHeight: 1,
                            marginLeft: 2,
                        }}>
                              ×
                            </span>)}
                        </span>);
            })}
                  </div>
                  <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                    <input type="text" value={customCredential} onChange={(e) => setCustomCredential(e.target.value)} onKeyDown={(e) => {
                if (e.key !== 'Enter')
                    return;
                e.preventDefault();
                addCustomCredential(customCredential);
            }} placeholder="Add custom credential and press Enter" style={{ ...inp, flex: 1 }}/>
                    <button type="button" onClick={() => addCustomCredential(customCredential)} disabled={!customCredential.trim()} style={{
                padding: '0 14px',
                borderRadius: 8,
                border: '1px solid #D0D5DD',
                background: customCredential.trim() ? '#fff' : '#F3F4F6',
                color: customCredential.trim() ? '#111827' : '#9CA3AF',
                fontSize: 13,
                fontWeight: 600,
                cursor: customCredential.trim() ? 'pointer' : 'default',
                fontFamily: 'inherit',
            }}>
                      Add
                    </button>
                  </div>
                </div>

                  <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                fontSize: 14,
                color: '#374151',
                cursor: 'pointer',
            }}>
                    <input type="checkbox" checked={travelReq} onChange={(e) => setTravelReq(e.target.checked)} style={{
                width: 16,
                height: 16,
                flexShrink: 0,
                accentColor: '#1C32D2',
            }}/>
                    Locum is required to travel to Clinic
                  </label>
                </div>
              </div>

              {err && (<p style={{ fontSize: 13, color: '#dc2626', margin: 0 }}>
                  {err}
                </p>)}

              <div style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 12,
                flexWrap: 'wrap',
                paddingTop: 4,
            }}>
                <button type="submit" disabled={busy} style={{
                padding: '12px 20px',
                borderRadius: 8,
                border: 'none',
                background: busy
                    ? '#9ca3af'
                    : 'linear-gradient(270deg,#3A65DB 0%,#1B31D2 100%)',
                color: '#fff',
                fontWeight: 600,
                fontSize: 15,
                cursor: busy ? 'default' : 'pointer',
                fontFamily: 'inherit',
            }}>
                  {busy ? 'Saving…' : 'Save changes'}
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
            </form>)}
        </div>
      </div>
    </>);
    return (<>
      <HostDashboard />
      {overlayMounted ? createPortal(editOverlay, document.body) : null}
    </>);
}
