import { Suspense } from 'react';
import AuthPage from './auth-page';

export default async function Page(props: {
  params: Promise<Record<string, string | string[] | undefined>>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await props.params;
  await props.searchParams;
  return (
    <Suspense>
      <AuthPage />
    </Suspense>
  );
}
