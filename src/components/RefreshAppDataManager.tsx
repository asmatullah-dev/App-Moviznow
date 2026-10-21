import { useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { useNotifications } from '../contexts/NotificationContext';
import { safeStorage } from '../utils/safeStorage';
import { getChunkMeta, parseVersionTime } from '../utils/chunkMeta';
import { isUserExpired } from '../contexts/UsersContext';
import { executeSyncUserData } from './SyncUserDataManager';

export function RefreshAppDataManager() {
  const { user, profile, refreshProfile, logout } = useAuth();
  const { refreshSettings } = useSettings();
  const { refreshNotifications } = useNotifications();
  const isRefreshingRef = useRef(false);

  const executeUnifiedRefreshAndSync = useCallback(async (reason: string = 'manual'): Promise<boolean> => {
    if (isRefreshingRef.current) return false;

    const isAutoTrigger = reason === '10_hour_sync' || reason === 'auto_10h' || reason === 'auto';
    const is10HourSync = reason === '10_hour_sync';
    const isManualTrigger = !isAutoTrigger;

    // For guest users (unauthenticated), skip sync completely as guests have no Firestore connection
    if (!user) {
      return false;
    }

    const storageKey = `last_user_refresh_and_sync_time_${user.uid}`;
    const legacyStorageKey = `last_unified_10h_refresh_sync_time_v2_${user.uid}`;

    if (!navigator.onLine) {
      if (reason !== 'app_open' && reason !== '10_hour_sync') {
        window.dispatchEvent(new CustomEvent('sync_status', {
          detail: {
            status: isManualTrigger ? 'error' : 'up-to-date',
            isInitialLoad: false,
            isManual: isManualTrigger,
            updatedCount: 0,
            message: isManualTrigger ? 'You are currently offline' : 'Data is up to date'
          }
        }));
      }
      return false;
    }

    const isLocalProfileExpired = Boolean(
      profile?.status === 'expired' ||
      (profile?.expiryDate && profile?.expiryDate !== 'Lifetime' && isUserExpired(profile.expiryDate))
    );

    // If auto trigger, skip connecting to Firestore if 10 hours have not passed,
    // UNLESS it is an explicit 10_hour_sync cycle or the user is locally expired (admin may have renewed membership)
    if (isAutoTrigger && !is10HourSync && !isLocalProfileExpired) {
      const lastUnifiedStr = localStorage.getItem(storageKey) || localStorage.getItem(legacyStorageKey);
      const lastUnifiedTime = lastUnifiedStr ? parseInt(lastUnifiedStr, 10) : 0;
      const now = Date.now();
      const TEN_HOURS_MS = 10 * 60 * 60 * 1000;

      if (lastUnifiedTime && (now - lastUnifiedTime < TEN_HOURS_MS)) {
        // Skip connecting to Firestore automatically if 10 hours have not passed and not expired
        return true;
      }
    }

    isRefreshingRef.current = true;
    if (isManualTrigger) {
      (window as any).__isAppDataSyncing = true;
      // Dispatch start toast (spinning icon on both header button & user profile menu)
      window.dispatchEvent(new CustomEvent('sync_status', {
        detail: {
          status: 'syncing',
          isInitialLoad: false,
          isManual: true,
          scope: 'app',
          message: 'Refreshing...'
        }
      }));
    }

    try {
      // =========================================================================
      // STEP 1: REFRESH APP DATA FIRST (Settings, Notifications, and User Profile)
      // =========================================================================
      const versions: Record<string, any> = await getChunkMeta(true);

      // 1. Check settings version: fetch when version mismatch or missing local cache
      const serverSettingsVer = versions.settings || 0;
      const localSettingsVer = safeStorage.getItem('cached_settings_version') || '0';
      const serverSettingsTime = parseVersionTime(serverSettingsVer);
      const localSettingsTime = parseVersionTime(localSettingsVer);
      const isSettingsMismatch = (serverSettingsTime > 0 && serverSettingsTime !== localSettingsTime) || !safeStorage.getItem('cached_app_settings');
      if (isSettingsMismatch) {
        await refreshSettings(isManualTrigger).catch((err) => {
          console.warn('[RefreshAppDataManager] Settings refresh failed:', err);
        });
      }

      // 2. Check notifications version: fetch when version mismatch or missing local cache
      if (user?.uid) {
        const serverNotifVer = (versions.notifications && typeof versions.notifications === 'object')
          ? versions.notifications.updatedAt || versions.notifications.version || 0
          : (versions.notifications || 0);
        const localNotifVer = safeStorage.getItem('cached_notifications_version') || '0';
        const serverNotifTime = parseVersionTime(serverNotifVer);
        const localNotifTime = parseVersionTime(localNotifVer);
        const isNotifMismatch = (serverNotifTime > 0 && serverNotifTime !== localNotifTime) || !safeStorage.getItem('cached_notifications_data');
        if (isNotifMismatch) {
          await refreshNotifications().catch((err) => {
            console.warn('[RefreshAppDataManager] Notifications refresh failed:', err);
          });
        }
      }

      // 3. Check user profile version: fetch when version mismatch, 10-hour sync, local expiry, or missing local cache
      if (user?.uid) {
        const chunkUsersMeta = versions.users || {};
        const serverUserVer = chunkUsersMeta[user.uid];
        const localUserVer = safeStorage.getItem(`profile_version_${user.uid}`) || '0';
        const serverUserTime = parseVersionTime(serverUserVer || 0);
        const localUserTime = parseVersionTime(localUserVer);
        
        const isExplicitlyDeleted = serverUserVer === -1 || (typeof serverUserVer === 'object' && (serverUserVer as any)?.deleted === true) || (versions as any)?.[`users.${user.uid}`] === -1;
        
        const isLocalProfileExpired = Boolean(
          profile?.status === 'expired' ||
          (profile?.expiryDate && profile?.expiryDate !== 'Lifetime' && isUserExpired(profile.expiryDate))
        );

        // Always refresh profile from Firestore on 10h sync, manual refresh, local expiry, or version mismatch
        const isUserMismatch =
          isExplicitlyDeleted ||
          isManualTrigger ||
          is10HourSync ||
          isAutoTrigger ||
          isLocalProfileExpired ||
          !serverUserVer ||
          (serverUserTime > 0 && serverUserTime !== localUserTime) ||
          !safeStorage.getItem('profile_cache');

        if (isUserMismatch) {
          const profileFetched = await refreshProfile(true, isManualTrigger ? 'manual' : 'auto').catch((err) => {
            console.error('[RefreshAppDataManager] Profile refresh failed:', err);
            return null;
          });

          if (profileFetched === false && isExplicitlyDeleted) {
            window.dispatchEvent(new CustomEvent('sync_status', {
              detail: {
                status: 'error',
                message: 'Account has been deactivated.'
              }
            }));
            isRefreshingRef.current = false;
            return false;
          }

          if (profileFetched === null) {
            // Profile refresh failed with network error -> abort pipeline without saving timestamp!
            console.warn('[RefreshAppDataManager] Profile refresh encountered an error. Aborting before sync.');
            if (isManualTrigger) {
              window.dispatchEvent(new CustomEvent('sync_status', {
                detail: {
                  status: 'error',
                  message: 'Profile refresh failed. Please retry.'
                }
              }));
            }
            return false;
          }
        }
      }

      // =========================================================================
      // STEP 2: SYNC PENDING USER CHANGES SECOND (Favorites, Watch Later, Watched, Orders, Requests)
      // =========================================================================
      if (user?.uid) {
        // Read fresh profile from storage cache to avoid stale React closure profile from caller
        let latestProfile = profile;
        try {
          const cachedStr = safeStorage.getItem('profile_cache');
          if (cachedStr) {
            latestProfile = JSON.parse(cachedStr);
          }
        } catch (e) {}

        const syncSuccess = await executeSyncUserData(user.uid, latestProfile, reason);
        if (!syncSuccess) {
          console.warn('[RefreshAppDataManager] Step 2 Sync failed or returned false. Aborting without saving timestamp.');
          if (isManualTrigger) {
            window.dispatchEvent(new CustomEvent('sync_status', {
              detail: {
                status: 'error',
                isInitialLoad: false,
                isManual: true,
                scope: 'app',
                message: 'Sync failed. Please retry.'
              }
            }));
          }
          return false;
        }
      }

      // =========================================================================
      // STEP 3: BOTH REFRESH AND SYNC COMPLETED SUCCESSFULLY -> SAVE 10-HOUR TIMESTAMP
      // =========================================================================
      const nowTimestamp = Date.now().toString();
      localStorage.setItem(storageKey, nowTimestamp);
      localStorage.setItem(legacyStorageKey, nowTimestamp);
      localStorage.setItem(`last_user_sync_time_v2_${user.uid}`, nowTimestamp);

      console.log(`[RefreshAppDataManager] Refresh & Sync successfully completed for ${user.uid}. Next 10-hour window scheduled.`);

      // Dispatch single unified completion toast for manual trigger
      if (isManualTrigger) {
        window.dispatchEvent(new CustomEvent('sync_status', {
          detail: {
            status: 'success',
            isInitialLoad: false,
            isManual: true,
            scope: 'app',
            updatedCount: 0,
            message: 'Refresh & Sync completed'
          }
        }));
      }

      return true;
    } catch (err: any) {
      console.error('Error during Unified Refresh & Sync:', err);

      if (isManualTrigger) {
        window.dispatchEvent(new CustomEvent('sync_status', {
          detail: {
            status: 'error',
            isInitialLoad: false,
            isManual: true,
            scope: 'app',
            message: 'Sync failed'
          }
        }));
      }
      return false;
    } finally {
      (window as any).__isAppDataSyncing = false;
      isRefreshingRef.current = false;
    }
  }, [user, profile, refreshProfile, refreshSettings, refreshNotifications, logout]);

  // Expose global windows event and trigger hooks
  const executeUnifiedRef = useRef(executeUnifiedRefreshAndSync);
  useEffect(() => {
    executeUnifiedRef.current = executeUnifiedRefreshAndSync;
  }, [executeUnifiedRefreshAndSync]);

  useEffect(() => {
    (window as any).triggerRefreshAppData = (reason: any) => {
      return executeUnifiedRef.current(reason);
    };
    (window as any).triggerSyncUserData = (reason: any) => {
      return executeUnifiedRef.current(reason);
    };

    const handleRefreshEvent = (e: Event) => {
      const customEvent = e as CustomEvent;
      const reason = customEvent.detail?.reason || 'manual';
      executeUnifiedRef.current(reason);
    };

    const handleSyncEvent = (e: Event) => {
      const customEvent = e as CustomEvent;
      const reason = customEvent.detail?.reason || 'manual';
      executeUnifiedRef.current(reason);
    };

    window.addEventListener('trigger_refresh_app_data', handleRefreshEvent);
    window.addEventListener('trigger_sync_user_data', handleSyncEvent);
    return () => {
      delete (window as any).triggerRefreshAppData;
      delete (window as any).triggerSyncUserData;
      window.removeEventListener('trigger_refresh_app_data', handleRefreshEvent);
      window.removeEventListener('trigger_sync_user_data', handleSyncEvent);
    };
  }, []);

  // 10-Hour Unified Refresh & Sync Checker:
  // Auto refresh & sync user data every 10 hours.
  // Dynamically schedules a single setTimeout for the exact remaining duration until 10 hours,
  // eliminating unnecessary 60-second polling intervals in the background.
  useEffect(() => {
    if (!user?.uid) return;

    const TEN_HOURS_MS = 10 * 60 * 60 * 1000;
    let scheduledTimer: ReturnType<typeof setTimeout> | null = null;
    let lastCheckedTime = 0;

    const scheduleNext = (delayMs: number) => {
      if (scheduledTimer) {
        clearTimeout(scheduledTimer);
        scheduledTimer = null;
      }
      // Cap maximum setTimeout delay to 24 hours to prevent 32-bit integer overflow in JS timers
      const safeDelay = Math.min(delayMs, 24 * 60 * 60 * 1000);
      scheduledTimer = setTimeout(() => {
        checkAndSchedule();
      }, safeDelay);
    };

    const checkAndSchedule = () => {
      if (!navigator.onLine || !user?.uid) return;

      const now = Date.now();
      // Throttle rapid consecutive checks (e.g. from quick tab switches or network toggles)
      if (now - lastCheckedTime < 15000) {
        return;
      }
      lastCheckedTime = now;

      const storageKey = `last_user_refresh_and_sync_time_${user.uid}`;
      const legacyStorageKey = `last_unified_10h_refresh_sync_time_v2_${user.uid}`;
      const lastUnifiedStr = localStorage.getItem(storageKey) || localStorage.getItem(legacyStorageKey);
      const lastUnifiedTime = lastUnifiedStr ? parseInt(lastUnifiedStr, 10) : 0;
      const elapsed = lastUnifiedTime ? now - lastUnifiedTime : TEN_HOURS_MS;

      // Check if user is expired locally (if admin renewed membership, check immediately without waiting 10h)
      const isLocalExpired = Boolean(
        profile?.status === 'expired' ||
        (profile?.expiryDate && profile?.expiryDate !== 'Lifetime' && isUserExpired(profile.expiryDate))
      );

      // Trigger auto refresh & sync if last refresh was more than 10 hours ago (or never synced, or locally expired)
      if (!lastUnifiedTime || elapsed >= TEN_HOURS_MS || isLocalExpired) {
        console.log(`[RefreshAppDataManager] Background 10-hour Auto Refresh & Sync triggered (last sync: ${lastUnifiedTime ? Math.round(elapsed / 3600000) + 'h ago' : 'never'}, localExpired: ${isLocalExpired}).`);
        executeUnifiedRef.current('10_hour_sync').finally(() => {
          scheduleNext(TEN_HOURS_MS);
        });
      } else {
        // Schedule next check when remaining duration expires (min 5 seconds)
        const remaining = Math.max(5000, TEN_HOURS_MS - elapsed);
        scheduleNext(remaining);
      }
    };

    // 1. Initial startup grace period (8.5s) so initial render and browsing settle with 0 background lag
    const initialGraceTimer = setTimeout(() => {
      checkAndSchedule();
    }, 8500);

    // 2. Check when tab visibility resumes or device comes back online
    // (Note: redundant 'focus' listener removed to prevent duplicate triggers on every window click)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkAndSchedule();
      }
    };

    const handleOnline = () => {
      checkAndSchedule();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);

    return () => {
      clearTimeout(initialGraceTimer);
      if (scheduledTimer) {
        clearTimeout(scheduledTimer);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
    };
  }, [user?.uid, profile?.status, profile?.expiryDate]);

  return null;
}
