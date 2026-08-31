import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  isUserExemptFromAds,
  isAdRestrictedRoute,
  purgeAllAdElements,
  isPopunderInCooldown,
  getPopunderCooldownRemaining,
  recordPopunderTriggered,
  POPUNDER_COOLDOWN_MS,
} from '../utils/adUtils';

// Authorized Ad Scripts (CommercialHalftime / Adsterra network)
const POPUNDER_SCRIPT_BASE = 'https://commercialhalftime.com/99/e7/8b/99e78b0792c97e620e43154c137cd1f3.js';
const SOCIAL_BAR_SCRIPT_SRC = 'https://commercialhalftime.com/f0/27/0b/f0270bbaca005a7be1c664c3c0ae0386.js';

export const CpmScriptManager: React.FC = () => {
  const { profile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // Track cooldown state reactively
  const [inCooldown, setInCooldown] = useState<boolean>(isPopunderInCooldown());
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  // Function to remove any popunder script tag and ad overlays from DOM
  const purgePopunderAndOverlays = useCallback(() => {
    if (typeof document === 'undefined') return;

    // 1. Remove all popunder script tags
    document.querySelectorAll(`script[src*="99e78b0792c97e620e43154c137cd1f3"]`).forEach((s) => {
      s.remove();
    });

    // 2. Hide and disable pointer events on all non-root overlays / ad iframes
    document.querySelectorAll('body > *:not(#root)').forEach((el) => {
      const htmlEl = el as HTMLElement;
      if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'LINK'].includes(htmlEl.tagName)) return;
      if (htmlEl.id === 'omdb-modal-root' || htmlEl.hasAttribute('data-app-portal')) return;

      // Check if it's a React element
      const isReactNode = Object.keys(htmlEl).some((key) => key.startsWith('__react'));
      if (isReactNode) return;

      const style = window.getComputedStyle(htmlEl);
      if (style.position === 'absolute' || style.position === 'fixed') {
        htmlEl.style.pointerEvents = 'none';
        htmlEl.style.display = 'none';
        try {
          htmlEl.remove();
        } catch (e) {}
      }
    });
  }, []);

  // Cooldown timer manager (checks every second)
  useEffect(() => {
    const checkCooldown = () => {
      const remaining = getPopunderCooldownRemaining();
      const active = remaining > 0;
      setInCooldown(active);

      if (active) {
        purgePopunderAndOverlays();
      }
    };

    checkCooldown();
    const interval = setInterval(checkCooldown, 1000);
    return () => clearInterval(interval);
  }, [purgePopunderAndOverlays]);

  // Inject or clean up ad scripts based on route, exemption, and cooldown
  useEffect(() => {
    const isLogin = isAdRestrictedRoute(location.pathname);
    const isExempt = isUserExemptFromAds(profile);

    // If on restricted route or user is exempt, purge everything
    if (isLogin || isExempt) {
      purgeAllAdElements();
      return;
    }

    // 1. Social Bar (inject if allowed)
    if (!document.querySelector(`script[src="${SOCIAL_BAR_SCRIPT_SRC}"]`)) {
      const script = document.createElement('script');
      script.src = SOCIAL_BAR_SCRIPT_SRC;
      script.async = true;
      script.setAttribute('data-authorized-ad-script', 'true');
      document.head.appendChild(script);
    }

    // 2. Popunder: ONLY inject if NOT in cooldown
    if (!inCooldown && !isPopunderInCooldown()) {
      const existing = document.querySelector(`script[src*="99e78b0792c97e620e43154c137cd1f3"]`);
      if (!existing) {
        const script = document.createElement('script');
        // Add timestamp to ensure fresh evaluation after cooldown
        script.src = `${POPUNDER_SCRIPT_BASE}?t=${Date.now()}`;
        script.async = true;
        script.setAttribute('data-authorized-ad-script', 'true');
        document.head.appendChild(script);
      }
    } else {
      // In cooldown - make sure popunder script tag is NOT in document
      document.querySelectorAll(`script[src*="99e78b0792c97e620e43154c137cd1f3"]`).forEach((s) => {
        s.remove();
      });
    }
  }, [location.pathname, profile, inCooldown]);

  // =========================================================================
  // SAFE WINDOW.OPEN INTERCEPTOR (BLOCKS ADS DURING COOLDOWN, PRESERVES APP URLS)
  // =========================================================================
  useEffect(() => {
    const originalWindowOpen = window.open;

    window.open = function (url?: string | URL, target?: string, features?: string) {
      const urlStr = String(url || '');

      // Whitelist legitimate app URLs
      const isAppWhitelisted =
        !urlStr ||
        urlStr.startsWith('https://wa.me/') ||
        urlStr.startsWith('https://api.whatsapp.com') ||
        urlStr.startsWith('https://t.me/') ||
        urlStr.includes('telegram.me') ||
        urlStr.includes('youtube.com') ||
        urlStr.includes('youtu.be') ||
        urlStr.startsWith('/') ||
        urlStr.startsWith(window.location.origin) ||
        urlStr.startsWith('tel:') ||
        urlStr.startsWith('mailto:') ||
        urlStr.startsWith('blob:') ||
        urlStr.startsWith('data:');

      if (isAppWhitelisted) {
        return originalWindowOpen.call(window, url, target, features);
      }

      // It's an external / ad URL
      if (isPopunderInCooldown()) {
        console.warn('[AdShield] Blocked popunder window.open during 3-minute cooldown:', urlStr);
        return null;
      }

      // Not in cooldown - allow this popunder and immediately start the 3-minute cooldown
      recordPopunderTriggered();
      setInCooldown(true);
      return originalWindowOpen.call(window, url, target, features);
    };

    return () => {
      window.open = originalWindowOpen;
    };
  }, []);

  // =========================================================================
  // SEAMLESS CLICK INTERCEPTION & 1ST-CLICK INSTANT ROUTING / ACTION PROXY
  // =========================================================================
  useEffect(() => {
    let lastCoords = { x: 0, y: 0 };
    let isForwarding = false;

    const observer = new MutationObserver(() => {
      if (isPopunderInCooldown()) {
        purgePopunderAndOverlays();
      }
    });
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

        const isCurrentlyCooldown = isPopunderInCooldown();

        // If not in cooldown, this click fires the popunder; record cooldown now
        if (!isCurrentlyCooldown) {
          recordPopunderTriggered();
          setInCooldown(true);
        }

        if (!clientX && !clientY) return;

        try {
          // Deep-pierce: temporarily adjust pointerEvents to reveal true app UI underneath
          const hiddenElements: { el: HTMLElement; prevEvents: string; prevDisplay: string }[] = [];
          document.querySelectorAll('body > *:not(#root)').forEach((el) => {
            const htmlEl = el as HTMLElement;
            if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'LINK', 'IFRAME'].includes(htmlEl.tagName)) return;
            if (htmlEl.id === 'omdb-modal-root' || htmlEl.hasAttribute('data-app-portal')) return;
            const isReactNode = Object.keys(htmlEl).some((key) => key.startsWith('__react'));
            if (isReactNode) return;

            hiddenElements.push({
              el: htmlEl,
              prevEvents: htmlEl.style.pointerEvents,
              prevDisplay: htmlEl.style.display,
            });
            htmlEl.style.pointerEvents = 'none';
          });

          const elementUnderneath = document.elementFromPoint(clientX, clientY) as HTMLElement | null;

          // Restore pointer events so ad handler can still process if needed
          hiddenElements.forEach(({ el, prevEvents, prevDisplay }) => {
            if (isCurrentlyCooldown) {
              el.style.pointerEvents = 'none';
              el.style.display = 'none';
              try { el.remove(); } catch (e) {}
            } else {
              el.style.pointerEvents = prevEvents;
              el.style.display = prevDisplay;
            }
          });

          // Schedule cooldown purge
          setTimeout(() => {
            purgePopunderAndOverlays();
          }, 60);

          if (elementUnderneath && elementUnderneath.closest('#root')) {
            const actionable =
              elementUnderneath.closest<HTMLElement>(
                'a, button, [role="button"], input, select, textarea, [data-clickable], [tabindex]'
              ) || elementUnderneath;

            if (actionable) {
              isForwarding = true;

              // Check if actionable is an internal link (<Link> or <a>)
              const anchorEl = actionable.closest<HTMLAnchorElement>('a') || (actionable instanceof HTMLAnchorElement ? actionable : null);
              let internalPath: string | null = null;

              if (anchorEl && anchorEl.href) {
                try {
                  const parsed = new URL(anchorEl.href, window.location.href);
                  if (parsed.origin === window.location.origin) {
                    internalPath = parsed.pathname + parsed.search + parsed.hash;
                  }
                } catch (e) {}
              }

              setTimeout(() => {
                try {
                  // 1. Dispatch synthetic event for any React state handlers
                  const forwardedEvent = new MouseEvent('click', {
                    bubbles: true,
                    cancelable: true,
                    view: window,
                    clientX,
                    clientY,
                    screenX: e.screenX,
                    screenY: e.screenY,
                    button: 0,
                    buttons: 1,
                  });
                  (forwardedEvent as any).__forwardedByProxy = true;
                  actionable.dispatchEvent(forwardedEvent);

                  // 2. If it is an internal route, execute SPA navigation immediately on 1st click!
                  if (internalPath && internalPath !== window.location.pathname + window.location.search) {
                    navigateRef.current(internalPath);
                  } else if (actionable instanceof HTMLInputElement || actionable instanceof HTMLTextAreaElement || actionable instanceof HTMLSelectElement) {
                    actionable.focus();
                  } else if (actionable instanceof HTMLButtonElement) {
                    actionable.click();
                  }
                } catch (err) {
                  console.error('Seamless click execution error:', err);
                } finally {
                  setTimeout(() => {
                    isForwarding = false;
                  }, 80);
                }
              }, 30);
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
      observer.disconnect();
      window.removeEventListener('pointerdown', handlePointerDown, { capture: true });
      window.removeEventListener('click', handleGlobalClick, { capture: true });
    };
  }, [purgePopunderAndOverlays]);

  return null;
};
