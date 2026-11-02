import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  initializeAuth,
  setPersistence, 
  indexedDBLocalPersistence, 
  browserLocalPersistence, 
  inMemoryPersistence,
  browserPopupRedirectResolver,
  Auth
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
import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging';
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

let authInstance: Auth;
try {
  if (typeof window !== 'undefined') {
    authInstance = initializeAuth(app, {
      persistence: [indexedDBLocalPersistence, browserLocalPersistence],
      popupRedirectResolver: browserPopupRedirectResolver
    });
  } else {
    authInstance = getAuth(app);
  }
} catch (e) {
  authInstance = getAuth(app);
}

export const auth = authInstance;
// Firebase Auth Web SDK persistence is configured with IndexedDB and localStorage fallback.

export const storage = getStorage(app);
export let messaging: any = null;
if (typeof window !== 'undefined') {
  try {
    if ('Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window) {
      messaging = getMessaging(app);
    }
  } catch (e) {
    console.warn('Firebase Messaging is not supported in this browser/environment:', e);
  }
}
let fcmSupportCache: boolean | null = null;

export const isFcmSupported = async (): Promise<boolean> => {
  if (typeof window === 'undefined') return false;
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    fcmSupportCache = false;
    return false;
  }
  if (fcmSupportCache !== null) return fcmSupportCache;
  try {
    const supported = await isSupported();
    fcmSupportCache = Boolean(supported);
    return fcmSupportCache;
  } catch (e) {
    fcmSupportCache = false;
    return false;
  }
};

export const checkIsBrowserFcmCapable = (): boolean => {
  if (typeof window === 'undefined') return false;
  if (!('Notification' in window)) return false;
  if (!('serviceWorker' in navigator)) return false;
  if (!('PushManager' in window)) return false;
  if (fcmSupportCache === false) return false;
  return true;
};

// Firebase Analytics is disabled to eliminate unnecessary webConfig and telemetry network requests
export const analyticsPromise: Promise<any> = Promise.resolve(null);
export let analytics: any = null;

export const getDeviceId = (): string => {
  if (typeof window === 'undefined') return 'device_server';
  let deviceId = safeStorage.getItem('moviznow_device_id');
  if (!deviceId && window.localStorage) {
    try {
      deviceId = window.localStorage.getItem('moviznow_device_id') || window.localStorage.getItem('guest_device_id');
    } catch (e) {}
  }
  if (!deviceId) {
    deviceId = safeStorage.getItem('guest_device_id');
  }
  if (!deviceId) {
    deviceId = 'dev_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now().toString(36);
  }
  safeStorage.setItem('moviznow_device_id', deviceId);
  safeStorage.setItem('guest_device_id', deviceId);
  try {
    window.localStorage.setItem('moviznow_device_id', deviceId);
    window.localStorage.setItem('guest_device_id', deviceId);
  } catch (e) {}
  return deviceId;
};

export const getGuestDeviceId = getDeviceId;

