import { logEvent as firebaseLogEvent } from 'firebase/analytics';
import { analytics, analyticsPromise } from '../firebase';
import { safeStorage } from '../utils/safeStorage';

export const logEvent = async (
  type: 'session_start' | 'content_click' | 'link_click' | 'time_spent',
  userId: string,
  data?: {
    contentId?: string;
    contentTitle?: string;
    linkId?: string;
    linkName?: string;
    duration?: number;
    playerType?: string;
  },
  skipFirestore = false
) => {
  if (!userId) return;

  // Don't track if the user is an owner
  try {
    const cachedProfile = safeStorage.getItem('profile_cache');
    if (cachedProfile) {
      const profile = JSON.parse(cachedProfile);
      if (profile.role === 'owner') {
        return;
      }
    }
  } catch (e) {
    // Ignore parse error
  }

  // Update click history locally
  if (type === 'content_click' || type === 'link_click') {
    const title = data?.contentTitle;
    const contentId = data?.contentId || "unknown";
    if (title) {
        try {
            const pendingStr = safeStorage.getItem('pending_user_updates') || '{}';
            let pendingAll = JSON.parse(pendingStr);
            pendingAll[userId] = pendingAll[userId] || {};
            
            let rawHistory: any[] = pendingAll[userId].clickHistory;
            if (!rawHistory) {
                const cachedProfile = safeStorage.getItem('profile_cache');
                if (cachedProfile) {
                    const profile = JSON.parse(cachedProfile);
                    rawHistory = profile.clickHistory || [];
                } else {
                    rawHistory = [];
                }
            }
            
            // Normalize the history to be objects { id, label }
            let clickHistory: { id: string; label: string }[] = rawHistory.map(entry => {
               if (typeof entry === 'string') {
                   return { id: "unknown", label: entry };
               }
               return entry;
            });
            
            // Find existing entry for this title
            const contentIndex = clickHistory.findIndex((entry) => entry.label.startsWith(title + ' -'));
            
            if (contentIndex !== -1) {
                let entry = clickHistory[contentIndex];
                // Ensure id is set correctly if it was unknown
                if (entry.id === "unknown") entry.id = contentId;
                
                const prefix = `${title} - `;
                const remainder = entry.label.substring(prefix.length); // e.g. "2 times" or "S1E2 - 1 time" or "S1E2, S1E3"
                
                if (type === 'content_click') {
                    if (remainder.match(/^\d+ times?$/)) {
                        const times = parseInt(remainder) + 1;
                        entry.label = `${title} - ${times} time${times > 1 ? 's' : ''}`;
                    }
                } else if (type === 'link_click' && data?.linkName) {
                    const linkName = data.linkName;
                    const isSingleLinkWithTime = remainder.match(/^(.+) - 1 time$/);
                    
                    if (remainder.match(/^\d+ times?$/)) {
                        entry.label = `${title} - ${linkName} - 1 time`;
                    } else if (isSingleLinkWithTime) {
                        const existingLink = isSingleLinkWithTime[1];
                        if (existingLink !== linkName) {
                            entry.label = `${title} - ${existingLink}, ${linkName}`;
                        } else {
                            entry.label = `${title} - ${linkName} - 1 time`;
                        }
                    } else {
                        if (!remainder.includes(linkName)) {
                            const clearLinks = remainder.replace(/ - \d+ times?$/, '');
                            entry.label = `${title} - ${clearLinks}, ${linkName}`;
                        }
                    }
                }
                
                const item = clickHistory.splice(contentIndex, 1)[0];
                clickHistory.unshift(item);
            } else {
                if (type === 'content_click') {
                    clickHistory.unshift({ id: contentId, label: `${title} - 1 time` });
                } else if (type === 'link_click' && data?.linkName) {
                    clickHistory.unshift({ id: contentId, label: `${title} - ${data?.linkName} - 1 time` });
                }
            }
            
            clickHistory = clickHistory.slice(0, 5);
            
            pendingAll[userId].clickHistory = clickHistory;
            safeStorage.setItem('pending_user_updates', JSON.stringify(pendingAll));
            safeStorage.setItem('needs_user_sync', 'true');
        } catch (e) {
             console.error("Failed to update click history", e);
        }
    }
  }

  try {
    // Log to Google Analytics if initialized
    const gaInstance = analytics || await analyticsPromise;
    const appVer = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '2.3.0';
    
    if (gaInstance) {
      try {
        firebaseLogEvent(gaInstance, type, {
          user_id: userId,
          app_version: appVer,
          ...data
        });
      } catch (e) {
        // ignore
      }
    }
    
    // Always log to standalone gtag if available (more reliable)
    if (typeof window !== 'undefined' && 'gtag' in window) {
      // @ts-ignore
      window.gtag('event', type, {
        user_id: userId,
        app_version: appVer,
        ...data
      });
    }
  } catch (error) {
    console.error('Error logging analytics event:', error);
  }
};

export const updateTimeSpent = async (userId: string, minutes: number) => {
  if (!userId || minutes <= 0) return;
  
  try {
    // Also log an event to GA4
    await logEvent('time_spent', userId, { duration: minutes }, true);
  } catch (error) {
    console.error('Error updating time spent:', error);
  }
};
