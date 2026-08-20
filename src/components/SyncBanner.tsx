import { useState, useEffect } from 'react';
import { RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

export function SyncBanner() {
  const { t } = useLanguage();
  const [syncStatus, setSyncStatus] = useState<'syncing' | 'up-to-date' | 'success' | 'error' | null>(null);
  const [updatedCount, setUpdatedCount] = useState<number | undefined>(undefined);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout | null = null;

    const handleSyncStatus = (e: Event) => {
      const customEvent = e as CustomEvent;
      const detail = customEvent.detail;
      let status: 'syncing' | 'up-to-date' | 'success' | 'error' | null = null;
      let count: number | undefined = undefined;

      if (typeof detail === 'string') {
        status = detail as any;
      } else if (detail && typeof detail === 'object') {
        status = detail.status;
        count = detail.updatedContentCount !== undefined ? detail.updatedContentCount : detail.updatedCount;
      }

      if (timeoutId) clearTimeout(timeoutId);
      setSyncStatus(status);
      setUpdatedCount(count);

      if (status === 'success' || status === 'up-to-date' || status === 'error') {
        timeoutId = setTimeout(() => {
          setSyncStatus(null);
          setUpdatedCount(undefined);
        }, 3500);
      }
    };

    window.addEventListener('sync_status', handleSyncStatus);
    return () => {
      window.removeEventListener('sync_status', handleSyncStatus);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  if (!syncStatus) return null;

  const bgClasses = {
    syncing: 'bg-blue-500',
    'up-to-date': 'bg-zinc-500',
    success: 'bg-emerald-500',
    error: 'bg-rose-500'
  };

  const getMessageText = () => {
    if (syncStatus === 'syncing') return t('Updating data...');
    if (syncStatus === 'error') return t('Sync failed. Will retry automatically.');
    if (syncStatus === 'success') {
      if (updatedCount && updatedCount > 0) {
        return `${updatedCount} ${t('content updated')}`;
      }
      return t('Data updated successfully');
    }
    return t('Data is up to date');
  };

  return (
    <div className={`fixed bottom-16 left-1/2 -translate-x-1/2 z-[9999] ${bgClasses[syncStatus]} text-white px-6 py-2.5 rounded-full flex items-center justify-center gap-2 text-sm font-medium shadow-lg whitespace-nowrap transition-all duration-300`}>
      {syncStatus === 'syncing' ? (
        <RefreshCw className="w-4 h-4 animate-spin" />
      ) : syncStatus === 'error' ? (
        <AlertCircle className="w-4 h-4" />
      ) : (
        <CheckCircle2 className="w-4 h-4" />
      )}
      <span>{getMessageText()}</span>
    </div>
  );
}
