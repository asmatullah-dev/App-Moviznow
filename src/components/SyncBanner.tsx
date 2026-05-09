import { useState, useEffect } from 'react';
import { RefreshCw, CheckCircle2 } from 'lucide-react';

export function SyncBanner() {
  const [syncStatus, setSyncStatus] = useState<'syncing' | 'up-to-date' | 'success' | null>(null);

  useEffect(() => {
    const handleSyncStatus = (e: Event) => {
      const customEvent = e as CustomEvent;
      setSyncStatus(customEvent.detail);

      if (customEvent.detail === 'success' || customEvent.detail === 'up-to-date') {
        setTimeout(() => {
          setSyncStatus(null);
        }, 3000);
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

  const text = {
    syncing: 'Updating data...',
    'up-to-date': 'Data is up to date',
    success: 'Data updated successfully'
  };

  return (
    <div className={`fixed bottom-16 left-1/2 -translate-x-1/2 z-[9999] ${bgClasses[syncStatus]} text-white px-6 py-2.5 rounded-full flex items-center justify-center gap-2 text-sm font-medium shadow-lg whitespace-nowrap transition-all duration-300`}>
      {syncStatus === 'syncing' ? (
        <RefreshCw className="w-4 h-4 animate-spin" />
      ) : (
        <CheckCircle2 className="w-4 h-4" />
      )}
      <span>{text[syncStatus]}</span>
    </div>
  );
}
