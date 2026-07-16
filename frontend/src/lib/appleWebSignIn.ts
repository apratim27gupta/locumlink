import { getAppOrigin } from '@/lib/appOrigin';
import { persistAppleNameFromAppleJsUser } from '@/lib/oauthUserNames';
import { getSupabase } from '@/lib/supabaseClient';
import { readErrorMessage } from '@/lib/userFacingError';

const APPLE_SCRIPT_SRC =
  'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';

/** Apple Services ID for Sign in with Apple JS (same as Supabase Apple provider). */
const DEFAULT_APPLE_SERVICES_ID = 'ca.locumlink.web';

const APPLE_ERROR_HINTS: Record<string, string> = {
  popup_closed_by_user: 'Sign-in was cancelled.',
  user_cancelled_authorize: 'Sign-in was cancelled.',
  invalid_request:
    'Apple Sign-In is not configured for this domain. Add this site Return URL in Apple Developer (Services ID ca.locumlink.web).',
  'nonces mismatch':
    'Apple sign-in nonce check failed. Try again; if it persists, contact support.',
};

type AppleJsName = {
  firstName?: string | null;
  middleName?: string | null;
  lastName?: string | null;
};

type AppleJsSignInResponse = {
  authorization: {
    id_token: string;
    code?: string;
    state?: string;
  };
  user?: {
    email?: string | null;
    name?: AppleJsName | null;
  } | null;
};

declare global {
  interface Window {
    AppleID?: {
      auth: {
        init: (config: {
          clientId: string;
          scope: string;
          redirectURI: string;
          usePopup: boolean;
          nonce?: string;
        }) => void;
        signIn: () => Promise<AppleJsSignInResponse>;
      };
    };
  }
}

let scriptLoadPromise: Promise<void> | null = null;

function loadAppleScript(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Apple Sign In must run in the browser.'));
  }
  if (window.AppleID?.auth) return Promise.resolve();
  if (scriptLoadPromise) return scriptLoadPromise;

  scriptLoadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${APPLE_SCRIPT_SRC}"]`,
    );
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener(
        'error',
        () => reject(new Error('Could not load Sign in with Apple.')),
        { once: true },
      );
      return;
    }

    const script = document.createElement('script');
    script.src = APPLE_SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load Sign in with Apple.'));
    document.head.appendChild(script);
  });

  return scriptLoadPromise;
}

function resolveAppleClientId(): string {
  const fromEnv = (process.env.NEXT_PUBLIC_APPLE_CLIENT_ID ?? '').trim();
  return fromEnv || DEFAULT_APPLE_SERVICES_ID;
}

function toAppleSignInError(err: unknown): Error {
  const raw = readErrorMessage(err);
  const code = raw.toLowerCase();
  for (const [key, hint] of Object.entries(APPLE_ERROR_HINTS)) {
    if (code.includes(key)) return new Error(hint);
  }
  if (raw) return new Error(raw);
  return new Error('Sign in with Apple failed.');
}

/**
 * Web Sign in with Apple via Apple JS (popup).
 *
 * OAuth redirect (`signInWithOAuth`) does not include the user's name in Supabase
 * metadata — Apple only returns name through native / Apple JS on first sign-in.
 */
export async function signInWithAppleWeb(): Promise<void> {
  await loadAppleScript();
  if (!window.AppleID?.auth) {
    throw new Error('Sign in with Apple is unavailable.');
  }

  const supabase = getSupabase();
  const redirectURI = `${getAppOrigin()}/auth/callback`;
  const clientId = resolveAppleClientId();

  window.AppleID.auth.init({
    clientId,
    scope: 'name email',
    redirectURI,
    usePopup: true,
  });

  let response: AppleJsSignInResponse;
  try {
    response = await window.AppleID.auth.signIn();
  } catch (err) {
    throw toAppleSignInError(err);
  }

  const idToken = response.authorization?.id_token;
  if (!idToken) {
    throw new Error('Apple did not return a sign-in token.');
  }

  // Omit nonce on both sides — GoTrue compares hex(SHA256) while Apple uses
  // base64url(SHA256) in the id_token (supabase/auth#2378).
  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: idToken,
    access_token: response.authorization.code,
  });
  if (error) throw new Error(error.message);

  await persistAppleNameFromAppleJsUser(response.user);
}
