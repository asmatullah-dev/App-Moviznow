import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { isUserExemptFromAds, isAdRestrictedRoute, purgeAllAdElements } from '../utils/adUtils';

export const AdSenseScriptManager: React.FC = () => {
  const { profile } = useAuth();
  const { settings } = useSettings();
  const location = useLocation();

  useEffect(() => {
    const isLogin = isAdRestrictedRoute(location.pathname);
    const isExempt = isUserExemptFromAds(profile);
    const provider = settings?.adProvider || 'both';
    const client = settings?.adSenseClientId || 'ca-pub-3128773545517669';

    const scriptSelector = 'script[src*="adsbygoogle.js"]';
    const existingScript = document.querySelector<HTMLScriptElement>(scriptSelector);

    // If on login page, user is exempt, or ads are disabled, remove AdSense script tag and pause requests
    if (isLogin || isExempt || provider === 'disabled' || provider === 'interstitial_only') {
      if (existingScript) {
        existingScript.remove();
      }
      try {
        if ((window as any).adsbygoogle) {
          (window as any).adsbygoogle.pauseAdRequests = 1;
        }
      } catch (e) {}
      if (isLogin || isExempt) {
        purgeAllAdElements(true);
      }
      return;
    }

    // Otherwise for non-exempt users on normal pages, load AdSense script
    if (provider === 'google_adsense' || provider === 'both') {
      try {
        if ((window as any).adsbygoogle) {
          (window as any).adsbygoogle.pauseAdRequests = 0;
        }
      } catch (e) {}

      if (!existingScript) {
        const script = document.createElement('script');
        script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}`;
        script.async = true;
        script.crossOrigin = 'anonymous';
        document.head.appendChild(script);
      }
    }
  }, [location.pathname, profile, settings?.adProvider, settings?.adSenseClientId]);

  return null;
};

