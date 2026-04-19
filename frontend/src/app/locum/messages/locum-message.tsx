'use client';

import MessagesPage from '@/components/MessagesPage';
import { useNextPageClientProps } from '@/lib/use-next-page-client-props';

export default function LocumMessagesPage(props: {
  params?: Promise<Record<string, string | string[] | undefined>>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  useNextPageClientProps(props);
  return <MessagesPage role="locum" />;
}