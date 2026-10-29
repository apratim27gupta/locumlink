/** Plain-text and HTML copy for placement feedback emails (no em dashes). */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildPlacementFeedbackRequestEmail(params: {
  locumName: string;
  clinicName: string;
  coverageLabel: string;
  formUrl: string;
  reminder?: boolean;
}): { subject: string; text: string; html: string } {
  const subject = params.reminder
    ? 'Reminder: locum feedback'
    : 'How was your locum experience?';
  const intro = params.reminder
    ? 'This is a friendly reminder to share brief feedback about your recent locum placement.'
    : 'Please take about 2 minutes to share confidential feedback about your recent locum placement.';

  const text = [
    'LocumLink - How Was Your Locum Experience?',
    '',
    intro,
    '',
    `Locum Physician: ${params.locumName}`,
    `Host Clinic: ${params.clinicName}`,
    `Coverage Dates: ${params.coverageLabel}`,
    '',
    'Your feedback stays private within LocumLink. It is not shown as a public rating.',
    '',
    `Complete feedback: ${params.formUrl}`,
  ].join('\n');

  const html = `
<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#1f2937;max-width:560px">
  <h1 style="font-size:20px;margin:0 0 12px;color:#0f1523">LocumLink - How Was Your Locum Experience?</h1>
  <p style="margin:0 0 16px">${escapeHtml(intro)}</p>
  <p style="margin:0 0 6px"><strong>Locum Physician:</strong> ${escapeHtml(params.locumName)}</p>
  <p style="margin:0 0 6px"><strong>Host Clinic:</strong> ${escapeHtml(params.clinicName)}</p>
  <p style="margin:0 0 16px"><strong>Coverage Dates:</strong> ${escapeHtml(params.coverageLabel)}</p>
  <p style="margin:0 0 20px">Your feedback stays private within LocumLink. It is not shown as a public rating.</p>
  <p style="margin:0">
    <a href="${escapeHtml(params.formUrl)}" style="display:inline-block;padding:12px 18px;background:#1C32D2;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600">Complete feedback</a>
  </p>
  <p style="margin:16px 0 0;font-size:13px;color:#6b7280">If the button does not work, open this link:<br>${escapeHtml(params.formUrl)}</p>
</div>`.trim();

  return { subject, text, html };
}
