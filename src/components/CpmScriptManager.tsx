import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { isUserExemptFromAds } from '../utils/adUtils';

// Popunders - Triggered once per session
const SESSION_CPM_SCRIPTS = [
  'https://commercialhalftime.com/99/e7/8b/99e78b0792c97e620e43154c137cd1f3.js',
];

// Page-level Ads (Social Bar, Vignette, Native Banners) - Triggered once per route change (window change)
const PAGE_CPM_SCRIPTS = [
  {
    src: 'https://nap5k.com/tag.min.js', // Monetag MultiTag (Social Bar/Popunder mix - handled as page level per user request)
    zone: '11681684'
  },
  {
    src: 'https://n6wxm.com/vignette.min.js', // Monetag Vignette
    zone: '11681786'
  }
];

export const CpmScriptManager: React.FC = () => {
  const { profile } = useAuth();
  const location = useLocation();

  useEffect(() => {
    const isExempt = isUserExemptFromAds(profile);

    if (isExempt) {
      // Clean up all scripts if user becomes exempt
      [...SESSION_CPM_SCRIPTS, ...PAGE_CPM_SCRIPTS.map(s => s.src)].forEach(src => {
        const existing = document.querySelector(`script[src="${src}"]`);
        if (existing) existing.remove();
      });
      return;
    }

    const loadPopunders = () => {
      SESSION_CPM_SCRIPTS.forEach(src => {
        const existing = document.querySelector(`script[src="${src}"]`);
        if (existing) existing.remove(); // Clean reload

        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        document.head.appendChild(script);
      });
    };

    // 1. Initial Load (Once when the app opens)
    loadPopunders();

    // 2. Load after 2 mins of scrolling
    let hasTriggeredScrollAd = false;
    let scrollTimeout: NodeJS.Timeout;

    const handleScroll = () => {
      if (!hasTriggeredScrollAd) {
        hasTriggeredScrollAd = true;
        // Start 2 minute timer after first scroll activity
        scrollTimeout = setTimeout(() => {
          loadPopunders();
          console.log('Popunders re-triggered after 2 mins of activity');
        }, 120000);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (scrollTimeout) clearTimeout(scrollTimeout);
    };
  }, [profile]);

  // 2. Handle PAGE-level Ads (Once per route change / window change - e.g. Social Bar, Vignettes, Banners)
  useEffect(() => {
    const isExempt = isUserExemptFromAds(profile);
    if (isExempt) return;

    // For page-level ads, we remove them if they exist and re-inject them to trigger once per "window change"
    PAGE_CPM_SCRIPTS.forEach(config => {
      const existing = document.querySelector(`script[src="${config.src}"]`);
      if (existing) {
        existing.remove();
      }

      const script = document.createElement('script');
      script.src = config.src;
      script.dataset.zone = config.zone;
      script.async = true;
      document.body.appendChild(script);
    });
  }, [location.pathname, profile]);

  return null;
};
