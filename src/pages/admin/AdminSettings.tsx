import { useState, useEffect, useRef } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { db, storage, auth } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { useContent } from '../../contexts/ContentContext';
import { Save, AlertCircle, GripVertical, Plus, Trash2, Layout, Wallet, Phone, Image as ImageIcon, Settings as SettingsIcon, RefreshCw, ShieldCheck, X, Eye, EyeOff, Database } from 'lucide-react';
import { clsx } from 'clsx';
import { Navigate } from 'react-router-dom';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { AppSettings, BankAccount } from '../../types';

export default function AdminSettings() {
  const { profile } = useAuth();
  const { updateSearchIndex } = useContent();
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
    serviceAccounts: {
      sourceKey: '',
      targets: []
    }
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isUpdatingIndex, setIsUpdatingIndex] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const docRef = doc(db, 'settings', 'app_settings');
        const adminDocRef = doc(db, 'admin_settings', 'app_settings');
        const [docSnap, adminDocSnap] = await Promise.all([
          getDoc(docRef),
          getDoc(adminDocRef)
        ]);

        let mergedData: Partial<AppSettings> = {};

        if (docSnap.exists()) {
          mergedData = { ...docSnap.data() };
        }
        
        if (adminDocSnap.exists()) {
          const adminData = adminDocSnap.data();
          if (adminData.serviceAccounts) {
            mergedData.serviceAccounts = adminData.serviceAccounts;
          }
        }

        setSettings({
          ...settings,
          ...mergedData,
          // Ensure arrays exist
          bankAccounts: mergedData.bankAccounts || settings.bankAccounts,
          adminTabsOrder: mergedData.adminTabsOrder || settings.adminTabsOrder,
          hiddenAdminTabs: mergedData.hiddenAdminTabs || [],
          serviceAccounts: mergedData.serviceAccounts || { sourceKey: '', targets: [] }
        });
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
      const { serviceAccounts, ...publicSettings } = settings;
      await Promise.all([
        setDoc(doc(db, 'settings', 'app_settings'), publicSettings),
        setDoc(doc(db, 'admin_settings', 'app_settings'), { serviceAccounts })
      ]);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error('Error saving settings:', err);
      setError('Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateIndex = async () => {
    setIsUpdatingIndex(true);
    try {
      await updateSearchIndex();
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error('Error updating search index:', err);
      setError('Failed to update search index.');
    } finally {
      setIsUpdatingIndex(false);
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
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">App Settings</h1>
          <p className="text-zinc-500 dark:text-zinc-400 mt-1">Manage global application settings</p>
        </div>
        <button
          type="button"
          onClick={handleUpdateIndex}
          disabled={isUpdatingIndex}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-300 text-white rounded-lg transition-colors text-sm font-medium shadow-sm"
        >
          <RefreshCw className={clsx("w-4 h-4", isUpdatingIndex && "animate-spin")} />
          {isUpdatingIndex ? 'Updating Index...' : 'Update Search Index'}
        </button>
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
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Support WhatsApp / Phone Number (e.g. 3363284466)</label>
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

        {/* Payment Settings */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-2">
            <Wallet className="w-5 h-5 text-zinc-400" />
            <h2 className="text-lg font-semibold">Payment Settings</h2>
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

        {/* Admin Tabs Sorting & Visibility */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-2">
            <Layout className="w-5 h-5 text-zinc-400" />
            <h2 className="text-lg font-semibold">Admin Panel Tabs Management</h2>
          </div>
          <div className="p-6">
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">
              Drag and drop to reorder tabs. Use the eye icon to hide/show tabs for regular Admins (Owners always see all tabs).
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
    </div>
  );
}
