import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, Crown } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { isUserExemptFromAds, isAdRestrictedRoute } from '../utils/adUtils';

interface AdBannerProps {
  className?: string;
  content?: { status?: string } | null;
  layout?: 'auto' | 'rectangle' | 'leaderboard' | 'skyscraper';
}

interface BannerConfig {
  key: string;
  width: number;
  height: number;
}

const BANNER_CONFIGS: Record<string, BannerConfig> = {
  leaderboard_728: {
    key: 'c3b2330b7c7569593b5ba1ed74955a91',
    width: 728,
    height: 90,
  },
  banner_468: {
    key: 'bc46a083398bb54a03b2b6f86fb88623',
    width: 468,
    height: 60,
  },
  rectangle_300: {
    key: '37fefa62ab23d5571ac1b29359968b26',
    width: 300,
    height: 250,
  },
  mobile_320: {
    key: 'd9dd52f202fb4fca75e8b5bd077aaa3f',
    width: 320,
    height: 50,
  },
  skyscraper_600: {
    key: '9e5670b0f9ed7d2ed6a78f099e33e470',
    width: 160,
    height: 600,
  },
  skyscraper_300: {
    key: 'a81513835c9bfebc6e68eaf16e9414f0',
    width: 160,
    height: 300,
  },
};

export const AdBanner: React.FC<AdBannerProps> = ({ 
  className = '', 
  content,
  layout = 'auto'
}) => {
  const { profile } = useAuth();
  const { settings } = useSettings();
  const location = useLocation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(() => {
    if (typeof window !== 'undefined') return window.innerWidth;
    return 768;
  });

  const isRestricted = isAdRestrictedRoute(location.pathname);
  const isExempt = isUserExemptFromAds(profile, content);
  const provider = settings?.adProvider || 'both';

  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) {
          setContainerWidth(entry.contentRect.width);
        }
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  if (isRestricted || isExempt || provider === 'disabled') {
    return null;
  }

  // Determine optimal banner configuration based on layout and current width
  let selectedConfig: BannerConfig = BANNER_CONFIGS.rectangle_300;

  if (layout === 'skyscraper') {
    selectedConfig = containerWidth >= 400 ? BANNER_CONFIGS.skyscraper_600 : BANNER_CONFIGS.skyscraper_300;
  } else if (layout === 'leaderboard') {
    if (containerWidth >= 760) {
      selectedConfig = BANNER_CONFIGS.leaderboard_728;
    } else if (containerWidth >= 500) {
      selectedConfig = BANNER_CONFIGS.banner_468;
    } else {
      selectedConfig = BANNER_CONFIGS.mobile_320;
    }
  } else {
    // Auto responsive selection matching container dimensions
    if (containerWidth >= 760) {
      selectedConfig = BANNER_CONFIGS.leaderboard_728; // Desktop wide
    } else if (containerWidth >= 500) {
      selectedConfig = BANNER_CONFIGS.banner_468; // Tablet / medium
    } else if (containerWidth >= 330) {
      selectedConfig = BANNER_CONFIGS.rectangle_300; // Standard Mobile (highest eCPM)
    } else {
      selectedConfig = BANNER_CONFIGS.mobile_320; // Small phone slim banner
    }
  }

  const title = settings?.adBannerTitle || 'MovizNow Premium Sponsor';
  const description = settings?.adBannerDescription || 'Enjoy high quality streaming on Basic Plan. Upgrade to VIP to remove all ads!';
  const ctaText = settings?.adBannerCtaText || 'Remove Ads (Go VIP)';
  const ctaLink = settings?.adBannerLink || '/top-up';

  const adHtmlDoc = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { 
            display: flex; 
            justify-content: center; 
            align-items: center; 
            background: transparent; 
            overflow: hidden;
            width: 100%;
            height: 100%;
          }
        </style>
      </head>
      <body>
        <script type="text/javascript">
          atOptions = {
            'key' : '${selectedConfig.key}',
            'format' : 'iframe',
            'height' : ${selectedConfig.height},
            'width' : ${selectedConfig.width},
            'params' : {}
          };
        </script>
        <script type="text/javascript" src="https://commercialhalftime.com/${selectedConfig.key}/invoke.js"></script>
      </body>
    </html>
  `;

  return (
    <div 
      ref={containerRef}
      className={`relative overflow-hidden rounded-2xl bg-gradient-to-r from-sky-950/80 via-indigo-950/80 to-purple-950/80 border border-sky-500/30 p-4 shadow-lg text-white my-4 ${className}`}
    >
      {/* Upper Label Tag */}
      <div className="absolute top-2 right-2 text-[9px] font-extrabold uppercase px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 tracking-wider z-10">
        Sponsored Ad
      </div>

      <div className="flex flex-col gap-4">
        {/* Dynamic Responsive Banner Container */}
        <div 
          className="w-full overflow-hidden flex justify-center items-center bg-black/20 rounded-xl py-2"
          style={{ minHeight: `${selectedConfig.height + 16}px` }}
        >
          <iframe
            key={`${selectedConfig.key}-${selectedConfig.width}-${selectedConfig.height}`}
            srcDoc={adHtmlDoc}
            width={selectedConfig.width}
            height={selectedConfig.height}
            title={`${selectedConfig.width}x${selectedConfig.height} Advertisement Banner`}
            className="border-0 overflow-hidden max-w-full"
            scrolling="no"
          />
        </div>

        {/* Custom Premium Ad Banner content */}
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
