'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Logo from '@/components/Logo';
import {
  hostApi,
  type PlacementFeedbackBasedOn,
  type PlacementFeedbackBookAgain,
  type PlacementFeedbackPayload,
  type PlacementFeedbackRating,
  type PlacementFeedbackSubmitBody,
} from '@/lib/api';
import { useNextPageClientProps } from '@/lib/use-next-page-client-props';

const RATING_OPTIONS: { value: PlacementFeedbackRating; label: string }[] = [
  { value: 'MET', label: 'Met expectations' },
  { value: 'SOME', label: 'Some concerns' },
  { value: 'SIGNIFICANT', label: 'Significant concerns' },
  { value: 'UNABLE', label: 'Unable to assess' },
];

const BOOK_AGAIN_OPTIONS: { value: PlacementFeedbackBookAgain; label: string }[] = [
  { value: 'YES', label: 'Yes' },
  { value: 'MAYBE', label: 'Maybe, with reservations' },
  { value: 'NO', label: 'No' },
];

const BASED_ON_OPTIONS: { value: PlacementFeedbackBasedOn; label: string }[] = [
  { value: 'DIRECT', label: 'Direct observation' },
  { value: 'STAFF', label: 'Feedback from clinic staff' },
  { value: 'BOTH', label: 'Both' },
];

type FormState = {
  professionalism: PlacementFeedbackRating | '';
  communication: PlacementFeedbackRating | '';
  reliability: PlacementFeedbackRating | '';
  documentation: PlacementFeedbackRating | '';
  bookAgain: PlacementFeedbackBookAgain | '';
  basedOn: PlacementFeedbackBasedOn | '';
  comments: string;
};

const EMPTY_FORM: FormState = {
  professionalism: '',
  communication: '',
  reliability: '',
  documentation: '',
  bookAgain: '',
  basedOn: '',
  comments: '',
};

const pageFont = 'Outfit, Inter, system-ui, sans-serif';

function RadioGroup<T extends string>(props: {
  name: string;
  value: T | '';
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {props.options.map((opt) => {
        const id = `${props.name}-${opt.value}`;
        const checked = props.value === opt.value;
        return (
          <label
            key={opt.value}
            htmlFor={id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              cursor: props.disabled ? 'default' : 'pointer',
              fontFamily: pageFont,
              fontSize: 15,
              color: '#0B0F1F',
              padding: '10px 12px',
              borderRadius: 8,
              border: checked ? '1px solid #1C32D2' : '1px solid #E5E7EB',
              background: checked ? '#F5F7FF' : '#fff',
            }}
          >
            <input
              id={id}
              type="radio"
              name={props.name}
              value={opt.value}
              checked={checked}
              disabled={props.disabled}
              onChange={() => props.onChange(opt.value)}
              style={{ width: 16, height: 16, accentColor: '#1C32D2' }}
            />
            {opt.label}
          </label>
        );
      })}
    </div>
  );
}

function QuestionBlock(props: {
  number: number;
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section style={{ padding: '22px 0', borderBottom: '1px solid #E8EAF0' }}>
      <h2
        style={{
          margin: '0 0 6px',
          fontFamily: pageFont,
          fontSize: 17,
          fontWeight: 650,
          color: '#0F2A7A',
        }}
      >
        {props.number}. {props.title}
      </h2>
      {props.hint ? (
        <p
          style={{
            margin: '0 0 14px',
            fontFamily: pageFont,
            fontSize: 14,
            color: '#5B6475',
            lineHeight: 1.5,
          }}
        >
          {props.hint}
        </p>
      ) : (
        <div style={{ height: 12 }} />
      )}
      {props.children}
    </section>
  );
}

function friendlyLoadError(err: unknown, hasToken: boolean): string {
  const raw = err instanceof Error ? err.message : String(err ?? '');
  if (/unauthorized|401|invalid|expired/i.test(raw)) {
    return hasToken
      ? 'This feedback link is invalid or no longer works. Use the latest link from your LocumLink email.'
      : 'Open the Complete feedback button from your LocumLink email to load this form.';
  }
  if (/sample-preview|not found|404/i.test(raw)) {
    return 'This feedback link is not available. Open the link from your LocumLink email or notification after a placement ends.';
  }
  if (/server error|DATABASE|migration|API is running/i.test(raw)) {
    return 'We could not load this feedback form right now. Please try again in a few minutes.';
  }
  return raw || 'Unable to load feedback form.';
}

