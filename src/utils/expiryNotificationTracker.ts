import { safeStorage } from './safeStorage';

const EXPIRY_TRACKER_STORAGE_KEY = 'moviz_expiry_tracker';
const MAX_DAYS_FOR_NEW_EXPIRY = 5;
const NOTICE_EXPIRY_DAYS = 15;

export interface SentNoticeRecord {
  sentAt: string; // YYYY-MM-DD
  sentTimestamp: number; // ms
  expiryDate: string; // The expiry date for which this notice was sent
}

export interface ExpiryTrackerStorage {
  lastCheckedTimestamp: number;
  lastCleanupTimestamp: number;
  lastAutoCheckDate?: string; // YYYY-MM-DD
  sentNotices: Record<string, SentNoticeRecord>; // keyed by userId
}

export const AUTO_EXPIRY_CHECKED_KEY = 'moviz_auto_expiry_checked_date';

/**
 * Returns today's local date as a YYYY-MM-DD string.
 */
export function getTodayLocalDateString(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Checks if the current local time is strictly within the allowed auto-expiry check window (5:00 AM to 9:00 AM).
 */
export function isWithinExpiryCheckTimeWindow(now = new Date()): boolean {
  const hour = now.getHours();
  const minute = now.getMinutes();
  // 5:00 AM to 9:00 AM inclusive (5:00:00 to 9:00:00)
  if (hour < 5) return false;
  if (hour > 9) return false;
  if (hour === 9 && minute > 0) return false;
  return true;
}

/**
 * Returns true if the daily auto expiry notification check has already been performed today.
 */
export function hasCheckedAutoExpiryToday(now = new Date()): boolean {
  try {
    const todayStr = getTodayLocalDateString(now);
    const storedDate = safeStorage.getItem(AUTO_EXPIRY_CHECKED_KEY);
    if (storedDate === todayStr) return true;

    const tracker = getExpiryTracker();
    if (tracker.lastAutoCheckDate === todayStr) return true;

    return false;
  } catch {
    return false;
  }
}

/**
 * Records that the daily auto expiry check has been completed for today in local storage.
 */
export function recordAutoExpiryCheckedToday(now = new Date()): void {
  try {
    const todayStr = getTodayLocalDateString(now);
    safeStorage.setItem(AUTO_EXPIRY_CHECKED_KEY, todayStr);

    const tracker = getExpiryTracker();
    tracker.lastCheckedTimestamp = now.getTime();
    tracker.lastAutoCheckDate = todayStr;
    saveExpiryTracker(tracker);
  } catch (e) {
    console.warn('[ExpiryTracker] Failed to record daily auto check flag in local storage:', e);
  }
}

/**
 * Determines whether the daily auto expiry notification check can run in User Management:
 * 1. Must be during 5:00 AM to 9:00 AM
 * 2. Must not have already run today
 */
export function canRunDailyAutoExpiryCheck(now = new Date()): boolean {
  if (!isWithinExpiryCheckTimeWindow(now)) {
    return false;
  }
  if (hasCheckedAutoExpiryToday(now)) {
    return false;
  }
  return true;
}

/**
 * Calculates days elapsed since the user's membership expired.
 * Returns negative if the user is not yet expired, or null if no valid expiryDate.
 */
export function getDaysSinceExpiry(expiryDate?: string | null): number | null {
  if (!expiryDate || expiryDate === 'Lifetime' || expiryDate === 'null' || expiryDate === '') return null;
  const cleanDateStr = expiryDate.split('T')[0];
  const parts = cleanDateStr.split('-');
  if (parts.length !== 3) return null;

  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);

  if (isNaN(year) || isNaN(month) || isNaN(day)) return null;

  const localBoundary = new Date(year, month, day + 1, 0, 0, 0, 0);
  const utcBoundary = new Date(Date.UTC(year, month, day + 1, 0, 0, 0, 0));
  const effectiveBoundary = localBoundary > utcBoundary ? localBoundary : utcBoundary;

  const now = new Date();
  if (now < effectiveBoundary) {
    return -1; // Not yet expired
  }

  const msDiff = now.getTime() - effectiveBoundary.getTime();
  return msDiff / (24 * 60 * 60 * 1000);
}

/**
 * Checks if the user expired within the specified days (default 5 days).
 * Returns true ONLY for newly expired users (0 <= days <= 5).
 * Accounts expired more than 5 days ago return false.
 */
export function isExpiredWithinDays(expiryDate?: string | null, maxDays = MAX_DAYS_FOR_NEW_EXPIRY): boolean {
  const days = getDaysSinceExpiry(expiryDate);
  if (days === null || days < 0) return false;
  return days <= maxDays;
}

/**
 * Calculates days elapsed since the notification was sent.
 */
export function getDaysSinceNoticeSent(sentDateStr?: string | null): number | null {
  if (!sentDateStr) return null;
  const cleanDateStr = sentDateStr.split('T')[0];
  const parts = cleanDateStr.split('-');
  if (parts.length !== 3) return null;

  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);

  if (isNaN(year) || isNaN(month) || isNaN(day)) return null;

  const sentTimestamp = new Date(year, month, day, 0, 0, 0, 0).getTime();
  const now = Date.now();
  return (now - sentTimestamp) / (24 * 60 * 60 * 1000);
}

