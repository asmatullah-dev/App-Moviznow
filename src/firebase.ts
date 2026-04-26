import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, doc, getDocFromServer, setDoc, collection, enableIndexedDbPersistence } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { getAnalytics, isSupported } from 'firebase/analytics';
import firebaseConfig from '../firebase-applet-config.json';

export const app = initializeApp(firebaseConfig);

// Use initializeFirestore with experimentalForceLongPolling: true to fix connection issues in sandboxed environments
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
}, firebaseConfig.firestoreDatabaseId);

export const auth = getAuth(app);
export const storage = getStorage(app);
export const messaging = typeof window !== 'undefined' ? getMessaging(app) : null;

export const analyticsPromise = typeof window !== 'undefined' 
  ? isSupported()
      .then(yes => (yes && firebaseConfig.measurementId) ? getAnalytics(app) : null)
      .catch((e) => {
        console.warn("Analytics not supported or failed to initialize", e);
        return null;
      })
  : Promise.resolve(null);

export let analytics: any = null;
analyticsPromise.then(a => { analytics = a; });

// Enable offline persistence
if (typeof window !== 'undefined') {
  enableIndexedDbPersistence(db).catch((err) => {
    if (err.code === 'failed-precondition') {
      // Multiple tabs open, persistence can only be enabled in one tab at a a time.
      console.warn('Firestore persistence failed: Multiple tabs open');
    } else if (err.code === 'unimplemented') {
      // The current browser does not support all of the features required to enable persistence
      console.warn('Firestore persistence is not supported by this browser');
    }
  });
}

// Function to request notification permission and get token
export const requestNotificationPermission = async () => {
  if (!messaging || typeof window === 'undefined') return null;
  
  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      // Register service worker explicitly to ensure it's the right one
      let registration;
      if ('serviceWorker' in navigator) {
        // Pass Firebase config via query parameters to the service worker so it dynamically updates on remix
        const configParams = new URLSearchParams(firebaseConfig as any).toString();
        registration = await navigator.serviceWorker.register(`/sw.js?${configParams}`);
      }

      const vapidKey = import.meta.env.VITE_FCM_VAPID_KEY;
      if (!vapidKey) {
        console.warn('FCM VAPID key is missing. Notifications will not work.');
        return null;
      }

      const token = await getToken(messaging, {
        vapidKey,
        serviceWorkerRegistration: registration
      });
      
      if (token) {
        // Optimized: Only store token in Firestore if it changed or hasn't been updated in 24 hours
        const CACHE_KEY = `fcm_token_last_update_${auth.currentUser?.uid || 'anon'}`;
        const lastUpdate = localStorage.getItem(CACHE_KEY);
        const now = Date.now();
        const oneDay = 24 * 60 * 60 * 1000;

        const needsUpdate = !lastUpdate || 
                            JSON.parse(lastUpdate).token !== token || 
                            (now - JSON.parse(lastUpdate).timestamp > oneDay);

        if (needsUpdate) {
          // Store token in Firestore
          await setDoc(doc(collection(db, 'fcm_tokens'), token), {
            token,
            updatedAt: new Date().toISOString(),
            userId: auth.currentUser?.uid || 'anonymous'
          });
          
          localStorage.setItem(CACHE_KEY, JSON.stringify({ token, timestamp: now }));
          
          // Also register with server for topic subscription
          await fetch('/api/notifications/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token })
          });
        }
        
        return token;
      }
    }
  } catch (error) {
    console.warn('Error getting notification permission:', error);
  }
  return null;
};

if (messaging) {
  onMessage(messaging, (payload) => {
    console.log('[FCM] Received foreground message:', payload);
    const { title, body, imageUrl, url } = payload.data || {};
    
    if (Notification.permission === 'granted' && payload.data) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        console.log('[FCM] Found registrations:', registrations.length);
        const myReg = registrations.find(
          (reg) => reg.active && (reg.active.scriptURL.includes("sw.js") || reg.active.scriptURL.includes("firebase-messaging-sw.js"))
        );
        if (myReg) {
          console.log('[FCM] Showing notification via Service Worker');
          myReg.showNotification(title || 'New Notification', {
            body: body,
            icon: imageUrl || '/launcher.svg',
            image: imageUrl,
            badge: '/launcher.svg',
            data: { url: url },
            tag: payload.messageId, // Use messageId to avoid duplicates
            renotify: true
          } as any);
        } else {
          console.log('[FCM] Showing notification via browser Notification API');
          new Notification(title || 'New Notification', {
            body: body,
            icon: imageUrl || '/launcher.svg',
            image: imageUrl,
            badge: '/launcher.svg',
            data: { url: url },
            tag: payload.messageId,
            renotify: true
          } as any);
        }
      });
    } else {
      console.log('[FCM] Notification not shown:', { permission: Notification.permission, hasData: !!payload.data });
    }
  });
}

// Test connection to Firestore (Optional diagnostic)
// async function testConnection() {
//   try {
//     await getDocFromServer(doc(db, 'test', 'connection'));
//     console.log("Firestore connection successful.");
//   } catch (error) {
//     if(error instanceof Error && (error.message.includes('the client is offline') || error.message.includes('unavailable'))) {
//       console.error("Please check your Firebase configuration. It looks like the project was remixed and needs to be set up again, or the database ID is incorrect.");
//     } else {
//       console.error("Firestore connection error:", error);
//     }
//   }
// }
// testConnection();

