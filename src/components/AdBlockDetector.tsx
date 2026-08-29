import React, { useState, useEffect } from 'react';
import { ShieldAlert, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../contexts/AuthContext';
import { isUserExemptFromAds } from '../utils/adUtils';

export const AdBlockDetector: React.FC = () => {
  const { profile } = useAuth();
  const [isAdBlockActive, setIsAdBlockActive] = useState(false);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    // Don't run for exempt users
    if (isUserExemptFromAds(profile)) return;

    const checkAdBlock = async () => {
      try {
        // Attempt to fetch a common ad script URL
        const response = await fetch('https://www.google-analytics.com/analytics.js', {
          method: 'HEAD',
          mode: 'no-cors',
          cache: 'no-store',
        });
        setIsAdBlockActive(false);
      } catch (error) {
        // If fetch fails, likely blocked by adblocker
        setIsAdBlockActive(true);
      }
    };

    // Also try checking for blocked elements after a short delay
    const checkElements = () => {
      const adElement = document.createElement('div');
      adElement.className = 'ad-banner ads-box ad-placement';
      adElement.style.position = 'absolute';
      adElement.style.left = '-9999px';
      adElement.style.top = '-9999px';
      document.body.appendChild(adElement);

      const isBlocked = window.getComputedStyle(adElement).display === 'none' || adElement.offsetHeight === 0;
      if (isBlocked) setIsAdBlockActive(true);
      
      document.body.removeChild(adElement);
    };

    // Run both checks
    checkAdBlock();
    const timer = setTimeout(checkElements, 2000);

    return () => clearTimeout(timer);
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
