import React, { createContext, useContext, useEffect, useState } from 'react';

interface PWAContextType {
  deferredPrompt: any;
  isInstallable: boolean;
  isInstalled: boolean;
  isChecking: boolean;
  installApp: () => Promise<void>;
}

const PWAContext = createContext<PWAContextType | undefined>(undefined);

export function PWAProvider({ children }: { children: React.ReactNode }) {
  const [deferredPrompt, setDeferredPrompt] = useState<any>((window as any).deferredPrompt);
  const [isInstallable, setIsInstallable] = useState(!!(window as any).deferredPrompt);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const isInstallableRef = React.useRef(isInstallable);

  useEffect(() => {
    isInstallableRef.current = isInstallable;
  }, [isInstallable]);

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

  const installApp = async () => {
    const prompt = deferredPrompt || (window as any).deferredPrompt;
    if (!prompt) {
      console.warn('PWA: No deferredPrompt available');
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
    } catch (err) {
      console.error('PWA: Installation failed:', err);
    }
  };

  return (
    <PWAContext.Provider value={{ deferredPrompt, isInstallable, isInstalled, isChecking, installApp }}>
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
