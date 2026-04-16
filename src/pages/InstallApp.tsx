import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Home, Smartphone, Monitor, ShieldCheck, Zap, RefreshCw } from 'lucide-react';
import { usePWA } from '../contexts/PWAContext';

export default function InstallApp() {
  const navigate = useNavigate();
  const { isInstallable, isInstalled, isChecking, installApp } = usePWA();

  const handleInstall = async () => {
    console.log('InstallApp: handleInstall called, isInstallable:', isInstallable);
    if (isInstallable) {
      await installApp();
    } else {
      console.log('InstallApp: Direct installation not available, scrolling to instructions');
      const el = document.getElementById('install-instructions');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
      } else {
        alert('To install this app, please use the "Add to Home Screen" option in your browser menu.');
      }
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-white flex flex-col items-center justify-center p-6 transition-colors duration-300">
      <div className="max-w-md w-full bg-zinc-50 dark:bg-zinc-900 rounded-2xl shadow-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800">
        <div className="p-8 text-center bg-gradient-to-b from-emerald-900/40 to-zinc-900">
          <div className="w-24 h-24 bg-emerald-500 rounded-2xl mx-auto flex items-center justify-center mb-6 shadow-lg shadow-emerald-500/20">
            <Download className="w-12 h-12 text-zinc-900 dark:text-white" />
          </div>
          <h1 className="text-3xl font-bold mb-2">Install App</h1>
          <p className="text-zinc-500 dark:text-zinc-400">Get the best experience by installing our app on your device.</p>
        </div>

        <div className="p-6 space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-zinc-100 dark:bg-zinc-800/50 p-4 rounded-xl flex flex-col items-center text-center">
              <Zap className="w-6 h-6 text-emerald-400 mb-2" />
              <span className="text-sm font-medium">Fast Access</span>
            </div>
            <div className="bg-zinc-100 dark:bg-zinc-800/50 p-4 rounded-xl flex flex-col items-center text-center">
              <Monitor className="w-6 h-6 text-emerald-400 mb-2" />
              <span className="text-sm font-medium">Full Screen</span>
            </div>
            <div className="bg-zinc-100 dark:bg-zinc-800/50 p-4 rounded-xl flex flex-col items-center text-center">
              <Smartphone className="w-6 h-6 text-emerald-400 mb-2" />
              <span className="text-sm font-medium">Mobile Ready</span>
            </div>
            <div className="bg-zinc-100 dark:bg-zinc-800/50 p-4 rounded-xl flex flex-col items-center text-center">
              <ShieldCheck className="w-6 h-6 text-emerald-400 mb-2" />
              <span className="text-sm font-medium">Secure</span>
            </div>
          </div>

          <div className="space-y-3 pt-4 border-t border-zinc-200 dark:border-zinc-800">
            {isInstalled ? (
              <div className="bg-emerald-500/10 text-emerald-400 p-4 rounded-xl text-center font-medium border border-emerald-500/20">
                App is already installed!
              </div>
            ) : isChecking ? (
              <div className="w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border border-zinc-300 dark:border-zinc-700 animate-pulse">
                <RefreshCw className="w-5 h-5 animate-spin" />
                Checking for app...
              </div>
            ) : (
              <div className="space-y-4">
                <button
                  onClick={handleInstall}
                  className={`w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${
                    isInstallable 
                      ? "bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/20" 
                      : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 border border-zinc-300 dark:border-zinc-700"
                  }`}
                >
                  <Download className="w-5 h-5" />
                  {isInstallable ? "Install app" : "Installation not available"}
                </button>
                
                {!isInstallable && (
                  <div className="space-y-4">
                    <p className="text-[10px] text-zinc-500 text-center">
                      Direct installation not supported by your browser. Use the instructions below.
                    </p>
                    
                    <button
                      onClick={() => {
                        if ('serviceWorker' in navigator) {
                          navigator.serviceWorker.getRegistrations().then(registrations => {
                            for (let registration of registrations) {
                              registration.unregister();
                            }
                            caches.keys().then(names => {
                              for (let name of names) caches.delete(name);
                            });
                            window.location.reload();
                          });
                        } else {
                          window.location.reload();
                        }
                      }}
                      className="w-full py-3 rounded-xl font-medium flex items-center justify-center gap-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-500 dark:text-zinc-400 transition-all border border-zinc-300 dark:border-zinc-700 text-xs"
                    >
                      <RefreshCw className="w-4 h-4" />
                      Reset App & Fix Issues
                    </button>
                  </div>
                )}
              </div>
            )}
            
            <button
              onClick={() => navigate('/')}
              className="w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white transition-all border border-zinc-300 dark:border-zinc-700"
            >
              <Home className="w-5 h-5" />
              Go to Home
            </button>
          </div>
          
          {!isInstallable && !isInstalled && (
            <div id="install-instructions" className="pt-4 border-t border-zinc-200 dark:border-zinc-800 mt-4">
              <h3 className="text-sm font-bold mb-2 text-zinc-600 dark:text-zinc-300">Installation Instructions:</h3>
              <ul className="text-xs text-zinc-500 space-y-2 list-disc pl-4">
                <li>
                  <span className="text-zinc-500 dark:text-zinc-400 font-medium">iOS (Safari):</span> Tap the <span className="text-emerald-500">Share</span> button and select <span className="text-emerald-500">"Add to Home Screen"</span>.
                </li>
                <li>
                  <span className="text-zinc-500 dark:text-zinc-400 font-medium">Android (Chrome):</span> Tap the <span className="text-emerald-500">three dots</span> and select <span className="text-emerald-500">"Install app"</span>.
                </li>
                <li>
                  <span className="text-zinc-500 dark:text-zinc-400 font-medium">Desktop (Chrome/Edge):</span> Look for the <span className="text-emerald-500">Install icon</span> in the address bar.
                </li>
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
