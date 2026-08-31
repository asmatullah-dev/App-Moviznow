import React, { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { isUserExemptFromAds, isAdRestrictedRoute, purgeAllAdElements } from '../utils/adUtils';

// Popunder Cooldown Interval: Exactly 3 Minutes (180,000 ms)
const POPUNDER_COOLDOWN_MS = 180000;
const POPUNDER_STORAGE_KEY = 'moviznow_popunder_last_trigger';

// Strictly Only This Link Used For Popunder
const POPUNDER_SCRIPTS = [
  'https://commercialhalftime.com/99/e7/8b/99e78b0792c97e620e43154c137cd1f3.js',
];

export const CpmScriptManager: React.FC = () => {
  const { profile } = useAuth();
  const location = useLocation();

  const cooldownTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Helper to completely purge and remove all popunder scripts & DOM overlays
  const removeAdScriptsAndOverlays = () => {
    POPUNDER_SCRIPTS.forEach(src => {
      document.querySelectorAll(`script[src="${src}"]`).forEach(el => el.remove());
    });
    // Remove any leftover Monetag or old scripts
    document.querySelectorAll('script[src*="nap5k.com"], script[src*="n6wxm.com"]').forEach(el => el.remove());
    purgeAllAdElements();
  };

  // Helper to inject strictly only the single popunder script into DOM
  const injectAdScripts = () => {
    if (isAdRestrictedRoute(window.location.pathname) || isUserExemptFromAds(profile)) {
      return;
    }

    removeAdScriptsAndOverlays(); // clean reload

    // Inject Popunder script
    POPUNDER_SCRIPTS.forEach(src => {
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.setAttribute('data-popunder-script', 'true');
      document.head.appendChild(script);
    });
  };

  useEffect(() => {
    const isLogin = isAdRestrictedRoute(location.pathname);
    const isExempt = isUserExemptFromAds(profile);

    // If restricted route or exempt user, wipe out all ad scripts and exit
    if (isLogin || isExempt) {
      removeAdScriptsAndOverlays();
      (window as any).__POPUNDER_COOLDOWN_ACTIVE__ = true;
      if (cooldownTimeoutRef.current) {
        clearTimeout(cooldownTimeoutRef.current);
        cooldownTimeoutRef.current = null;
      }
      return;
    }

    // Helper to start timer until cooldown expires
    const startCooldownTimer = (remainingMs: number) => {
      (window as any).__POPUNDER_COOLDOWN_ACTIVE__ = true;
      removeAdScriptsAndOverlays();

      if (cooldownTimeoutRef.current) {
        clearTimeout(cooldownTimeoutRef.current);
      }

      cooldownTimeoutRef.current = setTimeout(() => {
        checkAndSyncAdState();
      }, remainingMs);
    };

    // Check current state against 3-minute cooldown
    const checkAndSyncAdState = () => {
      if (isAdRestrictedRoute(window.location.pathname) || isUserExemptFromAds(profile)) return;

      let lastTrigger = 0;
      try {
        const stored = sessionStorage.getItem(POPUNDER_STORAGE_KEY);
        if (stored) lastTrigger = parseInt(stored, 10) || 0;
      } catch (e) {}

      const now = Date.now();
      const elapsed = now - lastTrigger;

      if (lastTrigger > 0 && elapsed < POPUNDER_COOLDOWN_MS) {
        // Still in 3-minute cooldown: do not load scripts, lock popups
        const remaining = POPUNDER_COOLDOWN_MS - elapsed;
        startCooldownTimer(remaining);
      } else {
        // Cooldown finished: unlock popunder and inject scripts for next user interaction
        (window as any).__POPUNDER_COOLDOWN_ACTIVE__ = false;
        injectAdScripts();
      }
    };

    // 1. Initial state check
    checkAndSyncAdState();

    // 2. Intercept window.open calls to enforce 3-minute post-click lock
    const originalWindowOpen = window.open;
    window.open = function (...args) {
      let lastTrigger = 0;
      try {
        const stored = sessionStorage.getItem(POPUNDER_STORAGE_KEY);
        if (stored) lastTrigger = parseInt(stored, 10) || 0;
      } catch (e) {}

      const now = Date.now();
      const elapsed = now - lastTrigger;
      const isCooldown = lastTrigger > 0 && elapsed < POPUNDER_COOLDOWN_MS;

      if (isCooldown || (window as any).__POPUNDER_COOLDOWN_ACTIVE__) {
        console.log('[Popunder Manager] Cooldown active. Suppressed window.open popunder call.');
        purgeAllAdElements();
        return null;
      }

      // Popunder was allowed to trigger: immediately initiate 3-minute post-click cooldown
      try {
        sessionStorage.setItem(POPUNDER_STORAGE_KEY, String(now));
      } catch (e) {}

      startCooldownTimer(POPUNDER_COOLDOWN_MS);
      return originalWindowOpen.apply(this, args);
    };

    // 3. Global Capture Phase Click Interceptor
    const handleGlobalUserClick = () => {
      let lastTrigger = 0;
      try {
        const stored = sessionStorage.getItem(POPUNDER_STORAGE_KEY);
        if (stored) lastTrigger = parseInt(stored, 10) || 0;
      } catch (e) {}

      const now = Date.now();
      const elapsed = now - lastTrigger;
      const isCooldown = lastTrigger > 0 && elapsed < POPUNDER_COOLDOWN_MS;

      if (!isCooldown) {
        // First click while popunders were active: trigger 3-minute cooldown
        try {
          sessionStorage.setItem(POPUNDER_STORAGE_KEY, String(now));
        } catch (e) {}

        setTimeout(() => {
          startCooldownTimer(POPUNDER_COOLDOWN_MS);
        }, 100);
      } else {
        // During cooldown, ensure leftover ad overlays don't hijack clicks
        purgeAllAdElements();
      }
    };

    window.addEventListener('click', handleGlobalUserClick, { capture: true });
    window.addEventListener('pointerdown', handleGlobalUserClick, { capture: true });

    return () => {
      window.open = originalWindowOpen;
      window.removeEventListener('click', handleGlobalUserClick, { capture: true });
      window.removeEventListener('pointerdown', handleGlobalUserClick, { capture: true });
      if (cooldownTimeoutRef.current) {
        clearTimeout(cooldownTimeoutRef.current);
        cooldownTimeoutRef.current = null;
      }
    };
  }, [location.pathname, profile]);

  return null;
};


