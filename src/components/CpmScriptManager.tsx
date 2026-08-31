import React, { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { isUserExemptFromAds, isAdRestrictedRoute, purgeAllAdElements } from '../utils/adUtils';

// Cooldowns
const POPUNDER_COOLDOWN_MS = 180000; // 3 Minutes
const VIGNETTE_COOLDOWN_MS = 60000;  // 1 Minute

const POPUNDER_STORAGE_KEY = 'moviznow_popunder_last_trigger';
const VIGNETTE_STORAGE_KEY = 'moviznow_vignette_last_trigger';

// Popunders
const SESSION_CPM_SCRIPTS = [
  'https://commercialhalftime.com/99/e7/8b/99e78b0792c97e620e43154c137cd1f3.js',
];

// Page-level Ads
const PAGE_CPM_SCRIPTS = [
  {
    src: 'https://nap5k.com/tag.min.js', // Monetag MultiTag (Social Bar/Native)
    zone: '11681684',
    type: 'multitag'
  },
  {
    src: 'https://n6wxm.com/vignette.min.js', // Monetag Vignette
    zone: '11681786',
    type: 'vignette'
  }
];

export const CpmScriptManager: React.FC = () => {
  const { profile } = useAuth();
  const location = useLocation();
  const popunderTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const vignetteTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const isPopunderActiveRef = useRef<boolean>(false);

  useEffect(() => {
    const isLogin = isAdRestrictedRoute(location.pathname);
    const isExempt = isUserExemptFromAds(profile);

    if (isLogin || isExempt) {
      purgeAllAdElements();
      isPopunderActiveRef.current = false;
      
      if (popunderTimeoutRef.current) clearTimeout(popunderTimeoutRef.current);
      if (vignetteTimeoutRef.current) clearTimeout(vignetteTimeoutRef.current);
      return;
    }

    const now = Date.now();

    // ============================================
    // 1. VIGNETTE & PAGE LEVEL ADS
    // ============================================
    PAGE_CPM_SCRIPTS.forEach(config => {
      if (config.type === 'vignette') {
        let lastVignette = 0;
        try { lastVignette = parseInt(sessionStorage.getItem(VIGNETTE_STORAGE_KEY) || '0', 10); } catch (e) {}
        
        const elapsed = now - lastVignette;
        if (elapsed < VIGNETTE_COOLDOWN_MS) {
          if (vignetteTimeoutRef.current) clearTimeout(vignetteTimeoutRef.current);
          vignetteTimeoutRef.current = setTimeout(() => {
             injectScript(config.src, config.zone, config.type);
          }, VIGNETTE_COOLDOWN_MS - elapsed);
          return;
        }
      }
      injectScript(config.src, config.zone, config.type);
    });

    // ============================================
    // 2. POPUNDER ADS
    // ============================================
    let lastPopunder = 0;
    try { lastPopunder = parseInt(sessionStorage.getItem(POPUNDER_STORAGE_KEY) || '0', 10); } catch (e) {}

    const popElapsed = now - lastPopunder;
    if (popElapsed < POPUNDER_COOLDOWN_MS) {
      isPopunderActiveRef.current = false;
      if (popunderTimeoutRef.current) clearTimeout(popunderTimeoutRef.current);
      popunderTimeoutRef.current = setTimeout(() => {
         injectPopunder();
      }, POPUNDER_COOLDOWN_MS - popElapsed);
    } else {
      injectPopunder();
    }

    function injectScript(src: string, zone?: string, type?: string) {
      if (document.querySelector(`script[src="${src}"]`)) return;
      
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      if (zone) script.setAttribute('data-zone', zone);
      
      if (type === 'vignette') {
        try { sessionStorage.setItem(VIGNETTE_STORAGE_KEY, String(Date.now())); } catch(e) {}
      }
      document.head.appendChild(script);
    }

    function injectPopunder() {
      SESSION_CPM_SCRIPTS.forEach(src => {
        if (!document.querySelector(`script[src="${src}"]`)) {
          const script = document.createElement('script');
          script.src = src;
          script.async = true;
          script.setAttribute('data-popunder-script', 'true');
          document.head.appendChild(script);
        }
      });
      isPopunderActiveRef.current = true;
    }
  }, [location.pathname, profile]);

  // ============================================
  // GLOBAL CLICK HIJACKING PREVENTION & COOLDOWN
  // ============================================
  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      try {
        const target = e.target as HTMLElement;
        if (target && target.tagName && !target.closest('#root')) {
          const oldPointerEvents = target.style.pointerEvents;
          target.style.pointerEvents = 'none';
          const elementUnderneath = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement;
          target.style.pointerEvents = oldPointerEvents;

          if (elementUnderneath && elementUnderneath !== target) {
            setTimeout(() => {
              elementUnderneath.click();
            }, 50);
          }
        }
      } catch (err) {}

      if (isPopunderActiveRef.current) {
        try { sessionStorage.setItem(POPUNDER_STORAGE_KEY, String(Date.now())); } catch(e) {}
        isPopunderActiveRef.current = false;
        
        SESSION_CPM_SCRIPTS.forEach(src => {
          const existing = document.querySelectorAll(`script[src="${src}"]`);
          existing.forEach(el => el.remove());
        });
      }
    };

    window.addEventListener('click', handleGlobalClick, { capture: true });
    window.addEventListener('pointerdown', handleGlobalClick, { capture: true });

    return () => {
      window.removeEventListener('click', handleGlobalClick, { capture: true });
      window.removeEventListener('pointerdown', handleGlobalClick, { capture: true });
    };
  }, []);

  return null;
};
