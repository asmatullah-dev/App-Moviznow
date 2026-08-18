import React from 'react';
import { clsx } from 'clsx';
import { Tv } from 'lucide-react';
import { getOttBadgeConfig } from '../utils/contentUtils';
import {
  siNetflix,
  siAppletv,
  siCrunchyroll,
  siHbo,
  siParamountplus,
  siRakuten,
  siSony,
  siFubo,
  siTubi,
  siYoutube,
  siGoogleplay,
  siPlex,
  siFox,
  siStarz,
} from 'simple-icons';

interface OttBadgeProps {
  platform?: string | null;
  className?: string;
  isSmall?: boolean;
  showName?: boolean;
  title?: string;
}

// Crisp, original vector logo representations
const getPlatformLogoMeta = (platformKey?: string) => {
  const p = (platformKey || '').toLowerCase();

  if (p.includes('netflix')) {
    return { path: siNetflix.path, viewBox: '0 0 24 24' };
  }
  if (p.includes('amazon') || p.includes('prime')) {
    return {
      path: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 14.5c-3.1 0-5.8-1.5-7.3-3.8.2-.2.5-.2.7 0 1.3 2 3.7 3.3 6.4 3.3 3.5 0 6.5-2.2 7.5-5.3.1-.3.4-.4.7-.3.3.1.4.4.3.7-1.2 3.6-4.7 6.1-8.7 6.1zm5.2-4.8c-.3-.2-.5-.6-.3-.9.1-.2.4-.2.6 0l1.2 1.2c.2.2.2.5 0 .7l-1.2 1.2c-.2.2-.5.2-.7 0-.2-.2-.2-.5 0-.7l.9-.9-.5-.6z',
      viewBox: '0 0 24 24',
    };
  }
  if (p.includes('disney')) {
    return {
      path: 'M11.6 3.2C6.3 3.2 2 7.5 2 12.8s4.3 9.6 9.6 9.6 9.6-4.3 9.6-9.6S16.9 3.2 11.6 3.2zm3.8 13.8h-2.1v-3.7H9.2v-2.1h4.1V7.5h2.1v3.7h3.7v2.1h-3.7v3.7z',
      viewBox: '0 0 24 24',
    };
  }
  if (p.includes('apple')) {
    return { path: siAppletv.path, viewBox: '0 0 24 24' };
  }
  if (p.includes('hbo') || p.includes('max')) {
    return { path: siHbo.path, viewBox: '0 0 24 24' };
  }
  if (p.includes('hulu')) {
    return {
      path: 'M19.5 8.25h-3.375v4.5c0 .938-.75 1.688-1.688 1.688s-1.688-.75-1.688-1.688v-4.5H9.375v5.063c0 2.484 2.016 4.5 4.5 4.5 2.016 0 3.75-1.313 4.313-3.094h.094v2.906H21.75V8.25h-2.25zM4.5 8.25H2.25v9.563H4.5V13.5h3.375V8.25H5.625v3.375H4.5V8.25z',
      viewBox: '0 0 24 24',
    };
  }
  if (p.includes('paramount')) {
    return { path: siParamountplus.path, viewBox: '0 0 24 24' };
  }
  if (p.includes('peacock')) {
    return {
      path: 'M12 2L15 8.5L22 9.5L17 14.5L18.5 21.5L12 18L5.5 21.5L7 14.5L2 9.5L9 8.5L12 2Z',
      viewBox: '0 0 24 24',
    };
  }
  if (p.includes('jiocinema') || p.includes('jio')) {
    return {
      path: 'M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm3.328 17.067h-2.12v-6.9h2.12v6.9zm-1.06-7.833a1.23 1.23 0 1 1 0-2.46 1.23 1.23 0 0 1 0 2.46zM8.732 17.067H6.612V6.933h2.12v10.134z',
      viewBox: '0 0 24 24',
    };
  }
  if (p.includes('zee5')) {
    return {
      path: 'M4 3h16v4.5H9.5v3.2h6.8c2.6 0 4.7 2.1 4.7 4.75v3.8c0 2.6-2.1 4.75-4.7 4.75H4v-4.5h12.3c.2 0 .4-.2.4-.4v-3.8c0-.2-.2-.4-.4-.4H4V3z',
      viewBox: '0 0 24 24',
    };
  }
  if (p.includes('kableone') || p.includes('kable one')) {
    return {
      path: 'M2 4h4v16H2V4zm6 0h4.5l3.5 6 3.5-6H22v16h-4v-8.5l-4 7h-2l-4-7V20H8V4z',
      viewBox: '0 0 24 24',
    };
  }
  if (p.includes('sbs')) {
    return {
      path: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14.5v-9l7 4.5-7 4.5z',
      viewBox: '0 0 24 24',
    };
  }
  if (p.includes('bloodstream')) {
    return {
      path: 'M12 2.5s-6 7.2-6 11.5c0 3.3 2.7 6 6 6s6-2.7 6-6c0-4.3-6-11.5-6-11.5zm0 14c-1.7 0-3-1.3-3-3 0-.8.3-1.5.8-2.1.2-.2.5 0 .4.3-.3.8-.1 1.8.6 2.4.7.6 1.7.7 2.4.3.3-.1.5.2.3.4-.4 1.1-1.3 1.7-2.5 1.7z',
      viewBox: '0 0 24 24',
    };
  }
  if (p.includes('wavve')) {
    return {
      path: 'M2 18l5-12 5 12 5-12 5 12h-3l-3.5-8.5L14 18h-4L6.5 9.5 3.5 18H2z',
      viewBox: '0 0 24 24',
    };
  }
  if (p.includes('kocowa')) {
    return {
      path: 'M3 4h4v7l5-7h5l-6 8 6.5 8h-5L7 11.5V20H3V4z',
      viewBox: '0 0 24 24',
    };
  }
  if (p.includes('philo')) {
    return {
      path: 'M4 4h4.5c2.5 0 4.5 1.8 4.5 4.2 0 1.6-.9 3-2.2 3.7L15 20h-4.5l-3.5-6.5H6.5V20H4V4zm2.5 2.5v4.5h2c1.2 0 2-.8 2-2.2s-.8-2.3-2-2.3h-2z',
      viewBox: '0 0 24 24',
    };
  }
  if (p.includes('xumoplay') || p.includes('xumo')) {
    return {
      path: 'M4 4l6 8-6 8h4.5l3.5-5 3.5 5H20l-6-8 6-8h-4.5L12 9l-3.5-5H4z',
      viewBox: '0 0 24 24',
    };
  }
  if (p.includes('fandangoathome') || p.includes('fandango') || p.includes('vudu')) {
    return {
      path: 'M3 4h10c3.3 0 6 2.7 6 6s-2.7 6-6 6H7v4H3V4zm4 3.5v5h6c1.4 0 2.5-1.1 2.5-2.5S14.4 7.5 13 7.5H7z',
      viewBox: '0 0 24 24',
    };
  }
  if (p.includes('nippontv') || p.includes('nippon')) {
    return {
      path: 'M12 2A10 10 0 1022 12 10 10 0 0012 2zm0 15a5 5 0 115-5 5 5 0 01-5 5z',
      viewBox: '0 0 24 24',
    };
  }
  if (p.includes('hoopla')) {
    return {
      path: 'M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm4.5 13.5h-9v-3h9v3zm0-4h-9v-3h9v3z',
      viewBox: '0 0 24 24',
    };
  }
  if (p.includes('fujitv') || p.includes('fuji')) {
    return {
      path: 'M2 4h18v4H6v3h12v4H6v5H2V4z',
      viewBox: '0 0 24 24',
    };
  }
  if (p.includes('bbcone') || p.includes('bbc')) {
    return {
      path: 'M2 6h6v12H2V6zm7 0h6v12H9V6zm7 0h6v12h-6V6z',
      viewBox: '0 0 24 24',
    };
  }
  if (p.includes('tvn')) {
    return {
      path: 'M3 8h4v8H3V8zm5-4h4v12H8V4zm5 8h4v4h-4v-4zm0-8h4v6h-4V4zm5 0h3v12h-3V4z',
      viewBox: '0 0 24 24',
    };
  }
  if (p.includes('angelstudios') || p.includes('angel')) {
    return {
      path: 'M12 2l2.8 6.2 6.7.6-5 4.5 1.5 6.7-6-3.4-6 3.4 1.5-6.7-5-4.5 6.7-.6L12 2z',
      viewBox: '0 0 24 24',
    };
  }
  if (p.includes('plex')) {
    return { path: siPlex.path, viewBox: '0 0 24 24' };
  }
  if (p.includes('player')) {
    return {
      path: 'M4 4h8c2.8 0 5 2.2 5 5s-2.2 5-5 5H8v6H4V4zm4 3.5v3h4c.8 0 1.5-.7 1.5-1.5S12.8 7.5 12 7.5H8z',
      viewBox: '0 0 24 24',
    };
  }
  if (p.includes('spectrum')) {
    return {
      path: 'M2 4h20v3.5H7v3h13v3.5H7v3h15V20H2V4z',
      viewBox: '0 0 24 24',
    };
  }
  if (p.includes('hungama')) {
    return {
      path: 'M3 4h4v6h6V4h4v16h-4v-6H7v6H3V4z',
      viewBox: '0 0 24 24',
    };
  }
  if (p.includes('gunmatv') || p.includes('gunma')) {
    return {
      path: 'M12 2L2 7v10l10 5 10-5V7L12 2zm0 3.2l6.5 3.3v7l-6.5 3.3-6.5-3.3v-7L12 5.2z',
      viewBox: '0 0 24 24',
    };
  }
  if (p.includes('colors') || p.includes('color')) {
    return {
      path: 'M12 2a10 10 0 100 20 10 10 0 000-20zm0 4a6 6 0 110 12 6 6 0 010-12z',
      viewBox: '0 0 24 24',
    };
  }
  if (p.includes('fox')) {
    return { path: siFox.path, viewBox: '0 0 24 24' };
  }
  if (p.includes('kbs2') || p.includes('kbs')) {
    return {
      path: 'M2 4h11c3.3 0 6 2.2 6 5 0 1.8-.9 3.4-2.3 4.2L20 20h-5l-2.6-5.8H7V20H2V4zm5 3.5v4h5.5c1 0 1.8-.7 1.8-1.8 0-1.2-.8-2.2-1.8-2.2H7z',
      viewBox: '0 0 24 24',
    };
  }
  if (p.includes('mbc')) {
    return {
      path: 'M2 4h4.5l3.5 7 3.5-7H18v16h-4V10.5L10.5 18h-1L6 10.5V20H2V4z',
      viewBox: '0 0 24 24',
    };
  }
  if (p.includes('kutingg')) {
    return {
      path: 'M4 4h4v6.5L13.5 4H19l-6.5 7.5L19 20h-5.5L8 12.5V20H4V4z',
      viewBox: '0 0 24 24',
    };
  }
  if (p.includes('youku')) {
    return {
      path: 'M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm-2.5 13.5v-7l6 3.5-6 3.5z',
      viewBox: '0 0 24 24',
    };
  }
  if (p.includes('hoichoi')) {
    return {
      path: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-2.5 13.5v-7l6 3.5-6 3.5z',
      viewBox: '0 0 24 24',
    };
  }
  if (p.includes('sunnxt') || p.includes('sun nxt')) {
    return {
      path: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14.5v-9l7 4.5-7 4.5z',
      viewBox: '0 0 24 24',
    };
  }
  if (p.includes('googleplay') || p.includes('google play') || p.includes('google tv')) {
    return { path: siGoogleplay.path, viewBox: '0 0 24 24' };
  }
  if (p.includes('shemaroome') || p.includes('shemaroo')) {
    return {
      path: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm3.5 14.5c-1.8 1.8-4.7 1.8-6.5 0l-1.4-1.4c-.4-.4-.4-1 0-1.4s1-.4 1.4 0l1.4 1.4c1 1 2.7 1 3.7 0 1-1 1-2.7 0-3.7l-3.2-3.2c-1.8-1.8-1.8-4.7 0-6.5 1.8-1.8 4.7-1.8 6.5 0l1.4 1.4c.4.4.4 1 0 1.4s-1 .4-1.4 0l-1.4-1.4c-1-1-2.7-1-3.7 0-1 1-1 2.7 0 3.7l3.2 3.2c1.9 1.8 1.9 4.8 0 6.5z',
      viewBox: '0 0 24 24',
    };
  }
  if (p.includes('fubo')) {
    return { path: siFubo.path, viewBox: '0 0 24 24' };
  }
  if (p.includes('brew')) {
    return {
      path: 'M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V6h16v12zM9.5 7.5v9l7-4.5-7-4.5z',
      viewBox: '0 0 24 24',
    };
  }
  if (p.includes('tubi')) {
    return { path: siTubi.path, viewBox: '0 0 24 24' };
  }
  if (p.includes('tencent')) {
    return {
      path: 'M12 2L2 19h20L12 2zm0 4.2l6.5 11.3H5.5L12 6.2zm-1.5 3.3v5l4-2.5-4-2.5z',
      viewBox: '0 0 24 24',
    };
  }
  if (p.includes('watcha')) {
    return {
      path: 'M4 4h16v16H4V4zm3 3v10l8.5-5L7 7z',
      viewBox: '0 0 24 24',
    };
  }
  if (p.includes('tokyomx') || p.includes('tokyo mx')) {
    return {
      path: 'M3 4h18v16H3V4zm3 3v10h12V7H6zm3 2h6v2H9V9zm0 4h6v2H9v-2z',
      viewBox: '0 0 24 24',
    };
  }
  if (p.includes('youtube')) {
    return { path: siYoutube.path, viewBox: '0 0 24 24' };
  }
  if (p.includes('aha')) {
    return {
      path: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-2.5 5.5c.8 0 1.5.7 1.5 1.5v6c0 .8-.7 1.5-1.5 1.5S8 15.8 8 15V9c0-.8.7-1.5 1.5-1.5zm5 0c.8 0 1.5.7 1.5 1.5v6c0 .8-.7 1.5-1.5 1.5s-1.5-.7-1.5-1.5V9c0-.8.7-1.5 1.5-1.5zM9.5 10v4l3.5-2-3.5-2z',
      viewBox: '0 0 24 24',
    };
  }
  if (p.includes('epix') || p.includes('mgm')) {
    return {
      path: 'M12 2L2 12l10 10 10-10L12 2zm-1.5 6.5l5 3.5-5 3.5v-7z',
      viewBox: '0 0 24 24',
    };
  }
  if (p.includes('sonyliv') || p.includes('sony')) {
    return { path: siSony.path, viewBox: '0 0 24 24' };
  }
  if (p.includes('hotstar')) {
    return {
      path: 'M12 1.5l2.9 6.2 6.8.8-5.1 4.7 1.4 6.7-5.9-3.3-5.9 3.3 1.4-6.7-5.1-4.7 6.8-.8z',
      viewBox: '0 0 24 24',
    };
  }
  if (p.includes('crunchyroll')) {
    return { path: siCrunchyroll.path, viewBox: '0 0 24 24' };
  }
  if (p.includes('viki') || p.includes('rakuten')) {
    return { path: siRakuten.path, viewBox: '0 0 24 24' };
  }

  return null;
};

