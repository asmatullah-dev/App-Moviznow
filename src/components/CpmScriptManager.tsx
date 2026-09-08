import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import {
  purgePopunderAndSocialAds,
  clearAdNetworkSessionCookiesAndStorage,
} from '../utils/adUtils';

/**
 * CpmScriptManager:
 * Ensures all popunder scripts and social ads (social bar, push notifications, click-catchers)
 * are completely eliminated from the application, leaving only banner advertisements intact.
 * No popunder or social ads scripts are ever loaded or executed.
 */
export const CpmScriptManager: React.FC = () => {
  const location = useLocation();

  useEffect(() => {
    // 1. Instantly wipe any residual popunder or social ad network cookies and storage
    clearAdNetworkSessionCookiesAndStorage();

    // 2. Aggressively purge any popunder scripts, social bar scripts, or leftover DOM overlays
    purgePopunderAndSocialAds();

    // 3. Periodic safeguard check to guarantee no dynamic injection occurs
    const interval = setInterval(() => {
      purgePopunderAndSocialAds();
    }, 2000);

    // 4. MutationObserver to immediately catch and strip any unauthorized popunder/social ad DOM elements
    const observer = new MutationObserver((mutations) => {
      let shouldPurge = false;
      for (const m of mutations) {
        if (m.addedNodes.length > 0) {
          shouldPurge = true;
          break;
        }
      }
      if (shouldPurge) {
        purgePopunderAndSocialAds();
      }
    });

    if (typeof document !== 'undefined' && document.body) {
      observer.observe(document.body, { childList: true, subtree: false });
    }

    return () => {
      clearInterval(interval);
      observer.disconnect();
    };
  }, [location.pathname]);

  return null;
};

