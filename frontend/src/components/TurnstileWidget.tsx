'use client';

import Script from 'next/script';
import { useCallback, useEffect, useId, useRef, useState } from 'react';

const TURNSTILE_SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          'expired-callback'?: () => void;
          'error-callback'?: () => void;
          theme?: 'light' | 'dark' | 'auto';
        },
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

type TurnstileWidgetProps = {
  onToken: (token: string | null) => void;
  theme?: 'light' | 'dark' | 'auto';
};

export function turnstileSiteKey(): string | null {
  const key = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim();
  return key || null;
}

export function isTurnstileEnabled(): boolean {
  return Boolean(turnstileSiteKey());
}

export default function TurnstileWidget({
  onToken,
  theme = 'light',
}: TurnstileWidgetProps) {
  const siteKey = turnstileSiteKey();
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const reactId = useId();
  const containerId = `turnstile-${reactId.replace(/:/g, '')}`;

  const clearWidget = useCallback(() => {
    if (widgetIdRef.current && window.turnstile) {
      try {
        window.turnstile.remove(widgetIdRef.current);
      } catch {
        // ignore
      }
      widgetIdRef.current = null;
    }
  }, []);

  const renderWidget = useCallback(() => {
    if (!siteKey || !scriptReady || !containerRef.current || !window.turnstile) {
      return;
    }
    clearWidget();
    onToken(null);
    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      theme,
      callback: (token) => onToken(token),
      'expired-callback': () => onToken(null),
      'error-callback': () => onToken(null),
    });
  }, [clearWidget, onToken, scriptReady, siteKey, theme]);

  useEffect(() => {
    if (!siteKey) {
      onToken(null);
      return;
    }
    renderWidget();
    return () => {
      clearWidget();
    };
  }, [clearWidget, onToken, renderWidget, siteKey]);

  if (!siteKey) return null;

  return (
    <>
      <Script
        src={TURNSTILE_SCRIPT}
        strategy="afterInteractive"
        onLoad={() => setScriptReady(true)}
      />
      <div id={containerId} ref={containerRef} style={{ minHeight: 65 }} />
    </>
  );
}

export function resetTurnstileWidget(widgetId?: string) {
  window.turnstile?.reset(widgetId);
}
