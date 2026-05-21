type Listener = (active: boolean) => void;
type ProgressListener = (percent: number, active: boolean) => void;

const listeners: Listener[] = [];
const progressListeners: ProgressListener[] = [];

let depth = 0;
let progressPercent = 0;
let progressInterval: ReturnType<typeof setInterval> | null = null;
let progressCompleteTimeout: ReturnType<typeof setTimeout> | null = null;
let progressResetTimeout: ReturnType<typeof setTimeout> | null = null;

function clearProgressTimers(): void {
    if (progressInterval != null) {
        clearInterval(progressInterval);
        progressInterval = null;
    }
    if (progressCompleteTimeout != null) {
        clearTimeout(progressCompleteTimeout);
        progressCompleteTimeout = null;
    }
    if (progressResetTimeout != null) {
        clearTimeout(progressResetTimeout);
        progressResetTimeout = null;
    }
}

function emitActive(): void {
    const active = depth > 0;
    listeners.forEach((fn) => fn(active));
}

function emitProgress(): void {
    const active = depth > 0;
    progressListeners.forEach((fn) => fn(progressPercent, active));
}

function startProgressAnimation(): void {
    clearProgressTimers();
    progressPercent = 10;
    emitProgress();
    progressInterval = setInterval(() => {
        progressPercent = (() => {
            const w = progressPercent;
            if (w >= 85) {
                if (progressInterval != null) {
                    clearInterval(progressInterval);
                    progressInterval = null;
                }
                return 85;
            }
            const step = w < 30 ? 8 : w < 60 ? 4 : w < 80 ? 1.5 : 0.5;
            return Math.min(w + step, 85);
        })();
        emitProgress();
    }, 200);
}

function finishProgressAnimation(): void {
    clearProgressTimers();
    progressPercent = 100;
    emitProgress();
    progressCompleteTimeout = setTimeout(() => {
        progressResetTimeout = setTimeout(() => {
            progressPercent = 0;
            emitProgress();
            progressResetTimeout = null;
        }, 400);
        progressCompleteTimeout = null;
    }, 200);
}

export function startLoader(): void {
    if (typeof window === 'undefined')
        return;
    const wasIdle = depth === 0;
    depth += 1;
    if (wasIdle) {
        emitActive();
        startProgressAnimation();
    }
}

export function stopLoader(): void {
    if (typeof window === 'undefined')
        return;
    depth = Math.max(0, depth - 1);
    if (depth === 0) {
        emitActive();
        finishProgressAnimation();
    }
}

export function subscribeTopLoader(listener: Listener): () => void {
    if (typeof window === 'undefined')
        return () => { };
    listeners.push(listener);
    listener(depth > 0);
    return () => {
        const i = listeners.indexOf(listener);
        if (i > -1)
            listeners.splice(i, 1);
    };
}

export function subscribeTopLoaderProgress(listener: ProgressListener): () => void {
    if (typeof window === 'undefined')
        return () => { };
    progressListeners.push(listener);
    listener(progressPercent, depth > 0);
    return () => {
        const i = progressListeners.indexOf(listener);
        if (i > -1)
            progressListeners.splice(i, 1);
    };
}

export function beforeClientNavigation(href: string): void {
    if (typeof window === 'undefined')
        return;
    try {
        const next = new URL(href, window.location.origin);
        const cur = new URL(window.location.href);
        if (next.pathname === cur.pathname && next.search === cur.search)
            return;
    }
    catch {
    }
    startLoader();
}
