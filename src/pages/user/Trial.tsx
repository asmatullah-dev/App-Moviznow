import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useSettings } from '../../contexts/SettingsContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { Loader2, CheckCircle, AlertCircle, Home, MessageCircle, Phone } from 'lucide-react';
import { Helmet } from 'react-helmet-async';

export default function Trial() {
  const { t } = useLanguage();
  const { user, profile, loading, authLoading, updateUserProfileData, refreshProfile } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'missing_phone' | 'success' | 'error' | 'disabled'>('loading');
  const [message, setMessage] = useState(t('Activating your trial...'));
  const [countdown, setCountdown] = useState(15);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [isSubmittingPhone, setIsSubmittingPhone] = useState(false);
  const hasActivatedRef = useRef(false);

  useEffect(() => {
    if (loading || authLoading || !settings) return;

    if (!user || !profile) {
      if (!authLoading) {
        navigate('/login', { state: { from: '/trial' }, replace: true });
      }
      return;
    }

    if (hasActivatedRef.current) return;

    if (settings.isTrialEnabled === false) {
      setStatus('disabled');
      setMessage(t('Sorry we are not giving Trial on direct link. Please contact admin.'));
      
      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            navigate('/');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }

    if (profile.role === 'trial') {
      setStatus('error');
      setMessage(t('You already have an active trial.'));
      setTimeout(() => navigate('/'), 3000);
      return;
    }

    if (profile.status === 'active') {
       setStatus('error');
       setMessage(t('Your account is already active. Trial is only for new pending members.'));
       setTimeout(() => navigate('/'), 3000);
       return;
    }

    if (profile.status !== 'pending' || profile.role !== 'user') {
      setStatus('error');
      setMessage(t('Trial is only available for new pending accounts.'));
      setTimeout(() => navigate('/'), 3000);
      return;
    }

    if (!profile.phone) {
      setStatus('missing_phone');
      setMessage(t('Please add your WhatsApp number to activate your trial.'));
      return;
    }

    activateTrial();
  }, [user, profile, loading, authLoading, navigate, settings]);

  const activateTrial = async () => {
    hasActivatedRef.current = true;
    try {
      const now = new Date();
      const expiry = new Date(now);
      
      // If after 6 PM (18:00), don't count today. Add 3 days total.
      // If before 6 PM, count today. Add 2 days total.
      if (now.getHours() >= 18) {
        expiry.setDate(expiry.getDate() + 3);
      } else {
        expiry.setDate(expiry.getDate() + 2);
      }

      // Use standard update profile function to ensure chunk_meta and local cache are updated
      await updateUserProfileData({
        role: 'trial',
        status: 'active',
        trialActivated: true,
        expiryDate: expiry.toISOString()
      }, undefined, true);

      // Force a full refresh to be absolutely sure
      await refreshProfile(true);

      setStatus('success');
      setMessage(t('Trial activated successfully! Enjoy 48 hours of access.'));
      setTimeout(() => navigate('/'), 3000);
    } catch (error) {
      console.error('Error activating trial:', error);
      hasActivatedRef.current = false;
      setStatus('error');
      setMessage(t('Failed to activate trial. Please try again.'));
      setTimeout(() => navigate('/'), 3000);
    }
  };

  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneNumber.trim()) {
      setPhoneError(t('Please enter a valid WhatsApp number'));
      return;
    }
    
    // Standardize phone number (similar to login)
    let standardized = phoneNumber.trim().replace(/\D/g, '');
    if (!standardized.startsWith('92') && !standardized.startsWith('0')) {
      standardized = '92' + standardized;
    } else if (standardized.startsWith('0')) {
      standardized = '92' + standardized.substring(1);
    }
    
    if (standardized.length < 10) {
      setPhoneError(t('Please enter a valid WhatsApp number with correct length'));
      return;
    }

    try {
      setIsSubmittingPhone(true);
      await updateUserProfileData({ phone: standardized }, undefined, true);
      await refreshProfile();
      setStatus('loading');
      setMessage(t('Activating your trial...'));
      await activateTrial();
    } catch (error: any) {
      console.error('Error saving WhatsApp number:', error);
      setPhoneError(error.message || t('Failed to save WhatsApp number. Please try again.'));
      setIsSubmittingPhone(false);
    }
  };

  const handleContactAdmin = () => {
    let supportPhone = settings?.supportNumber || '3363284466';
    // Clean up the number to ensure it starts with country code for WhatsApp link
    if (supportPhone.startsWith('0')) {
      supportPhone = '92' + supportPhone.substring(1);
    } else if (!supportPhone.startsWith('92') && !supportPhone.startsWith('+')) {
      supportPhone = '92' + supportPhone; 
    }
    // Remove '+' if present
    supportPhone = supportPhone.replace('+', '');
    
    const urlMessage = encodeURIComponent(`${t("Assalam O Alaikum! Admin")},\n\n${t("Name")}: ${user?.displayName || t('Unknown')}\n${t("Email")}: ${user?.email || 'N/A'}\n${t("Phone")}: ${profile?.phone || 'N/A'}\n${t("Role & Status")}: ${String(profile?.role || t('Unknown')).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}, ${String(profile?.status || t('Unknown')).replace(/\b\w/g, c => c.toUpperCase())}\n\n${t("Your message/question:")}\n${t("I tried to activate a trial but saw that it is disabled on the direct link. Please help me get a trial or membership.")}`);
    window.open(`https://wa.me/${supportPhone}?text=${urlMessage}`, '_blank');
  };

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <Helmet>
        <title>{t('Activate Trial')} - {settings?.headerText || 'Moviznow'}</title>
      </Helmet>

      <div className="bg-gray-800 rounded-xl p-8 max-w-md w-full text-center shadow-2xl border border-gray-700 relative overflow-hidden">
        {status === 'loading' && (
          <div className="flex flex-col items-center">
            <Loader2 className="w-16 h-16 text-emerald-500 animate-spin mb-4" />
            <h2 className="text-2xl font-bold text-white mb-2">{t('Activating Trial')}</h2>
            <p className="text-gray-400">{message}</p>
          </div>
        )}

        {status === 'missing_phone' && (
          <div className="flex flex-col items-center">
            <Phone className="w-16 h-16 text-emerald-500 mb-4" />
            <h2 className="text-2xl font-bold text-white mb-2">{t('WhatsApp Number Required')}</h2>
            <p className="text-gray-400 mb-6">{message}</p>
            
            <form onSubmit={handlePhoneSubmit} className="w-full">
              <div className="mb-4">
                <input
                  type="tel"
                  placeholder="e.g. 03001234567"
                  value={phoneNumber}
                  onChange={(e) => { setPhoneNumber(e.target.value); setPhoneError(''); }}
                  className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  disabled={isSubmittingPhone}
                />
                {phoneError && <p className="text-red-500 text-sm mt-2 text-left">{phoneError}</p>}
                <p className="text-xs text-gray-500 mt-2 text-left">{t('We need your WhatsApp number to verify your trial and provide support.')}</p>
              </div>
              
              <button
                type="submit"
                disabled={isSubmittingPhone || !phoneNumber.trim()}
                className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-transform active:scale-95"
              >
                {isSubmittingPhone ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  t('Save & Activate Trial')
                )}
              </button>
            </form>
          </div>
        )}

        {status === 'success' && (
          <div className="flex flex-col items-center">
            <CheckCircle className="w-16 h-16 text-emerald-500 mb-4" />
            <h2 className="text-2xl font-bold text-white mb-2">{t('Success!')}</h2>
            <p className="text-gray-400 mb-6">{message}</p>
            <p className="text-sm text-gray-500">{t('Redirecting to home...')}</p>
          </div>
        )}

        {status === 'error' && (
          <div className="flex flex-col items-center">
            <AlertCircle className="w-16 h-16 text-red-500 mb-4" />
            <h2 className="text-2xl font-bold text-white mb-2">{t('Cannot Activate Trial')}</h2>
            <p className="text-gray-400 mb-6">{message}</p>
            <p className="text-sm text-gray-500">{t('Redirecting to home...')}</p>
          </div>
        )}

        {status === 'disabled' && (
          <div className="flex flex-col items-center">
            <AlertCircle className="w-16 h-16 text-yellow-500 mb-4" />
            <h2 className="text-2xl font-bold text-white mb-2">{t('Trial Disabled')}</h2>
            <p className="text-gray-300 mb-6 text-sm sm:text-base leading-relaxed bg-gray-900/50 p-4 rounded-lg border border-gray-700/50">{message}</p>
            
            <div className="flex flex-col gap-3 w-full mb-6">
              {settings?.isAdminContactEnabled !== false && (
                <button 
                  onClick={handleContactAdmin}
                  className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-transform active:scale-95 shadow-lg shadow-emerald-900/20"
                >
                  <MessageCircle className="w-5 h-5" />
                  {t('Contact Admin (WhatsApp)')}
                </button>
              )}
              
              <button 
                onClick={() => navigate('/')}
                className="w-full py-3 px-4 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-xl flex items-center justify-center gap-2 transition-colors active:scale-95 border border-gray-600"
              >
                <Home className="w-5 h-5" />
                {t('Go to Home')}
              </button>
            </div>
            
            <p className="text-sm text-gray-500 flex items-center justify-center gap-2 bg-gray-900/50 py-2 px-4 rounded-full w-fit mx-auto">
              {t('Redirecting to home in')} <span className="font-mono text-emerald-400 font-bold">{countdown}</span>...
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
