import { UserProfile, Content } from '../types';
import { ADMIN_EMAILS } from '../contexts/UsersContext';

export const STAFF_ROLES = [
  'owner',
  'admin',
  'content_manager',
  'user_manager',
  'manager',
  'editor'
] as const;

export const CONTENT_MANAGEMENT_ROLES = [
  'owner',
  'admin',
  'content_manager',
  'editor',
  'manager'
] as const;

export const USER_MANAGEMENT_ROLES = [
  'owner',
  'admin',
  'user_manager',
  'manager'
] as const;

/**
 * Checks if a user is an admin by email whitelist
 */
export function isWhitelistedAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase().trim());
}

/**
 * Checks if user is an owner or admin
 */
export function isSuperAdmin(profile?: UserProfile | null, user?: { email?: string | null } | null): boolean {
  if (!profile && !user) return false;
  if (profile?.role === 'owner' || profile?.role === 'admin') return true;
  return isWhitelistedAdminEmail(user?.email || profile?.email);
}

/**
 * Checks if the user has permission to manage catalog content (movies, series, collections, genres)
 */
export function canManageContent(profile?: UserProfile | null, user?: { email?: string | null } | null): boolean {
  if (!profile && !user) return false;
  if (isWhitelistedAdminEmail(user?.email || profile?.email)) return true;
  return CONTENT_MANAGEMENT_ROLES.includes((profile?.role || '') as any);
}

/**
 * Checks if the user has permission to manage users, roles, and subscriptions
 */
export function canManageUsers(profile?: UserProfile | null, user?: { email?: string | null } | null): boolean {
  if (!profile && !user) return false;
  if (isWhitelistedAdminEmail(user?.email || profile?.email)) return true;
  return USER_MANAGEMENT_ROLES.includes((profile?.role || '') as any);
}

/**
 * Checks if the user is any staff member
 */
export function isStaffMember(profile?: UserProfile | null, user?: { email?: string | null } | null): boolean {
  if (!profile && !user) return false;
  if (isWhitelistedAdminEmail(user?.email || profile?.email)) return true;
  return STAFF_ROLES.includes((profile?.role || '') as any);
}

/**
 * Checks if the user is allowed to view draft / unpublished content
 */
export function canViewDrafts(profile?: UserProfile | null, user?: { email?: string | null } | null): boolean {
  return canManageContent(profile, user);
}

/**
 * Checks if a user can stream / play a specific content item
 */
export function canUserStreamContent(profile?: UserProfile | null, content?: Content | null): boolean {
  if (!profile || !content) return false;
  if (canManageContent(profile)) return true;

  const isAssigned = profile.assignedContent?.some(
    (id) => id === content.id || id.startsWith(`${content.id}:`)
  );
  if (isAssigned) return true;

  const isSelectedContent = profile.role === 'selected_content';
  const isContentSelectedOnly = content.status === 'selected_content';

  return (
    profile.role !== 'user' &&
    profile.status === 'active' &&
    !(isSelectedContent || isContentSelectedOnly)
  );
}

/**
 * Checks if the user is authorized to use AI translation features.
 * AI translation is strictly restricted to: admin, owner & VIP users only.
 * Users, Basic Users, Guests, Trials, etc. are NOT allowed AI translation.
 */
export function canUserUseAiTranslation(profile?: UserProfile | null, user?: { email?: string | null } | null): boolean {
  if (!profile && !user) return false;
  if (isWhitelistedAdminEmail(user?.email || profile?.email)) return true;
  if (!profile) return false;

  // Admin, Owner & Management staff
  if (
    profile.role === 'owner' || 
    profile.role === 'admin' || 
    profile.role === 'manager' || 
    profile.role === 'content_manager' || 
    profile.role === 'user_manager'
  ) {
    return true;
  }

  // Active VIP users only (must be active or default status, not expired/suspended/deleted)
  if (profile.role === 'vip' && (profile.status === 'active' || !profile.status)) {
    return true;
  }

  // Explicitly deny for Users, Basic Users, Guests, Trials, or any other roles
  return false;
}

