import React, { useState, useCallback, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { clsx } from 'clsx';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useHaptics } from '../hooks/useHaptics';

export function HeaderRefreshButton() {
  const [isRefreshingData, setIsRefreshingData] = useState(() => Boolean((window as any).__isAppDataSyncing));
  const { user, refreshProfile, isSyncing } = useAuth();
  const { refreshSettings } = useSettings();
  const { t } = useLanguage();
  const { vibrate } = useHaptics();

  useEffect(() => {
    let safetyTimeout: NodeJS.Timeout | null = null;
    const handleSyncStatus = (e: any) => {
      if (e?.detail?.status === 'syncing') {
        (window as any).__isAppDataSyncing = true;
        setIsRefreshingData(true);
        if (safetyTimeout) clearTimeout(safetyTimeout);
        safetyTimeout = setTimeout(() => {
          (window as any).__isAppDataSyncing = false;
          setIsRefreshingData(false);
        }, 30000);
      } else if (
        e?.detail?.status === 'success' ||
        e?.detail?.status === 'error' ||
        e?.detail?.status === 'up-to-date'
      ) {
        (window as any).__isAppDataSyncing = false;
        setIsRefreshingData(false);
        if (safetyTimeout) clearTimeout(safetyTimeout);
      }
    };
    window.addEventListener('sync_status', handleSyncStatus);
    return () => {
      window.removeEventListener('sync_status', handleSyncStatus);
      if (safetyTimeout) clearTimeout(safetyTimeout);
    };
  }, []);

  const handleRefresh = useCallback(async () => {
    if (isSyncing || isRefreshingData) return;
    vibrate(50);
    setIsRefreshingData(true);

    try {
      const promises: Promise<any>[] = [];
      if (user) {
        promises.push(refreshSettings(true).catch(err => console.warn('Header refreshSettings error:', err)));
      }

      if (typeof (window as any).triggerRefreshAppData === 'function') {
        promises.push((window as any).triggerRefreshAppData('header_button'));
      } else if (user) {
        promises.push(refreshProfile(true, 'manual').catch(() => {}));
      }

      await Promise.allSettled(promises);
    } catch (err) {
      console.error('Error refreshing app data from header:', err);
    } finally {
      setIsRefreshingData(false);
    }
  }, [isSyncing, isRefreshingData, vibrate, refreshProfile, refreshSettings]);

  const isBusy = isSyncing || isRefreshingData;

  return (
    <button
      id="header-quick-refresh-btn"
      onClick={handleRefresh}
      disabled={isBusy}
      className={clsx(
        'w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200',
        isBusy
          ? 'text-emerald-500 bg-emerald-500/10 cursor-not-allowed'
          : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-emerald-500 dark:hover:text-emerald-400 active:scale-95'
      )}
      title={isBusy ? t('Refreshing...') : t('Refresh App Data')}
      aria-label={t('Refresh App Data')}
    >
      <RefreshCw
        className={clsx(
          'w-4 h-4 transition-transform',
          isBusy && 'animate-spin text-emerald-500'
        )}
      />
    </button>
  );
}
