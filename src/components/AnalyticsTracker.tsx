import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { logEvent as firebaseLogEvent, setUserId, setUserProperties } from 'firebase/analytics';
import { analytics, analyticsPromise } from '../firebase';
import { safeStorage } from '../utils/safeStorage';

export function AnalyticsTracker() {
  const location = useLocation();

  useEffect(() => {
    const trackPage = async () => {
      // Don't track if the user is an owner
      let profile: any = null;
      try {
        const cachedProfile = safeStorage.getItem('profile_cache');
        if (cachedProfile) {
          profile = JSON.parse(cachedProfile);
          if (profile.role === 'owner') {
            return;
          }
        }
      } catch (e) {
        // Ignore parse error
      }

      const currentVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '3.2.2';

      try {
        const searchParams = new URLSearchParams(location.search);
        const utmParams: Record<string, string> = {};
        
        const paramsMap: Record<string, string> = {
          utm_source: 'campaign_source',
          utm_medium: 'campaign_medium',
          utm_campaign: 'campaign_name',
          utm_term: 'campaign_term',
          utm_content: 'campaign_content',
          utm_id: 'campaign_id',
        };

        Object.keys(paramsMap).forEach(key => {
          const val = searchParams.get(key);
          if (val) utmParams[paramsMap[key]] = val;
        });

        // Add campaign details if present
        const pageViewData = {
          page_path: location.pathname + location.search,
          page_title: document.title,
          page_location: window.location.href,
          app_version: currentVersion,
          ...utmParams
        };

        const gaInstance = analytics || await analyticsPromise;
        if (gaInstance) {
          try {
            if (profile?.uid) {
              setUserId(gaInstance, profile.uid);
              
              const userProps: Record<string, string> = {
                user_name: profile.displayName || profile.uid,
                email: profile.email || '',
                role: profile.role || '',
                app_version: currentVersion
              };

              if (profile.age !== undefined) userProps.age = String(profile.age);
              if (profile.gender !== undefined) userProps.gender = profile.gender;
              if (profile.device) {
                userProps.device_os = profile.device.os;
                userProps.device_model = profile.device.model;
                userProps.device_type = profile.device.type || 'desktop';
              }
              
              setUserProperties(gaInstance, userProps);
            }

            if (Object.keys(utmParams).length > 0) {
               firebaseLogEvent(gaInstance, 'campaign_details', utmParams);
            }
            firebaseLogEvent(gaInstance, 'page_view', pageViewData);
          } catch (e) {
            console.warn('Firebase analytics page_view failed:', e);
          }
        }
      } catch (error) {
        console.error('Error tracking page view:', error);
      }
    };

    trackPage();
  }, [location]);

  return null;
}
