import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { Suspense, lazy, useState, useEffect, useRef } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ContentProvider } from './contexts/ContentContext';
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
import { AnalyticsTracker } from './components/AnalyticsTracker';

// Pages
import MaintenancePage from './pages/MaintenancePage';
import Login from './pages/Login';
import Home from './pages/user/Home';
import FreeMovies from './pages/user/FreeMovies';
import Membership from './pages/user/Membership';
import Reviews from './pages/user/Reviews';
import About from './pages/user/About';
import Contact from './pages/user/Contact';
import MovieDetails from './pages/user/MovieDetails';
import WatchLater from './pages/user/WatchLater';
import Favorites from './pages/user/Favorites';
import Trial from './pages/user/Trial';
import TopUp from './pages/user/TopUp';
import Cart from './pages/user/Cart';
import Settings from './pages/user/Settings';

import AdminLayout from './pages/admin/AdminLayout';
import Analytics from './pages/admin/Analytics';
import ContentManagement from './pages/admin/ContentManagement';
import GenreManagement from './pages/admin/GenreManagement';
import LanguageManagement from './pages/admin/LanguageManagement';
import QualityManagement from './pages/admin/QualityManagement';
import UserManagement from './pages/admin/UserManagement';
import UserManagers from './pages/admin/UserManagers';
import SelectedContentUsers from './pages/admin/SelectedContentUsers';
import CollectionsManagement from './pages/admin/CollectionsManagement';
import IncomeManagement from './pages/admin/IncomeManagement';
import ErrorLinks from './pages/admin/ErrorLinks';
import ReportedLinks from './pages/admin/ReportedLinks';
import Notifications from './pages/admin/Notifications';
import MovieRequestsManagement from './pages/admin/MovieRequestsManagement';
import OrdersManagement from './pages/admin/OrdersManagement';
import AdminSettings from './pages/admin/AdminSettings';
import ReferralsManagement from './pages/admin/ReferralsManagement';
import ContentSync from './pages/admin/ContentSync';
import InstallApp from './pages/InstallApp';
import Rewards from './pages/user/Rewards';

const LoadingFallback = () => (
  <div className="min-h-screen bg-white dark:bg-zinc-950 transition-colors duration-300 flex flex-col items-center justify-center gap-6">
    <div className="flex flex-col items-center animate-pulse">
      <img src="/Blacklogo.svg" alt="Logo" className="w-auto h-32 block dark:hidden" />
      <img src="/Whitelogo.svg" alt="Logo" className="w-auto h-32 hidden dark:block" />
    </div>
    <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
  </div>
);

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

function ReferralTracker() {
  const { profile } = useAuth();
  const { t } = useLanguage();
  const [alertConfig, setAlertConfig] = useState<{ isOpen: boolean; title: string; message: string } | null>(null);

  useEffect(() => {
    const successMsg = localStorage.getItem("referral_credit_message");
    if (successMsg) {
      setAlertConfig({
        isOpen: true,
        title: t('Referral Reward Credited'),
        message: successMsg
      });
      localStorage.removeItem("referral_credit_message");
    }
  }, [profile, t]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    
    if (ref) {
      if (profile) {
        // Check if user is more than 3 days old
        const userCreatedAt = profile.createdAt ? new Date(profile.createdAt) : new Date();
        const now = new Date();
        const diffTime = Math.abs(now.getTime() - userCreatedAt.getTime());
        const diffDays = diffTime / (1000 * 60 * 60 * 24);

        if (diffDays > 3) {
          setAlertConfig({
            isOpen: true,
            title: t('Referral Limit'),
            message: t('This referral offer is only available for new users or new joining only.')
          });
          
          // Clear the ref from URL to prevent showing it again
          const url = new URL(window.location.href);
          url.searchParams.delete('ref');
          window.history.replaceState({}, '', url.pathname);
          return;
        }
      }
      
      localStorage.setItem('referral_code', ref);
    }
  }, [profile, t]);

  return (
    <AlertModal
      isOpen={!!alertConfig?.isOpen}
      title={alertConfig?.title || ''}
      message={alertConfig?.message || ''}
      onClose={() => setAlertConfig(null)}
    />
  );
}

import { usePWA } from './contexts/PWAContext';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import { db } from './firebase';

