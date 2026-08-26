import { useEffect, useCallback, useRef } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db, runWithNetwork } from '../firebase';
import { useContent } from '../contexts/ContentContext';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { useNotifications } from '../contexts/NotificationContext';
import { safeStorage } from '../utils/safeStorage';
import { getChunkMeta } from '../utils/chunkMeta';
import { seedStaticExportData } from '../utils/staticContentLoader';

const FIVE_MINUTES_MS = 5 * 60 * 1000;
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

export function RefreshAppDataManager() {
  const { contentList, quickRefreshCatalog } = useContent();
  const { user, refreshProfile } = useAuth();
  const { refreshSettings } = useSettings();
  const { refreshNotifications } = useNotifications();
  const isRefreshingRef = useRef(false);

  const executeRefreshAppData = useCallback(async (reason: 'app_open' | 'manual' | 'catalog_button' | 'content_not_found' | 'user_profile_button' = 'manual') => {
    if (isRefreshingRef.current) return;

    // For guest users (unauthenticated), populate content library from static export JSON and skip Firestore network calls!
    if (!user) {
      seedStaticExportData();
      safeStorage.setItem('last_success_refresh_time', Date.now().toString());
      if (reason !== 'app_open') {
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

    const isLibraryEmpty = !contentList || contentList.length === 0;

    // Strict cooldown check using last success check time
    const lastSuccessStr = safeStorage.getItem('last_success_refresh_time');
    const lastSuccess = lastSuccessStr ? parseInt(lastSuccessStr, 10) : 0;
    
    // Default 5 minutes, App Open 6 hours
    let cooldown = FIVE_MINUTES_MS;
    if (reason === 'app_open') {
      cooldown = SIX_HOURS_MS;
    }

    if (!isLibraryEmpty && (Date.now() - lastSuccess < cooldown)) {
      return; // Skip if already refreshed successfully within cooldown period
    }

    if (!navigator.onLine) {
      if (reason !== 'app_open') {
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

    // Dispatch start toast
    window.dispatchEvent(new CustomEvent('sync_status', {
      detail: {
        status: 'syncing',
        isInitialLoad: isLibraryEmpty,
        message: isLibraryEmpty ? 'Loading Data...' : 'Updating data...'
      }
    }));

    try {
      // 1. Fetch single meta version doc from Firestore (using cached meta if recent)
      const isManualTrigger = reason === 'catalog_button' || reason === 'user_profile_button' || reason === 'manual';
      const versions: Record<string, any> = await getChunkMeta(isManualTrigger);

      const localMetaString = safeStorage.getItem('chunk_meta_versions') || '{}';
      let localMeta: Record<string, any> = {};
      try { localMeta = JSON.parse(localMetaString); } catch(e) {}

      let isUpToDate = true;

      // Check content chunks
      for (const [chunkId, versionMeta] of Object.entries(versions)) {
        if (['collections', 'notifications', 'lastGlobalUpdate', 'metadata', 'users', 'fcm_tokens', 'settings'].includes(chunkId)) continue;
        const serverVer = typeof versionMeta === 'object' ? ((versionMeta as any).version || 0) : (versionMeta || 0);
        const localV = localMeta[chunkId];
        const localVer = typeof localV === 'object' ? (localV.version || 0) : (localV || 0);
        const hasChunkData = !!safeStorage.getItem('content_chunk_' + chunkId);
        if (!hasChunkData || localVer < serverVer) {
          isUpToDate = false;
          break;
        }
      }

      // Check metadata version
      if (isUpToDate) {
        const serverMetadataVal = versions.metadata;
        const serverMetadataVer = typeof serverMetadataVal === 'object' ? (serverMetadataVal?.version || 0) : (serverMetadataVal || 0);
        const localMetadataVal = localMeta.metadata;
        const localMetadataVer = typeof localMetadataVal === 'object' ? (localMetadataVal?.version || 0) : (localMetadataVal || 0);
        const hasMetadata = !!safeStorage.getItem('genres_cache');
        if (!hasMetadata || localMetadataVer < serverMetadataVer) {
          isUpToDate = false;
        }
      }

      // Check collections version
      if (isUpToDate) {
        const serverCollectionsVal = versions.collections;
        const serverCollectionsVer = typeof serverCollectionsVal === 'object' ? (serverCollectionsVal?.version || 0) : (serverCollectionsVal || 0);
        const localCollectionsVer = localMeta.collections || 0;
        const hasCollections = !!safeStorage.getItem('collections_cache');
        if (!hasCollections || localCollectionsVer < serverCollectionsVer) {
          isUpToDate = false;
        }
      }

      // Check settings version
      if (isUpToDate) {
        const serverSettingsVer = versions.settings || 0;
        const localSettingsVer = parseInt(safeStorage.getItem('cached_settings_version') || '0', 10);
        const hasSettings = !!safeStorage.getItem('cached_app_settings');
        if (!hasSettings || (serverSettingsVer > 0 && localSettingsVer < serverSettingsVer)) {
          isUpToDate = false;
        }
      }

      // Check notifications version (only if logged in)
      if (isUpToDate && user?.uid) {
        const serverNotifVal = versions.notifications;
        const serverNotifVer = typeof serverNotifVal === 'object' ? (serverNotifVal?.version || 0) : (serverNotifVal || 0);
        const localNotifVer = parseInt(safeStorage.getItem('cached_notifications_version') || '0', 10);
        if (serverNotifVer > 0 && localNotifVer < serverNotifVer) {
          isUpToDate = false;
        }
      }

      // Check self user version (from user data only check for self version by ignoring other user versions)
      if (isUpToDate && user?.uid) {
        const chunkUsersMeta = versions.users || {};
        const serverUserVer = chunkUsersMeta[user.uid] || 0;
        const localUserVer = parseInt(safeStorage.getItem(`profile_version_${user.uid}`) || '0', 10);
        if (serverUserVer > 0 && localUserVer < serverUserVer) {
          isUpToDate = false;
        }
      }

      if (isUpToDate && !isLibraryEmpty) {
        safeStorage.setItem('last_success_refresh_time', Date.now().toString());
        window.dispatchEvent(new CustomEvent('sync_status', {
          detail: {
            status: 'up-to-date',
            isInitialLoad: false,
            updatedCount: 0,
            message: 'Data is up to date'
          }
        }));
        isRefreshingRef.current = false;
        return;
      }

      // 2. Refresh catalog content chunks (pass false so quickRefreshCatalog does not dispatch premature completion toast)
      const catalogResult = await quickRefreshCatalog(false, versions);

      let otherUpdated = false;

      // 3. Check settings version
      const serverSettingsVer = versions.settings || 0;
      const localSettingsVer = parseInt(safeStorage.getItem('cached_settings_version') || '0', 10);
      if ((serverSettingsVer > 0 && serverSettingsVer > localSettingsVer) || !safeStorage.getItem('cached_app_settings')) {
        await refreshSettings(true).catch(() => {});
        otherUpdated = true;
      }

      // 4. Check notifications version (only if logged in)
      if (user?.uid) {
        const serverNotifVer = (versions.notifications && typeof versions.notifications === 'object')
          ? versions.notifications.version || 0
          : (versions.notifications || 0);
        const localNotifVer = parseInt(safeStorage.getItem('cached_notifications_version') || '0', 10);
        if (serverNotifVer > 0 && serverNotifVer > localNotifVer) {
          await refreshNotifications().catch(() => {});
          otherUpdated = true;
        }
      }

      // 5. Check self user version
      if (user?.uid) {
        const chunkUsersMeta = versions.users || {};
        const serverUserVer = chunkUsersMeta[user.uid] || 0;
        const localUserVer = parseInt(safeStorage.getItem(`profile_version_${user.uid}`) || '0', 10);
        if (serverUserVer > 0 && serverUserVer > localUserVer) {
          await refreshProfile(true, 'manual').catch(() => {});
          otherUpdated = true;
        }
      }

      const updatedCount = catalogResult.updatedCount || 0;

      // Update the last success refresh time stamp
      safeStorage.setItem('last_success_refresh_time', Date.now().toString());

      // Dispatch single completion toast
      if (isLibraryEmpty) {
        window.dispatchEvent(new CustomEvent('sync_status', {
          detail: {
            status: 'success',
            isInitialLoad: true,
            updatedCount: 0,
            message: 'Loaded All Contents Successfully'
          }
        }));
      } else if (updatedCount > 0) {
        window.dispatchEvent(new CustomEvent('sync_status', {
          detail: {
            status: 'success',
            isInitialLoad: false,
            updatedCount: updatedCount,
            message: `${updatedCount} content updated`
          }
        }));
      } else if (otherUpdated || catalogResult.updated) {
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
    } catch (err) {
      console.error('Error during Refresh App Data:', err);
      window.dispatchEvent(new CustomEvent('sync_status', {
        detail: {
          status: 'error',
          isInitialLoad: isLibraryEmpty,
          message: 'Sync failed. Will retry automatically.'
        }
      }));
    } finally {
      isRefreshingRef.current = false;
    }
  }, [contentList, quickRefreshCatalog, user?.uid, refreshProfile, refreshSettings, refreshNotifications]);

  // Expose window trigger
  const executeRefreshRef = useRef(executeRefreshAppData);
  useEffect(() => {
    executeRefreshRef.current = executeRefreshAppData;
  }, [executeRefreshAppData]);

  useEffect(() => {
    (window as any).triggerRefreshAppData = (reason: any) => {
      executeRefreshRef.current(reason);
    };

    const handleEvent = (e: Event) => {
      const customEvent = e as CustomEvent;
      const reason = customEvent.detail?.reason || 'manual';
      executeRefreshRef.current(reason);
    };

    window.addEventListener('trigger_refresh_app_data', handleEvent);
    return () => {
      delete (window as any).triggerRefreshAppData;
      window.removeEventListener('trigger_refresh_app_data', handleEvent);
    };
  }, []);

  const hasRunAppOpenRef = useRef(false);

  // Trigger on App Open (once on mount with 30-min cooldown)
  useEffect(() => {
    if (hasRunAppOpenRef.current) return;
    hasRunAppOpenRef.current = true;

    const timer = setTimeout(() => {
      executeRefreshRef.current('app_open');
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  return null;
}