/**
 * Returns true if the notice was sent more than the specified number of days ago (default 5 days).
 */
export function isNoticeSentOlderThanDays(sentDateStr?: string | null, days = NOTICE_EXPIRY_DAYS): boolean {
  const elapsed = getDaysSinceNoticeSent(sentDateStr);
  if (elapsed === null) return false;
  return elapsed > days;
}

/**
 * Retrieves the expiry tracker state from safeStorage / localStorage.
 */
export function getExpiryTracker(): ExpiryTrackerStorage {
  try {
    const raw = safeStorage.getItem(EXPIRY_TRACKER_STORAGE_KEY);
    if (!raw) {
      return { lastCheckedTimestamp: 0, lastCleanupTimestamp: 0, sentNotices: {} };
    }
    const parsed = JSON.parse(raw);
    return {
      lastCheckedTimestamp: parsed.lastCheckedTimestamp || 0,
      lastCleanupTimestamp: parsed.lastCleanupTimestamp || 0,
      sentNotices: parsed.sentNotices || {},
    };
  } catch (e) {
    return { lastCheckedTimestamp: 0, lastCleanupTimestamp: 0, sentNotices: {} };
  }
}

/**
 * Saves the expiry tracker state into safeStorage / localStorage.
 */
export function saveExpiryTracker(tracker: ExpiryTrackerStorage): void {
  try {
    safeStorage.setItem(EXPIRY_TRACKER_STORAGE_KEY, JSON.stringify(tracker));
  } catch (e) {
    console.warn('[ExpiryTracker] Failed to save tracker to storage:', e);
  }
}

/**
 * Checks in localStorage if an expiry notice was already sent recently (within 5 days)
 * for this specific user and expiry date.
 */
export function isNoticeSentRecently(
  userId: string,
  currentExpiryDate?: string | null,
  maxDays = NOTICE_EXPIRY_DAYS
): boolean {
  if (!userId) return false;
  const tracker = getExpiryTracker();
  const record = tracker.sentNotices[userId];
  if (!record) return false;

  const now = Date.now();
  const elapsedDays = (now - record.sentTimestamp) / (24 * 60 * 60 * 1000);

  // If notice was sent more than 5 days ago, delete from storage and return false
  if (elapsedDays > maxDays) {
    delete tracker.sentNotices[userId];
    saveExpiryTracker(tracker);
    return false;
  }

  // If current expiry date is different from the one recorded (e.g. user renewed and now has new expiry),
  // delete the old record and return false so new notice can be sent!
  if (currentExpiryDate) {
    const expDateStr = currentExpiryDate.split('T')[0];
    const recExpStr = (record.expiryDate || '').split('T')[0];
    if (recExpStr && recExpStr !== expDateStr) {
      delete tracker.sentNotices[userId];
      saveExpiryTracker(tracker);
      return false;
    }
  }

  return true;
}

/**
 * Records that an expiry notice was sent for a user in localStorage.
 */
export function recordNoticeSent(userId: string, expiryDate?: string | null): void {
  if (!userId) return;
  const tracker = getExpiryTracker();
  const todayStr = new Date().toISOString().split('T')[0];
  tracker.sentNotices[userId] = {
    sentAt: todayStr,
    sentTimestamp: Date.now(),
    expiryDate: expiryDate ? expiryDate.split('T')[0] : todayStr,
  };
  tracker.lastCheckedTimestamp = Date.now();
  saveExpiryTracker(tracker);
}

/**
 * Clears the notice record for a user in localStorage (e.g. when membership is renewed or after 5 days).
 */
export function clearNoticeRecord(userId: string): void {
  if (!userId) return;
  const tracker = getExpiryTracker();
  if (tracker.sentNotices[userId]) {
    delete tracker.sentNotices[userId];
    saveExpiryTracker(tracker);
  }
}

/**
 * Cleans up sent notice records from localStorage that are older than maxDays (default 5 days).
 * Returns array of user IDs whose records were purged.
 */
export function cleanLocalStorageNotices(maxDays = NOTICE_EXPIRY_DAYS): string[] {
  const tracker = getExpiryTracker();
  const now = Date.now();
  const deletedUserIds: string[] = [];

  Object.entries(tracker.sentNotices).forEach(([uid, record]) => {
    const elapsedDays = (now - record.sentTimestamp) / (24 * 60 * 60 * 1000);
    if (elapsedDays > maxDays) {
      delete tracker.sentNotices[uid];
      deletedUserIds.push(uid);
    }
  });

  tracker.lastCleanupTimestamp = now;
  saveExpiryTracker(tracker);
  return deletedUserIds;
}

/**
 * Updates the last checked timestamp in localStorage to throttle redundant calls.
 */
export function updateLastCheckedTimestamp(): void {
  const tracker = getExpiryTracker();
  tracker.lastCheckedTimestamp = Date.now();
  saveExpiryTracker(tracker);
}
