import { useEffect } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';
import { globalScrollState } from '../hooks/useScrollRestoration';

export function ScrollToTopOrRestore() {
  const location = useLocation();
  const navigationType = useNavigationType();

  useEffect(() => {
    const restore = () => {
      if (navigationType === 'POP') {
        const savedPosition = globalScrollState.get(location.key) ?? 0;
        window.scrollTo(0, savedPosition);
      } else {
        window.scrollTo(0, 0);
      }
    };
    
    // Try immediately
    restore();
    
    // And after a short delay for layout shifts
    const timer = setTimeout(restore, 100);
    return () => clearTimeout(timer);
  }, [location, navigationType]);

  useEffect(() => {
    let timeoutId: any;
    const handleScroll = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        globalScrollState.set(location.key, window.scrollY);
      }, 100);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [location]);

  return null;
}
