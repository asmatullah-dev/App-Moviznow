import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db, runWithNetwork } from '../firebase';
import { getChunkMeta } from '../utils/chunkMeta';

import { AppSettings } from '../types';

interface SettingsContextType {
  settings: AppSettings | null;
  loading: boolean;
  refreshSettings: (force?: boolean) => Promise<void>;
}

const SettingsContext = createContext<SettingsContextType>({
  settings: null,
  loading: true,
  refreshSettings: async () => {},
});

export const useSettings = () => useContext(SettingsContext);

const DEFAULT_APP_SETTINGS: AppSettings = {
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
  isTrialEnabled: true,
  isVipTrialEnabled: true,
  isPhoneLoginEnabled: true,
  isAdminContactEnabled: true,
  isPaymentEnabled: true,
  bankAccounts: [
    { id: '1', name: 'Easypaisa', accountNumber: '', accountTitle: '', color: '#00c652', labelColor: '#00c652', textColor: '#ffffff', iconUrl: '' },
    { id: '2', name: 'JazzCash', accountNumber: '', accountTitle: '', color: '#ed1c24', labelColor: '#ed1c24', textColor: '#ffffff', iconUrl: '' },
    { id: '3', name: 'NayaPay', accountNumber: '', accountTitle: '', color: '#ff6b00', labelColor: '#ff6b00', textColor: '#ffffff', iconUrl: '' },
    { id: '4', name: 'SadaPay', accountNumber: '', accountTitle: '', color: '#00e6b8', labelColor: '#00e6b8', textColor: '#ffffff', iconUrl: '' }
  ],
  adminTabsOrder: [
    'Dashboard', 'Analytics', 'Orders', 'Content', 'Users', 
    'UserManagers', 'SelectedContent', 
    'Income', 'ErrorLinks', 'ReportedLinks', 'Notifications', 'Requests'
  ],
  adProvider: 'both',
  adSenseClientId: 'ca-pub-3128773545517669',
  adSenseSlotId: '1035133642',
  adBannerTitle: 'MovizNow Premium Sponsor',
  adBannerDescription: 'Enjoy high quality streaming on Basic Plan. Upgrade to VIP to remove all ads!',
  adBannerCtaText: 'Remove Ads (Go VIP)',
  adBannerLink: '/top-up',
  adSkipTimer: 5,
  adVideoUrl: 'https://assets.mixkit.co/videos/preview/mixkit-popcorn-machine-in-action-close-up-42289-large.mp4',
  adRedirectUrl: 'https://moviznow.app/premium',
};

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const cached = localStorage.getItem('cached_app_settings');
      return cached ? JSON.parse(cached) : DEFAULT_APP_SETTINGS;
    } catch {
      return DEFAULT_APP_SETTINGS;
    }
  });
  const [loading, setLoading] = useState(false);

  const refreshSettings = useCallback(async (force: boolean = false) => {
    try {
      const meta = await getChunkMeta(force);
      const serverVersion = meta.settings || 0;
      const localVersion = parseInt(localStorage.getItem('cached_settings_version') || '0', 10);

      if (force || !localStorage.getItem('cached_app_settings') || serverVersion > localVersion) {
        const docRef = doc(db, 'settings', 'app_settings');
        const docSnap = await runWithNetwork(() => getDoc(docRef));
        
        if (docSnap.exists()) {
          const data = docSnap.data() as AppSettings;
          setSettings(data);
          localStorage.setItem('cached_app_settings', JSON.stringify(data));
          localStorage.setItem('cached_settings_version', serverVersion.toString());
        } else if (!localStorage.getItem('cached_app_settings')) {
          setSettings(DEFAULT_APP_SETTINGS);
          localStorage.setItem('cached_app_settings', JSON.stringify(DEFAULT_APP_SETTINGS));
          localStorage.setItem('cached_settings_version', Date.now().toString());
        }
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshSettings();
  }, [refreshSettings]);

  return (
    <SettingsContext.Provider value={{ settings, loading, refreshSettings }}>
      {children}
    </SettingsContext.Provider>
  );
};
