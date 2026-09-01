import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
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

let globalProfile: any = null;

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

/**
 * Removes popunder script elements and ad overlays without touching app event listeners.
 */
function removePopunderScriptsAndOverlays(): void {
  if (typeof document === 'undefined') return;

  // 1. Remove popunder script elements from DOM
  try {
    document.querySelectorAll('script[src*="99e78b0792c97e620e43154c137cd1f3"]').forEach((el) => el.remove());
    document.querySelectorAll('script[data-popunder-script="true"]').forEach((el) => el.remove());
  } catch (e) {}

  // 2. Clear ad-script global objects so cached scripts deactivate
  try {
    const emptyObj = {};
    (window as any)._pop = emptyObj;
    (window as any)._p = emptyObj;
    (window as any).__pop = emptyObj;
    (window as any).popunder = emptyObj;
  } catch (e) {}

  // 3. Remove any ad overlays created outside #root
  try {
    if (document.body) {
      document.body.querySelectorAll('div, ins, iframe, a').forEach((el) => {
        const htmlEl = el as HTMLElement;
        if (htmlEl.id === 'root' || htmlEl.closest('#root')) return;
        if (htmlEl.id === 'omdb-modal-root' || htmlEl.hasAttribute('data-app-portal')) return;
        if (htmlEl.hasAttribute('data-authorized-ad-script')) return;

        // Allow Social Bar elements
        const isSocialBar =
          htmlEl.id?.includes('social') ||
          htmlEl.className?.includes('social') ||
          Boolean(htmlEl.querySelector('script[src*="f0270bbaca005a7be1c664c3c0ae0386"]'));
        if (isSocialBar) return;

        const style = window.getComputedStyle(htmlEl);
        const isFixedFull = style.position === 'fixed' && parseInt(style.zIndex, 10) > 100;
        const isAdLink = htmlEl.tagName === 'A' && (htmlEl as HTMLAnchorElement).target === '_blank' && isAdUrl((htmlEl as HTMLAnchorElement).href);
        const isAdIframe = htmlEl.tagName === 'IFRAME' && isAdUrl((htmlEl as HTMLIFrameElement).src);

        if (isFixedFull || isAdLink || isAdIframe) {
          htmlEl.remove();
        }
      });
    }
  } catch (e) {}
}

// SETUP TOP-LEVEL WINDOW.OPEN & AD SCRIPT INTERCEPTORS ONCE
if (typeof window !== 'undefined' && !(window as any).__adShieldGlobalSetup) {
  (window as any).__adShieldGlobalSetup = true;

  const nativeWindowOpen = window.open;

  window.open = function (url?: string | URL, target?: string, features?: string) {
    const urlStr = String(url || '').trim();

    // Whitelist legitimate app URLs (WhatsApp, Telegram, YouTube, tel, mailto, blob, etc.)
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
      return nativeWindowOpen.call(window, url, target, features);
    }

    // Allow internal app route navigations or same-origin window.open
    if (urlStr.startsWith('/') || (urlStr.startsWith(window.location.origin) && !urlStr.includes('commercialhalftime'))) {
      return nativeWindowOpen.call(window, url, target, features);
    }

    // VIP / Exempt users -> Block external ad popups completely
    if (isUserExemptFromAds(globalProfile)) {
      console.warn('[AdShield] Blocked ad window.open for VIP user:', urlStr);
      return createDummyWindow();
    }

    // In 2-Minute Cooldown -> Block popunder window.open completely
    if (isPopunderInCooldown()) {
      console.warn('[AdShield] Blocked popunder window.open during 2-minute cooldown:', urlStr);
      removePopunderScriptsAndOverlays();
      return createDummyWindow();
    }

    // NOT in cooldown -> Trigger popunder NOW and enter 2-minute cooldown!
    recordPopunderTriggered();
    removePopunderScriptsAndOverlays();

    const popupWindow = nativeWindowOpen.call(window, url, target, features);
    return popupWindow || createDummyWindow();
  };

  // Intercept anchor.click and form.submit for ad URLs during cooldown
  const originalAnchorClick = HTMLAnchorElement.prototype.click;
  const originalFormSubmit = HTMLFormElement.prototype.submit;

  HTMLAnchorElement.prototype.click = function () {
    const href = this.href || '';
    const isExempt = isUserExemptFromAds(globalProfile);
    const inCd = isPopunderInCooldown();

    if ((isExempt || inCd) && isAdUrl(href)) {
      console.warn('[AdShield] Blocked ad anchor.click during cooldown:', href);
      removePopunderScriptsAndOverlays();
      return;
    }

    return originalAnchorClick.apply(this, arguments as any);
  };

  HTMLFormElement.prototype.submit = function () {
    const action = this.action || '';
    const isExempt = isUserExemptFromAds(globalProfile);
    const inCd = isPopunderInCooldown();

    if ((isExempt || inCd) && isAdUrl(action)) {
      console.warn('[AdShield] Blocked ad form.submit during cooldown:', action);
      removePopunderScriptsAndOverlays();
      return;
    }

    return originalFormSubmit.apply(this, arguments as any);
  };
}

export const CpmScriptManager: React.FC = () => {
  const { profile } = useAuth();
  const location = useLocation();

  // Track cooldown state reactively
  const [inCooldown, setInCooldown] = useState<boolean>(isPopunderInCooldown());

  globalProfile = profile;

  // Monitor cooldown status every second
  useEffect(() => {
    const checkCooldown = () => {
      const remaining = getPopunderCooldownRemaining();
      const active = remaining > 0;
      setInCooldown(active);
      if (active) {
        removePopunderScriptsAndOverlays();
      }
    };

    checkCooldown();
    const interval = setInterval(checkCooldown, 1000);
    return () => clearInterval(interval);
  }, []);

  // Manage ad script insertion/removal
  useEffect(() => {
    const isLogin = isAdRestrictedRoute(location.pathname);
    const isExempt = isUserExemptFromAds(profile);
    const activeCooldown = isPopunderInCooldown();

    // If on login route, exempt, or in cooldown -> clean up popunder scripts
    if (isLogin || isExempt || activeCooldown || inCooldown) {
      if (isLogin || isExempt) {
        purgeAllAdElements();
      }
      removePopunderScriptsAndOverlays();
      return;
    }

    // 1. Social Bar: Inject for non-exempt users on valid routes
    let socialScript = document.querySelector(`script[src*="f0270bbaca005a7be1c664c3c0ae0386"]`) as HTMLScriptElement | null;
    if (!socialScript) {
      socialScript = document.createElement('script');
      socialScript.src = `${SOCIAL_BAR_SCRIPT_SRC}?_cb=${Date.now()}`;
      socialScript.async = true;
      socialScript.setAttribute('data-authorized-ad-script', 'true');
      document.head.appendChild(socialScript);
    }

    // 2. Popunder Script: Inject ONLY when NOT in cooldown
    let popunderScript = document.querySelector(`script[data-popunder-script="true"]`) as HTMLScriptElement | null;
    if (!popunderScript) {
      removePopunderScriptsAndOverlays();

      popunderScript = document.createElement('script');
      popunderScript.src = `${POPUNDER_SCRIPT_SRC}?_t=${Date.now()}&_r=${Math.random().toString(36).substring(2)}`;
      popunderScript.async = true;
      popunderScript.setAttribute('data-authorized-ad-script', 'true');
      popunderScript.setAttribute('data-popunder-script', 'true');
      document.head.appendChild(popunderScript);
    }
  }, [location.pathname, profile, inCooldown]);

  return null;
};
