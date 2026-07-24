'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { getAppStoreUrl } from '@/lib/appStore';
import { isNativeShell } from '@/lib/nativeShell';

const APP_STORE_BADGE_SRC =
  '/Download_on_the_App_Store_Badge_US-UK_RGB_blk_092917.svg';

const NATIVE_SHELL_EVENT = 'll-native-shell-update';

type Variant = 'landing-nav' | 'dashboard';

export default function AppStoreInstallButton({
  variant = 'landing-nav',
  className = '',
}: {
  variant?: Variant;
  className?: string;
}) {
  /** null = not checked yet (avoid flashing the badge inside the native app). */
  const [inNativeApp, setInNativeApp] = useState<boolean | null>(null);

  useEffect(() => {
    const sync = () => setInNativeApp(isNativeShell());
    sync();
    window.addEventListener(NATIVE_SHELL_EVENT, sync);
    // Late inject of __LOCUMLINK_NATIVE__ / push token update
    const t1 = window.setTimeout(sync, 150);
    const t2 = window.setTimeout(sync, 600);
    return () => {
      window.removeEventListener(NATIVE_SHELL_EVENT, sync);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, []);

  // Hide until we know we're not in the native shell; always hide in-app.
  if (inNativeApp !== false) return null;

  const href = getAppStoreUrl();
  const classes =
    variant === 'dashboard'
      ? `btn-app-store btn-app-store--dashboard ${className}`.trim()
      : `btn-app-store btn-app-store--nav ${className}`.trim();

  return (
    <a
      href={href}
      className={classes}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Download on the App Store"
    >
      <Image
        src={APP_STORE_BADGE_SRC}
        alt="Download on the App Store"
        width={120}
        height={40}
        className="btn-app-store__badge"
        unoptimized
        priority={variant === 'landing-nav'}
      />
    </a>
  );
}
