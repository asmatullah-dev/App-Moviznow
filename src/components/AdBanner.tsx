import React, { useEffect, useRef } from 'react';
import { Sparkles, Crown } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { isUserExemptFromAds } from '../utils/adUtils';

interface AdBannerProps {
  className?: string;
}

export const AdBanner: React.FC<AdBannerProps> = ({ className = '' }) => {
  const { profile } = useAuth();
  const { settings } = useSettings();
  const adInitedRef = useRef(false);

  const isExempt = isUserExemptFromAds(profile);
  const provider = settings?.adProvider || 'both';

  useEffect(() => {
    if (isExempt || provider === 'disabled') return;
    if (provider !== 'google_adsense' && provider !== 'both') return;
    if (adInitedRef.current) return;

    const client = settings?.adSenseClientId || 'ca-pub-3128773545517669';
    
    // Check if script already exists
    const script = document.querySelector(`script[src*="adsbygoogle.js"]`);
    if (!script) {
      const newScript = document.createElement('script');
      newScript.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}`;
      newScript.async = true;
      newScript.crossOrigin = 'anonymous';
      document.head.appendChild(newScript);
    }

    try {
      // @ts-ignore
      (window.adsbygoogle = window.adsbygoogle || []).push({});
      adInitedRef.current = true;
    } catch (e) {
      console.warn('AdSense push failed (expected in sandbox/preview):', e);
    }
  }, [isExempt, provider, settings?.adSenseClientId]);

  if (isExempt || provider === 'disabled') {
    return null;
  }

  const clientId = settings?.adSenseClientId || 'ca-pub-3940256099942544';
  const slotId = settings?.adSenseSlotId || '1035133642';

  const title = settings?.adBannerTitle || 'MovizNow Premium Sponsor';
  const description = settings?.adBannerDescription || 'Enjoy high quality streaming on Basic Plan. Upgrade to VIP to remove all ads!';
  const ctaText = settings?.adBannerCtaText || 'Remove Ads (Go VIP)';
  const ctaLink = settings?.adBannerLink || '/top-up';

  return (
    <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-r from-sky-950/80 via-indigo-950/80 to-purple-950/80 border border-sky-500/30 p-4 shadow-lg text-white my-4 ${className}`}>
      {/* Upper Label Tag */}
      <div className="absolute top-2 right-2 text-[9px] font-extrabold uppercase px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 tracking-wider">
        Sponsored Ad
      </div>

      <div className="flex flex-col gap-4">
        {/* AdSense Unit (Only if adProvider is google_adsense or both) */}
        {(provider === 'google_adsense' || provider === 'both') && (
          <div className="w-full overflow-hidden flex justify-center bg-black/10 rounded-xl py-1" style={{ minHeight: '90px' }}>
            <ins
              className="adsbygoogle"
              style={{ display: 'block', width: '100%', minWidth: '250px', maxHeight: '120px' }}
              data-ad-client={clientId}
              data-ad-slot={slotId}
              data-ad-format="horizontal"
              data-full-width-responsive="true"
            ></ins>
          </div>
        )}

        {/* Custom Premium Ad Banner content (Always shown as main or fallback info card) */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-500 flex items-center justify-center shrink-0 shadow-md">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h4 className="font-extrabold text-sm text-white flex items-center gap-1.5">
                <span>{title}</span>
              </h4>
              <p className="text-xs text-sky-200/90 mt-0.5 font-medium leading-relaxed max-w-xl">
                {description}
              </p>
            </div>
          </div>

          <Link
            to={ctaLink}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white font-bold text-xs shadow-md transition-transform active:scale-95 shrink-0"
          >
            <Crown className="w-3.5 h-3.5" />
            <span>{ctaText}</span>
          </Link>
        </div>
      </div>
    </div>
  );
};
