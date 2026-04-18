// This is the "Offline page" service worker with FCM support

importScripts('https://storage.googleapis.com/workbox-cdn/releases/5.1.2/workbox-sw.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

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
    const notificationTitle = payload.notification?.title || payload.data?.title || 'New Notification';
    const notificationOptions = {
      body: payload.notification?.body || payload.data?.body,
      icon: payload.data?.imageUrl || '/logo.svg',
      image: payload.data?.imageUrl,
      data: Object.assign({}, payload.data, {
        url: payload.data?.url || '/'
      })
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
  });
} else {
  console.warn('[sw.js] Missing Firebase config in URL parameters. Push notifications inactive.');
}

const CACHE = "pwabuilder-page";
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
  
  const urlToOpen = (event.notification.data && event.notification.data.url) 
    ? event.notification.data.url 
    : '/';

  event.waitUntil(
    clients.openWindow(urlToOpen)
  );
});
