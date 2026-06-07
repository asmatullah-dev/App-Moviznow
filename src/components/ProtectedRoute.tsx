import React, { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth, standardizePhone } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { auth } from '../firebase';
import { Loader2, AlertCircle, MessageCircle } from 'lucide-react';
import { safeStorage } from '../utils/safeStorage';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
}

export function ProtectedRoute({ children, requireAdmin = false }: ProtectedRouteProps) {
  const { user, profile, loading: authProfileLoading, isSyncing, authLoading, updateUserProfileData, refreshProfile } = useAuth();
  const { settings, loading: settingsLoading } = useSettings();
  const location = useLocation();

  const [maxWaitReached, setMaxWaitReached] = React.useState(false);
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [whatsappError, setWhatsappError] = useState<string | null>(null);
  const [isSavingWhatsapp, setIsSavingWhatsapp] = useState(false);

  React.useEffect(() => {
    // Safety cap: never show the initial logo loading screen for more than 800ms if we have cached data
    const timer = setTimeout(() => {
      setMaxWaitReached(true);
    }, 800);
    return () => clearTimeout(timer);
  }, []);

  const hasCachedUser = !!safeStorage.getItem('profile_cache');
  const isChecking = (!hasCachedUser && authLoading) || (!maxWaitReached && (
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

  // If we have a cached user but auth is still loading, allow rendering the app
  // If auth finishes and there is no user, it will redirect to login then.
  if (!user && !authLoading) {
    console.log('ProtectedRoute: No user, redirecting to login');
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // If we're using a cached profile but wait... if suspended, still redirect
  if (profile?.status === 'suspended') {
    console.log('ProtectedRoute: User is suspended, redirecting to login');
    return <Navigate to="/login" state={{ from: location, suspended: true }} replace />;
  }

  // Check for Whatsapp number
  if (profile && !authProfileLoading && !isSyncing && !profile.phone && profile.role !== 'admin' && profile.role !== 'owner') {
    const handleSaveWhatsapp = async () => {
      if (!whatsappNumber.trim()) return;

      setWhatsappError(null);
      setIsSavingWhatsapp(true);

      try {
        const standardized = standardizePhone(whatsappNumber);
        if (!standardized) {
          setWhatsappError("Please enter a valid WhatsApp number");
          setIsSavingWhatsapp(false);
          return;
        }

        await updateUserProfileData({ phone: standardized });
        await refreshProfile();
      } catch (error: any) {
        console.error("Failed to save WhatsApp number", error);
        setWhatsappError(
          error.message || "Failed to save number. Please try again.",
        );
      } finally {
        setIsSavingWhatsapp(false);
      }
    };

    return (
      <React.Fragment>
        {children}
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 max-w-md w-full relative shadow-2xl">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center">
                <MessageCircle className="w-8 h-8 text-emerald-500" />
              </div>
            </div>
            <h3 className="text-xl font-bold mb-2 text-center text-zinc-900 dark:text-white transition-colors duration-300">
              WhatsApp Number is Required
            </h3>
            <p className="text-zinc-500 dark:text-zinc-400 mb-6 text-center text-sm">
              Please enter your WhatsApp number to continue. This is required
              for membership updates and support.
            </p>
            <div className="space-y-4">
              {whatsappError && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-500">{whatsappError}</p>
                </div>
              )}
              <input
                type="tel"
                placeholder="e.g. 03001234567"
                value={whatsappNumber}
                onChange={(e) => {
                  setWhatsappNumber(e.target.value);
                  setWhatsappError(null);
                }}
                className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500 text-zinc-900 dark:text-white placeholder-zinc-500 dark:placeholder-zinc-400 transition-colors duration-300"
              />
              <div className="flex flex-col gap-2">
                <div className="flex gap-3 mt-4">
                  <button
                    onClick={handleSaveWhatsapp}
                    disabled={!whatsappNumber.trim() || isSavingWhatsapp}
                    className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-500/50 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2"
                  >
                    {isSavingWhatsapp ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Saving...</span>
                      </>
                    ) : (
                      "Save Number"
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </React.Fragment>
    );
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
