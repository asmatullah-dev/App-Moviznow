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
      if (
        notification.id !== lastNotificationId.current &&
        new Date(notification.createdAt) > new Date(profile.createdAt)
      ) {
        lastNotificationId.current = notification.id;
        
        // Fallback: If FCM is not configured (missing VAPID key), show notification manually
        if (!import.meta.env.VITE_FCM_VAPID_KEY && Notification.permission === 'granted') {
          navigator.serviceWorker.getRegistrations().then((registrations) => {
            const myReg = registrations.find(
              (reg) => reg.active && reg.active.scriptURL.includes("firebase-messaging-sw.js")
            );
            if (myReg) {
              myReg.showNotification(notification.title, {
                body: notification.body,
                icon: notification.posterUrl || '/launcher.svg',
                image: notification.posterUrl,
                data: { url: notification.type === 'movie' ? `/movie/${notification.contentId}` : `/series/${notification.contentId}` },
              } as any);
            } else {
              new Notification(notification.title, {
                body: notification.body,
                icon: notification.posterUrl || '/launcher.svg',
                image: notification.posterUrl,
              } as any);
            }
          });
        }
      }
    });

    return () => unsubscribe();
  }, [profile]);
}
