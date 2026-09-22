import { Suspense } from 'react';
import HostInvoicesPage from './host-invoices-page';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <HostInvoicesPage />
    </Suspense>
  );
}
