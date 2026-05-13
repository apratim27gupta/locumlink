import type { DriveStep } from 'driver.js';
export const tourSteps: DriveStep[] = [
    {
        element: '#nav-browse-opportunities',
        popover: {
            title: 'Browse opportunities',
            description: 'Browse and view available locum opportunities.',
            side: 'right',
        },
    },
    {
        element: '#nav-my-applications',
        popover: {
            title: 'My applications',
            description: 'Track your applications and their status.',
            side: 'right',
        },
    },
    {
        element: '#nav-profile',
        popover: {
            title: 'Profile',
            description: 'Update your profile and required documents.',
            side: 'right',
        },
    },
    {
        element: '#nav-messages',
        popover: {
            title: 'Messages',
            description: 'Chat with clinics about your shifts.',
            side: 'right',
        },
    },
    {
        element: '#nav-resources',
        popover: {
            title: 'Resources',
            description: 'View helpful resources and information.',
            side: 'right',
        },
    },
    {
        element: '#header-notifications',
        popover: {
            title: 'Notifications',
            description: 'Check notifications and unread messages here.',
            side: 'bottom',
        },
    },
    {
        element: '#empty-state-browse-opportunities',
        popover: {
            title: 'Get started',
            description: 'Start here if you haven’t applied yet.',
            side: 'top',
        },
    },
];
