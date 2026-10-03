import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  setPersistence, 
  indexedDBLocalPersistence, 
  browserLocalPersistence, 
  inMemoryPersistence 
} from 'firebase/auth';
import { 
  initializeFirestore, 
  memoryLocalCache, 
  doc, 
  getDoc, 
  updateDoc, 
  setDoc, 
  collection, 
  serverTimestamp,
  enableNetwork,
  deleteField
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { getAnalytics, isSupported, setUserProperties } from 'firebase/analytics';
import firebaseConfig from '../firebase-applet-config.json';
import { safeStorage } from './utils/safeStorage';
import { APP_VERSION, APP_NAME } from './version';

const appConfig = {
  ...firebaseConfig
};

export const app = initializeApp(appConfig);

export const db = initializeFirestore(app, {
  localCache: typeof window !== 'undefined' ? memoryLocalCache() : undefined
}, (appConfig as any).firestoreDatabaseId || 'moviznow-app');

if (typeof window !== 'undefined') {
  // Ensure legacy document snapshot caches are removed
  safeStorage.removeItem('profile_doc_snap');
  // Ensure the client recovers from any previously persisted offline state
  enableNetwork(db).catch(err => console.warn('Failed to enable Firestore network:', err));
}

/**
 * Pass-through wrapper for async operations.
 */
export async function runWithNetwork<T>(fn: () => Promise<T>): Promise<T> {
  return fn();
}

export const auth = getAuth(app);
if (typeof window !== 'undefined') {
  // Prioritize indexedDBLocalPersistence to keep user sessions persistently safe across browser sessions
  setPersistence(auth, indexedDBLocalPersistence)
    .catch(() => setPersistence(auth, browserLocalPersistence))
    .catch((err) => {
      console.warn('Could not set auth persistence:', err);
    });
}
export const storage = getStorage(app);
export let messaging: any = null;
if (typeof window !== 'undefined') {
  try {
    messaging = getMessaging(app);
  } catch (e) {
    console.warn('Firebase Messaging is not supported in this browser/environment:', e);
  }
}

export const analyticsPromise = typeof window !== 'undefined' 
  ? isSupported()
      .then(yes => {
        let isOwner = false;
        try {
          const cachedProfile = window.localStorage.getItem('profile_cache');
          if (cachedProfile) {
            const profile = JSON.parse(cachedProfile);
            if (profile.role === 'owner') {
               isOwner = true;
            }
          }
        } catch (e) {}

        if (isOwner) {
           console.log("Analytics disabled for owner.");
           return null;
        }

        let analyticsInstance = null;
        if (yes) {
          try {
            analyticsInstance = getAnalytics(app);
            setUserProperties(analyticsInstance, { 
               app_version: APP_VERSION,
               version: APP_VERSION,
               app_name: APP_NAME
            });
          } catch(e) {
            console.warn("Could not initialize Firebase Analytics:", e);
          }
        }
        
        return analyticsInstance;
      })
      .catch((e) => {
        console.warn("Analytics not supported or failed to initialize", e);
        return null;
      })
  : Promise.resolve(null);

export let analytics: any = null;
analyticsPromise.then(a => { analytics = a; });

export const getGuestDeviceId = (): string => {
  if (typeof window === 'undefined') return 'guest_server';
  let guestId = safeStorage.getItem('guest_device_id');
  if (!guestId) {
    guestId = 'guest_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now().toString(36);
    safeStorage.setItem('guest_device_id', guestId);
  }
  return guestId;
};

// Function to safely merge / update a guest FCM token to a logged-in user upon login
export const syncGuestFcmToUser = async (userId: string, userEmail?: string) => {
  if (typeof window === 'undefined') return;
  try {
    const activeToken = safeStorage.getItem('active_fcm_token') || safeStorage.getItem('guest_fcm_token');
    const guestId = safeStorage.getItem('guest_device_id');
    
    if (activeToken) {
      const tokenDocRef = doc(db, 'fcm_tokens', activeToken.replace(/[\/\s]/g, '_'));
      
      // 1. Notify backend to transition FCM topic subscriptions and persist to Firestore
      let apiSuccess = false;
      try {
        const res = await fetch('/api/notifications/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token: activeToken,
            userId: userId,
            isGuest: false,
            previousGuestId: guestId || undefined
          })
        });
        if (res.ok) apiSuccess = true;
      } catch (e) {}

      // 2. Direct Firestore update only as fallback if backend API was unreachable
      if (!apiSuccess) {
        try {
          await runWithNetwork(() => setDoc(tokenDocRef, {
            token: activeToken,
            userId: userId,
            isGuest: false,
            guestId: null,
            userEmail: userEmail || null,
            updatedAt: new Date().toISOString()
          }, { merge: true }));
        } catch (e) {}
      }

      // Clear guest-specific flags
      safeStorage.removeItem('guest_fcm_token');
      safeStorage.removeItem('guest_fcm_registered');
      const CACHE_KEY = `fcm_token_v4_last_update_${userId}`;
      safeStorage.setItem(CACHE_KEY, JSON.stringify({ token: activeToken, timestamp: Date.now(), userId, isGuest: false }));
    }
  } catch (err) {
    console.warn("Error syncing guest FCM to logged in user:", err);
  }
};

