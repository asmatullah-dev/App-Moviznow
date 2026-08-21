import React, { useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { isUserExemptFromAds } from '../utils/adUtils';

export const AdSenseScriptManager: React.FC = () => {
  const { profile } = useAuth();
  const { settings } = useSettings();

  useEffect(() => {
    const isExempt = isUserExemptFromAds(profile);
    const provider = settings?.adProvider || 'both';
    const client = settings?.adSenseClientId || 'ca-pub-3128773545517669';

    const scriptSelector = 'script[src*="adsbygoogle.js"]';
    const existingScript = document.querySelector<HTMLScriptElement>(scriptSelector);

    // If user is exempt or ads are disabled, remove the Google AdSense script tag
    if (isExempt || provider === 'disabled' || provider === 'interstitial_only') {
      if (existingScript) {
        existingScript.remove();
      }
      try {
        if ((window as any).adsbygoogle) {
          (window as any).adsbygoogle.pauseAdRequests = 1;
        }
      } catch (e) {}
      return;
    }

    // Otherwise for non-exempt users (basic, pending, trial, guest), load AdSense script
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
  }, [profile, settings?.adProvider, settings?.adSenseClientId]);

  return null;
};
