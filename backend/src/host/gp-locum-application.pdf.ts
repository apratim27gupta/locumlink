import { readFileSync } from 'fs';
import { join } from 'path';
import { PDFDocument } from 'pdf-lib';

/** Editable GP Locum Application values for one accepted match. */
export type GpLocumApplicationFields = {
  locumName: string;
  locumCpsns: string;
  locumMsiProviderNumber: string;
  locumMailingAddress: string;
  locumPracticeAddress: string;
  locumPhone: string;
  locumFax: string;
  locumEmail: string;
  /** Locum preferred payment option. */
  preferredPayment: 'guaranteed_daily' | 'fee_for_service' | '';
  hostName: string;
  hostMsiProviderNumber: string;
  hostPracticeAddress: string;
  hostPhone: string;
  hostFax: string;
  hostEmail: string;
  overheadPayee: string;
  primaryRemuneration: 'fee_for_service' | 'contract' | 'other' | '';
  primaryRemunerationOther: string;
  /** e.g. Sep-30-2026, Oct-01-2026 */
  datesWorked: string;
  serviceType: 'office' | 'nursing_home';
  claimsSubmitter: string;
  submitterId: string;
  billingEmail: string;
  billingPhone: string;
  previouslyProvided: 'yes' | 'no' | '';
  additionalInformation: string;
  hostSignatureDate: string;
};

export const EMPTY_GP_LOCUM_APPLICATION_FIELDS: GpLocumApplicationFields = {
  locumName: '',
  locumCpsns: '',
  locumMsiProviderNumber: '',
  locumMailingAddress: '',
  locumPracticeAddress: '',
  locumPhone: '',
  locumFax: '',
  locumEmail: '',
  preferredPayment: '',
  hostName: '',
  hostMsiProviderNumber: '',
  hostPracticeAddress: '',
  hostPhone: '',
  hostFax: '',
  hostEmail: '',
  overheadPayee: '',
  primaryRemuneration: '',
  primaryRemunerationOther: '',
  datesWorked: '',
  serviceType: 'office',
  claimsSubmitter: '',
  submitterId: '',
  billingEmail: '',
  billingPhone: '',
  previouslyProvided: '',
  additionalInformation: '',
  hostSignatureDate: '',
};

function templatePath(): string {
  return join(process.cwd(), 'assets', 'gp-locum-application-form.pdf');
}

function setText(form: ReturnType<PDFDocument['getForm']>, name: string, value: string) {
  try {
    form.getTextField(name).setText(value ?? '');
  } catch {
    // Field missing on template variant — ignore.
  }
}

function checkBox(form: ReturnType<PDFDocument['getForm']>, name: string, on: boolean) {
  try {
    const box = form.getCheckBox(name);
    if (on) box.check();
    else box.uncheck();
  } catch {
    // Field missing on template variant — ignore.
  }
}

/** Format accepted shift dates as MMM-DD-YYYY joined by commas. */
export function formatGpLocumDates(dates: Date[]): string {
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const uniq = [...new Set(dates.map((d) => d.toISOString().slice(0, 10)))].sort();
  return uniq
    .map((iso) => {
      const [y, m, day] = iso.split('-').map(Number);
      return `${months[m - 1]}-${String(day).padStart(2, '0')}-${y}`;
    })
    .join(', ');
}

export function formatPostalAddress(parts: {
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  province?: string | null;
  postalCode?: string | null;
  fallback?: string | null;
}): string {
  const line1 = [parts.address1, parts.address2].filter(Boolean).join(', ').trim();
  const line2 = [parts.city, parts.province, parts.postalCode]
    .filter(Boolean)
    .join(', ')
    .trim();
  const joined = [line1, line2].filter(Boolean).join(', ');
  const fallback = (parts.fallback ?? '').trim();
  if (fallback === 'Address pending') return joined;
  return joined || fallback;
}

export function mergeGpLocumApplicationFields(
  base: GpLocumApplicationFields,
  draft: unknown,
): GpLocumApplicationFields {
  if (!draft || typeof draft !== 'object' || Array.isArray(draft)) return { ...base };
  const d = draft as Record<string, unknown>;
  const out: GpLocumApplicationFields = { ...base };
  for (const key of Object.keys(EMPTY_GP_LOCUM_APPLICATION_FIELDS) as (keyof GpLocumApplicationFields)[]) {
    const v = d[key];
    if (typeof v === 'string') out[key] = v as never;
  }
  if (out.serviceType !== 'office' && out.serviceType !== 'nursing_home') {
    out.serviceType = base.serviceType;
  }
  return out;
}

/**
 * Fills the MSI GP Locum Application AcroForm.
 * Signatures / MSI approval blocks stay blank.
 */
export async function buildGpLocumApplicationPdf(
  input: GpLocumApplicationFields,
): Promise<Buffer> {
  const bytes = readFileSync(templatePath());
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
  const form = pdf.getForm();

  // Locum physician
  setText(form, 'Text Field0', input.locumName);
  setText(form, 'Text Field1', input.locumCpsns);
  setText(form, 'Text Field2', input.locumMsiProviderNumber);
  setText(form, 'Text Field3', input.locumMailingAddress);
  setText(form, 'Text Field33', input.locumPracticeAddress || input.locumMailingAddress);
  setText(form, 'Text Field4', input.locumPhone);
  setText(form, 'Text Field5', input.locumFax);
  // Email: Fax Number1 and Text Field6 overlap — fill only one.
  setText(form, 'Fax Number1', input.locumEmail);
  checkBox(form, 'Check Box0.0.0', input.preferredPayment === 'guaranteed_daily');
  checkBox(form, 'Check Box0.0.1', input.preferredPayment === 'fee_for_service');

  // Host physician
  setText(form, 'Text Field7', input.hostName);
  setText(form, 'Text Field8', input.hostMsiProviderNumber);
  setText(form, 'Text Field9', input.hostPracticeAddress);
  setText(form, 'Text Field10', input.hostPhone);
  setText(form, 'Text Field11', input.hostFax);
  setText(form, 'Text Field12', input.hostEmail);
  setText(form, 'Text Field13', input.overheadPayee);
  checkBox(form, 'Check Box0.1.0', input.primaryRemuneration === 'fee_for_service');
  checkBox(form, 'Check Box0.1.1.0.0', input.primaryRemuneration === 'contract');
  checkBox(form, 'Check Box0.1.1.0.1', input.primaryRemuneration === 'other');
  setText(form, 'Text Field34', input.primaryRemunerationOther);

  // Locum services — dates + Office / Nursing Home only
  setText(form, 'Text Field14', input.datesWorked);
  checkBox(form, 'Check Box0.1.1.1.1.0.0', input.serviceType === 'office');
  checkBox(form, 'Check Box0.1.1.1.0', input.serviceType === 'nursing_home');

  // Billing / additional (named fields; ignore overlapping Text Field25–28 duplicates)
  setText(form, 'Additional Information', input.additionalInformation);
  setText(form, 'Who will be submitting the claims', input.claimsSubmitter);
  setText(form, 'Submitter ID', input.submitterId);
  setText(form, 'Email Address3', input.billingEmail);
  setText(form, 'Phone Number', input.billingPhone);
  checkBox(form, 'No', input.previouslyProvided === 'no');
  checkBox(form, 'Yes', input.previouslyProvided === 'yes');
  setText(form, 'Date', input.hostSignatureDate);

  const out = await pdf.save({ updateFieldAppearances: true });
  return Buffer.from(out);
}
