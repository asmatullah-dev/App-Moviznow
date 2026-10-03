// This is the "Offline page" service worker with FCM support

importScripts('https://storage.googleapis.com/workbox-cdn/releases/5.1.2/workbox-sw.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

const DEFAULT_FIREBASE_CONFIG = {
  projectId: "app-moviznow",
  firestoreDatabaseId: "moviznow-app",
  appId: "1:460140141169:web:c906282a0ae274657799d0",
  apiKey: "AIzaSyBogF7pfzJOkkIKu0190KurpQKIgDJ0CAg",
  authDomain: "app-moviznow.firebaseapp.com",
  storageBucket: "app-moviznow.firebasestorage.app",
  messagingSenderId: "460140141169",
  measurementId: "G-JFWSRZ18PK",
  oAuthClientId: "460140141169-nlm0no0uhcaaaot9037sp4g31r36i808.apps.googleusercontent.com"
};

// Parse config from URL parameters with robust fallback
let urlConfig = {};
try {
  const urlParams = new URL(location.href).searchParams;
  urlConfig = Object.fromEntries(urlParams.entries());
} catch (e) {}

const firebaseConfig = {
  ...DEFAULT_FIREBASE_CONFIG,
  ...urlConfig
};

// Make sure we have the required keys before initializing
if (firebaseConfig.apiKey && firebaseConfig.projectId) {
  // Initialize Firebase for FCM
  firebase.initializeApp(firebaseConfig);

  const messaging = firebase.messaging();

  messaging.onBackgroundMessage((payload) => {
    console.log('[sw.js] Received background message ', payload);
    
    // If the payload already contains a `notification` component, Firebase's SDK
    // will automatically display it. We should not show a manual one to avoid duplicates.
    if (payload.notification) {
      console.log('[sw.js] Notification handled automatically by SDK.');
      return;
    }
    
    if (payload.data) {
      const notificationTitle = payload.data.title || 'New Notification';
      const targetUrl = payload.data.url || payload.data.link || payload.data.click_action || '/';
      const notificationOptions = {
        body: payload.data.body,
        icon: payload.data.imageUrl || '/launcher.svg',
        image: payload.data.imageUrl,
        badge: '/launcher.svg',
        data: Object.assign({}, payload.data, {
          url: targetUrl
        })
      };

      self.registration.showNotification(notificationTitle, notificationOptions);
    }
  });
} else {
  console.warn('[sw.js] Missing Firebase config in URL parameters. Push notifications inactive.');
}

function extractUrlFromNotification(notification) {
  if (!notification) return '/';
  const data = notification.data || {};
  
  if (typeof data.url === 'string' && data.url) return data.url;
  if (typeof data.link === 'string' && data.link) return data.link;
  if (typeof data.click_action === 'string' && data.click_action) return data.click_action;

  if (data.FCM_MSG) {
    const fcm = data.FCM_MSG;
    if (fcm.data) {
      if (typeof fcm.data.url === 'string' && fcm.data.url) return fcm.data.url;
      if (typeof fcm.data.link === 'string' && fcm.data.link) return fcm.data.link;
      if (typeof fcm.data.click_action === 'string' && fcm.data.click_action) return fcm.data.click_action;
    }
    if (fcm.fcmOptions && typeof fcm.fcmOptions.link === 'string' && fcm.fcmOptions.link) {
      return fcm.fcmOptions.link;
    }
    if (fcm.notification && typeof fcm.notification.click_action === 'string' && fcm.notification.click_action) {
      return fcm.notification.click_action;
    }
  }

  if (data.fcmOptions && typeof data.fcmOptions.link === 'string' && data.fcmOptions.link) {
    return data.fcmOptions.link;
  }

  return '/';
}

const CACHE = "moviznow-shell-v3";
const offlineFallbackPage = "offline.html";

const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/offline.html',
  '/launcher.svg',
  '/logo.svg',
  '/Blacklogo.svg',
  '/Whitelogo.svg',
  '/manifest.webmanifest',
  '/pwa-192x192.png',
  '/pwa-512x512.png'
];

