import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {HelmetProvider} from 'react-helmet-async';
import App from './App.tsx';
import ErrorBoundary from './components/ErrorBoundary.tsx';
import './index.css';
import 'react-lazy-load-image-component/src/effects/blur.css';

// Safe reload helper to prevent infinite refresh loops (suppressed in dev mode, max once per 30 mins in prod)
const safeReloadForSWUpdate = () => {
  if (import.meta.env.DEV) {
    console.log('[SW] Service Worker update detected (Dev mode: auto-reload suppressed to prevent loop).');
    return;
  }
  const now = Date.now();
  const lastReload = parseInt(sessionStorage.getItem('last_sw_auto_reload') || '0', 10);
  // Only auto-reload if not already reloaded in the last 30 minutes
  if (now - lastReload > 30 * 60 * 1000) {
    sessionStorage.setItem('last_sw_auto_reload', String(now));
    console.log('[SW] New version detected! Auto-reloading app...');
    window.location.reload();
  }
};

// Vercel deployment update detection via index header checks
let currentEtag: string | null = null;
const checkForVercelDeployment = async () => {
  if (import.meta.env.DEV) return;
  try {
    const res = await fetch(`/?_t=${Date.now()}`, { method: 'HEAD', cache: 'no-store' });
    const etag = res.headers.get('Etag') || res.headers.get('Last-Modified');
    if (etag) {
      if (!currentEtag) {
        currentEtag = etag;
      } else if (currentEtag !== etag) {
        console.log('[Vercel] New deployment detected via header change. Auto-reloading app...');
        const now = Date.now();
        const lastReload = parseInt(sessionStorage.getItem('last_vercel_reload') || '0', 10);
        if (now - lastReload > 30 * 60 * 1000) { // Limit auto-reloads to once per 30 mins
          sessionStorage.setItem('last_vercel_reload', String(now));
          window.location.reload();
        }
      }
    }
  } catch (err) {}
};

setInterval(checkForVercelDeployment, 15 * 60 * 1000);

// Register service worker for PWA and FCM with safe auto-update checks on production deployment
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('Service Worker registered with scope:', registration.scope);

        // Check for new Service Worker / deployment every 30 minutes
        setInterval(() => {
          registration.update().catch(() => {});
        }, 30 * 60 * 1000);

        // Check for updates when user opens/focuses the app in a new session or tab
        window.addEventListener('focus', () => {
          registration.update().catch(() => {});
          checkForVercelDeployment();
        });

        registration.onupdatefound = () => {
          const installingWorker = registration.installing;
          if (installingWorker) {
            installingWorker.onstatechange = () => {
              if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                safeReloadForSWUpdate();
              }
            };
          }
        };
      })
      .catch((err) => {
        console.error('Service Worker registration failed:', err);
      });

    // Handle controllerchange (when new Service Worker activates)
    let isRefreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!isRefreshing) {
        isRefreshing = true;
        safeReloadForSWUpdate();
      }
    });
  });
}

// Handle Vite preload errors (dynamic import failures when a new deployment updates JS chunks)
window.addEventListener('vite:preloadError', (event) => {
  console.warn('Vite preload error (new build deployed):', event);
  const lastChunkReload = parseInt(sessionStorage.getItem('last_chunk_error_reload') || '0', 10);
  if (Date.now() - lastChunkReload > 60 * 1000) {
    sessionStorage.setItem('last_chunk_error_reload', String(Date.now()));
    window.location.reload();
  }
});

// Auto-reload on unhandled chunk loading rejections (e.g., stale JS chunks missing on server)
window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason?.message || String(event.reason || '');
  if (
    reason.includes('Failed to fetch dynamically imported module') ||
    reason.includes('Importing a module script failed') ||
    reason.includes('Loading chunk')
  ) {
    const lastChunkReload = parseInt(sessionStorage.getItem('last_chunk_error_reload') || '0', 10);
    if (Date.now() - lastChunkReload > 60 * 1000) {
      sessionStorage.setItem('last_chunk_error_reload', String(Date.now()));
      console.warn('Stale JS bundle detected after new deployment. Auto-refreshing app...');
      window.location.reload();
    }
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

