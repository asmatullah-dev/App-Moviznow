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
    if (next && navigator.vibrate) {
      navigator.vibrate(50);
    }
  }, [enabled]);

  const vibrate = useCallback((pattern: number | number[] = 50) => {
    if (enabled && navigator.vibrate) {
      // Small delay helps avoid blocking main thread on some devices
      setTimeout(() => navigator.vibrate(pattern), 0);
    }
  }, [enabled]);

  return { enabled, toggleHaptics, vibrate };
}

export function useGlobalButtonHaptics() {
  const { enabled, vibrate } = useHaptics();

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (!enabled) return;
      const target = e.target as HTMLElement;
      // Vibrate for any button or link click
      if (target.closest('button') || target.closest('a')) {
        vibrate(10); // Lighter vibration for general clicks
      }
    };
    
    document.addEventListener('click', handleClick, { passive: true });
    return () => document.removeEventListener('click', handleClick);
  }, [enabled, vibrate]);
}
