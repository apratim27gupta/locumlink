'use client';

import { useEffect, useState } from 'react';
import DashLayout, { NavIcon } from '@/components/DashLayout';
import FaqAccordion from '@/components/FaqAccordion';
import { hostApi } from '@/lib/api';
import { useNextPageClientProps } from '@/lib/use-next-page-client-props';

const NAV = [
  { label: 'My Postings', href: '/host/dashboard', icon: <NavIcon name="postings" /> },
  { label: 'Profile', href: '/host/profile', icon: <NavIcon name="profile" /> },
  { label: 'Messages', href: '/host/messages', icon: <NavIcon name="messages" /> },
  { label: 'Resources', href: '/host/resources', icon: <NavIcon name="resources" /> },
  { label: 'FAQs', href: '/host/faq', icon: <NavIcon name="faq" /> },
  { label: 'Settings', href: '/host/settings', icon: <NavIcon name="settings" /> },
];

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
      navItems={NAV}
      activeHref="/host/faq"
      topbarFirstName={profile?.contactFirstName}
      topbarLastName={profile?.contactLastName}
    >
      <FaqAccordion />
    </DashLayout>
  );
}
