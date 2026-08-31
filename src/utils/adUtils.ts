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

/**
 * Checks if the user or content is exempt from all advertisement displays
 * (Google Auto Ads, AdSense Banners, Video Interstitials, CPM Popunders, Social Ads).
 *
 * Exempt roles/statuses:
 * - Admin
 * - Owner
 * - Managers (manager, user_manager, content_manager, editor, isUserManager, permissions)
 * - VIP (Active only - must not be expired or suspended)
 * - Selected Content (User role/status, or content with selected_content status)
 */
export function isUserExemptFromAds(
  profile?: UserProfile | null,
  content?: AdContentCheck | null
): boolean {
  // If content itself is selected_content or free, exempt ads for this content
  if (content) {
    if (
      content.status === 'selected_content' ||
      content.type === 'selected_content' ||
      content.isFree === true
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

  // 5. Active VIP (must not be expired or suspended)
  const isVipRole = role === 'vip' || Boolean((profile as any).isVip);
  if (isVipRole) {
    if (status === 'expired' || status === 'suspended' || status === 'pending') {
      return false;
    }

    if (profile.expiryDate) {
      const expTime = new Date(profile.expiryDate).getTime();
      if (!isNaN(expTime) && expTime <= Date.now()) {
        return false; // Expired VIP is not exempt
      }
    }
    return true; // Active VIP
  }

  return false;
}

