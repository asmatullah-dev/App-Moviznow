import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { Suspense, lazy, useState, useEffect } from 'react';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ContentProvider } from './contexts/ContentContext';
import { PWAProvider } from './contexts/PWAContext';
import { CartProvider } from './contexts/CartContext';
import { SettingsProvider } from './contexts/SettingsContext';
import { UsersProvider } from './contexts/UsersContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Loader2 } from 'lucide-react';
import { SystemNotificationWrapper } from './components/SystemNotificationWrapper';
import { MediaModal } from './components/MediaModal';
import { useModalBehavior } from './hooks/useModalBehavior';
import { OfflineBanner } from './components/OfflineBanner';

// Pages
const Login = lazy(() => import('./pages/Login'));
const Home = lazy(() => import('./pages/user/Home'));
const MovieDetails = lazy(() => import('./pages/user/MovieDetails'));
const WatchLater = lazy(() => import('./pages/user/WatchLater'));
const Favorites = lazy(() => import('./pages/user/Favorites'));
const MovieRequests = lazy(() => import('./pages/user/MovieRequests'));
const Trial = lazy(() => import('./pages/user/Trial'));
const TopUp = lazy(() => import('./pages/user/TopUp'));
const Cart = lazy(() => import('./pages/user/Cart'));
const Settings = lazy(() => import('./pages/user/Settings'));

import AdminLayout from './pages/admin/AdminLayout';
import Analytics from './pages/admin/Analytics';
import ContentManagement from './pages/admin/ContentManagement';
import GenreManagement from './pages/admin/GenreManagement';
import LanguageManagement from './pages/admin/LanguageManagement';
import QualityManagement from './pages/admin/QualityManagement';
import UserManagement from './pages/admin/UserManagement';
import UserManagers from './pages/admin/UserManagers';
import SelectedContentUsers from './pages/admin/SelectedContentUsers';
import IncomeManagement from './pages/admin/IncomeManagement';
import ErrorLinks from './pages/admin/ErrorLinks';
import ReportedLinks from './pages/admin/ReportedLinks';
import Notifications from './pages/admin/Notifications';
import MovieRequestsManagement from './pages/admin/MovieRequestsManagement';
import OrdersManagement from './pages/admin/OrdersManagement';
import AdminSettings from './pages/admin/AdminSettings';
import ContentSync from './pages/admin/ContentSync';
const InstallApp = lazy(() => import('./pages/InstallApp'));

const LoadingFallback = () => (
  <div className="min-h-screen bg-white dark:bg-zinc-950 transition-colors duration-300 flex flex-col items-center justify-center gap-4">
    <img src="/logo.svg" alt="MovizNow" className="w-32 h-32 animate-pulse" />
    <Loader2 className="w-6 h-6 animate-spin text-zinc-500 dark:text-zinc-400" />
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

  useModalBehavior(isMediaModalOpen, () => setIsMediaModalOpen(false));

  return (
    <ThemeProvider>
      <AuthProvider>
        <UsersProvider>
          <SettingsProvider>
            <ContentProvider>
            <CartProvider>
              <PWAProvider>
                <OfflineBanner />
                <SystemNotificationWrapper />
                <BrowserRouter>
                <MediaModalController isOpen={isMediaModalOpen} onClose={() => setIsMediaModalOpen(false)} />
                <Suspense fallback={<LoadingFallback />}>
                  <Routes>
                    <Route path="/login" element={<Login />} />
                    <Route path="/app" element={<InstallApp />} />
                    <Route path="/install" element={<InstallApp />} />
                    
                    {/* User Routes */}
                    <Route path="/" element={<ProtectedRoute><Home onOpenMediaModal={() => setIsMediaModalOpen(true)} /></ProtectedRoute>} />
                    <Route path="/movie/:id" element={<MovieDetails />} />
                    <Route path="/watch-later" element={<ProtectedRoute><WatchLater /></ProtectedRoute>} />
                    <Route path="/favorites" element={<ProtectedRoute><Favorites /></ProtectedRoute>} />
                    <Route path="/requests" element={<ProtectedRoute><MovieRequests /></ProtectedRoute>} />
                    <Route path="/trial" element={<Trial />} />
                    <Route path="/top-up" element={<ProtectedRoute><TopUp /></ProtectedRoute>} />
                    <Route path="/cart" element={<ProtectedRoute><Cart /></ProtectedRoute>} />
                    <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
                    
                    {/* Admin Routes */}
                    <Route path="/admin" element={<ProtectedRoute requireAdmin><AdminLayout /></ProtectedRoute>}>
                      <Route index element={<Navigate to="content" replace />} />
                      <Route path="analytics" element={<Analytics />} />
                      <Route path="orders" element={<OrdersManagement />} />
                      <Route path="content" element={<ContentManagement />} />
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
          </ContentProvider>
          </SettingsProvider>
        </UsersProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
