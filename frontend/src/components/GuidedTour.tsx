'use client';
import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { useFirstVisit } from '@/hooks/useFirstVisit';
import { getTourConfig, type TourConfig } from '@/config/tourSteps';
import type { DriveStep } from 'driver.js';

const TOUR_POLL_MS = 200;
const TOUR_WAIT_MS = 20000;

function resolveTourSteps(steps: DriveStep[]) {
    return steps.filter(
        (s) =>
            typeof s.element === 'string'
            && s.element.length > 0
            && document.querySelector(s.element),
    );
}

export default function GuidedTour() {
    const pathname = usePathname();
    const tourConfig = getTourConfig(pathname);
    const storageKey = tourConfig?.storageKey ?? 'hasSeenTour';
    const tourConfigRef = useRef<TourConfig | null>(tourConfig);
    const { isFirstVisit, isLoading, markAsSeen } = useFirstVisit(storageKey);
    const launchedRef = useRef(false);
    const driverRef = useRef<ReturnType<typeof driver> | null>(null);
    const markedSeenRef = useRef(false);

    useEffect(() => {
        tourConfigRef.current = getTourConfig(pathname);
    }, [pathname]);

    useEffect(() => {
        launchedRef.current = false;
        markedSeenRef.current = false;
    }, [storageKey]);

    useEffect(() => {
        const style = document.createElement('style');
        style.id = 'guided-tour-custom';
        style.textContent = `
            .driver-popover {
                background: linear-gradient(135deg, #0f1f6e 0%, #1C32D2 60%, #2AA8A8 100%) !important;
                border: none !important;
                border-radius: 14px !important;
                box-shadow: 0 8px 40px rgba(28,50,210,0.35) !important;
                padding: 22px 24px !important;
                min-width: 280px !important;
                font-family: Inter, sans-serif !important;
            }
            .driver-popover-title {
                color: #fff !important;
                font-size: 16px !important;
                font-weight: 700 !important;
                font-family: Inter, sans-serif !important;
                margin-bottom: 6px !important;
            }
            .driver-popover-description {
                color: rgba(255,255,255,0.85) !important;
                font-size: 13px !important;
                font-family: Inter, sans-serif !important;
                line-height: 1.55 !important;
            }
            .driver-popover-progress-text {
                color: rgba(255,255,255,0.6) !important;
                font-size: 11px !important;
                font-family: Inter, sans-serif !important;
            }
            .driver-popover-footer {
                margin-top: 16px !important;
                gap: 8px !important;
            }
            .driver-popover-prev-btn, .driver-popover-next-btn, .driver-popover-close-btn, .driver-popover-done-btn {
                background: rgba(255,255,255,0.18) !important;
                border: 1.5px solid rgba(255,255,255,0.55) !important;
                color: #fff !important;
                border-radius: 8px !important;
                padding: 7px 18px !important;
                font-size: 13px !important;
                font-weight: 600 !important;
                font-family: Inter, sans-serif !important;
                cursor: pointer !important;
                transition: background 0.15s !important;
                letter-spacing: 0.01em !important;
                text-shadow: none !important;
                box-shadow: none !important;
                outline: none !important;
                will-change: auto !important;
            }
            .driver-popover-next-btn:hover, .driver-popover-done-btn:hover,
            .driver-popover-prev-btn:hover {
                background: rgba(255,255,255,0.28) !important;
            }
            .driver-popover-next-btn, .driver-popover-done-btn {
                background: #2a44e0 !important;
            }
            .driver-popover-next-btn:hover, .driver-popover-done-btn:hover {
                background: #3d5af1 !important;
            }
            .driver-popover-arrow-side-left .driver-popover-arrow { border-right-color: #1C32D2 !important; }
            .driver-popover-arrow-side-right .driver-popover-arrow { border-left-color: #1C32D2 !important; }
            .driver-popover-arrow-side-top .driver-popover-arrow { border-bottom-color: #1C32D2 !important; }
            .driver-popover-arrow-side-bottom .driver-popover-arrow { border-top-color: #1C32D2 !important; }
            .driver-overlay { background: rgba(10,15,50,0.7) !important; }
        `;
        if (!document.getElementById('guided-tour-custom')) {
            document.head.appendChild(style);
        }
        return () => { document.getElementById('guided-tour-custom')?.remove(); };
    }, []);

    useEffect(() => {
        const config = tourConfigRef.current;
        if (!config || isLoading || !isFirstVisit || launchedRef.current) return;
        if (!config.entryPaths.includes(pathname)) return;

        let cancelled = false;
        const startedAt = Date.now();

        function markSeenOnce() {
            if (markedSeenRef.current) return;
            markedSeenRef.current = true;
            markAsSeen();
        }

        function launchTour(resolved: DriveStep[]) {
            if (cancelled || launchedRef.current || resolved.length === 0) return;

            launchedRef.current = true;
            try {
                const driverObj = driver({
                    showProgress: true,
                    allowClose: true,
                    onHighlightStarted: () => {
                        markSeenOnce();
                    },
                    onDestroyed: () => {
                        driverRef.current = null;
                        markSeenOnce();
                    },
                    steps: resolved,
                });
                driverRef.current = driverObj;
                driverObj.drive();
            } catch {
                launchedRef.current = false;
            }
        }

        function pollForElements() {
            if (cancelled || launchedRef.current) return;

            const resolved = resolveTourSteps(config.steps);
            if (resolved.length > 0) {
                launchTour(resolved);
                return;
            }

            if (Date.now() - startedAt >= TOUR_WAIT_MS) return;
            window.setTimeout(pollForElements, TOUR_POLL_MS);
        }

        pollForElements();

        return () => {
            cancelled = true;
            if (driverRef.current) {
                try {
                    driverRef.current.destroy();
                } catch {
                    /* ignore */
                }
                driverRef.current = null;
            }
        };
    }, [isFirstVisit, isLoading, markAsSeen, pathname]);

    return null;
}
