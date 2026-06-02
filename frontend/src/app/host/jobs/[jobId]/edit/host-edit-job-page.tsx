'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useRouter } from 'next/navigation';
import HostDashboard from '@/app/host/dashboard/host-dashboard-page';
import { hostApi } from '@/lib/api';
import { useHostProfile } from '@/hooks/useHostProfile';
import { isCpsnsVerificationApproved } from '@/lib/cpsnsVerify';
import { beforeClientNavigation } from '@/lib/topLoader';
import { useNextPageClientProps } from '@/lib/use-next-page-client-props';
import {
  HostJobDescriptionField,
  HostJobTitleField,
  HostKeyResponsibilitiesField,
  MmDdYyyyDateField,
} from '@/components/host/HostJobPostingFormFields';
import {
  HOST_JOB_CREDENTIAL_OPTIONS,
  autoResponsibilitiesForJobTitle,
  buildKeyResponsibilitiesPayload,
  emptyResponsibilitySelection,
  fmtIsoToMmDdYyyy,
  hostJobFieldInp,
  hostJobFieldLbl,
  parseKeyResponsibilitiesFromLines,
  parseMmDdYyyyToIso,
} from '@/lib/hostJobPostingForm';
const inp = hostJobFieldInp;
const lbl = hostJobFieldLbl;
const sectionCard: React.CSSProperties = {
  border: '1px solid #E5E7EB',
  borderRadius: 10,
  padding: '16px 18px 18px',
  marginBottom: 0,
};
const sectionStack: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
  marginTop: 14,
};
function toDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
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
  const verified = isCpsnsVerificationApproved(
    profile?.cpsnsVerificationStatus,
  );
  const [sidebarWidth, setSidebarWidth] = useState(480);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [respBySection, setRespBySection] = useState<
    Record<string, Set<string>>
  >(() => emptyResponsibilitySelection());
  const [respCustom, setRespCustom] = useState('');
  const lastAutoRespJobTitleRef = useRef<string | null>(null);
  const [location, setLocation] = useState('');
  const [startDateInput, setStartDateInput] = useState('');
  const [endDateInput, setEndDateInput] = useState('');
  const [startTime, setStartTime] = useState('05:00');
  const [endTime, setEndTime] = useState('14:00');
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
  const [jobStatus, setJobStatus] = useState<string>('');
  const [overlayMounted, setOverlayMounted] = useState(false);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [closeConfirmBusy, setCloseConfirmBusy] = useState(false);
  const initialSnapshotRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    setOverlayMounted(true);
  }, []);

  function snapshotState(): string {
    const servicesRequired = servicesRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const startIso = parseMmDdYyyyToIso(startDateInput);
    const endIso = parseMmDdYyyyToIso(endDateInput);
    return JSON.stringify({
      title: title.trim(),
      description: description.trim(),
      respBySection: Object.fromEntries(
        Object.entries(respBySection).map(([k, v]) => [
          k,
          Array.from(v ?? []).sort(),
        ]),
      ),
      respCustom: respCustom.trim(),
      location: location.trim(),
      startDate: startIso || '',
      endDate: endIso || '',
      startTime: startTime || '',
      endTime: endTime || '',
      ratePerDay: ratePerDay.trim(),
      expiresAt: expiresAt || '',
      servicesRequired,
      isRural: Boolean(isRural),
      accommodationProvided: Boolean(accommodationProvided),
      yearsExp: yearsExp.trim(),
      credentials: [...credentials]
        .map((s) => s.trim())
        .filter(Boolean)
        .sort(),
      travelReq: Boolean(travelReq),
    });
  }
  function snapshotFromJob(job: any): string {
    const rawTitle = typeof job?.title === 'string' ? job.title : '';
    const rawDesc = typeof job?.description === 'string' ? job.description : '';
    const kr = job?.keyResponsibilities;
    const krLines = Array.isArray(kr)
      ? kr.filter((x: unknown): x is string => typeof x === 'string')
      : typeof kr === 'string' && kr.trim()
        ? [kr]
        : [];
    const parsed = parseKeyResponsibilitiesFromLines(krLines);
    const sr = job?.servicesRequired;
    const servicesRequired = Array.isArray(sr)
      ? sr.map((s: unknown) => String(s).trim()).filter(Boolean)
      : typeof sr === 'string'
        ? sr
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : [];
    const startIso = typeof job?.startDate === 'string' ? job.startDate : null;
    const endIso = typeof job?.endDate === 'string' ? job.endDate : null;
    const startDate = startIso
      ? parseMmDdYyyyToIso(fmtIsoToMmDdYyyy(startIso))
      : '';
    const endDate = endIso ? parseMmDdYyyyToIso(fmtIsoToMmDdYyyy(endIso)) : '';
    const rc = job?.requiredCredentials;
    const credentials =
      Array.isArray(rc) && rc.length
        ? rc.map((s: unknown) => String(s).trim()).filter(Boolean)
        : ['CPSNS Full License'];
    const ppd = job?.payPerDay ?? job?.ratePerDay;
    const ye = job?.minYearsExperience;
    return JSON.stringify({
      title: rawTitle.trim(),
      description: rawDesc.trim(),
      respBySection: Object.fromEntries(
        Object.entries(parsed.respBySection).map(([k, v]) => [
          k,
          Array.from(v ?? []).sort(),
        ]),
      ),
      respCustom: parsed.respCustom.trim(),
      location: typeof job?.location === 'string' ? job.location.trim() : '',
      startDate: startDate || '',
      endDate: endDate || '',
      startTime: typeof job?.startTime === 'string' ? job.startTime : '',
      endTime: typeof job?.endTime === 'string' ? job.endTime : '',
      ratePerDay:
        ppd === null || ppd === undefined || ppd === ''
          ? ''
          : String(ppd).trim(),
      expiresAt:
        toDatetimeLocalValue(job?.expiresAt as string | null | undefined) || '',
      servicesRequired,
      isRural: Boolean(job?.isRural),
      accommodationProvided: Boolean(job?.accommodationProvided),
      yearsExp:
        ye === null || ye === undefined || ye === '' ? '' : String(ye).trim(),
      credentials: [...credentials].sort(),
      travelReq: Boolean(job?.travelRequired),
    });
  }
  function hasUnsavedChanges(): boolean {
    if (!jobLoaded) return false;
    if (!initialSnapshotRef.current) return false;
    return snapshotState() !== initialSnapshotRef.current;
  }
  function closeToDashboard(): void {
    beforeClientNavigation('/host/dashboard');
    router.push('/host/dashboard');
  }
  function attemptClose(): void {
    if (busy || closeConfirmBusy) return;
    if (hasUnsavedChanges()) {
      setCloseConfirmOpen(true);
      return;
    }
    closeToDashboard();
  }
  function toggleCredential(c: string) {
    setCredentials((p) =>
      p.includes(c) ? p.filter((x) => x !== c) : [...p, c],
    );
  }
  function addCustomCredential(raw: string) {
    const v = raw.trim();
    if (!v) return;
    setCredentials((prev) => (prev.includes(v) ? prev : [...prev, v]));
    setCustomCredential('');
  }
  function toggleResponsibility(sectionKey: string, optionId: string) {
    setRespBySection((prev) => {
      const cur = new Set(prev[sectionKey] ?? []);
      if (cur.has(optionId)) cur.delete(optionId);
      else cur.add(optionId);
      return { ...prev, [sectionKey]: cur };
    });
  }
  useEffect(() => {
    const trimmed = title.trim();
    const auto = autoResponsibilitiesForJobTitle(trimmed);
    if (!auto) {
      lastAutoRespJobTitleRef.current = null;
      return;
    }
    const key = trimmed.toLowerCase();
    if (lastAutoRespJobTitleRef.current === key) return;
    lastAutoRespJobTitleRef.current = key;
    setRespBySection(auto);
  }, [title]);
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
    setCloseConfirmOpen(false);
    initialSnapshotRef.current = null;
    hostApi
      .getJob(jobId)
      .then(({ job }) => {
        setJobStatus((job as { status?: string }).status ?? '');
        if (cancelled) return;
        // Capture initial state from server payload so the "dirty" check is stable.
        initialSnapshotRef.current = snapshotFromJob(job);
        setTitle(job.title ?? '');
        setDescription(
          typeof job.description === 'string' ? job.description : '',
        );
        const kr = (
          job as {
            keyResponsibilities?: unknown;
          }
        ).keyResponsibilities;
        const krLines = Array.isArray(kr)
          ? kr.filter((x): x is string => typeof x === 'string')
          : typeof kr === 'string' && kr.trim()
            ? [kr]
            : [];
        const parsed = parseKeyResponsibilitiesFromLines(krLines);
        setRespBySection(parsed.respBySection);
        setRespCustom(parsed.respCustom);
        lastAutoRespJobTitleRef.current =
          (job.title ?? '').trim().toLowerCase() || null;
        setLocation(typeof job.location === 'string' ? job.location : '');
        setStartDateInput(
          fmtIsoToMmDdYyyy(job.startDate as string | null | undefined),
        );
        setEndDateInput(
          fmtIsoToMmDdYyyy(job.endDate as string | null | undefined),
        );
        setStartTime(
          typeof job.startTime === 'string' ? job.startTime : '05:00',
        );
        setEndTime(typeof job.endTime === 'string' ? job.endTime : '14:00');
        const ppd =
          (
            job as {
              payPerDay?: unknown;
            }
          ).payPerDay ??
          (
            job as {
              ratePerDay?: unknown;
            }
          ).ratePerDay;
        setRatePerDay(
          ppd === null || ppd === undefined || ppd === '' ? '' : String(ppd),
        );
        setExpiresAt(toDatetimeLocalValue(job.expiresAt as string | undefined));
        const sr = (
          job as {
            servicesRequired?: unknown;
          }
        ).servicesRequired;
        setServicesRaw(
          Array.isArray(sr) ? sr.join(', ') : typeof sr === 'string' ? sr : '',
        );
        setIsRural(Boolean(job.isRural));
        setAccommodationProvided(Boolean(job.accommodationProvided));
        const ye = (
          job as {
            minYearsExperience?: unknown;
          }
        ).minYearsExperience;
        setYearsExp(
          ye === null || ye === undefined || ye === '' ? '' : String(ye),
        );
        const rc = (
          job as {
            requiredCredentials?: unknown;
          }
        ).requiredCredentials;
        setCredentials(
          Array.isArray(rc) && rc.length
            ? rc.filter((x) => typeof x === 'string')
            : ['CPSNS Full License'],
        );
        setTravelReq(
          Boolean(
            (
              job as {
                travelRequired?: unknown;
              }
            ).travelRequired,
          ),
        );
        setJobLoaded(true);
        setLoadBusy(false);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const msg =
          e && typeof e === 'object' && 'message' in e
            ? String(
                (
                  e as {
                    message: string;
                  }
                ).message,
              )
            : 'Could not load this job.';
        setErr(msg);
        setJobLoaded(false);
        setLoadBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [jobId]);
  async function saveChanges(): Promise<void> {
    setErr('');
    const t = title.trim();
    if (!t) {
      setErr('Please enter a job title.');
      throw new Error('validation');
    }
    const startIso = parseMmDdYyyyToIso(startDateInput);
    const endIso = parseMmDdYyyyToIso(endDateInput);
    if (startDateInput.trim() && !startIso) {
      setErr('Start date must be a valid date in MM-DD-YYYY format.');
      throw new Error('validation');
    }
    if (endDateInput.trim() && !endIso) {
      setErr('End date must be a valid date in MM-DD-YYYY format.');
      throw new Error('validation');
    }
    const rateNum = ratePerDay.trim() ? Number(ratePerDay) : NaN;
    if (!Number.isFinite(rateNum) || rateNum <= 0) {
      setErr('Enter a valid rate per day (CAD).');
      throw new Error('validation');
    }
    const yearsNum = yearsExp.trim() ? Number(yearsExp) : NaN;
    if (yearsExp.trim() && !Number.isFinite(yearsNum)) {
      setErr('Years of experience must be a number.');
      throw new Error('validation');
    }
    const servicesRequired = servicesRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    await hostApi.updateJob(jobId, {
      title: t,
      description: description.trim() || undefined,
      keyResponsibilities: buildKeyResponsibilitiesPayload(
        respBySection,
        respCustom,
      ),
      location: location.trim() || undefined,
      startDate: startIso || undefined,
      endDate: endIso || undefined,
      startTime: startTime || undefined,
      endTime: endTime || undefined,
      payPerDay: rateNum,
      minYearsExperience:
        yearsExp.trim() && Number.isFinite(yearsNum) ? yearsNum : undefined,
      requiredCredentials: credentials,
      travelRequired: travelReq,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
      servicesRequired: servicesRequired.length ? servicesRequired : [],
      isRural,
      accommodationProvided,
    });
    // Update snapshot: changes are now saved.
    initialSnapshotRef.current = snapshotState();
  }
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await saveChanges();
      closeToDashboard();
    } catch (e: unknown) {
      // If validation threw, keep user on page (err already set).
      if (e instanceof Error && e.message === 'validation') {
        return;
      }
      const msg =
        e && typeof e === 'object' && 'message' in e
          ? String((e as { message: string }).message)
          : 'Could not save changes. Please try again.';
      setErr(msg);
    } finally {
      setBusy(false);
    }
  }
  if (!jobId) {
    return (
      <>
        <HostDashboard />
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 250,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              padding: '10px 12px',
              borderRadius: 10,
              border: '1px solid #FECACA',
              background: '#FEF2F2',
              color: '#991B1B',
              fontSize: 13,
              fontFamily: 'Inter, sans-serif',
            }}
          >
            Invalid job link.
          </div>
        </div>
      </>
    );
  }
  const editOverlay = (
    <>
      <div
        onClick={() => {
          attemptClose();
        }}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(28, 50, 130, 0.45)',
          zIndex: 200,
        }}
      />
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          width: sidebarWidth,
          height: '100vh',
          background: '#fff',
          zIndex: 201,
          display: 'flex',
          flexDirection: 'column',
          fontFamily: 'Inter, sans-serif',
          boxShadow: '-4px 0 24px rgba(0,0,0,0.12)',
        }}
      >
        {/* Drag handle */}
        <div
          onMouseDown={(e) => {
            e.preventDefault();
            const startX = e.clientX;
            const startW = sidebarWidth;
            const onMove = (ev: MouseEvent) => {
              const delta = startX - ev.clientX;
              const newW = Math.min(900, Math.max(320, startW + delta));
              setSidebarWidth(newW);
            };
            const onUp = () => {
              window.removeEventListener('mousemove', onMove);
              window.removeEventListener('mouseup', onUp);
            };
            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
          }}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: 6,
            height: '100%',
            cursor: 'ew-resize',
            zIndex: 10,
            background: 'transparent',
          }}
        />
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '22px 24px 18px',
            borderBottom: '1px solid #F3F4F6',
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 20, fontWeight: 700, color: '#0B0F1F' }}>
            Edit job
          </span>
          <button
            type="button"
            onClick={() => {
              attemptClose();
            }}
            aria-label="Close"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 22,
              color: '#6B7280',
              lineHeight: 1,
              padding: 0,
            }}
          >
            ×
          </button>
        </div>
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '20px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          {closeConfirmOpen && (
            <div
              role="dialog"
              aria-modal="true"
              style={{
                position: 'sticky',
                top: 0,
                zIndex: 5,
                background: 'rgba(255,255,255,0.92)',
                border: '1px solid #E5E7EB',
                borderRadius: 12,
                padding: '14px 14px',
                boxShadow: '0 10px 26px rgba(15, 23, 42, 0.10)',
              }}
            >
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 800,
                  color: '#0B0F1F',
                  marginBottom: 6,
                }}
              >
                Do you want to save the changes?
              </div>
              <div
                style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}
              >
                <button
                  type="button"
                  onClick={() => {
                    if (closeConfirmBusy) return;
                    setCloseConfirmOpen(false);
                    closeToDashboard();
                  }}
                  style={{
                    padding: '10px 14px',
                    borderRadius: 8,
                    border: '1px solid #E5E7EB',
                    background: '#fff',
                    fontFamily: 'inherit',
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: closeConfirmBusy ? 'default' : 'pointer',
                    opacity: closeConfirmBusy ? 0.65 : 1,
                  }}
                >
                  No
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (closeConfirmBusy) return;
                    void (async () => {
                      setCloseConfirmBusy(true);
                      setBusy(true);
                      try {
                        await saveChanges();
                        setCloseConfirmOpen(false);
                        closeToDashboard();
                      } catch (e: unknown) {
                        // If validation failed, err is already set. Keep modal open.
                        if (e instanceof Error && e.message === 'validation') {
                          return;
                        }
                        const msg =
                          e && typeof e === 'object' && 'message' in e
                            ? String((e as { message: string }).message)
                            : 'Could not save changes. Please try again.';
                        setErr(msg);
                      } finally {
                        setBusy(false);
                        setCloseConfirmBusy(false);
                      }
                    })();
                  }}
                  style={{
                    padding: '10px 14px',
                    borderRadius: 8,
                    border: 'none',
                    background: '#1C32D2',
                    color: '#fff',
                    fontFamily: 'inherit',
                    fontWeight: 800,
                    fontSize: 13,
                    cursor: closeConfirmBusy ? 'default' : 'pointer',
                    opacity: closeConfirmBusy ? 0.8 : 1,
                  }}
                >
                  Yes
                </button>
              </div>
            </div>
          )}
          {!profileLoading && !verified && (
            <div
              style={{
                background: '#fff7ed',
                border: '1px solid #fdba74',
                color: '#9a3412',
                padding: '10px 14px',
                borderRadius: 8,
                fontSize: 13,
                lineHeight: 1.6,
              }}
            >
              <strong>Your CPSNS number is pending verification.</strong> Edits
              are saved; listings stay as drafts until verified.
            </div>
          )}
          {loadBusy && (
            <p style={{ fontSize: 14, color: '#6b7280' }}>Loading job…</p>
          )}
          {!loadBusy && !jobLoaded && err && (
            <p style={{ fontSize: 14, color: '#dc2626' }}>{err}</p>
          )}
          {!loadBusy && jobLoaded && (
            <form
              onSubmit={handleSubmit}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
                minHeight: 0,
              }}
            >
              <div style={sectionCard}>
                <div
                  style={{ fontSize: 14, fontWeight: 700, color: '#0B0F1F' }}
                >
                  Details
                </div>
                <div style={sectionStack}>
                  <HostJobTitleField
                    value={title}
                    onChange={setTitle}
                    inputStyle={inp}
                    labelStyle={lbl}
                  />
                  <HostJobDescriptionField
                    value={description}
                    onChange={setDescription}
                    inputStyle={inp}
                    labelStyle={lbl}
                  />
                  <HostKeyResponsibilitiesField
                    respBySection={respBySection}
                    respCustom={respCustom}
                    onToggle={toggleResponsibility}
                    onCustomChange={setRespCustom}
                    inputStyle={inp}
                    labelStyle={lbl}
                  />
                  <div>
                    <label style={lbl}>Location</label>
                    <input
                      style={inp}
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      placeholder="Clinic address or city"
                    />
                  </div>
                </div>
              </div>
              <div style={sectionCard}>
                <div
                  style={{ fontSize: 14, fontWeight: 700, color: '#0B0F1F' }}
                >
                  Schedule
                </div>
                <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>
                  Set dates, times, and pay
                </div>
                <div style={sectionStack}>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: 12,
                    }}
                  >
                    <div>
                      <label style={lbl}>Start Date *</label>
                      <MmDdYyyyDateField
                        value={startDateInput}
                        onChange={setStartDateInput}
                        inputStyle={inp}
                      />
                    </div>
                    <div>
                      <label style={lbl}>End Date *</label>
                      <MmDdYyyyDateField
                        value={endDateInput}
                        onChange={setEndDateInput}
                        inputStyle={inp}
                      />
                    </div>
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: 12,
                    }}
                  >
                    <div>
                      <label style={lbl}>Start Time *</label>
                      <input
                        type="time"
                        style={inp}
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                      />
                    </div>
                    <div>
                      <label style={lbl}>End Time *</label>
                      <input
                        type="time"
                        style={inp}
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                      />
                    </div>
                  </div>
                  <div>
                    <label style={lbl}>Rate per Day (CAD) *</label>
                    <input
                      style={inp}
                      type="number"
                      value={ratePerDay}
                      onChange={(e) => setRatePerDay(e.target.value)}
                      placeholder="e.g. 2000"
                    />
                  </div>
                </div>
              </div>
              <div style={sectionCard}>
                <div
                  style={{ fontSize: 14, fontWeight: 700, color: '#0B0F1F' }}
                >
                  Requirements
                </div>
                <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>
                  List mandatory licenses and experience
                </div>
                <div style={sectionStack}>
                  <div>
                    <label style={lbl}>Years of Experience</label>
                    <input
                      style={inp}
                      type="number"
                      value={yearsExp}
                      onChange={(e) => setYearsExp(e.target.value)}
                      placeholder="e.g. 3"
                    />
                  </div>
                  <div>
                    <label style={{ ...lbl, marginBottom: 10 }}>
                      Required Credentials
                    </label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {(() => {
                        const all = [
                          ...HOST_JOB_CREDENTIAL_OPTIONS,
                          ...credentials.filter(
                            (c) => !HOST_JOB_CREDENTIAL_OPTIONS.includes(c),
                          ),
                        ];
                        const seen = new Set<string>();
                        const unique = all.filter((c) => {
                          const k = c.trim();
                          if (!k || seen.has(k)) return false;
                          seen.add(k);
                          return true;
                        });
                        const selected = unique.filter((c) =>
                          credentials.includes(c),
                        );
                        const rest = unique.filter(
                          (c) => !credentials.includes(c),
                        );
                        return [...selected, ...rest];
                      })().map((c) => {
                        const on = credentials.includes(c);
                        return (
                          <span
                            key={c}
                            onClick={() => toggleCredential(c)}
                            style={{
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
                            }}
                          >
                            {c}
                            {on && (
                              <span
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleCredential(c);
                                }}
                                style={{
                                  fontSize: 14,
                                  color: '#1C32D2',
                                  lineHeight: 1,
                                  marginLeft: 2,
                                }}
                              >
                                ×
                              </span>
                            )}
                          </span>
                        );
                      })}
                    </div>
                    <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                      <input
                        type="text"
                        value={customCredential}
                        onChange={(e) => setCustomCredential(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key !== 'Enter') return;
                          e.preventDefault();
                          addCustomCredential(customCredential);
                        }}
                        placeholder="Add custom credential and press Enter"
                        style={{ ...inp, flex: 1 }}
                      />
                      <button
                        type="button"
                        onClick={() => addCustomCredential(customCredential)}
                        disabled={!customCredential.trim()}
                        style={{
                          padding: '0 14px',
                          borderRadius: 8,
                          border: '1px solid #D0D5DD',
                          background: customCredential.trim()
                            ? '#fff'
                            : '#F3F4F6',
                          color: customCredential.trim()
                            ? '#111827'
                            : '#9CA3AF',
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: customCredential.trim()
                            ? 'pointer'
                            : 'default',
                          fontFamily: 'inherit',
                        }}
                      >
                        Add
                      </button>
                    </div>
                  </div>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      fontSize: 14,
                      color: '#374151',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={travelReq}
                      onChange={(e) => setTravelReq(e.target.checked)}
                      style={{
                        width: 16,
                        height: 16,
                        flexShrink: 0,
                        accentColor: '#1C32D2',
                      }}
                    />
                    Locum is required to travel to Clinic
                  </label>
                </div>
              </div>
              {err && (
                <p style={{ fontSize: 13, color: '#dc2626', margin: 0 }}>
                  {err}
                </p>
              )}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: 12,
                  flexWrap: 'wrap',
                  paddingTop: 4,
                }}
              >
                <button
                  type="submit"
                  disabled={busy}
                  style={{
                    padding: '10px 16px',
                    borderRadius: 8,
                    border: 'none',
                    background: busy
                      ? '#9ca3af'
                      : 'linear-gradient(270deg,#3A65DB 0%,#0F2A7A 100%)',
                    color: '#fff',
                    fontWeight: 600,
                    fontSize: 14,
                    cursor: busy ? 'default' : 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {busy ? 'Saving…' : 'Save changes'}
                </button>
                {jobStatus === 'DRAFT' && (
                  <button
                    type="button"
                    onClick={async () => {
                      if (!verified) {
                        window.alert(
                          'Shift is saved under "Draft Locum Shifts". Please post again after profile is verified. Thanks.',
                        );
                        return;
                      }
                      setErr('');
                      const t = title.trim();
                      setBusy(true);
                      try {
                        const startIso = parseMmDdYyyyToIso(startDateInput);
                        const endIso = parseMmDdYyyyToIso(endDateInput);
                        const rateNum = ratePerDay.trim()
                          ? Number(ratePerDay)
                          : NaN;
                        const yearsNum = yearsExp.trim()
                          ? Number(yearsExp)
                          : NaN;
                        const servicesRequired = servicesRaw
                          .split(',')
                          .map((s) => s.trim())
                          .filter(Boolean);
                        await hostApi.updateJob(jobId, {
                          title: t,
                          description: description.trim() || undefined,
                          keyResponsibilities: buildKeyResponsibilitiesPayload(
                            respBySection,
                            respCustom,
                          ),
                          location: location.trim() || undefined,
                          startDate: startIso || undefined,
                          endDate: endIso || undefined,
                          startTime: startTime || undefined,
                          endTime: endTime || undefined,
                          payPerDay: Number.isFinite(rateNum)
                            ? rateNum
                            : undefined,
                          minYearsExperience:
                            yearsExp.trim() && Number.isFinite(yearsNum)
                              ? yearsNum
                              : undefined,
                          requiredCredentials: credentials,
                          travelRequired: travelReq,
                          expiresAt: expiresAt
                            ? new Date(expiresAt).toISOString()
                            : undefined,
                          servicesRequired: servicesRequired.length
                            ? servicesRequired
                            : [],
                          isRural,
                          accommodationProvided,
                          status: 'ACTIVE',
                        });
                        beforeClientNavigation('/host/dashboard');
                        router.push('/host/dashboard');
                      } catch (e: unknown) {
                        const msg =
                          e && typeof e === 'object' && 'message' in e
                            ? String((e as { message: unknown }).message)
                            : 'Could not post job.';
                        setErr(msg);
                      } finally {
                        setBusy(false);
                      }
                    }}
                    style={{
                      padding: '12px 20px',
                      borderRadius: 8,
                      border: 'none',
                      background: busy
                        ? '#9ca3af'
                        : 'linear-gradient(270deg,#22C55E 0%,#16A34A 100%)',
                      color: '#fff',
                      fontWeight: 600,
                      fontSize: 15,
                      cursor: busy ? 'default' : 'pointer',
                      fontFamily: 'inherit',
                    }}
                    disabled={busy || !verified}
                  >
                    {busy ? 'Posting…' : 'Post Job'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    beforeClientNavigation('/host/dashboard');
                    router.push('/host/dashboard');
                  }}
                  style={{
                    padding: '12px 20px',
                    borderRadius: 8,
                    border: '1px solid #d0d4e4',
                    background: '#fff',
                    color: '#374151',
                    fontWeight: 500,
                    fontSize: 15,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </>
  );
  return (
    <>
      <HostDashboard />
      {overlayMounted ? createPortal(editOverlay, document.body) : null}
    </>
  );
}
