import React, { createContext, useContext, useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

import { AppSettings } from '../types';

interface SettingsContextType {
  settings: AppSettings | null;
  loading: boolean;
}

const SettingsContext = createContext<SettingsContextType>({
  settings: null,
  loading: true,
});

export const useSettings = () => useContext(SettingsContext);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<AppSettings | null>(() => {
    const cached = localStorage.getItem('settings_cache');
    return cached ? JSON.parse(cached) : null;
  });
  const [loading, setLoading] = useState(() => !localStorage.getItem('settings_cache'));

  useEffect(() => {
    const docRef = doc(db, 'settings', 'app_settings');
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as AppSettings;
        setSettings(data);
        localStorage.setItem('settings_cache', JSON.stringify(data));
      } else {
        // Default settings if document doesn't exist
        const defaultSettings = {
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
            'Income', 'ErrorLinks', 'ReportedLinks', 'Notifications', 'Requests'
          ]
        };
        setSettings(defaultSettings);
        localStorage.setItem('settings_cache', JSON.stringify(defaultSettings));
      }
      setLoading(false);
    }, (error) => {
      console.error('Error fetching settings:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, loading }}>
      {children}
    </SettingsContext.Provider>
  );
};
