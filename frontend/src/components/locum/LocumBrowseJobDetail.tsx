'use client';

import Image from 'next/image';
import type { CSSProperties, ReactNode } from 'react';
import { NameWithVerifiedShield } from '@/components/NameWithVerifiedShield';
import type { BrowseJob } from '@/lib/api';
import { isCpsnsVerificationApproved } from '@/lib/cpsnsVerify';
import { formatHostDoctorDisplayName } from '@/lib/hostDisplayName';
import { groupKeyResponsibilitiesForDisplay } from '@/lib/hostJobPostingForm';
import { relativeHoursOrDaysAgo, toLocalDateTime } from '@/lib/relativeTime';

const LOGO_TEAL = '#309BB7';
const LOGO_TEAL_BG = 'rgba(48, 155, 183, 0.14)';
const LOGO_TEAL_BORDER = 'rgba(48, 155, 183, 0.28)';

/** Cosmetic blur for host-identifying details shown to logged-out visitors. */
function LockedUntilSignIn({ children }: { children: ReactNode }) {
  return (
    <span
      title="Sign in to view"
      aria-label="Sign in to view"
      style={{
        filter: 'blur(5px)',
        userSelect: 'none',
        pointerEvents: 'none',
      }}
    >
      {children}
    </span>
  );
}

export function formatBrowseJobUtcDateTimeToLocal(
  dateStr: string | null | undefined,
  timeStr: string | null | undefined,
): { localDate: string; localTime: string } | null {
  if (!dateStr) return null;
  const time = timeStr?.trim() ? timeStr : '00:00';
  const utcIso = `${dateStr.split('T')[0]}T${time}:00Z`;
  const d = new Date(utcIso);
  if (isNaN(d.getTime())) return null;
  return {
    localDate: d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }),
    localTime: d.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    }),
  };
}

function hasMinYearsExperience(
  value: number | null | undefined,
): value is number {
  return value != null && value > 0;
}

function formatMinYearsExperienceValue(value: number): string {
  return `${value}+`;
}

export type LocumBrowseJobDetailProps = {
  job: BrowseJob;
  /** When true, show clinic/host identifying details (signed-in locum or host preview). */
  revealHostDetails: boolean;
  /** Panel open class for mobile master-detail. */
  open?: boolean;
  contentOpacity?: number;
  banner?: ReactNode;
  footer?: ReactNode;
  onBack?: () => void;
  backLabel?: string;
  className?: string;
  style?: CSSProperties;
};

/**
 * Locum browse job detail panel — shared so hosts can preview the same layout.
 */
