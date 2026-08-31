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
  const isExecutingActionRef = useRef<boolean>(false);

  // Helper to execute user's intended navigation/action if hijacked by ad scripts
  const executeUserIntendedAction = (fallbackCoords?: { x: number; y: number }, fallbackTarget?: HTMLElement | null) => {
    if (isExecutingActionRef.current) return;
    isExecutingActionRef.current = true;
    setTimeout(() => {
      isExecutingActionRef.current = false;
    }, 120);

    const coords = fallbackCoords || lastClickRef.current;
    let elementUnderneath = fallbackTarget || lastClickRef.current.target;

    // If target is missing or an ad overlay outside #root, locate element at pointer coordinates
    if (!elementUnderneath || !elementUnderneath.closest('#root')) {
      if (coords.x > 0 || coords.y > 0) {
        try {
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

          elementUnderneath = document.elementFromPoint(coords.x, coords.y) as HTMLElement | null;

          hiddenElements.forEach(({ el, prevEvents }) => {
            el.style.pointerEvents = prevEvents;
          });
        } catch (err) {}
      }
    }

    if (!elementUnderneath || !elementUnderneath.closest('#root')) return;

    const actionable =
      elementUnderneath.closest<HTMLElement>(
        'a, button, [role="button"], input, select, textarea, [data-clickable], [tabindex]'
      ) || elementUnderneath;

    if (!actionable) return;

    // 1. Check for direct anchor or parent anchor
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

    // Synchronously execute immediate SPA navigation if internal path is found!
    if (internalPath && internalPath !== window.location.pathname + window.location.search) {
      navigateRef.current(internalPath);
      return;
    }

    // Dispatch synthetic click event for React click handlers
    try {
      const forwardedEvent = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: coords.x,
        clientY: coords.y,
        button: 0,
        buttons: 1,
      });
      (forwardedEvent as any).__forwardedByProxy = true;
      actionable.dispatchEvent(forwardedEvent);

      if (actionable instanceof HTMLInputElement || actionable instanceof HTMLTextAreaElement || actionable instanceof HTMLSelectElement) {
        actionable.focus();
      } else if (actionable instanceof HTMLButtonElement) {
        actionable.click();
      }
    } catch (err) {
      console.error('Seamless click execution error:', err);
    }
  };

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
    let popunderScript = document.querySelector(`script[data-popunder-script="true"]`) as HTMLScriptElement | null;

    if (!activeCooldown && !inCooldown) {
      if (!popunderScript) {
        // Clean up any stale popunder script elements before appending fresh one
        document.querySelectorAll(`script[src*="99e78b0792c97e620e43154c137cd1f3"]`).forEach((el) => el.remove());

        popunderScript = document.createElement('script');
        popunderScript.src = `${POPUNDER_SCRIPT_SRC}?_t=${Date.now()}&_r=${Math.random().toString(36).substring(2)}`;
        popunderScript.async = true;
        popunderScript.setAttribute('data-authorized-ad-script', 'true');
        popunderScript.setAttribute('data-popunder-script', 'true');
        document.head.appendChild(popunderScript);
      }
    } else {
      // In cooldown - remove ONLY popunder script tags so no extra popunder triggers
      if (popunderScript) {
        popunderScript.remove();
      }
      document.querySelectorAll(`script[src*="99e78b0792c97e620e43154c137cd1f3"]`).forEach((el) => el.remove());
    }
  }, [location.pathname, profile, inCooldown]);

  // =========================================================================
  // WINDOW.OPEN INTERCEPTOR (ALLOWS POPUNDER WHEN NOT IN COOLDOWN, ALLOWS SOCIAL ADS, BLOCKS POPUNDERS DURING COOLDOWN & FOR VIPs)
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
        console.warn('[AdShield] Blocked popunder window.open during 2-minute cooldown:', urlStr);
        // Synchronously execute the user's desired link/page action on 1st tap!
        executeUserIntendedAction();
        // Return dummy window object so popunder script believes popup succeeded and deactivates itself!
        return createDummyWindow();
      }

      // NOT in cooldown & click was on #root: record popunder triggered NOW and allow popup to open!
      recordPopunderTriggered();
      setInCooldown(true);

      // 1. Open the popunder FIRST so the browser and ad script register the popunder window successfully
      const popupWindow = originalWindowOpen.call(window, url, target, features);

      // 2. Remove popunder script tag after trigger
      const popunderScript = document.querySelector(`script[src*="99e78b0792c97e620e43154c137cd1f3"]`);
      if (popunderScript) {
        popunderScript.remove();
      }
      document.querySelectorAll(`script[src*="99e78b0792c97e620e43154c137cd1f3"]`).forEach((el) => el.remove());

      // 3. Defer main-window SPA navigation slightly so it does NOT close or cancel the popunder window gesture
      setTimeout(() => {
        executeUserIntendedAction();
      }, 80);

      return popupWindow || createDummyWindow();
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
        console.warn('[AdShield] Blocked popunder anchor.click during cooldown:', href);
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
        console.warn('[AdShield] Blocked popunder form.submit during cooldown:', action);
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
  // SEAMLESS 1ST-PRESS ROUTING / CLICK ACTION PROXY
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
      lastClickRef.current = {
        x,
        y,
        target: e.target as HTMLElement | null,
      };
    };

    const handleGlobalClick = (e: MouseEvent) => {
      // If user is VIP / Exempt, purge any leftover ad elements and skip click proxying
      if (isUserExemptFromAds(profileRef.current)) {
        purgeAllAdElements();
        return;
      }

      if ((e as any).__forwardedByProxy) {
        return;
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

