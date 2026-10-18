import { useEffect, useRef } from "react";
import { requestNotificationPermission } from "../firebase";
import { UserProfile } from "../types";
import { useNotifications } from "../contexts/NotificationContext";

export function useSystemNotifications(profile: UserProfile | null) {
  const { notifications } = useNotifications();
  const isFirstLoad = useRef(true);
  const shownNotificationIds = useRef<Set<string>>(new Set());

  const tokenRequestedRef = useRef(false);

  useEffect(() => {
    if (!profile) return;
    if (!("Notification" in window)) return;

    // Request permission / register FCM token once per session
    if (!tokenRequestedRef.current && (Notification.permission === "default" || Notification.permission === "granted")) {
      tokenRequestedRef.current = true;
      requestNotificationPermission().catch(console.error);
    }
  }, [profile?.uid]);

  useEffect(() => {
    if (!profile || notifications.length === 0) return;
    if (!("Notification" in window)) return;

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

    // Skip showing system notification if FCM / Push toggle was disabled when sending
    if (latestNotification.sendFcm === false || latestNotification.isFcmDisabled === true) {
      return;
    }

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
      // FCM (Firebase Cloud Messaging) already handles displaying the push notifications.
      // We do not need to manually trigger browser Notification API here because it causes duplicates.
      // showManualNotification() has been removed.
    }
  }, [profile, notifications]);
}
