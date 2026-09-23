import { useEffect } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';
import { globalScrollState } from '../hooks/useScrollRestoration';

export function ScrollToTopOrRestore() {
  const location = useLocation();
  const navigationType = useNavigationType();

  useEffect(() => {
    const isHome = location.pathname === '/';
    const fromMovieDetails = sessionStorage.getItem("from_movie_details") === "true";

    if (isHome && (navigationType === 'POP' || fromMovieDetails)) {
      sessionStorage.removeItem("from_movie_details");
      const homeSaved = globalScrollState.get("home_window_scroll") ?? Number(sessionStorage.getItem("home_window_scroll") || 0);
      
      if (homeSaved > 0) {
        let isUserInterrupted = false;

        const handleUserScroll = () => {
          if (Math.abs(window.scrollY - homeSaved) > 15) {
            isUserInterrupted = true;
          }
        };

        window.addEventListener('wheel', handleUserScroll, { passive: true });
        window.addEventListener('touchmove', handleUserScroll, { passive: true });

        // Immediate application
        window.scrollTo({ top: homeSaved, behavior: 'instant' as any });

        // ResizeObserver tracks body height changes and forces scroll to target
        let resizeObserver: ResizeObserver | null = null;
        if (typeof window !== 'undefined' && 'ResizeObserver' in window) {
          resizeObserver = new ResizeObserver(() => {
            if (!isUserInterrupted) {
              window.scrollTo({ top: homeSaved, behavior: 'instant' as any });
            }
          });
          resizeObserver.observe(document.body);
        }

        // Safely detach listeners after 4 seconds once layout is fully stabilized
        const timeout = setTimeout(() => {
          if (resizeObserver) {
            resizeObserver.disconnect();
          }
          window.removeEventListener('wheel', handleUserScroll);
          window.removeEventListener('touchmove', handleUserScroll);
        }, 4000);

        return () => {
          if (resizeObserver) {
            resizeObserver.disconnect();
          }
          clearTimeout(timeout);
          window.removeEventListener('wheel', handleUserScroll);
          window.removeEventListener('touchmove', handleUserScroll);
        };
      }
    }

    if (navigationType === 'POP') {
      const savedPosition = globalScrollState.get(location.key) ?? 0;
      if (savedPosition > 0) {
        window.scrollTo({ top: savedPosition, behavior: 'instant' as any });
      }
    } else if (!isHome) {
      window.scrollTo({ top: 0, behavior: 'instant' as any });
    }
  }, [location, navigationType]);

  useEffect(() => {
    let rafId: number | null = null;

    const handleScroll = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        globalScrollState.set(location.key, window.scrollY);
        if (location.pathname === '/' && window.scrollY > 0) {
          globalScrollState.set("home_window_scroll", window.scrollY);
          try { sessionStorage.setItem("home_window_scroll", String(window.scrollY)); } catch (e) {}
        }
      });
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [location]);

  return null;
}