export default function HostPlacementFeedbackPage(props: {
  params?: Promise<Record<string, string | string[] | undefined>>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  useNextPageClientProps(props);
  const routeParams = useParams();
  const searchParams = useSearchParams();
  const applicationId = useMemo(() => {
    const raw = routeParams?.applicationId;
    return typeof raw === 'string' ? raw : Array.isArray(raw) ? raw[0] : '';
  }, [routeParams]);
  const accessToken = (searchParams.get('t') || '').trim();

  const [payload, setPayload] = useState<PlacementFeedbackPayload | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!applicationId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    if (!accessToken) {
      setError(
        'Open the Complete feedback button from your LocumLink email to load this form.',
      );
      setLoading(false);
      return;
    }
    void hostApi
      .getPlacementFeedback(applicationId, accessToken)
      .then((data) => {
        if (cancelled) return;
        setPayload(data);
        if (data.answers) {
          setForm({
            professionalism: data.answers.professionalism,
            communication: data.answers.communication,
            reliability: data.answers.reliability,
            documentation: data.answers.documentation,
            bookAgain: data.answers.bookAgain,
            basedOn: data.answers.basedOn,
            comments: data.answers.comments ?? '',
          });
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(friendlyLoadError(err, Boolean(accessToken)));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [applicationId, accessToken]);

  const submitted = payload?.status === 'SUBMITTED';

  async function onSubmit() {
    if (!applicationId || !accessToken || submitted) return;
    const required: (keyof FormState)[] = [
      'professionalism',
      'communication',
      'reliability',
      'documentation',
      'bookAgain',
      'basedOn',
    ];
    for (const key of required) {
      if (!form[key]) {
        setError('Please answer all required questions before submitting.');
        return;
      }
    }
    setSubmitting(true);
    setError(null);
    try {
      const body: PlacementFeedbackSubmitBody = {
        professionalism: form.professionalism as PlacementFeedbackRating,
        communication: form.communication as PlacementFeedbackRating,
        reliability: form.reliability as PlacementFeedbackRating,
        documentation: form.documentation as PlacementFeedbackRating,
        bookAgain: form.bookAgain as PlacementFeedbackBookAgain,
        basedOn: form.basedOn as PlacementFeedbackBasedOn,
        comments: form.comments.trim() || undefined,
      };
      const next = await hostApi.submitPlacementFeedback(
        applicationId,
        body,
        accessToken,
      );
      setPayload(next);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to submit feedback.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="public-page-root"
      style={{
        background:
          'linear-gradient(180deg, #EEF2FF 0%, #F7F8FC 28%, #F7F8FC 100%)',
        fontFamily: pageFont,
        color: '#0B0F1F',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 640,
          margin: '0 auto',
          padding: '28px 20px 56px',
          boxSizing: 'border-box',
        }}
      >
        <header style={{ marginBottom: 16 }}>
          <Logo size="md" />
        </header>

        <div
          style={{
            background: '#fff',
            border: '1px solid #E5E8F0',
            borderRadius: 16,
            padding: '28px 24px 32px',
            boxShadow: '0 10px 30px rgba(15, 42, 122, 0.06)',
          }}
        >
          <p
            style={{
              margin: '0 0 8px',
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: '#38C6C6',
            }}
          >
            Confidential feedback
          </p>
          <h1
            style={{
              margin: '0 0 10px',
              fontSize: 26,
              fontWeight: 800,
              lineHeight: 1.25,
              color: '#0F2A7A',
            }}
          >
            How was your locum experience?
          </h1>
          <p
            style={{
              margin: '0 0 8px',
              fontSize: 15,
              color: '#5B6475',
              lineHeight: 1.55,
            }}
          >
            About 2 minutes. Your answers stay private within LocumLink and are not
            shown as a public rating.
          </p>

          {loading ? (
            <p style={{ marginTop: 28, color: '#6B7280', fontSize: 14 }}>
              Loading feedback form…
            </p>
          ) : error && !payload ? (
            <p
              style={{
                marginTop: 24,
                marginBottom: 0,
                color: '#B91C1C',
                fontSize: 14,
                lineHeight: 1.5,
              }}
            >
              {error}
            </p>
          ) : submitted && payload ? (
            <div
              style={{
                marginTop: 24,
                padding: 20,
                background: '#F0FDF4',
                border: '1px solid #BBF7D0',
                borderRadius: 12,
              }}
            >
              <h2 style={{ margin: '0 0 8px', fontSize: 20, color: '#14532D' }}>
                Thank you
              </h2>
              <p style={{ margin: 0, fontSize: 15, color: '#166534', lineHeight: 1.55 }}>
                Your feedback about {payload.locumName} has been submitted. It stays
                private within LocumLink.
              </p>
            </div>
          ) : payload ? (
            <>
              <div
                style={{
                  marginTop: 20,
                  marginBottom: 4,
                  padding: '14px 16px',
                  background: '#F5F7FB',
                  borderRadius: 10,
                  fontSize: 14,
                  lineHeight: 1.55,
                  color: '#374151',
                }}
              >
                <div>
                  <strong>Locum physician:</strong> {payload.locumName}
                </div>
                <div>
                  <strong>Host clinic:</strong> {payload.clinicName}
                </div>
                <div>
                  <strong>Coverage dates:</strong> {payload.coverageLabel}
                </div>
              </div>

              <QuestionBlock
                number={1}
                title="Professionalism and Respect"
                hint="How would you describe the locum's interactions with administrative staff, nurses and colleagues?"
              >
                <RadioGroup
                  name="professionalism"
                  value={form.professionalism}
                  options={RATING_OPTIONS}
                  onChange={(v) => setForm((f) => ({ ...f, professionalism: v }))}
                />
              </QuestionBlock>

              <QuestionBlock
                number={2}
                title="Communication and Teamwork"
                hint="How effectively did the locum communicate and collaborate with your team?"
              >
                <RadioGroup
                  name="communication"
                  value={form.communication}
                  options={RATING_OPTIONS}
                  onChange={(v) => setForm((f) => ({ ...f, communication: v }))}
                />
              </QuestionBlock>

              <QuestionBlock
                number={3}
                title="Reliability and Punctuality"
                hint="Did the locum attend scheduled shifts and fulfil agreed responsibilities?"
              >
                <RadioGroup
                  name="reliability"
                  value={form.reliability}
                  options={RATING_OPTIONS}
                  onChange={(v) => setForm((f) => ({ ...f, reliability: v }))}
                />
              </QuestionBlock>

              <QuestionBlock
                number={4}
                title="Documentation and Handover"
                hint="Were clinical documentation and handover responsibilities completed appropriately?"
              >
                <RadioGroup
                  name="documentation"
                  value={form.documentation}
                  options={RATING_OPTIONS}
                  onChange={(v) => setForm((f) => ({ ...f, documentation: v }))}
                />
              </QuestionBlock>

              <QuestionBlock number={5} title="Would you book this locum again?">
                <RadioGroup
                  name="bookAgain"
                  value={form.bookAgain}
                  options={BOOK_AGAIN_OPTIONS}
                  onChange={(v) => setForm((f) => ({ ...f, bookAgain: v }))}
                />
              </QuestionBlock>

              <QuestionBlock number={6} title="What is your feedback based on?">
                <RadioGroup
                  name="basedOn"
                  value={form.basedOn}
                  options={BASED_ON_OPTIONS}
                  onChange={(v) => setForm((f) => ({ ...f, basedOn: v }))}
                />
              </QuestionBlock>

              <QuestionBlock
                number={7}
                title="Additional Comments (Optional)"
                hint="Please provide specific examples where possible. Do not include patient-identifying information."
              >
                <textarea
                  value={form.comments}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, comments: e.target.value }))
                  }
                  rows={5}
                  maxLength={4000}
                  placeholder="Optional comments"
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: 12,
                    borderRadius: 8,
                    border: '1px solid #D1D5DB',
                    fontFamily: pageFont,
                    fontSize: 14,
                    resize: 'vertical',
                  }}
                />
              </QuestionBlock>

              {error ? (
                <p style={{ margin: '16px 0 0', color: '#B91C1C', fontSize: 14 }}>
                  {error}
                </p>
              ) : null}

              <button
                type="button"
                disabled={submitting}
                onClick={() => void onSubmit()}
                style={{
                  marginTop: 28,
                  width: '100%',
                  cursor: submitting ? 'default' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '14px 20px',
                  border: 'none',
                  borderRadius: 10,
                  background: submitting
                    ? '#E5E7EB'
                    : 'linear-gradient(270deg,#3A65DB 0%,#0F2A7A 100%)',
                  color: submitting ? '#6B7280' : '#fff',
                  fontWeight: 700,
                  fontSize: 15,
                  fontFamily: pageFont,
                }}
              >
                {submitting ? 'Submitting…' : 'Submit Feedback'}
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