export const RenderOttLogoIcon: React.FC<{
  platformKey?: string;
  isSmall?: boolean;
}> = ({ platformKey, isSmall }) => {
  const pKey = (platformKey || '').toLowerCase();
  const iconSizeClass = isSmall ? 'w-3 h-3' : 'w-4 h-4';

  if (pKey.includes('zee5')) {
    return (
      <img 
        src="https://upload.wikimedia.org/wikipedia/commons/a/a1/Zee5_Logo_2018-2025.svg" 
        alt="ZEE5"
        className={clsx(isSmall ? 'h-3' : 'h-4', 'shrink-0 object-contain w-auto')} 
      />
    );
  }

  if (pKey.includes('globo')) {
    return (
      <svg className={clsx(iconSizeClass, 'shrink-0')} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="10" fill="url(#globo-grad)" />
        <rect x="7" y="7" width="10" height="10" rx="2" fill="#FFFFFF" fillOpacity="0.3" stroke="#FFFFFF" strokeWidth="1" />
        <circle cx="12" cy="12" r="3.2" fill="#FFFFFF" />
        <defs>
          <linearGradient id="globo-grad" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
            <stop stopColor="#0071CE" />
            <stop offset="0.5" stopColor="#F37023" />
            <stop offset="1" stopColor="#E51B24" />
          </linearGradient>
        </defs>
      </svg>
    );
  }

  if (pKey.includes('natgeo') || pKey.includes('national geographic') || pKey.includes('nationalgeographic')) {
    return (
      <svg className={clsx(iconSizeClass, 'shrink-0')} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="5" y="3" width="14" height="18" fill="none" stroke="#FFCC00" strokeWidth="3.5" />
      </svg>
    );
  }

  if (pKey.includes('skyshowtime') || pKey.includes('skyshow')) {
    return (
      <svg className={clsx(iconSizeClass, 'shrink-0')} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="9" fill="url(#skyshow-grad)" />
        <path d="M12 6l1.3 3.2L16 9.8l-2.2 2.3.6 3.3L12 13.8l-2.4 1.6.6-3.3L8 9.8l2.7-.6L12 6z" fill="#FFFFFF" />
        <defs>
          <linearGradient id="skyshow-grad" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
            <stop stopColor="#003B95" />
            <stop offset="0.5" stopColor="#632CA6" />
            <stop offset="1" stopColor="#E31C79" />
          </linearGradient>
        </defs>
      </svg>
    );
  }

  if (pKey.includes('gmm')) {
    return (
      <svg className={clsx(iconSizeClass, 'shrink-0')} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="24" height="24" rx="5" fill="#00529C" />
        <text x="12" y="15.5" textAnchor="middle" fill="#FFFFFF" fontSize="10" fontWeight="900" fontFamily="sans-serif">25</text>
      </svg>
    );
  }

  if (pKey.includes('one31') || pKey.includes('one 31')) {
    return (
      <svg className={clsx(iconSizeClass, 'shrink-0')} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="24" height="24" rx="5" fill="#D3122A" />
        <text x="12" y="15.5" textAnchor="middle" fill="#FFFFFF" fontSize="10" fontWeight="900" fontFamily="sans-serif">31</text>
      </svg>
    );
  }

  if (pKey.includes('starz')) {
    return (
      <svg className={clsx(iconSizeClass, 'shrink-0 fill-current')} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d={siStarz.path} />
      </svg>
    );
  }

  if (pKey.includes('vod') || pKey.includes('rental')) {
    return (
      <svg className={clsx(iconSizeClass, 'shrink-0')} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="2" y="5" width="20" height="14" rx="3" fill="#D97706" stroke="#F59E0B" strokeWidth="1" />
        <polygon points="10,8 16,12 10,16" fill="#FFFFFF" />
      </svg>
    );
  }

  if (pKey.includes('freeform')) {
    return (
      <svg className={clsx(iconSizeClass, 'shrink-0')} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="24" height="24" rx="5" fill="#00A8B5" />
        <path d="M6 6h11v3.5H10v3h5v3.5h-5V20H6V6z" fill="#FFFFFF" />
      </svg>
    );
  }

  const meta = getPlatformLogoMeta(platformKey);

  if (!meta) {
    return <Tv className={clsx(iconSizeClass, 'shrink-0 opacity-90')} />;
  }

  return (
    <svg
      className={clsx(iconSizeClass, 'shrink-0 fill-current')}
      viewBox={meta.viewBox}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d={meta.path} />
    </svg>
  );
};

export const OttBadge: React.FC<OttBadgeProps> = ({
  platform,
  className,
  isSmall = false,
  showName = true,
  title,
}) => {
  const config = getOttBadgeConfig(platform);
  if (!config) return null;

  return (
    <div
      className={clsx(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md font-black uppercase tracking-wider shadow-md border backdrop-blur-md select-none truncate max-w-full',
        config.bg,
        isSmall ? 'text-[8px] gap-1 px-1.5 py-0.2' : 'text-[10px]',
        className
      )}
      title={title || config.name}
    >
      <RenderOttLogoIcon platformKey={config.key || platform || ''} isSmall={isSmall} />
      {showName && <span className="truncate">{config.name}</span>}
    </div>
  );
};
