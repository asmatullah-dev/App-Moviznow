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
  const adScriptPatterns = [
    'adsbygoogle.js',
    'commercialhalftime.com',
    'nap5k.com',
    'n6wxm.com',
    'profitableratecpmnetwork',
    'monetag',
    'adsterra',
  ];

  try {
    const scripts = document.querySelectorAll('script');
    scripts.forEach(s => {
      if (adScriptPatterns.some(pattern => s.src && s.src.includes(pattern))) {
        s.remove();
      }
    });
  } catch (e) {}

  // 2. Pause AdSense requests
  try {
    if ((window as any).adsbygoogle) {
      (window as any).adsbygoogle.pauseAdRequests = 1;
    }
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
      '.pub_300x250',
    ];
    selectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => el.remove());
    });
  } catch (e) {}
}

export interface AdContentCheck {
  id?: string;
  status?: string;
  type?: string;
  isFree?: boolean;
}

// 3-Minute Popunder Cooldown Constant
export const POPUNDER_COOLDOWN_MS = 3 * 60 * 1000; // 3 minutes in milliseconds

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
 * Checks if popunder ads are currently in the 3-minute cooldown period.
 */
export function isPopunderInCooldown(): boolean {
  return getPopunderCooldownRemaining() > 0;
}

/**
 * Records the current timestamp as the start of a 3-minute popunder cooldown.
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

