import { logEvent as firebaseLogEvent } from 'firebase/analytics';
import { analytics, analyticsPromise } from '../firebase';

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

  try {
    // Log to Google Analytics if initialized
    const gaInstance = analytics || await analyticsPromise;
    if (gaInstance) {
      try {
        firebaseLogEvent(gaInstance, type, {
          user_id: userId,
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
