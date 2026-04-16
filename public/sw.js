// This is the "Offline page" service worker with FCM support

importScripts('https://storage.googleapis.com/workbox-cdn/releases/5.1.2/workbox-sw.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

// Initialize Firebase for FCM
firebase.initializeApp({
  apiKey: "AIzaSyBgB-N6dt9k0WFWgAWHjq2C5YjNVXEQ2qQ",
  authDomain: "gen-lang-client-0278230090.firebaseapp.com",
  projectId: "gen-lang-client-0278230090",
  storageBucket: "gen-lang-client-0278230090.firebasestorage.app",
  messagingSenderId: "578203790665",
  appId: "1:578203790665:web:9506c7bb463f65d5773e98"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[sw.js] Received background message ', payload);
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/logo.svg',
    data: payload.data
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

const CACHE = "pwabuilder-page";
const offlineFallbackPage = "offline.html";

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener('install', async (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.add(offlineFallbackPage))
  );
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
