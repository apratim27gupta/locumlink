'use client';

import DashLayout, { NavIcon } from '@/components/DashLayout';
import { useHostProfile } from '@/hooks/useHostProfile';
import { useNextPageClientProps } from '@/lib/use-next-page-client-props';

const NAV = [
  { label: 'My Postings', href: '/host/dashboard', icon: <NavIcon name="postings" /> },
  { label: 'Profile', href: '/host/profile', icon: <NavIcon name="profile" /> },
  { label: 'Messages', href: '/host/messages', icon: <NavIcon name="messages" /> },
  { label: 'Resources', href: '/host/resources', icon: <NavIcon name="resources" /> },
];

export default function HostResourcesPage(props: {
  params?: Promise<Record<string, string | string[] | undefined>>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  useNextPageClientProps(props);
  const { profile } = useHostProfile();
  return (
    <DashLayout
      navItems={NAV}
      activeHref="/host/resources"
      topbarFirstName={profile?.contactFirstName}
      topbarLastName={profile?.contactLastName}
    >
      <div style={{ padding: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 8 }}>Resources</h1>
        <p style={{ color: '#64748b' }}>Resource content will appear here.</p>
      </div>
    </DashLayout>
  );
}
