import { doc, updateDoc, increment } from 'firebase/firestore';
import { logEvent as firebaseLogEvent } from 'firebase/analytics';
import { db, analytics } from '../firebase';

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
  }
) => {
  if (!userId) return;

  try {
    // Log to Google Analytics if initialized
    if (analytics) {
      firebaseLogEvent(analytics, type, {
        user_id: userId,
        ...data
      });
    }

    // Keep sessionsCount in Firestore for the User Profile UI
    if (type === 'session_start') {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        sessionsCount: increment(1)
      });
    }
  } catch (error) {
    console.error('Error logging analytics event:', error);
  }
};

export const updateTimeSpent = async (userId: string, minutes: number) => {
  if (!userId || minutes <= 0) return;
  
  try {
    // Keep timeSpent in Firestore for the User Profile UI
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      timeSpent: increment(minutes)
    });
    
    // Also log an event to GA4
    await logEvent('time_spent', userId, { duration: minutes });
  } catch (error) {
    console.error('Error updating time spent:', error);
  }
};
