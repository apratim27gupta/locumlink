import { useState, useEffect } from 'react';

export function useFirstVisit(key = 'hasSeenTour') {
  const [isFirstVisit, setIsFirstVisit] = useState(false);

  useEffect(() => {
    const seen = localStorage.getItem(key);
    if (!seen) setIsFirstVisit(true);
  }, [key]);

  const markAsSeen = () => {
    localStorage.setItem(key, 'true');
    setIsFirstVisit(false);
  };

  return { isFirstVisit, markAsSeen };
}
