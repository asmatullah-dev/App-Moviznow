import { UpcomingSubscription, Content, Season, UserProfile } from '../types';
import { safeStorage } from './safeStorage';

const LOCAL_STORAGE_KEY = 'moviznow_upcoming_subscriptions';

export interface ParsedUpcomingSubscription {
  id: string;
  contentId: string;
  seasonNumber?: number;
  episodeNumber?: number;
  notified: boolean;
  rawString: string;
}

/**
 * Format subscription parameters into an ultra-minimal compact string
 * Format: contentId[:s<seasonNumber>][:e<episodeNumber>][:<1|0>]
 * Examples:
 *   - "ghxc79aye:s2:e2:1" (Episode subscription, notified)
 *   - "ghxc79aye:s2:e2:0" (Episode subscription, pending)
 *   - "ghxc79aye:s2:0"    (Season subscription, pending)
 *   - "ghxc79aye:0"       (Movie/content subscription, pending)
 */
export function formatSubscriptionString(
  contentId: string,
  seasonNumber?: number,
  episodeNumber?: number,
  notified: boolean = false
): string {
  const parts: string[] = [contentId.trim()];
  if (seasonNumber !== undefined && seasonNumber !== null) {
    parts.push(`s${seasonNumber}`);
  }
  if (episodeNumber !== undefined && episodeNumber !== null) {
    parts.push(`e${episodeNumber}`);
  }
  parts.push(notified ? '1' : '0');
  return parts.join(':');
}

/**
 * Parse a subscription entry (supports both ultra-minimal string format and legacy JSON objects)
 */
export function parseSubscription(raw: string | UpcomingSubscription | any): ParsedUpcomingSubscription {
  if (!raw) {
    return {
      id: '',
      contentId: '',
      notified: false,
      rawString: '',
    };
  }

  // Handle legacy object format
  if (typeof raw === 'object' && raw !== null) {
    const cId = String(raw.contentId || '').trim();
    const sNum = raw.seasonNumber !== undefined && raw.seasonNumber !== null ? Number(raw.seasonNumber) : undefined;
    const eNum = raw.episodeNumber !== undefined && raw.episodeNumber !== null ? Number(raw.episodeNumber) : undefined;
    const isNotified = Boolean(raw.notified);
    const compactStr = formatSubscriptionString(cId, sNum, eNum, isNotified);
    const derivedId = raw.id || `sub_${cId}${sNum !== undefined ? `_S${sNum}` : ''}${eNum !== undefined ? `_E${eNum}` : ''}`;
    return {
      id: derivedId,
      contentId: cId,
      seasonNumber: sNum,
      episodeNumber: eNum,
      notified: isNotified,
      rawString: compactStr,
    };
  }

  // Handle ultra-minimal string format
  const str = String(raw).trim();
  const parts = str.split(':');
  const contentId = parts[0] || '';

  let seasonNumber: number | undefined = undefined;
  let episodeNumber: number | undefined = undefined;
  let notified = false;

  for (let i = 1; i < parts.length; i++) {
    const part = parts[i].trim();
    if (part.startsWith('s') && !isNaN(parseInt(part.slice(1), 10))) {
      seasonNumber = parseInt(part.slice(1), 10);
    } else if (part.startsWith('e') && !isNaN(parseInt(part.slice(1), 10))) {
      episodeNumber = parseInt(part.slice(1), 10);
    } else if (part === '1' || part.toLowerCase() === 'true') {
      notified = true;
    } else if (part === '0' || part.toLowerCase() === 'false') {
      notified = false;
    }
  }

  const derivedId = `sub_${contentId}${seasonNumber !== undefined ? `_S${seasonNumber}` : ''}${episodeNumber !== undefined ? `_E${episodeNumber}` : ''}`;
  return {
    id: derivedId,
    contentId,
    seasonNumber,
    episodeNumber,
    notified,
    rawString: formatSubscriptionString(contentId, seasonNumber, episodeNumber, notified),
  };
}

/**
 * Get all upcoming subscription strings registered locally or in user profile
 */
