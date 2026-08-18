import { Content, Season } from '../types';

export const isRomanized = (s: string) => !/[^\x00-\u024F\u1E00-\u1EFF\u2000-\u206F]/.test(s);

export const formatContentTitle = (content: Content) => {
  const hasDistinctSecondTitle = content.secondTitle && content.secondTitle.toLowerCase() !== content.title.toLowerCase() && isRomanized(content.secondTitle);
  const baseTitle = hasDistinctSecondTitle ? `${content.title} (${content.secondTitle})` : content.title;

  if (content.type === 'movie') {
    return baseTitle;
  }

  // Use the pre-formatted seasonsCountText from search index if available and seasons are not loaded
  if (!content.seasons && (content as any).seasonsCountText) {
    return `${baseTitle} (${(content as any).seasonsCountText})`;
  }

  if (!content.seasons) {
    return baseTitle;
  }

  try {
    const seasons: Season[] = Array.isArray(content.seasons) ? content.seasons : JSON.parse(content.seasons || '[]');
    
    if (seasons.length === 0) return baseTitle;

    if (seasons.length === 1) {
      const season = seasons[0];
      const episodes = season.episodes || [];
      const lastEpisode = episodes.length > 0 
        ? Math.max(...episodes.map(e => e.episodeNumber))
        : 0;
      
      if (lastEpisode > 0) {
        return `${baseTitle} (Season ${season.seasonNumber} Episode ${lastEpisode})`;
      }
      return `${baseTitle} (Season ${season.seasonNumber})`;
    } else if (seasons.length === 2) {
      const seasonNumbers = seasons
        .map(s => s.seasonNumber)
        .sort((a, b) => a - b);
      return `${baseTitle} (Season ${seasonNumbers.join(',')})`;
    } else {
      const seasonNumbers = seasons
        .map(s => s.seasonNumber)
        .sort((a, b) => a - b);
      const min = seasonNumbers[0];
      const max = seasonNumbers[seasonNumbers.length - 1];
      return `${baseTitle} (Season ${min}-${max})`;
    }
  } catch (e) {
    return baseTitle;
  }
};

export const formatReleaseDate = (dateString?: string) => {
  if (!dateString) return '';
  const parts = dateString.split('-');
  if (parts.length === 3) {
    // Check if first part is a 4-digit year (YYYY-MM-DD)
    if (parts[0].length === 4) {
      const [year, month, day] = parts;
      return `${day}-${month}-${year}`;
    }
  }
  return dateString;
};

export const formatRuntime = (runtime?: string) => {
  if (!runtime) return '';
  
  // Check if runtime is in H:MM or HH:MM format
  const timeMatch = runtime.match(/^(\d{1,2}):(\d{2})$/);
  if (timeMatch) {
    const hours = parseInt(timeMatch[1], 10);
    const minutes = parseInt(timeMatch[2], 10);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }

  let totalMinutes = 0;
  let isEpisode = runtime.toLowerCase().includes('/episode');
  
  // Check if it's already in Xh XXm format or similar
  const hMatch = runtime.match(/(\d+)\s*h/i);
  const mMatch = runtime.match(/(\d+)\s*m(in|ins)?\b/i);
  
  if (hMatch || mMatch) {
    if (hMatch) totalMinutes += parseInt(hMatch[1], 10) * 60;
    if (mMatch) totalMinutes += parseInt(mMatch[1], 10);
  } else {
    // Just a number
    const numMatch = runtime.match(/^(\d+)$/);
    if (numMatch) {
      totalMinutes = parseInt(numMatch[1], 10);
    }
  }
  
  if (totalMinutes > 0) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    let result = '';
    if (hours > 0) {
      result = `${hours}h ${minutes}m`;
    } else {
      result = `${minutes}m`;
    }
    return isEpisode ? `${result}/episode` : result;
  }

  return runtime;
};

export const formatDateToMonthDDYYYY = (dateString?: string) => {
  if (!dateString) return '';
  
  const parts = dateString.split('-');
  if (parts.length === 3) {
    let year, month, day;
    
    // Check if YYYY-MM-DD
    if (parts[0].length === 4) {
      [year, month, day] = parts;
    } 
    // Check if DD-MM-YYYY
    else if (parts[2].length === 4) {
      [day, month, year] = parts;
    } else {
      return dateString;
    }
    
    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];
    
    const monthIndex = parseInt(month, 10) - 1;
    if (monthIndex >= 0 && monthIndex < 12) {
      return `${monthNames[monthIndex]} ${parseInt(day, 10)}, ${year}`;
    }
  }
  
  return dateString;
};

