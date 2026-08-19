import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {HelmetProvider} from 'react-helmet-async';
import App from './App.tsx';
import ErrorBoundary from './components/ErrorBoundary.tsx';
import './index.css';
import 'react-lazy-load-image-component/src/effects/blur.css';

// Build identification to match client version against /api/version
const CURRENT_BUILD_ID = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'unknown';
console.log('[Auto-Update] Client running on build ID:', CURRENT_BUILD_ID);

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
const checkDeploymentVersion = async () => {
  if (import.meta.env.DEV) return;
  if (isCheckingDeployment) return;
  if (!CURRENT_BUILD_ID || CURRENT_BUILD_ID === 'unknown') return;
  
  isCheckingDeployment = true;
  try {
    const res = await fetch(`/api/version?_t=${Date.now()}`, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (data && data.version && data.version !== 'unknown' && data.version !== CURRENT_BUILD_ID) {
        console.log('[Auto-Update] Version mismatch! Server:', data.version, 'vs Client:', CURRENT_BUILD_ID);
        triggerAppReload('Deployment updated');
      }
    }
  } catch (err) {
    console.warn('[Auto-Update] Version check error:', err);
  } finally {
    isCheckingDeployment = false;
  }
};

// Check version periodically and on tab visibility resume
if (typeof window !== 'undefined') {
  setInterval(checkDeploymentVersion, 5 * 60 * 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      checkDeploymentVersion();
    }
  });
}

// Service Worker registration with safe controller change handling
if ('serviceWorker' in navigator) {
  const hadInitialController = !!navigator.serviceWorker.controller;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('Service Worker registered with scope:', registration.scope);

        // Check for updates periodically
        setInterval(() => {
          registration.update().catch(() => {});
        }, 5 * 60 * 1000);

        registration.onupdatefound = () => {
          const installingWorker = registration.installing;
          if (installingWorker) {
            installingWorker.onstatechange = () => {
              if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                console.log('[SW] New version found. Activating immediately.');
                if (registration.waiting) {
                  registration.waiting.postMessage({ type: 'SKIP_WAITING' });
                }
              }
            };
          }
        };
      })
      .catch((err) => {
        console.error('Service Worker registration failed:', err);
      });

    // Only reload if a controller ALREADY existed when the page opened (meaning an update occurred while user was active)
    let isRefreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadInitialController && !isRefreshing) {
        isRefreshing = true;
        triggerAppReload('Service worker controller updated');
      }
    });
  });
}

// Handle Vite preload errors (dynamic import failures when a new deployment updates JS chunks)
window.addEventListener('vite:preloadError', (event) => {
  console.warn('Vite preload error (new build deployed):', event);
  triggerAppReload('Vite preload error (stale chunks)');
});

// Auto-reload on unhandled chunk loading rejections (stale JS chunks missing on server)
window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason?.message || String(event.reason || '');
  if (
    reason.includes('Failed to fetch dynamically imported module') ||
    reason.includes('Importing a module script failed') ||
    reason.includes('Loading chunk')
  ) {
    console.warn('Stale JS bundle detected after new deployment. Auto-refreshing...');
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

