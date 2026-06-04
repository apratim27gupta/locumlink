import type { DriveStep } from 'driver.js';

export const locumTourSteps: DriveStep[] = [
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
        element: '#nav-messages',
        popover: {
            title: 'Messages',
            description: 'Start your conversation here.',
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
        element: '#nav-account-menu',
        popover: {
            title: 'Profile & settings',
            description: 'Open your account menu to update your profile, documents, and settings.',
            side: 'bottom',
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
            title: 'Find your first shift',
            description: 'Start here if you haven’t applied yet.',
            side: 'top',
        },
    },
];

export const hostTourSteps: DriveStep[] = [
    {
        element: '#nav-my-postings',
        popover: {
            title: 'My postings',
            description: 'View and manage your locum shift postings here.',
            side: 'right',
        },
    },
    {
        element: '#nav-messages',
        popover: {
            title: 'Messages',
            description: 'Message locums about your postings.',
            side: 'right',
        },
    },
    {
        element: '#nav-resources',
        popover: {
            title: 'Resources',
            description: 'View helpful resources and program information.',
            side: 'right',
        },
    },
    {
        element: '#nav-account-menu',
        popover: {
            title: 'Profile & settings',
            description: 'Open your account menu to update your clinic profile and settings.',
            side: 'bottom',
        },
    },
    {
        element: '#header-notifications',
        popover: {
            title: 'Notifications',
            description: 'Check applicant updates and alerts here.',
            side: 'bottom',
        },
    },
];

export type TourConfig = {
    storageKey: string;
    entryPaths: readonly string[];
    steps: DriveStep[];
};

export function getTourConfig(pathname: string | null): TourConfig | null {
    if (!pathname) return null;
    if (pathname.startsWith('/host')) {
        return {
            storageKey: 'hasSeenHostTour',
            entryPaths: ['/host/dashboard'],
            steps: hostTourSteps,
        };
    }
    if (pathname.startsWith('/locum')) {
        return {
            storageKey: 'hasSeenLocumTour',
            entryPaths: ['/locum/dashboard', '/locum/browse'],
            steps: locumTourSteps,
        };
    }
    return null;
}

/** @deprecated Use locumTourSteps or getTourConfig instead. */
export const tourSteps = locumTourSteps;