export function getUpcomingSubscriptionStrings(userProfile?: UserProfile | null): string[] {
  let localSubs: (string | UpcomingSubscription)[] = [];
  try {
    const raw = safeStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) {
      localSubs = JSON.parse(raw);
    }
  } catch (e) {
    console.warn('Failed to parse upcoming subscriptions from local storage:', e);
  }

  const map = new Map<string, string>();

  // Process local items
  if (Array.isArray(localSubs)) {
    localSubs.forEach(item => {
      const parsed = parseSubscription(item);
      if (parsed.contentId) {
        map.set(parsed.id, parsed.rawString);
      }
    });
  }

  // Merge with profile subscriptions if user is logged in
  if (userProfile && Array.isArray(userProfile.upcomingSubscriptions)) {
    userProfile.upcomingSubscriptions.forEach(item => {
      const parsed = parseSubscription(item);
      if (parsed.contentId) {
        map.set(parsed.id, parsed.rawString);
      }
    });
  }

  return Array.from(map.values());
}

/**
 * Backward-compatible helper to get parsed upcoming subscriptions
 */
export function getUpcomingSubscriptions(userProfile?: UserProfile | null): ParsedUpcomingSubscription[] {
  const strings = getUpcomingSubscriptionStrings(userProfile);
  return strings.map(s => parseSubscription(s));
}

/**
 * Save upcoming subscriptions to local storage in ultra-minimal string array format
 */
export function saveUpcomingSubscriptions(subs: (string | UpcomingSubscription)[]): void {
  try {
    const minimalStrings = subs.map(s => {
      const parsed = parseSubscription(s);
      return parsed.rawString;
    });
    safeStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(minimalStrings));
  } catch (e) {
    console.warn('Failed to save upcoming subscriptions to local storage:', e);
  }
}

/**
 * Check if user is subscribed to a specific content/season/episode release
 */
export function isSubscribedToUpcoming(
  contentId: string,
  seasonNumber?: number,
  episodeNumber?: number,
  userProfile?: UserProfile | null
): boolean {
  if (!contentId) return false;
  const subs = getUpcomingSubscriptions(userProfile);
  return subs.some(s => {
    if (s.contentId !== contentId) return false;
    if (seasonNumber !== undefined && s.seasonNumber !== seasonNumber) return false;
    if (episodeNumber !== undefined && s.episodeNumber !== episodeNumber) return false;
    return true;
  });
}

/**
 * Toggle upcoming subscription (register or remove) in ultra-minimal string format
 */
export function toggleUpcomingSubscription(
  item: {
    contentId: string;
    contentTitle?: string;
    posterUrl?: string;
    seasonNumber?: number;
    episodeNumber?: number;
    episodeTitle?: string;
    airDate?: string;
  },
  userProfile?: UserProfile | null,
  updateUserProfile?: (updates: Partial<UserProfile>) => Promise<void> | void
): { isSubscribed: boolean; subscriptions: string[] } {
  const currentSubs = getUpcomingSubscriptions(userProfile);
  
  const existingIdx = currentSubs.findIndex(s => {
    if (s.contentId !== item.contentId) return false;
    if (item.seasonNumber !== undefined && s.seasonNumber !== item.seasonNumber) return false;
    if (item.episodeNumber !== undefined && s.episodeNumber !== item.episodeNumber) return false;
    return true;
  });

  let updatedStringList: string[];
  let isSubscribedNow = false;

  if (existingIdx !== -1) {
    // Unsubscribe: remove item
    updatedStringList = currentSubs
      .filter((_, idx) => idx !== existingIdx)
      .map(s => s.rawString);
  } else {
    // Subscribe: create new minimal entry
    const newEntry = formatSubscriptionString(
      item.contentId,
      item.seasonNumber,
      item.episodeNumber,
      false
    );
    const existingStrings = currentSubs.map(s => s.rawString);
    updatedStringList = [newEntry, ...existingStrings];
    isSubscribedNow = true;

    // Request System Notification permission if available
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      try {
        Notification.requestPermission();
      } catch (e) {}
    }
  }

  saveUpcomingSubscriptions(updatedStringList);

  if (userProfile && updateUserProfile) {
    try {
      updateUserProfile({ upcomingSubscriptions: updatedStringList });
    } catch (e) {
      console.warn('Failed to sync upcoming subscriptions to user profile:', e);
    }
  }

  return { isSubscribed: isSubscribedNow, subscriptions: updatedStringList };
}