export const getContrastColor = (hexColor: string) => {
  if (!hexColor) return 'white';
  
  let color = hexColor.replace('#', '');
  
  // Handle shorthand hex
  if (color.length === 3) {
    color = color.split('').map(char => char + char).join('');
  }
  
  if (color.length !== 6) return 'white';
  
  const r = parseInt(color.substring(0, 2), 16);
  const g = parseInt(color.substring(2, 4), 16);
  const b = parseInt(color.substring(4, 6), 16);
  
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  
  return luminance > 0.5 ? 'black' : 'white';
};

export const getOttBadgeConfig = (platform?: string | null) => {
  if (!platform) return null;
  const p = platform.trim().toLowerCase();
  if (!p) return null;

  if (p.includes('netflix')) {
    return { name: 'Netflix', bg: 'bg-[#E50914] text-white border-[#E50914]', key: 'netflix' };
  }
  if (p.includes('amazon') || p.includes('prime')) {
    return { name: 'Prime Video', bg: 'bg-[#00A8E1] text-white border-[#00A8E1]', key: 'prime' };
  }
  if (p.includes('disney')) {
    return { name: 'Disney+', bg: 'bg-[#113CCF] text-white border-[#113CCF]', key: 'disney' };
  }
  if (p.includes('apple')) {
    return { name: 'Apple TV+', bg: 'bg-zinc-900 text-white border-zinc-700', key: 'apple' };
  }
  if (p.includes('hbo') || p.includes('max')) {
    return { name: 'HBO Max', bg: 'bg-[#6814d4] text-white border-[#6814d4]', key: 'hbo' };
  }
  if (p.includes('hulu')) {
    return { name: 'Hulu', bg: 'bg-[#1ce783] text-black border-[#1ce783]', key: 'hulu' };
  }
  if (p.includes('paramount')) {
    return { name: 'Paramount+', bg: 'bg-[#0064ff] text-white border-[#0064ff]', key: 'paramount' };
  }
  if (p.includes('peacock')) {
    return { name: 'Peacock', bg: 'bg-[#00c2cb] text-black border-[#00c2cb]', key: 'peacock' };
  }
  if (p.includes('jiocinema') || p.includes('jio')) {
    return { name: 'JioCinema', bg: 'bg-pink-600 text-white border-pink-500', key: 'jiocinema' };
  }
  if (p.includes('globo')) {
    return { name: 'TV Globo', bg: 'bg-gradient-to-r from-[#1D71B8] via-[#F37023] to-[#E51B24] text-white border-sky-400', key: 'globo' };
  }
  if (p.includes('natgeo') || p.includes('national geographic') || p.includes('nationalgeographic')) {
    return { name: 'National Geographic', bg: 'bg-[#141414] text-[#FFCC00] border-[#FFCC00]', key: 'natgeo' };
  }
  if (p.includes('skyshowtime') || p.includes('sky showtime') || p.includes('skyshow')) {
    return { name: 'SkyShowtime', bg: 'bg-gradient-to-r from-[#003B95] via-[#632CA6] to-[#E31C79] text-white border-pink-500', key: 'skyshowtime' };
  }
  if (p.includes('gmm')) {
    return { name: 'GMM 25', bg: 'bg-gradient-to-r from-[#00529C] to-[#00A3E0] text-white border-cyan-400', key: 'gmm25' };
  }
  if (p.includes('one31') || p.includes('one 31')) {
    return { name: 'one 31', bg: 'bg-gradient-to-r from-[#D3122A] to-[#113886] text-white border-red-400', key: 'one31' };
  }
  if (p.includes('starz')) {
    return { name: 'STARZ', bg: 'bg-[#000000] text-white border-zinc-700', key: 'starz' };
  }
  if (p.includes('vod') || p.includes('rental')) {
    return { name: 'VOD Rental', bg: 'bg-gradient-to-r from-amber-600 to-orange-700 text-white border-amber-400', key: 'vodrental' };
  }
  if (p.includes('freeform')) {
    return { name: 'Freeform', bg: 'bg-gradient-to-r from-[#00A8B5] to-[#005B66] text-white border-teal-300', key: 'freeform' };
  }
  if (p.includes('zee5')) {
    return { name: 'ZEE5', bg: 'bg-white text-black border-zinc-200 shadow-md', key: 'zee5' };
  }
  if (p.includes('kableone') || p.includes('kable one')) {
    return { name: 'KableOne', bg: 'bg-gradient-to-r from-purple-900 to-pink-800 text-white border-purple-400', key: 'kableone' };
  }
  if (p.includes('sbs')) {
    return { name: 'SBS', bg: 'bg-[#004799] text-white border-[#00A3E0]', key: 'sbs' };
  }
  if (p.includes('bloodstream')) {
    return { name: 'Bloodstream', bg: 'bg-gradient-to-r from-red-950 via-red-900 to-zinc-950 text-red-100 border-red-700', key: 'bloodstream' };
  }
  if (p.includes('wavve')) {
    return { name: 'Wavve', bg: 'bg-gradient-to-r from-[#0051FF] to-[#0088FF] text-white border-blue-400', key: 'wavve' };
  }
  if (p.includes('kocowa')) {
    return { name: 'Kocowa', bg: 'bg-[#5D3BFF] text-white border-[#8468FF]', key: 'kocowa' };
  }
  if (p.includes('philo')) {
    return { name: 'Philo', bg: 'bg-gradient-to-r from-[#00D09C] to-[#0099B8] text-white border-teal-300', key: 'philo' };
  }
  if (p.includes('xumo')) {
    return { name: 'Xumo Play', bg: 'bg-gradient-to-r from-[#FFD800] to-[#FF9900] text-black border-amber-300', key: 'xumoplay' };
  }
  if (p.includes('fandango') || p.includes('vudu')) {
    return { name: 'Fandango at Home', bg: 'bg-[#0073E6] text-white border-sky-400', key: 'fandangoathome' };
  }
  if (p.includes('nippon')) {
    return { name: 'Nippon TV', bg: 'bg-[#E60012] text-white border-red-400', key: 'nippontv' };
  }
  if (p.includes('hoopla')) {
    return { name: 'Hoopla', bg: 'bg-[#0082C8] text-white border-cyan-300', key: 'hoopla' };
  }
  if (p.includes('fuji')) {
    return { name: 'Fuji TV', bg: 'bg-gradient-to-r from-[#E60012] to-[#002B49] text-white border-red-400', key: 'fujitv' };
  }
  if (p.includes('bbc')) {
    return { name: p.includes('one') ? 'BBC One' : 'BBC', bg: 'bg-[#BB1919] text-white border-red-500', key: 'bbcone' };
  }
  if (p.includes('tvn')) {
    return { name: 'tvN', bg: 'bg-[#FF0033] text-white border-red-400', key: 'tvn' };
  }
  if (p.includes('angel')) {
    return { name: 'Angel Studios', bg: 'bg-gradient-to-r from-emerald-900 to-amber-900 text-amber-200 border-amber-400/60', key: 'angelstudios' };
  }
  if (p.includes('plex')) {
    return { name: 'Plex', bg: 'bg-[#E5A00D] text-black border-amber-300', key: 'plex' };
  }
  if (p.includes('player')) {
    return { name: 'PLAYER', bg: 'bg-[#FF5500] text-white border-orange-400', key: 'player' };
  }
  if (p.includes('spectrum')) {
    return { name: 'Spectrum', bg: 'bg-gradient-to-r from-[#0066CC] to-[#003399] text-white border-blue-400', key: 'spectrum' };
  }
  if (p.includes('hungama')) {
    return { name: 'Hungama', bg: 'bg-gradient-to-r from-[#E91E63] to-[#9C27B0] text-white border-pink-400', key: 'hungama' };
  }
  if (p.includes('gunma')) {
    return { name: 'Gunma TV', bg: 'bg-[#008080] text-white border-teal-300', key: 'gunmatv' };
  }
  if (p.includes('color')) {
    return { name: 'COLORS TV', bg: 'bg-gradient-to-r from-[#8E24AA] via-[#E91E63] to-[#FF5722] text-white border-purple-400', key: 'colors' };
  }
  if (p.includes('fox')) {
    return { name: 'FOX', bg: 'bg-zinc-950 text-white border-red-600', key: 'fox' };
  }
  if (p.includes('kbs')) {
    return { name: p.includes('2') ? 'KBS2' : 'KBS', bg: 'bg-[#003B7A] text-white border-blue-400', key: 'kbs2' };
  }
  if (p.includes('mbc')) {
    return { name: 'MBC', bg: 'bg-[#0055A5] text-white border-sky-400', key: 'mbc' };
  }
  if (p.includes('kutingg')) {
    return { name: 'Kutingg', bg: 'bg-gradient-to-r from-[#FF5722] to-[#E64A19] text-white border-orange-400', key: 'kutingg' };
  }
  if (p.includes('youku')) {
    return { name: 'Youku', bg: 'bg-gradient-to-r from-[#0084FF] to-[#00C6FF] text-white border-sky-300', key: 'youku' };
  }
  if (p.includes('hoichoi')) {
    return { name: 'Hoichoi', bg: 'bg-[#E31E24] text-white border-[#E31E24]', key: 'hoichoi' };
  }
  if (p.includes('sun nxt') || p.includes('sunnxt')) {
    return { name: 'Sun NXT', bg: 'bg-gradient-to-r from-[#E41B23] to-[#FF6B00] text-white border-amber-400', key: 'sunnxt' };
  }
  if (p.includes('google play') || p.includes('google tv') || p.includes('play movies')) {
    return { name: 'Google Play Movies', bg: 'bg-[#4285F4] text-white border-[#4285F4]', key: 'googleplay' };
  }
  if (p.includes('shemaroo')) {
    return { name: 'ShemarooMe', bg: 'bg-gradient-to-r from-[#EC1C24] via-[#F26522] to-[#FFD100] text-white border-red-500', key: 'shemaroome' };
  }
  if (p.includes('fubo')) {
    return { name: 'fuboTV', bg: 'bg-[#FF4E00] text-white border-[#FF4E00]', key: 'fubo' };
  }
  if (p.includes('brew')) {
    return { name: 'Brew', bg: 'bg-amber-900 text-amber-100 border-amber-700', key: 'brew' };
  }
  if (p.includes('tubi')) {
    return { name: 'Tubi TV', bg: 'bg-[#FA2E00] text-white border-[#FA2E00]', key: 'tubi' };
  }
  if (p.includes('tencent')) {
    return { name: 'Tencent Video', bg: 'bg-gradient-to-r from-[#0072FF] to-[#00C6FF] text-white border-blue-400', key: 'tencent' };
  }
  if (p.includes('watcha')) {
    return { name: 'Watcha', bg: 'bg-[#FF0558] text-white border-[#FF0558]', key: 'watcha' };
  }
  if (p.includes('tokyo mx') || p.includes('tokyomx')) {
    return { name: 'Tokyo MX', bg: 'bg-[#00A1E9] text-white border-[#00A1E9]', key: 'tokyomx' };
  }
  if (p.includes('youtube')) {
    return { name: p.includes('free') ? 'YouTube Free' : 'YouTube', bg: 'bg-[#FF0000] text-white border-[#FF0000]', key: 'youtube' };
  }
  if (p.includes('aha')) {
    return { name: 'aha', bg: 'bg-[#FF5000] text-white border-[#FF5000]', key: 'aha' };
  }
  if (p.includes('epix') || p.includes('mgm')) {
    return { name: 'EPIX', bg: 'bg-zinc-950 text-amber-400 border-amber-500/60', key: 'epix' };
  }
  if (p.includes('sonyliv') || p.includes('sony')) {
    return { name: 'SonyLIV', bg: 'bg-amber-600 text-white border-amber-500', key: 'sonyliv' };
  }
  if (p.includes('hotstar')) {
    return { name: 'Hotstar', bg: 'bg-[#0c2044] text-amber-400 border-amber-500/40', key: 'hotstar' };
  }
  if (p.includes('crunchyroll')) {
    return { name: 'Crunchyroll', bg: 'bg-orange-500 text-white border-orange-400', key: 'crunchyroll' };
  }
  if (p.includes('viki') || p.includes('rakuten')) {
    return { name: 'Rakuten Viki', bg: 'bg-teal-600 text-white border-teal-500', key: 'viki' };
  }
  if (p.includes('lionsgate')) {
    return { name: 'Lionsgate Play', bg: 'bg-yellow-600 text-white border-yellow-500', key: 'lionsgate' };
  }

  return { name: platform, bg: 'bg-zinc-800 text-white border-zinc-700', key: p };
};
