import { useState, useEffect } from 'react';
import { RefreshCw, CheckCircle2, AlertCircle, Film } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

export function SyncBanner() {
  const { t } = useLanguage();
  const [syncStatus, setSyncStatus] = useState<'syncing' | 'up-to-date' | 'success' | 'error' | null>(null);
  const [updatedCount, setUpdatedCount] = useState<number | undefined>(undefined);
  const [customMessage, setCustomMessage] = useState<string | undefined>(undefined);
  const [isInitialLoad, setIsInitialLoad] = useState<boolean>(false);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout | null = null;
    let syncingSafetyTimeout: NodeJS.Timeout | null = null;

    const handleSyncStatus = (e: Event) => {
      const customEvent = e as CustomEvent;
      const detail = customEvent.detail;
      let status: 'syncing' | 'up-to-date' | 'success' | 'error' | null = null;
      let count: number | undefined = undefined;
      let msg: string | undefined = undefined;
      let initialLoad: boolean = false;

      if (typeof detail === 'string') {
        status = detail as any;
      } else if (detail && typeof detail === 'object') {
        status = detail.status;
        count = detail.updatedContentCount !== undefined ? detail.updatedContentCount : detail.updatedCount;
        msg = detail.message;
        initialLoad = Boolean(detail.isInitialLoad);
      }

      if (timeoutId) clearTimeout(timeoutId);
      if (syncingSafetyTimeout) clearTimeout(syncingSafetyTimeout);

      setSyncStatus(status);
      setUpdatedCount(count);
      setCustomMessage(msg);
      setIsInitialLoad(initialLoad);

      if (status === 'syncing') {
        syncingSafetyTimeout = setTimeout(() => {
          setSyncStatus(null);
          setUpdatedCount(undefined);
          setCustomMessage(undefined);
          setIsInitialLoad(false);
        }, 12000);
      } else if (status === 'success' || status === 'up-to-date' || status === 'error') {
        timeoutId = setTimeout(() => {
          setSyncStatus(null);
          setUpdatedCount(undefined);
          setCustomMessage(undefined);
          setIsInitialLoad(false);
        }, 3500);
      }
    };

    window.addEventListener('sync_status', handleSyncStatus);
    return () => {
      window.removeEventListener('sync_status', handleSyncStatus);
      if (timeoutId) clearTimeout(timeoutId);
      if (syncingSafetyTimeout) clearTimeout(syncingSafetyTimeout);
    };
  }, []);

  if (!syncStatus) return null;

  const bgClasses = {
    syncing: 'bg-blue-600 dark:bg-blue-600',
    'up-to-date': 'bg-zinc-800 dark:bg-zinc-800',
    success: 'bg-emerald-600 dark:bg-emerald-600',
    error: 'bg-rose-600 dark:bg-rose-600'
  };

  const getMessageText = () => {
    if (syncStatus === 'syncing') return t('Updating data...');
    if (syncStatus === 'error') return t('Sync failed. Will retry automatically.');
    if (syncStatus === 'success') {
      if (isInitialLoad || customMessage === 'Loaded All Contents Successfully') {
        return t('Loaded All Contents Successfully');
      }
      if (updatedCount && updatedCount > 0) {
        return `${updatedCount} ${t('content updated')}`;
      }
      if (customMessage) {
        return t(customMessage);
      }
      return t('Data updated successfully');
    }
    if (customMessage) {
      return t(customMessage);
    }
    return t('Data is up to date');
  };

  return (
    <div 
      id="sync-status-banner"
      className={`fixed bottom-16 left-1/2 -translate-x-1/2 z-[9999] ${bgClasses[syncStatus]} text-white px-5 py-2.5 rounded-full flex items-center justify-center gap-2 text-xs sm:text-sm font-semibold shadow-2xl backdrop-blur-md border border-white/20 whitespace-nowrap transition-all duration-300 pointer-events-none`}
    >
      {syncStatus === 'syncing' ? (
        <RefreshCw className="w-4 h-4 animate-spin text-blue-200" />
      ) : syncStatus === 'error' ? (
        <AlertCircle className="w-4 h-4 text-rose-200" />
      ) : isInitialLoad ? (
        <CheckCircle2 className="w-4 h-4 text-emerald-200" />
      ) : (
        <CheckCircle2 className="w-4 h-4 text-emerald-200" />
      )}
      <span>{getMessageText()}</span>
    </div>
  );
}
