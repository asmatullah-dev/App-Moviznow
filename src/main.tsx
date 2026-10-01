import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {HelmetProvider} from 'react-helmet-async';
import App from './App.tsx';
import ErrorBoundary from './components/ErrorBoundary.tsx';
import './index.css';
import 'react-lazy-load-image-component/src/effects/blur.css';
import { BUILD_ID, APP_VERSION } from './version';

const CURRENT_BUILD_ID = BUILD_ID;
console.log('[Auto-Update] Client running on build ID:', CURRENT_BUILD_ID, 'version:', APP_VERSION);

// Safe reload helper to prevent repeated/rapid reloads (guards with 30s cooldown)
const triggerAppReload = (reason: string) => {
  const now = Date.now();
  const lastReload = parseInt(sessionStorage.getItem('last_auto_reload_timestamp') || '0', 10);
  
  if (now - lastReload > 30000) {
    sessionStorage.setItem('last_auto_reload_timestamp', String(now));
    console.log(`[Auto-Update] Update triggered due to: ${reason}`);

    // Signal Service Worker to activate new version immediately
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (reg) {
          reg.update().catch(() => {});
          if (reg.waiting) {
            reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          }
        }
      }).catch(() => {});

      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' });
      }
    }

    // Brief timeout so Service Worker message dispatches, then reload page
    setTimeout(() => {
      window.location.reload();
    }, 150);
  } else {
    console.warn(`[Auto-Update] Reload throttled (< 30s cooldown active). Reason: ${reason}`);
  }
};

// Check version endpoint on backend
let isCheckingDeployment = false;
let knownServerVersion: string | null = null;
let initialOpenRetryAttempted = false;

const handleVersionSuccess = (serverVersion: string) => {
  if (!serverVersion || serverVersion === 'unknown') return;

  const clientBuildId = CURRENT_BUILD_ID || APP_VERSION;

  // On first check or runtime check: compare live server version with client bundle build ID
  if (knownServerVersion === null) {
    knownServerVersion = serverVersion;
    console.log('[Auto-Update] Version initialized - Server:', serverVersion, '| Client Bundle:', clientBuildId);

    // If server version differs from client bundle (stale PWA/cache loaded after new Vercel deployment)
    if (clientBuildId && serverVersion !== clientBuildId) {
      console.log('[Auto-Update] Stale client bundle detected on app open! Server:', serverVersion, 'Client:', clientBuildId);
      triggerAppReload(`New Vercel deployment live (Server: ${serverVersion}, Client: ${clientBuildId})`);
    }
    return;
  }

  // If server version changes while app stays open (new Vercel deployment published)
  if (serverVersion !== knownServerVersion || (clientBuildId && serverVersion !== clientBuildId)) {
    console.log('[Auto-Update] Newer deployment detected during runtime!', {
      previous: knownServerVersion,
      clientBuild: clientBuildId,
      newServer: serverVersion,
    });
    knownServerVersion = serverVersion;
    triggerAppReload(`New Vercel deployment detected (Server updated to: ${serverVersion})`);
  }
};

const handleVersionFailure = (trigger: 'open' | 'open_retry' | 'background', err: any) => {
  if (err?.name !== 'AbortError') {
    console.warn(`[Auto-Update] Version check (${trigger}) failed:`, err?.message || err);
  } else {
    console.warn(`[Auto-Update] Version check (${trigger}) timed out`);
  }

  if (trigger === 'open') {
    // If the initial check fails on open: retry after 15 seconds
    if (!initialOpenRetryAttempted) {
      initialOpenRetryAttempted = true;
      console.log('[Auto-Update] Open version check failed. Retrying in 15 seconds...');
      setTimeout(() => {
        checkDeploymentVersion('open_retry');
      }, 15000);
    }
  } else if (trigger === 'open_retry') {
    console.log('[Auto-Update] Retry failed. Will check again on 5-min interval or tab resume.');
  }
};

