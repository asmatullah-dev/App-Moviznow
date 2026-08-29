import React, { useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { isUserExemptFromAds } from '../utils/adUtils';

const CPM_SCRIPTS = [
  'https://pl31081403.profitableratecpmnetwork.com/f0/27/0b/f0270bbaca005a7be1c664c3c0ae0386.js',
  'https://pl31081402.profitableratecpmnetwork.com/99/e7/8b/99e78b0792c97e620e43154c137cd1f3.js',
];

const MONETAG_SCRIPTS = [
  {
    src: 'https://nap5k.com/tag.min.js',
    zone: '11681684'
  },
  {
    src: 'https://n6wxm.com/vignette.min.js',
    zone: '11681786'
  }
];

export const CpmScriptManager: React.FC = () => {
  const { profile } = useAuth();

  useEffect(() => {
    const isExempt = isUserExemptFromAds(profile);

    if (isExempt) {
      // Remove Adsterra scripts if they exist
      CPM_SCRIPTS.forEach(src => {
        const existing = document.querySelector(`script[src="${src}"]`);
        if (existing) {
          existing.remove();
        }
      });

      // Remove Monetag scripts if they exist
      MONETAG_SCRIPTS.forEach(config => {
        const existing = document.querySelector(`script[src="${config.src}"]`);
        if (existing) {
          existing.remove();
        }
      });
      return;
    }

    // Load Adsterra scripts for non-exempt users
    CPM_SCRIPTS.forEach(src => {
      const existing = document.querySelector(`script[src="${src}"]`);
      if (!existing) {
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        document.head.appendChild(script);
      }
    });

    // Load Monetag scripts for non-exempt users
    MONETAG_SCRIPTS.forEach(config => {
      const existing = document.querySelector(`script[src="${config.src}"]`);
      if (!existing) {
        const script = document.createElement('script');
        script.src = config.src;
        script.dataset.zone = config.zone;
        script.async = true;
        document.body.appendChild(script);
      }
    });
  }, [profile]);

  return null;
};
