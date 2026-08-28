import { useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { useNotifications } from '../contexts/NotificationContext';
import { safeStorage } from '../utils/safeStorage';
import { getChunkMeta, parseVersionTime } from '../utils/chunkMeta';
import { seedStaticExportData } from '../utils/staticContentLoader';
import { executeSyncUserData } from './SyncUserDataManager';

export function RefreshAppDataManager() {
  const { user, profile, refreshProfile, logout } = useAuth();
  const { refreshSettings } = useSettings();
  const { refreshNotifications } = useNotifications();
  const isRefreshingRef = useRef(false);

  const executeUnifiedRefreshAndSync = useCallback(async (reason: string = 'manual') => {
    if (isRefreshingRef.current) return;

    // For guest users (unauthenticated), populate content library from static export JSON and skip Firestore network calls!
    if (!user) {
      seedStaticExportData();
      localStorage.setItem('last_unified_10h_refresh_sync_time_v2_guest', Date.now().toString());
      if (reason !== 'app_open' && reason !== '10_hour_sync') {
        window.dispatchEvent(new CustomEvent('sync_status', {
          detail: {
            status: 'up-to-date',
            isInitialLoad: false,
            updatedCount: 0,
            message: 'Data is up to date'
          }
        }));
      }
      return;
    }

    if (!navigator.onLine) {
      if (reason !== 'app_open' && reason !== '10_hour_sync') {
        window.dispatchEvent(new CustomEvent('sync_status', {
          detail: {
            status: 'up-to-date',
            isInitialLoad: false,
            updatedCount: 0,
            message: 'Data is up to date'
          }
        }));
      }
      return;
    }

    isRefreshingRef.current = true;

    const isManualTrigger = reason === 'catalog_button' || reason === 'user_profile_button' || reason === 'manual';

    // Dispatch start toast
    window.dispatchEvent(new CustomEvent('sync_status', {
      detail: {
        status: 'syncing',
        isInitialLoad: false,
        message: isManualTrigger ? 'Refreshing...' : 'Updating data...'
      }
    }));

    try {
      // ==========================================
      // STEP 1: REFRESH APP DATA FIRST (Settings, Notifications, and Profile only, NO Content chunks or reviews)
      // ==========================================
      const versions: Record<string, any> = await getChunkMeta(isManualTrigger);

      let otherUpdated = false;

      // 1. Check settings version
      const serverSettingsVer = versions.settings || 0;
      const localSettingsVer = safeStorage.getItem('cached_settings_version') || '0';
      const serverSettingsTime = parseVersionTime(serverSettingsVer);
      const localSettingsTime = parseVersionTime(localSettingsVer);
      if ((serverSettingsTime > 0 && serverSettingsTime > localSettingsTime) || !safeStorage.getItem('cached_app_settings')) {
        await refreshSettings(true).catch(() => {});
        otherUpdated = true;
      }

      // 2. Check notifications version
      if (user?.uid) {
        const serverNotifVer = (versions.notifications && typeof versions.notifications === 'object')
          ? versions.notifications.updatedAt || versions.notifications.version || 0
          : (versions.notifications || 0);
        const localNotifVer = safeStorage.getItem('cached_notifications_version') || '0';
        const serverNotifTime = parseVersionTime(serverNotifVer);
        const localNotifTime = parseVersionTime(localNotifVer);
        if (serverNotifTime > 0 && serverNotifTime > localNotifTime) {
          await refreshNotifications().catch(() => {});
          otherUpdated = true;
        }
      }

      // 3. Check self user version and refresh user profile
      if (user?.uid) {
        const chunkUsersMeta = versions.users || {};
        const serverUserVer = chunkUsersMeta[user.uid] || 0;
        const localUserVer = safeStorage.getItem(`profile_version_${user.uid}`) || '0';
        const serverUserTime = parseVersionTime(serverUserVer);
        const localUserTime = parseVersionTime(localUserVer);
        if (isManualTrigger || (serverUserTime > 0 && serverUserTime > localUserTime)) {
          const profileFetched = await refreshProfile(true, 'manual').catch((err) => {
            console.error("Profile refresh failed:", err);
            return null;
          });
          // If refreshProfile returned false, it means they might be deleted or user ID not found. It handles logout internally.
          if (profileFetched === false) {
            window.dispatchEvent(new CustomEvent('sync_status', {
              detail: {
                status: 'error',
                message: 'User ID not found / session expired.'
              }
            }));
            isRefreshingRef.current = false;
            return;
          }
          if (profileFetched === null && isManualTrigger) {
            window.dispatchEvent(new CustomEvent('sync_status', {
              detail: {
                status: 'error',
                message: 'Profile refresh failed. Please retry.'
              }
            }));
            isRefreshingRef.current = false;
            return;
          }
          otherUpdated = true;
        }
      }

      // ==========================================
      // STEP 2: SYNC PENDING USER CHANGES AFTER SUCCESSFUL REFRESH (Sessions, Time, Click History, Content History)
      // ==========================================
      if (user?.uid) {
        const syncSuccess = await executeSyncUserData(user.uid, profile, reason);
        if (!syncSuccess) {
          console.warn("Unified Step 2: Syncing pending changes failed/returned false, but proceeding.");
        }
      }

      // Save unified last successful refresh & sync timestamp
      const storageKey = `last_unified_10h_refresh_sync_time_v2_${user.uid}`;
      localStorage.setItem(storageKey, Date.now().toString());

      // Dispatch single unified completion toast
      if (isManualTrigger) {
        window.dispatchEvent(new CustomEvent('sync_status', {
          detail: {
            status: 'success',
            isInitialLoad: false,
            updatedCount: 0,
            message: 'Refresh successfully'
          }
        }));
      } else if (otherUpdated) {
        window.dispatchEvent(new CustomEvent('sync_status', {
          detail: {
            status: 'success',
            isInitialLoad: false,
            updatedCount: 0,
            message: 'Data updated successfully'
          }
        }));
      } else {
        window.dispatchEvent(new CustomEvent('sync_status', {
          detail: {
            status: 'up-to-date',
            isInitialLoad: false,
            updatedCount: 0,
            message: 'Data is up to date'
          }
        }));
      }
    } catch (err: any) {
      console.error('Error during Unified Refresh & Sync:', err);

      // Handle permission denied or user missing from database by forcing relogin
      if (err && (err.code === 'permission-denied' || err.message?.includes('permission') || err.message?.includes('not-found'))) {
        console.warn("Unified process received permission denied or document missing. Automatically proceeding for relogin.");
        window.dispatchEvent(new CustomEvent('sync_status', {
          detail: {
            status: 'error',
            message: 'Session invalid / user deleted. Logging out...'
          }
        }));
        await logout().catch(() => {});
        isRefreshingRef.current = false;
        return;
      }

      window.dispatchEvent(new CustomEvent('sync_status', {
        detail: {
          status: 'error',
          isInitialLoad: false,
          message: 'Sync failed. Will retry automatically.'
        }
      }));
    } finally {
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
      executeUnifiedRef.current(reason);
    };
    (window as any).triggerSyncUserData = (reason: any) => {
      executeUnifiedRef.current(reason);
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

  // 10-Hour Unified Refresh & Sync Checker (checked on App Open / mount & resume)
  useEffect(() => {
    if (!user?.uid) return;

    const check10HourUnified = () => {
      const storageKey = `last_unified_10h_refresh_sync_time_v2_${user.uid}`;
      const lastUnifiedStr = localStorage.getItem(storageKey);
      const lastUnifiedTime = lastUnifiedStr ? parseInt(lastUnifiedStr, 10) : 0;
      const now = Date.now();
      const TEN_HOURS_MS = 10 * 60 * 60 * 1000;

      if (!lastUnifiedTime || (now - lastUnifiedTime >= TEN_HOURS_MS)) {
        executeUnifiedRef.current('10_hour_sync');
      }
    };

    // Check 1 second after mount
    const timer = setTimeout(() => {
      check10HourUnified();
    }, 1000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        check10HourUnified();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user?.uid]);

  return null;
}
