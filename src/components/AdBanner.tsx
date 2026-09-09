import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Crown } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { isUserExemptFromAds } from '../utils/adUtils';

interface AdBannerProps {
  className?: string;
  content?: { id?: string; status?: string } | null;
  layout?: 'auto' | 'rectangle' | 'leaderboard' | 'skyscraper';
  refreshKey?: string | number;
}

/**
 * AdBanner component:
 * Renders official Google AdSense banner placements with a prominent "Remove Ads (Go VIP)"
 * CTA button header so users can upgrade their account to an ad-free VIP experience.
 * Ad displays are automatically bypassed for VIP members, administrators, and exempt content.
 */
export const AdBanner: React.FC<AdBannerProps> = ({
  className = '',
  content,
  layout = 'auto',
  refreshKey,
}) => {
  const { profile } = useAuth();
  const { settings } = useSettings();
  const adInitRef = useRef<boolean>(false);

  const isExempt = isUserExemptFromAds(profile, content);
  const provider = settings?.adProvider || 'google_adsense';
  const clientId = settings?.adSenseClientId || 'ca-pub-3128773545517669';
  const slotId = settings?.adSenseSlotId || '1035133642';
  const ctaText = (settings?.adBannerCtaText && settings.adBannerCtaText !== 'Go VIP') ? settings.adBannerCtaText : 'Remove Ads (Go VIP)';
  const ctaLink = (settings?.adBannerLink && settings.adBannerLink !== '/top-up') ? settings.adBannerLink : '/plans';

  useEffect(() => {
    if (isExempt || provider === 'disabled' || !clientId) return;

    // Small delay to allow ins tag insertion before push
    const timer = setTimeout(() => {
      try {
        if (typeof window !== 'undefined' && (window as any).adsbygoogle) {
          ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({});
          adInitRef.current = true;
        }
      } catch (err) {
        console.debug('AdSense banner push notice:', err);
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [isExempt, provider, clientId, slotId, refreshKey]);

  if (isExempt || provider === 'disabled') {
    return null;
  }

  return (
    <div className={`w-full overflow-hidden flex flex-col items-center justify-center my-4 ${className}`}>
      <div className="w-full max-w-5xl mx-auto">
        {/* Banner Top Header: Advertisement label + Go VIP button */}
        <div className="flex items-center justify-between px-1.5 mb-1.5 w-full">
          <span className="text-[10px] uppercase tracking-widest text-zinc-400 dark:text-zinc-500 font-bold flex items-center gap-1">
            Advertisement
          </span>
          <Link
            to={ctaLink}
            id="ad-banner-go-vip-btn"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-500 hover:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/25 px-2.5 py-1 rounded-full transition-all active:scale-95 shadow-2xs group"
          >
            <Crown className="w-3.5 h-3.5 text-amber-500 group-hover:scale-110 transition-transform" />
            <span>{ctaText}</span>
          </Link>
        </div>

        {/* AdSense Unit Box */}
        <div className="min-h-[90px] w-full flex items-center justify-center bg-zinc-50 dark:bg-zinc-900/40 rounded-xl border border-zinc-200/60 dark:border-zinc-800/60 p-1">
          <ins
            className="adsbygoogle"
            style={{ display: 'block', width: '100%', minHeight: '90px' }}
            data-ad-client={clientId}
            data-ad-slot={slotId}
            data-ad-format={layout === 'auto' ? 'auto' : layout}
            data-full-width-responsive="true"
          />
        </div>
      </div>
    </div>
  );
};