// Function to safely merge / update a guest or device FCM token to a logged-in user upon login
export const syncGuestFcmToUser = async (userId: string, userEmail?: string) => {
  if (typeof window === 'undefined') return;
  try {
    const activeToken = safeStorage.getItem('active_fcm_token')
      || (window.localStorage ? window.localStorage.getItem('active_fcm_token') : null)
      || safeStorage.getItem('guest_fcm_token')
      || (window.localStorage ? window.localStorage.getItem('guest_fcm_token') : null);

    // If no token exists on this device yet, nothing to sync
    if (!activeToken) {
      return;
    }

    const deviceId = getDeviceId();
    const lastSyncedUser = safeStorage.getItem('device_fcm_user_owner') || (window.localStorage ? window.localStorage.getItem('device_fcm_user_owner') : null);
    const lastSyncedToken = safeStorage.getItem('device_fcm_synced_token') || (window.localStorage ? window.localStorage.getItem('device_fcm_synced_token') : null);

    // Fast path: If this token was already confirmed synced to this exact user, skip redundant calls
    if (lastSyncedUser === userId && lastSyncedToken === activeToken) {
      return;
    }

    // 1. Notify backend to transition token in registry from guest (or old user) to this user & update topics
    try {
      await fetch('/api/notifications/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: activeToken,
          userId: userId,
          email: userEmail || auth.currentUser?.email || undefined,
          isGuest: false,
          deviceId: deviceId
        })
      });
    } catch (e) {
      console.warn("Could not transition FCM token to user via API:", e);
    }

    // 2. Clear guest-specific flags and record current user ownership for this device token
    safeStorage.removeItem('guest_fcm_token');
    safeStorage.removeItem('guest_fcm_registered');
    safeStorage.setItem('device_fcm_user_owner', userId);
    safeStorage.setItem('device_fcm_synced_token', activeToken);
    try {
      window.localStorage.removeItem('guest_fcm_token');
      window.localStorage.removeItem('guest_fcm_registered');
      window.localStorage.setItem('device_fcm_user_owner', userId);
      window.localStorage.setItem('device_fcm_synced_token', activeToken);
    } catch (e) {}

    const CACHE_KEY = `fcm_token_v4_last_update_${userId}`;
    const cachePayload = JSON.stringify({ token: activeToken, timestamp: Date.now(), userId, isGuest: false });
    safeStorage.setItem(CACHE_KEY, cachePayload);
    try {
      window.localStorage.setItem(CACHE_KEY, cachePayload);
    } catch (e) {}

    // 3. Ensure user document in Firestore has fcmToken set
    try {
      const userDocRef = doc(db, 'users', userId);
      await runWithNetwork(() => setDoc(userDocRef, {
        fcmToken: activeToken,
        fcmTokenUpdatedAt: new Date().toISOString(),
        notification: 'yes',
        isFcmDisabled: false
      }, { merge: true })).catch(() => {});
    } catch (e) {}

    // 4. Update fcm_tokens/registry directly to ensure guest token becomes user token
    try {
      const nowPkt = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
      const registryDocRef = doc(db, 'fcm_tokens', 'registry');
      await runWithNetwork(() => setDoc(registryDocRef, {
        tokens: {
          [activeToken]: {
            u: userId,
            e: userEmail || auth.currentUser?.email || 'n',
            d: nowPkt,
            did: deviceId
          }
        },
        updatedAt: new Date().toISOString()
      }, { merge: true })).catch(() => {});
    } catch (e) {}

    // 4. Update profile cache
    try {
      const cachedStr = safeStorage.getItem('profile_cache') || (window.localStorage ? window.localStorage.getItem('profile_cache') : null);
      if (cachedStr) {
        const profileCache = JSON.parse(cachedStr);
        profileCache.notification = 'yes';
        profileCache.fcmToken = activeToken;
        profileCache.isFcmDisabled = false;
        const json = JSON.stringify(profileCache);
        safeStorage.setItem('profile_cache', json);
        try { window.localStorage.setItem('profile_cache', json); } catch (e) {}
        window.dispatchEvent(new CustomEvent('user_profile_updated', { detail: profileCache }));
        window.dispatchEvent(new Event('profile_cache_updated'));
      }
    } catch (e) {}
  } catch (err) {
    console.warn("Error syncing guest FCM to logged in user:", err);
  }
};

// In-flight deduplication promise to prevent multiple components from triggering concurrent subscribe calls
let activeFcmPermissionPromise: Promise<string | null> | null = null;

