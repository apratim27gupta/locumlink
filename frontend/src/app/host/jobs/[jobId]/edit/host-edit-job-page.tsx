'use client';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
  HostJobPracticeSections,
  emptyJobPracticeFields,
  jobPracticeFromProfile,
  type JobPracticeFields,
} from '@/components/host/HostJobPracticeSections';
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
  validateJobPostingSchedule,
  getJobScheduleValidationError,
  buildJobScheduleApiFields,
  utcPartsToLocalInputValues,
  calendarDatePartFromInput,
  fmtJobCalendarDate,
  localDateTimeToUtcParts,
  todayIsoDateLocal,
  compareLocalCalendarDates,
} from '@/lib/hostJobPostingForm';
import { getJobSpecificDates, getJobShifts, getJobScheduleType, getJobDateRanges, type JobScheduleLike } from '@/lib/jobSchedule';
/** Inclusive list of ISO days (YYYY-MM-DD) from start to end; capped for safety. */
function expandIsoDateRange(startIso: string, endIso: string): string[] {
  const out: string[] = [];
  const [sy, sm, sd] = startIso.split('-').map(Number);
  const [ey, em, ed] = endIso.split('-').map(Number);
  if ([sy, sm, sd, ey, em, ed].some(Number.isNaN)) return out;
  let cur = Date.UTC(sy, sm - 1, sd);
  const last = Date.UTC(ey, em - 1, ed);
  if (last < cur) return out;
  for (let i = 0; cur <= last && i < 400; i++) {
    out.push(new Date(cur).toISOString().slice(0, 10));
    cur += 86400000;
  }
  return out;
}
// Reconstruct the per-range editor rows (local times) from a loaded RANGES job.
function computeDateRangesFromJob(
  job: unknown,
  defStart: string,
  defEnd: string,
): { startDate: string; endDate: string; startTime: string; endTime: string }[] {
  return getJobDateRanges(job as JobScheduleLike).map((r) => ({
    startDate: r.startDate,
    endDate: r.endDate,
    startTime: r.startTime
      ? utcPartsToLocalInputValues(r.startDate, r.startTime)?.localTime ?? defStart
      : defStart,
    endTime: r.endTime
      ? utcPartsToLocalInputValues(r.startDate, r.endTime)?.localTime ?? defEnd
      : defEnd,
  }));
}
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
// Per-day local times derived from a loaded job, plus whether every day shares
// one time (which drives the "same time for all" toggle in the form).
function computeShiftTimesFromJob(
  job: unknown,
  defStart: string,
  defEnd: string,
): {
  sameTimeForAll: boolean;
  perDateTimes: Record<string, { start: string; end: string }>;
} {
  const perDateTimes: Record<string, { start: string; end: string }> = {};
  for (const s of getJobShifts(job as JobScheduleLike)) {
    const ls = s.startTime
      ? utcPartsToLocalInputValues(s.date, s.startTime)?.localTime ?? defStart
      : defStart;
    const le = s.endTime
      ? utcPartsToLocalInputValues(s.date, s.endTime)?.localTime ?? defEnd
      : defEnd;
    perDateTimes[s.date] = { start: ls, end: le };
  }
  const distinct = new Set(
    Object.values(perDateTimes).map((v) => `${v.start}|${v.end}`),
  );
  return { sameTimeForAll: distinct.size <= 1, perDateTimes };
}

