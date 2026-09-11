import React, { useState, useCallback, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { clsx } from 'clsx';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useHaptics } from '../hooks/useHaptics';

export function HeaderRefreshButton() {
  const [isRefreshingData, setIsRefreshingData] = useState(false);
  const { refreshProfile, isSyncing } = useAuth();
  const { refreshSettings } = useSettings();
  const { t } = useLanguage();
  const { vibrate } = useHaptics();

  useEffect(() => {
    const handleSyncStatus = (e: any) => {
      if (e?.detail?.status === 'syncing') {
        setIsRefreshingData(true);
      } else if (
        e?.detail?.status === 'success' ||
        e?.detail?.status === 'error' ||
        e?.detail?.status === 'up-to-date'
      ) {
        setIsRefreshingData(false);
      }
    };
    window.addEventListener('sync_status', handleSyncStatus);
    return () => window.removeEventListener('sync_status', handleSyncStatus);
  }, []);

  const handleRefresh = useCallback(async () => {
    if (isSyncing || isRefreshingData) return;
    vibrate(50);
    setIsRefreshingData(true);

    try {
      if (typeof (window as any).triggerRefreshAppData === 'function') {
        await (window as any).triggerRefreshAppData('user_profile_button');
      } else {
        await Promise.all([
          refreshProfile(true, 'manual'),
          refreshSettings(true),
        ]);
      }
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
