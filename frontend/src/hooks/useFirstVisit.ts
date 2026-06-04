import { useState, useEffect, useCallback } from 'react';

function readTourSeen(key: string) {
    if (localStorage.getItem(key)) return true;
    if (key === 'hasSeenLocumTour' && localStorage.getItem('hasSeenTour')) return true;
    return false;
}

export function useFirstVisit(key = 'hasSeenTour') {
    const [isFirstVisit, setIsFirstVisit] = useState(false);
    useEffect(() => {
        if (!readTourSeen(key))
            setIsFirstVisit(true);
    }, [key]);
    const markAsSeen = useCallback(() => {
        localStorage.setItem(key, 'true');
        setIsFirstVisit(false);
    }, [key]);
    return { isFirstVisit, markAsSeen };
}
