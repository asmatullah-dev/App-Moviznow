import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { Suspense, lazy, useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  modalBackdropAnimation,
  modalContainerAnimation,
  modalGpuStyle,
} from './utils/modalAnimations';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ContentProvider } from './contexts/ContentContext';
import { AdminContentProvider } from './contexts/AdminContentContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { PWAProvider } from './contexts/PWAContext';
import { CartProvider } from './contexts/CartContext';
import { SettingsProvider } from './contexts/SettingsContext';
import { UsersProvider } from './contexts/UsersContext';
import { LanguageProvider, useLanguage } from './contexts/LanguageContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Loader2 } from 'lucide-react';
import { SystemNotificationWrapper } from './components/SystemNotificationWrapper';
import { MediaModal } from './components/MediaModal';
import AlertModal from './components/AlertModal';
import { useModalBehavior } from './hooks/useModalBehavior';
import { useGlobalButtonHaptics } from './hooks/useHaptics';
import { safeStorage } from './utils/safeStorage';
import { OfflineBanner } from './components/OfflineBanner';
import { SyncBanner } from './components/SyncBanner';
import { SyncUserDataManager } from './components/SyncUserDataManager';
import { RefreshAppDataManager } from './components/RefreshAppDataManager';
import { AnalyticsTracker } from './components/AnalyticsTracker';
import { AdSenseScriptManager } from './components/AdSenseScriptManager';
import { CpmScriptManager } from './components/CpmScriptManager';
import { AdBlockDetector } from './components/AdBlockDetector';

// Eager Loaded User Pages for Instant Client-Side Navigation
import Home from './pages/user/Home';
import Login from './pages/Login';
import MovieDetails from './pages/user/MovieDetails';
import MaintenancePage from './pages/MaintenancePage';
import FreeMovies from './pages/user/FreeMovies';
import Membership from './pages/user/Membership';
import Reviews from './pages/user/Reviews';
import About from './pages/user/About';
import Contact from './pages/user/Contact';
import WatchLater from './pages/user/WatchLater';
import Favorites from './pages/user/Favorites';
import Trial from './pages/user/Trial';
import VipTrial from './pages/user/VipTrial';
import TopUp from './pages/user/TopUp';
import Cart from './pages/user/Cart';
import Settings from './pages/user/Settings';
import InstallApp from './pages/InstallApp';
import Unsubscribe from './pages/Unsubscribe';

// Lazy Loaded Admin Pages (Not loaded for standard users)
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'));
const Analytics = lazy(() => import('./pages/admin/Analytics'));
const ContentManagement = lazy(() => import('./pages/admin/ContentManagement'));
const GenreManagement = lazy(() => import('./pages/admin/GenreManagement'));
const LanguageManagement = lazy(() => import('./pages/admin/LanguageManagement'));
const QualityManagement = lazy(() => import('./pages/admin/QualityManagement'));
const UserManagement = lazy(() => import('./pages/admin/UserManagement'));
const UserManagers = lazy(() => import('./pages/admin/UserManagers'));
const SelectedContentUsers = lazy(() => import('./pages/admin/SelectedContentUsers'));
const CollectionsManagement = lazy(() => import('./pages/admin/CollectionsManagement'));
const IncomeManagement = lazy(() => import('./pages/admin/IncomeManagement'));
const ErrorLinks = lazy(() => import('./pages/admin/ErrorLinks'));
const ReportedLinks = lazy(() => import('./pages/admin/ReportedLinks'));
const Notifications = lazy(() => import('./pages/admin/Notifications'));
const MovieRequestsManagement = lazy(() => import('./pages/admin/MovieRequestsManagement'));
const OrdersManagement = lazy(() => import('./pages/admin/OrdersManagement'));
const AdminSettings = lazy(() => import('./pages/admin/AdminSettings'));
const ContentSync = lazy(() => import('./pages/admin/ContentSync'));

function CatchAllRedirect() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const pathname = location.pathname;
    const search = location.search;

    if (pathname.includes('/unsubscribe')) {
      const emailMatch = search.match(/[?&]email=([^&]+)/) || pathname.match(/email=([^&]+)/);
      const emailParam = emailMatch ? `?email=${emailMatch[1]}` : search;
      navigate('/unsubscribe' + emailParam, { replace: true });
      return;
    }

    if (pathname.startsWith('/http://') || pathname.startsWith('/https://')) {
      try {
        const rawUrl = pathname.substring(1) + search;
        const parsed = new URL(rawUrl);
        navigate(parsed.pathname + parsed.search, { replace: true });
        return;
      } catch (e) {}
    }

    navigate('/', { replace: true });
  }, [location, navigate]);

  return null;
}

import { GlobalNavigationLoader } from './components/GlobalNavigationLoader';