// Stable serialization (sorted keys) so snapshots compare reliably.
function normalizePerDateTimes(
  o: Record<string, { start: string; end: string }>,
): Array<[string, string, string]> {
  return Object.keys(o)
    .sort()
    .map((k) => [k, o[k].start, o[k].end] as [string, string, string]);
}

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
  const [scheduleKind, setScheduleKind] = useState<'range' | 'list' | 'ranges'>('range');
  const [startDateInput, setStartDateInput] = useState('');
  const [endDateInput, setEndDateInput] = useState('');
  const [dateRanges, setDateRanges] = useState<
    { startDate: string; endDate: string; startTime: string; endTime: string }[]
  >([{ startDate: '', endDate: '', startTime: '05:00', endTime: '14:00' }]);
  function addDateRange() {
    setDateRanges((prev) => [...prev, { startDate: '', endDate: '', startTime: '05:00', endTime: '14:00' }]);
  }
  function updateDateRange(i: number, field: 'startDate' | 'endDate' | 'startTime' | 'endTime', value: string) {
    setDateRanges((prev) => prev.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  }
  function removeDateRange(i: number) {
    setDateRanges((prev) => (prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== i)));
  }
  function buildRangeShiftsPayload(): { date: string; startTime: string; endTime: string }[] {
    const byDate = new Map<string, { date: string; startTime: string; endTime: string }>();
    for (const r of dateRanges) {
      const start = r.startDate.trim();
      const end = r.endDate.trim();
      if (!start || !end) continue;
      for (const day of expandIsoDateRange(start, end)) {
        byDate.set(day, {
          date: day,
          startTime: localDateTimeToUtcParts(day, r.startTime || '00:00').utcTime,
          endTime: localDateTimeToUtcParts(day, r.endTime || '23:59').utcTime,
        });
      }
    }
    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  }
  const [specificDates, setSpecificDates] = useState<string[]>([]);
  const [newDateInput, setNewDateInput] = useState('');
  const [sameTimeForAll, setSameTimeForAll] = useState(true);
  const [perDateTimes, setPerDateTimes] = useState<
    Record<string, { start: string; end: string }>
  >({});
  const [startTime, setStartTime] = useState('05:00');
  const [endTime, setEndTime] = useState('14:00');
  function addSpecificDate(iso: string) {
    const cal = calendarDatePartFromInput(iso);
    if (!cal) return;
    setSpecificDates((prev) => (prev.includes(cal) ? prev : [...prev, cal].sort()));
    if (!sameTimeForAll) {
      setPerDateTimes((prev) =>
        cal in prev ? prev : { ...prev, [cal]: { start: startTime, end: endTime } },
      );
    }
    setNewDateInput('');
  }
  function removeSpecificDate(iso: string) {
    setSpecificDates((prev) => prev.filter((d) => d !== iso));
    setPerDateTimes((prev) => {
      if (!(iso in prev)) return prev;
      const next = { ...prev };
      delete next[iso];
      return next;
    });
  }
  function setPerDateTime(iso: string, field: 'start' | 'end', value: string) {
    setPerDateTimes((prev) => {
      const current = prev[iso] ?? { start: startTime, end: endTime };
      return { ...prev, [iso]: { ...current, [field]: value } };
    });
  }
  function handleSameTimeForAll(next: boolean) {
    setSameTimeForAll(next);
    if (!next) {
      setPerDateTimes((prev) => {
        const seeded = { ...prev };
        for (const d of specificDates) {
          if (!(d in seeded)) seeded[d] = { start: startTime, end: endTime };
        }
        return seeded;
      });
    }
  }
  function buildShiftsPayload(): { date: string; startTime: string; endTime: string }[] {
    return [...specificDates].sort().map((d) => {
      const o = sameTimeForAll
        ? { start: startTime, end: endTime }
        : perDateTimes[d] ?? { start: startTime, end: endTime };
      return {
        date: d,
        startTime: localDateTimeToUtcParts(d, o.start || '00:00').utcTime,
        endTime: localDateTimeToUtcParts(d, o.end || '23:59').utcTime,
      };
    });
  }
  const [ratePerDay, setRatePerDay] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [practice, setPractice] = useState<JobPracticeFields>(() =>
    emptyJobPracticeFields(),
  );
  const [isRural, setIsRural] = useState(false);
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
  const scheduleValidationError = useMemo(() => {
    const startIso = parseMmDdYyyyToIso(startDateInput);
    const endIso = parseMmDdYyyyToIso(endDateInput);
    if (!startIso || !endIso || !startTime.trim() || !endTime.trim())
      return null;
    return getJobScheduleValidationError({
      startDateIso: startIso,
      endDateIso: endIso,
      startTime,
      endTime,
      allowPastDates: jobStatus === 'DRAFT',
    });
  }, [startDateInput, endDateInput, startTime, endTime, jobStatus]);
  useLayoutEffect(() => {
    setOverlayMounted(true);
  }, []);

  function snapshotState(): string {
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
      scheduleKind,
      specificDates: [...specificDates].sort(),
      sameTimeForAll,
      perDateTimes: normalizePerDateTimes(perDateTimes),
      dateRanges: scheduleKind === 'ranges'
        ? dateRanges.map((r) => [r.startDate, r.endDate, r.startTime, r.endTime])
        : [],
      startDate: startIso || '',
      endDate: endIso || '',
      startTime: startTime || '',
      endTime: endTime || '',
      ratePerDay: ratePerDay.trim(),
      expiresAt: expiresAt || '',
      practice,
      isRural: Boolean(isRural),
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
    const sr = job?.servicesRequired ?? job?.amenities;
    const amenities = Array.isArray(sr)
      ? sr.map((s: unknown) => String(s).trim()).filter(Boolean)
      : typeof sr === 'string'
        ? sr
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : [];
    const practice: JobPracticeFields = {
      practiceType: String(job?.practiceType ?? '').trim(),
      numPhysicians: String(job?.numPhysicians ?? '').trim(),
      emr: String(job?.emr ?? '').trim(),
      patientVol: String(job?.patientVol ?? '').trim(),
      clinicDesc: String(job?.clinicDesc ?? '').trim().slice(0, 1000),
      amenities,
      accommodationProvided: Boolean(job?.accommodationProvided),
    };
    const startLocal = utcPartsToLocalInputValues(
      typeof job?.startDate === 'string' ? job.startDate : null,
      typeof job?.startTime === 'string' ? job.startTime : null,
    );
    const endLocal = utcPartsToLocalInputValues(
      typeof job?.endDate === 'string' ? job.endDate : null,
      typeof job?.endTime === 'string' ? job.endTime : null,
    );
    const rc = job?.requiredCredentials;
    const credentials =
      Array.isArray(rc) && rc.length
        ? rc.map((s: unknown) => String(s).trim()).filter(Boolean)
        : ['CPSNS Full License'];
    const ppd = job?.payPerDay ?? job?.ratePerDay;
    const ye = job?.minYearsExperience;
    const snapKind: 'range' | 'list' | 'ranges' =
      getJobSpecificDates(job).length > 0
        ? getJobScheduleType(job) === 'RANGES'
          ? 'ranges'
          : 'list'
        : 'range';
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
      scheduleKind: snapKind,
      specificDates: getJobSpecificDates(job),
      ...(() => {
        const ds = startLocal?.localTime ?? '05:00';
        const de = endLocal?.localTime ?? '14:00';
        const st = computeShiftTimesFromJob(job, ds, de);
        return {
          sameTimeForAll: st.sameTimeForAll,
          perDateTimes: normalizePerDateTimes(st.perDateTimes),
          dateRanges:
            snapKind === 'ranges'
              ? computeDateRangesFromJob(job, ds, de).map((r) => [
                  r.startDate,
                  r.endDate,
                  r.startTime,
                  r.endTime,
                ])
              : [],
        };
      })(),
      startDate: startLocal?.localDate ?? '',
      endDate: endLocal?.localDate ?? '',
      startTime: startLocal?.localTime ?? '',
      endTime: endLocal?.localTime ?? '',
      ratePerDay:
        ppd === null || ppd === undefined || ppd === ''
          ? ''
          : String(ppd).trim(),
      expiresAt:
        toDatetimeLocalValue(job?.expiresAt as string | null | undefined) || '',
      practice,
      isRural: Boolean(job?.isRural),
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
        const startLocal = utcPartsToLocalInputValues(
          job.startDate as string | null | undefined,
          job.startTime as string | null | undefined,
        );
        const endLocal = utcPartsToLocalInputValues(
          job.endDate as string | null | undefined,
          job.endTime as string | null | undefined,
        );
        setStartDateInput(
          startLocal ? fmtIsoToMmDdYyyy(startLocal.localDate) : '',
        );
        setEndDateInput(
          endLocal ? fmtIsoToMmDdYyyy(endLocal.localDate) : '',
        );
        const defStart = startLocal?.localTime ?? '05:00';
        const defEnd = endLocal?.localTime ?? '14:00';
        setStartTime(defStart);
        setEndTime(defEnd);
        const jobShifts = getJobShifts(job as JobScheduleLike);
        if (jobShifts.length > 0 && getJobScheduleType(job) === 'RANGES') {
          setScheduleKind('ranges');
          const ranges = computeDateRangesFromJob(job, defStart, defEnd);
          setDateRanges(ranges.length ? ranges : [{ startDate: '', endDate: '', startTime: defStart, endTime: defEnd }]);
        } else {
          setScheduleKind(jobShifts.length > 0 ? 'list' : 'range');
        }
        setSpecificDates(jobShifts.map((s) => s.date));
        const st = computeShiftTimesFromJob(job, defStart, defEnd);
        setSameTimeForAll(st.sameTimeForAll);
        setPerDateTimes(st.perDateTimes);
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
        const sr =
          (job as { amenities?: unknown; servicesRequired?: unknown })
            .amenities ??
          (job as { servicesRequired?: unknown }).servicesRequired;
        const amenities = Array.isArray(sr)
          ? sr.map((s) => String(s).trim()).filter(Boolean)
          : typeof sr === 'string'
            ? sr
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
            : [];
        const fromJob: JobPracticeFields = {
          practiceType: String(
            (job as { practiceType?: unknown }).practiceType ?? '',
          ).trim(),
          numPhysicians: String(
            (job as { numPhysicians?: unknown }).numPhysicians ?? '',
          ).trim(),
          emr: String((job as { emr?: unknown }).emr ?? '').trim(),
          patientVol: String(
            (job as { patientVol?: unknown }).patientVol ?? '',
          ).trim(),
          clinicDesc: String(
            (job as { clinicDesc?: unknown }).clinicDesc ?? '',
          )
            .trim()
            .slice(0, 1000),
          amenities,
          accommodationProvided: Boolean(job.accommodationProvided),
        };
        const hasJobPractice =
          fromJob.practiceType ||
          fromJob.numPhysicians ||
          fromJob.emr ||
          fromJob.patientVol ||
          fromJob.clinicDesc ||
          fromJob.amenities.length > 0 ||
          fromJob.accommodationProvided;
        const resolvedPractice = hasJobPractice
          ? fromJob
          : jobPracticeFromProfile(profile ?? null);
        setPractice(resolvedPractice);
        setIsRural(Boolean(job.isRural));
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
        initialSnapshotRef.current = snapshotFromJob({
          ...job,
          practiceType: resolvedPractice.practiceType,
          numPhysicians: resolvedPractice.numPhysicians,
          emr: resolvedPractice.emr,
          patientVol: resolvedPractice.patientVol,
          clinicDesc: resolvedPractice.clinicDesc,
          servicesRequired: resolvedPractice.amenities,
          amenities: resolvedPractice.amenities,
          accommodationProvided: resolvedPractice.accommodationProvided,
        });
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
    const listMode = scheduleKind === 'list';
    const rangesMode = scheduleKind === 'ranges';
    const shiftsMode = listMode || rangesMode;
    const sortedDates = [...specificDates].sort();
    const startIso = parseMmDdYyyyToIso(startDateInput);
    const endIso = parseMmDdYyyyToIso(endDateInput);
    if (!shiftsMode && startDateInput.trim() && !startIso) {
      setErr('Start date must be a valid date in MM-DD-YYYY format.');
      throw new Error('validation');
    }
    if (!shiftsMode && endDateInput.trim() && !endIso) {
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
    let outShifts: { date: string; startTime: string; endTime: string }[] = [];
    if (rangesMode) {
      const filled = dateRanges.filter((r) => r.startDate.trim() || r.endDate.trim());
      if (filled.length === 0) {
        setErr('Add at least one date range.');
        throw new Error('validation');
      }
      const todayIso = todayIsoDateLocal();
      for (const r of filled) {
        if (!r.startDate.trim() || !r.endDate.trim()) {
          setErr('Each range needs a start and end date.');
          throw new Error('validation');
        }
        if (compareLocalCalendarDates(r.endDate, r.startDate) < 0) {
          setErr('Each range end date must be on or after its start date.');
          throw new Error('validation');
        }
        if (jobStatus !== 'DRAFT' && compareLocalCalendarDates(r.startDate, todayIso) < 0) {
          setErr('Dates cannot be in the past.');
          throw new Error('validation');
        }
        if (!r.startTime.trim() || !r.endTime.trim()) {
          setErr('Set a start and end time for each range.');
          throw new Error('validation');
        }
      }
      outShifts = buildRangeShiftsPayload();
      if (outShifts.length === 0) {
        setErr('Add at least one date range.');
        throw new Error('validation');
      }
    }
    else if (listMode) {
      if (sortedDates.length === 0) {
        setErr('Add at least one date.');
        throw new Error('validation');
      }
      if (jobStatus !== 'DRAFT') {
        const todayIso = todayIsoDateLocal();
        if (sortedDates.some((d) => compareLocalCalendarDates(d, todayIso) < 0)) {
          setErr('Dates cannot be in the past.');
          throw new Error('validation');
        }
      }
      if (sameTimeForAll) {
        if (!startTime.trim() || !endTime.trim()) {
          setErr('Set the start and end time.');
          throw new Error('validation');
        }
      } else {
        for (const d of sortedDates) {
          const o = perDateTimes[d] ?? { start: startTime, end: endTime };
          if (!o.start.trim() || !o.end.trim()) {
            setErr(`Set a start and end time for ${fmtJobCalendarDate(d)}.`);
            throw new Error('validation');
          }
        }
      }
      outShifts = buildShiftsPayload();
    }
    else if (startIso && endIso && startTime && endTime) {
      const scheduleCheck = validateJobPostingSchedule({
        startDateIso: startIso,
        endDateIso: endIso,
        startTime,
        endTime,
        allowPastDates: jobStatus === 'DRAFT',
      });
      if (!scheduleCheck.valid) {
        setErr(scheduleCheck.message);
        throw new Error('validation');
      }
    }
    const scheduleFields =
      !shiftsMode && startIso && endIso && startTime && endTime
        ? buildJobScheduleApiFields({
            startDateIso: startIso,
            endDateIso: endIso,
            startTime,
            endTime,
          })
        : null;
    await hostApi.updateJob(jobId, {
      title: t,
      description: description.trim() || undefined,
      keyResponsibilities: buildKeyResponsibilitiesPayload(
        respBySection,
        respCustom,
      ),
      shifts: shiftsMode ? outShifts : undefined,
      scheduleType: rangesMode ? 'RANGES' : listMode ? 'DATES' : undefined,
      startDate: shiftsMode ? undefined : scheduleFields?.startDate ?? undefined,
      endDate: shiftsMode ? undefined : scheduleFields?.endDate ?? undefined,
      startTime: shiftsMode ? undefined : scheduleFields?.startTime ?? (startTime || undefined),
      endTime: shiftsMode ? undefined : scheduleFields?.endTime ?? (endTime || undefined),
      payPerDay: rateNum,
      minYearsExperience:
        yearsExp.trim() && Number.isFinite(yearsNum) ? yearsNum : undefined,
      requiredCredentials: credentials,
      travelRequired: travelReq,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
      amenities: practice.amenities,
      isRural,
      accommodationProvided: practice.accommodationProvided,
      practiceType: practice.practiceType.trim() || '',
      numPhysicians: practice.numPhysicians.trim() || '',
      emr: practice.emr.trim() || '',
      patientVol: practice.patientVol.trim() || '',
      clinicDesc: practice.clinicDesc.trim() || '',
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
        className="host-job-post-panel"
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
          className="host-job-post-panel-resize-handle"
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
          className="host-job-post-panel-body"
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            padding: '20px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            boxSizing: 'border-box',
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
              id="host-edit-job-form"
              onSubmit={handleSubmit}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
                minHeight: 0,
                minWidth: 0,
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
                  <div>
                    <label style={lbl}>Scheduling</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {([
                        { id: 'range', label: 'Continuous dates' },
                        { id: 'list', label: 'Specific days' },
                        { id: 'ranges', label: 'Multiple periods' },
                      ] as const).map((opt) => {
                        const on = scheduleKind === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => setScheduleKind(opt.id)}
                            style={{
                              flex: 1,
                              padding: '9px 10px',
                              borderRadius: 8,
                              border: `1px solid ${on ? '#309BB7' : '#D0D5DD'}`,
                              background: on ? 'rgba(48, 155, 183, 0.10)' : '#fff',
                              color: on ? '#1B6F86' : '#374151',
                              fontWeight: on ? 700 : 500,
                              fontSize: 12,
                              fontFamily: 'inherit',
                              cursor: 'pointer',
                              lineHeight: 1.2,
                            }}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                    <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 6 }}>
                      {scheduleKind === 'list'
                        ? 'Pick each day you need a locum. They do not have to be consecutive.'
                        : scheduleKind === 'ranges'
                        ? 'Add one or more date periods, each with its own start, end, and time.'
                        : 'One continuous stretch of days from a start to an end date.'}
                    </div>
                  </div>
                  {scheduleKind === 'range' ? (
                  <>
                  <div
                    className="host-job-schedule-grid"
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
                    className="host-job-schedule-grid"
                    style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}
                  >
                    <div>
                      <label style={lbl}>Start Time *</label>
                      <input type="time" style={inp} value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                    </div>
                    <div>
                      <label style={lbl}>End Time *</label>
                      <input type="time" style={inp} value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                    </div>
                  </div>
                  </>
                  ) : scheduleKind === 'ranges' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {dateRanges.map((r, i) => (
                      <div key={i} style={{ border: '1px solid rgba(48, 155, 183, 0.24)', background: 'rgba(48, 155, 183, 0.06)', borderRadius: 8, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: '#1B6F86' }}>Range {i + 1}</span>
                          {dateRanges.length > 1 && (
                            <button type="button" aria-label={`Remove range ${i + 1}`} onClick={() => removeDateRange(i)} style={{ border: 'none', background: 'transparent', color: '#1B6F86', cursor: 'pointer', fontSize: 17, lineHeight: 1, padding: 0 }}>×</button>
                          )}
                        </div>
                        <div className="host-job-schedule-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                          <div>
                            <label style={lbl}>Start Date *</label>
                            <input type="date" style={inp} min={todayIsoDateLocal()} value={r.startDate} onChange={(e) => updateDateRange(i, 'startDate', e.target.value)} />
                          </div>
                          <div>
                            <label style={lbl}>End Date *</label>
                            <input type="date" style={inp} min={r.startDate || todayIsoDateLocal()} value={r.endDate} onChange={(e) => updateDateRange(i, 'endDate', e.target.value)} />
                          </div>
                        </div>
                        <div className="host-job-schedule-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                          <div>
                            <label style={lbl}>Start Time *</label>
                            <input type="time" style={inp} value={r.startTime} onChange={(e) => updateDateRange(i, 'startTime', e.target.value)} />
                          </div>
                          <div>
                            <label style={lbl}>End Time *</label>
                            <input type="time" style={inp} value={r.endTime} onChange={(e) => updateDateRange(i, 'endTime', e.target.value)} />
                          </div>
                        </div>
                      </div>
                    ))}
                    <button type="button" onClick={addDateRange} style={{ alignSelf: 'flex-start', padding: '8px 14px', borderRadius: 8, border: '1px solid #309BB7', background: '#fff', color: '#1B6F86', fontWeight: 600, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer' }}>+ Add range</button>
                  </div>
                  ) : (
                  <>
                  <div>
                    <label style={lbl}>Dates *</label>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input
                        type="date"
                        style={{ ...inp, flex: 1 }}
                        value={newDateInput}
                        min={todayIsoDateLocal()}
                        onChange={(e) => setNewDateInput(e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => addSpecificDate(newDateInput)}
                        disabled={!newDateInput}
                        style={{
                          padding: '9px 16px',
                          borderRadius: 8,
                          border: '1px solid #309BB7',
                          background: newDateInput ? '#309BB7' : '#E5E7EB',
                          color: newDateInput ? '#fff' : '#9CA3AF',
                          fontWeight: 600,
                          fontSize: 13,
                          fontFamily: 'inherit',
                          cursor: newDateInput ? 'pointer' : 'not-allowed',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        Add date
                      </button>
                    </div>
                  </div>
                  {(sameTimeForAll || specificDates.length === 0) && (
                    <div
                      className="host-job-schedule-grid"
                      style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}
                    >
                      <div>
                        <label style={lbl}>Start Time *</label>
                        <input type="time" style={inp} value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                      </div>
                      <div>
                        <label style={lbl}>End Time *</label>
                        <input type="time" style={inp} value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                      </div>
                    </div>
                  )}
                  {specificDates.length >= 1 && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#374151', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={sameTimeForAll}
                        onChange={(e) => handleSameTimeForAll(e.target.checked)}
                        style={{ width: 16, height: 16, accentColor: '#309BB7', flexShrink: 0 }}
                      />
                      Use the same time for every date
                    </label>
                  )}
                  {specificDates.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {specificDates.map((d) => {
                          const t = perDateTimes[d] ?? { start: startTime, end: endTime };
                          return (
                          <div
                            key={d}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                              flexWrap: 'nowrap',
                              background: 'rgba(48, 155, 183, 0.06)',
                              border: '1px solid rgba(48, 155, 183, 0.24)',
                              borderRadius: 8,
                              padding: '8px 10px',
                            }}
                          >
                            <span style={{ fontSize: 12, fontWeight: 600, color: '#1B6F86', flexShrink: 0, whiteSpace: 'nowrap' }}>
                              {fmtJobCalendarDate(d)}
                            </span>
                            {!sameTimeForAll && (
                              <>
                                <input
                                  type="time"
                                  aria-label={`Start time for ${d}`}
                                  style={{ ...inp, flex: '1 1 0', minWidth: 0, width: 'auto', padding: '9px 6px' }}
                                  value={t.start}
                                  onChange={(e) => setPerDateTime(d, 'start', e.target.value)}
                                />
                                <span style={{ color: '#9CA3AF', fontSize: 12, flexShrink: 0 }}>-</span>
                                <input
                                  type="time"
                                  aria-label={`End time for ${d}`}
                                  style={{ ...inp, flex: '1 1 0', minWidth: 0, width: 'auto', padding: '9px 6px' }}
                                  value={t.end}
                                  onChange={(e) => setPerDateTime(d, 'end', e.target.value)}
                                />
                              </>
                            )}
                            <button
                              type="button"
                              aria-label={`Remove ${d}`}
                              onClick={() => removeSpecificDate(d)}
                              style={{
                                marginLeft: 'auto', flexShrink: 0, border: 'none', background: 'transparent',
                                color: '#1B6F86', cursor: 'pointer', fontSize: 17, lineHeight: 1, padding: '0 2px',
                              }}
                            >
                              ×
                            </button>
                          </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                  )}
                  {scheduleValidationError && (
                    <p style={{ fontSize: 13, color: '#DC2626', margin: 0 }}>
                      {scheduleValidationError}
                    </p>
                  )}
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
              <div style={sectionCard}>
                <div style={sectionStack}>
                  <HostJobPracticeSections
                    value={practice}
                    onChange={setPractice}
                    inputStyle={inp}
                    labelStyle={lbl}
                  />
                </div>
              </div>
              {err && (
                <p style={{ fontSize: 13, color: '#dc2626', margin: 0 }}>
                  {err}
                </p>
              )}
            </form>
          )}
        </div>
        {!loadBusy && jobLoaded && (
          <div
            style={{
              flexShrink: 0,
              width: '100%',
              boxSizing: 'border-box',
              padding: '16px 24px',
              borderTop: '1px solid #F3F4F6',
              display: 'flex',
              justifyContent: 'flex-end',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap',
            }}
          >
            <button
              type="submit"
              form="host-edit-job-form"
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
                flexShrink: 0,
              }}
            >
              {busy ? 'Saving…' : 'Save changes'}
            </button>
            {jobStatus === 'DRAFT' && (
              <button
                type="button"
                onClick={async () => {
                  setErr('');
                  const t = title.trim();
                  setBusy(true);
                  try {
                    const listMode = scheduleKind === 'list';
                    const rangesMode = scheduleKind === 'ranges';
                    const shiftsMode = listMode || rangesMode;
                    const sortedDates = [...specificDates].sort();
                    let scheduleFields: { startDate: string; endDate: string; startTime: string; endTime: string } | null = null;
                    let outShifts: { date: string; startTime: string; endTime: string }[] = [];
                    if (rangesMode) {
                      const filled = dateRanges.filter((r) => r.startDate.trim() || r.endDate.trim());
                      if (filled.length === 0) {
                        setErr('Add at least one date range.');
                        return;
                      }
                      const todayIso = todayIsoDateLocal();
                      for (const r of filled) {
                        if (!r.startDate.trim() || !r.endDate.trim()) {
                          setErr('Each range needs a start and end date.');
                          return;
                        }
                        if (compareLocalCalendarDates(r.endDate, r.startDate) < 0) {
                          setErr('Each range end date must be on or after its start date.');
                          return;
                        }
                        if (compareLocalCalendarDates(r.startDate, todayIso) < 0) {
                          setErr('Dates cannot be in the past.');
                          return;
                        }
                        if (!r.startTime.trim() || !r.endTime.trim()) {
                          setErr('Set a start and end time for each range.');
                          return;
                        }
                      }
                      outShifts = buildRangeShiftsPayload();
                      if (outShifts.length === 0) {
                        setErr('Add at least one date range.');
                        return;
                      }
                    }
                    else if (listMode) {
                      if (sortedDates.length === 0) {
                        setErr('Add at least one date.');
                        return;
                      }
                      const todayIso = todayIsoDateLocal();
                      if (sortedDates.some((d) => compareLocalCalendarDates(d, todayIso) < 0)) {
                        setErr('Dates cannot be in the past.');
                        return;
                      }
                      if (sameTimeForAll) {
                        if (!startTime.trim() || !endTime.trim()) {
                          setErr('Set the start and end time.');
                          return;
                        }
                      } else {
                        for (const d of sortedDates) {
                          const o = perDateTimes[d] ?? { start: startTime, end: endTime };
                          if (!o.start.trim() || !o.end.trim()) {
                            setErr(`Set a start and end time for ${fmtJobCalendarDate(d)}.`);
                            return;
                          }
                        }
                      }
                      outShifts = buildShiftsPayload();
                    }
                    else {
                      const startIso = parseMmDdYyyyToIso(startDateInput);
                      const endIso = parseMmDdYyyyToIso(endDateInput);
                      const scheduleCheck = validateJobPostingSchedule({
                        startDateIso: startIso || '',
                        endDateIso: endIso || '',
                        startTime,
                        endTime,
                      });
                      if (!scheduleCheck.valid) {
                        setErr(scheduleCheck.message);
                        return;
                      }
                      scheduleFields = buildJobScheduleApiFields({
                        startDateIso: startIso!,
                        endDateIso: endIso!,
                        startTime,
                        endTime,
                      });
                      if (!scheduleFields) {
                        setErr('Schedule could not be encoded.');
                        return;
                      }
                    }
                    const rateNum = ratePerDay.trim()
                      ? Number(ratePerDay)
                      : NaN;
                    const yearsNum = yearsExp.trim()
                      ? Number(yearsExp)
                      : NaN;
                    await hostApi.updateJob(jobId, {
                      title: t,
                      description: description.trim() || undefined,
                      shifts: shiftsMode ? outShifts : undefined,
                      scheduleType: rangesMode ? 'RANGES' : listMode ? 'DATES' : undefined,
                      keyResponsibilities: buildKeyResponsibilitiesPayload(
                        respBySection,
                        respCustom,
                      ),
                      startDate: shiftsMode ? undefined : scheduleFields!.startDate,
                      endDate: shiftsMode ? undefined : scheduleFields!.endDate,
                      startTime: shiftsMode ? undefined : scheduleFields!.startTime,
                      endTime: shiftsMode ? undefined : scheduleFields!.endTime,
                      payPerDay: Number.isFinite(rateNum) ? rateNum : undefined,
                      minYearsExperience:
                        yearsExp.trim() && Number.isFinite(yearsNum)
                          ? yearsNum
                          : undefined,
                      requiredCredentials: credentials,
                      travelRequired: travelReq,
                      expiresAt: expiresAt
                        ? new Date(expiresAt).toISOString()
                        : undefined,
                      amenities: practice.amenities,
                      isRural,
                      accommodationProvided: practice.accommodationProvided,
                      practiceType: practice.practiceType.trim() || '',
                      numPhysicians: practice.numPhysicians.trim() || '',
                      emr: practice.emr.trim() || '',
                      patientVol: practice.patientVol.trim() || '',
                      clinicDesc: practice.clinicDesc.trim() || '',
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
                  padding: '10px 16px',
                  borderRadius: 8,
                  border: 'none',
                  background:
                    busy || profileLoading || !verified
                      ? '#9ca3af'
                      : 'linear-gradient(270deg,#22C55E 0%,#16A34A 100%)',
                  color: '#fff',
                  fontWeight: 600,
                  fontSize: 14,
                  cursor:
                    busy || profileLoading || !verified
                      ? 'not-allowed'
                      : 'pointer',
                  fontFamily: 'inherit',
                  flexShrink: 0,
                }}
                disabled={busy || profileLoading || !verified}
                title={
                  !verified && !profileLoading
                    ? 'Post Job is available after CPSNS is verified'
                    : undefined
                }
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
                padding: '10px 16px',
                borderRadius: 8,
                border: '1px solid #d0d4e4',
                background: '#fff',
                color: '#374151',
                fontWeight: 500,
                fontSize: 14,
                cursor: 'pointer',
                fontFamily: 'inherit',
                flexShrink: 0,
              }}
            >
              Cancel
            </button>
          </div>
        )}
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
