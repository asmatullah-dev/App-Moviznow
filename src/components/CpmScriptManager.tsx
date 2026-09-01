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

// Global references accessible to top-level window.open interceptor
let globalProfile: any = null;
let globalNavigate: ((path: string) => void) | null = null;
let globalLastClick: { x: number; y: number; target: HTMLElement | null } = { x: 0, y: 0, target: null };
let isExecutingGlobalAction = false;

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

// Helper to execute user's intended navigation/action if hijacked by ad scripts
function executeUserIntendedAction(fallbackCoords?: { x: number; y: number }, fallbackTarget?: HTMLElement | null): void {
  if (isExecutingGlobalAction) return;
  isExecutingGlobalAction = true;
  setTimeout(() => {
    isExecutingGlobalAction = false;
  }, 120);

  const coords = fallbackCoords || globalLastClick;
  let elementUnderneath = fallbackTarget || globalLastClick.target;

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
    if (globalNavigate) {
      globalNavigate(internalPath);
    } else {
      window.location.href = internalPath;
    }
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
}

// Track event listeners added to window / document / body by third-party scripts
const adScriptRegisteredListeners: {
  target: EventTarget;
  type: string;
  listener: EventListenerOrEventListenerObject;
  options?: boolean | AddEventListenerOptions;
}[] = [];

// Helper to remove all event listeners attached by popunder ad scripts
function removeAllAdScriptListeners(): void {
  if (typeof window === 'undefined') return;
  const originalRemoveEventListener = EventTarget.prototype.removeEventListener;

  adScriptRegisteredListeners.forEach(({ target, type, listener, options }) => {
    try {
      originalRemoveEventListener.call(target, type, listener, options);
    } catch (e) {}
  });

  adScriptRegisteredListeners.length = 0;
}

/**
 * COMPLETELY DESTROYS and ERADICATES the popunder script & its DOM artifacts
 * once opened or whenever in cooldown, as if it never existed!
 */
function destroyPopunderScript(): void {
  if (typeof document === 'undefined') return;

  // 1. Remove popunder script elements from DOM
  try {
    document.querySelectorAll('script[src*="99e78b0792c97e620e43154c137cd1f3"]').forEach((el) => el.remove());
    document.querySelectorAll('script[data-popunder-script="true"]').forEach((el) => el.remove());
  } catch (e) {}

  // 2. Unbind all captured event listeners
  removeAllAdScriptListeners();

  // 3. Nullify direct event properties on window, document, body, documentElement
  try {
    const targets = [window, document, document.body, document.documentElement];
    const eventProps = ['onclick', 'onmousedown', 'onmouseup', 'onpointerdown', 'onpointerup', 'ontouchend', 'onfocus'];
    targets.forEach((t) => {
      if (!t) return;
      eventProps.forEach((p) => {
        try {
          (t as any)[p] = null;
        } catch (e) {}
      });
    });
  } catch (e) {}

  // 4. Neutralize global popunder script objects
  try {
    const emptyDummy = {};
    (window as any)._pop = emptyDummy;
    (window as any)._p = emptyDummy;
    (window as any).__pop = emptyDummy;
    (window as any).popunder = emptyDummy;
    (window as any).commercialhalftime = emptyDummy;
  } catch (e) {}

  // 5. Remove invisible overlay divs / iframes / links appended outside #root by popunder script
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

        // Check if element is an ad overlay (fixed, full screen, invisible/transparent or external ad link/iframe)
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

// PERMANENT GLOBAL INTERCEPTIONS (EXECUTE ONCE AT MODULE LOAD TIME)
if (typeof window !== 'undefined' && !(window as any).__adShieldGlobalIntercepted) {
  (window as any).__adShieldGlobalIntercepted = true;

  // 1. Intercept EventTarget.prototype.addEventListener to capture popunder script click listeners
  const originalAddEventListener = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (type, listener, options) {
    const isMainTarget =
      this === window ||
      this === document ||
      this === document.body ||
      this === document.documentElement;

    if (isMainTarget && listener) {
      adScriptRegisteredListeners.push({
        target: this,
        type,
        listener,
        options,
      });
    }

    return originalAddEventListener.call(this, type, listener, options);
  };

  // 2. Intercept document.createElement for hidden iframes
  const originalCreateElement = document.createElement;
  document.createElement = function (tagName: string, options?: ElementCreationOptions) {
    const element = originalCreateElement.call(this, tagName, options);
    if (String(tagName).toLowerCase() === 'iframe') {
      try {
        setTimeout(() => {
          const iframe = element as HTMLIFrameElement;
          if (iframe.contentWindow) {
            iframe.contentWindow.open = window.open;
          }
        }, 0);
      } catch (e) {}
    }
    return element;
  };

  // 3. Intercept DOM node append operations to block popunder script tag insertion during cooldown
  const originalAppendChild = Element.prototype.appendChild;
  const originalInsertBefore = Element.prototype.insertBefore;

  function isPopunderScriptNode(node: Node): boolean {
    if (node && node.nodeName === 'SCRIPT') {
      const src = (node as HTMLScriptElement).src || '';
      return src.includes('99e78b0792c97e620e43154c137cd1f3');
    }
    return false;
  }

  Element.prototype.appendChild = function <T extends Node>(node: T): T {
    if (isPopunderScriptNode(node) && isPopunderInCooldown()) {
      console.warn('[AdShield] Blocked popunder script appendChild during 2-minute cooldown.');
      return node;
    }
    return originalAppendChild.call(this, node);
  };

  Element.prototype.insertBefore = function <T extends Node>(node: T, child: Node | null): T {
    if (isPopunderScriptNode(node) && isPopunderInCooldown()) {
      console.warn('[AdShield] Blocked popunder script insertBefore during 2-minute cooldown.');
      return node;
    }
    return originalInsertBefore.call(this, node, child);
  };

  // 4. PERMANENT TOP-LEVEL WINDOW.OPEN OVERRIDE
  const nativeWindowOpen = window.open;

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
      return nativeWindowOpen.call(window, url, target, features);
    }

    // Check for internal SPA routes or exact same origin
    if (urlStr.startsWith('/') || (urlStr.startsWith(window.location.origin) && !urlStr.includes('commercialhalftime'))) {
      return nativeWindowOpen.call(window, url, target, features);
    }

    // If user is VIP / exempt from ads, block ALL external ad window.open calls completely
    if (isUserExemptFromAds(globalProfile)) {
      console.warn('[AdShield] Blocked ad window.open for VIP user:', urlStr);
      executeUserIntendedAction();
      return createDummyWindow();
    }

    // Determine if click originated from an app element (#root) vs an external Social Ad widget outside #root
    const lastTarget = globalLastClick.target;
    const isClickOnAppRoot = !lastTarget || Boolean(lastTarget.closest('#root'));

    // If click was directly on a Social Bar / Social Ad widget outside #root, ALLOW it!
    if (!isClickOnAppRoot) {
      return nativeWindowOpen.call(window, url, target, features);
    }

    // Popunder handling for clicks on app UI (#root):
    if (isPopunderInCooldown()) {
      console.warn('[AdShield] Blocked popunder window.open during 2-minute cooldown:', urlStr);
      destroyPopunderScript();
      executeUserIntendedAction();
      return createDummyWindow();
    }

    // NOT IN COOLDOWN: Trigger 1 popunder NOW and IMMEDIATELY enter 2-minute cooldown!
    recordPopunderTriggered();
    destroyPopunderScript();

    // 1. Open the popunder window
    const popupWindow = nativeWindowOpen.call(window, url, target, features);

    // 2. Defer main-window SPA navigation slightly so it does NOT close or cancel the popunder window gesture
    setTimeout(() => {
      executeUserIntendedAction();
    }, 80);

    return popupWindow || createDummyWindow();
  };

  // 5. Intercept anchor.click and form.submit for ad URLs during cooldown
  const originalAnchorClick = HTMLAnchorElement.prototype.click;
  const originalFormSubmit = HTMLFormElement.prototype.submit;

  HTMLAnchorElement.prototype.click = function () {
    const href = this.href || '';
    const isExempt = isUserExemptFromAds(globalProfile);
    const inCd = isPopunderInCooldown();

    if ((isExempt || inCd) && isAdUrl(href)) {
      console.warn('[AdShield] Blocked popunder anchor.click during cooldown:', href);
      destroyPopunderScript();
      executeUserIntendedAction();
      return;
    }

    return originalAnchorClick.apply(this, arguments as any);
  };

  HTMLFormElement.prototype.submit = function () {
    const action = this.action || '';
    const isExempt = isUserExemptFromAds(globalProfile);
    const inCd = isPopunderInCooldown();

    if ((isExempt || inCd) && isAdUrl(action)) {
      console.warn('[AdShield] Blocked popunder form.submit during cooldown:', action);
      destroyPopunderScript();
      executeUserIntendedAction();
      return;
    }

    return originalFormSubmit.apply(this, arguments as any);
  };
}

