'use client';
import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { useFirstVisit } from '@/hooks/useFirstVisit';
import { tourSteps } from '@/config/tourSteps';
function resolveTourSteps() {
    return tourSteps.filter((s) => typeof s.element === 'string' &&
        s.element.length > 0 &&
        document.querySelector(s.element));
}
export default function GuidedTour() {
    const { isFirstVisit, markAsSeen } = useFirstVisit();
    const pathname = usePathname();
    const launchedRef = useRef(false);
    const driverRef = useRef<ReturnType<typeof driver> | null>(null);
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
                background: rgba(255,255,255,0.15) !important;
                border: 1px solid rgba(255,255,255,0.3) !important;
                color: #fff !important;
                border-radius: 8px !important;
                padding: 7px 16px !important;
                font-size: 13px !important;
                font-weight: 600 !important;
                font-family: Inter, sans-serif !important;
                cursor: pointer !important;
                transition: background 0.15s !important;
            }
            .driver-popover-next-btn, .driver-popover-done-btn {
                background: rgba(255,255,255,0.25) !important;
            }
            .driver-popover-next-btn:hover, .driver-popover-done-btn:hover {
                background: rgba(255,255,255,0.4) !important;
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
        if (!isFirstVisit || launchedRef.current)
            return;
        const resolved = resolveTourSteps();
        if (resolved.length === 0)
            return;
        launchedRef.current = true;
        try {
            const driverObj = driver({
                showProgress: true,
                allowClose: true,
                onDestroyed: () => {
                    driverRef.current = null;
                    markAsSeen();
                },
                steps: resolved,
            });
            driverRef.current = driverObj;
            driverObj.drive();
        }
        catch {
            launchedRef.current = false;
            return;
        }
        return () => {
            if (driverRef.current) {
                try {
                    driverRef.current.destroy();
                }
                catch {
                }
                driverRef.current = null;
            }
            launchedRef.current = false;
        };
    }, [isFirstVisit, markAsSeen, pathname]);
    return null;
}
