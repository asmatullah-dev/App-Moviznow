import React, { useEffect, useState, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  isUserExemptFromAds,
  isAdRestrictedRoute,
  purgeAllAdElements,
  isPopunderInCooldown,
  getPopunderCooldownRemaining,
  recordPopunderTriggered,
} from '../utils/adUtils';

// Authorized Ad Scripts (CommercialHalftime / Adsterra network)
const POPUNDER_SCRIPT_SRC = 'https://commercialhalftime.com/99/e7/8b/99e78b0792c97e620e43154c137cd1f3.js';
const SOCIAL_BAR_SCRIPT_SRC = 'https://commercialhalftime.com/f0/27/0b/f0270bbaca005a7be1c664c3c0ae0386.js';

export const CpmScriptManager: React.FC = () => {
  const { profile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // Track cooldown state reactively
  const [inCooldown, setInCooldown] = useState<boolean>(isPopunderInCooldown());
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  const profileRef = useRef(profile);
  profileRef.current = profile;

  // Cooldown timer manager (checks every second)
  useEffect(() => {
    const checkCooldown = () => {
      const remaining = getPopunderCooldownRemaining();
      const active = remaining > 0;
      setInCooldown(active);
    };

    checkCooldown();
    const interval = setInterval(checkCooldown, 1000);
    return () => clearInterval(interval);
  }, []);

  // Inject or clean up ad scripts based on route, exemption, and cooldown
  useEffect(() => {
    const isLogin = isAdRestrictedRoute(location.pathname);
    const isExempt = isUserExemptFromAds(profile);

    // If on restricted route or user is exempt, purge everything
    if (isLogin || isExempt) {
      purgeAllAdElements();
      return;
    }

    // 1. Social Bar: Always inject for non-exempt users on valid routes
    let socialScript = document.querySelector(`script[src*="f0270bbaca005a7be1c664c3c0ae0386"]`) as HTMLScriptElement | null;
    if (!socialScript) {
      socialScript = document.createElement('script');
      socialScript.src = `${SOCIAL_BAR_SCRIPT_SRC}?_cb=${Date.now()}`;
      socialScript.async = true;
      socialScript.setAttribute('data-authorized-ad-script', 'true');
      document.head.appendChild(socialScript);
    }

    // 2. Popunder Script Injection: Only when NOT in cooldown
    const activeCooldown = isPopunderInCooldown();
    let popunderScript = document.querySelector(`script[src*="99e78b0792c97e620e43154c137cd1f3"]`) as HTMLScriptElement | null;

    if (!activeCooldown && !inCooldown) {
      if (!popunderScript) {
        popunderScript = document.createElement('script');
        popunderScript.src = `${POPUNDER_SCRIPT_SRC}?_t=${Date.now()}`;
        popunderScript.async = true;
        popunderScript.setAttribute('data-authorized-ad-script', 'true');
        document.head.appendChild(popunderScript);
      }
    } else {
      // In cooldown - remove popunder script tag so no extra popunder triggers
      if (popunderScript) {
        popunderScript.remove();
      }
    }
  }, [location.pathname, profile, inCooldown]);

  // =========================================================================
  // WINDOW.OPEN INTERCEPTOR (ALLOWS POPUNDER WHEN NOT IN COOLDOWN, BLOCKS DURING COOLDOWN & FOR VIPs)
  // =========================================================================
  useEffect(() => {
    const originalWindowOpen = window.open;

    window.open = function (url?: string | URL, target?: string, features?: string) {
      const urlStr = String(url || '').trim();

      // Whitelist legitimate app URLs
      const isAppWhitelisted =
        urlStr.startsWith('https://wa.me/') ||
        urlStr.startsWith('https://api.whatsapp.com') ||
        urlStr.startsWith('https://t.me/') ||
        urlStr.includes('telegram.me') ||
        urlStr.includes('youtube.com') ||
        urlStr.includes('youtu.be') ||
        urlStr.startsWith('tel:') ||
        urlStr.startsWith('mailto:') ||
        urlStr.startsWith('blob:') ||
        urlStr.startsWith('data:');

      if (isAppWhitelisted) {
        return originalWindowOpen.call(window, url, target, features);
      }

      // Check for internal SPA routes or exact same origin
      if (urlStr.startsWith('/') || (urlStr.startsWith(window.location.origin) && !urlStr.includes('commercialhalftime'))) {
        return originalWindowOpen.call(window, url, target, features);
      }

      // If user is VIP / exempt from ads, block ALL external ad window.open calls completely
      if (isUserExemptFromAds(profileRef.current)) {
        console.warn('[AdShield] Blocked ad window.open for VIP user:', urlStr);
        return null;
      }

      // External / Ad URL detected:
      if (isPopunderInCooldown()) {
        console.warn('[AdShield] Blocked popunder window.open during 3-minute cooldown:', urlStr);
        return null;
      }

      // NOT in cooldown - record popunder triggered NOW and allow popup to open!
      recordPopunderTriggered();
      setInCooldown(true);

      // Remove popunder script tag immediately after trigger
      const popunderScript = document.querySelector(`script[src*="99e78b0792c97e620e43154c137cd1f3"]`);
      if (popunderScript) {
        popunderScript.remove();
      }

      return originalWindowOpen.call(window, url, target, features);
    };

    return () => {
      window.open = originalWindowOpen;
    };
  }, []);

  // =========================================================================
  // SEAMLESS 1ST-PRESS ROUTING / CLICK ACTION PROXY
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
      // If user is VIP / Exempt, purge any leftover ad elements and skip click proxying
      if (isUserExemptFromAds(profileRef.current)) {
        purgeAllAdElements();
        return;
      }

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
          // Temporarily disable pointer events on non-root elements to locate underlying app UI
          const hiddenElements: { el: HTMLElement; prevEvents: string }[] = [];
          document.querySelectorAll('body > *:not(#root)').forEach((el) => {
            const htmlEl = el as HTMLElement;
            if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'LINK', 'IFRAME'].includes(htmlEl.tagName)) return;
            if (htmlEl.id === 'omdb-modal-root' || htmlEl.hasAttribute('data-app-portal')) return;
            const isReactNode = Object.keys(htmlEl).some((key) => key.startsWith('__react'));
            if (isReactNode) return;

            hiddenElements.push({
              el: htmlEl,
              prevEvents: htmlEl.style.pointerEvents,
            });
            htmlEl.style.pointerEvents = 'none';
          });

          const elementUnderneath = document.elementFromPoint(clientX, clientY) as HTMLElement | null;

          // Restore pointer events for elements (e.g. Social Bar widgets)
          hiddenElements.forEach(({ el, prevEvents }) => {
            el.style.pointerEvents = prevEvents;
          });

          if (elementUnderneath && elementUnderneath.closest('#root')) {
            const actionable =
              elementUnderneath.closest<HTMLElement>(
                'a, button, [role="button"], input, select, textarea, [data-clickable], [tabindex]'
              ) || elementUnderneath;

            if (actionable) {
              isForwarding = true;

              // 1. Search for direct anchor or parent anchor
              let anchorEl = actionable.closest<HTMLAnchorElement>('a[href]') || (actionable instanceof HTMLAnchorElement ? actionable : null);

              // 2. If no direct anchor, search parent container card for internal <Link> / <a> tag
              if (!anchorEl) {
                const containerCard = elementUnderneath.closest<HTMLElement>('.relative, article, .group, card, li, [data-card], section, main');
                if (containerCard) {
                  anchorEl = containerCard.querySelector<HTMLAnchorElement>('a[href]');
                }
              }

              let internalPath: string | null = null;
              if (anchorEl && anchorEl.href) {
                try {
                  const parsed = new URL(anchorEl.href, window.location.href);
                  if (parsed.origin === window.location.origin) {
                    internalPath = parsed.pathname + parsed.search + parsed.hash;
                  }
                } catch (err) {}
              }

              // Synchronously execute immediate SPA navigation if path is found!
              if (internalPath && internalPath !== window.location.pathname + window.location.search) {
                navigateRef.current(internalPath);
              }

              // Dispatch synthetic click event for React handlers
              try {
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

                if (!internalPath) {
                  if (actionable instanceof HTMLInputElement || actionable instanceof HTMLTextAreaElement || actionable instanceof HTMLSelectElement) {
                    actionable.focus();
                  } else if (actionable instanceof HTMLButtonElement) {
                    actionable.click();
                  }
                }
              } catch (err) {
                console.error('Seamless click execution error:', err);
              } finally {
                setTimeout(() => {
                  isForwarding = false;
                }, 50);
              }
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

