import { UserProfile } from '../types';

/**
 * Checks if current page / route is strictly ad-free (e.g. Login page).
 */
export function isAdRestrictedRoute(pathname?: string): boolean {
  let path = pathname;
  if (!path && typeof window !== 'undefined') {
    path = window.location.pathname;
  }
  if (!path) return false;
  const lower = path.toLowerCase();
  return lower === '/login' || lower.startsWith('/login/') || lower.startsWith('/login?');
}

/**
 * Remove all injected ad scripts and network elements from the DOM.
 */
export function purgeAllAdElements(): void {
  if (typeof document === 'undefined') return;

  // 1. Remove all ad network scripts (AdSense, Monetag, Adsterra/commercialhalftime, CPM networks)
  // BE CAREFUL: Do not block Social Bar (f0270bbaca005a7be1c664c3c0ae0386.js)
  const adScriptPatterns = [
    '99e78b0792c97e620e43154c137cd1f3', // Specific Popunder ID
    'nap5k.com',
    'n6wxm.com',
    'workdeadlinededicate.com',
    'profitableratecpmnetwork',
    'monetag',
    'adsterra',
    'adsbygoogle.js',
  ];

  try {
    const scripts = document.querySelectorAll('script');
    scripts.forEach(s => {
      const src = s.src || '';
      // If it matches a known popunder pattern AND is NOT the social bar
      if (adScriptPatterns.some(pattern => src.includes(pattern)) && !src.includes('f0270bbaca005a7be1c664c3c0ae0386')) {
        s.remove();
      }
    });
    // Remove scripts with the popunder data attribute or ad network scripts
    document.querySelectorAll('script[data-popunder-script="true"]').forEach(el => el.remove());
  } catch (e) {}

  // 2. Clear potential global variables that ad scripts use
  try {
    const globalsToClear = [
      '_pop', '_pop_config', '_pop_script', 'adsbygoogle', 
      'CommercialHalftime', 'Adsterra', 'Monetag', 
      '__p_scr', '__p_config'
    ];
    globalsToClear.forEach(g => {
      if ((window as any)[g]) {
        try { (window as any)[g] = undefined; } catch (err) {}
      }
    });
  } catch (e) {}

  // 3. Remove injected Monetag / Popunder / Vignette / AdSense overlay or container elements
  try {
    const selectors = [
      'ins.adsbygoogle',
      'div[id^="google_ads_iframe"]',
      'iframe[src*="commercialhalftime"]',
      'iframe[src*="nap5k"]',
      'iframe[src*="n6wxm"]',
      'iframe[id*="google_ads"]',
      'div[class*="monetag"]',
      'div[class*="vignette"]',
      'div[id*="monetag"]',
      'div[id*="zone_"]',
      'div[id^="ad-"]',
      'div[id^="popunder-"]',
      '.pub_300x250',
    ];
    selectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        const htmlEl = el as HTMLElement;
        if (!htmlEl.closest('#root') && htmlEl.id !== 'omdb-modal-root') {
          htmlEl.remove();
        }
      });
    });

    // Aggressive Overlay & Click-Catcher Killer: Remove any fixed/absolute elements outside #root that cover the screen or catch clicks
    // Do NOT remove Social Bar containers (usually have high z-index but specific classes or IDs)
    const allOutsideElements = document.querySelectorAll('body > *:not(#root):not(script):not(style):not(#omdb-modal-root)');
    allOutsideElements.forEach((el) => {
      const htmlEl = el as HTMLElement;
      if (htmlEl.hasAttribute('data-app-portal') || htmlEl.id === 'omdb-modal-root') return;
      
      // Keep Social Bar container if identifiable (often contains 'social' or specific network markers)
      const id = (htmlEl.id || '').toLowerCase();
      const className = (typeof htmlEl.className === 'string' ? htmlEl.className : '').toLowerCase();
      if (id.includes('social') || className.includes('social') || id.includes('pro-') || className.includes('pro-')) return;
      
      try {
        const style = window.getComputedStyle(htmlEl);
        const isFixed = style.position === 'fixed' || style.position === 'absolute';
        const zIndex = parseInt(style.zIndex, 10);
        
        // Remove transparent click catchers (e.g. opacity 0, or high z-index overlays)
        const opacity = parseFloat(style.opacity);
        if (isFixed && (zIndex > 50 || zIndex === 2147483647 || isNaN(zIndex))) {
          const width = htmlEl.offsetWidth || window.innerWidth;
          const height = htmlEl.offsetHeight || window.innerHeight;
          const screenWidth = window.innerWidth;
          const screenHeight = window.innerHeight;
          
          // If it covers more than 30% of the screen or is a transparent overlay
          if ((width > screenWidth * 0.3 && height > screenHeight * 0.3) || (opacity < 0.1 && width > 100 && height > 100)) {
            htmlEl.remove();
          }
        }
      } catch (err) {}
    });
  } catch (e) {}
}

