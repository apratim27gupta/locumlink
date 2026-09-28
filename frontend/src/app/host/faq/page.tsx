'use client';

import { useEffect, useState } from 'react';
import { HOST_DASH_NAV } from '@/lib/hostNav';
import DashLayout from '@/components/DashLayout';
import FaqAccordion from '@/components/FaqAccordion';
import { hostApi } from '@/lib/api';
import { useNextPageClientProps } from '@/lib/use-next-page-client-props';


export default function HostFaqPage(props: {
  params?: Promise<Record<string, string | string[] | undefined>>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  useNextPageClientProps(props);
  const [profile, setProfile] = useState<{
    contactFirstName?: string | null;
    contactLastName?: string | null;
  } | null>(null);

  useEffect(() => {
    void hostApi
      .getProfile()
      .then((p) => setProfile(p))
      .catch(() => setProfile(null));
  }, []);

  return (
    <DashLayout
      navItems={HOST_DASH_NAV}
      activeHref="/host/faq"
      topbarFirstName={profile?.contactFirstName}
      topbarLastName={profile?.contactLastName}
    >
      <FaqAccordion />
    </DashLayout>
  );
}
