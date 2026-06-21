import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { Suspense, lazy, useState, useEffect } from 'react';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ContentProvider } from './contexts/ContentContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { PWAProvider } from './contexts/PWAContext';
import { CartProvider } from './contexts/CartContext';
import { SettingsProvider } from './contexts/SettingsContext';
import { UsersProvider } from './contexts/UsersContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Loader2 } from 'lucide-react';
import { SystemNotificationWrapper } from './components/SystemNotificationWrapper';
import { MediaModal } from './components/MediaModal';
import { useModalBehavior } from './hooks/useModalBehavior';
import { useGlobalButtonHaptics } from './hooks/useHaptics';
import { OfflineBanner } from './components/OfflineBanner';
import { SyncBanner } from './components/SyncBanner';
import { AnalyticsTracker } from './components/AnalyticsTracker';

// Pages
import MaintenancePage from './pages/MaintenancePage';
import Login from './pages/Login';
import Home from './pages/user/Home';
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
import ContentSync from './pages/admin/ContentSync';
import InstallApp from './pages/InstallApp';

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

export default function App() {
  const [isMediaModalOpen, setIsMediaModalOpen] = useState(false);
  const [pauseStatus, setPauseStatus] = useState<{ paused: boolean, lastSynced?: string }>({ paused: false });

  useGlobalButtonHaptics();

  useEffect(() => {
    if (window.history.scrollRestoration) {
      window.history.scrollRestoration = 'manual';
    }
  }, []);

  useEffect(() => {
    const handlePause = (e: any) => setPauseStatus(e.detail);
    window.addEventListener('app_paused_offline', handlePause);
    return () => window.removeEventListener('app_paused_offline', handlePause);
  }, []);

  useEffect(() => {
    // Cleanup old legacy thumbnails from the IndexedDB cache
    try {
      const request = indexedDB.open('moviznow_cache_db', 1);
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
      <AuthProvider>
        <UsersProvider>
          <SettingsProvider>
            <ContentProvider>
              <NotificationProvider>
                <CartProvider>
                  <PWAProvider>
                    {pauseStatus.paused && (
                      <div className="fixed inset-0 z-[9999] bg-zinc-950/80 backdrop-blur-md flex flex-col items-center justify-center p-4">
                        <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl p-8 max-w-sm w-full text-center space-y-4">
                          <h2 className="text-xl font-bold text-zinc-900 dark:text-white">Data is not up to date</h2>
                          <p className="text-zinc-600 dark:text-zinc-400 text-sm">
                            You have been offline for over 30 hours. Data was last synced on {pauseStatus.lastSynced}. 
                          </p>
                          <p className="text-zinc-600 dark:text-zinc-400 text-sm">
                            Please connect to the internet to update your app data and continue.
                          </p>
                        </div>
                      </div>
                    )}
                    <OfflineBanner />
                    <SyncBanner />
                    <SystemNotificationWrapper />
                    <BrowserRouter>
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
    </ThemeProvider>
  );
}
