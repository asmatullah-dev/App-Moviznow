import React from 'react';
import { AlertCircle } from 'lucide-react';
import { useSettings } from '../contexts/SettingsContext';
import { useAuth } from '../contexts/AuthContext';

export default function MaintenancePage() {
  const { settings } = useSettings();
  const { profile } = useAuth();
  
  let supportPhone = settings?.supportNumber || '3363284466';
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
          {settings?.maintenanceMessage || 'The application is currently unavailable. Please check back later.'}
        </p>
        <div className="pt-4 flex flex-col sm:flex-row gap-3 justify-center">
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