/**
 * Catalog Export Prefetch Engine:
 * Proactively fetches and caches catalog shell assets, JSON chunks, and top poster images
 * so the application opens instantly with 0ms latency and 100% offline capability.
 */
async function prefetchCatalogExportAssets(customUrls = []) {
  try {
    const cache = await caches.open(CACHE);
    const imageCache = await caches.open('image-cache');
    const urlsToFetch = Array.from(new Set([...PRECACHE_ASSETS, ...customUrls])).filter(Boolean);

    let successCount = 0;
    await Promise.allSettled(
      urlsToFetch.map(async (url) => {
        try {
          const request = new Request(url, { cache: 'reload' });
          const response = await fetch(request);
          if (response && (response.status === 200 || response.type === 'opaque')) {
            const isImage = /\.(png|jpe?g|webp|svg|gif|avif)(\?.*)?$/i.test(url) || url.includes('tmdb.org') || url.includes('image.tmdb');
            if (isImage) {
              await imageCache.put(url, response.clone());
            } else {
              await cache.put(request, response.clone());
            }
            successCount++;
          }
        } catch (err) {
          console.warn('[sw.js] Failed to prefetch catalog asset:', url, err);
        }
      })
    );

    console.log(`[sw.js] Prefetched ${successCount}/${urlsToFetch.length} catalog export assets.`);

    // Notify all active clients that catalog prefetching finished
    const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clientsList) {
      client.postMessage({
        type: 'CATALOG_EXPORT_PREFETCHED',
        count: successCount,
        timestamp: Date.now()
      });
    }
    return successCount;
  } catch (err) {
    console.error('[sw.js] Error during catalog export prefetching:', err);
    return 0;
  }
}

self.addEventListener("message", (event) => {
  if (!event.data) return;
  if (event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  } else if (event.data.type === "PREFETCH_CATALOG_EXPORT") {
    const urls = Array.isArray(event.data.urls) ? event.data.urls : [];
    event.waitUntil(prefetchCatalogExportAssets(urls));
  }
});

// Periodic Background Sync (runs in background on Chrome/Edge Android/Desktop)
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'catalog-export-sync' || event.tag === 'catalog-sync') {
    console.log('[sw.js] Periodic Background Sync triggered for catalog export');
    event.waitUntil(prefetchCatalogExportAssets());
  }
});

// One-shot Background Sync (runs when device recovers connectivity)
self.addEventListener('sync', (event) => {
  if (event.tag === 'catalog-export-sync' || event.tag === 'catalog-sync') {
    console.log('[sw.js] Background Sync triggered for catalog export');
    event.waitUntil(prefetchCatalogExportAssets());
  }
});

self.addEventListener('install', (event) => {
  self.skipWaiting(); // Force update so mobile users don't need to close all tabs
  event.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      // Precache critical shell assets safely (don't fail install if an optional asset fails)
      await Promise.allSettled(
        PRECACHE_ASSETS.map((asset) =>
          cache.add(new Request(asset, { cache: 'reload' })).catch((err) => {
            console.warn('[sw.js] Failed to precache asset:', asset, err);
          })
        )
      );
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Clean up old caches
      const keys = await caches.keys();
      await Promise.all(
        keys.map((key) => {
          if (key !== CACHE && key !== 'image-cache') {
            return caches.delete(key);
          }
        })
      );
      // Pre-warm catalog export cache immediately upon activation
      prefetchCatalogExportAssets().catch(() => {});
      return self.clients.claim(); // Take control of all open pages immediately
    })()
  );
});

if (typeof workbox !== 'undefined' && workbox.navigationPreload && workbox.navigationPreload.isSupported()) {
  workbox.navigationPreload.enable();
}

// Image caching strategy for 30 days
if (typeof workbox !== 'undefined' && workbox.routing && workbox.strategies) {
  workbox.routing.registerRoute(
    ({ request }) => request.destination === 'image',
    new workbox.strategies.CacheFirst({
      cacheName: 'image-cache',
      plugins: [
        new workbox.cacheableResponse.CacheableResponsePlugin({
          statuses: [0, 200],
        }),
        new workbox.expiration.ExpirationPlugin({
          maxAgeSeconds: 30 * 24 * 60 * 60, // 30 Days
          maxEntries: 1000,
          purgeOnQuotaError: true,
        }),
      ],
    })
  );
}