// Function to request notification permission and get token for guest or logged in user
export const requestNotificationPermission = async (force: boolean = false): Promise<string | null> => {
  if (typeof window === 'undefined' || !('Notification' in window)) return null;

  if (activeFcmPermissionPromise && !force) {
    return activeFcmPermissionPromise;
  }

  activeFcmPermissionPromise = (async () => {
    try {
      if (!messaging) {
        try {
          messaging = getMessaging(app);
        } catch (e) {
          console.warn("Firebase Messaging not supported:", e);
          return null;
        }
      }

      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        const isUser = !!auth.currentUser?.uid;
        const deviceId = getDeviceId();
        const currentUserId = auth.currentUser?.uid || 'guest';
        const currentUserEmail = auth.currentUser?.email || undefined;
        const CACHE_KEY = `fcm_token_v4_last_update_${currentUserId}`;
        let lastUpdate = safeStorage.getItem(CACHE_KEY);
        if (!lastUpdate && typeof window !== 'undefined' && window.localStorage) {
          lastUpdate = window.localStorage.getItem(CACHE_KEY);
        }
        const now = Date.now();

        let parsedCache: any = null;
        try {
          if (lastUpdate) parsedCache = JSON.parse(lastUpdate);
        } catch(e) {}

        // Fast path before doing network / SW lookups if we already have an active token cached
        const activeLocalToken = safeStorage.getItem('active_fcm_token') || (typeof window !== 'undefined' ? window.localStorage?.getItem('active_fcm_token') : null);
        const lastSyncedUser = safeStorage.getItem('device_fcm_user_owner') || (typeof window !== 'undefined' && window.localStorage ? window.localStorage.getItem('device_fcm_user_owner') : null);

        if (!force && activeLocalToken && parsedCache && parsedCache.token === activeLocalToken && (now - (parsedCache.timestamp || 0) < 30 * 24 * 60 * 60 * 1000)) {
          if (!isUser || lastSyncedUser === currentUserId) {
            return activeLocalToken;
          }
        }

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

        const previousToken = safeStorage.getItem('active_fcm_token') || (typeof window !== 'undefined' && window.localStorage ? window.localStorage.getItem('active_fcm_token') : null);

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
          try { window.localStorage.setItem('active_fcm_token', token); } catch (e) {}

          if (!isUser) {
            safeStorage.setItem('guest_fcm_token', token);
            safeStorage.setItem('guest_fcm_registered', 'true');
            try {
              window.localStorage.setItem('guest_fcm_token', token);
              window.localStorage.setItem('guest_fcm_registered', 'true');
            } catch (e) {}
          } else {
            safeStorage.setItem('device_fcm_user_owner', currentUserId);
            safeStorage.setItem('device_fcm_synced_token', token);
            safeStorage.removeItem('guest_fcm_token');
            safeStorage.removeItem('guest_fcm_registered');
            try {
              window.localStorage.setItem('device_fcm_user_owner', currentUserId);
              window.localStorage.setItem('device_fcm_synced_token', token);
              window.localStorage.removeItem('guest_fcm_token');
              window.localStorage.removeItem('guest_fcm_registered');
            } catch (e) {}
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

          // 1. Guaranteed server registration via API (persists to Firestore fcm_tokens/registry & subscribes to topics)
          let apiSubscribed = false;
          try {
            const res = await fetch('/api/notifications/subscribe', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                token, 
                userId: isUser ? auth.currentUser!.uid : undefined,
                email: isUser ? currentUserEmail : undefined,
                isGuest: !isUser,
                deviceId: deviceId,
                previousToken: (previousToken && previousToken !== token) ? previousToken : undefined
              })
            });
            if (res.ok) apiSubscribed = true;
          } catch (fetchErr) {
            console.warn("Could not register FCM token via API:", fetchErr);
          }

          // 2. Direct client-side Firestore write only as fallback if backend was unreachable
          if (!apiSubscribed) {
            try {
              const nowPkt = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
              const tokenEntry: Record<string, any> = {
                u: isUser ? auth.currentUser!.uid : 'guest',
                e: isUser && auth.currentUser?.email ? auth.currentUser.email : 'n',
                d: nowPkt,
                did: deviceId
              };
              const registryDocRef = doc(db, 'fcm_tokens', 'registry');
              const updates: Record<string, any> = {
                tokens: {
                  [token]: tokenEntry
                },
                updatedAt: new Date().toISOString()
              };
              if (previousToken && previousToken !== token) {
                updates[`tokens.${previousToken}`] = deleteField();
              }
              await runWithNetwork(() => setDoc(registryDocRef, updates, { merge: true }));
            } catch (docErr) {
              console.warn("Could not write FCM token directly to Firestore:", docErr);
            }
          }

          if (auth.currentUser) {
            try {
              const userDocRef = doc(db, 'users', auth.currentUser.uid);
              await runWithNetwork(() => setDoc(userDocRef, {
                fcmToken: token,
                fcmTokenUpdatedAt: new Date().toISOString(),
                notification: 'yes',
                isFcmDisabled: false,
                notificationPreferences: {
                  fcm: {
                    enabled: true,
                    newContent: true,
                    membershipAlerts: true,
                    membershipExpiry: true,
                    orders: true
                  }
                }
              }, { merge: true })).catch(() => {});
            } catch (err) {
              console.warn("Could not save FCM token directly to user doc:", err);
            }

            try {
               const cachedStr = safeStorage.getItem('profile_cache');
               if (cachedStr) {
                 const profileCache = JSON.parse(cachedStr);
                 profileCache.notification = 'yes';
                 profileCache.fcmToken = token;
                 profileCache.isFcmDisabled = false;
                 if (!profileCache.notificationPreferences) profileCache.notificationPreferences = {};
                 if (!profileCache.notificationPreferences.fcm) profileCache.notificationPreferences.fcm = {};
                 profileCache.notificationPreferences.fcm.enabled = true;
                 const json = JSON.stringify(profileCache);
                 safeStorage.setItem('profile_cache', json);
                 safeStorage.setItem('profile_cache_timestamp', Date.now().toString());
                 try {
                   window.localStorage.setItem('profile_cache', json);
                   window.localStorage.setItem('profile_cache_timestamp', Date.now().toString());
                 } catch (e) {}
                 window.dispatchEvent(new CustomEvent('user_profile_updated', { detail: profileCache }));
                 window.dispatchEvent(new Event('profile_cache_updated'));
               }
            } catch (e) {
               console.log("Failed to update user profile cache with notification status");
            }
          }

          const cachePayload = JSON.stringify({ token, timestamp: now, userId: currentUserId, isGuest: !isUser });
          safeStorage.setItem(CACHE_KEY, cachePayload);
          try { window.localStorage.setItem(CACHE_KEY, cachePayload); } catch (e) {}
          return token;
        }
      }
    } catch (error) {
      console.warn('Error getting notification permission:', error);
    } finally {
      activeFcmPermissionPromise = null;
    }
    return null;
  })();

  return activeFcmPermissionPromise;
};

