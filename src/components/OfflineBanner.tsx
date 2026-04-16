import { useState, useEffect } from 'react';
import { WifiOff } from 'lucide-react';
import { safeStorage } from '../utils/safeStorage';

export function OfflineBanner() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [hasCache, setHasCache] = useState(false);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Check if we have essential cache
    const checkCache = () => {
      const hasContent = !!safeStorage.getItem('content_cache');
      const hasSettings = !!localStorage.getItem('settings_cache');
      setHasCache(hasContent || hasSettings);
    };
    checkCache();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline) return null;

  if (!hasCache) {
    return (
      <div className="fixed inset-0 z-[9999] bg-white dark:bg-zinc-950 flex flex-col items-center justify-center p-4 text-center">
        <div className="bg-red-500/10 p-6 rounded-full mb-6">
          <WifiOff className="w-16 h-16 text-red-500" />
        </div>
        <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-2">No Internet Connection</h2>
        <p className="text-zinc-500 dark:text-zinc-400 max-w-md">
          You are currently offline and we don't have any cached data to show you. Please connect to the internet and try again.
        </p>
        <button 
          onClick={() => window.location.reload()}
          className="mt-8 bg-emerald-500 text-white px-6 py-3 rounded-lg font-medium hover:bg-emerald-600 transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] bg-red-500 text-white px-6 py-2.5 rounded-full flex items-center justify-center gap-2 text-sm font-medium shadow-lg whitespace-nowrap">
      <WifiOff className="w-4 h-4" />
      <span>Offline Mode</span>
    </div>
  );
}
