import { useCallback, useState, useEffect } from 'react';
import { safeStorage } from '../utils/safeStorage';

export function useHaptics() {
  const [enabled, setEnabled] = useState(() => {
    return safeStorage.getItem('haptics_enabled') !== 'false';
  });

  useEffect(() => {
    const handleStorageChange = () => {
      setEnabled(safeStorage.getItem('haptics_enabled') !== 'false');
    };
    window.addEventListener('haptics_changed', handleStorageChange);
    return () => window.removeEventListener('haptics_changed', handleStorageChange);
  }, []);

  const toggleHaptics = useCallback(() => {
    const next = !enabled;
    safeStorage.setItem('haptics_enabled', String(next));
    setEnabled(next);
    window.dispatchEvent(new Event('haptics_changed'));
    if (next && typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
      window.navigator.vibrate(50);
    }
  }, [enabled]);

  const vibrate = useCallback((pattern: number | number[] = 50) => {
    if (enabled && typeof window !== 'undefined' && window.navigator && 'vibrate' in window.navigator) {
      try {
        window.navigator.vibrate(pattern);
      } catch (e) {
        console.error('Vibration error:', e);
      }
    }
  }, [enabled]);

  return { enabled, toggleHaptics, vibrate };
}

export function useGlobalButtonHaptics() {
  const { enabled, vibrate } = useHaptics();

  useEffect(() => {
    const handleTouchOrClick = (e: Event) => {
      if (!enabled || !window.navigator.vibrate) return;
      const target = e.target as HTMLElement;
      if (target.closest('button') || target.closest('a') || target.closest('[role="button"]')) {
        try {
          window.navigator.vibrate(30);
        } catch (err) {}
      }
    };
    
    // Chrome on Android requires explicit user activation (like a click or touchstart)
    // Using click or pointerup ensures we have the proper activation state.
    document.addEventListener('click', handleTouchOrClick, { passive: true, capture: true });
    return () => document.removeEventListener('click', handleTouchOrClick, { capture: true });
  }, [enabled]);
}
