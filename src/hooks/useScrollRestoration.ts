import { useEffect, useRef } from 'react';

// In-memory store that resets on page refresh but persists across React Router navigations (SPA)
export const globalScrollState = new Map<string, number>();

export function useScrollRestoration<T extends HTMLElement>(key: string, isWindow: boolean = false, ready: boolean = true) {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (!ready) return;

    // Restore scroll position
    const savedPosition = globalScrollState.get(key) ?? Number(sessionStorage.getItem(key) || 0);
    
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
    let rafId: number | null = null;
    const handleScroll = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        if (isWindow) {
          globalScrollState.set(key, window.scrollY);
        } else if (ref.current) {
          globalScrollState.set(key, ref.current.scrollLeft);
        }
      });
    };

    const target = isWindow ? window : ref.current;
    if (target) {
      target.addEventListener('scroll', handleScroll, { passive: true });
    }
    
    return () => {
      if (target) {
        target.removeEventListener('scroll', handleScroll);
      }
      if (rafId) cancelAnimationFrame(rafId);
      if (isWindow && window.scrollY > 0) {
        globalScrollState.set(key, window.scrollY);
        try { sessionStorage.setItem(key, String(window.scrollY)); } catch (e) {}
      } else if (ref.current && ref.current.scrollLeft > 0) {
        globalScrollState.set(key, ref.current.scrollLeft);
        try { sessionStorage.setItem(key, String(ref.current.scrollLeft)); } catch (e) {}
      }
    };
  }, [key, isWindow]);

  return ref;
}
