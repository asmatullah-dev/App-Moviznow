import { useState, useEffect, useRef } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, storage, auth, requestNotificationPermission } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { useContent } from '../../contexts/ContentContext';
import { Save, AlertCircle, GripVertical, Plus, Trash2, Layout, Wallet, Phone, Image as ImageIcon, Settings as SettingsIcon, RefreshCw, ShieldCheck, X, Eye, EyeOff, Database, Rocket, Loader2, Bell, BellOff, Info, Mail, Check } from 'lucide-react';
import { clsx } from 'clsx';
import { Navigate } from 'react-router-dom';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import ConfirmModal from '../../components/ConfirmModal';
import AlertModal from '../../components/AlertModal';
import { AppSettings, BankAccount } from '../../types';

export default function AdminSettings() {
  const { profile } = useAuth();
  const { contentList } = useContent();
  const [settings, setSettings] = useState<AppSettings>({
    headerText: 'MovizNow',
    membershipFee: 200,
    movieFee: 50,
    seasonFee: 100,
    paymentDetails: '',
    itemsPerPage: 20,
    recentViewLimit: 10,
    recommendedLimit: 10,
    defaultAppImage: 'https://picsum.photos/seed/movie/400/600',
    supportNumber: '3363284466',
    accountTitle: 'Asmat Ullah',
    accountNumber: '03416286423',
    bankAccounts: [
      { id: '1', name: 'Easypaisa', accountNumber: '', accountTitle: '', color: '#00c652', labelColor: '#00c652', textColor: '#ffffff', iconUrl: '' },
      { id: '2', name: 'JazzCash', accountNumber: '', accountTitle: '', color: '#ed1c24', labelColor: '#ed1c24', textColor: '#ffffff', iconUrl: '' },
      { id: '3', name: 'NayaPay', accountNumber: '', accountTitle: '', color: '#ff6b00', labelColor: '#ff6b00', textColor: '#ffffff', iconUrl: '' },
      { id: '4', name: 'SadaPay', accountNumber: '', accountTitle: '', color: '#00e6b8', labelColor: '#00e6b8', textColor: '#ffffff', iconUrl: '' }
    ],
    adminTabsOrder: [
      'Dashboard', 'Analytics', 'Orders', 'Content', 'Users', 
      'UserManagers', 'SelectedContent', 
      'Income', 'ErrorLinks', 'ReportedLinks', 'Notifications', 'Requests', 'Sync'
    ],
    hiddenAdminTabs: [],
    isTrialEnabled: true,
    isPhoneLoginEnabled: true,
    isAdminContactEnabled: true,
    isPaymentEnabled: true,
    isMaintenanceModeEnabled: false,
    maintenanceMessage: 'App is currently under maintenance. Please try again later.',
    whatsappChannelLink: '',
    emailSettings: {
      smtpHost: 'smtp.gmail.com',
      smtpPort: 587,
      smtpUser: '',
      smtpPass: '',
      smtpSecure: false,
      senderName: 'MovizNow',
      senderEmail: '',
      enableWelcomeEmail: true,
      enableNewContentEmail: true
    },
    serviceAccounts: {
      sourceKey: '',
      targets: []
    }
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alertConfig, setAlertConfig] = useState<{isOpen: boolean; title: string; message: string;}>({ isOpen: false, title: '', message: '' });
  const [isUpdatingIndex, setIsUpdatingIndex] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationProgress, setMigrationProgress] = useState(0);
  const [testingSmtp, setTestingSmtp] = useState(false);
  const [smtpResult, setSmtpResult] = useState<{ success?: boolean; message?: string } | null>(null);

  const handleTestSmtp = async () => {
    setTestingSmtp(true);
    setSmtpResult(null);
    try {
      const res = await fetch('/api/email/test-smtp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resendApiKey: settings.emailSettings?.resendApiKey,
          host: settings.emailSettings?.smtpHost,
          port: settings.emailSettings?.smtpPort,
          secure: settings.emailSettings?.smtpSecure,
          user: settings.emailSettings?.smtpUser,
          pass: settings.emailSettings?.smtpPass,
          senderName: settings.emailSettings?.senderName,
          senderEmail: settings.emailSettings?.senderEmail,
          recipientEmail: settings.emailSettings?.senderEmail || settings.emailSettings?.smtpUser || profile?.email,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSmtpResult({ success: false, message: data.error || 'Email connection test failed.' });
      } else {
        setSmtpResult({ success: true, message: data.message });
      }
    } catch (err: any) {
      setSmtpResult({ success: false, message: err.message || 'Failed to connect to backend server.' });
    } finally {
      setTestingSmtp(false);
    }
  };

  useEffect(() => {
    // 1. Load cached settings from localStorage first for instant display
    try {
      const cachedStr = localStorage.getItem('cached_app_settings');
      if (cachedStr) {
        const parsed = JSON.parse(cachedStr);
        setSettings(prev => ({ ...prev, ...parsed }));
        setLoading(false);
      }
    } catch (e) {}

    const fetchSettings = async () => {
      try {
        const docRef = doc(db, 'settings', 'app_settings');
        const docSnap = await getDoc(docRef);

        let ObjectData: Partial<AppSettings> = {};

        if (docSnap.exists()) {
          ObjectData = { ...docSnap.data() };
        }

        const mergedSettings: AppSettings = {
          ...settings,
          ...ObjectData,
          bankAccounts: ObjectData.bankAccounts || settings.bankAccounts,
          adminTabsOrder: ObjectData.adminTabsOrder || settings.adminTabsOrder,
          hiddenAdminTabs: ObjectData.hiddenAdminTabs || [],
          emailSettings: {
            resendApiKey: '',
            smtpHost: 'smtp.gmail.com',
            smtpPort: 587,
            smtpUser: '',
            smtpPass: '',
            smtpSecure: false,
            senderName: 'MovizNow',
            senderEmail: '',
            enableWelcomeEmail: true,
            enableNewContentEmail: true,
            ...(ObjectData.emailSettings || {})
          },
          serviceAccounts: ObjectData.serviceAccounts || { sourceKey: '', targets: [] }
        };

        setSettings(mergedSettings);
        localStorage.setItem('cached_app_settings', JSON.stringify(mergedSettings));
      } catch (err) {
        console.error('Error fetching settings:', err);
        setError('Failed to load settings.');
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      localStorage.setItem('cached_app_settings', JSON.stringify(settings));

      const { writeBatch } = await import('firebase/firestore');
      const batch = writeBatch(db);
      batch.set(doc(db, 'settings', 'app_settings'), settings);
      batch.set(doc(db, 'chunk_meta', 'versions'), { settings: Date.now() }, { merge: true });
      await batch.commit();

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error('Error saving settings:', err);
      setError('Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };



  const onDragEnd = (result: any) => {
    if (!result.destination) return;
    const items = Array.from(settings.adminTabsOrder);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    setSettings({ ...settings, adminTabsOrder: items });
  };

  const addBankAccount = () => {
    const newBank: BankAccount = {
      id: Date.now().toString(),
      name: 'New Bank',
      accountNumber: '',
      accountTitle: '',
      color: '#3b82f6',
      labelColor: '#3b82f6',
      textColor: '#ffffff',
      iconUrl: ''
    };
    setSettings({
      ...settings,
      bankAccounts: [...settings.bankAccounts, newBank]
    });
  };

  const removeBankAccount = (id: string) => {
    setSettings({
      ...settings,
      bankAccounts: settings.bankAccounts.filter(b => b.id !== id)
    });
  };

  const updateBankAccount = (id: string, field: keyof BankAccount, value: string) => {
    setSettings({
      ...settings,
      bankAccounts: settings.bankAccounts.map(b => b.id === id ? { ...b, [field]: value } : b)
    });
  };

  const isIBAN = (value: string) => {
    // Basic IBAN regex: 2 letters followed by 2 digits, then up to 30 alphanumeric characters
    return /^[A-Z]{2}[0-9]{2}[A-Z0-9]{4,30}$/i.test(value.replace(/\s/g, ''));
  };

  const toggleHiddenTab = (tabId: string) => {
    const currentHidden = settings.hiddenAdminTabs || [];
    if (currentHidden.includes(tabId)) {
      setSettings({ ...settings, hiddenAdminTabs: currentHidden.filter(id => id !== tabId) });
    } else {
      setSettings({ ...settings, hiddenAdminTabs: [...currentHidden, tabId] });
    }
  };

  const addTargetAccount = () => {
    const currentTargets = settings.serviceAccounts?.targets || [];
    const newTarget = {
      id: crypto.randomUUID(),
      title: '',
      key: '',
      databaseId: '(default)'
    };
    setSettings({
      ...settings,
      serviceAccounts: {
        ...(settings.serviceAccounts || {}),
        targets: [...currentTargets, newTarget]
      }
    });
  };

  const removeTargetAccount = (id: string) => {
    const currentTargets = settings.serviceAccounts?.targets || [];
    setSettings({
      ...settings,
      serviceAccounts: {
        ...(settings.serviceAccounts || {}),
        targets: currentTargets.filter(t => t.id !== id)
      }
    });
  };

  const updateTargetAccount = (id: string, updates: any) => {
    const currentTargets = settings.serviceAccounts?.targets || [];
    setSettings({
      ...settings,
      serviceAccounts: {
        ...(settings.serviceAccounts || {}),
        targets: currentTargets.map(t => t.id === id ? { ...t, ...updates } : t)
      }
    });
  };

  if (profile?.role !== 'owner') {
    return <Navigate to="/admin" replace />;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto pb-20">
      <div className="mb-8 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">App Settings</h1>
            <p className="text-zinc-500 dark:text-zinc-400 mt-1">Manage global application settings</p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-8">
        {error && (
          <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl flex items-center gap-3">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {success && (
          <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded-xl flex items-center gap-3">
            <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0">
              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p>Settings saved successfully!</p>
          </div>
        )}



        {/* General Settings */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-2">
            <SettingsIcon className="w-5 h-5 text-zinc-400" />
            <h2 className="text-lg font-semibold">General Settings</h2>
          </div>
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">App Name</label>
              <input
                type="text"
                value={settings.headerText}
                onChange={(e) => setSettings({ ...settings, headerText: e.target.value })}
                className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Support WhatsApp Number (e.g. 3363284466)</label>
              <div className="relative">
                <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                <input
                  type="text"
                  value={settings.supportNumber}
                  onChange={(e) => setSettings({ ...settings, supportNumber: e.target.value })}
                  className="w-full pl-10 pr-4 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                  placeholder="3363284466"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">WhatsApp Channel Link</label>
              <input
                type="text"
                value={settings.whatsappChannelLink || ''}
                onChange={(e) => setSettings({ ...settings, whatsappChannelLink: e.target.value })}
                className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                placeholder="https://whatsapp.com/channel/..."
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Default App Image URL</label>
              <div className="relative">
                <ImageIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                <input
                  type="text"
                  value={settings.defaultAppImage}
                  onChange={(e) => setSettings({ ...settings, defaultAppImage: e.target.value })}
                  className="w-full pl-10 pr-4 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
            </div>

            <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700">
                <div>
                  <h3 className="font-medium text-zinc-900 dark:text-white">Enable Trial</h3>
                  <p className="text-sm text-zinc-500">Allow direct link trial activation.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSettings({ ...settings, isTrialEnabled: !settings.isTrialEnabled })}
                  className={clsx(
                    "relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0",
                    settings.isTrialEnabled !== false ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-600"
                  )}
                >
                  <span
                    className={clsx(
                      "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                      settings.isTrialEnabled !== false ? "translate-x-6" : "translate-x-1"
                    )}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700">
                <div>
                  <h3 className="font-medium text-zinc-900 dark:text-white">Enable Phone Login</h3>
                  <p className="text-sm text-zinc-500">Show phone login option on login page.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSettings({ ...settings, isPhoneLoginEnabled: settings.isPhoneLoginEnabled !== false ? false : true })}
                  className={clsx(
                    "relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0",
                    settings.isPhoneLoginEnabled !== false ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-600"
                  )}
                >
                  <span
                    className={clsx(
                      "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                      settings.isPhoneLoginEnabled !== false ? "translate-x-6" : "translate-x-1"
                    )}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700">
                <div>
                  <h3 className="font-medium text-zinc-900 dark:text-white">Enable Admin Contact</h3>
                  <p className="text-zinc-500 text-xs sm:text-sm">Show contact admin buttons and WhatsApp numbers.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSettings({ ...settings, isAdminContactEnabled: settings.isAdminContactEnabled !== false ? false : true })}
                  className={clsx(
                    "relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0",
                    settings.isAdminContactEnabled !== false ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-600"
                  )}
                >
                  <span
                    className={clsx(
                      "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                      settings.isAdminContactEnabled !== false ? "translate-x-6" : "translate-x-1"
                    )}
                  />
                </button>
              </div>

              <div className="flex flex-col gap-4 p-4 bg-red-50 dark:bg-red-900/10 rounded-xl border border-red-200 dark:border-red-900/30">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-red-900 dark:text-red-400">Not Available Mode</h3>
                    <p className="text-red-700/80 dark:text-red-400/80 text-xs sm:text-sm">Disable access for non-members (e.g. pending, trial, expired) and show a "Not Available" screen.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSettings({ ...settings, isMaintenanceModeEnabled: !settings.isMaintenanceModeEnabled })}
                    className={clsx(
                      "relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0",
                      settings.isMaintenanceModeEnabled ? "bg-red-600" : "bg-zinc-300 dark:bg-zinc-600"
                    )}
                  >
                    <span
                      className={clsx(
                        "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                        settings.isMaintenanceModeEnabled ? "translate-x-6" : "translate-x-1"
                      )}
                    />
                  </button>
                </div>
                
                {settings.isMaintenanceModeEnabled && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-red-900 dark:text-red-400 mb-2">
                        Custom Maintenance Message
                      </label>
                      <textarea
                        value={settings.maintenanceMessage || ''}
                        onChange={(e) => setSettings({ ...settings, maintenanceMessage: e.target.value })}
                        className="w-full bg-white dark:bg-black/20 border border-red-200 dark:border-red-900/30 rounded-lg p-3 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                        rows={3}
                        placeholder="Enter the message to show to users..."
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-red-900 dark:text-red-400 mb-2">
                        Maintenance End Time (Leave blank for infinite)
                      </label>
                      <input
                        type="datetime-local"
                        value={settings.maintenanceEndTime ? new Date(new Date(settings.maintenanceEndTime).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ''}
                        onChange={(e) => setSettings({ ...settings, maintenanceEndTime: e.target.value ? new Date(e.target.value).toISOString() : undefined })}
                        className="w-full bg-white dark:bg-black/20 border border-red-200 dark:border-red-900/30 rounded-lg p-3 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Content Display Limits */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-2">
            <Layout className="w-5 h-5 text-zinc-400" />
            <h2 className="text-lg font-semibold">Content Display Limits</h2>
          </div>
          <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Contents Per Page (Home)</label>
              <input
                type="number"
                value={settings.itemsPerPage}
                onChange={(e) => setSettings({ ...settings, itemsPerPage: parseInt(e.target.value) || 0 })}
                className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Recent View Limit</label>
              <input
                type="number"
                value={settings.recentViewLimit}
                onChange={(e) => setSettings({ ...settings, recentViewLimit: parseInt(e.target.value) || 0 })}
                className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Recommended Limit</label>
              <input
                type="number"
                value={settings.recommendedLimit}
                onChange={(e) => setSettings({ ...settings, recommendedLimit: parseInt(e.target.value) || 0 })}
                className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>
          </div>
        </div>

        {/* Fees */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          <div className="p-6 border-b border-zinc-200 dark:border-zinc-800">
            <h2 className="text-lg font-semibold">Fees (Rs)</h2>
          </div>
          <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Membership Fee</label>
              <input
                type="number"
                value={settings.membershipFee}
                onChange={(e) => setSettings({ ...settings, membershipFee: parseInt(e.target.value) || 0 })}
                className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Movie Fee</label>
              <input
                type="number"
                value={settings.movieFee}
                onChange={(e) => setSettings({ ...settings, movieFee: parseInt(e.target.value) || 0 })}
                className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Season Fee</label>
              <input
                type="number"
                value={settings.seasonFee}
                onChange={(e) => setSettings({ ...settings, seasonFee: parseInt(e.target.value) || 0 })}
                className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>
          </div>
        </div>

        {/* Payment Options */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wallet className="w-5 h-5 text-zinc-400" />
              <h2 className="text-lg font-semibold">Payment Options</h2>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setSettings({ ...settings, isPaymentEnabled: settings.isPaymentEnabled !== false ? false : true })}
                className={clsx(
                  "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                  settings.isPaymentEnabled !== false ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-600"
                )}
              >
                <span
                  className={clsx(
                    "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                    settings.isPaymentEnabled !== false ? "translate-x-6" : "translate-x-1"
                  )}
                />
              </button>
            </div>
          </div>
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Account Title</label>
                <input
                  type="text"
                  value={settings.accountTitle}
                  onChange={(e) => setSettings({ ...settings, accountTitle: e.target.value })}
                  className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Account Number</label>
                <input
                  type="text"
                  value={settings.accountNumber}
                  onChange={(e) => setSettings({ ...settings, accountNumber: e.target.value })}
                  className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Bank Names & Colors</label>
                <button
                  type="button"
                  onClick={addBankAccount}
                  className="text-sm text-emerald-500 hover:text-emerald-400 flex items-center gap-1"
                >
                  <Plus className="w-4 h-4" /> Add Bank
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {settings.bankAccounts.map((bank) => (
                  <div key={bank.id} className="p-4 bg-zinc-50 dark:bg-zinc-800 rounded-2xl border border-zinc-200 dark:border-zinc-700 space-y-3 relative group">
                    <div className="flex items-center justify-between">
                      <div 
                        style={{ 
                          backgroundColor: bank.labelColor || `${bank.color}1a`,
                          borderColor: bank.labelColor ? 'transparent' : `${bank.color}33`,
                          color: bank.textColor || (bank.labelColor ? '#ffffff' : bank.color)
                        }}
                        className="px-4 py-2 rounded-xl border text-xs font-bold uppercase tracking-wider flex items-center gap-3"
                      >
                        {bank.iconUrl && (
                          <img src={bank.iconUrl} alt="" className="w-4 h-4 object-contain" referrerPolicy="no-referrer" />
                        )}
                        Preview: {bank.name}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeBankAccount(bank.id)}
                        className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                        title="Remove Bank"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={bank.name}
                        onChange={(e) => updateBankAccount(bank.id, 'name', e.target.value)}
                        className="w-full px-3 py-2 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                        placeholder="Bank Name"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={bank.accountTitle || ''}
                          onChange={(e) => updateBankAccount(bank.id, 'accountTitle', e.target.value)}
                          className="w-full px-3 py-2 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                          placeholder="Account Title"
                        />
                        <div className="relative">
                          <input
                            type="text"
                            value={bank.accountNumber || ''}
                            onChange={(e) => updateBankAccount(bank.id, 'accountNumber', e.target.value)}
                            className="w-full px-3 py-2 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none pr-12"
                            placeholder="Account No / IBAN"
                          />
                          {bank.accountNumber && (
                            <div className="absolute right-2 top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-[8px] font-bold uppercase text-zinc-500">
                              {isIBAN(bank.accountNumber) ? 'IBAN' : 'ACC'}
                            </div>
                          )}
                        </div>
                      </div>
                      <input
                        type="text"
                        value={bank.iconUrl || ''}
                        onChange={(e) => updateBankAccount(bank.id, 'iconUrl', e.target.value)}
                        className="w-full px-3 py-2 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                        placeholder="Icon URL (optional)"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase text-zinc-500">Label Color</label>
                          <div className="flex items-center gap-2">
                            <div className="relative w-8 h-8 overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700">
                              <input
                                type="color"
                                value={bank.labelColor || bank.color}
                                onChange={(e) => updateBankAccount(bank.id, 'labelColor', e.target.value)}
                                className="absolute inset-0 w-[200%] h-[200%] -translate-x-1/4 -translate-y-1/4 cursor-pointer"
                              />
                            </div>
                            <span className="text-[10px] text-zinc-500 font-mono uppercase">{bank.labelColor || bank.color}</span>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase text-zinc-500">Text Color</label>
                          <div className="flex items-center gap-2">
                            <div className="relative w-8 h-8 overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700">
                              <input
                                type="color"
                                value={bank.textColor || '#ffffff'}
                                onChange={(e) => updateBankAccount(bank.id, 'textColor', e.target.value)}
                                className="absolute inset-0 w-[200%] h-[200%] -translate-x-1/4 -translate-y-1/4 cursor-pointer"
                              />
                            </div>
                            <span className="text-[10px] text-zinc-500 font-mono uppercase">{bank.textColor || '#ffffff'}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Additional Payment Details</label>
              <textarea
                value={settings.paymentDetails}
                onChange={(e) => setSettings({ ...settings, paymentDetails: e.target.value })}
                rows={4}
                className="w-full px-4 py-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
              />
            </div>
          </div>
        </div>

        {/* Email Notifications & SMTP Setup */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Mail className="w-5 h-5 text-rose-500" />
              <div>
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">Email Notifications & Gmail SMTP</h2>
                <p className="text-xs text-zinc-500">Configure welcome emails and new movie release alerts sent directly to user Gmail addresses.</p>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-6">
            {/* Feature Toggles */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700">
                <div>
                  <h3 className="font-medium text-zinc-900 dark:text-white">Instant Welcome Email</h3>
                  <p className="text-xs text-zinc-500">Automatically send a welcome email when a user joins with their email address.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSettings({
                    ...settings,
                    emailSettings: {
                      ...settings.emailSettings,
                      enableWelcomeEmail: !(settings.emailSettings?.enableWelcomeEmail !== false)
                    }
                  })}
                  className={clsx(
                    "relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0",
                    settings.emailSettings?.enableWelcomeEmail !== false ? "bg-rose-500" : "bg-zinc-300 dark:bg-zinc-600"
                  )}
                >
                  <span
                    className={clsx(
                      "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                      settings.emailSettings?.enableWelcomeEmail !== false ? "translate-x-6" : "translate-x-1"
                    )}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between p-4 bg-zinc-50 dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700">
                <div>
                  <h3 className="font-medium text-zinc-900 dark:text-white">New Movie "Watch Now" Alerts</h3>
                  <p className="text-xs text-zinc-500">Allow sending batch email alerts for new and trending releases.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSettings({
                    ...settings,
                    emailSettings: {
                      ...settings.emailSettings,
                      enableNewContentEmail: !(settings.emailSettings?.enableNewContentEmail !== false)
                    }
                  })}
                  className={clsx(
                    "relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0",
                    settings.emailSettings?.enableNewContentEmail !== false ? "bg-rose-500" : "bg-zinc-300 dark:bg-zinc-600"
                  )}
                >
                  <span
                    className={clsx(
                      "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                      settings.emailSettings?.enableNewContentEmail !== false ? "translate-x-6" : "translate-x-1"
                    )}
                  />
                </button>
              </div>
            </div>

            {/* Resend API Configuration (Primary Anti-Spam Solution) */}
            <div className="p-4 bg-rose-500/5 dark:bg-rose-950/20 rounded-xl border border-rose-500/20 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-rose-900 dark:text-rose-200 text-sm flex items-center gap-2">
                  <Mail className="w-4 h-4 text-rose-500" />
                  Resend API Integration (Recommended to Avoid Spam)
                </h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                  Best Delivery Rate
                </span>
              </div>

              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                Resend uses authenticated DKIM/SPF domain keys. When an API key is entered below, MovizNow uses Resend to send instant notifications directly to user inboxes (preventing Spam folder placement).
              </p>

              <div>
                <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 block mb-1">
                  Resend API Key (starts with <code className="text-rose-500">re_</code>)
                </label>
                <input
                  type="password"
                  value={settings.emailSettings?.resendApiKey || ''}
                  onChange={(e) => setSettings({
                    ...settings,
                    emailSettings: { ...settings.emailSettings, resendApiKey: e.target.value }
                  })}
                  placeholder="re_123456789..."
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg focus:ring-2 focus:ring-rose-500 outline-none font-mono"
                />
                <p className="text-[11px] text-zinc-500 mt-1">
                  Get a free API key at <a href="https://resend.com" target="_blank" rel="noreferrer" className="text-rose-500 hover:underline">resend.com</a> (Includes 3,000 free emails/month).
                </p>

                <div className="mt-3 p-3 bg-amber-500/10 border border-amber-500/20 text-xs rounded-xl text-amber-700 dark:text-amber-400 space-y-1.5">
                  <div className="font-bold flex items-center gap-1.5 text-amber-800 dark:text-amber-300">
                    <AlertCircle className="w-4 h-4 shrink-0 text-amber-500" />
                    Resend Sandbox Domain Restriction Notice
                  </div>
                  <p className="leading-relaxed">
                    By default, when using a newly registered Resend API Key, the platform sends from <code className="font-mono bg-amber-500/15 dark:bg-amber-500/20 px-1 py-0.5 rounded text-amber-600 dark:text-amber-300">onboarding@resend.dev</code>. 
                    This sandbox domain <strong>only</strong> allows sending emails to your own registered Resend account address (e.g. your admin email).
                  </p>
                  <p className="leading-relaxed">
                    To send to actual subscribers and other recipients, you <strong>must verify your custom domain</strong> in your Resend Dashboard and specify that verified email (e.g. <code className="font-mono bg-amber-500/15 dark:bg-amber-500/20 px-1 py-0.5 rounded text-amber-600 dark:text-amber-300">noreply@yourdomain.com</code>) under the <strong>Sender Email Address</strong> field below.
                  </p>
                </div>
              </div>
            </div>

            {/* SMTP Server Configuration */}
            <div className="p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-200 dark:border-zinc-700/80 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-zinc-900 dark:text-white text-sm flex items-center gap-2">
                  <SettingsIcon className="w-4 h-4 text-zinc-400" />
                  SMTP Server Credentials (e.g. Gmail / App Password)
                </h3>
                <span className="text-[11px] text-zinc-400">Works with Gmail, Outlook, Resend, SendGrid, etc.</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 block mb-1">SMTP Host</label>
                  <input
                    type="text"
                    value={settings.emailSettings?.smtpHost || 'smtp.gmail.com'}
                    onChange={(e) => setSettings({
                      ...settings,
                      emailSettings: { ...settings.emailSettings, smtpHost: e.target.value }
                    })}
                    placeholder="smtp.gmail.com"
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg focus:ring-2 focus:ring-rose-500 outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 block mb-1">SMTP Port</label>
                  <input
                    type="number"
                    value={settings.emailSettings?.smtpPort || 587}
                    onChange={(e) => setSettings({
                      ...settings,
                      emailSettings: { ...settings.emailSettings, smtpPort: parseInt(e.target.value) || 587 }
                    })}
                    placeholder="587"
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg focus:ring-2 focus:ring-rose-500 outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 block mb-1">Gmail / SMTP Username</label>
                  <input
                    type="email"
                    value={settings.emailSettings?.smtpUser || ''}
                    onChange={(e) => setSettings({
                      ...settings,
                      emailSettings: { ...settings.emailSettings, smtpUser: e.target.value }
                    })}
                    placeholder="your-email@gmail.com"
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg focus:ring-2 focus:ring-rose-500 outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 block mb-1">Gmail App Password / SMTP Password</label>
                  <input
                    type="password"
                    value={settings.emailSettings?.smtpPass || ''}
                    onChange={(e) => setSettings({
                      ...settings,
                      emailSettings: { ...settings.emailSettings, smtpPass: e.target.value }
                    })}
                    placeholder="xxxx xxxx xxxx xxxx"
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg focus:ring-2 focus:ring-rose-500 outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 block mb-1">Sender Name</label>
                  <input
                    type="text"
                    value={settings.emailSettings?.senderName || 'MovizNow'}
                    onChange={(e) => setSettings({
                      ...settings,
                      emailSettings: { ...settings.emailSettings, senderName: e.target.value }
                    })}
                    placeholder="MovizNow Team"
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg focus:ring-2 focus:ring-rose-500 outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 block mb-1">Sender Email Address</label>
                  <input
                    type="email"
                    value={settings.emailSettings?.senderEmail || ''}
                    onChange={(e) => setSettings({
                      ...settings,
                      emailSettings: { ...settings.emailSettings, senderEmail: e.target.value }
                    })}
                    placeholder="noreply@moviznow.com"
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg focus:ring-2 focus:ring-rose-500 outline-none"
                  />
                </div>
              </div>

              {smtpResult && (
                <div className={clsx(
                  "p-3 rounded-xl text-xs font-medium flex items-center gap-2",
                  smtpResult.success ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20" : "bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20"
                )}>
                  {smtpResult.success ? <Check className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
                  <span>{smtpResult.message}</span>
                </div>
              )}

              <div className="flex items-center justify-between pt-2">
                <p className="text-[11px] text-zinc-500">
                  Tip: For Gmail, create an <strong>App Password</strong> in Google Account Security settings.
                </p>
                <button
                  type="button"
                  onClick={handleTestSmtp}
                  disabled={testingSmtp}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-xl text-xs font-medium transition-colors flex items-center gap-2"
                >
                  {testingSmtp ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
                  {testingSmtp ? "Testing Connection..." : "Test SMTP Connection"}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Admin Tabs Sorting & Visibility */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-2">
            <Layout className="w-5 h-5 text-zinc-400" />
            <h2 className="text-lg font-semibold">Admin Panel Tabs Management</h2>
          </div>
          <div className="p-6 text-sm text-zinc-500 dark:text-zinc-400">
            <p className="mb-6 italic text-amber-600 dark:text-amber-400 flex items-center gap-2">
              <Info className="w-4 h-4" />
              Changes to tab names or removal must be done in code. These settings only handle order and Visibility for regular Admins.
            </p>
            <DragDropContext onDragEnd={onDragEnd}>
              <Droppable droppableId="admin-tabs">
                {(provided) => (
                  <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2">
                    {settings.adminTabsOrder.map((tab, index) => {
                      const isHidden = settings.hiddenAdminTabs?.includes(tab);
                      return (
                        <Draggable key={tab} draggableId={tab} index={index}>
                          {(provided) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              className={clsx(
                                "flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-800 border rounded-xl transition-colors",
                                isHidden ? "border-red-500/30 opacity-75" : "border-zinc-200 dark:border-zinc-700"
                              )}
                            >
                              <div className="flex items-center gap-3">
                                <div {...provided.dragHandleProps}>
                                  <GripVertical className="w-4 h-4 text-zinc-400" />
                                </div>
                                <span className={clsx("font-medium", isHidden && "text-zinc-500")}>{tab}</span>
                              </div>
                              
                              <button
                                type="button"
                                onClick={() => toggleHiddenTab(tab)}
                                className={clsx(
                                  "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                                  isHidden 
                                    ? "bg-red-500/10 text-red-600 hover:bg-red-500/20" 
                                    : "bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20"
                                )}
                              >
                                {isHidden ? (
                                  <>
                                    <EyeOff className="w-3.5 h-3.5" />
                                    Hidden
                                  </>
                                ) : (
                                  <>
                                    <Eye className="w-3.5 h-3.5" />
                                    Visible
                                  </>
                                )}
                              </button>
                            </div>
                          )}
                        </Draggable>
                      );
                    })}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
          </div>
        </div>

        {/* Device & Notifications */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-2">
            <Bell className="w-5 h-5 text-zinc-400" />
            <h2 className="text-lg font-semibold">Device & Notifications</h2>
          </div>
          <div className="p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-zinc-50 dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700">
              <div className="flex items-center gap-4">
                <div className={clsx(
                  "w-12 h-12 rounded-full flex items-center justify-center text-xl shadow-lg",
                  Notification.permission === 'granted' ? "bg-emerald-500/10 text-emerald-500" : "bg-zinc-100 dark:bg-zinc-700 text-zinc-400"
                )}>
                  {Notification.permission === 'granted' ? <Bell className="w-6 h-6" /> : <BellOff className="w-6 h-6" />}
                </div>
                <div>
                  <h3 className="font-bold text-zinc-900 dark:text-white">FCM Status: {Notification.permission}</h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">Manage notification token for this admin device.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={async () => {
                  try {
                    const token = await requestNotificationPermission(true);
                    if (token) setAlertConfig({isOpen: true, title: 'Success', message: 'Token refreshed successfully!'});
                  } catch (e) {
                    setAlertConfig({isOpen: true, title: 'Error', message: 'Error: ' + e});
                  }
                }}
                className="px-6 py-2.5 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-xl font-bold text-sm hover:opacity-90 transition-opacity whitespace-nowrap active:scale-95"
              >
                {Notification.permission === 'granted' ? 'Refresh FCM Token' : 'Register Device'}
              </button>
            </div>
            <p className="text-[10px] text-zinc-500 dark:text-zinc-400 italic">
              * Note: Token refresh is useful if you are not receiving test notifications or if you cleared your browser cache.
            </p>
          </div>
        </div>

        {/* Service Accounts */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-zinc-400" />
            <h2 className="text-lg font-semibold">Service Account Keys</h2>
          </div>
          <div className="p-6 space-y-8">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Configure your Google Cloud Service Account JSON keys. The <strong>Source</strong> key is used for the current database, and you can add multiple <strong>Target</strong> databases for synchronization.
            </p>
            
            {/* Source Key */}
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-bold text-zinc-400 uppercase tracking-wider">Source Account Key (JSON)</label>
                <textarea
                  value={settings.serviceAccounts?.sourceKey || ''}
                  onChange={(e) => setSettings({ 
                    ...settings, 
                    serviceAccounts: { ...(settings.serviceAccounts || {}), sourceKey: e.target.value } 
                  })}
                  rows={4}
                  className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl font-mono text-xs focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
                  placeholder='{ "type": "service_account", ... }'
                />
              </div>
            </div>

            {/* Target Keys */}
            <div className="space-y-6 pt-6 border-t border-zinc-100 dark:border-zinc-800">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider">Target Databases</h3>
                <button
                  type="button"
                  onClick={addTargetAccount}
                  className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 text-emerald-600 rounded-lg text-xs font-bold hover:bg-emerald-500/20 transition-all"
                >
                  <Plus className="w-4 h-4" />
                  Add Target Account
                </button>
              </div>

              <div className="space-y-6">
                {(settings.serviceAccounts?.targets || []).length === 0 ? (
                  <div className="text-center py-8 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl">
                    <Database className="w-8 h-8 text-zinc-300 mx-auto mb-2" />
                    <p className="text-sm text-zinc-400">No target accounts added yet.</p>
                  </div>
                ) : (
                  settings.serviceAccounts?.targets?.map((target) => (
                    <div key={target.id} className="p-6 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-2xl space-y-4 relative group">
                      <button
                        type="button"
                        onClick={() => removeTargetAccount(target.id)}
                        className="absolute top-4 right-4 p-2 text-zinc-400 hover:text-red-500 transition-colors"
                        title="Remove Target"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-zinc-500 uppercase">Custom Title</label>
                          <input
                            type="text"
                            value={target.title}
                            onChange={(e) => updateTargetAccount(target.id, { title: e.target.value })}
                            className="w-full px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                            placeholder="e.g. Production Backup, Secondary DB"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-zinc-500 uppercase">Database ID</label>
                          <input
                            type="text"
                            value={target.databaseId}
                            onChange={(e) => updateTargetAccount(target.id, { databaseId: e.target.value })}
                            className="w-full px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                            placeholder="(default)"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-bold text-zinc-500 uppercase">Service Account Key (JSON)</label>
                        <textarea
                          value={target.key}
                          onChange={(e) => updateTargetAccount(target.id, { key: e.target.value })}
                          rows={4}
                          className="w-full px-4 py-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl font-mono text-xs focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
                          placeholder='{ "type": "service_account", ... }'
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-4">
          <button
            type="submit"
            disabled={saving}
            className="px-8 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50 shadow-lg shadow-emerald-500/20"
          >
            {saving ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Save className="w-5 h-5" />
            )}
            Save All Settings
          </button>
        </div>
      </form>

      <AlertModal
        isOpen={alertConfig.isOpen}
        onClose={() => setAlertConfig(prev => ({ ...prev, isOpen: false }))}
        title={alertConfig.title}
        message={alertConfig.message}
      />
    </div>
  );
}
