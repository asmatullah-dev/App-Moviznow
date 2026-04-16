if (typeof importScripts === 'function') {
  importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

  // Initialize Firebase
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
    console.log('[firebase-messaging-sw.js] Received background message ', payload);
    
    // Add this log to verify the handler is actually running
    console.log('[firebase-messaging-sw.js] Payload data:', payload.data);
    
    if (payload.data) {
      const notificationTitle = payload.data.title || 'New Notification';
      const notificationOptions = {
        body: payload.data.body,
        icon: payload.data.imageUrl || '/launcher.svg',
        image: payload.data.imageUrl,
        data: { url: payload.data.url || '/' }
      };

      self.registration.showNotification(notificationTitle, notificationOptions);
    }
  });
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
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
