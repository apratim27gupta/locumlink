import { redirect } from 'next/navigation';

export default function HostPostJobRedirect() {
  // Keep only the dashboard overlay posting experience.
  redirect('/host/dashboard?postJob=1');
}
