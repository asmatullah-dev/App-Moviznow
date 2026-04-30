import { useEffect, useRef } from "react";
import {
  collection,
  query,
  orderBy,
  getDocs,
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

    const checkNotifications = async () => {
      try {
        const q = query(
          collection(db, "notifications"),
          orderBy("createdAt", "desc"),
          limit(1),
        );

        const snapshot = await getDocs(q);
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

        if (
          notification.id !== lastNotificationId.current &&
          notifTime > userTime
        ) {
          lastNotificationId.current = notification.id;
          
          // Fallback: If FCM is not configured or fails, show notification manually
          const showManualNotification = () => {
            if (Notification.permission === 'granted') {
              navigator.serviceWorker.getRegistrations().then((registrations) => {
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
                  tag: notification.id,
                  renotify: true
                };

                if (myReg) {
                  myReg.showNotification(notification.title, options as any);
                } else {
                  new Notification(notification.title, options as any);
                }
              }).catch(err => {
                new Notification(notification.title, {
                  body: notification.body,
                  icon: notification.posterUrl || '/launcher.svg',
                } as any);
              });
            }
          };

          showManualNotification();
        }
      } catch (error) {
        console.error("Error fetching system notifications:", error);
      }
    };

    checkNotifications();
    const interval = setInterval(checkNotifications, 10 * 60 * 1000); // 10 minutes
    return () => clearInterval(interval);
  }, [profile]);
}