const checkDeploymentVersion = async (trigger: 'open' | 'open_retry' | 'background' = 'background') => {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    handleVersionFailure(trigger, new Error('Device is offline'));
    return;
  }
  if (isCheckingDeployment) return;
  
  isCheckingDeployment = true;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(`/api/version?_t=${Date.now()}`, { 
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache'
      },
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      const serverVersion = data?.version;
      
      if (serverVersion && serverVersion !== 'unknown') {
        handleVersionSuccess(serverVersion);
      } else {
        handleVersionFailure(trigger, new Error('Invalid version payload'));
      }
    } else {
      handleVersionFailure(trigger, new Error(`HTTP status ${res.status}`));
    }
  } catch (err: any) {
    clearTimeout(timeoutId);
    handleVersionFailure(trigger, err);
  } finally {
    isCheckingDeployment = false;
  }
};

// Check version on launch and periodically / on resume
if (typeof window !== 'undefined') {
  // 1. Check version immediately on app open (800ms after load)
  setTimeout(() => {
    checkDeploymentVersion('open');
  }, 800);
  
  // 2. Keep checking the version in background every 5 minutes while app stays open
  setInterval(() => {
    checkDeploymentVersion('background');
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (reg) reg.update().catch(() => {});
      }).catch(() => {});
    }
  }, 5 * 60 * 1000);
  
  // 3. Background check whenever user re-opens / resumes the tab
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      checkDeploymentVersion('open');
    }
  });

  // 4. Background check when connection is restored
  window.addEventListener('online', () => {
    console.log('[Auto-Update] Online event received, checking version...');
    checkDeploymentVersion('open');
  });
}

// Service Worker registration (silent background updates without forced page reload on open)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        // Check for updates periodically in background
        setInterval(() => {
          registration.update().catch(() => {});
        }, 30 * 60 * 1000);
      })
      .catch((err) => {
        console.error('Service Worker registration failed:', err);
      });
  });
}

// Handle Vite preload errors (dynamic import failures when a new deployment updates JS chunks)
window.addEventListener('vite:preloadError', (event) => {
  console.warn('Vite preload error (stale chunks):', event);
  triggerAppReload('Vite preload error (stale chunks)');
});

// Auto-reload only on genuine chunk loading network failures
window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason?.message || String(event.reason || '');
  if (
    reason.includes('Failed to fetch dynamically imported module') ||
    reason.includes('Importing a module script failed') ||
    reason.includes('Loading chunk')
  ) {
    console.warn('Stale JS bundle detected after new deployment. Refreshing...');
    triggerAppReload('Stale JS chunk load error');
  }
});

createRoot(document.getElementById('root')!).render(
    <HelmetProvider>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </HelmetProvider>,
);

// Prevent accidental selection/search popups on short clicks/taps, while allowing native selection & context menus on long press
if (typeof window !== 'undefined') {
  let touchStartTime = 0;
  let mouseStartTime = 0;
  let startX = 0;
  let startY = 0;
  let hasMovedSignificant = false;

  const isInputElement = (el: any): boolean => {
    if (!el) return false;
    const element = el.nodeType === 3 ? el.parentElement : el;
    if (!element || typeof element.closest !== 'function') return false;
    return (
      element.tagName === 'INPUT' ||
      element.tagName === 'TEXTAREA' ||
      element.isContentEditable ||
      element.closest('input') ||
      element.closest('textarea')
    );
  };

  document.addEventListener('touchstart', () => {
    touchStartTime = Date.now();
  }, { passive: true });

  document.addEventListener('touchend', (e: TouchEvent) => {
    const elapsed = Date.now() - touchStartTime;
    touchStartTime = 0;
    if (elapsed < 350 && !isInputElement(e.target)) {
      setTimeout(() => {
        const selection = window.getSelection();
        if (selection && selection.type === 'Range') {
          selection.removeAllRanges();
        }
      }, 10);
    }
  }, { passive: true });

  document.addEventListener('mousedown', (e: MouseEvent) => {
    if (e.button === 0) mouseStartTime = Date.now();
  }, { passive: true });

  document.addEventListener('mouseup', (e: MouseEvent) => {
    const elapsed = Date.now() - mouseStartTime;
    mouseStartTime = 0;
    if (elapsed < 350 && !isInputElement(e.target)) {
      setTimeout(() => {
        const selection = window.getSelection();
        if (selection && selection.type === 'Range') {
          selection.removeAllRanges();
        }
      }, 10);
    }
  }, { passive: true });
}