/**
 * Check registered upcoming subscriptions against updated content catalog.
 * Triggers system / in-app notifications if subscribed episode has been released or has links added.
 */
export function checkUpcomingSubscriptionsAndNotify(
  contentList: Content[],
  userProfile?: UserProfile | null,
  updateUserProfile?: (updates: Partial<UserProfile>) => Promise<void> | void,
  onNotify?: (notification: { title: string; body: string; contentId: string; posterUrl?: string }) => void
): number {
  if (!contentList || contentList.length === 0) return 0;

  const subs = getUpcomingSubscriptions(userProfile);
  if (subs.length === 0) return 0;

  let triggeredCount = 0;
  let hasChanges = false;

  const updatedStrings: string[] = subs.map(sub => {
    if (sub.notified) return sub.rawString;

    const content = contentList.find(c => c.id === sub.contentId);
    if (!content) return sub.rawString;

    let isAvailableNow = false;

    if (content.type === 'movie') {
      // Check movie links
      try {
        const movieLinks = typeof content.movieLinks === 'string' ? JSON.parse(content.movieLinks) : content.movieLinks || [];
        isAvailableNow = Array.isArray(movieLinks) && movieLinks.some((l: any) => l.url && l.url.trim() !== '');
      } catch (e) {}
    } else if (content.type === 'series') {
      // Check series episode links
      try {
        const seasons: Season[] = typeof content.seasons === 'string' ? JSON.parse(content.seasons) : content.seasons || [];
        if (sub.seasonNumber !== undefined) {
          const targetSeason = seasons.find(s => s.seasonNumber === sub.seasonNumber);
          if (targetSeason) {
            if (sub.episodeNumber !== undefined) {
              const targetEp = targetSeason.episodes?.find(e => e.episodeNumber === sub.episodeNumber);
              if (targetEp) {
                const epLinks = targetEp.links || [];
                isAvailableNow = Array.isArray(epLinks) && epLinks.some((l: any) => l.url && l.url.trim() !== '');
              }
            } else {
              // Season release check
              const zipLinks = targetSeason.zipLinks || [];
              const mkvLinks = targetSeason.mkvLinks || [];
              const hasSeasonLink = [...zipLinks, ...mkvLinks].some((l: any) => l.url && l.url.trim() !== '');
              const hasEpLinks = targetSeason.episodes?.some(e => e.links && e.links.some((l: any) => l.url && l.url.trim() !== ''));
              isAvailableNow = hasSeasonLink || Boolean(hasEpLinks);
            }
          }
        } else {
          // Whole series check
          isAvailableNow = seasons.some(s => s.episodes?.some(e => e.links && e.links.some((l: any) => l.url && l.url.trim() !== '')));
        }
      } catch (e) {}
    }

    if (isAvailableNow) {
      hasChanges = true;
      triggeredCount++;

      const notifTitle = `🎬 New Release: ${content.title}`;
      let notifBody = `${content.title} is now available to stream!`;
      if (sub.seasonNumber !== undefined) {
        notifBody = sub.episodeNumber !== undefined
          ? `S${String(sub.seasonNumber).padStart(2, '0')} E${String(sub.episodeNumber).padStart(2, '0')} of ${content.title} is now available!`
          : `Season ${sub.seasonNumber} of ${content.title} is now available!`;
      }

      // Trigger System Web Notification if permitted
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        try {
          new Notification(notifTitle, {
            body: notifBody,
            icon: content.posterUrl || '/pwa-192x192.png',
            tag: sub.id,
          });
        } catch (e) {}
      }

      // Trigger in-app notification callback
      if (onNotify) {
        onNotify({
          title: notifTitle,
          body: notifBody,
          contentId: sub.contentId,
          posterUrl: content.posterUrl,
        });
      }

      return formatSubscriptionString(sub.contentId, sub.seasonNumber, sub.episodeNumber, true);
    }

    return sub.rawString;
  });

  if (hasChanges) {
    saveUpcomingSubscriptions(updatedStrings);
    if (userProfile && updateUserProfile) {
      try {
        updateUserProfile({ upcomingSubscriptions: updatedStrings });
      } catch (e) {}
    }
  }

  return triggeredCount;
}
