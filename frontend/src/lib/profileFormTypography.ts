import type { CSSProperties } from 'react';

/** Title-case display for profile form copy (labels, headings, placeholders). */
export const profileTextCapitalize: CSSProperties = {
    textTransform: 'capitalize',
};

export const PROFILE_FORM_CAPITALIZE_CLASS = 'profile-form-capitalize';

export const PROFILE_FORM_CAPITALIZE_CSS = `
.${PROFILE_FORM_CAPITALIZE_CLASS} label,
.${PROFILE_FORM_CAPITALIZE_CLASS} h1,
.${PROFILE_FORM_CAPITALIZE_CLASS} .profile-heading,
.${PROFILE_FORM_CAPITALIZE_CLASS} .profile-step-label,
.${PROFILE_FORM_CAPITALIZE_CLASS} .profile-form-hint,
.${PROFILE_FORM_CAPITALIZE_CLASS} select,
.${PROFILE_FORM_CAPITALIZE_CLASS} option {
  text-transform: capitalize;
}
.${PROFILE_FORM_CAPITALIZE_CLASS} input::placeholder,
.${PROFILE_FORM_CAPITALIZE_CLASS} textarea::placeholder {
  text-transform: capitalize;
}
.${PROFILE_FORM_CAPITALIZE_CLASS} .locum-section-header span,
.${PROFILE_FORM_CAPITALIZE_CLASS} button {
  text-transform: capitalize;
}
`;