// Function to request notification permission and get token for guest or logged in user
export const requestNotificationPermission = async (force: boolean = false) => {
  if (typeof window === 'undefined' || !('Notification' in window)) return null;
  
  if (!messaging) {
    try {
      messaging = getMessaging(app);
    } catch (e) {
      console.warn("Firebase Messaging not supported:", e);
      return null;
    }
  }
  
  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      const isUser = !!auth.currentUser?.uid;
      const guestId = !isUser ? getGuestDeviceId() : null;
      const currentUserId = auth.currentUser?.uid || 'guest';
      const CACHE_KEY = `fcm_token_v4_last_update_${currentUserId}`;
      const lastUpdate = safeStorage.getItem(CACHE_KEY);
      const now = Date.now();

      let parsedCache: any = null;
      try {
        if (lastUpdate) parsedCache = JSON.parse(lastUpdate);
      } catch(e) {}

      // Register and await active service worker
      let registration: ServiceWorkerRegistration | undefined;
      if ('serviceWorker' in navigator) {
        const configParams = new URLSearchParams(firebaseConfig as any).toString();
        try {
          registration = await navigator.serviceWorker.register(`/sw.js?${configParams}`);
        } catch (swErr) {
          console.warn("Registering /sw.js failed, trying /firebase-messaging-sw.js:", swErr);
          registration = await navigator.serviceWorker.register(`/firebase-messaging-sw.js?${configParams}`);
        }

        // CRITICAL: Await active and ready service worker state before calling getToken!
        if (navigator.serviceWorker.ready) {
          try {
            registration = await navigator.serviceWorker.ready;
          } catch (readyErr) {
            console.warn("Waiting for serviceWorker.ready warning:", readyErr);
          }
        }
      }

      const vapidKey = import.meta.env.VITE_FCM_VAPID_KEY;
      const tokenOptions: any = {};
      if (registration) {
        tokenOptions.serviceWorkerRegistration = registration;
      }
      if (vapidKey) {
        tokenOptions.vapidKey = vapidKey;
      }

      let token: string | null = null;
      try {
        token = await getToken(messaging, tokenOptions);
      } catch (getTokenErr) {
        console.warn("FCM getToken failed with custom registration, trying fallback:", getTokenErr);
        try {
          token = await getToken(messaging, vapidKey ? { vapidKey } : undefined);
        } catch (fallbackErr) {
          console.warn("FCM getToken fallback error:", fallbackErr);
        }
      }
      
      if (token) {
        // Cache active FCM token locally
        safeStorage.setItem('active_fcm_token', token);
        if (!isUser) {
          safeStorage.setItem('guest_fcm_token', token);
          safeStorage.setItem('guest_fcm_registered', 'true');
        }

        // Fast path: If token is already cached for this user/device, skip all Firestore reads and writes
        const tokenAlreadySynced = parsedCache && 
          parsedCache.token === token && 
          parsedCache.userId === currentUserId &&
          parsedCache.isGuest === !isUser &&
          (now - (parsedCache.timestamp || 0) < 30 * 24 * 60 * 60 * 1000);

        if (!force && tokenAlreadySynced) {
          return token;
        }

        // 1. Guaranteed server registration via API (persists to Firestore fcm_tokens & subscribes to topics)
        let apiSubscribed = false;
        try {
          const res = await fetch('/api/notifications/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              token, 
              userId: isUser ? auth.currentUser!.uid : undefined,
              isGuest: !isUser,
              guestId: !isUser ? guestId : undefined
            })
          });
          if (res.ok) apiSubscribed = true;
        } catch (fetchErr) {
          console.warn("Could not register FCM token via API:", fetchErr);
        }

        // 2. Direct client-side Firestore write only as fallback if backend was unreachable
        if (!apiSubscribed) {
          try {
            const tokenDocRef = doc(db, 'fcm_tokens', token.replace(/[\/\s]/g, '_'));
            const tokenData: any = {
              token,
              updatedAt: new Date().toISOString(),
              userId: isUser ? auth.currentUser!.uid : 'guest',
              isGuest: !isUser,
              guestId: !isUser ? guestId : null,
              platform: typeof navigator !== 'undefined' ? navigator.userAgent : 'web'
            };
            if (isUser && auth.currentUser?.email) {
              tokenData.userEmail = auth.currentUser.email;
            }
            await runWithNetwork(() => setDoc(tokenDocRef, tokenData, { merge: true }));
          } catch (docErr) {
            console.warn("Could not write FCM token directly to Firestore:", docErr);
          }
        }

        if (auth.currentUser) {
          try {
             const cachedStr = safeStorage.getItem('profile_cache');
             if (cachedStr) {
               const profileCache = JSON.parse(cachedStr);
               profileCache.notification = 'yes';
               const json = JSON.stringify(profileCache);
               safeStorage.setItem('profile_cache', json);
               safeStorage.setItem('profile_cache_timestamp', Date.now().toString());
               try {
                 window.localStorage.setItem('profile_cache', json);
                 window.localStorage.setItem('profile_cache_timestamp', Date.now().toString());
               } catch (e) {}
               window.dispatchEvent(new Event('profile_cache_updated'));
             }
          } catch (e) {
             console.log("Failed to update user profile cache with notification status");
          }
        }

        safeStorage.setItem(CACHE_KEY, JSON.stringify({ token, timestamp: now, userId: currentUserId, isGuest: !isUser }));
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
    const title = payload.data?.title || payload.notification?.title || 'New Notification';
    const body = payload.data?.body || payload.notification?.body;
    const imageUrl = payload.data?.imageUrl || payload.notification?.image;
    const rawUrl = payload.data?.url || payload.data?.link || payload.data?.click_action || payload.fcmOptions?.link || '/';
    
    if (Notification.permission === 'granted' && (payload.data || payload.notification)) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        console.log('[FCM] Found registrations:', registrations.length);
        const myReg = registrations.find(
          (reg) => reg.active && (reg.active.scriptURL.includes("sw.js") || reg.active.scriptURL.includes("firebase-messaging-sw.js"))
        );
        if (myReg) {
          console.log('[FCM] Showing notification via Service Worker');
          myReg.showNotification(title, {
            body: body,
            icon: imageUrl || '/launcher.svg',
            image: imageUrl,
            badge: '/launcher.svg',
            data: { url: rawUrl },
            tag: payload.messageId, // Use messageId to avoid duplicates
          } as any);
        } else {
          console.log('[FCM] Showing notification via browser Notification API');
          const notif = new Notification(title, {
            body: body,
            icon: imageUrl || '/launcher.svg',
            image: imageUrl,
            badge: '/launcher.svg',
            data: { url: rawUrl },
            tag: payload.messageId,
          } as any);
          notif.onclick = (e) => {
            e.preventDefault();
            window.focus();
            if (rawUrl) {
              if (rawUrl.startsWith('/')) {
                window.location.href = rawUrl;
              } else {
                try {
                  const parsed = new URL(rawUrl);
                  if (parsed.origin === window.location.origin) {
                    window.location.href = parsed.pathname + parsed.search + parsed.hash;
                  } else {
                    window.open(rawUrl, '_blank');
                  }
                } catch(err) {
                  window.location.href = rawUrl;
                }
              }
            }
          };
        }
      });
    } else {
      console.log('[FCM] Notification not shown:', { permission: Notification.permission, hasDataOrNotif: !!(payload.data || payload.notification) });
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

