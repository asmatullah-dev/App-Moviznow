import { useState, useEffect } from 'react';
import { WifiOff, Crown, LogIn } from 'lucide-react';
import { safeStorage } from '../utils/safeStorage';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';

export function OfflineBanner() {
  const { t } = useLanguage();
  const { profile, loading } = useAuth();
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
      const hasSettings = !!localStorage.getItem('cached_app_settings');
      setHasCache(hasContent || hasSettings);
    };
    checkCache();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline) return null;
  if (loading) return null; // Avoid blocking while loading profile status

  // Anyone who is NOT an authorized VIP/Admin/Owner/Manager role is restricted from offline access (this includes Guest/unauthenticated users)
  const isLoggedIn = !!profile?.uid;
  const userRole = profile?.role;
  const isAuthorizedRole = userRole && ['vip', 'owner', 'admin', 'manager', 'content_manager', 'user_manager'].includes(userRole);
  const isRestrictedRole = !isAuthorizedRole;

  if (isRestrictedRole) {
    if (!isLoggedIn) {
      return (
        <div className="fixed inset-0 z-[9999] bg-zinc-950 flex flex-col items-center justify-center p-6 text-center">
          <div className="relative mb-6">
            <div className="absolute inset-0 bg-blue-500/20 blur-2xl rounded-full scale-150 animate-pulse" />
            <div className="relative bg-blue-500/10 p-6 rounded-full border border-blue-500/30">
              <LogIn className="w-16 h-16 text-blue-400" />
            </div>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white mb-3 tracking-tight">
            {t('Login to access offline')}
          </h2>
          <p className="text-zinc-400 max-w-md text-sm leading-relaxed mb-8">
            {t('Please connect to the internet and login to enjoy offline access.')}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 w-full max-w-xs justify-center">
            <button 
              onClick={() => {
                window.location.href = '/login';
              }}
              className="w-full bg-gradient-to-r from-blue-500 to-indigo-600 text-white px-6 py-3.5 rounded-xl font-bold hover:opacity-90 transition-opacity text-sm uppercase tracking-wider cursor-pointer shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2"
            >
              <LogIn className="w-4 h-4 text-white" />
              {t('Login to Access')}
            </button>
            <button 
              onClick={() => window.location.reload()}
              className="w-full bg-zinc-900 border border-zinc-800 text-zinc-300 px-6 py-3.5 rounded-xl font-medium hover:bg-zinc-800 transition-colors text-sm cursor-pointer"
            >
              {t('Try Reconnecting')}
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="fixed inset-0 z-[9999] bg-zinc-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="relative mb-6">
          <div className="absolute inset-0 bg-amber-500/20 blur-2xl rounded-full scale-150 animate-pulse" />
          <div className="relative bg-amber-500/10 p-6 rounded-full border border-amber-500/30">
            <Crown className="w-16 h-16 text-amber-400" />
          </div>
        </div>
        <h2 className="text-2xl sm:text-3xl font-black text-white mb-3 tracking-tight">
          {t('Buy VIP membership to access offline')}
        </h2>
        <p className="text-zinc-400 max-w-md text-sm leading-relaxed mb-8">
          {t('Offline Access is a premium feature exclusive to VIP members. Please connect to the internet and buy a VIP membership to enjoy uninterrupted offline access.')}
        </p>
        <div className="flex flex-col sm:flex-row gap-4 w-full max-w-xs justify-center">
          <button 
            onClick={() => {
              window.location.href = '/membership';
            }}
            className="w-full bg-gradient-to-r from-amber-500 to-orange-600 text-white px-6 py-3.5 rounded-xl font-bold hover:opacity-90 transition-opacity text-sm uppercase tracking-wider cursor-pointer shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2"
          >
            <Crown className="w-4 h-4 text-white" />
            {t('Buy VIP Membership')}
          </button>
          <button 
            onClick={() => window.location.reload()}
            className="w-full bg-zinc-900 border border-zinc-800 text-zinc-300 px-6 py-3.5 rounded-xl font-medium hover:bg-zinc-800 transition-colors text-sm cursor-pointer"
          >
            {t('Try Reconnecting')}
          </button>
        </div>
      </div>
    );
  }

  if (!hasCache) {
    return (
      <div className="fixed inset-0 z-[9999] bg-white dark:bg-zinc-950 flex flex-col items-center justify-center p-4 text-center">
        <div className="bg-red-500/10 p-6 rounded-full mb-6">
          <WifiOff className="w-16 h-16 text-red-500" />
        </div>
        <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-2">{t('No Internet Connection')}</h2>
        <p className="text-zinc-500 dark:text-zinc-400 max-w-md">
          {t('You are currently offline and we don\'t have any cached data to show you. Please connect to the internet and try again.')}
        </p>
        <button 
          onClick={() => window.location.reload()}
          className="mt-8 bg-emerald-500 text-white px-6 py-3 rounded-lg font-medium hover:bg-emerald-600 transition-colors"
        >
          {t('Try Again')}
        </button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] bg-red-500 text-white px-6 py-2.5 rounded-full flex items-center justify-center gap-2 text-sm font-medium shadow-lg whitespace-nowrap">
      <WifiOff className="w-4 h-4" />
      <span>{t('Offline Mode')}</span>
    </div>
  );
}
