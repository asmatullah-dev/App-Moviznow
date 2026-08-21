import { UserProfile } from '../types';

/**
 * Checks if the user is exempt from all advertisement displays
 * (Google Auto Ads, AdSense Banners, Video Interstitials).
 *
 * Exempt roles/statuses:
 * - VIP User
 * - Admin
 * - Owner
 * - Content Manager
 * - User Manager
 * - Selected Content User
 */
export function isUserExemptFromAds(profile?: UserProfile | null): boolean {
  if (!profile) return false; // Guest / unauthenticated users are not exempt (keep as-is)

  const role = profile.role;
  const status = profile.status;

  // 1. VIP User
  if (role === 'vip' || (profile as any).isVip) return true;

  // 2. Admin
  if (role === 'admin') return true;

  // 3. Owner
  if (role === 'owner') return true;

  // 4. Content Manager
  if (role === 'content_manager' || (role as any) === 'editor') return true;

  // 5. User Manager
  if (role === 'user_manager' || role === 'manager' || profile.isUserManager) return true;

  // 6. Selected Content User
  if (role === 'selected_content' || (status as string) === 'selected_content') return true;

  return false;
}
