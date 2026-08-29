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

// Global Fetch Interceptor to route /api traffic to Firebase Functions (Cloudflare bypass)
const originalFetch = window.fetch;
try {
  Object.defineProperty(window, 'fetch', {
    configurable: true,
    enumerable: true,
    get() {
      return async (...args: any[]) => {
        let [resource, config] = args;
        const firebaseApiUrl = import.meta.env.VITE_FIREBASE_API_URL;
        
        if (
          firebaseApiUrl && 
          typeof resource === 'string' && 
          resource.startsWith('/api/') && 
          !resource.includes('version') && 
          !resource.includes('image-proxy')
        ) {
          // Re-route the API call to Firebase instead of Vercel to bypass 10-second timeout & IP blocks
          const baseUrl = firebaseApiUrl.endsWith('/') ? firebaseApiUrl.slice(0, -1) : firebaseApiUrl;
          resource = baseUrl + resource;
        }
        
        return originalFetch(resource, config);
      };
    }
  });
} catch (e) {
  console.error("Could not override fetch for Firebase API routing:", e);
}

// Safe reload helper to prevent repeated/rapid reloads (guards with 30s cooldown)
const triggerAppReload = (reason: string) => {
  const now = Date.now();
  const lastReload = parseInt(sessionStorage.getItem('last_auto_reload_timestamp') || '0', 10);
  
  if (now - lastReload > 30000) {
    sessionStorage.setItem('last_auto_reload_timestamp', String(now));
    console.log(`[Auto-Update] Update triggered due to: ${reason}`);
    window.location.reload();
  }
};

// Check version endpoint on backend
let isCheckingDeployment = false;
let initialBaselineEstablished = false;
let knownServerVersion: string | null = null;
const pageLoadTimestamp = Date.now();

const checkDeploymentVersion = async () => {
  if (import.meta.env.DEV) return;
  if (isCheckingDeployment) return;
  
  isCheckingDeployment = true;
  try {
    const res = await fetch(`/api/version?_t=${Date.now()}`, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      const serverVersion = data?.version;
      
      if (serverVersion && serverVersion !== 'unknown') {
        if (!initialBaselineEstablished) {
          initialBaselineEstablished = true;
          knownServerVersion = serverVersion;
          console.log('[Auto-Update] Initial version baseline established:', {
            client: CURRENT_BUILD_ID,
            server: serverVersion
          });
        } else if (knownServerVersion && serverVersion !== knownServerVersion) {
          // A new deployment occurred while the app was running
          console.log('[Auto-Update] New deployment detected! Old:', knownServerVersion, 'New:', serverVersion);
          knownServerVersion = serverVersion;
          triggerAppReload('New deployment version detected');
        } else if (
          CURRENT_BUILD_ID !== 'unknown' &&
          serverVersion !== CURRENT_BUILD_ID &&
          Date.now() - pageLoadTimestamp > 60000
        ) {
          // Stale client version after 1 minute of active use
          console.log('[Auto-Update] Stale client build detected. Refreshing to latest version...');
          triggerAppReload('Stale client version');
        }
      }
    }
  } catch (err) {
    console.warn('[Auto-Update] Version check error:', err);
  } finally {
    isCheckingDeployment = false;
  }
};

// Check version on launch and periodically / on resume
if (typeof window !== 'undefined') {
  // Initial check after page is settled
  setTimeout(checkDeploymentVersion, 3000);
  
  // Periodic check every 5 minutes
  setInterval(checkDeploymentVersion, 5 * 60 * 1000);
  
  // Check when user resumes the tab
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      checkDeploymentVersion();
    }
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

  document.addEventListener('touchstart', (e: TouchEvent) => {
    const touch = e.touches[0];
    touchStartTime = Date.now();
    startX = touch.clientX;
    startY = touch.clientY;
    hasMovedSignificant = false;
  }, { passive: true });

  document.addEventListener('touchmove', (e: TouchEvent) => {
    if (touchStartTime > 0) {
      const touch = e.touches[0];
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
        hasMovedSignificant = true;
      }
    }
  }, { passive: true });

  document.addEventListener('touchend', (e: TouchEvent) => {
    const elapsed = Date.now() - touchStartTime;
    touchStartTime = 0;
    
    // If it's a short tap (not a long press) or they moved significantly, clear selection
    if ((elapsed < 500 || hasMovedSignificant) && !isInputElement(e.target)) {
      setTimeout(() => {
        const selection = window.getSelection();
        if (selection) {
          selection.removeAllRanges();
        }
      }, 10);
    }
  }, { passive: true });

  document.addEventListener('mousedown', (e: MouseEvent) => {
    if (e.button !== 0) return; // Only left click
    mouseStartTime = Date.now();
    startX = e.clientX;
    startY = e.clientY;
    hasMovedSignificant = false;
  });

  document.addEventListener('mousemove', (e: MouseEvent) => {
    if (mouseStartTime > 0) {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
        hasMovedSignificant = true;
      }
    }
  });

  document.addEventListener('mouseup', (e: MouseEvent) => {
    const elapsed = Date.now() - mouseStartTime;
    mouseStartTime = 0;

    // If it's a short click (not a long press) or they moved significantly, clear selection
    if ((elapsed < 500 || hasMovedSignificant) && !isInputElement(e.target)) {
      setTimeout(() => {
        const selection = window.getSelection();
        if (selection) {
          selection.removeAllRanges();
        }
      }, 10);
    }
  });

  // Clear selections on any double click as well to prevent double-click selection
  document.addEventListener('dblclick', (e: MouseEvent) => {
    if (!isInputElement(e.target)) {
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
      }
    }
  });
}

