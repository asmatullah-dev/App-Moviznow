import { useEffect, useRef } from "react";
import { requestNotificationPermission } from "../firebase";
import { UserProfile } from "../types";
import { useNotifications } from "../contexts/NotificationContext";

export function useSystemNotifications(profile: UserProfile | null) {
  const { notifications } = useNotifications();
  const isFirstLoad = useRef(true);
  const shownNotificationIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!profile || notifications.length === 0) return;

    // Check if browser supports notifications
    if (!("Notification" in window)) return;

    // Request permission and get FCM token
    if (Notification.permission === "default" || Notification.permission === "granted") {
      requestNotificationPermission().catch(console.error);
    }

    const latestNotification = notifications[0];

    // Skip the first load so we don't show a notification for old messages
    if (isFirstLoad.current) {
      isFirstLoad.current = false;
      // Mark all currently loaded ones as shown so we don't show them
      notifications.forEach(n => shownNotificationIds.current.add(n.id));
      return;
    }

    if (shownNotificationIds.current.has(latestNotification.id)) return;

    shownNotificationIds.current.add(latestNotification.id);

    // Only show if it's a notification meant for us
    const isTargetingAll = !latestNotification.targetUserIds && !latestNotification.targetUserId;
    const isTargetingUs = 
      (latestNotification.targetUserIds && latestNotification.targetUserIds.includes(profile.uid)) ||
      (latestNotification.targetUserId && latestNotification.targetUserId === profile.uid);

    if (!isTargetingAll && !isTargetingUs) {
      return;
    }

    // Only show if it's created after the user's account
    const notifTime = new Date(latestNotification.createdAt).getTime();
    const userTime = new Date(profile.createdAt).getTime();

    if (notifTime > userTime) {
      // Fallback: If FCM is not configured or fails, show notification manually
      const showManualNotification = () => {
        if (Notification.permission === 'granted') {
          navigator.serviceWorker.getRegistrations().then((registrations) => {
            const myReg = registrations.find(
              (reg) => reg.active && (reg.active.scriptURL.includes("sw.js") || reg.active.scriptURL.includes("firebase-messaging-sw.js"))
            );
            
            let targetUrl = '/';
            if (latestNotification.buttonUrl) {
              targetUrl = latestNotification.buttonUrl;
            } else if (latestNotification.contentId) {
              targetUrl = latestNotification.type === 'movie' ? `/movie/${latestNotification.contentId}` : `/series/${latestNotification.contentId}`;
            }

            const options = {
              body: latestNotification.body,
              icon: latestNotification.posterUrl || '/launcher.svg',
              image: latestNotification.posterUrl,
              badge: '/launcher.svg',
              data: { url: targetUrl },
              tag: latestNotification.id,
              renotify: true
            };

            if (myReg) {
              myReg.showNotification(latestNotification.title, options as any);
            } else {
              new Notification(latestNotification.title, options as any);
            }
          }).catch(err => {
            new Notification(latestNotification.title, {
              body: latestNotification.body,
              icon: latestNotification.posterUrl || '/launcher.svg',
            } as any);
          });
        }
      };

      showManualNotification();
    }
  }, [profile, notifications]);
}
