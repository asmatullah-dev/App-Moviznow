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

  const popunderTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isPopunderLoadedRef = useRef<boolean>(false);

  // Helper to remove popunder scripts from DOM
  const removePopunderScripts = () => {
    SESSION_CPM_SCRIPTS.forEach(src => {
      const existing = document.querySelectorAll(`script[src="${src}"]`);
      existing.forEach(el => el.remove());
    });
    isPopunderLoadedRef.current = false;
  };

  // Helper to inject popunder scripts into DOM
  const injectPopunderScripts = () => {
    if (isAdRestrictedRoute(window.location.pathname) || isUserExemptFromAds(profile)) {
      return;
    }
    removePopunderScripts(); // clean reload

    SESSION_CPM_SCRIPTS.forEach(src => {
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.setAttribute('data-popunder-script', 'true');
      document.head.appendChild(script);
    });
    isPopunderLoadedRef.current = true;
  };

  // 1. Session Popunders with strict 3-minute post-click cooldown
  useEffect(() => {
    const isLogin = isAdRestrictedRoute(location.pathname);
    const isExempt = isUserExemptFromAds(profile);

    if (isLogin || isExempt) {
      removePopunderScripts();
      purgeAllAdElements();
      if (popunderTimeoutRef.current) {
        clearTimeout(popunderTimeoutRef.current);
        popunderTimeoutRef.current = null;
      }
      return;
    }

    const startCooldownTimer = (remainingMs: number) => {
      removePopunderScripts();
      purgeAllAdElements();

      if (popunderTimeoutRef.current) {
        clearTimeout(popunderTimeoutRef.current);
      }

      popunderTimeoutRef.current = setTimeout(() => {
        checkAndLoadPopunder();
      }, remainingMs);
    };

    const triggerClickCooldown = () => {
      if (!isPopunderLoadedRef.current) return;

      const now = Date.now();
      try {
        sessionStorage.setItem(POPUNDER_STORAGE_KEY, String(now));
      } catch (e) {}

      // Immediately remove popunder script, purge overlay elements and start 3-minute cooldown
      startCooldownTimer(POPUNDER_COOLDOWN_MS);
    };

    const checkAndLoadPopunder = () => {
      if (isAdRestrictedRoute(window.location.pathname) || isUserExemptFromAds(profile)) return;

      let lastTrigger = 0;
      try {
        const stored = sessionStorage.getItem(POPUNDER_STORAGE_KEY);
        if (stored) lastTrigger = parseInt(stored, 10) || 0;
      } catch (e) {}

      const now = Date.now();
      const elapsed = now - lastTrigger;

      if (lastTrigger > 0 && elapsed < POPUNDER_COOLDOWN_MS) {
        // Still in 3-minute cooldown period
        const remaining = POPUNDER_COOLDOWN_MS - elapsed;
        startCooldownTimer(remaining);
      } else {
        // Cooldown passed: inject popunder script so it's active and ready for next click
        injectPopunderScripts();
      }
    };

    // Initial check on mount / route change
    checkAndLoadPopunder();

    // Intercept clicks to register when popunder is clicked / triggered
    const handlePopunderTriggerClick = () => {
      if (isPopunderLoadedRef.current) {
        setTimeout(() => {
          triggerClickCooldown();
        }, 100);
      }
    };

    // Intercept window.open calls from popunder script
    const originalWindowOpen = window.open;
    window.open = function (...args) {
      if (isPopunderLoadedRef.current) {
        triggerClickCooldown();
      }
      return originalWindowOpen.apply(this, args);
    };

    window.addEventListener('click', handlePopunderTriggerClick, { capture: true });
    window.addEventListener('pointerdown', handlePopunderTriggerClick, { capture: true });

    return () => {
      window.open = originalWindowOpen;
      window.removeEventListener('click', handlePopunderTriggerClick, { capture: true });
      window.removeEventListener('pointerdown', handlePopunderTriggerClick, { capture: true });
      if (popunderTimeoutRef.current) {
        clearTimeout(popunderTimeoutRef.current);
        popunderTimeoutRef.current = null;
      }
    };
  }, [location.pathname, profile]);

  // 2. Handle PAGE-level Ads (Social Bar, Vignette, Native Banners)
  useEffect(() => {
    const isLogin = isAdRestrictedRoute(location.pathname);
    const isExempt = isUserExemptFromAds(profile);

    if (isLogin || isExempt) {
      PAGE_CPM_SCRIPTS.forEach(config => {
        const existing = document.querySelectorAll(`script[src="${config.src}"]`);
        existing.forEach(el => el.remove());
      });
      if (isLogin) {
        purgeAllAdElements();
      }
      return;
    }

    // For page-level ads on non-login pages, remove and re-inject
    PAGE_CPM_SCRIPTS.forEach(config => {
      const existing = document.querySelectorAll(`script[src="${config.src}"]`);
      existing.forEach(el => el.remove());

      const script = document.createElement('script');
      script.setAttribute('data-zone', config.zone);
      script.src = config.src;
      script.async = true;
      document.head.appendChild(script);
    });
  }, [location.pathname, profile]);

  return null;
};