const LoadingFallback = () => {
  const [showSlowNote, setShowSlowNote] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowSlowNote(true);
    }, 3500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 transition-colors duration-300 flex flex-col items-center justify-center gap-6 p-4 text-center">
      <div className="flex flex-col items-center animate-pulse">
        <img src="/Blacklogo.svg" alt="Logo" className="w-auto h-24 block dark:hidden object-contain" />
        <img src="/Whitelogo.svg" alt="Logo" className="w-auto h-24 hidden dark:block object-contain" />
      </div>
      <div className="flex flex-col items-center gap-3">
        <div className="relative flex items-center justify-center">
          <div className="w-10 h-10 rounded-full border-3 border-emerald-500/20 dark:border-emerald-500/10 animate-ping absolute"></div>
          <Loader2 className="w-8 h-8 animate-spin text-emerald-500 relative z-10" />
        </div>
        <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400 animate-pulse">
          Loading...
        </p>
      </div>

      {showSlowNote && (
        <div className="mt-2 flex flex-col items-center gap-3 animate-fade-in max-w-xs">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Connecting is taking longer than usual...
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white shadow-md transition-all active:scale-95"
          >
            Refresh Page
          </button>
        </div>
      )}
    </div>
  );
};

function MediaModalController({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const navigate = useNavigate();

  const handleApply = (data: any) => {
    navigate('/admin/content', { state: { prefilledData: data } });
    onClose();
  };

  return <MediaModal isOpen={isOpen} onClose={onClose} onApply={handleApply} />;
}

function AppLanguageEffect() {
  const { language } = useLanguage();
  useEffect(() => {
    document.documentElement.lang = language;
    if (language === 'ur') {
      document.body.classList.add('urdu-font');
    } else {
      document.body.classList.remove('urdu-font');
    }
  }, [language]);
  return null;
}

function AuthLanguageSync() {
  const { language, setLanguage } = useLanguage();
  const { profile } = useAuth();
  const hasSyncedRef = useRef(false);
  
  // Update local language if profile has one and we haven't synced yet this session
  // AND we don't have a pending local update that's newer than what's in the cloud
  useEffect(() => {
    if (profile?.preferredLanguage && !hasSyncedRef.current) {
      const pendingUpdatesStr = safeStorage.getItem("pending_user_updates");
      let hasPendingLanguage = false;
      if (pendingUpdatesStr) {
        try {
          const pending = JSON.parse(pendingUpdatesStr);
          if (pending[profile.uid]?.preferredLanguage) {
            hasPendingLanguage = true;
          }
        } catch (e) {}
      }

      // Only override local language if we don't have a pending update and it's the first sync
      if (!hasPendingLanguage && profile.preferredLanguage !== language) {
        setLanguage(profile.preferredLanguage as any);
      }
      hasSyncedRef.current = true;
    } else if (!profile) {
      hasSyncedRef.current = false;
    }
  }, [profile?.preferredLanguage]);

  return null;
}

function SyncErrorOverlay() {
  const { t } = useLanguage();
  const [pauseStatus, setPauseStatus] = useState<{ paused: boolean, lastSynced?: string }>({ paused: false });

  useEffect(() => {
    const handlePause = (e: any) => setPauseStatus(e.detail);
    window.addEventListener('app_paused_offline', handlePause);
    return () => window.removeEventListener('app_paused_offline', handlePause);
  }, []);

  return (
    <AnimatePresence>
      {pauseStatus.paused && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 overflow-hidden">
          <motion.div
            {...modalBackdropAnimation}
            style={modalGpuStyle}
            className="fixed inset-0 bg-zinc-950/80 backdrop-blur-xs transform-gpu will-change-[opacity]"
          />
          <motion.div
            {...modalContainerAnimation}
            style={modalGpuStyle}
            className="relative z-10 bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl p-8 max-w-sm w-full text-center space-y-4 border border-zinc-200 dark:border-zinc-800"
          >
            <h2 className="text-xl font-bold text-zinc-900 dark:text-white">{t('Data is not up to date')}</h2>
            <p className="text-zinc-600 dark:text-zinc-400 text-sm">
              {t('You have been offline for over 30 hours. Data was last synced on')} {pauseStatus.lastSynced}. 
            </p>
            <p className="text-zinc-600 dark:text-zinc-400 text-sm">
              {t('Please connect to the internet to update your app data and continue.')}
            </p>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

import { ScrollToTopOrRestore } from "./components/ScrollToTopOrRestore";
import { runPeriodicCacheCleanup } from "./services/cacheManager";

export default function App() {
  const [isMediaModalOpen, setIsMediaModalOpen] = useState(false);

  useGlobalButtonHaptics();

  useEffect(() => {
    if (window.history.scrollRestoration) {
      window.history.scrollRestoration = 'manual';
    }
  }, []);

  useEffect(() => {
    // Run automated cache cleanup during idle time after startup (evicts metadata/posters unused for > 3 days, IMDb/OTT unused for > 5 days; keeps chunk data)
    const timer = setTimeout(() => {
      if (typeof window !== "undefined" && "requestIdleCallback" in window) {
        (window as any).requestIdleCallback(() => {
          runPeriodicCacheCleanup().catch(() => {});
        });
      } else {
        runPeriodicCacheCleanup().catch(() => {});
      }
    }, 6000);

    const interval = setInterval(() => {
      runPeriodicCacheCleanup().catch(() => {});
    }, 6 * 60 * 60 * 1000); // Check every 6 hours

    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, []);

  return (
    <ThemeProvider>
      <LanguageProvider>
        <AppLanguageEffect />
      <AuthProvider>
        <AuthLanguageSync />
        <UsersProvider>
          <SettingsProvider>
            <AdminContentProvider>
            <ContentProvider>
              <NotificationProvider>
                <CartProvider>
                  <PWAProvider>
                    <SyncErrorOverlay />
                    <OfflineBanner />
                    <SyncBanner />
                    <SyncUserDataManager />
                    <RefreshAppDataManager />
                    <SystemNotificationWrapper />
                    <BrowserRouter>
                    <GlobalNavigationLoader />
                    <ScrollToTopOrRestore />
                    <AnalyticsTracker />
                    <AdSenseScriptManager />
                    <CpmScriptManager />
                    <AdBlockDetector />
                    <MediaModalController isOpen={isMediaModalOpen} onClose={() => setIsMediaModalOpen(false)} />
                    <Suspense fallback={<LoadingFallback />}>
                      <Routes>
                        <Route path="/login" element={<Login />} />
                        <Route path="/maintenance" element={<MaintenancePage />} />
                        <Route path="/app" element={<InstallApp />} />
                        <Route path="/install" element={<InstallApp />} />
                        <Route path="/unsubscribe" element={<Unsubscribe />} />
                        
                        {/* User Routes */}
                        <Route path="/" element={<ProtectedRoute><Home onOpenMediaModal={() => setIsMediaModalOpen(true)} /></ProtectedRoute>} />
                        <Route path="/:id" element={<ProtectedRoute><MovieDetails /></ProtectedRoute>} />
                        <Route path="/movie/:id" element={<ProtectedRoute><MovieDetails /></ProtectedRoute>} />
                        <Route path="/series/:id" element={<ProtectedRoute><MovieDetails /></ProtectedRoute>} />
                        <Route path="/watch-later" element={<ProtectedRoute requireAuth><WatchLater /></ProtectedRoute>} />
                        <Route path="/favorites" element={<ProtectedRoute requireAuth><Favorites /></ProtectedRoute>} />
                        <Route path="/trial" element={<ProtectedRoute><Trial /></ProtectedRoute>} />
                        <Route path="/vip-trial" element={<ProtectedRoute><VipTrial /></ProtectedRoute>} />
                        <Route path="/top-up" element={<ProtectedRoute requireAuth><TopUp /></ProtectedRoute>} />
                        <Route path="/cart" element={<ProtectedRoute requireAuth><Cart /></ProtectedRoute>} />
                        <Route path="/settings" element={<ProtectedRoute requireAuth><Settings /></ProtectedRoute>} />
                        <Route path="/freemovies" element={<ProtectedRoute><FreeMovies /></ProtectedRoute>} />
                        <Route path="/membership" element={<ProtectedRoute><Membership /></ProtectedRoute>} />
                        <Route path="/plans" element={<ProtectedRoute><Membership /></ProtectedRoute>} />
                        <Route path="/reviews" element={<ProtectedRoute><Reviews /></ProtectedRoute>} />
                        <Route path="/about" element={<ProtectedRoute><About /></ProtectedRoute>} />
                        <Route path="/contact" element={<ProtectedRoute><Contact /></ProtectedRoute>} />
                        
                        {/* Admin Routes */}
                        <Route path="/admin" element={<ProtectedRoute requireAdmin><AdminLayout /></ProtectedRoute>}>
                          <Route index element={<Navigate to="content" replace />} />
                          <Route path="analytics" element={<Analytics />} />
                          <Route path="orders" element={<OrdersManagement />} />
                          <Route path="content" element={<ContentManagement />} />
                          <Route path="collections" element={<CollectionsManagement />} />
                          <Route path="genres" element={<GenreManagement />} />
                          <Route path="languages" element={<LanguageManagement />} />
                          <Route path="qualities" element={<QualityManagement />} />
                          <Route path="users" element={<UserManagement />} />
                          <Route path="user-managers" element={<UserManagers />} />
                          <Route path="selected-content" element={<SelectedContentUsers />} />
                          <Route path="income" element={<IncomeManagement />} />
                          <Route path="error-links" element={<ErrorLinks />} />
                          <Route path="reported-links" element={<ReportedLinks />} />
                          <Route path="notifications" element={<Notifications />} />
                          <Route path="requests" element={<MovieRequestsManagement />} />
                          <Route path="sync" element={<ContentSync />} />
                          <Route path="settings" element={<AdminSettings />} />
                        </Route>
                        <Route path="*" element={<CatchAllRedirect />} />
                      </Routes>
                    </Suspense>
                  </BrowserRouter>
                </PWAProvider>
                </CartProvider>
              </NotificationProvider>
            </ContentProvider>
            </AdminContentProvider>
          </SettingsProvider>
        </UsersProvider>
      </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
