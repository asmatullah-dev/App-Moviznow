import { useState, useEffect } from 'react';
import { useAuth, standardizePhone } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useSettings } from '../../contexts/SettingsContext';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  Save, 
  Lock, 
  User, 
  Mail, 
  Phone, 
  Loader2, 
  AlertCircle, 
  Bell, 
  BellRing,
  CheckCircle2, 
  MapPin, 
  Smartphone, 
  ShieldAlert, 
  Film, 
  Clock, 
  ShieldCheck, 
  Sparkles,
  Info,
  Check,
  ShoppingBag
} from 'lucide-react';
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
  const [showPhoneWarning, setShowPhoneWarning] = useState(false);

  // FCM Notifications Group
  const [fcmEnabled, setFcmEnabled] = useState(
    profile?.notificationPreferences?.fcm?.enabled ?? (profile?.notification !== 'no')
  );
  const [fcmNewContent, setFcmNewContent] = useState(
    profile?.notificationPreferences?.fcm?.newContent ?? true
  );
  const [fcmMembershipAlerts, setFcmMembershipAlerts] = useState(
    profile?.notificationPreferences?.fcm?.membershipAlerts ?? profile?.notificationPreferences?.fcm?.membershipExpiry ?? true
  );
  const [fcmOrders, setFcmOrders] = useState(
    profile?.notificationPreferences?.fcm?.orders ?? true
  );

  // Email Notifications Group
  const [emailEnabled, setEmailEnabled] = useState(
    profile?.notificationPreferences?.email?.enabled ??
    (profile?.emailNotificationsEnabled !== false && profile?.emailNotificationsDisabled !== true && profile?.unsubscribed !== true)
  );
  const [emailLoginAlerts, setEmailLoginAlerts] = useState(
    profile?.notificationPreferences?.email?.loginAlerts ?? true
  );
  const [emailNewContent, setEmailNewContent] = useState(
    profile?.notificationPreferences?.email?.newContent ??
    (profile?.emailNotificationsEnabled !== false && profile?.emailNotificationsDisabled !== true && profile?.unsubscribed !== true)
  );
  const [emailMembershipAlerts, setEmailMembershipAlerts] = useState(
    profile?.notificationPreferences?.email?.membershipAlerts ?? profile?.notificationPreferences?.email?.membershipExpiry ?? true
  );
  const [emailOrders, setEmailOrders] = useState(
    profile?.notificationPreferences?.email?.orders ?? true
  );

  // Browser Permission Tracking
  const [permissionState, setPermissionState] = useState<'granted' | 'denied' | 'default' | 'unsupported'>('default');
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPermissionState(Notification.permission);
    } else {
      setPermissionState('unsupported');
    }
  }, []);

  useEffect(() => {
    if (profile) {
      if (profile.notificationPreferences?.fcm) {
        setFcmEnabled(profile.notificationPreferences.fcm.enabled !== false);
        setFcmNewContent(profile.notificationPreferences.fcm.newContent !== false);
        setFcmMembershipAlerts(
          profile.notificationPreferences.fcm.membershipAlerts !== false &&
          profile.notificationPreferences.fcm.membershipExpiry !== false
        );
      } else {
        setFcmEnabled(profile.notification !== 'no');
      }

      if (profile.notificationPreferences?.email) {
        setEmailEnabled(
          profile.notificationPreferences.email.enabled !== false &&
          profile.emailNotificationsDisabled !== true &&
          profile.unsubscribed !== true
        );
        setEmailLoginAlerts(profile.notificationPreferences.email.loginAlerts !== false);
        setEmailNewContent(profile.notificationPreferences.email.newContent !== false);
        setEmailMembershipAlerts(
          profile.notificationPreferences.email.membershipAlerts !== false &&
          profile.notificationPreferences.email.membershipExpiry !== false
        );
      } else {
        const isEmailActive = profile.emailNotificationsEnabled !== false && profile.emailNotificationsDisabled !== true && profile.unsubscribed !== true;
        setEmailEnabled(isEmailActive);
        setEmailNewContent(isEmailActive);
      }
    }
  }, [profile]);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleRequestPushPermission = async () => {
    setIsRequestingPermission(true);
    try {
      const token = await requestNotificationPermission();
      if (typeof window !== 'undefined' && 'Notification' in window) {
        setPermissionState(Notification.permission);
        if (Notification.permission === 'granted') {
          setFcmEnabled(true);
        }
      }
    } catch (err) {
      console.warn('Failed to request notification permission:', err);
    } finally {
      setIsRequestingPermission(false);
    }
  };

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
      const notificationPreferences = {
        fcm: {
          enabled: fcmEnabled,
          newContent: fcmNewContent,
          membershipAlerts: fcmMembershipAlerts,
          membershipExpiry: fcmMembershipAlerts,
          orders: fcmOrders,
        },
        email: {
          enabled: emailEnabled,
          loginAlerts: emailLoginAlerts,
          newContent: emailNewContent,
          membershipAlerts: emailMembershipAlerts,
          membershipExpiry: emailMembershipAlerts,
          orders: emailOrders,
        },
      };

      await updateUserProfileData({
        displayName: name,
        email: email,
        phone: phone,
        city: city,
        notification: fcmEnabled ? 'yes' : 'no',
        emailNotificationsEnabled: emailEnabled && emailNewContent,
        emailNotificationsDisabled: !emailEnabled || !emailNewContent,
        notificationPreferences: notificationPreferences,
      }, newPassword || undefined);

      if ((window as any).triggerSyncUserData) {
        await (window as any).triggerSyncUserData('settings_changed');
      }

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
                           let supportPhone = settings?.supportNumber || '3416286423';
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

              {/* -------------------- NOTIFICATION CENTER SECTION -------------------- */}
              <div className="h-px bg-zinc-200/80 dark:bg-zinc-800/80 my-8"></div>

              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-extrabold flex items-center gap-2.5 text-zinc-900 dark:text-white">
                      <Bell className="w-5 h-5 text-emerald-500" />
                      {t('Notification Center')}
                    </h3>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                      {t('Manage how you receive alerts, releases, and security updates.')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold px-2.5 py-1 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                      {(fcmEnabled ? 1 : 0) + (emailEnabled ? 1 : 0)} / 2 {t('Channels Active')}
                    </span>
                  </div>
                </div>

                {/* GROUP 1: FCM / PUSH NOTIFICATIONS */}
                <div className="rounded-2xl border border-zinc-200/90 dark:border-zinc-800/90 bg-zinc-50/50 dark:bg-zinc-950/40 p-5 md:p-6 space-y-5 transition-all">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3.5">
                      <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-500 to-cyan-500 text-white flex items-center justify-center shadow-md shadow-indigo-500/20 shrink-0 mt-0.5">
                        <Smartphone className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-sm font-black text-zinc-900 dark:text-white">
                            {t('Push Notifications (FCM)')}
                          </h4>
                          <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                            {t('Device Push')}
                          </span>
                        </div>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                          {t('Real-time alerts sent directly to your mobile device and browser.')}
                        </p>
                      </div>
                    </div>

                    {/* Master Switch for FCM */}
                    <button
                      type="button"
                      onClick={() => {
                        const next = !fcmEnabled;
                        setFcmEnabled(next);
                        if (next && permissionState === 'default') {
                          handleRequestPushPermission();
                        }
                      }}
                      title={t('Master Push Switch')}
                      className={clsx(
                        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                        fcmEnabled ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-700"
                      )}
                    >
                      <span
                        className={clsx(
                          "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                          fcmEnabled ? "translate-x-5" : "translate-x-0"
                        )}
                      />
                    </button>
                  </div>

                  {/* Browser Permission Banner */}
                  {permissionState === 'granted' ? (
                    <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-between text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        <span>{t('Permission Active')} — {t('Browser and device push enabled')}</span>
                      </div>
                    </div>
                  ) : permissionState === 'denied' ? (
                    <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 font-medium">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{t('Notifications are blocked in your browser settings.')}</span>
                    </div>
                  ) : (
                    <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl flex items-center justify-between gap-3 text-xs text-indigo-700 dark:text-indigo-300 font-medium">
                      <div className="flex items-center gap-2">
                        <BellRing className="w-4 h-4 shrink-0 text-indigo-500" />
                        <span>{t('Device push permission required for instant notifications')}</span>
                      </div>
                      <button
                        type="button"
                        onClick={handleRequestPushPermission}
                        disabled={isRequestingPermission}
                        className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold text-xs shrink-0 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                      >
                        {isRequestingPermission ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : t('Allow Notifications')}
                      </button>
                    </div>
                  )}

                  {/* Sub-services under FCM */}
                  <div className={clsx("space-y-3 pt-1 transition-opacity", !fcmEnabled && "opacity-50 pointer-events-none")}>
                    {/* Service 1: New Content Notify */}
                    <div className="bg-white dark:bg-zinc-900 p-4 rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 flex items-center justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0 mt-0.5">
                          <Film className="w-4 h-4" />
                        </div>
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-extrabold text-xs text-zinc-900 dark:text-white">
                              {t('New Content Notify')}
                            </p>
                            <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-purple-100 dark:bg-purple-950/80 text-purple-600 dark:text-purple-300">
                              {t('Updates')}
                            </span>
                          </div>
                          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-medium leading-relaxed">
                            {t('Get notified immediately when new HD movies, seasons, or requested titles are added.')}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setFcmNewContent(!fcmNewContent)}
                        className={clsx(
                          "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                          fcmNewContent && fcmEnabled ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-700"
                        )}
                      >
                        <span
                          className={clsx(
                            "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                            fcmNewContent && fcmEnabled ? "translate-x-4" : "translate-x-0"
                          )}
                        />
                      </button>
                    </div>

                    {/* Service 2: Membership Alerts */}
                    <div className="bg-white dark:bg-zinc-900 p-4 rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 flex items-center justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
                          <Clock className="w-4 h-4" />
                        </div>
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-extrabold text-xs text-zinc-900 dark:text-white">
                              {t('Membership Alerts')}
                            </p>
                            <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-100 dark:bg-amber-950/80 text-amber-600 dark:text-amber-300">
                              {t('Critical')}
                            </span>
                          </div>
                          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-medium leading-relaxed">
                            {t('Receive instant push alerts when your membership plan, expiry date, or active subscription is updated or expiring.')}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setFcmMembershipAlerts(!fcmMembershipAlerts)}
                        className={clsx(
                          "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                          fcmMembershipAlerts && fcmEnabled ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-700"
                        )}
                      >
                        <span
                          className={clsx(
                            "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                            fcmMembershipAlerts && fcmEnabled ? "translate-x-4" : "translate-x-0"
                          )}
                        />
                      </button>
                    </div>

                    {/* Service 3: Orders Alerts */}
                    <div className="bg-white dark:bg-zinc-900 p-4 rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 flex items-center justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 mt-0.5">
                          <Check className="w-4 h-4" />
                        </div>
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-extrabold text-xs text-zinc-900 dark:text-white">
                              {t('Order Updates')}
                            </p>
                          </div>
                          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-medium leading-relaxed">
                            {t('Receive push notifications when your membership or content orders are approved.')}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setFcmOrders(!fcmOrders)}
                        className={clsx(
                          "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                          fcmOrders && fcmEnabled ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-700"
                        )}
                      >
                        <span
                          className={clsx(
                            "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                            fcmOrders && fcmEnabled ? "translate-x-4" : "translate-x-0"
                          )}
                        />
                      </button>
                    </div>
                  </div>
                </div>

                {/* GROUP 2: EMAIL NOTIFICATIONS */}
                <div className="rounded-2xl border border-zinc-200/90 dark:border-zinc-800/90 bg-zinc-50/50 dark:bg-zinc-950/40 p-5 md:p-6 space-y-5 transition-all">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3.5">
                      <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-500 text-white flex items-center justify-center shadow-md shadow-emerald-500/20 shrink-0 mt-0.5">
                        <Mail className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-sm font-black text-zinc-900 dark:text-white">
                            {t('Email Notifications')}
                          </h4>
                          <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                            {t('Email Delivery')}
                          </span>
                        </div>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                          {t('Official notices, newsletters, and security digests delivered to')}{' '}
                          <span className="font-bold text-zinc-700 dark:text-zinc-300">{profile?.email || email || 'your email'}</span>
                        </p>
                      </div>
                    </div>

                    {/* Master Switch for Email */}
                    <button
                      type="button"
                      onClick={() => setEmailEnabled(!emailEnabled)}
                      title={t('Master Email Switch')}
                      className={clsx(
                        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                        emailEnabled ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-700"
                      )}
                    >
                      <span
                        className={clsx(
                          "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                          emailEnabled ? "translate-x-5" : "translate-x-0"
                        )}
                      />
                    </button>
                  </div>

                  {/* Sub-services under Email */}
                  <div className={clsx("space-y-3 pt-1 transition-opacity", !emailEnabled && "opacity-50 pointer-events-none")}>
                    {/* Service 1: Login Alerts */}
                    <div className="bg-white dark:bg-zinc-900 p-4 rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 flex items-center justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                          <ShieldCheck className="w-4 h-4" />
                        </div>
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-extrabold text-xs text-zinc-900 dark:text-white">
                              {t('Login & Security Alerts')}
                            </p>
                            <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-300">
                              {t('Security')}
                            </span>
                          </div>
                          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-medium leading-relaxed">
                            {t('Receive detailed security emails with timestamp and device info upon account login.')}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setEmailLoginAlerts(!emailLoginAlerts)}
                        className={clsx(
                          "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                          emailLoginAlerts && emailEnabled ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-700"
                        )}
                      >
                        <span
                          className={clsx(
                            "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                            emailLoginAlerts && emailEnabled ? "translate-x-4" : "translate-x-0"
                          )}
                        />
                      </button>
                    </div>

                    {/* Service 2: New Content Notify */}
                    <div className="bg-white dark:bg-zinc-900 p-4 rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 flex items-center justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0 mt-0.5">
                          <Sparkles className="w-4 h-4" />
                        </div>
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-extrabold text-xs text-zinc-900 dark:text-white">
                              {t('New Content Notify')}
                            </p>
                            <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-teal-100 dark:bg-teal-950/80 text-teal-600 dark:text-teal-300">
                              {t('Newsletter')}
                            </span>
                          </div>
                          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-medium leading-relaxed">
                            {t('Receive weekly newsletters and release emails for trending movies and exclusive series.')}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setEmailNewContent(!emailNewContent)}
                        className={clsx(
                          "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                          emailNewContent && emailEnabled ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-700"
                        )}
                      >
                        <span
                          className={clsx(
                            "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                            emailNewContent && emailEnabled ? "translate-x-4" : "translate-x-0"
                          )}
                        />
                      </button>
                    </div>

                    {/* Service 3: Membership Alerts */}
                    <div className="bg-white dark:bg-zinc-900 p-4 rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 flex items-center justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0 mt-0.5">
                          <Clock className="w-4 h-4" />
                        </div>
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-extrabold text-xs text-zinc-900 dark:text-white">
                              {t('Membership Alerts')}
                            </p>
                            <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-rose-100 dark:bg-rose-950/80 text-rose-600 dark:text-rose-300">
                              {t('Billing')}
                            </span>
                          </div>
                          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-medium leading-relaxed">
                            {t('Receive official email notices when your membership plan or expiry date is updated, extended, or expiring.')}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setEmailMembershipAlerts(!emailMembershipAlerts)}
                        className={clsx(
                          "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                          emailMembershipAlerts && emailEnabled ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-700"
                        )}
                      >
                        <span
                          className={clsx(
                            "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                            emailMembershipAlerts && emailEnabled ? "translate-x-4" : "translate-x-0"
                          )}
                        />
                      </button>
                    </div>

                    {/* Service 4: Orders Email Alerts */}
                    <div className="bg-white dark:bg-zinc-900 p-4 rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 flex items-center justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 mt-0.5">
                          <Check className="w-4 h-4" />
                        </div>
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-extrabold text-xs text-zinc-900 dark:text-white">
                              {t('Order Updates')}
                            </p>
                          </div>
                          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-medium leading-relaxed">
                            {t('Receive email receipts when your membership or content orders are approved.')}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setEmailOrders(!emailOrders)}
                        className={clsx(
                          "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                          emailOrders && emailEnabled ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-700"
                        )}
                      >
                        <span
                          className={clsx(
                            "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                            emailOrders && emailEnabled ? "translate-x-4" : "translate-x-0"
                          )}
                        />
                      </button>
                    </div>
                  </div>
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