function RewardsManager() {
  const { user, profile, updateUserProfileData } = useAuth();
  const { isInstalled } = usePWA();
  
  const claimingRef = useRef(false);
  
  useEffect(() => {
    if (!profile || !user || claimingRef.current) return;

    const checkRewards = async () => {
      const updates: any = {};
      let extensionDays = 0;

      // PWA Reward (3 days)
      if (isInstalled && !profile.pwaRewardClaimed) {
        console.log("Claiming PWA reward...");
        updates.pwaRewardClaimed = true;
        extensionDays += 3;
      }

      // Notification Reward (3 days)
      const hasNotificationPermission = 'Notification' in window && Notification.permission === 'granted';
      if (hasNotificationPermission && !profile.notificationRewardClaimed) {
        console.log("Claiming Notification reward...");
        updates.notificationRewardClaimed = true;
        extensionDays += 3;
      }

      // Review Reward (5 days)
      const hasRated = safeStorage.getItem('has_rated') === 'true' || sessionStorage.getItem('reviewRewardClaimed') === 'true';
      if (hasRated && !profile.reviewRewardClaimed) {
        console.log("Claiming Review reward...");
        updates.reviewRewardClaimed = true;
        extensionDays += 5;
      }

      if (extensionDays > 0) {
        claimingRef.current = true;
        let newExpiry = new Date();
        if (profile.expiryDate && profile.expiryDate !== 'Lifetime') {
          const currentExpiry = new Date(profile.expiryDate);
          newExpiry = currentExpiry > new Date() ? currentExpiry : new Date();
        }
        newExpiry.setDate(newExpiry.getDate() + extensionDays);
        updates.expiryDate = newExpiry.toISOString();
        
        if (!profile.status || ['expired', 'pending'].includes(profile.status.toLowerCase())) {
          updates.status = 'active';
        }

        try {
          await updateUserProfileData(updates);
          console.log(`Successfully claimed ${extensionDays} days of rewards`);
        } catch (e) {
          console.error("Failed to claim engagement rewards", e);
        } finally {
          claimingRef.current = false;
        }
      }
    };

    checkRewards();
  }, [isInstalled, profile?.uid, profile?.pwaRewardClaimed, profile?.notificationRewardClaimed, profile?.reviewRewardClaimed, profile?.expiryDate]);

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

  if (!pauseStatus.paused) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-zinc-950/80 backdrop-blur-md flex flex-col items-center justify-center p-4">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl p-8 max-w-sm w-full text-center space-y-4">
        <h2 className="text-xl font-bold text-zinc-900 dark:text-white">{t('Data is not up to date')}</h2>
        <p className="text-zinc-600 dark:text-zinc-400 text-sm">
          {t('You have been offline for over 30 hours. Data was last synced on')} {pauseStatus.lastSynced}. 
        </p>
        <p className="text-zinc-600 dark:text-zinc-400 text-sm">
          {t('Please connect to the internet to update your app data and continue.')}
        </p>
      </div>
    </div>
  );
}

import { ScrollToTopOrRestore } from "./components/ScrollToTopOrRestore";

export default function App() {
  const [isMediaModalOpen, setIsMediaModalOpen] = useState(false);

  useGlobalButtonHaptics();

  useEffect(() => {
    if (window.history.scrollRestoration) {
      window.history.scrollRestoration = 'manual';
    }
  }, []);

  useEffect(() => {
    // Cleanup old legacy thumbnails from the IndexedDB cache
    try {
      const request = indexedDB.open('moviznow_cache_db', 2);
      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('cache')) return;
        
        try {
          const tx = db.transaction('cache', 'readwrite');
          const store = tx.objectStore('cache');
          const getAllKeysReq = store.getAllKeys();
          
          getAllKeysReq.onsuccess = () => {
             const keys = getAllKeysReq.result;
             keys.forEach((key: any) => {
               if (typeof key === 'string' && key.startsWith('thumbnail_')) {
                 store.delete(key);
               }
             });
          };
        } catch (e) {
          console.error("Failed to clean up legacy thumbnails", e);
        }
      };
    } catch (e) {
      console.warn("Could not initiate thumbnail cleanup", e);
    }
  }, []);

  useModalBehavior(isMediaModalOpen, () => setIsMediaModalOpen(false));

  return (
    <ThemeProvider>
      <LanguageProvider>
        <AppLanguageEffect />
      <AuthProvider>
        <AuthLanguageSync />
        <UsersProvider>
          <SettingsProvider>
            <ContentProvider>
              <NotificationProvider>
                <CartProvider>
                  <PWAProvider>
                    <ReferralTracker />
                    <RewardsManager />
                    <SyncErrorOverlay />
                    <OfflineBanner />
                    <SyncBanner />
                    <SystemNotificationWrapper />
                    <BrowserRouter>
                    <ScrollToTopOrRestore />
                    <AnalyticsTracker />
                    <MediaModalController isOpen={isMediaModalOpen} onClose={() => setIsMediaModalOpen(false)} />
                    <Suspense fallback={<LoadingFallback />}>
                      <Routes>
                        <Route path="/login" element={<Login />} />
                        <Route path="/maintenance" element={<MaintenancePage />} />
                        <Route path="/app" element={<InstallApp />} />
                        <Route path="/install" element={<InstallApp />} />
                        
                        {/* User Routes */}
                        <Route path="/" element={<ProtectedRoute><Home onOpenMediaModal={() => setIsMediaModalOpen(true)} /></ProtectedRoute>} />
                        <Route path="/:id" element={<ProtectedRoute><MovieDetails /></ProtectedRoute>} />
                        <Route path="/movie/:id" element={<ProtectedRoute><MovieDetails /></ProtectedRoute>} />
                        <Route path="/series/:id" element={<ProtectedRoute><MovieDetails /></ProtectedRoute>} />
                        <Route path="/watch-later" element={<ProtectedRoute><WatchLater /></ProtectedRoute>} />
                        <Route path="/favorites" element={<ProtectedRoute><Favorites /></ProtectedRoute>} />
                        <Route path="/trial" element={<ProtectedRoute><Trial /></ProtectedRoute>} />
                        <Route path="/top-up" element={<ProtectedRoute><TopUp /></ProtectedRoute>} />
                        <Route path="/cart" element={<ProtectedRoute><Cart /></ProtectedRoute>} />
                        <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
                        <Route path="/freemovies" element={<ProtectedRoute><FreeMovies /></ProtectedRoute>} />
                        <Route path="/membership" element={<ProtectedRoute><Membership /></ProtectedRoute>} />
                        <Route path="/rewards" element={<ProtectedRoute><Rewards /></ProtectedRoute>} />
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
                          <Route path="referrals" element={<ReferralsManagement />} />
                          <Route path="requests" element={<MovieRequestsManagement />} />
                          <Route path="sync" element={<ContentSync />} />
                          <Route path="settings" element={<AdminSettings />} />
                        </Route>
                      </Routes>
                    </Suspense>
                  </BrowserRouter>
                </PWAProvider>
                </CartProvider>
              </NotificationProvider>
            </ContentProvider>
          </SettingsProvider>
        </UsersProvider>
      </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
