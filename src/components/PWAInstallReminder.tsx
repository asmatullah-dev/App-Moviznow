import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, X, CheckCircle2, Sparkles, Share2, Smartphone } from 'lucide-react';
import { usePWA } from '../contexts/PWAContext';
import { safeStorage } from '../utils/safeStorage';

export const PWAInstallReminder: React.FC = () => {
  const { isInstallable, isInstalled, installApp } = usePWA();
  const [isVisible, setIsVisible] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [showIosGuide, setShowIosGuide] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // 1. If already installed in standalone mode, never prompt
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
      (window.navigator as any).standalone === true;
    if (isStandalone || isInstalled) {
      setIsVisible(false);
      return;
    }

    // 2. Check if snoozed
    const snoozedUntilStr = safeStorage.getItem('pwa_install_prompt_snoozed_until');
    if (snoozedUntilStr) {
      const snoozedUntil = parseInt(snoozedUntilStr, 10);
      if (!isNaN(snoozedUntil) && Date.now() < snoozedUntil) {
        setIsVisible(false);
        return;
      }
    }

    // 3. Detect iOS Safari
    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    const isSafari = /Safari/.test(navigator.userAgent) && !/CriOS|FxiOS|Chrome/.test(navigator.userAgent);
    const isIosCandidate = isIos && isSafari && !isStandalone;

    if (!isInstallable && !isIosCandidate) {
      setIsVisible(false);
      return;
    }

    setShowIosGuide(isIosCandidate && !isInstallable);

    // Stagger prompt appearance (wait 5 seconds so initial page loads smoothly)
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, 5000);

    return () => clearTimeout(timer);
  }, [isInstallable, isInstalled]);

  const handleInstallClick = async () => {
    if (showIosGuide) {
      // For iOS, user must tap Share -> Add to Home Screen manually
      return;
    }

    setIsInstalling(true);
    try {
      await installApp();
      safeStorage.removeItem('pwa_install_prompt_snoozed_until');
    } catch (err) {
      console.warn("PWA install error:", err);
    } finally {
      setIsInstalling(false);
    }
  };

  const handleDismiss = () => {
    // Snooze for 15 minutes so it doesn't interrupt active browsing/watching
    safeStorage.setItem('pwa_install_prompt_snoozed_until', (Date.now() + 15 * 60 * 1000).toString());
    setIsVisible(false);
  };

  if (!isVisible || isInstalled) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 50, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.95 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="fixed bottom-5 left-4 right-4 sm:right-auto sm:left-6 sm:max-w-sm z-[9985] bg-zinc-950/95 text-white backdrop-blur-xl border border-zinc-800 shadow-2xl rounded-2xl p-4 sm:p-5 select-none"
      >
        <div className="flex items-start justify-between gap-3 mb-2.5">
          <div className="flex items-center gap-2.5">
            <div className="relative p-2.5 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white shadow-lg shrink-0">
              <Download className="w-5 h-5 animate-bounce" />
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-400 rounded-full" />
            </div>
            <div>
              <h4 className="font-black text-sm text-white flex items-center gap-1.5 leading-tight">
                Install MovizNow App 📲 <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              </h4>
              <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1">
                <Smartphone className="w-3 h-3" />
                Fast 1-Tap Playback
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            className="text-zinc-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
            title="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {showIosGuide ? (
          <div>
            <p className="text-xs text-zinc-300 mb-3 leading-relaxed">
              Install MovizNow on your iPhone/iPad for fullscreen streaming and lock-screen alerts:
            </p>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 mb-3 text-xs text-zinc-300 space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 font-bold flex items-center justify-center text-[10px]">1</span>
                <span>Tap the <Share2 className="w-3.5 h-3.5 inline text-blue-400 mx-0.5" /> <strong>Share</strong> button in Safari toolbar.</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 font-bold flex items-center justify-center text-[10px]">2</span>
                <span>Scroll down and select <strong>"Add to Home Screen" ⊞</strong>.</span>
              </div>
            </div>
            <button
              type="button"
              onClick={handleDismiss}
              className="w-full bg-zinc-800 hover:bg-zinc-700 active:scale-95 text-white text-xs font-bold py-2 px-4 rounded-xl transition-all shadow-md cursor-pointer"
            >
              Got It
            </button>
          </div>
        ) : (
          <div>
            <p className="text-xs text-zinc-300 mb-3.5 leading-relaxed">
              Install MovizNow directly onto your device for faster streaming, full-screen playback, offline mode, and instant notifications!
            </p>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleInstallClick}
                disabled={isInstalling}
                className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 active:scale-95 text-white text-xs font-bold py-2.5 px-4 rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isInstalling ? "Opening..." : "Install Now"}
              </button>
              <button
                type="button"
                onClick={handleDismiss}
                className="px-3 py-2.5 text-xs font-bold text-zinc-400 hover:bg-zinc-800 hover:text-white rounded-xl transition-colors cursor-pointer"
              >
                Maybe Later
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
};
