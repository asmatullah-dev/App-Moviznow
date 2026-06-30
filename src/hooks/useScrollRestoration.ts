import { useEffect, useRef } from 'react';

// In-memory store that resets on page refresh but persists across React Router navigations (SPA)
export const globalScrollState = new Map<string, number>();

export function useScrollRestoration<T extends HTMLElement>(key: string, isWindow: boolean = false, ready: boolean = true) {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (!ready) return;

    // Restore scroll position
    const savedPosition = globalScrollState.get(key) ?? 0;
    
    const restore = () => {
      if (isWindow) {
        window.scrollTo({ top: savedPosition, behavior: 'instant' } as any);
      } else if (ref.current) {
        if (ref.current.scrollWidth >= savedPosition) {
          ref.current.scrollLeft = savedPosition;
        }
      }
    };

    // Try once immediately (if ready is already true)
    restore();
    
    // And again after a short delay to account for layout shifts
    const timer = setTimeout(restore, 100);
    return () => clearTimeout(timer);
  }, [key, isWindow, ready]);

  useEffect(() => {
    let timeoutId: any;
    const handleScroll = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        if (isWindow) {
          globalScrollState.set(key, window.scrollY);
        } else if (ref.current) {
          globalScrollState.set(key, ref.current.scrollLeft);
        }
      }, 100);
    };

    const target = isWindow ? window : ref.current;
    if (target) {
      target.addEventListener('scroll', handleScroll, { passive: true });
    }
    
    return () => {
      if (target) {
        target.removeEventListener('scroll', handleScroll);
      }
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [key, isWindow]);

  return ref;
}