if (messaging) {
  onMessage(messaging, (payload) => {
    console.log('[FCM] Received foreground message:', payload);
    const title = payload.data?.title || payload.notification?.title || 'MovizNow Alert';
    const body = payload.data?.body || payload.notification?.body || '';
    const imageUrl = payload.data?.imageUrl || payload.data?.posterUrl || payload.data?.poster || payload.notification?.image;
    
    let rawUrl = payload.data?.url || payload.data?.link || payload.data?.click_action || (payload as any).fcmOptions?.link;
    if (!rawUrl && payload.data?.contentId) {
      const type = payload.data?.contentType || payload.data?.type || 'movie';
      rawUrl = type === 'series' ? `/series/${payload.data.contentId}` : `/movie/${payload.data.contentId}`;
    }
    if (!rawUrl) rawUrl = '/';
    
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
            image: imageUrl || undefined,
            badge: '/launcher.svg',
            data: { url: rawUrl, posterUrl: imageUrl },
            actions: [
              { action: 'watch', title: '▶ Watch Now' },
              { action: 'download', title: '⬇ Download' }
            ],
            tag: payload.messageId || `fcm_${Date.now()}`,
          } as any);
        } else {
          console.log('[FCM] Showing notification via browser Notification API');
          const notif = new Notification(title, {
            body: body,
            icon: imageUrl || '/launcher.svg',
            image: imageUrl || undefined,
            badge: '/launcher.svg',
            data: { url: rawUrl, posterUrl: imageUrl },
            tag: payload.messageId || `fcm_${Date.now()}`,
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
                    window.location.href = rawUrl;
                  }
                } catch(err) {
                  window.location.href = rawUrl;
                }
              }
            }
          };
        }
      }).catch(() => {});
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

