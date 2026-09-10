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

const DEFAULT_BANNER_KEY = '37fefa62ab23d5571ac1b29359968b26';
const DEFAULT_BANNER_SCRIPT = 'https://commercialhalftime.com/37fefa62ab23d5571ac1b29359968b26/invoke.js';

/**
 * AdBanner component:
 * Renders the 300x250 iframe banner ad (CommercialHalftime / atOptions)
 * with a prominent "Remove Ads (Go VIP)" CTA button header so users can upgrade to VIP.
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
  const provider = settings?.adProvider || 'commercialhalftime';
  const clientId = settings?.adSenseClientId || 'ca-pub-3128773545517669';
  const slotId = settings?.adSenseSlotId || '1035133642';
  const ctaText = (settings?.adBannerCtaText && settings.adBannerCtaText !== 'Go VIP') ? settings.adBannerCtaText : 'Remove Ads (Go VIP)';
  const ctaLink = (settings?.adBannerLink && settings.adBannerLink !== '/top-up') ? settings.adBannerLink : '/plans';

  const bannerKey = settings?.bannerAdKey || DEFAULT_BANNER_KEY;
  const bannerScriptUrl = settings?.bannerAdScriptUrl || DEFAULT_BANNER_SCRIPT;
  const bannerWidth = settings?.bannerAdWidth || 300;
  const bannerHeight = settings?.bannerAdHeight || 250;

  useEffect(() => {
    if (isExempt || provider === 'disabled') return;

    if (provider === 'google_adsense' && clientId) {
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
    }
  }, [isExempt, provider, clientId, slotId, refreshKey]);

  if (isExempt || provider === 'disabled') {
    return null;
  }

  // Generate self-contained HTML for the 300x250 banner ad
  const iframeDoc = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      background: transparent;
      display: flex;
      justify-content: center;
      align-items: center;
      overflow: hidden;
    }
  </style>
</head>
<body>
  <script type="text/javascript">
    atOptions = {
      'key' : '${bannerKey}',
      'format' : 'iframe',
      'height' : ${bannerHeight},
      'width' : ${bannerWidth},
      'params' : {}
    };
  </script>
  <script type="text/javascript" src="${bannerScriptUrl}"></script>
</body>
</html>`;

  return (
    <div className={`w-full overflow-hidden flex flex-col items-center justify-center my-4 ${className}`} data-ad-banner="true">
      <div className="w-full max-w-5xl mx-auto flex flex-col items-center">
        {/* Banner Top Header: Advertisement label + Go VIP button */}
        <div className="flex items-center justify-between px-1.5 mb-2 w-full max-w-[340px] sm:max-w-md">
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

        {/* Banner Ad Display Container */}
        {provider === 'google_adsense' ? (
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
        ) : (
          <div className="min-h-[250px] w-full max-w-[340px] sm:max-w-md flex items-center justify-center bg-zinc-50 dark:bg-zinc-900/40 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 p-2 shadow-xs">
            <iframe
              key={`banner-${bannerKey}-${refreshKey || '0'}`}
              title="Advertisement Banner"
              srcDoc={iframeDoc}
              width={bannerWidth}
              height={bannerHeight}
              className="border-0 overflow-hidden mx-auto block rounded-lg max-w-full"
              scrolling="no"
              frameBorder="0"
            />
          </div>
        )}
      </div>
    </div>
  );
};
