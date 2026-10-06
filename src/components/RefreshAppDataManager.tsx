import { useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { useNotifications } from '../contexts/NotificationContext';
import { safeStorage } from '../utils/safeStorage';
import { getChunkMeta, parseVersionTime } from '../utils/chunkMeta';
import { executeSyncUserData } from './SyncUserDataManager';

export function RefreshAppDataManager() {
  const { user, profile, refreshProfile, logout } = useAuth();
  const { refreshSettings } = useSettings();
  const { refreshNotifications } = useNotifications();
  const isRefreshingRef = useRef(false);

  const executeUnifiedRefreshAndSync = useCallback(async (reason: string = 'manual'): Promise<boolean> => {
    if (isRefreshingRef.current) return false;

    const isAutoTrigger = reason === '10_hour_sync' || reason === 'auto_10h' || reason === 'auto';
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

    if (isAutoTrigger) {
      const lastUnifiedStr = localStorage.getItem(storageKey) || localStorage.getItem(legacyStorageKey);
      const lastUnifiedTime = lastUnifiedStr ? parseInt(lastUnifiedStr, 10) : 0;
      const now = Date.now();
      const TEN_HOURS_MS = 10 * 60 * 60 * 1000;

      if (lastUnifiedTime && (now - lastUnifiedTime < TEN_HOURS_MS)) {
        // Skip connecting to Firestore automatically if 10 hours have not passed
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
      const versions: Record<string, any> = await getChunkMeta(isManualTrigger);

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

      // 3. Check user profile version: fetch when version mismatch or missing local cache
      if (user?.uid) {
        const chunkUsersMeta = versions.users || {};
        const serverUserVer = chunkUsersMeta[user.uid];
        const localUserVer = safeStorage.getItem(`profile_version_${user.uid}`) || '0';
        const serverUserTime = parseVersionTime(serverUserVer || 0);
        const localUserTime = parseVersionTime(localUserVer);
        
        const isExplicitlyDeleted = serverUserVer === -1 || (typeof serverUserVer === 'object' && (serverUserVer as any)?.deleted === true) || (versions as any)?.[`users.${user.uid}`] === -1;
        const isUserMismatch = isExplicitlyDeleted || isManualTrigger || (serverUserTime > 0 && serverUserTime !== localUserTime) || !safeStorage.getItem('profile_cache');

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
        const syncSuccess = await executeSyncUserData(user.uid, profile, reason);
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

  // 10-Hour Unified Refresh & Sync Checker (checked periodically, never on app open/mount or visibility resume)
  useEffect(() => {
    if (!user?.uid) return;

    const check10HourUnified = () => {
      const storageKey = `last_user_refresh_and_sync_time_${user.uid}`;
      const legacyStorageKey = `last_unified_10h_refresh_sync_time_v2_${user.uid}`;
      const lastUnifiedStr = localStorage.getItem(storageKey) || localStorage.getItem(legacyStorageKey);
      const lastUnifiedTime = lastUnifiedStr ? parseInt(lastUnifiedStr, 10) : 0;
      const now = Date.now();
      const TEN_HOURS_MS = 10 * 60 * 60 * 1000;

      if (!lastUnifiedTime) {
        if (safeStorage.getItem('profile_cache')) {
          const nowStr = now.toString();
          localStorage.setItem(storageKey, nowStr);
          localStorage.setItem(legacyStorageKey, nowStr);
          return;
        }
        executeUnifiedRef.current('10_hour_sync');
        return;
      }

      if (now - lastUnifiedTime >= TEN_HOURS_MS) {
        executeUnifiedRef.current('10_hour_sync');
      }
    };

    // Periodic check every 1 hour (purely local time comparison, 0 Firestore calls unless 10h has arrived)
    const interval = setInterval(() => {
      check10HourUnified();
    }, 60 * 60 * 1000);

    return () => {
      clearInterval(interval);
    };
  }, [user?.uid]);

  return null;
}
