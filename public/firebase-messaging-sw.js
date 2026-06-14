if (typeof importScripts === 'function') {
  importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

  // Parse config from URL parameters
  const urlParams = new URL(location.href).searchParams;
  const firebaseConfig = Object.fromEntries(urlParams.entries());

  if (firebaseConfig.apiKey && firebaseConfig.projectId) {
    // Initialize Firebase
    firebase.initializeApp(firebaseConfig);

    const messaging = firebase.messaging();

    messaging.onBackgroundMessage((payload) => {
      console.log('[firebase-messaging-sw.js] Received background message ', payload);
      
      // Add this log to verify the handler is actually running
      console.log('[firebase-messaging-sw.js] Payload data:', payload.data);
      
      // If the payload already contains a `notification` component, Firebase's SDK
      // will automatically display it. We should not show a manual one to avoid duplicates.
      if (payload.notification) {
        console.log('[firebase-messaging-sw.js] Notification handled automatically by SDK.');
        return;
      }
      
      if (payload.data) {
        const notificationTitle = payload.data.title || 'New Notification';
        const notificationOptions = {
          body: payload.data.body,
          icon: payload.data.imageUrl || '/launcher.svg',
          image: payload.data.imageUrl,
          data: Object.assign({}, payload.data, {
            url: payload.data.url || '/'
          })
        };

        self.registration.showNotification(notificationTitle, notificationOptions);
      }
    });
  } else {
    console.warn('[firebase-messaging-sw.js] Missing Firebase config in URL parameters. Push notifications inactive.');
  }
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
