import { useState, useEffect } from 'react';
import { useAuth, standardizePhone } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useSettings } from '../../contexts/SettingsContext';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Lock, User, Mail, Phone, Loader2, AlertCircle, Bell, BellOff, CheckCircle2, MapPin } from 'lucide-react';
import { clsx } from 'clsx';
import { requestNotificationPermission } from '../../firebase';

export default function Settings() {
  const { profile, user, updateUserProfileData } = useAuth();
  const { t } = useLanguage();
  const { settings } = useSettings();
  const navigate = useNavigate();
  
  const isGoogleAuth = user?.providerData.some(p => p.providerId === 'google.com');
  const showPasswordSection = profile?.hasPassword || !isGoogleAuth;
  
  const [name, setName] = useState(profile?.displayName || '');
  const [email, setEmail] = useState(profile?.email?.endsWith('@moviznow.com') ? '' : (profile?.email || ''));
  const [phone, setPhone] = useState(profile?.phone || '');
  const [city, setCity] = useState(profile?.city || '');
  const [emailNotificationsEnabled, setEmailNotificationsEnabled] = useState(profile?.emailNotificationsEnabled !== false);
  const [showPhoneWarning, setShowPhoneWarning] = useState(false);

  useEffect(() => {
    if (profile) {
      setEmailNotificationsEnabled(
        profile.emailNotificationsEnabled !== false && profile.emailNotificationsDisabled !== true && profile.unsubscribed !== true
      );
    }
  }, [profile?.emailNotificationsEnabled, profile?.emailNotificationsDisabled, profile?.unsubscribed]);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // WhatsApp number logic
    if (!phone.trim()) {
      if (!showPhoneWarning) {
        setShowPhoneWarning(true);
        return;
      }
    } else {
      setShowPhoneWarning(false);
    }

    if (newPassword && newPassword !== confirmPassword) {
      setError(t('New passwords do not match'));
      return;
    }

    if (newPassword && profile?.hasPassword && !currentPassword) {
      setError(t('Current password is required to set a new password'));
      return;
    }

    setLoading(true);
    try {
      await updateUserProfileData({
        displayName: name,
        email: email,
        phone: phone,
        city: city,
        emailNotificationsEnabled: emailNotificationsEnabled,
      }, newPassword || undefined);
      setSuccess(t('Profile updated successfully'));
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setError(err.message || t('Failed to update profile'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-white transition-colors duration-300">
      <header className="sticky top-0 z-40 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md border-b border-zinc-200/80 dark:border-zinc-800/80">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => navigate('/')}
              className="p-2 -ml-2 rounded-xl text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800/60 transition-all active:scale-95 cursor-pointer"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-500 text-white flex items-center justify-center shadow-md shadow-emerald-500/20">
                <User className="w-4 h-4" />
              </div>
              <h1 className="text-lg font-extrabold text-zinc-900 dark:text-white">{t('Account Settings')}</h1>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {/* Profile Card Summary Banner */}
        <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200/80 dark:border-zinc-800/80 p-6 shadow-sm overflow-hidden relative">
          <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center gap-4">
            <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-tr from-emerald-500 via-teal-500 to-cyan-500 p-0.5 shadow-md shadow-emerald-500/20 shrink-0">
              <div className="w-full h-full rounded-[14px] bg-white dark:bg-zinc-900 flex items-center justify-center text-emerald-500 dark:text-emerald-400 font-extrabold text-xl">
                {profile?.displayName?.charAt(0)?.toUpperCase() || 'U'}
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-black text-zinc-900 dark:text-white truncate">{profile?.displayName || t('User Profile')}</h2>
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                {profile?.email || profile?.phone || t('Account Details')}
              </p>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  {profile?.role ? profile.role.replace('_', ' ') : 'User'}
                </span>
                <span className="text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
                  {profile?.status || 'Active'}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200/80 dark:border-zinc-800/80 overflow-hidden shadow-sm">
          <div className="p-6 md:p-8">
            <h2 className="text-lg font-black text-zinc-900 dark:text-white mb-6 flex items-center gap-2.5">
              <User className="w-5 h-5 text-emerald-500" />
              {t('Profile Information')}
            </h2>
            
            {error && (
              <div className="mb-6 p-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-2xl text-red-600 dark:text-red-400 text-sm font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            
            {success && (
              <div className="mb-6 p-4 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-2xl text-emerald-600 dark:text-emerald-400 text-sm font-semibold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{success}</span>
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-6">
              <div className="space-y-5">
                <div>
                  <label className="block text-xs font-extrabold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2">{t('Full Name')}</label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl pl-10 pr-4 py-3 text-sm font-semibold text-zinc-900 dark:text-white focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all shadow-2xs"
                      placeholder="Your name"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-extrabold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2">{t('City')}</label>
                  <div className="relative">
                    <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                    <input
                      type="text"
                      value={city}
                      onChange={(e) => {
                        setCity(e.target.value);
                        setError('');
                      }}
                      disabled={!!profile?.city}
                      className={clsx(
                        "w-full border rounded-2xl pl-10 pr-4 py-3 text-sm font-semibold focus:outline-none transition-all shadow-2xs",
                        profile?.city 
                          ? "bg-zinc-100 dark:bg-zinc-800/50 border-zinc-200/80 dark:border-zinc-800/80 text-zinc-500 cursor-not-allowed opacity-75"
                          : "bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                      )}
                      placeholder={t('Enter your city')}
                    />
                  </div>
                  {profile?.city ? (
                    <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400 font-medium">
                      {t('City cannot be changed once set.')}
                    </p>
                  ) : (
                    <p className="mt-1.5 text-[11px] text-zinc-500 dark:text-zinc-400 font-medium">
                      {t('You can only set your city once.')}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-extrabold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2">{t('Email Address')}</label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                    <input
                      type="email"
                      value={email}
                      disabled
                      className="w-full bg-zinc-100 dark:bg-zinc-800/50 border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl pl-10 pr-4 py-3 text-sm font-semibold cursor-not-allowed opacity-75 text-zinc-500 dark:text-zinc-400"
                      placeholder="your@email.com"
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400 font-medium">
                    {t('Email address cannot be changed.')} 
                      {settings?.isAdminContactEnabled !== false && (
                         <span> <a href={(() => {
                           let supportPhone = settings?.supportNumber || '3363284466';
                           if (supportPhone.startsWith('0')) {
                             supportPhone = '92' + supportPhone.substring(1);
                           } else if (!supportPhone.startsWith('92')) {
                             supportPhone = '92' + supportPhone;
                           }
                           const adminPhone = supportPhone.replace('+', '');
                           return `https://wa.me/${adminPhone}?text=${encodeURIComponent(`Assalam O Alaikum! Admin,\n\nName: ${profile?.displayName || 'Unknown'}\nEmail: ${profile?.email || 'N/A'}\nPhone: ${profile?.phone || 'N/A'}\nRole & Status: ${String(profile?.role || 'Unknown').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}, ${String(profile?.status || 'Unknown').replace(/\b\w/g, c => c.toUpperCase())}\n\n${t("Your message/question:")}\n${t("I need to change my email address.")}\n\n${t("Your new email:")} `)}`;
                         })()} target="_blank" rel="noreferrer" className="text-emerald-500 hover:underline font-bold">{t('Contact admin')}</a> {t('if needed.')}</span>
                      )}
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-extrabold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2">{t('WhatsApp Number')}</label>
                  <div className="relative">
                    <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => {
                        setPhone(e.target.value);
                        setError('');
                      }}
                      className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl pl-10 pr-4 py-3 text-sm font-semibold text-zinc-900 dark:text-white focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all shadow-2xs"
                      placeholder="e.g. 03001234567"
                    />
                  </div>
                  {showPhoneWarning && !phone.trim() && (
                    <div className="mt-2 flex items-center gap-2 text-amber-500">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <p className="text-xs font-semibold">{t('WhatsApp number is required for support. Click Save again to skip.')}</p>
                    </div>
                  )}
                  <p className="mt-1.5 text-[11px] text-zinc-500 dark:text-zinc-400 font-medium">
                    {t('Required for membership.')}
                  </p>
                </div>
              </div>

              <div className="h-px bg-zinc-200/80 dark:bg-zinc-800/80 my-8"></div>

              <div className="space-y-4">
                <h3 className="text-base font-extrabold flex items-center gap-2.5 text-zinc-900 dark:text-white">
                  <Bell className="w-5 h-5 text-emerald-500" />
                  {t('Notification Preferences')}
                </h3>

                <div className="bg-zinc-50 dark:bg-zinc-950/80 p-5 rounded-2xl border border-zinc-200/80 dark:border-zinc-800/80 flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <p className="font-extrabold text-sm text-zinc-900 dark:text-white flex items-center gap-2">
                      <Mail className="w-4 h-4 text-emerald-500" />
                      {t('Movie & Series Email Alerts')}
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">
                      {t('Receive email updates when new movies and TV series are released on MovizNow.')}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEmailNotificationsEnabled(!emailNotificationsEnabled)}
                    className={clsx(
                      "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                      emailNotificationsEnabled ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-700"
                    )}
                  >
                    <span
                      className={clsx(
                        "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                        emailNotificationsEnabled ? "translate-x-5" : "translate-x-0"
                      )}
                    />
                  </button>
                </div>
              </div>

              {showPasswordSection && (
                <>
                  <div className="h-px bg-zinc-200/80 dark:bg-zinc-800/80 my-8"></div>

                  <div className="space-y-5">
                    <h3 className="text-base font-extrabold flex items-center gap-2.5 text-zinc-900 dark:text-white">
                      <Lock className="w-5 h-5 text-emerald-500" />
                      {profile?.hasPassword ? t('Change Password') : t('Create Password')}
                    </h3>
                    
                    {profile?.hasPassword && (
                      <div>
                        <label className="block text-xs font-extrabold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2">{t('Current Password')}</label>
                        <div className="relative">
                          <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                          <input
                            type="password"
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl pl-10 pr-4 py-3 text-sm font-semibold text-zinc-900 dark:text-white focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all shadow-2xs"
                            placeholder="Enter current password if changing"
                          />
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-extrabold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2">{t('New Password')}</label>
                      <div className="relative">
                        <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                        <input
                          type="password"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl pl-10 pr-4 py-3 text-sm font-semibold text-zinc-900 dark:text-white focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all shadow-2xs"
                          placeholder="New password"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-extrabold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-2">{t('Confirm New Password')}</label>
                      <div className="relative">
                        <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                        <input
                          type="password"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl pl-10 pr-4 py-3 text-sm font-semibold text-zinc-900 dark:text-white focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all shadow-2xs"
                          placeholder="Confirm new password"
                        />
                      </div>
                    </div>
                  </div>
                </>
              )}

              <div className="pt-6">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white py-3.5 rounded-2xl font-black text-sm transition-all disabled:opacity-50 shadow-lg shadow-emerald-500/25 active:scale-98 cursor-pointer"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                  <span>{t('Save Changes')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
