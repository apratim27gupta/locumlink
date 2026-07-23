'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { getAppStoreUrl } from '@/lib/appStore';
import { isNativeShell } from '@/lib/nativeShell';

const APP_STORE_BADGE_SRC =
  '/Download_on_the_App_Store_Badge_US-UK_RGB_blk_092917.svg';

type Variant = 'landing-nav' | 'dashboard';

export default function AppStoreInstallButton({
  variant = 'landing-nav',
  className = '',
}: {
  variant?: Variant;
  className?: string;
}) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (isNativeShell()) setHidden(true);
  }, []);

  if (hidden) return null;

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
