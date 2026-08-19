// This is the "Offline page" service worker with FCM support

importScripts('https://storage.googleapis.com/workbox-cdn/releases/5.1.2/workbox-sw.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

// Parse config from URL parameters
const urlParams = new URL(location.href).searchParams;
const firebaseConfig = Object.fromEntries(urlParams.entries());

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

const CACHE = "pwabuilder-page-v2.0";
const offlineFallbackPage = "offline.html";

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener('install', async (event) => {
  self.skipWaiting(); // Force update so mobile users don't need to close all tabs
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.add(offlineFallbackPage))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim()); // Take control of all open pages immediately
});

if (workbox.navigationPreload.isSupported()) {
  workbox.navigationPreload.enable();
}

// Image caching strategy for 14 days with strict max entry limit
workbox.routing.registerRoute(
  ({ request }) => request.destination === 'image',
  new workbox.strategies.CacheFirst({
    cacheName: 'image-cache',
    plugins: [
      new workbox.cacheableResponse.CacheableResponsePlugin({
        statuses: [0, 200],
      }),
      new workbox.expiration.ExpirationPlugin({
        maxAgeSeconds: 14 * 24 * 60 * 60, // 14 Days
        maxEntries: 250,
        purgeOnQuotaError: true,
      }),
    ],
  })
);

self.addEventListener('fetch', (event) => {
  // Basic fetch handler to satisfy PWA requirements
  if (event.request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const preloadResp = await event.preloadResponse;
        if (preloadResp) {
          return preloadResp;
        }
        return await fetch(event.request);
      } catch (error) {
        const cache = await caches.open(CACHE);
        return await cache.match(offlineFallbackPage);
      }
    })());
  } else {
    // For non-navigation requests, just fetch from network
    event.respondWith(fetch(event.request));
  }
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
