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

  const [maxWaitReached, setMaxWaitReached] = React.useState(false);

  React.useEffect(() => {
    // Safety cap: never show the initial logo loading screen for more than 800ms if we have cached data
    const timer = setTimeout(() => {
      setMaxWaitReached(true);
    }, 800);
    return () => clearTimeout(timer);
  }, []);

  const hasCachedUser = !!localStorage.getItem('profile_cache');
  const isChecking = (authLoading && !hasCachedUser) || (!maxWaitReached && (
    authLoading || 
    (user && !profile && authProfileLoading) || 
    settingsLoading
  ));

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

  const isMaintenanceActive = settings?.isMaintenanceModeEnabled && 
    (!settings.maintenanceEndTime || new Date(settings.maintenanceEndTime) > new Date());

  if (isMaintenanceActive && !isAllowedInMaintenance) {
    return <Navigate to="/maintenance" replace />;
  }

  // If admin is required, we must wait for the profile to check roles
  if (requireAdmin) {
    // If we already have the profile in memory, do not block on background authProfileLoading sync
    if (!profile) {
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