self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  const url = new URL(event.request.url);

  // Never cache API or background service calls
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // 1. Navigation Requests: NetworkFirst with 2-second timeout falling back to cached App Shell
  if (event.request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        // Try navigation preload if enabled
        try {
          const preloadResp = await event.preloadResponse;
          if (preloadResp) {
            const cache = await caches.open(CACHE);
            cache.put(event.request, preloadResp.clone()).catch(() => {});
            return preloadResp;
          }
        } catch (e) {}

        const networkPromise = fetch(event.request).then(async (networkResp) => {
          if (networkResp && (networkResp.status === 200 || networkResp.type === 'opaqueredirect')) {
            const cache = await caches.open(CACHE);
            cache.put(event.request, networkResp.clone()).catch(() => {});
            cache.put('/', networkResp.clone()).catch(() => {});
          }
          return networkResp;
        });

        // 2-second safety timeout: if mobile connection is slow/stalled, serve cached shell immediately
        const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(null), 2000));

        try {
          const winner = await Promise.race([networkPromise, timeoutPromise]);
          if (winner) {
            return winner;
          }

          // Slow connection timeout hit! Fall back to cache so app opens immediately
          console.warn('[sw.js] Navigation network fetch exceeded 2s (slow connection), serving cached app shell');
          const cache = await caches.open(CACHE);
          const cachedMatch =
            (await cache.match(event.request)) ||
            (await cache.match('/')) ||
            (await cache.match('/index.html'));

          if (cachedMatch) {
            return cachedMatch;
          }

          // Not in cache, wait for network
          return await networkPromise;
        } catch (error) {
          // Offline or network error
          console.warn('[sw.js] Navigation network failed (offline), falling back to cache');
          const cache = await caches.open(CACHE);
          const cachedMatch =
            (await cache.match(event.request)) ||
            (await cache.match('/')) ||
            (await cache.match('/index.html'));

          if (cachedMatch) {
            return cachedMatch;
          }

          const offlineFallback = await cache.match(offlineFallbackPage);
          if (offlineFallback) {
            return offlineFallback;
          }

          return new Response("You are currently offline", {
            status: 503,
            headers: { "Content-Type": "text/plain" },
          });
        }
      })()
    );
    return;
  }

  // 2. Static Assets (Scripts, Styles, Fonts, SVGs): Stale-While-Revalidate
  if (
    url.pathname.startsWith('/assets/') ||
    /\.(js|css|woff2?|ttf|svg|png|jpg|jpeg|webp|ico|json)$/i.test(url.pathname)
  ) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const cached = await cache.match(event.request);

        const networkFetch = fetch(event.request)
          .then((networkResp) => {
            if (networkResp && networkResp.status === 200) {
              cache.put(event.request, networkResp.clone()).catch(() => {});
            }
            return networkResp;
          })
          .catch(() => null);

        // If we have cached version, return it immediately (0ms start)
        if (cached) {
          return cached;
        }

        // Otherwise wait for network fetch
        const networkResult = await networkFetch;
        if (networkResult) {
          return networkResult;
        }

        return new Response('', { status: 408 });
      })()
    );
    return;
  }

  // Non-matching requests: default network fetch
  event.respondWith(fetch(event.request));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  const rawUrl = extractUrlFromNotification(event.notification);
  let targetUrl = '/';
  try {
    targetUrl = new URL(rawUrl, self.location.origin).href;
  } catch (e) {
    targetUrl = self.location.origin + (rawUrl.startsWith('/') ? rawUrl : '/' + rawUrl);
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // 1. If an existing window/tab of our app is already open, focus it and navigate
      for (const client of windowClients) {
        if (client.url && 'focus' in client) {
          if ('navigate' in client && client.url !== targetUrl) {
            client.navigate(targetUrl);
          }
          return client.focus();
        }
      }
      // 2. If no window is open, open a new window
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
