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
  isAppWhitelistedUrl,
  clearAdNetworkSessionCookiesAndStorage,
} from '../utils/adUtils';

// Authorized Ad Scripts (CommercialHalftime / Adsterra network)
const POPUNDER_SCRIPT_SRC = 'https://commercialhalftime.com/99/e7/8b/99e78b0792c97e620e43154c137cd1f3.js';
const SOCIAL_BAR_SCRIPT_SRC = 'https://commercialhalftime.com/f0/27/0b/f0270bbaca005a7be1c664c3c0ae0386.js';

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

    // 1. Check if user clicked a button or interactive form control directly
    const buttonEl = elementUnderneath.closest<HTMLElement>(
      'button, [role="button"], input, select, textarea, [data-button]'
    );
    const anchorEl = elementUnderneath.closest<HTMLAnchorElement>('a[href]');

    // If a button or input was clicked and it is NOT an anchor, it has NO route path
    if (buttonEl && (!anchorEl || !anchorEl.contains(buttonEl))) {
      return { path: null, element: buttonEl };
    }

    // 2. If an anchor was clicked (e.g. <Link> or <a href="...">)
    let internalPath: string | null = null;
    if (anchorEl && anchorEl.href) {
      try {
        const parsed = new URL(anchorEl.href, window.location.href);
        if (parsed.origin === window.location.origin) {
          internalPath = parsed.pathname + parsed.search + parsed.hash;
        }
      } catch (err) {}
      return { path: internalPath, element: anchorEl };
    }

    return { path: null, element: elementUnderneath };
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

  // Cooldown manager: listens to storage, custom events, visibility, and 1s timer
  useEffect(() => {
    const updateCooldownStatus = () => {
      const remaining = getPopunderCooldownRemaining();
      const active = remaining > 0;
      setInCooldown(active);
    };

    updateCooldownStatus();
    const interval = setInterval(updateCooldownStatus, 1000);

    const handleCustomUpdate = () => {
      updateCooldownStatus();
    };

    window.addEventListener('storage', updateCooldownStatus);
    window.addEventListener('popunder_cooldown_update', handleCustomUpdate);
    window.addEventListener('focus', updateCooldownStatus);
    document.addEventListener('visibilitychange', updateCooldownStatus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', updateCooldownStatus);
      window.removeEventListener('popunder_cooldown_update', handleCustomUpdate);
      window.removeEventListener('focus', updateCooldownStatus);
      document.removeEventListener('visibilitychange', updateCooldownStatus);
    };
  }, []);

  // Continuous Ad Cleanup during Cooldown & on Window Focus
  useEffect(() => {
    const checkAndPurge = () => {
      const isExempt = isUserExemptFromAds(profileRef.current);
      const isLogin = isAdRestrictedRoute(window.location.pathname);
      if (isExempt || isLogin) {
        purgeAllAdElements(true); // Purge everything including social bar!
      } else if (isPopunderInCooldown()) {
        purgeAllAdElements(false); // Cooldown for popunders only for non-exempt users
      }
    };

    checkAndPurge();

    const interval = setInterval(checkAndPurge, 1000);

    const observer = new MutationObserver((mutations) => {
      let shouldCheck = false;
      mutations.forEach((m) => {
        if (m.addedNodes.length > 0) shouldCheck = true;
      });
      if (shouldCheck) checkAndPurge();
    });

    observer.observe(document.body, { childList: true });

    // Listen to custom auth events to purge instantly upon login / state change
    window.addEventListener('moviz_auth_state_changed', checkAndPurge);
    window.addEventListener('storage', checkAndPurge);

    return () => {
      clearInterval(interval);
      observer.disconnect();
      window.removeEventListener('moviz_auth_state_changed', checkAndPurge);
      window.removeEventListener('storage', checkAndPurge);
    };
  }, [inCooldown, profile]);

  // Inject or clean up ad scripts based on route, exemption, and cooldown
  useEffect(() => {
    const isLogin = isAdRestrictedRoute(location.pathname);
    const isExempt = isUserExemptFromAds(profile);

    // If on restricted route or user is exempt, purge everything (including Social Bar)
    if (isLogin || isExempt) {
      purgeAllAdElements(true);
      return;
    }

    // 1. Social Bar: Inject for non-exempt users on valid routes
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
        // Deep session wipe: clear capping cookies & tokens so Adsterra starts a brand new fresh session
        clearAdNetworkSessionCookiesAndStorage();

        document.querySelectorAll(`script[src*="99e78b0792c97e620e43154c137cd1f3"]`).forEach((el) => el.remove());

        const newPopunderScript = document.createElement('script');
        newPopunderScript.src = `${POPUNDER_SCRIPT_SRC}?_session=${Date.now()}_${Math.random().toString(36).substring(2)}`;
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
  // WINDOW.OPEN INTERCEPTOR (AIRTIGHT COOLDOWN ENFORCER)
  // =========================================================================
  useEffect(() => {
    const originalWindowOpen = window.open;

    window.open = function (url?: string | URL, target?: string, features?: string) {
      const urlStr = String(url || '').trim();

      // If legitimate app URL (WhatsApp, Telegram, YouTube, tel, internal SPA route), allow immediately!
      if (isAppWhitelistedUrl(urlStr)) {
        return originalWindowOpen.call(window, url, target, features);
      }

      // Check if user is VIP / exempt from ads: BLOCK completely
      if (isUserExemptFromAds(profileRef.current)) {
        executeUserIntendedAction();
        return createDummyWindow();
      }

      // If click was directly on a Social Bar / Social Ad widget outside #root, ALLOW it!
      const lastTarget = lastClickRef.current.target;
      const isClickOnAppRoot = !lastTarget || Boolean(lastTarget.closest('#root'));
      if (!isClickOnAppRoot) {
        return originalWindowOpen.call(window, url, target, features);
      }

      // POPUNDER COOLDOWN CHECK:
      if (isPopunderInCooldown()) {
        // In 2-minute cooldown: Block popunder, execute app navigation, return dummy window!
        executeUserIntendedAction();
        return createDummyWindow();
      }

      // NOT in cooldown: Trigger cooldown NOW (starts 2-minute timer in localStorage + memory)
      recordPopunderTriggered();
      setInCooldown(true);

      // Immediately purge popunder elements so subsequent clicks are clean
      purgeAllAdElements(false);

      // Execute user intended navigation in main window IMMEDIATELY on this same 1st tap!
      executeUserIntendedAction();

      // Open the single authorized popunder
      return originalWindowOpen.call(window, url, target, features);
    };

    return () => {
      window.open = originalWindowOpen;
    };
  }, []);

  // =========================================================================
  // ANCHOR.CLICK, DISPATCH_EVENT & FORM.SUBMIT INTERCEPTORS
  // Prevents ad scripts from bypassing window.open via dynamic <a> or <form>
  // =========================================================================
  useEffect(() => {
    const originalAnchorClick = HTMLAnchorElement.prototype.click;
    const originalFormSubmit = HTMLFormElement.prototype.submit;
    const originalDispatchEvent = EventTarget.prototype.dispatchEvent;

    HTMLAnchorElement.prototype.click = function () {
      const href = this.href || '';
      
      // If it's a whitelisted app action (WhatsApp, Telegram, YouTube, internal route), allow
      if (isAppWhitelistedUrl(href)) {
        return originalAnchorClick.apply(this, arguments as any);
      }

      const isExempt = isUserExemptFromAds(profileRef.current);
      const inCd = isPopunderInCooldown();

      // External ad URL:
      if (isExempt || inCd) {
        // Block during cooldown or for exempt users!
        if (isExempt) purgeAllAdElements(true);
        executeUserIntendedAction();
        return;
      }

      // NOT in cooldown: record cooldown now and allow this one click
      recordPopunderTriggered();
      setInCooldown(true);
      purgeAllAdElements(false);
      executeUserIntendedAction();

      return originalAnchorClick.apply(this, arguments as any);
    };

    HTMLFormElement.prototype.submit = function () {
      const action = this.action || '';
      if (isAppWhitelistedUrl(action)) {
        return originalFormSubmit.apply(this, arguments as any);
      }

      const isExempt = isUserExemptFromAds(profileRef.current);
      const inCd = isPopunderInCooldown();

      if (isExempt || inCd) {
        if (isExempt) purgeAllAdElements(true);
        executeUserIntendedAction();
        return;
      }

      recordPopunderTriggered();
      setInCooldown(true);
      purgeAllAdElements(false);
      executeUserIntendedAction();

      return originalFormSubmit.apply(this, arguments as any);
    };

    EventTarget.prototype.dispatchEvent = function (event: Event) {
      if (this instanceof HTMLAnchorElement && event.type === 'click') {
        const href = this.href || '';
        if (!isAppWhitelistedUrl(href)) {
          const isExempt = isUserExemptFromAds(profileRef.current);
          const inCd = isPopunderInCooldown();
          if (isExempt || inCd) {
            if (isExempt) purgeAllAdElements(true);
            executeUserIntendedAction();
            return false;
          }
          recordPopunderTriggered();
          setInCooldown(true);
          purgeAllAdElements(false);
          executeUserIntendedAction();
        }
      }
      return originalDispatchEvent.apply(this, arguments as any);
    };

    return () => {
      HTMLAnchorElement.prototype.click = originalAnchorClick;
      HTMLFormElement.prototype.submit = originalFormSubmit;
      EventTarget.prototype.dispatchEvent = originalDispatchEvent;
    };
  }, []);

  // =========================================================================
  // GUARANTEED 1ST-CLICK NAVIGATION & INTENT PRESERVER (CAPTURE PHASE)
  // Ensures instant app response & cleans up click-jack overlays during cooldown
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
      pendingIntentRef.current = {
        path: resolved.path,
        element: resolved.element,
        timestamp: Date.now(),
      };
    };

    const handleGlobalClickCapture = (e: MouseEvent) => {
      const x = e.clientX;
      const y = e.clientY;
      const target = e.target as HTMLElement | null;

      lastClickRef.current = { x, y, target };

      const resolved = resolveIntendedAction(target, { x, y });
      pendingIntentRef.current = {
        path: resolved.path,
        element: resolved.element,
        timestamp: Date.now(),
      };

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
