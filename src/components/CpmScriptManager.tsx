import React, { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { isUserExemptFromAds, isAdRestrictedRoute, purgeAllAdElements } from '../utils/adUtils';

// Popunder Cooldown Interval: 3 Minutes (180,000 ms)
const POPUNDER_COOLDOWN_MS = 180000;
const POPUNDER_STORAGE_KEY = 'moviznow_popunder_last_trigger';

// Popunders
const SESSION_CPM_SCRIPTS = [
  'https://commercialhalftime.com/99/e7/8b/99e78b0792c97e620e43154c137cd1f3.js',
];

// Page-level Ads (Social Bar, Vignette, Native Banners) - Triggered once per route change for non-exempt users
const PAGE_CPM_SCRIPTS = [
  {
    src: 'https://nap5k.com/tag.min.js', // Monetag MultiTag (Social Bar/Native)
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
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 1. Session Popunders with 3-minute relaxing cooldown (Never on login page or for exempt users)
  useEffect(() => {
    const isLogin = isAdRestrictedRoute(location.pathname);
    const isExempt = isUserExemptFromAds(profile);

    if (isLogin || isExempt) {
      // Clean up all scripts if user is on login page or exempt
      [...SESSION_CPM_SCRIPTS, ...PAGE_CPM_SCRIPTS.map(s => s.src)].forEach(src => {
        const existing = document.querySelector(`script[src="${src}"]`);
        if (existing) existing.remove();
      });
      purgeAllAdElements();
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
        scrollTimeoutRef.current = null;
      }
      return;
    }

    const loadPopundersWithCooldown = (forced = false) => {
      if (isAdRestrictedRoute(window.location.pathname) || isUserExemptFromAds(profile)) return;

      const now = Date.now();
      let lastTrigger = 0;
      try {
        const stored = sessionStorage.getItem(POPUNDER_STORAGE_KEY);
        if (stored) lastTrigger = parseInt(stored, 10) || 0;
      } catch (e) {}

      // Check if 3 minutes relaxing period has passed
      if (!forced && now - lastTrigger < POPUNDER_COOLDOWN_MS) {
        return; // Relaxed / throttled
      }

      try {
        sessionStorage.setItem(POPUNDER_STORAGE_KEY, String(now));
      } catch (e) {}

      SESSION_CPM_SCRIPTS.forEach(src => {
        const existing = document.querySelector(`script[src="${src}"]`);
        if (existing) existing.remove(); // Clean reload

        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        document.head.appendChild(script);
      });
    };

    // Initial check (triggers only if 3 mins have passed since last popunder)
    loadPopundersWithCooldown();

    // Relaxed popunder recurring timer: check every 3 minutes of active browsing
    const periodicInterval = setInterval(() => {
      loadPopundersWithCooldown();
    }, POPUNDER_COOLDOWN_MS);

    return () => {
      clearInterval(periodicInterval);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
        scrollTimeoutRef.current = null;
      }
    };
  }, [location.pathname, profile]);

  // 2. Handle PAGE-level Ads (Once per route change, never on login page)
  useEffect(() => {
    const isLogin = isAdRestrictedRoute(location.pathname);
    const isExempt = isUserExemptFromAds(profile);

    if (isLogin || isExempt) {
      PAGE_CPM_SCRIPTS.forEach(config => {
        const existing = document.querySelector(`script[src="${config.src}"]`);
        if (existing) existing.remove();
      });
      if (isLogin) {
        purgeAllAdElements();
      }
      return;
    }

    // For page-level ads on non-login pages, remove and re-inject
    PAGE_CPM_SCRIPTS.forEach(config => {
      const existing = document.querySelector(`script[src="${config.src}"]`);
      if (existing) {
        existing.remove();
      }

      const script = document.createElement('script');
      script.setAttribute('data-zone', config.zone);
      script.src = config.src;
      script.async = true;
      document.head.appendChild(script);
    });
  }, [location.pathname, profile]);

  return null;
};

