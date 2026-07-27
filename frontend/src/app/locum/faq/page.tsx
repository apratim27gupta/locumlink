'use client';

import { useEffect, useState } from 'react';
import DashLayout, { NavIcon } from '@/components/DashLayout';
import FaqAccordion from '@/components/FaqAccordion';
import { locumApi } from '@/lib/api';
import { useNextPageClientProps } from '@/lib/use-next-page-client-props';
import type { LocumProfile } from '@/types';

const NAV = [
  { label: 'Browse Opportunities', href: '/locum/browse', icon: <NavIcon name="browse" /> },
  { label: 'My Applications', href: '/locum/dashboard', icon: <NavIcon name="postings" /> },
  { label: 'Profile', href: '/locum/profile', icon: <NavIcon name="profile" /> },
  { label: 'Messages', href: '/locum/messages', icon: <NavIcon name="messages" /> },
  { label: 'Resources', href: '/locum/resources', icon: <NavIcon name="resources" /> },
  { label: 'FAQs', href: '/locum/faq', icon: <NavIcon name="faq" /> },
  { label: 'Settings', href: '/locum/settings', icon: <NavIcon name="settings" /> },
];

export default function LocumFaqPage(props: {
  params?: Promise<Record<string, string | string[] | undefined>>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  useNextPageClientProps(props);
  const [profile, setProfile] = useState<LocumProfile | null>(null);

  useEffect(() => {
    void locumApi
      .getProfile()
      .then((p) => setProfile(p))
      .catch(() => setProfile(null));
  }, []);

  return (
    <DashLayout
      navItems={NAV}
      activeHref="/locum/faq"
      topbarFirstName={profile?.firstName}
      topbarLastName={profile?.lastName}
    >
      <FaqAccordion />
    </DashLayout>
  );
}
