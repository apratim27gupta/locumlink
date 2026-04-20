import { Step } from 'react-joyride';

export const tourSteps: Step[] = [
  {
    target: '#nav-browse-opportunities',
    content: 'Browse and view available locum opportunities.',
    disableBeacon: true,
  },
  {
    target: '#nav-my-applications',
    content: 'Track your applications and their status.',
  },
  {
    target: '#nav-profile',
    content: 'Update your profile and required documents.',
  },
  {
    target: '#nav-messages',
    content: 'Chat with clinics about your applications.',
  },
  {
    target: '#nav-resources',
    content: 'View helpful resources and information.',
  },
  {
    target: '#header-notifications',
    content: 'Check notifications and unread messages here.',
  },
  {
    target: '#empty-state-browse-opportunities',
    content: 'Start here if you haven’t applied yet.',
  },
];