export const CpmScriptManager: React.FC = () => {
  const { profile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // Track cooldown state reactively
  const [inCooldown, setInCooldown] = useState<boolean>(isPopunderInCooldown());

  // Keep global refs synced
  globalProfile = profile;
  globalNavigate = navigate;

  // Cooldown timer manager (checks every second)
  useEffect(() => {
    const checkCooldown = () => {
      const remaining = getPopunderCooldownRemaining();
      const active = remaining > 0;
      setInCooldown(active);
      if (active) {
        destroyPopunderScript();
      }
    };

    checkCooldown();
    const interval = setInterval(checkCooldown, 1000);
    return () => clearInterval(interval);
  }, []);

  // Inject or clean up ad scripts based on route, exemption, and cooldown
  useEffect(() => {
    const isLogin = isAdRestrictedRoute(location.pathname);
    const isExempt = isUserExemptFromAds(profile);
    const activeCooldown = isPopunderInCooldown();

    // If on restricted route, user is exempt, or in cooldown: PURGE & DESTROY EVERYTHING!
    if (isLogin || isExempt || activeCooldown || inCooldown) {
      if (isLogin || isExempt) {
        purgeAllAdElements();
      }
      destroyPopunderScript();
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

    // 2. Popunder Script Injection: Only when NOT in cooldown
    let popunderScript = document.querySelector(`script[data-popunder-script="true"]`) as HTMLScriptElement | null;
    if (!popunderScript) {
      destroyPopunderScript();

      popunderScript = document.createElement('script');
      popunderScript.src = `${POPUNDER_SCRIPT_SRC}?_t=${Date.now()}&_r=${Math.random().toString(36).substring(2)}`;
      popunderScript.async = true;
      popunderScript.setAttribute('data-authorized-ad-script', 'true');
      popunderScript.setAttribute('data-popunder-script', 'true');
      document.head.appendChild(popunderScript);
    }
  }, [location.pathname, profile, inCooldown]);

  // Track pointer down coordinates globally for seamless click forwarding
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
      globalLastClick = {
        x,
        y,
        target: e.target as HTMLElement | null,
      };
    };

    const handleGlobalClick = (e: MouseEvent) => {
      if (isUserExemptFromAds(globalProfile)) {
        purgeAllAdElements();
        destroyPopunderScript();
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
