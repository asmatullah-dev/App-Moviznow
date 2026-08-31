import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { isUserExemptFromAds, isAdRestrictedRoute, purgeAllAdElements } from '../utils/adUtils';

// Authorized Ad Scripts (CommercialHalftime / Adsterra network)
const AUTHORIZED_CPM_SCRIPTS = [
  // Popunder_1
  'https://commercialhalftime.com/99/e7/8b/99e78b0792c97e620e43154c137cd1f3.js',
  // SocialBar_1
  'https://commercialhalftime.com/f0/27/0b/f0270bbaca005a7be1c664c3c0ae0386.js',
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

    // Inject Popunder_1 and SocialBar_1
    AUTHORIZED_CPM_SCRIPTS.forEach((src) => {
      if (!document.querySelector(`script[src="${src}"]`)) {
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.setAttribute('data-authorized-ad-script', 'true');
        document.head.appendChild(script);
      }
    });
  }, [location.pathname, profile]);

  // =========================================================================
  // SEAMLESS CLICK FORWARDING (TWO-CLICK FIX) PROXY
  // =========================================================================
  useEffect(() => {
    let lastCoords = { x: 0, y: 0 };
    let isForwarding = false;

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if ('clientX' in e) {
        lastCoords = { x: e.clientX, y: e.clientY };
      } else if (e.touches && e.touches[0]) {
        lastCoords = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    };

    const handleGlobalClick = (e: MouseEvent) => {
      if ((e as any).__forwardedByProxy || isForwarding) {
        return;
      }

      const target = e.target as HTMLElement | null;
      if (!target) return;

      const isAdOverlay = !target.closest('#root');

      if (isAdOverlay) {
        const clientX = e.clientX || lastCoords.x;
        const clientY = e.clientY || lastCoords.y;

        if (!clientX && !clientY) return;

        try {
          const originalPointerEvents = target.style.pointerEvents;
          target.style.pointerEvents = 'none';
          const elementUnderneath = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
          target.style.pointerEvents = originalPointerEvents;

          if (elementUnderneath && elementUnderneath.closest('#root')) {
            const actionable = (
              elementUnderneath.closest<HTMLElement>(
                'a, button, [role="button"], input, select, textarea, [data-clickable], [tabindex]'
              ) || elementUnderneath
            );

            if (actionable) {
              isForwarding = true;
              
              setTimeout(() => {
                try {
                  const forwardedEvent = new MouseEvent('click', {
                    bubbles: true,
                    cancelable: true,
                    view: window,
                    clientX,
                    clientY,
                    screenX: e.screenX,
                    screenY: e.screenY,
                  });
                  (forwardedEvent as any).__forwardedByProxy = true;

                  actionable.dispatchEvent(forwardedEvent);

                  if (actionable.tagName === 'A' && typeof (actionable as any).click === 'function') {
                    (actionable as any).click();
                  }
                } catch (err) {
                  console.error('Seamless click forwarding error:', err);
                } finally {
                  setTimeout(() => {
                    isForwarding = false;
                  }, 100);
                }
              }, 40);
            }
          }
        } catch (err) {
          console.error('Ad overlay detection error:', err);
        }
      }
    };

    window.addEventListener('pointerdown', handlePointerDown, { capture: true, passive: true });
    window.addEventListener('click', handleGlobalClick, { capture: true });

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, { capture: true });
      window.removeEventListener('click', handleGlobalClick, { capture: true });
    };
  }, []);

  return null;
};
