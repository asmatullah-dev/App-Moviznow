import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { logEvent as firebaseLogEvent } from 'firebase/analytics';
import { analytics, analyticsPromise } from '../firebase';
import { safeStorage } from '../utils/safeStorage';

export function AnalyticsTracker() {
  const location = useLocation();

  useEffect(() => {
    const trackPage = async () => {
      // Don't track if the user is an owner
      try {
        const cachedProfile = safeStorage.getItem('profile_cache');
        if (cachedProfile) {
          const profile = JSON.parse(cachedProfile);
          if (profile.role === 'owner') {
            return;
          }
        }
      } catch (e) {
        // Ignore parse error
      }

      try {
        const gaInstance = analytics || await analyticsPromise;
        if (gaInstance) {
          try {
            firebaseLogEvent(gaInstance, 'page_view', {
              page_path: location.pathname + location.search,
              page_title: document.title,
              page_location: window.location.href,
            });
          } catch (e) {}
        }
        
        // Always log to standalone gtag if available (more reliable)
        if (typeof window !== 'undefined' && 'gtag' in window) {
          // @ts-ignore
          window.gtag('event', 'page_view', {
            page_path: location.pathname + location.search,
            page_title: document.title,
            page_location: window.location.href,
          });
        }
      } catch (error) {
        console.error('Error tracking page view:', error);
      }
    };

    trackPage();
  }, [location]);

  return null;
}
