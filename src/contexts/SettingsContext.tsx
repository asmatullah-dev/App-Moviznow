import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db, runWithNetwork } from '../firebase';
import { getChunkMeta, parseVersionTime, getUtcVersion } from '../utils/chunkMeta';
import { safeStorage } from '../utils/safeStorage';

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
  supportNumber: '3416286423',
  accountTitle: 'Asmat Ullah',
  accountNumber: '03416286423',
  isTrialEnabled: true,
  isVipTrialEnabled: true,
  isPhoneLoginEnabled: true,
  isAdminContactEnabled: true,
  isPaymentEnabled: true,
  bankAccounts: [
    { id: '1', name: 'Easypaisa', accountNumber: '', accountTitle: '', color: '#00c652', labelColor: '#00c652', textColor: '#ffffff', iconUrl: '', allowAutoApproval: true },
    { id: '2', name: 'JazzCash', accountNumber: '', accountTitle: '', color: '#ed1c24', labelColor: '#ed1c24', textColor: '#ffffff', iconUrl: '', allowAutoApproval: true },
    { id: '3', name: 'NayaPay', accountNumber: '', accountTitle: '', color: '#ff6b00', labelColor: '#ff6b00', textColor: '#ffffff', iconUrl: '', allowAutoApproval: true },
    { id: '4', name: 'SadaPay', accountNumber: '', accountTitle: '', color: '#00e6b8', labelColor: '#00e6b8', textColor: '#ffffff', iconUrl: '', allowAutoApproval: true }
  ],
  adminTabsOrder: [
    'Dashboard', 'Analytics', 'Orders', 'Content', 'Users', 
    'UserManagers', 'SelectedContent', 
    'Income', 'ErrorLinks', 'ReportedLinks', 'Notifications', 'Requests'
  ],
  adProvider: 'commercialhalftime',
  adSenseClientId: 'ca-pub-3128773545517669',
  adSenseSlotId: '1035133642',
  bannerAdKey: '37fefa62ab23d5571ac1b29359968b26',
  bannerAdScriptUrl: 'https://commercialhalftime.com/37fefa62ab23d5571ac1b29359968b26/invoke.js',
  bannerAdWidth: 300,
  bannerAdHeight: 250,
  adBannerTitle: 'MovizNow Sponsor',
  adBannerDescription: 'Enjoy streaming on Basic Plan. Upgrade to VIP to remove all ads!',
  adBannerCtaText: 'Remove Ads (Go VIP)',
  adBannerLink: '/plans',
  adSkipTimer: 5,
  adVideoUrl: '',
  adRedirectUrl: '',
  whatsappChannelLink: 'https://whatsapp.com/channel/0029Vb7PxRC9MF96ZZVGdx2n',
  whatsappClipsLink: 'https://chat.whatsapp.com/DJvn1Vssg8pCC6JTosnOQQ',
};

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const cached = localStorage.getItem('cached_app_settings');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed) {
          if (parsed.supportNumber === '3363284466' || parsed.supportNumber === '03363284466') {
            parsed.supportNumber = '3416286423';
          }
          if (!parsed.whatsappChannelLink) {
            parsed.whatsappChannelLink = 'https://whatsapp.com/channel/0029Vb7PxRC9MF96ZZVGdx2n';
          }
          if (!parsed.whatsappClipsLink) {
            parsed.whatsappClipsLink = 'https://chat.whatsapp.com/DJvn1Vssg8pCC6JTosnOQQ';
          }
          if (!parsed.adBannerLink || parsed.adBannerLink === '/top-up') {
            parsed.adBannerLink = '/plans';
          }
          if (!parsed.bannerAdKey) {
            parsed.bannerAdKey = '37fefa62ab23d5571ac1b29359968b26';
          }
          if (!parsed.bannerAdScriptUrl) {
            parsed.bannerAdScriptUrl = 'https://commercialhalftime.com/37fefa62ab23d5571ac1b29359968b26/invoke.js';
          }
          if (!parsed.bannerAdWidth) {
            parsed.bannerAdWidth = 300;
          }
          if (!parsed.bannerAdHeight) {
            parsed.bannerAdHeight = 250;
          }
          if (parsed.adProvider === 'both' || parsed.adProvider === 'interstitial_only') {
            parsed.adProvider = 'commercialhalftime';
          }
          parsed.adVideoUrl = '';
          localStorage.setItem('cached_app_settings', JSON.stringify(parsed));
        }
        return parsed || DEFAULT_APP_SETTINGS;
      }
      return DEFAULT_APP_SETTINGS;
    } catch {
      return DEFAULT_APP_SETTINGS;
    }
  });
  const [loading, setLoading] = useState(() => {
    try {
      return !localStorage.getItem('cached_app_settings');
    } catch {
      return false;
    }
  });

  const refreshSettings = useCallback(async (force: boolean = false) => {
    try {
      // If offline, rely completely on local settings cache and do not stall
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setLoading(false);
        return;
      }

      // Guest users (unauthenticated) have no access or connection to Firestore!
      if (!auth.currentUser) {
        const cached = safeStorage.getItem('cached_app_settings') || localStorage.getItem('cached_app_settings');
        if (cached) {
          try {
            setSettings(JSON.parse(cached));
          } catch {}
        } else {
          setSettings(DEFAULT_APP_SETTINGS);
        }
        setLoading(false);
        return;
      }

      const hasCachedSettings = !!(safeStorage.getItem('cached_app_settings') || localStorage.getItem('cached_app_settings'));

      // Check chunk_meta version. Bypasses 15s cooldown if force is true.
      const meta = await getChunkMeta(force);
      const serverSettingsVer = meta?.settings;
      const localSettingsVer = safeStorage.getItem('cached_settings_version') || localStorage.getItem('cached_settings_version');

      const serverVersionTime = parseVersionTime(serverSettingsVer);
      const localVersionTime = parseVersionTime(localSettingsVer);

      // Only fetch settings document when chunk meta version change is detected (or first load without cache)
      const isVersionChanged = serverVersionTime > 0 && serverVersionTime > localVersionTime;
      const shouldFetchDoc = !hasCachedSettings || isVersionChanged;

      if (!shouldFetchDoc) {
        setLoading(false);
        return;
      }

      const docRef = doc(db, 'settings', 'app_settings');
      // Direct fetch with a safety timeout so slow networks do not indefinitely hang
      const fetchPromise = runWithNetwork(() => getDoc(docRef));
      const timeoutMs = force ? 6000 : 4000;
      const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs));
      
      const docSnap = await Promise.race([fetchPromise, timeoutPromise]);
      
      if (docSnap && docSnap.exists()) {
        const data = docSnap.data() as AppSettings;
        if (data) {
          if (data.supportNumber === '3363284466' || data.supportNumber === '03363284466') {
            data.supportNumber = '3416286423';
          }
          if (!data.whatsappChannelLink) {
            data.whatsappChannelLink = 'https://whatsapp.com/channel/0029Vb7PxRC9MF96ZZVGdx2n';
          }
          if (!data.whatsappClipsLink) {
            data.whatsappClipsLink = 'https://chat.whatsapp.com/DJvn1Vssg8pCC6JTosnOQQ';
          }
        }
        setSettings(data);
        const serialized = JSON.stringify(data);
        localStorage.setItem('cached_app_settings', serialized);
        safeStorage.setItem('cached_app_settings', serialized);

        const serverVersionStr = typeof serverSettingsVer === 'object' 
          ? (serverSettingsVer?.updatedAt || serverSettingsVer?.version || getUtcVersion()) 
          : (serverSettingsVer ? serverSettingsVer.toString() : getUtcVersion());
        localStorage.setItem('cached_settings_version', serverVersionStr);
        safeStorage.setItem('cached_settings_version', serverVersionStr);
        
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('settings_refreshed', { detail: data }));
        }
      } else if (!hasCachedSettings) {
        setSettings(DEFAULT_APP_SETTINGS);
        const defSerialized = JSON.stringify(DEFAULT_APP_SETTINGS);
        localStorage.setItem('cached_app_settings', defSerialized);
        safeStorage.setItem('cached_app_settings', defSerialized);
        localStorage.setItem('cached_settings_version', getUtcVersion());
        safeStorage.setItem('cached_settings_version', getUtcVersion());
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshSettings();

    // Refresh when user transitions from guest to authenticated
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        refreshSettings();
      }
    });

    const handleSettingsUpdated = (e: any) => {
      if (e?.detail) {
        setSettings(e.detail);
        try {
          const serialized = JSON.stringify(e.detail);
          localStorage.setItem('cached_app_settings', serialized);
          safeStorage.setItem('cached_app_settings', serialized);
        } catch {}
      }
    };
    window.addEventListener('settings_updated', handleSettingsUpdated);
    return () => {
      unsubscribeAuth();
      window.removeEventListener('settings_updated', handleSettingsUpdated);
    };
  }, [refreshSettings]);

  return (
    <SettingsContext.Provider value={{ settings, loading, refreshSettings }}>
      {children}
    </SettingsContext.Provider>
  );
};
