import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { auth } from '../firebase';
import { Loader2, AlertCircle } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
}

export function ProtectedRoute({ children, requireAdmin = false }: ProtectedRouteProps) {
  const { user, profile, loading: authProfileLoading, authLoading } = useAuth();
  const { settings, loading: settingsLoading } = useSettings();
  const location = useLocation();

  const isChecking = authLoading || (user && !profile && authProfileLoading) || settingsLoading;

  if (isChecking) {
    return (
      <div className="min-h-screen bg-white dark:bg-zinc-950 flex flex-col items-center justify-center gap-6 transition-colors duration-300">
        <div className="flex flex-col items-center animate-pulse">
          <img src="/Blacklogo.svg" alt="Logo" className="w-auto h-32 block dark:hidden" />
          <img src="/Whitelogo.svg" alt="Logo" className="w-auto h-32 hidden dark:block" />
        </div>
        <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
      </div>
    );
  }

  if (!user) {
    console.log('ProtectedRoute: No user, redirecting to login');
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (profile?.status === 'suspended') {
    console.log('ProtectedRoute: User is suspended, redirecting to login');
    return <Navigate to="/login" state={{ from: location, suspended: true }} replace />;
  }

  const isStaff = ['owner', 'admin', 'content_manager', 'user_manager', 'manager'].includes(profile?.role || '');
  const isActiveMember = ['user', 'selected_content'].includes(profile?.role || '') && profile?.status === 'active';
  const isAllowedInMaintenance = isStaff || isActiveMember;

  if (settings?.isMaintenanceModeEnabled && !isAllowedInMaintenance) {
    let supportPhone = settings.supportNumber || '3363284466';
    if (supportPhone.startsWith('0')) {
      supportPhone = '92' + supportPhone.substring(1);
    } else if (!supportPhone.startsWith('92')) {
      supportPhone = '92' + supportPhone;
    }
    const adminPhone = supportPhone.replace('+', '');
    const message = `Hello Admin,\n\nName: ${profile?.displayName || 'Unknown'}\nEmail: ${profile?.email || 'N/A'}\nPhone: ${profile?.phone || 'N/A'}\nRole & Status: ${String(profile?.role || 'Unknown').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}, ${String(profile?.status || 'Unknown').replace(/\b\w/g, c => c.toUpperCase())}\n\nYour message/question:\nI am seeing the Not Available screen.`;

    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-zinc-900 rounded-2xl shadow-xl border border-zinc-200 dark:border-zinc-800 p-8 text-center space-y-6">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
          </div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Not Available</h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            {settings.maintenanceMessage || 'The application is currently unavailable. Please check back later.'}
          </p>
          <div className="pt-4 flex flex-col sm:flex-row gap-3 justify-center">
            {settings.isAdminContactEnabled !== false && (
              <button
                onClick={() => window.open(`https://wa.me/${adminPhone}?text=${encodeURIComponent(message)}`, '_blank')}
                className="flex items-center justify-center gap-2 px-6 py-2 bg-emerald-500 text-white rounded-xl font-medium hover:bg-emerald-600 transition-colors"
              >
                Contact Admin
              </button>
            )}
            <button
              onClick={() => auth.signOut()}
              className="px-6 py-2 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-xl font-medium hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  // If admin is required, we must wait for the profile to check roles
  if (requireAdmin) {
    if (authProfileLoading || !profile) {
      return (
        <div className="min-h-screen bg-white dark:bg-zinc-950 flex flex-col items-center justify-center gap-6 transition-colors duration-300">
          <div className="flex flex-col items-center animate-pulse">
            <img src="/Blacklogo.svg" alt="Logo" className="w-auto h-32 block dark:hidden" />
            <img src="/Whitelogo.svg" alt="Logo" className="w-auto h-32 hidden dark:block" />
          </div>
          <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
        </div>
      );
    }
    if (profile.role !== 'admin' && profile.role !== 'content_manager' && profile.role !== 'user_manager' && profile.role !== 'manager' && profile.role !== 'owner') {
      console.log('ProtectedRoute: Admin required but user is not admin/manager/owner, redirecting to home');
      return <Navigate to="/" replace />;
    }
  }

  return <>{children}</>;
}
