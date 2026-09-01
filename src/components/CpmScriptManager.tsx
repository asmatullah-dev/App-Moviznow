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

// Helper to recognize ad URLs
function isAdUrl(urlStr: string): boolean {
  if (!urlStr) return false;
  const lower = urlStr.toLowerCase();
  return (
    lower.includes('commercialhalftime.com') ||
    lower.includes('workdeadlinededicate.com') ||
    lower.includes('nap5k.com') ||
    lower.includes('n6wxm.com') ||
    lower.includes('profitableratecpm') ||
    lower.includes('adsterra') ||
    lower.includes('monetag') ||
    lower.includes('by1zps7h9h') ||
    lower.includes('htqpa4mty') ||
    lower.includes('kscas=')
  );
}

// Helper to create a fake window object that tricks ad scripts into thinking the popunder opened
function createDummyWindow(): Window {
  return {
    closed: false,
    focus: () => {},
    blur: () => {},
    close: () => {},
    postMessage: () => {},
    location: { href: '' },
    document: { write: () => {} },
  } as unknown as Window;
}

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

  // Ref to track last click coordinates & target for seamless fallback execution
  const lastClickRef = useRef<{ x: number; y: number; target: HTMLElement | null }>({ x: 0, y: 0, target: null });
  const pendingIntentRef = useRef<{ path: string | null; element: HTMLElement | null; timestamp: number }>({
    path: null,
    element: null,
    timestamp: 0,
  });
  const isNavigatingRef = useRef<boolean>(false);

  // Helper to extract the intended actionable element & internal URL from click/target
  const resolveIntendedAction = (
    explicitTarget?: HTMLElement | null,
    fallbackCoords?: { x: number; y: number }
  ): { path: string | null; element: HTMLElement | null } => {
    const coords = fallbackCoords || lastClickRef.current;
    let elementUnderneath = explicitTarget || lastClickRef.current.target;

    // If target is missing or an ad overlay outside #root, locate element at pointer coordinates inside #root
    if (!elementUnderneath || !elementUnderneath.closest('#root')) {
      if (coords.x > 0 || coords.y > 0) {
        try {
          const overlays = Array.from(
            document.querySelectorAll('body > *:not(#root):not(script):not(style):not(#omdb-modal-root)')
          ).filter((el) => {
            const htmlEl = el as HTMLElement;
            if (htmlEl.hasAttribute('data-app-portal')) return false;
            const style = window.getComputedStyle(htmlEl);
            return style.position === 'fixed' || style.position === 'absolute' || parseInt(style.zIndex, 10) > 50;
          }) as HTMLElement[];

          const hiddenElements: { el: HTMLElement; prevEvents: string }[] = [];
          overlays.forEach((el) => {
            hiddenElements.push({
              el,
              prevEvents: el.style.pointerEvents,
            });
            el.style.pointerEvents = 'none';
          });

          elementUnderneath = document.elementFromPoint(coords.x, coords.y) as HTMLElement | null;

          hiddenElements.forEach(({ el, prevEvents }) => {
            el.style.pointerEvents = prevEvents;
          });
        } catch (err) {}
      }
    }

    if (!elementUnderneath || !elementUnderneath.closest('#root')) {
      return { path: null, element: null };
    }

    const actionable =
      elementUnderneath.closest<HTMLElement>(
        'a, button, [role="button"], input, select, textarea, [data-clickable], [tabindex]'
      ) || elementUnderneath;

    // 1. Check for direct anchor or parent anchor
    let anchorEl =
      actionable.closest<HTMLAnchorElement>('a[href]') ||
      (actionable instanceof HTMLAnchorElement ? actionable : null);

    // 2. If no direct anchor, search parent container card for internal <Link> / <a> tag
    if (!anchorEl) {
      const containerCard = elementUnderneath.closest<HTMLElement>(
        '.relative, article, .group, card, li, [data-card], section, main'
      );
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

    return { path: internalPath, element: anchorEl || actionable };
  };

  // Helper to execute user's intended navigation/action immediately
  const executeUserIntendedAction = (
    fallbackCoords?: { x: number; y: number },
    fallbackTarget?: HTMLElement | null
  ) => {
    const { path, element } = resolveIntendedAction(fallbackTarget, fallbackCoords);

    if (path) {
      const currentLoc = window.location.pathname + window.location.search + window.location.hash;
      if (path !== currentLoc) {
        if (!isNavigatingRef.current) {
          isNavigatingRef.current = true;
          navigateRef.current(path);
          setTimeout(() => {
            isNavigatingRef.current = false;
          }, 150);
        }
        return;
      }
    }

    if (element && element instanceof HTMLButtonElement) {
      try {
        element.click();
      } catch (e) {}
    }
  };

  // Cooldown timer manager (checks every second & on storage changes)
  useEffect(() => {
    const checkCooldown = () => {
      const remaining = getPopunderCooldownRemaining();
      const active = remaining > 0;
      setInCooldown(active);
    };

    checkCooldown();
    const interval = setInterval(checkCooldown, 1000);
    window.addEventListener('storage', checkCooldown);
    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', checkCooldown);
    };
  }, []);

  // Continuous Ad & Overlay Cleanup during Cooldown and on Window Focus (e.g. after returning from Popunder)
  useEffect(() => {
    const handleWindowFocus = () => {
      const cd = isPopunderInCooldown();
      setInCooldown(cd);
      if (cd || isUserExemptFromAds(profileRef.current)) {
        purgeAllAdElements();
      }
    };

    window.addEventListener('focus', handleWindowFocus);
    document.addEventListener('visibilitychange', handleWindowFocus);

    return () => {
      window.removeEventListener('focus', handleWindowFocus);
      document.removeEventListener('visibilitychange', handleWindowFocus);
    };
  }, []);

  // Continuous Ad Cleanup during Cooldown
  useEffect(() => {
    if (inCooldown) {
      // Immediate cleanup
      purgeAllAdElements();

      // Faster cleanup during cooldown to handle any background script re-injections
      const interval = setInterval(() => {
        if (isPopunderInCooldown()) {
          purgeAllAdElements();
        }
      }, 1000);

      // Mutation observer to kill new overlays immediately
      const observer = new MutationObserver((mutations) => {
        if (isPopunderInCooldown()) {
          let shouldPurge = false;
          mutations.forEach((m) => {
            if (m.addedNodes.length > 0) shouldPurge = true;
          });
          if (shouldPurge) purgeAllAdElements();
        }
      });

      observer.observe(document.body, { childList: true });

      return () => {
        clearInterval(interval);
        observer.disconnect();
      };
    }
  }, [inCooldown]);

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
    let socialScript = document.querySelector(
      `script[src*="f0270bbaca005a7be1c664c3c0ae0386"]`
    ) as HTMLScriptElement | null;
    if (!socialScript) {
      socialScript = document.createElement('script');
      socialScript.src = `${SOCIAL_BAR_SCRIPT_SRC}?_cb=${Date.now()}`;
      socialScript.async = true;
      socialScript.setAttribute('data-authorized-ad-script', 'true');
      document.head.appendChild(socialScript);
    }

    // 2. Popunder Script Injection: Only when NOT in cooldown
    const activeCooldown = isPopunderInCooldown();
    const popunderScript = document.querySelector(
      `script[data-popunder-script="true"]`
    ) as HTMLScriptElement | null;

    if (!activeCooldown && !inCooldown) {
      if (!popunderScript) {
        // Clean up any stale popunder script elements before appending fresh one
        document.querySelectorAll(`script[src*="99e78b0792c97e620e43154c137cd1f3"]`).forEach((el) => el.remove());

        const newPopunderScript = document.createElement('script');
        newPopunderScript.src = `${POPUNDER_SCRIPT_SRC}?_t=${Date.now()}&_r=${Math.random().toString(36).substring(2)}`;
        newPopunderScript.async = true;
        newPopunderScript.setAttribute('data-authorized-ad-script', 'true');
        newPopunderScript.setAttribute('data-popunder-script', 'true');
        document.head.appendChild(newPopunderScript);
      }
    } else {
      // In cooldown - remove ONLY popunder script tags so no extra popunder triggers
      if (popunderScript) {
        popunderScript.remove();
      }
      document.querySelectorAll(`script[src*="99e78b0792c97e620e43154c137cd1f3"]`).forEach((el) => el.remove());
      // Also purge globals specifically related to popunder
      try {
        const globals = ['_pop', '_pop_config', '_pop_script', '__p_scr', '__p_config'];
        globals.forEach((g) => {
          try {
            if ((window as any)[g]) delete (window as any)[g];
          } catch (e) {}
        });
      } catch (e) {}
    }
  }, [location.pathname, profile, inCooldown]);

  // =========================================================================
  // WINDOW.OPEN INTERCEPTOR
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
        executeUserIntendedAction();
        return createDummyWindow();
      }

      // Determine if click originated from an app element (#root) vs an external Social Ad widget outside #root
      const lastTarget = lastClickRef.current.target;
      const isClickOnAppRoot = !lastTarget || Boolean(lastTarget.closest('#root'));

      // If click was directly on a Social Bar / Social Ad widget outside #root, ALLOW it!
      if (!isClickOnAppRoot) {
        return originalWindowOpen.call(window, url, target, features);
      }

      // Popunder handling for clicks on app UI (#root):
      if (isPopunderInCooldown()) {
        // Synchronously execute the user's desired link/page action on 1st tap!
        executeUserIntendedAction();
        // Return dummy window object so popunder script believes popup succeeded and deactivates itself!
        return createDummyWindow();
      }

      // NOT in cooldown & click was on #root: record popunder triggered NOW and allow popup to open!
      recordPopunderTriggered();
      setInCooldown(true);

      // Force an immediate purge of the ad script tag and overlays
      purgeAllAdElements();

      // Execute user intended navigation in main window IMMEDIATELY
      // This ensures the 1st click handles BOTH the ad and the app action
      executeUserIntendedAction();

      // Open the popunder
      return originalWindowOpen.call(window, url, target, features);
    };

    return () => {
      window.open = originalWindowOpen;
    };
  }, []);

  // Intercept anchor.click and form.submit for ad URLs during cooldown
  useEffect(() => {
    const originalAnchorClick = HTMLAnchorElement.prototype.click;
    const originalFormSubmit = HTMLFormElement.prototype.submit;

    HTMLAnchorElement.prototype.click = function () {
      const href = this.href || '';
      const isExempt = isUserExemptFromAds(profileRef.current);
      const inCd = isPopunderInCooldown();

      if ((isExempt || inCd) && isAdUrl(href)) {
        executeUserIntendedAction();
        return;
      }

      return originalAnchorClick.apply(this, arguments as any);
    };

    HTMLFormElement.prototype.submit = function () {
      const action = this.action || '';
      const isExempt = isUserExemptFromAds(profileRef.current);
      const inCd = isPopunderInCooldown();

      if ((isExempt || inCd) && isAdUrl(action)) {
        executeUserIntendedAction();
        return;
      }

      return originalFormSubmit.apply(this, arguments as any);
    };

    return () => {
      HTMLAnchorElement.prototype.click = originalAnchorClick;
      HTMLFormElement.prototype.submit = originalFormSubmit;
    };
  }, []);

  // =========================================================================
  // GUARANTEED 1ST-CLICK NAVIGATION & INTENT PRESERVER (CAPTURE PHASE)
  // Fixes the two-click issue where ad scripts prevent navigation on 1st press
  // =========================================================================
  useEffect(() => {
    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      let x = 0;
      let y = 0;
      if ('clientX' in e) {
        x = e.clientX;
        y = e.clientY;
      } else if (e.touches && e.touches[0]) {
        x = e.touches[0].clientX;
        y = e.touches[0].clientY;
      }

      const target = e.target as HTMLElement | null;
      lastClickRef.current = { x, y, target };

      // Pre-extract intended path & element
      const resolved = resolveIntendedAction(target, { x, y });
      if (resolved.path) {
        pendingIntentRef.current = {
          path: resolved.path,
          element: resolved.element,
          timestamp: Date.now(),
        };
      }
    };

    const handleGlobalClickCapture = (e: MouseEvent) => {
      const x = e.clientX;
      const y = e.clientY;
      const target = e.target as HTMLElement | null;

      lastClickRef.current = { x, y, target };

      const resolved = resolveIntendedAction(target, { x, y });
      if (resolved.path) {
        pendingIntentRef.current = {
          path: resolved.path,
          element: resolved.element,
          timestamp: Date.now(),
        };
      }

      // If user clicked an ad overlay outside #root, purge the overlay immediately and navigate
      if (target && !target.closest('#root') && target.id !== 'omdb-modal-root' && !target.hasAttribute('data-app-portal')) {
        const id = (target.id || '').toLowerCase();
        const className = (typeof target.className === 'string' ? target.className : '').toLowerCase();
        const isSocialBar = id.includes('social') || className.includes('social') || id.includes('pro-') || className.includes('pro-');

        if (!isSocialBar && isPopunderInCooldown()) {
          try {
            target.remove();
          } catch (err) {}
          if (resolved.path) {
            executeUserIntendedAction({ x, y }, target);
          }
        }
      }

      // Post-Click Microtask Verification:
      // If the user clicked an internal link, verify if React Router navigated.
      // If an ad script prevented default / cancelled navigation, force the navigation immediately!
      if (resolved.path) {
        const targetPath = resolved.path;
        setTimeout(() => {
          const currentLoc = window.location.pathname + window.location.search + window.location.hash;
          if (currentLoc !== targetPath && pendingIntentRef.current.path === targetPath) {
            // Navigation was blocked/prevented by an ad script! Force the navigation NOW!
            if (!isNavigatingRef.current) {
              isNavigatingRef.current = true;
              navigateRef.current(targetPath);
              setTimeout(() => {
                isNavigatingRef.current = false;
              }, 150);
            }
          }
        }, 16);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown, { capture: true, passive: true });
    window.addEventListener('touchstart', handlePointerDown, { capture: true, passive: true });
    window.addEventListener('click', handleGlobalClickCapture, { capture: true });

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, { capture: true });
      window.removeEventListener('touchstart', handlePointerDown, { capture: true });
      window.removeEventListener('click', handleGlobalClickCapture, { capture: true });
    };
  }, []);

  return null;
};
