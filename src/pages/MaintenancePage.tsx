import React, { useEffect, useState } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { useSettings } from '../contexts/SettingsContext';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useNavigate } from 'react-router-dom';

export default function MaintenancePage() {
  const { settings, refreshSettings } = useSettings();
  const { profile, refreshProfile } = useAuth();
  const { t } = useLanguage();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // If maintenance is turned off, redirect to home
    const isMaintenanceActive = settings?.isMaintenanceModeEnabled && 
      (!settings.maintenanceEndTime || new Date(settings.maintenanceEndTime) > new Date());
    
    if (settings && !isMaintenanceActive) {
      navigate('/', { replace: true });
    }
  }, [settings, navigate]);
  
  useEffect(() => {
    // Auto-refresh periodically without forcing network requests
    const interval = setInterval(() => {
      refreshSettings().catch(console.error);
      refreshProfile(false, 'auto').catch(console.error);
    }, 60000); // 1 minute
    return () => clearInterval(interval);
  }, [refreshSettings, refreshProfile]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshSettings(true);
      await refreshProfile(true, 'manual');
    } finally {
      setIsRefreshing(false);
    }
  };
  
  let supportPhone = settings?.supportNumber || '3363284466';
  if (supportPhone.startsWith('0')) {
    supportPhone = '92' + supportPhone.substring(1);
  } else if (!supportPhone.startsWith('92')) {
    supportPhone = '92' + supportPhone;
  }
  const adminPhone = supportPhone.replace('+', '');
  const message = `${t("Assalam O Alaikum! Admin")},\n\n${t("Name")}: ${profile?.displayName || t("Unknown")}\n${t("Email")}: ${profile?.email || "N/A"}\n${t("Phone")}: ${profile?.phone || "N/A"}\n${t("Role & Status")}: ${String(profile?.role || t("Unknown")).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}, ${String(profile?.status || t("Unknown")).replace(/\b\w/g, c => c.toUpperCase())}\n\n${t("Your message/question:")}\n${t("I am seeing the Not Available screen.")}`;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full bg-white dark:bg-zinc-900 rounded-2xl shadow-xl border border-zinc-200 dark:border-zinc-800 p-8 text-center space-y-6">
        <div className="w-16 h-16 bg-red-100 dark:bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
        </div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Not Available</h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          {settings?.maintenanceMessage || 'The application is currently unavailable. Please check back later.'}
        </p>
        <div className="pt-4 flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex items-center justify-center gap-2 px-6 py-2 bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white rounded-xl font-medium hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          {settings?.isAdminContactEnabled !== false && (
            <button
              onClick={() => window.open(`https://wa.me/${adminPhone}?text=${encodeURIComponent(message)}`, '_blank')}
              className="flex items-center justify-center gap-2 px-6 py-2 bg-emerald-500 text-white rounded-xl font-medium hover:bg-emerald-600 transition-colors"
            >
              Contact Admin
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
