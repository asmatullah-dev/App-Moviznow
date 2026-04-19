import { useEffect, useRef } from "react";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  limit,
} from "firebase/firestore";
import { db, requestNotificationPermission } from "../firebase";
import { AppNotification, UserProfile } from "../types";

export function useSystemNotifications(profile: UserProfile | null) {
  const isFirstLoad = useRef(true);
  const lastNotificationId = useRef<string | null>(null);

  useEffect(() => {
    if (!profile) return;

    // Check if browser supports notifications
    if (!("Notification" in window)) {
      console.log("This browser does not support system notifications");
      return;
    }

    // Request permission and get FCM token
    if (Notification.permission === "default" || Notification.permission === "granted") {
      requestNotificationPermission().catch(console.error);
    }

    const q = query(
      collection(db, "notifications"),
      orderBy("createdAt", "desc"),
      limit(1),
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (snapshot.empty) return;

      const latestDoc = snapshot.docs[0];
      const notification = {
        id: latestDoc.id,
        ...latestDoc.data(),
      } as AppNotification;

      // Skip the first load so we don't show a notification for old messages
      if (isFirstLoad.current) {
        isFirstLoad.current = false;
        lastNotificationId.current = notification.id;
        return;
      }

      // Ignore notifications targeted at other users
      const isTargetedToMe = 
        (!notification.targetUserId && (!notification.targetUserIds || notification.targetUserIds.length === 0)) || 
        (notification.targetUserId === profile.uid) || 
        (notification.targetUserIds?.includes(profile.uid));

      if (!isTargetedToMe) {
        lastNotificationId.current = notification.id;
        return;
      }

      // Only show if it's a new notification and created after the user's account
      const notifTime = new Date(notification.createdAt).getTime();
      const userTime = new Date(profile.createdAt).getTime();
      
      console.log('[SystemNotifications] Checking notification:', {
        id: notification.id,
        notifTime,
        userTime,
        isNew: notification.id !== lastNotificationId.current,
        isAfterAccount: notifTime > userTime
      });

      if (
        notification.id !== lastNotificationId.current &&
        notifTime > userTime
      ) {
        lastNotificationId.current = notification.id;
        
        // Fallback: If FCM is not configured or fails, show notification manually
        const showManualNotification = () => {
          console.log('[SystemNotifications] Attempting to show manual notification:', notification.title);
          if (Notification.permission === 'granted') {
            navigator.serviceWorker.getRegistrations().then((registrations) => {
              console.log('[SystemNotifications] Active service workers:', registrations.length);
              // Look for our registered service worker (either sw.js or firebase-messaging-sw.js)
              const myReg = registrations.find(
                (reg) => reg.active && (reg.active.scriptURL.includes("sw.js") || reg.active.scriptURL.includes("firebase-messaging-sw.js"))
              );
              
              let targetUrl = '/';
              if (notification.buttonUrl) {
                targetUrl = notification.buttonUrl;
              } else if (notification.contentId) {
                targetUrl = notification.type === 'movie' ? `/movie/${notification.contentId}` : `/series/${notification.contentId}`;
              }

              const options = {
                body: notification.body,
                icon: notification.posterUrl || '/launcher.svg',
                image: notification.posterUrl,
                badge: '/launcher.svg',
                data: { url: targetUrl },
                tag: notification.id, // Prevent duplicates
                renotify: true
              };

              if (myReg) {
                console.log('[SystemNotifications] Using service worker to show notification');
                myReg.showNotification(notification.title, options as any);
              } else {
                console.log('[SystemNotifications] No matching service worker found, using browser Notification API');
                new Notification(notification.title, options as any);
              }
            }).catch(err => {
              console.error('[SystemNotifications] Error getting registrations:', err);
              new Notification(notification.title, {
                body: notification.body,
                icon: notification.posterUrl || '/launcher.svg',
              } as any);
            });
          } else {
            console.log('[SystemNotifications] Notification permission not granted:', Notification.permission);
          }
        };

        // If we don't have a VAPID key, always show manually.
        // If we DO have a VAPID key, FCM should technically handle the background, 
        // but this listener ensures foreground notifications work even without a backend FCM push.
        showManualNotification();
      }
    });

    return () => unsubscribe();
  }, [profile]);
}
