import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { ShieldAlert, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../contexts/AuthContext';
import { isUserExemptFromAds, isAdRestrictedRoute } from '../utils/adUtils';

export const AdBlockDetector: React.FC = () => {
  const { profile } = useAuth();
  const location = useLocation();
  const [isAdBlockActive, setIsAdBlockActive] = useState(false);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    // Don't run on login page or for exempt users
    if (isUserExemptFromAds(profile) || isAdRestrictedRoute(location.pathname)) {
      setIsAdBlockActive(false);
      return;
    }

    const checkAdBlock = async () => {
      // Small delay to allow scripts to start loading
      await new Promise(resolve => setTimeout(resolve, 3000));

      if (isAdRestrictedRoute(window.location.pathname)) {
        setIsAdBlockActive(false);
        return;
      }

      let adBlockDetected = false;


      // 1. Bait Fetch (Google AdSense is the most reliable indicator)
      try {
        const response = await fetch('https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js', {
          method: 'HEAD',
          mode: 'no-cors',
          cache: 'no-store',
        });
      } catch (error) {
        adBlockDetected = true;
      }

      // 2. DOM Check (Verify if specific ad elements are hidden)
      if (!adBlockDetected) {
        const bait = document.createElement('div');
        bait.className = 'pub_300x250 pub_300x250m pub_728x90 text-ad textAd ads-container ad-unit';
        bait.setAttribute('style', 'position: absolute; left: -9999px; top: -9999px; width: 1px; height: 1px;');
        document.body.appendChild(bait);
        
        // Wait for next frame
        await new Promise(resolve => requestAnimationFrame(resolve));
        
        const styles = window.getComputedStyle(bait);
        if (styles.display === 'none' || styles.visibility === 'hidden' || bait.offsetHeight === 0) {
          adBlockDetected = true;
        }
        document.body.removeChild(bait);
      }

      // 3. Verification check: Are our actual ad scripts missing?
      // Only confirm if at least one of these checks fails AND we aren't seeing any ads
      if (adBlockDetected) {
        // If we detected something, double check if ANY CPM script managed to load
        const scripts = document.querySelectorAll('script');
        const hasAdScript = Array.from(scripts).some(s => 
          s.src.includes('commercialhalftime.com')
        );
        
        // If we have ad scripts loaded, it's a false positive or partial block, don't show yet
        if (hasAdScript) {
          setIsAdBlockActive(false);
        } else {
          setIsAdBlockActive(true);
        }
      } else {
        setIsAdBlockActive(false);
      }
    };

    checkAdBlock();
  }, [profile]);

  if (!isAdBlockActive || !isVisible) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 50, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.95 }}
        className="fixed bottom-4 right-4 z-[9999] max-w-sm w-[calc(100vw-2rem)]"
      >
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden">
          <div className="p-4 flex gap-4">
            <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center text-amber-600 dark:text-amber-500">
              <ShieldAlert className="w-6 h-6" />
            </div>
            
            <div className="flex-grow pt-0.5">
              <div className="flex items-center justify-between gap-2 mb-1">
                <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">Ad Blocker Detected</h3>
                <button 
                  onClick={() => setIsVisible(false)}
                  className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors text-zinc-400"
                  aria-label="Dismiss"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
                MovizNow depends on ads to provide premium movies for free. Please consider disabling your ad blocker for the best experience.
              </p>
              
              <div className="mt-3 flex gap-3">
                <button 
                  onClick={() => window.location.reload()}
                  className="text-xs font-medium px-3 py-1.5 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg hover:opacity-90 transition-opacity"
                >
                  I've disabled it
                </button>
                <button 
                  onClick={() => setIsVisible(false)}
                  className="text-xs font-medium px-3 py-1.5 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
                >
                  Maybe later
                </button>
              </div>
            </div>
          </div>
          
          <div className="h-1 bg-amber-500/20 w-full overflow-hidden">
            <motion.div 
              initial={{ x: "-100%" }}
              animate={{ x: "0%" }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
              className="h-full bg-amber-500 w-1/3"
            />
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
