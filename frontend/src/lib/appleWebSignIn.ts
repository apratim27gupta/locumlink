import type { SupabaseClient } from '@supabase/supabase-js';
import { getAppOrigin } from '@/lib/appOrigin';
import { persistAppleNameFromAppleJsUser } from '@/lib/oauthUserNames';
import { getSupabase } from '@/lib/supabaseClient';

const APPLE_SCRIPT_SRC =
  'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';

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
          nonce: string;
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

/** Resolve Apple Services ID from env or the Supabase OAuth authorize URL. */
async function resolveAppleClientId(
  supabase: SupabaseClient,
  redirectTo: string,
): Promise<string> {
  const fromEnv = (process.env.NEXT_PUBLIC_APPLE_CLIENT_ID ?? '').trim();
  if (fromEnv) return fromEnv;

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'apple',
    options: {
      redirectTo,
      skipBrowserRedirect: true,
      scopes: 'name email',
    },
  });
  if (error) throw new Error(error.message);

  const authUrl = data?.url;
  if (!authUrl) {
    throw new Error('Could not start Sign in with Apple.');
  }

  const clientId = new URL(authUrl).searchParams.get('client_id')?.trim();
  if (!clientId) {
    throw new Error('Could not resolve Apple client ID.');
  }
  return clientId;
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
  const clientId = await resolveAppleClientId(supabase, redirectURI);
  const nonce = crypto.randomUUID();

  window.AppleID.auth.init({
    clientId,
    scope: 'name email',
    redirectURI,
    usePopup: true,
    nonce,
  });

  const response = await window.AppleID.auth.signIn();
  const idToken = response.authorization?.id_token;
  if (!idToken) {
    throw new Error('Apple did not return a sign-in token.');
  }

  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: idToken,
    nonce,
  });
  if (error) throw new Error(error.message);

  await persistAppleNameFromAppleJsUser(response.user);
}
