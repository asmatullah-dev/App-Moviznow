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
    return { name: 'Netflix', bg: 'bg-[#E50914] text-white border-[#E50914]' };
  }
  if (p.includes('amazon') || p.includes('prime')) {
    return { name: 'Prime Video', bg: 'bg-[#00A8E1] text-white border-[#00A8E1]' };
  }
  if (p.includes('disney')) {
    return { name: 'Disney+', bg: 'bg-[#113CCF] text-white border-[#113CCF]' };
  }
  if (p.includes('apple')) {
    return { name: 'Apple TV+', bg: 'bg-zinc-900 text-white border-zinc-700' };
  }
  if (p.includes('hbo') || p.includes('max')) {
    return { name: 'HBO Max', bg: 'bg-[#6814d4] text-white border-[#6814d4]' };
  }
  if (p.includes('hulu')) {
    return { name: 'Hulu', bg: 'bg-[#1ce783] text-black border-[#1ce783]' };
  }
  if (p.includes('paramount')) {
    return { name: 'Paramount+', bg: 'bg-[#0064ff] text-white border-[#0064ff]' };
  }
  if (p.includes('peacock')) {
    return { name: 'Peacock', bg: 'bg-[#00c2cb] text-black border-[#00c2cb]' };
  }
  if (p.includes('jiocinema') || p.includes('jio')) {
    return { name: 'JioCinema', bg: 'bg-pink-600 text-white border-pink-500' };
  }
  if (p.includes('zee5')) {
    return { name: 'Zee5', bg: 'bg-purple-700 text-white border-purple-500' };
  }
  if (p.includes('sonyliv') || p.includes('sony')) {
    return { name: 'SonyLIV', bg: 'bg-amber-600 text-white border-amber-500' };
  }
  if (p.includes('hotstar')) {
    return { name: 'Hotstar', bg: 'bg-[#0c2044] text-amber-400 border-amber-500/40' };
  }
  if (p.includes('crunchyroll')) {
    return { name: 'Crunchyroll', bg: 'bg-orange-500 text-white border-orange-400' };
  }
  if (p.includes('viki') || p.includes('rakuten')) {
    return { name: 'Rakuten Viki', bg: 'bg-teal-600 text-white border-teal-500' };
  }
  if (p.includes('lionsgate')) {
    return { name: 'Lionsgate Play', bg: 'bg-yellow-600 text-white border-yellow-500' };
  }

  return { name: platform, bg: 'bg-zinc-800 text-white border-zinc-700' };
};