export interface AdContentCheck {
  id?: string;
  status?: string;
  type?: string;
  isFree?: boolean;
}

// 30-Second Popunder Cooldown Constant (Maximized Click Frequency & Revenue)
export const POPUNDER_COOLDOWN_MS = 30 * 1000; // 30 seconds in milliseconds

/**
 * Thoroughly clears Adsterra and CPM network capping cookies, localStorage tokens,
 * and sessionStorage items to ensure fresh session initialization after cooldown.
 */
export function clearAdNetworkSessionCookiesAndStorage(): void {
  if (typeof window === 'undefined') return;

  // 1. Clear Ad Network Cookies from document.cookie
  try {
    const cookies = document.cookie ? document.cookie.split(';') : [];
    const hostname = window.location.hostname;
    const hostParts = hostname.split('.');
    const rootDomain = hostParts.length > 1 ? hostParts.slice(-2).join('.') : hostname;

    const adCookiePatterns = [
      '_pop', 'pl_', '_pl', '_pst', '__pst', 'pst', 'cpm', '99e78b', 'f0270b', 
      'commercial', 'adsterra', 'zone', 'cap', 'freq', 'monetag'
    ];

    cookies.forEach((c) => {
      const eqPos = c.indexOf('=');
      const name = eqPos > -1 ? c.substr(0, eqPos).trim() : c.trim();
      const lowerName = name.toLowerCase();

      // Ensure we don't clear app tokens
      if (lowerName.includes('token') || lowerName.includes('auth') || lowerName.includes('user') || lowerName.includes('session_id')) {
        return;
      }

      if (adCookiePatterns.some((pattern) => lowerName.includes(pattern))) {
        // Expire cookie across paths and domain variations
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=${hostname}`;
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=.${hostname}`;
        if (rootDomain !== hostname) {
          document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=.${rootDomain}`;
        }
      }
    });
  } catch (e) {}

  // 2. Clear Ad Network LocalStorage & SessionStorage keys
  try {
    const adStoragePatterns = ['_pop', 'pl_', '_pl', '_pst', '__pst', 'cpm', 'commercial', 'adsterra', 'zone_', 'monetag'];

    // SessionStorage
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const key = sessionStorage.key(i);
      if (key && adStoragePatterns.some((p) => key.toLowerCase().includes(p))) {
        sessionStorage.removeItem(key);
      }
    }

    // LocalStorage (preserve lastPopunderTime)
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (
        key &&
        key !== 'lastPopunderTime' &&
        adStoragePatterns.some((p) => key.toLowerCase().includes(p))
      ) {
        localStorage.removeItem(key);
      }
    }
  } catch (e) {}

  // 3. Clear window globals
  try {
    const globals = [
      '_pop', '_pop_config', '_pop_script', '__p_scr', '__p_config',
      'CommercialHalftime', 'Adsterra', 'Monetag', '_pl', '_pst'
    ];
    globals.forEach((g) => {
      try {
        if ((window as any)[g]) {
          delete (window as any)[g];
          (window as any)[g] = undefined;
        }
      } catch (err) {}
    });
  } catch (e) {}
}

/**
 * Checks if a given URL is a legitimate user action / whitelisted external service
 * (WhatsApp, Telegram, YouTube, tel, mailto, blob, internal routes, etc.)
 */
export function isAppWhitelistedUrl(rawUrl?: string | URL | null): boolean {
  if (!rawUrl) return false;
  const urlStr = String(rawUrl).trim();
  if (!urlStr || urlStr === '#' || urlStr === 'javascript:void(0)' || urlStr === 'javascript:;') {
    return false;
  }

  // Internal routes
  if (urlStr.startsWith('/') || (typeof window !== 'undefined' && urlStr.startsWith(window.location.origin))) {
    return true;
  }

  const lower = urlStr.toLowerCase();
  return (
    lower.startsWith('https://wa.me/') ||
    lower.startsWith('https://api.whatsapp.com') ||
    lower.startsWith('https://whatsapp.com') ||
    lower.startsWith('https://www.whatsapp.com') ||
    lower.startsWith('https://t.me/') ||
    lower.includes('telegram.me') ||
    lower.includes('telegram.org') ||
    lower.includes('youtube.com') ||
    lower.includes('youtu.be') ||
    lower.startsWith('tel:') ||
    lower.startsWith('mailto:') ||
    lower.startsWith('sms:') ||
    lower.startsWith('blob:') ||
    lower.startsWith('data:')
  );
}

/**
 * Returns remaining cooldown milliseconds (0 if cooldown has expired or not set).
 */
export function getPopunderCooldownRemaining(): number {
  if (typeof window === 'undefined') return 0;
  try {
    let lastTime = 0;
    const lastTimeStr = localStorage.getItem('lastPopunderTime');
    if (lastTimeStr) {
      lastTime = parseInt(lastTimeStr, 10);
    }
    
    // In-memory fallback
    const memTime = (window as any).__LAST_POPUNDER_TIME__;
    if (typeof memTime === 'number' && memTime > lastTime) {
      lastTime = memTime;
    }

    if (!lastTime || isNaN(lastTime)) {
      return 0;
    }

    const remaining = POPUNDER_COOLDOWN_MS - (Date.now() - lastTime);
    if (remaining <= 0) {
      localStorage.removeItem('lastPopunderTime');
      delete (window as any).__LAST_POPUNDER_TIME__;
      return 0;
    }
    return remaining;
  } catch (e) {
    return 0;
  }
}

/**
 * Checks if popunder ads are currently in the 2-minute cooldown period.
 */
export function isPopunderInCooldown(): boolean {
  return getPopunderCooldownRemaining() > 0;
}

/**
 * Records the current timestamp as the start of a 2-minute popunder cooldown.
 */
export function recordPopunderTriggered(): void {
  if (typeof window === 'undefined') return;
  try {
    const now = Date.now();
    localStorage.setItem('lastPopunderTime', now.toString());
    (window as any).__LAST_POPUNDER_TIME__ = now;
    // Broadcast event across all components in current window
    try {
      window.dispatchEvent(new CustomEvent('popunder_cooldown_update', { detail: { timestamp: now } }));
    } catch (err) {}
  } catch (e) {}
}

/**
 * Checks if the user or content is exempt from all advertisement displays
 * (Google Auto Ads, AdSense Banners, Video Interstitials, CPM Popunders, Social Ads).
 *
 * Exempt roles/statuses:
 * - Admin
 * - Owner
 * - Managers (manager, user_manager, content_manager, editor, isUserManager, permissions)
 * - VIP (Role/Plan = 'vip', or isVip = true, unless expired or suspended)
 * - Selected Content (User role/status, or content with selected_content status)
 */
export function isUserExemptFromAds(
  profile?: UserProfile | null,
  content?: AdContentCheck | null
): boolean {
  // If content itself is selected_content, exempt ads for this content
  if (content) {
    if (
      content.status === 'selected_content' ||
      content.type === 'selected_content'
    ) {
      return true;
    }
  }

  if (!profile) return false;

  const role = (profile.role || '').toLowerCase();
  const status = (profile.status || '').toLowerCase();

  // 1. Owner
  if (role === 'owner') return true;

  // 2. Admin
  if (role === 'admin') return true;

  // 3. Managers (all variations)
  if (
    role === 'manager' ||
    role === 'user_manager' ||
    role === 'content_manager' ||
    role === 'editor' ||
    Boolean(profile.isUserManager) ||
    (Array.isArray(profile.permissions) && profile.permissions.length > 0)
  ) {
    return true;
  }

  // 4. Selected Content User
  if (role === 'selected_content' || status === 'selected_content') {
    return true;
  }

  // 5. VIP Users (Ad-Free)
  // Comprehensive check for VIP role, planRole, isVip flag, membershipTier, or planName
  const isVipRole =
    role === 'vip' ||
    Boolean((profile as any).isVip) ||
    Boolean((profile as any).vip) ||
    (profile as any).planRole === 'vip' ||
    (profile as any).membershipRole === 'vip' ||
    (profile as any).membershipTier === 'vip' ||
    String((profile as any).planName || '').toLowerCase().includes('vip') ||
    status === 'vip';

  if (isVipRole) {
    // Expired or suspended VIP users are not exempt
    if (status === 'expired' || status === 'suspended') {
      return false;
    }

    if (profile.expiryDate) {
      const expTime = new Date(profile.expiryDate).getTime();
      if (!isNaN(expTime) && expTime <= Date.now()) {
        return false; // Expired VIP
      }
    }
    return true; // Active VIP is 100% exempt from ALL ads & popunders
  }

  return false;
}

