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
    // Remove scripts with the data attribute
    document.querySelectorAll('script[data-popunder-script="true"]').forEach(el => el.remove());
    document.querySelectorAll('script[data-authorized-ad-script="true"]').forEach(el => el.remove());
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

// 2-Minute Popunder Cooldown Constant
export const POPUNDER_COOLDOWN_MS = 2 * 60 * 1000; // 2 minutes in milliseconds

/**
 * Returns remaining cooldown milliseconds (0 if cooldown has expired or not set).
 */
export function getPopunderCooldownRemaining(): number {
  if (typeof window === 'undefined') return 0;
  try {
    const lastTimeStr = localStorage.getItem('lastPopunderTime');
    if (!lastTimeStr) return 0;
    const lastTime = parseInt(lastTimeStr, 10);
    if (isNaN(lastTime)) {
      localStorage.removeItem('lastPopunderTime');
      return 0;
    }
    const remaining = POPUNDER_COOLDOWN_MS - (Date.now() - lastTime);
    if (remaining <= 0) {
      localStorage.removeItem('lastPopunderTime');
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
    localStorage.setItem('lastPopunderTime', Date.now().toString());
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

