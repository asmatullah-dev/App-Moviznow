import { useState, useEffect, useRef } from 'react';
import { RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

export function SyncBanner() {
  const { t } = useLanguage();
  const [syncStatus, setSyncStatus] = useState<'syncing' | 'up-to-date' | 'success' | 'error' | null>(null);
  const [updatedCount, setUpdatedCount] = useState<number | undefined>(undefined);
  const [customMessage, setCustomMessage] = useState<string | undefined>(undefined);
  const [isInitialLoad, setIsInitialLoad] = useState<boolean>(false);
  const activeManualScopeRef = useRef<string | null>(null);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout | null = null;
    let syncingSafetyTimeout: NodeJS.Timeout | null = null;
    let lastEventKey = '';
    let lastEventTime = 0;

    const handleSyncStatus = (e: Event) => {
      const customEvent = e as CustomEvent;
      const detail = customEvent.detail;
      let status: 'syncing' | 'up-to-date' | 'success' | 'error' | null = null;
      let count: number | undefined = undefined;
      let msg: string | undefined = undefined;
      let initialLoad: boolean = false;
      let isManual: boolean = false;
      let scope: string = 'app';

      if (typeof detail === 'string') {
        status = detail as any;
      } else if (detail && typeof detail === 'object') {
        status = detail.status;
        count = detail.updatedContentCount !== undefined ? detail.updatedContentCount : detail.updatedCount;
        msg = detail.message;
        initialLoad = Boolean(detail.isInitialLoad);
        scope = detail.scope || 'app';
        isManual = Boolean(
          detail.isManual || 
          detail.manual || 
          detail.isManualTrigger ||
          msg === 'Refreshing...' ||
          msg === 'Refresh successfully' ||
          msg === 'Refreshing users...' ||
          msg === 'Users refreshed successfully' ||
          msg === 'Users are up to date'
        );
      }

      // STRICT RULE: Completely ignore all automatic/background sync events.
      // Only display banners when an action is explicitly manually triggered by the user.
      if (!isManual && !activeManualScopeRef.current) {
        return;
      }

      // If a manual operation is in progress for a specific scope (e.g. 'user_management'),
      // ignore non-matching background completions from other scopes.
      if (activeManualScopeRef.current && scope !== activeManualScopeRef.current && !isManual) {
        return;
      }

      if (status === 'syncing') {
        if (!isManual) return;
        activeManualScopeRef.current = scope;
      }

      const now = Date.now();
      const currentKey = `${scope}|${status}|${msg || ''}|${count || 0}`;
      if (currentKey === lastEventKey && (now - lastEventTime < 3000)) {
        return; // Ignore rapid duplicate identical event
      }
      lastEventKey = currentKey;
      lastEventTime = now;

      if (timeoutId) clearTimeout(timeoutId);
      if (syncingSafetyTimeout) clearTimeout(syncingSafetyTimeout);

      setSyncStatus(status);
      setUpdatedCount(count);
      setCustomMessage(msg);
      setIsInitialLoad(initialLoad);

      if (status === 'syncing') {
        syncingSafetyTimeout = setTimeout(() => {
          activeManualScopeRef.current = null;
          setSyncStatus(null);
          setUpdatedCount(undefined);
          setCustomMessage(undefined);
          setIsInitialLoad(false);
        }, 15000);
      } else if (status === 'success' || status === 'up-to-date' || status === 'error') {
        activeManualScopeRef.current = null;
        timeoutId = setTimeout(() => {
          setSyncStatus(null);
          setUpdatedCount(undefined);
          setCustomMessage(undefined);
          setIsInitialLoad(false);
        }, 3000);
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
    if (syncStatus === 'syncing') {
      if (isInitialLoad || customMessage === 'Loading Data...') {
        return t('Loading Data...');
      }
      if (customMessage) {
        return t(customMessage);
      }
      return t('Refreshing...');
    }
    if (syncStatus === 'error') {
      if (customMessage) return t(customMessage);
      return t('Sync failed. Please retry.');
    }
    if (syncStatus === 'success') {
      if (isInitialLoad || customMessage === 'Loaded All Contents Successfully') {
        return t('Loaded All Contents Successfully');
      }
      if (customMessage && customMessage !== '0 items updated' && customMessage !== '0 content updated') {
        return t(customMessage);
      }
      if (updatedCount && updatedCount > 0) {
        return `${updatedCount} ${t('content updated')}`;
      }
      return t('Refresh successfully');
    }
    if (customMessage && customMessage !== '0 items updated' && customMessage !== '0 content updated') {
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
      ) : (
        <CheckCircle2 className="w-4 h-4 text-emerald-200" />
      )}
      <span>{getMessageText()}</span>
    </div>
  );
}
