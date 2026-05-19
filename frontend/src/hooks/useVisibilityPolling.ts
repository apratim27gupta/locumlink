import { useEffect, useRef } from 'react';

/** Runs `tick` on an interval only while the document tab is visible. */
export function useVisibilityPolling(
    tick: () => void | Promise<void>,
    intervalMs: number,
    enabled = true,
): void {
    const tickRef = useRef(tick);
    tickRef.current = tick;

    useEffect(() => {
        if (!enabled) return;

        let id: ReturnType<typeof setInterval> | null = null;

        const start = () => {
            if (id != null) return;
            id = setInterval(() => {
                void tickRef.current();
            }, intervalMs);
        };

        const stop = () => {
            if (id == null) return;
            clearInterval(id);
            id = null;
        };

        const onVisibility = () => {
            if (document.visibilityState === 'visible') {
                void tickRef.current();
                start();
            } else {
                stop();
            }
        };

        if (document.visibilityState === 'visible') start();
        document.addEventListener('visibilitychange', onVisibility);

        return () => {
            stop();
            document.removeEventListener('visibilitychange', onVisibility);
        };
    }, [enabled, intervalMs]);
}
