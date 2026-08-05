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
        if (savedPosition > 0) {
          window.scrollTo({ top: savedPosition, behavior: 'instant' } as any);
        }
      } else if (ref.current) {
        if (savedPosition > 0 && ref.current.scrollWidth >= savedPosition) {
          ref.current.scrollLeft = savedPosition;
        }
      }
    };

    restore();
    const id = requestAnimationFrame(restore);
    return () => cancelAnimationFrame(id);
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
