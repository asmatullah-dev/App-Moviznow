import { UpcomingSubscription, Content, Season, Episode, UserProfile } from '../types';
import { safeStorage } from './safeStorage';

const LOCAL_STORAGE_KEY = 'moviznow_upcoming_subscriptions';

/**
 * Get all upcoming notifications registered locally or in user profile
 */
export function getUpcomingSubscriptions(userProfile?: UserProfile | null): UpcomingSubscription[] {
  let localSubs: UpcomingSubscription[] = [];
  try {
    const raw = safeStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) {
      localSubs = JSON.parse(raw);
    }
  } catch (e) {
    console.warn('Failed to parse upcoming subscriptions from local storage:', e);
  }

  // Merge with profile subscriptions if user is logged in
  if (userProfile && Array.isArray(userProfile.upcomingSubscriptions)) {
    const map = new Map<string, UpcomingSubscription>();
    localSubs.forEach(s => map.set(s.id, s));
    userProfile.upcomingSubscriptions.forEach(s => map.set(s.id, s));
    return Array.from(map.values());
  }

  return localSubs;
}

/**
 * Save upcoming subscriptions to local storage
 */
export function saveUpcomingSubscriptions(subs: UpcomingSubscription[]): void {
  try {
    safeStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(subs));
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
  const subs = getUpcomingSubscriptions(userProfile);
  return subs.some(s => {
    if (s.contentId !== contentId) return false;
    if (seasonNumber !== undefined && s.seasonNumber !== seasonNumber) return false;
    if (episodeNumber !== undefined && s.episodeNumber !== episodeNumber) return false;
    return true;
  });
}

/**
 * Toggle upcoming subscription (register or remove)
 */
export function toggleUpcomingSubscription(
  item: {
    contentId: string;
    contentTitle: string;
    posterUrl?: string;
    seasonNumber?: number;
    episodeNumber?: number;
    episodeTitle?: string;
    airDate?: string;
  },
  userProfile?: UserProfile | null,
  updateUserProfile?: (updates: Partial<UserProfile>) => Promise<void> | void
): { isSubscribed: boolean; subscriptions: UpcomingSubscription[] } {
  const id = `sub_${item.contentId}${item.seasonNumber !== undefined ? `_S${item.seasonNumber}` : ''}${item.episodeNumber !== undefined ? `_E${item.episodeNumber}` : ''}`;
  let currentSubs = getUpcomingSubscriptions(userProfile);
  const exists = currentSubs.some(s => s.id === id);

  let updatedSubs: UpcomingSubscription[];
  let isSubscribedNow = false;

  if (exists) {
    // Unsubscribe
    updatedSubs = currentSubs.filter(s => s.id !== id);
  } else {
    // Subscribe
    const newSub: UpcomingSubscription = {
      id,
      contentId: item.contentId,
      contentTitle: item.contentTitle,
      posterUrl: item.posterUrl,
      seasonNumber: item.seasonNumber,
      episodeNumber: item.episodeNumber,
      episodeTitle: item.episodeTitle,
      airDate: item.airDate,
      createdAt: new Date().toISOString(),
      notified: false,
    };
    updatedSubs = [newSub, ...currentSubs];
    isSubscribedNow = true;

    // Request System Notification permission if available
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      try {
        Notification.requestPermission();
      } catch (e) {}
    }
  }

  saveUpcomingSubscriptions(updatedSubs);

  if (userProfile && updateUserProfile) {
    try {
      updateUserProfile({ upcomingSubscriptions: updatedSubs });
    } catch (e) {
      console.warn('Failed to sync upcoming subscriptions to user profile:', e);
    }
  }

  return { isSubscribed: isSubscribedNow, subscriptions: updatedSubs };
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
  let updatedSubs = [...subs];
  let hasChanges = false;

  updatedSubs = updatedSubs.map(sub => {
    if (sub.notified) return sub;

    const content = contentList.find(c => c.id === sub.contentId);
    if (!content) return sub;

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

      const notifTitle = `🎬 New Release: ${sub.contentTitle}`;
      let notifBody = `${sub.contentTitle} is now available to stream!`;
      if (sub.seasonNumber !== undefined) {
        notifBody = sub.episodeNumber !== undefined
          ? `S${String(sub.seasonNumber).padStart(2, '0')} E${String(sub.episodeNumber).padStart(2, '0')} of ${sub.contentTitle} is now available!`
          : `Season ${sub.seasonNumber} of ${sub.contentTitle} is now available!`;
      }

      // Trigger System Web Notification if permitted
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        try {
          new Notification(notifTitle, {
            body: notifBody,
            icon: sub.posterUrl || '/pwa-192x192.png',
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
          posterUrl: sub.posterUrl,
        });
      }

      return {
        ...sub,
        notified: true,
        notifiedAt: new Date().toISOString(),
      };
    }

    return sub;
  });

  if (hasChanges) {
    saveUpcomingSubscriptions(updatedSubs);
    if (userProfile && updateUserProfile) {
      try {
        updateUserProfile({ upcomingSubscriptions: updatedSubs });
      } catch (e) {}
    }
  }

  return triggeredCount;
}
