import React, { createContext, useContext, useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface PWAContextType {
  deferredPrompt: any;
  isInstallable: boolean;
  isInstalled: boolean;
  isChecking: boolean;
  pwaWarning: string | null;
  dismissWarning: () => void;
  installApp: () => Promise<void>;
}

const PWAContext = createContext<PWAContextType | undefined>(undefined);

export function PWAProvider({ children }: { children: React.ReactNode }) {
  const [deferredPrompt, setDeferredPrompt] = useState<any>((window as any).deferredPrompt);
  const [isInstallable, setIsInstallable] = useState(!!(window as any).deferredPrompt);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [pwaWarning, setPwaWarning] = useState<string | null>(null);
  const isInstallableRef = React.useRef(isInstallable);

  useEffect(() => {
    isInstallableRef.current = isInstallable;
  }, [isInstallable]);

  useEffect(() => {
    if (pwaWarning) {
      const timer = setTimeout(() => setPwaWarning(null), 8000);
      return () => clearTimeout(timer);
    }
  }, [pwaWarning]);

  useEffect(() => {
    // Check if already installed
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;
    console.log('PWA: isStandalone check:', isStandalone);
    setIsInstalled(isStandalone);

    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const handleChange = (e: MediaQueryListEvent) => {
      console.log('PWA: display-mode changed:', e.matches);
      setIsInstalled(e.matches);
    };
    mediaQuery.addEventListener('change', handleChange);

    // Give the browser some time to fire the beforeinstallprompt event
    const timer = setTimeout(() => {
      console.log('PWA detection timeout reached. isInstallable:', isInstallableRef.current);
      setIsChecking(false);
    }, 6000); // Increased to 6 seconds

    const handlePWAInstallable = (e: any) => {
      setDeferredPrompt(e.detail);
      setIsInstallable(true);
      setIsChecking(false);
      console.log('PWA: React received pwa-installable event');
    };

    const handlePWAInstalled = () => {
      setIsInstalled(true);
      setIsInstallable(false);
      setDeferredPrompt(null);
      console.log('PWA: React received pwa-installed event');
    };

    window.addEventListener('pwa-installable', handlePWAInstallable);
    window.addEventListener('pwa-installed', handlePWAInstalled);

    // Also check for the event again in case it fired before this listener was added
    if ((window as any).deferredPrompt) {
      setDeferredPrompt((window as any).deferredPrompt);
      setIsInstallable(true);
      setIsChecking(false);
    }

    // Periodic check for global deferredPrompt
    const interval = setInterval(() => {
      if ((window as any).deferredPrompt && !isInstallableRef.current) {
        setDeferredPrompt((window as any).deferredPrompt);
        setIsInstallable(true);
        setIsChecking(false);
      }
    }, 1000);

    return () => {
      clearTimeout(timer);
      clearInterval(interval);
      mediaQuery.removeEventListener('change', handleChange);
      window.removeEventListener('pwa-installable', handlePWAInstallable);
      window.removeEventListener('pwa-installed', handlePWAInstalled);
    };
  }, []);

  const dismissWarning = () => setPwaWarning(null);

  const installApp = async () => {
    const prompt = deferredPrompt || (window as any).deferredPrompt;
    if (!prompt) {
      const msg = "PWA: No deferred prompt available in this browser. To install MovizNow, please open your browser menu (⋮ or Share icon) and choose 'Add to Home Screen' or 'Install App'.";
      console.warn('PWA: No deferredPrompt available');
      setPwaWarning(msg);
      return;
    }

    try {
      prompt.prompt();
      const { outcome } = await prompt.userChoice;
      console.log(`PWA: User choice outcome: ${outcome}`);
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
        (window as any).deferredPrompt = null;
        setIsInstallable(false);
      }
    } catch (err: any) {
      console.error('PWA: Installation failed:', err);
      setPwaWarning(`PWA Installation Notice: ${err?.message || 'Could not trigger installation prompt.'}`);
    }
  };

  return (
    <PWAContext.Provider value={{ deferredPrompt, isInstallable, isInstalled, isChecking, pwaWarning, dismissWarning, installApp }}>
      {pwaWarning && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[99999] w-[92%] max-w-md bg-amber-500 text-zinc-950 p-4 rounded-2xl shadow-2xl backdrop-blur-md flex items-start gap-3 border border-amber-300 animate-in fade-in slide-in-from-top duration-300">
          <AlertTriangle className="w-5 h-5 shrink-0 text-zinc-950 mt-0.5" />
          <div className="flex-1 text-xs font-semibold leading-relaxed">
            <div className="font-extrabold text-sm mb-0.5">PWA Installation Notice</div>
            {pwaWarning}
          </div>
          <button
            onClick={dismissWarning}
            className="shrink-0 p-1.5 rounded-lg bg-zinc-950/10 hover:bg-zinc-950/20 text-zinc-950 transition-colors"
            title="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {children}
    </PWAContext.Provider>
  );
}

export function usePWA() {
  const context = useContext(PWAContext);
  if (context === undefined) {
    throw new Error('usePWA must be used within a PWAProvider');
  }
  return context;
}
