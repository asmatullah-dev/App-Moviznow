import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { isUserExemptFromAds, isAdRestrictedRoute, purgeAllAdElements } from '../utils/adUtils';

// Popunder Scripts
const POPUNDER_SCRIPTS = [
  'https://commercialhalftime.com/99/e7/8b/99e78b0792c97e620e43154c137cd1f3.js',
];

// Page-level Ads (Monetag MultiTag, Vignette, etc.)
const PAGE_CPM_SCRIPTS = [
  {
    src: 'https://nap5k.com/tag.min.js', // Monetag MultiTag (Social Bar/Native/Popunder)
    zone: '11681684',
    type: 'multitag'
  },
  {
    src: 'https://n6wxm.com/vignette.min.js', // Monetag Vignette
    zone: '11681786',
    type: 'vignette'
  }
];

export const CpmScriptManager: React.FC = () => {
  const { profile } = useAuth();
  const location = useLocation();

  useEffect(() => {
    const isLogin = isAdRestrictedRoute(location.pathname);
    const isExempt = isUserExemptFromAds(profile);

    // If on restricted route (e.g. login) or user has VIP/Admin/Owner exemption, remove all ads
    if (isLogin || isExempt) {
      purgeAllAdElements();
      return;
    }

    // 1. Inject Popunder Scripts
    POPUNDER_SCRIPTS.forEach((src) => {
      if (!document.querySelector(`script[src="${src}"]`)) {
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.setAttribute('data-popunder-script', 'true');
        document.head.appendChild(script);
      }
    });

    // 2. Inject Monetag / CPM Page-Level Scripts
    PAGE_CPM_SCRIPTS.forEach((config) => {
      if (!document.querySelector(`script[src="${config.src}"]`)) {
        const script = document.createElement('script');
        script.src = config.src;
        script.async = true;
        if (config.zone) {
          script.setAttribute('data-zone', config.zone);
        }
        document.head.appendChild(script);
      }
    });
  }, [location.pathname, profile]);

  return null;
};

