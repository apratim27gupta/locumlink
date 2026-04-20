'use client';
import Joyride, { CallBackProps, STATUS } from 'react-joyride';
import { useFirstVisit } from '@/hooks/useFirstVisit';
import { tourSteps } from '@/config/tourSteps';

export default function GuidedTour() {
  const { isFirstVisit, markAsSeen } = useFirstVisit();

  const handleCallback = (data: CallBackProps) => {
    const { status } = data;
    if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
      markAsSeen();
    }
  };

  return (
    <Joyride
      steps={tourSteps}
      run={isFirstVisit}
      continuous
      showSkipButton
      showProgress
      callback={handleCallback}
      styles={{
        options: {
          primaryColor: '#4F46E5',
        },
      }}
    />
  );
}
