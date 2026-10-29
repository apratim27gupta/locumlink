import { Suspense } from 'react';
import HostPlacementFeedbackPage from './host-placement-feedback-page';

export default function Page() {
  return (
    <Suspense fallback={null}>
      <HostPlacementFeedbackPage />
    </Suspense>
  );
}
