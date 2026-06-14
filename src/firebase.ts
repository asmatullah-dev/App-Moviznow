import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, doc, getDoc, updateDoc, setDoc, collection, serverTimestamp } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { getAnalytics, isSupported } from 'firebase/analytics';
import firebaseConfig from '../firebase-applet-config.json';
import { safeStorage } from './utils/safeStorage';

// Base config without injecting measurementId to avoid Firebase SDK mismatch warnings
const { measurementId: _omittedMeasurementId, ...restConfig } = firebaseConfig;
const extendedConfig = {
  ...restConfig
};

// Use VITE_GA_MEASUREMENT_ID or fallback to config
const customMeasurementId = import.meta.env.VITE_GA_MEASUREMENT_ID || firebaseConfig.measurementId || "";

export const app = initializeApp(extendedConfig);

// Use initializeFirestore with experimentalForceLongPolling: true to fix connection issues in sandboxed environments
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
  localCache: typeof window !== 'undefined' ? persistentLocalCache({ tabManager: persistentMultipleTabManager() }) : undefined
}, extendedConfig.firestoreDatabaseId);

export const auth = getAuth(app);
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
           return null; // Do not initialize GA or standalone gtag for owners
        }

        let analyticsInstance = null;
        if (yes) {
          try {
            analyticsInstance = getAnalytics(app);
          } catch(e) {
            console.warn("Could not initialize Firebase Analytics:", e);
          }
        }
        
        // Ensure standalone gtag is always initialized with the correct ID
        if (customMeasurementId && !document.querySelector(`script[src*="${customMeasurementId}"]`)) {
          console.log("Initializing Standalone GA with Measurement ID:", customMeasurementId);
          const script = document.createElement('script');
          script.async = true;
          script.src = `https://www.googletagmanager.com/gtag/js?id=${customMeasurementId}`;
          document.head.appendChild(script);
          
          // @ts-ignore
          window.dataLayer = window.dataLayer || [];
          // @ts-ignore
          window.gtag = function() { 
            // @ts-ignore
            window.dataLayer.push(arguments); 
          };
          // @ts-ignore
          window.gtag('js', new Date());
          
          const currentVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '2.0.0';
          
          // @ts-ignore
          window.gtag('set', {
            app_version: currentVersion,
            app_name: 'MovizNow'
          });

          // @ts-ignore
          window.gtag('config', customMeasurementId, { 
            send_page_view: true,
            app_version: currentVersion,
            app_name: 'MovizNow'
          });
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
      let isForced = force;
      // Auto-migrate users once to the new FCM token system in the background
      const MIGRATION_KEY = 'fcm_v10_migrated_auto_v1';
      if (!force && !localStorage.getItem(MIGRATION_KEY)) {
        isForced = true;
        localStorage.setItem(MIGRATION_KEY, 'true');
      }

      // Register service worker explicitly to ensure it's the right one
      let registration;
      if ('serviceWorker' in navigator) {
        if (isForced) {
          try {
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (let reg of registrations) {
              await reg.unregister();
            }
            console.log("Unregistered old service workers.");
          } catch(e) {}
        }
        // Pass Firebase config via query parameters to the service worker so it dynamically updates on remix
        const configParams = new URLSearchParams(firebaseConfig as any).toString();
        registration = await navigator.serviceWorker.register(`/sw.js?${configParams}`);
      }

      if (isForced) {
        try {
          // Import deleteToken at the top or use it directly
          const { deleteToken } = await import('firebase/messaging');
          await deleteToken(messaging);
          console.log("Deleted old FCM token to force new registration.");
        } catch (e) {
          console.warn("Could not delete old token", e);
        }
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
        const CACHE_KEY = `fcm_token_v3_last_update_${auth.currentUser?.uid || 'anon'}`;
        const lastUpdate = localStorage.getItem(CACHE_KEY);
        const now = Date.now();
        const oneDay = 24 * 60 * 60 * 1000;
        const currentUserId = auth.currentUser?.uid || 'anonymous';

        let parsedCache: any = null;
        try {
          if (lastUpdate) parsedCache = JSON.parse(lastUpdate);
        } catch(e) {}

        const needsUpdate = isForced || !parsedCache || 
                            parsedCache.token !== token || 
                            parsedCache.userId !== currentUserId ||
                            (now - parsedCache.timestamp > oneDay);

        if (needsUpdate) {
          try {
            // 1. Get the current chunk ID from meta
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
              // Limit of 2000 tokens per document as requested
              if (Object.keys(items).length >= 2000 && !items[token]) {
                const match = latestChunkId.match(/(\d+)$/);
                const nextIndex = match ? parseInt(match[1]) + 1 : 1;
                targetChunkId = 'fcm_chunk_' + nextIndex;
                
                // Create new chunk
                await setDoc(doc(db, 'fcm_tokens', targetChunkId), {
                  [token]: tokenData
                });
                
                // Update meta
                await updateDoc(metaRef, {
                  'fcm_tokens.latestChunkId': targetChunkId,
                  'fcm_tokens.version': Date.now(),
                  'lastGlobalUpdate': serverTimestamp()
                });
              } else {
                // Use setDoc with merge to treat the token key as a literal string, avoiding dot-path issues
                await setDoc(chunkRef, {
                   [token]: tokenData
                }, { merge: true });
              }
            } else {
              // Create first chunk
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
                 safeStorage.setItem('needs_user_sync', 'true');
                 
                 // Also update profile cache
                 const cachedStr = safeStorage.getItem('profile_cache');
                 if (cachedStr) {
                   try {
                      const profileCache = JSON.parse(cachedStr);
                      profileCache.notification = 'yes';
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

            localStorage.setItem(CACHE_KEY, JSON.stringify({ token, timestamp: now, userId: currentUserId }));
            
            // Also register with server for topic subscription
            await fetch('/api/notifications/subscribe', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ token, userId: auth.currentUser?.uid })
            });
          } catch (e) {
            console.warn('Error saving FCM token:', e);
          }
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
    const url = payload.data?.url;
    
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
            data: { url: url },
            tag: payload.messageId, // Use messageId to avoid duplicates
            renotify: true
          } as any);
        } else {
          console.log('[FCM] Showing notification via browser Notification API');
          const notif = new Notification(title, {
            body: body,
            icon: imageUrl || '/launcher.svg',
            image: imageUrl,
            badge: '/launcher.svg',
            data: { url: url },
            tag: payload.messageId,
            renotify: true
          } as any);
          if (url) {
            notif.onclick = () => window.open(url, '_blank');
          }
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

