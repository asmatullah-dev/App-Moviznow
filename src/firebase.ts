import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, doc, getDocFromServer, setDoc, collection, enableIndexedDbPersistence } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { getAnalytics, isSupported } from 'firebase/analytics';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

// Use initializeFirestore with experimentalForceLongPolling: true to fix connection issues in sandboxed environments
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
}, firebaseConfig.firestoreDatabaseId);

export const auth = getAuth(app);
export const storage = getStorage(app);
export const messaging = typeof window !== 'undefined' ? getMessaging(app) : null;

export let analytics: any = null;
if (typeof window !== 'undefined') {
  isSupported().then(yes => {
    if (yes) {
      analytics = getAnalytics(app);
    }
  });
}

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
        registration = await navigator.serviceWorker.register('/sw.js');
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
        // Store token in Firestore
        await setDoc(doc(collection(db, 'fcm_tokens'), token), {
          token,
          updatedAt: new Date().toISOString(),
          userId: auth.currentUser?.uid || 'anonymous'
        });
        
        // Also register with server for topic subscription
        await fetch('/api/notifications/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token })
        });
        
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
    console.log('Message received. ', payload);
    // Show system notification even when app is in foreground
    if (Notification.permission === 'granted' && payload.data) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        const myReg = registrations.find(
          (reg) => reg.active && reg.active.scriptURL.includes("firebase-messaging-sw.js")
        );
        if (myReg) {
          myReg.showNotification(payload.data.title || 'New Notification', {
            body: payload.data.body,
            icon: payload.data.imageUrl || '/launcher.svg',
            image: payload.data.imageUrl,
            data: { url: payload.data.url },
          } as any);
        } else {
          new Notification(payload.data.title || 'New Notification', {
            body: payload.data.body,
            icon: payload.data.imageUrl || '/launcher.svg',
            image: payload.data.imageUrl,
            data: { url: payload.data.url },
          } as any);
        }
      });
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

