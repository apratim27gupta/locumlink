'use client';

import { useEffect, useState } from 'react';
import DashLayout, { NavIcon } from '@/components/DashLayout';
import { locumApi } from '@/lib/api';
import { useNextPageClientProps } from '@/lib/use-next-page-client-props';
import type { LocumProfile } from '@/types';

const NAV = [
  { label: 'Browse Opportunities', href: '/locum/browse', icon: <NavIcon name="browse" /> },
  { label: 'My Applications', href: '/locum/dashboard', icon: <NavIcon name="postings" /> },
  { label: 'Profile', href: '/locum/profile', icon: <NavIcon name="profile" /> },
  { label: 'Messages', href: '/locum/messages', icon: <NavIcon name="messages" /> },
  { label: 'Resources', href: '/locum/resources', icon: <NavIcon name="resources" /> },
];

export default function LocumResourcesPage(props: {
  params?: Promise<Record<string, string | string[] | undefined>>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  useNextPageClientProps(props);
  const [profile, setProfile] = useState<LocumProfile | null>(null);
  useEffect(() => {
    locumApi
      .getProfile()
      .then((data) => {
        if (data.exists && data.profile) setProfile(data.profile);
      })
      .catch(() => {});
  }, []);

  return (
    <DashLayout
      navItems={NAV}
      activeHref="/locum/resources"
      topbarFirstName={profile?.firstName}
      topbarLastName={profile?.lastName}
    >
      <div style={{ padding: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 8 }}>Resources</h1>
        <p style={{ color: '#64748b' }}>Resource content will appear here.</p>
      </div>
    </DashLayout>
  );
}