export function LocumBrowseJobDetail({
  job,
  revealHostDetails,
  open = true,
  contentOpacity = 1,
  banner,
  footer,
  onBack,
  backLabel = 'Back to Opportunities',
  className,
  style,
}: LocumBrowseJobDetailProps) {
  const hostDoctorName = formatHostDoctorDisplayName(
    job.hostProfile.contactFirstName,
    job.hostProfile.contactLastName,
  );
  const hostCpsnsVerified = isCpsnsVerificationApproved(
    job.hostProfile.cpsnsVerificationStatus,
  );

  return (
    <div
      className={
        className ??
        (open
          ? 'browse-detail-panel browse-detail-panel--open'
          : 'browse-detail-panel')
      }
      style={{
        flex: 1,
        minHeight: 0,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        ...style,
      }}
    >
      {onBack ? (
        <button
          className="browse-back-btn"
          type="button"
          onClick={onBack}
          style={{
            display: 'none',
            alignItems: 'center',
            gap: 8,
            background: '#fff',
            border: 'none',
            borderBottom: '1px solid #E5E7EB',
            cursor: 'pointer',
            padding: '12px 16px',
            fontSize: 14,
            fontWeight: 600,
            color: '#0F2A7A',
            fontFamily: 'inherit',
            width: '100%',
            textAlign: 'left',
            flexShrink: 0,
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden
          >
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
          {backLabel}
        </button>
      ) : null}

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          padding: '18px 20px',
          opacity: contentOpacity,
        }}
      >
        {banner}

        <div style={{ marginBottom: 6 }}>
          <div
            style={{
              fontFamily: 'Inter, sans-serif',
              fontWeight: 'var(--font-weight-bold)',
              fontSize: '1.125rem',
              lineHeight: '120%',
              color: '#0f1523',
              marginBottom: hostDoctorName ? 4 : 0,
            }}
          >
            {revealHostDetails && job.hostProfile.practiceName ? (
              job.hostProfile.practiceName
            ) : (
              <LockedUntilSignIn>Clinic name</LockedUntilSignIn>
            )}
          </div>
          {revealHostDetails && hostDoctorName ? (
            <NameWithVerifiedShield
              verified={hostCpsnsVerified}
              shieldSize={18}
              gap={6}
            >
              <span
                style={{
                  fontFamily: 'Inter, sans-serif',
                  fontWeight: 600,
                  fontSize: 'var(--font-heading)',
                  lineHeight: '120%',
                  color: '#5a6478',
                }}
              >
                {hostDoctorName}
              </span>
            </NameWithVerifiedShield>
          ) : !revealHostDetails ? (
            <span
              style={{
                fontFamily: 'Inter, sans-serif',
                fontWeight: 600,
                fontSize: 'var(--font-heading)',
                lineHeight: '120%',
                color: '#5a6478',
              }}
            >
              <LockedUntilSignIn>Host name</LockedUntilSignIn>
            </span>
          ) : null}
          {!revealHostDetails ? (
            <div
              style={{
                marginTop: 6,
                fontSize: 'var(--font-small)',
                color: '#8892a4',
              }}
            >
              Sign in to view clinic name, host, and address
            </div>
          ) : null}
        </div>

        <h2
          style={{
            fontSize: 'var(--font-heading)',
            fontWeight: 'var(--font-weight-bold)',
            color: '#0f1523',
            marginBottom: 4,
          }}
        >
          {job.title}
        </h2>
        <p
          style={{
            fontSize: 'var(--font-small)',
            fontWeight: 600,
            color: LOGO_TEAL,
            marginBottom: 12,
            padding: '6px 12px',
            borderRadius: 6,
            background: LOGO_TEAL_BG,
            border: `1px solid ${LOGO_TEAL_BORDER}`,
            display: 'block',
            width: '100%',
            maxWidth: '100%',
            boxSizing: 'border-box',
            overflowWrap: 'break-word',
            wordBreak: 'break-word',
          }}
        >
          {job.hostProfile.city}, {job.hostProfile.province} ·{' '}
          <span
            title={toLocalDateTime(job.createdAt)}
            style={{ cursor: 'help', borderBottom: '1px dotted currentColor' }}
          >
            {relativeHoursOrDaysAgo(job.createdAt)}
          </span>{' '}
          · {job.applicationsCount} applicant
          {job.applicationsCount !== 1 ? 's' : ''}
        </p>

        <div
          style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            marginBottom: 14,
          }}
        >
          {(job.startDate || job.endDate) &&
            (() => {
              const start = formatBrowseJobUtcDateTimeToLocal(
                job.startDate,
                job.startTime,
              );
              const end = formatBrowseJobUtcDateTimeToLocal(
                job.endDate,
                job.endTime,
              );
              if (!start && !end) return null;
              return (
                <span
                  style={{
                    background: LOGO_TEAL_BG,
                    border: `1px solid ${LOGO_TEAL_BORDER}`,
                    padding: '5px 10px',
                    borderRadius: 5,
                    fontSize: 'var(--font-small)',
                    fontWeight: 600,
                    color: LOGO_TEAL,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <Image
                    src="/calender.svg"
                    alt=""
                    width={14}
                    height={14}
                    style={{ flexShrink: 0, objectFit: 'contain' }}
                  />
                  {start?.localDate ?? '—'} – {end?.localDate ?? '—'}
                </span>
              );
            })()}
          {(job.startTime || job.endTime) &&
            (() => {
              const start = formatBrowseJobUtcDateTimeToLocal(
                job.startDate,
                job.startTime,
              );
              const end = formatBrowseJobUtcDateTimeToLocal(
                job.endDate,
                job.endTime,
              );
              if (!start && !end) return null;
              return (
                <span
                  style={{
                    background: LOGO_TEAL_BG,
                    border: `1px solid ${LOGO_TEAL_BORDER}`,
                    padding: '5px 10px',
                    borderRadius: 5,
                    fontSize: 'var(--font-small)',
                    fontWeight: 600,
                    color: LOGO_TEAL,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <Image
                    src="/clock.svg"
                    alt=""
                    width={14}
                    height={14}
                    style={{ flexShrink: 0, objectFit: 'contain' }}
                  />
                  {start?.localTime ?? '—'} – {end?.localTime ?? '—'}
                </span>
              );
            })()}
          {job.payPerDay ? (
            <span
              style={{
                background: LOGO_TEAL_BG,
                border: `1px solid ${LOGO_TEAL_BORDER}`,
                padding: '5px 10px',
                borderRadius: 5,
                fontSize: 'var(--font-small)',
                color: LOGO_TEAL,
                fontWeight: 'var(--font-weight-bold)',
              }}
            >
              ${Number(job.payPerDay).toLocaleString()}/day
            </span>
          ) : null}
          {hasMinYearsExperience(job.minYearsExperience) ? (
            <span
              style={{
                background: LOGO_TEAL_BG,
                border: `1px solid ${LOGO_TEAL_BORDER}`,
                padding: '5px 10px',
                borderRadius: 5,
                fontSize: 'var(--font-small)',
                fontWeight: 600,
                color: LOGO_TEAL,
              }}
            >
              Years of Experience{' '}
              {formatMinYearsExperienceValue(job.minYearsExperience)}
            </span>
          ) : null}
          {job.isRural ? (
            <span
              style={{
                background: '#FFF7ED',
                padding: '5px 10px',
                borderRadius: 5,
                fontSize: 'var(--font-small)',
                color: '#9a3412',
              }}
            >
              🌾 Rural
            </span>
          ) : null}
          {job.accommodationProvided ? (
            <span
              style={{
                background: '#EFF6FF',
                padding: '5px 10px',
                borderRadius: 5,
                fontSize: 'var(--font-small)',
                color: '#1e40af',
              }}
            >
              🏠 Accommodation
            </span>
          ) : null}
        </div>

        {job.description?.trim() ? (
          <>
            <h4
              style={{
                fontSize: 'var(--font-heading)',
                fontWeight: 'var(--font-weight-bold)',
                color: '#0f1523',
                marginBottom: 6,
              }}
            >
              About the Job
            </h4>
            <p
              style={{
                fontSize: 'var(--font-body)',
                color: '#5a6478',
                lineHeight: 1.7,
                marginBottom: 14,
                whiteSpace: 'pre-wrap',
              }}
            >
              {job.description.trim()}
            </p>
          </>
        ) : null}

        {(job.requiredCredentials.length > 0 ||
          hasMinYearsExperience(job.minYearsExperience)) && (
          <>
            <h4
              style={{
                fontSize: 'var(--font-heading)',
                fontWeight: 'var(--font-weight-bold)',
                color: '#0f1523',
                marginBottom: 8,
              }}
            >
              Requirements
            </h4>
            {job.requiredCredentials.length > 0 ? (
              <div style={{ marginBottom: 6 }}>
                <div
                  style={{
                    fontSize: 'var(--font-small)',
                    fontWeight: 'var(--font-weight-bold)',
                    color: '#374151',
                    marginBottom: 5,
                  }}
                >
                  Required Credentials
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {job.requiredCredentials.map((s) => (
                    <span
                      key={s}
                      style={{
                        padding: '3px 10px',
                        borderRadius: 20,
                        border: '1px solid #e2e5ee',
                        fontSize: 'var(--font-small)',
                        color: '#374151',
                      }}
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
            {hasMinYearsExperience(job.minYearsExperience) ? (
              <div style={{ marginBottom: 14 }}>
                <div
                  style={{
                    fontSize: 'var(--font-body)',
                    fontWeight: 'var(--font-weight-bold)',
                    color: '#374151',
                    marginBottom: 4,
                  }}
                >
                  Years of Experience
                </div>
                <div style={{ fontSize: 'var(--font-body)', color: '#5a6478' }}>
                  {formatMinYearsExperienceValue(job.minYearsExperience)}
                </div>
              </div>
            ) : null}
          </>
        )}

        {job.keyResponsibilities.length > 0
          ? (() => {
              const grouped = groupKeyResponsibilitiesForDisplay(
                job.keyResponsibilities,
              );
              return (
                <>
                  <h4
                    style={{
                      fontSize: 'var(--font-heading)',
                      fontWeight: 'var(--font-weight-bold)',
                      color: '#0f1523',
                      marginBottom: 6,
                    }}
                  >
                    Key Responsibilities
                  </h4>
                  <div style={{ marginBottom: 14 }}>
                    {grouped.sections.map((section) => (
                      <div key={section.title} style={{ marginBottom: 10 }}>
                        <div
                          style={{
                            fontSize: 'var(--font-body)',
                            fontWeight: 'var(--font-weight-bold)',
                            color: '#374151',
                            marginBottom: 4,
                          }}
                        >
                          {section.title}
                        </div>
                        <ul style={{ paddingLeft: 16, margin: 0 }}>
                          {section.items.map((item) => (
                            <li
                              key={item}
                              style={{
                                fontSize: 'var(--font-body)',
                                color: '#5a6478',
                                lineHeight: 1.7,
                                marginBottom: 3,
                              }}
                            >
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                    {grouped.other.length > 0 ? (
                      <div>
                        <div
                          style={{
                            fontSize: 'var(--font-body)',
                            fontWeight: 'var(--font-weight-bold)',
                            color: '#374151',
                            marginBottom: 4,
                          }}
                        >
                          Other
                        </div>
                        <ul style={{ paddingLeft: 16, margin: 0 }}>
                          {grouped.other.map((item) => (
                            <li
                              key={item}
                              style={{
                                fontSize: 'var(--font-body)',
                                color: '#5a6478',
                                lineHeight: 1.7,
                                marginBottom: 3,
                              }}
                            >
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                </>
              );
            })()
          : null}

        <h4
          style={{
            fontSize: 'var(--font-heading)',
            fontWeight: 'var(--font-weight-bold)',
            color: '#0f1523',
            marginBottom: 8,
          }}
        >
          About{' '}
          {revealHostDetails && job.hostProfile.practiceName ? (
            job.hostProfile.practiceName
          ) : (
            <LockedUntilSignIn>Clinic</LockedUntilSignIn>
          )}
        </h4>
        <div
          style={{
            fontSize: 'var(--font-body)',
            color: '#5a6478',
            lineHeight: 1.8,
            marginBottom: 12,
          }}
        >
          {(!revealHostDetails || job.hostProfile.address) && (
            <>
              <strong
                style={{
                  color: '#374151',
                  fontWeight: 'var(--font-weight-bold)',
                }}
              >
                Location:
              </strong>{' '}
              {revealHostDetails && job.hostProfile.address ? (
                job.hostProfile.address
              ) : (
                <LockedUntilSignIn>Street address</LockedUntilSignIn>
              )}
              <br />
            </>
          )}
          {job.hostProfile.practiceType ? (
            <>
              <strong
                style={{
                  color: '#374151',
                  fontWeight: 'var(--font-weight-bold)',
                }}
              >
                Practice Type:
              </strong>{' '}
              {job.hostProfile.practiceType}
              <br />
            </>
          ) : null}
          {job.hostProfile.emr ? (
            <>
              <strong
                style={{
                  color: '#374151',
                  fontWeight: 'var(--font-weight-bold)',
                }}
              >
                EMR System:
              </strong>{' '}
              {job.hostProfile.emr}
              <br />
            </>
          ) : null}
        </div>

        {job.hostProfile.highlights?.trim() ? (
          <>
            <h4
              style={{
                fontSize: 'var(--font-heading)',
                fontWeight: 'var(--font-weight-bold)',
                color: '#0f1523',
                marginBottom: 6,
              }}
            >
              Clinic description
            </h4>
            <p
              style={{
                fontSize: 'var(--font-body)',
                color: '#5a6478',
                lineHeight: 1.7,
                marginBottom: 14,
                whiteSpace: 'pre-wrap',
              }}
            >
              {job.hostProfile.highlights.trim()}
            </p>
          </>
        ) : null}

        {job.hostProfile.servicesOffered.length > 0 ? (
          <>
            <h4
              style={{
                fontSize: 'var(--font-heading)',
                fontWeight: 'var(--font-weight-bold)',
                color: '#0f1523',
                marginBottom: 7,
              }}
            >
              Amenities
            </h4>
            <div
              style={{
                display: 'flex',
                gap: 6,
                flexWrap: 'wrap',
                marginBottom: 0,
              }}
            >
              {job.hostProfile.servicesOffered.map((a) => (
                <span
                  key={a}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 20,
                    border: '1px solid #e2e5ee',
                    fontSize: 'var(--font-small)',
                    color: '#374151',
                  }}
                >
                  {a}
                </span>
              ))}
            </div>
          </>
        ) : null}
      </div>

      {footer != null ? (
        <div
          style={{
            flexShrink: 0,
            borderTop: '1px solid #e2e5ee',
            padding: '12px 20px 14px',
            background: '#fff',
            boxShadow: '0 -6px 16px rgba(15, 21, 35, 0.06)',
          }}
        >
          {footer}
        </div>
      ) : null}
    </div>
  );
}
