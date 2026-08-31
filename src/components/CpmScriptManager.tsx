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
  // SEAMLESS CLICK FORWARDING (TWO-CLICK FIX) PROXY & COOLDOWN
  // =========================================================================
  useEffect(() => {
    let lastCoords = { x: 0, y: 0 };
    let isForwarding = false;

    // Enforce 3-minute cooldown by disabling pointer events on ad overlays
    const POPUNDER_COOLDOWN_MS = 3 * 60 * 1000; 
    
    const enforceCooldown = () => {
      const lastPopunderStr = localStorage.getItem('lastPopunderTime');
      if (lastPopunderStr) {
        const lastTime = parseInt(lastPopunderStr, 10);
        if (Date.now() - lastTime < POPUNDER_COOLDOWN_MS) {
          // Inside cooldown - disable overlays
          document.querySelectorAll('body > *:not(#root)').forEach((el) => {
            const htmlEl = el as HTMLElement;
            
            if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'LINK'].includes(htmlEl.tagName)) return;

            // Do not hide known app modals or portal elements
            if (htmlEl.id === 'omdb-modal-root' || htmlEl.hasAttribute('data-app-portal')) return;

            // Check if it's a React element
            const isReactNode = Object.keys(htmlEl).some(key => key.startsWith('__react'));
            if (isReactNode) return;

            // Target likely ad overlays (often absolute/fixed and cover screen)
            const style = window.getComputedStyle(htmlEl);
            if (style.position === 'absolute' || style.position === 'fixed') {
               const rect = htmlEl.getBoundingClientRect();
               // Popunders usually cover the whole screen, unlike Social Bars / banners
               if (rect.width > window.innerWidth * 0.5 && rect.height > window.innerHeight * 0.5) {
                 htmlEl.style.pointerEvents = 'none';
                 htmlEl.style.display = 'none';
               }
            }
          });
        }
      }
    };

    // Check cooldown periodically to remove any newly injected overlays during cooldown
    const cooldownInterval = setInterval(enforceCooldown, 1000);
    const observer = new MutationObserver(() => enforceCooldown());
    observer.observe(document.body, { childList: true });

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

        // Immediately set cooldown timestamp when a popunder overlay is clicked
        localStorage.setItem('lastPopunderTime', Date.now().toString());

        if (!clientX && !clientY) return;

        try {
          const originalPointerEvents = target.style.pointerEvents;
          target.style.pointerEvents = 'none';
          const elementUnderneath = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
          target.style.pointerEvents = originalPointerEvents;

          // Schedule cooldown enforcement slightly later so ad network's click handler finishes first
          setTimeout(() => {
            enforceCooldown();
          }, 50);

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

                  // WE REMOVED actionable.click() HERE!
                  // actionable.click() on React-Router <Link> tags bypasses the SPA router
                  // and triggers a native browser navigation, which is why the page was "loading not route"
                  // and dropping the app state. Dispatching the synthetic-compatible MouseEvent is enough.
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

    // Initial check
    enforceCooldown();

    return () => {
      clearInterval(cooldownInterval);
      observer.disconnect();
      window.removeEventListener('pointerdown', handlePointerDown, { capture: true });
      window.removeEventListener('click', handleGlobalClick, { capture: true });
    };
  }, []);

  return null;
};
