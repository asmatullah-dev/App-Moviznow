import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {HelmetProvider} from 'react-helmet-async';
import App from './App.tsx';
import ErrorBoundary from './components/ErrorBoundary.tsx';
import './index.css';
import 'react-lazy-load-image-component/src/effects/blur.css';

// Clean up cache-busting parameter from URL if present
if (typeof window !== 'undefined' && window.location.search.includes('_v=')) {
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete('_v');
    window.history.replaceState({}, '', url.pathname + (url.search ? url.search : '') + url.hash);
  } catch (e) {}
}

// Force update helper to ensure new Vercel deployments bypass browser & SW caches completely
const forceUpdateNewDeployment = async (reason: string) => {
  if (import.meta.env.DEV) {
    console.log(`[Deployment] ${reason} detected (Dev mode: auto-reload suppressed).`);
    return;
  }

  const now = Date.now();
  const lastReload = parseInt(sessionStorage.getItem('last_deployment_reload') || '0', 10);

  // Prevent infinite loop if reload happened in the last 10 seconds
  if (now - lastReload < 10000) return;
  sessionStorage.setItem('last_deployment_reload', String(now));

  console.log(`[Deployment] ${reason} - Clearing caches and reloading fresh build...`);

  try {
    // 1. Tell active Service Worker to skip waiting
    if (navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' });
    }

    // 2. Clear all Web Cache API caches (Workbox / PWA caches)
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
  } catch (e) {
    console.warn('[Deployment] Cache purge warning:', e);
  }

  // 3. Force hard refresh with cache-busting timestamp to fetch new build from Vercel
  window.location.href = window.location.pathname + '?_v=' + Date.now();
};

// Vercel deployment update detection via index header checks
let currentEtag: string | null = sessionStorage.getItem('app_build_etag');
const checkForVercelDeployment = async () => {
  if (import.meta.env.DEV) return;
  try {
    const res = await fetch(`/?_t=${Date.now()}`, { method: 'HEAD', cache: 'no-store' });
    const etag = res.headers.get('Etag') || res.headers.get('Last-Modified');
    if (etag) {
      if (!currentEtag) {
        currentEtag = etag;
        sessionStorage.setItem('app_build_etag', etag);
      } else if (currentEtag !== etag) {
        sessionStorage.setItem('app_build_etag', etag);
        await forceUpdateNewDeployment('Vercel new deployment build etag change');
      }
    }
  } catch (err) {}
};

// Check for Vercel deployment on startup and periodically every 5 minutes
checkForVercelDeployment();
setInterval(checkForVercelDeployment, 5 * 60 * 1000);

// Register service worker for PWA and FCM with safe auto-update checks on production deployment
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('Service Worker registered with scope:', registration.scope);

        // Check for new Service Worker / deployment every 10 minutes
        setInterval(() => {
          registration.update().catch(() => {});
        }, 10 * 60 * 1000);

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
                forceUpdateNewDeployment('Service Worker installed new assets');
              }
            };
          }
        };
      })
      .catch((err) => {
        console.error('Service Worker registration failed:', err);
      });

    // Handle controllerchange (only reload if an existing active Service Worker was replaced)
    let hasExistingController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hasExistingController) {
        hasExistingController = false;
        forceUpdateNewDeployment('Service Worker controller changed');
      }
    });
  });
}

// Handle Vite preload errors (dynamic import failures when a new deployment updates JS chunks)
window.addEventListener('vite:preloadError', (event) => {
  console.warn('Vite preload error (new build deployed):', event);
  forceUpdateNewDeployment('Vite chunk preload error');
});

// Auto-reload on unhandled chunk loading rejections (e.g., stale JS chunks missing on server)
window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason?.message || String(event.reason || '');
  if (
    reason.includes('Failed to fetch dynamically imported module') ||
    reason.includes('Importing a module script failed') ||
    reason.includes('Loading chunk')
  ) {
    console.warn('Stale JS bundle detected after new deployment.');
    forceUpdateNewDeployment('Unhandled chunk loading error');
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

