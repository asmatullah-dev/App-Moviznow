import { initializeApp } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager, 
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
delete (appConfig as any).measurementId;

export const app = initializeApp(appConfig);

export const db = initializeFirestore(app, {
  localCache: typeof window !== 'undefined' ? persistentLocalCache({ tabManager: persistentMultipleTabManager() }) : undefined
}, appConfig.firestoreDatabaseId);

if (typeof window !== 'undefined') {
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
  setPersistence(auth, browserLocalPersistence).catch((err) => {
    console.warn('Could not set auth persistence:', err);
  });
}
export const storage = getStorage(app);
export const messaging = typeof window !== 'undefined' ? getMessaging(app) : null;

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

// Function to request notification permission and get token
export const requestNotificationPermission = async (force: boolean = false) => {
  if (!messaging || typeof window === 'undefined') return null;
  
  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      const CACHE_KEY = `fcm_token_v3_last_update_${auth.currentUser?.uid || 'anon'}`;
      const lastUpdate = localStorage.getItem(CACHE_KEY);
      const now = Date.now();
      const ONE_DAY = 24 * 60 * 60 * 1000;
      const currentUserId = auth.currentUser?.uid || 'anonymous';

      let parsedCache: any = null;
      try {
        if (lastUpdate) parsedCache = JSON.parse(lastUpdate);
      } catch(e) {}

      // Register service worker
      let registration: ServiceWorkerRegistration | undefined;
      if ('serviceWorker' in navigator) {
        if (force) {
          try {
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (let reg of registrations) {
              await reg.unregister();
            }
          } catch(e) {}
        }
        const configParams = new URLSearchParams(firebaseConfig as any).toString();
        registration = await navigator.serviceWorker.register(`/sw.js?${configParams}`);
      }

      if (force) {
        try {
          const { deleteToken } = await import('firebase/messaging');
          await deleteToken(messaging);
        } catch (e) {}
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
        // Fast path: If token is unchanged and was synced within 24 hours, skip all Firestore writes
        const tokenSyncedRecently = parsedCache && 
          parsedCache.token === token && 
          parsedCache.userId === currentUserId && 
          (now - parsedCache.timestamp < ONE_DAY);

        if (!force && tokenSyncedRecently) {
          return token;
        }

        try {
          // 0. Clean up any previous tokens for this user across all chunks (ensures 1 active device per user)
          if (currentUserId && currentUserId !== 'anonymous') {
            try {
              const metaDocTmp = await getDoc(doc(db, 'chunk_meta', 'versions'));
              let maxIdx = 0;
              if (metaDocTmp.exists()) {
                const latest = metaDocTmp.data()?.fcm_tokens?.latestChunkId || 'fcm_chunk_0';
                const matchIdx = latest.match(/(\d+)$/);
                if (matchIdx) maxIdx = parseInt(matchIdx[1], 10);
              }
              for (let i = 0; i <= maxIdx; i++) {
                const cid = 'fcm_chunk_' + i;
                const cRef = doc(db, 'fcm_tokens', cid);
                const cSnap = await getDoc(cRef);
                if (cSnap.exists()) {
                  const cData = cSnap.data() || {};
                  const deletes: Record<string, any> = {};
                  let hasDeletes = false;
                  Object.keys(cData).forEach(tKey => {
                    if (cData[tKey]?.userId === currentUserId && tKey !== token) {
                      deletes[tKey] = deleteField();
                      hasDeletes = true;
                    }
                  });
                  if (hasDeletes) {
                    await updateDoc(cRef, deletes).catch(() => {});
                  }
                }
              }
            } catch (cleanupErr) {
              console.warn('Error purging old FCM tokens on client:', cleanupErr);
            }
          }

          // 1. Get current chunk ID from meta
          const metaRef = doc(db, 'chunk_meta', 'versions');
          const metaDoc = await getDoc(metaRef);
          let latestChunkId = 'fcm_chunk_0';
          
          if (metaDoc.exists()) {
            const metaData = metaDoc.data();
            if (metaData.fcm_tokens && metaData.fcm_tokens.latestChunkId) {
              latestChunkId = metaData.fcm_tokens.latestChunkId;
            }
          }

          const chunkRef = doc(db, 'fcm_tokens', latestChunkId);
          const chunkDoc = await getDoc(chunkRef);
          
          let targetChunkId = latestChunkId;
          const tokenData = {
            token,
            updatedAt: new Date().toISOString(),
            userId: auth.currentUser?.uid || 'anonymous'
          };

          if (chunkDoc.exists()) {
            const items = chunkDoc.data() || {};
            if (Object.keys(items).length >= 2000 && !items[token]) {
              const match = latestChunkId.match(/(\d+)$/);
              const nextIndex = match ? parseInt(match[1]) + 1 : 1;
              targetChunkId = 'fcm_chunk_' + nextIndex;
              
              await setDoc(doc(db, 'fcm_tokens', targetChunkId), {
                [token]: tokenData
              });
              
              await updateDoc(metaRef, {
                'fcm_tokens.latestChunkId': targetChunkId,
                'fcm_tokens.version': Date.now(),
                'lastGlobalUpdate': serverTimestamp()
              });
            } else {
              await setDoc(chunkRef, {
                 [token]: tokenData
              }, { merge: true });
            }
          } else {
            await setDoc(chunkRef, { [token]: tokenData });
            await setDoc(metaRef, {
              fcm_tokens: {
                latestChunkId: targetChunkId,
                version: Date.now()
              }
            }, { merge: true });
          }

          if (auth.currentUser) {
            try {
               const uid = auth.currentUser.uid;
               const pendingStr = safeStorage.getItem('pending_user_updates') || '{}';
               let pendingAll = JSON.parse(pendingStr);
               pendingAll[uid] = pendingAll[uid] || {};
               pendingAll[uid].notification = 'yes';
               safeStorage.setItem('pending_user_updates', JSON.stringify(pendingAll));
               
               const cachedStr = safeStorage.getItem('profile_cache');
               if (cachedStr) {
                 try {
                    const profileCache = JSON.parse(cachedStr);
                    profileCache.notification = 'yes';
                    safeStorage.setItem('profile_cache', JSON.stringify(profileCache));
                    window.dispatchEvent(new Event('profile_cache_updated'));
                 } catch(e){}
               }

               window.dispatchEvent(new Event('pending_user_updates_changed'));
            } catch (e) {
               console.log("Failed to update user profile with notification status");
            }
          }

          localStorage.setItem(CACHE_KEY, JSON.stringify({ token, timestamp: now, userId: currentUserId }));
          
          await fetch('/api/notifications/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, userId: auth.currentUser?.uid })
          }).catch(() => {});
        } catch (e) {
          console.warn('Error saving FCM token:', e);
        }
        
        return token;
      } else {
        if (auth.currentUser) {
           try {
              const uid = auth.currentUser.uid;
              const pendingStr = safeStorage.getItem('pending_user_updates') || '{}';
              let pendingAll = JSON.parse(pendingStr);
              pendingAll[uid] = pendingAll[uid] || {};
              pendingAll[uid].notification = 'no';
              safeStorage.setItem('pending_user_updates', JSON.stringify(pendingAll));
              safeStorage.setItem('needs_user_sync', 'true');
              
              // Also update profile cache
              const cachedStr = safeStorage.getItem('profile_cache');
              if (cachedStr) {
                try {
                   const profileCache = JSON.parse(cachedStr);
                   profileCache.notification = 'no';
                   safeStorage.setItem('profile_cache', JSON.stringify(profileCache));
                   // Dispatch a generic auth update to refresh context if needed
                   window.dispatchEvent(new Event('profile_cache_updated'));
                } catch(e){}
              }

              window.dispatchEvent(new Event('pending_user_updates_changed'));
           } catch (e) {
              console.log("Failed to update user profile with notification status");
           }
        }
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

