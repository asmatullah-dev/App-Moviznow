import { useState, useEffect } from 'react';
import { RefreshCw, CheckCircle2 } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

export function SyncBanner() {
  const { t } = useLanguage();
  const [syncStatus, setSyncStatus] = useState<'syncing' | 'up-to-date' | 'success' | null>(null);
  const [updatedCount, setUpdatedCount] = useState<number | undefined>(undefined);

  useEffect(() => {
    const handleSyncStatus = (e: Event) => {
      const customEvent = e as CustomEvent;
      const detail = customEvent.detail;
      let status: 'syncing' | 'up-to-date' | 'success' | null = null;
      let count: number | undefined = undefined;

      if (typeof detail === 'string') {
        status = detail as any;
      } else if (detail && typeof detail === 'object') {
        status = detail.status;
        count = detail.updatedContentCount;
      }

      setSyncStatus(status);
      setUpdatedCount(count);

      if (status === 'success' || status === 'up-to-date') {
        setTimeout(() => {
          setSyncStatus(null);
          setUpdatedCount(undefined);
        }, 3200);
      }
    };

    window.addEventListener('sync_status', handleSyncStatus);
    return () => window.removeEventListener('sync_status', handleSyncStatus);
  }, []);

  if (!syncStatus) return null;

  const bgClasses = {
    syncing: 'bg-blue-500',
    'up-to-date': 'bg-zinc-500',
    success: 'bg-emerald-500'
  };

  const getMessageText = () => {
    if (syncStatus === 'syncing') return t('Updating data...');
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
      ) : (
        <CheckCircle2 className="w-4 h-4" />
      )}
      <span>{getMessageText()}</span>
    </div>
  );
}
