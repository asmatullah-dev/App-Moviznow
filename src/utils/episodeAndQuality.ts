import { isEpisodeRange } from './linkScanner';

export type QualityCategory = '720p' | '1080p' | '480p' | '2160p' | 'Other';

export const QUALITY_ORDER: QualityCategory[] = ['720p', '1080p', '480p', '2160p', 'Other'];

export const QUALITY_LABELS: Record<QualityCategory, string> = {
  '720p': '720p HD',
  '1080p': '1080p Full HD',
  '480p': '480p SD',
  '2160p': '4K / 2160p UHD',
  'Other': 'Other Quality',
};

export const QUALITY_COLORS: Record<
  QualityCategory,
  { badge: string; border: string; bg: string; text: string; buttonBg: string; buttonText: string }
> = {
  '720p': {
    badge: 'bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 border-cyan-500/30',
    border: 'border-cyan-500/30',
    bg: 'bg-cyan-500/5',
    text: 'text-cyan-600 dark:text-cyan-400',
    buttonBg: 'bg-cyan-500/15 hover:bg-cyan-500/25 border-cyan-500/30',
    buttonText: 'text-cyan-600 dark:text-cyan-400',
  },
  '1080p': {
    badge: 'bg-purple-500/20 text-purple-600 dark:text-purple-400 border-purple-500/30',
    border: 'border-purple-500/30',
    bg: 'bg-purple-500/5',
    text: 'text-purple-600 dark:text-purple-400',
    buttonBg: 'bg-purple-500/15 hover:bg-purple-500/25 border-purple-500/30',
    buttonText: 'text-purple-600 dark:text-purple-400',
  },
  '480p': {
    badge: 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30',
    border: 'border-amber-500/30',
    bg: 'bg-amber-500/5',
    text: 'text-amber-600 dark:text-amber-400',
    buttonBg: 'bg-amber-500/15 hover:bg-amber-500/25 border-amber-500/30',
    buttonText: 'text-amber-600 dark:text-amber-400',
  },
  '2160p': {
    badge: 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
    border: 'border-emerald-500/30',
    bg: 'bg-emerald-500/5',
    text: 'text-emerald-600 dark:text-emerald-400',
    buttonBg: 'bg-emerald-500/15 hover:bg-emerald-500/25 border-emerald-500/30',
    buttonText: 'text-emerald-600 dark:text-emerald-400',
  },
  'Other': {
    badge: 'bg-zinc-500/20 text-zinc-600 dark:text-zinc-400 border-zinc-500/30',
    border: 'border-zinc-200 dark:border-zinc-800',
    bg: 'bg-zinc-500/5',
    text: 'text-zinc-600 dark:text-zinc-400',
    buttonBg: 'bg-zinc-200/50 dark:bg-zinc-800/50 hover:bg-zinc-200 dark:hover:bg-zinc-800 border-zinc-300 dark:border-zinc-700',
    buttonText: 'text-zinc-700 dark:text-zinc-300',
  },
};

export function getItemEpisodeInfo(item: any): {
  isEpisode: boolean;
  epNumber?: number;
  seasonNumber?: number;
  label: string;
  isPack: boolean;
} {
  if (!item) return { isEpisode: false, label: '', isPack: false };

  const text = `${item.file_name || item.fileName || ''} ${item.quality || item.qualityLabel || ''} ${item.seasonEpLabel || ''} ${item.url || item.finalUrl || ''} ${item.fullContext || ''}`.toLowerCase();

  const isPack = Boolean(
    item.isFullSeasonZIP ||
    item.isFullSeasonMKV ||
    /\b(pack|zip|batch|complete|all\s*episodes|full\s*season)\b/i.test(text) ||
    (/\bseason\s*\d+\b/i.test(text) &&
      !/\b(?:episode|ep|e)\s*[-_.]?\s*\d+\b/i.test(text) &&
      !/\b\d+\s*(?:st|nd|rd|th)?\s*episode\b/i.test(text))
  );

  let epNumber: number | undefined = undefined;
  if (!isPack) {
    if (item.episode !== undefined && item.episode !== null && item.episode !== '') {
      const parsed = parseInt(String(item.episode), 10);
      if (!isNaN(parsed)) epNumber = parsed;
    }
    if (epNumber === undefined && item.ep !== undefined && item.ep !== null && item.ep !== '') {
      const parsed = parseInt(String(item.ep), 10);
      if (!isNaN(parsed)) epNumber = parsed;
    }
    if (epNumber === undefined) {
      const m = text.match(/\b(?:episode|ep|e)\s*[-_.]?\s*0*(\d{1,3})\b/i) || text.match(/\b0*(\d{1,3})\s*(?:st|nd|rd|th)?\s*episode\b/i);
      if (m) epNumber = parseInt(m[1], 10);
    }
  }

  let seasonNumber: number | undefined = undefined;
  if (item.season !== undefined && item.season !== null && item.season !== '') {
    const parsed = parseInt(String(item.season), 10);
    if (!isNaN(parsed)) seasonNumber = parsed;
  }
  if (seasonNumber === undefined) {
    const sMatch = text.match(/\b(?:season|s)\s*[-_.]?\s*0*(\d{1,2})\b/i);
    if (sMatch) seasonNumber = parseInt(sMatch[1], 10);
  }

  const isEpisode = !isPack && epNumber !== undefined;

  let label = '';
  if (isEpisode) {
    label =
      seasonNumber !== undefined
        ? `S${String(seasonNumber).padStart(2, '0')}E${String(epNumber).padStart(2, '0')}`
        : `Episode ${epNumber}`;
  } else if (isPack) {
    label = seasonNumber !== undefined ? `Season ${seasonNumber} Complete Pack` : 'Complete Season Pack';
  } else {
    label = 'Movie / Video';
  }

  return { isEpisode, epNumber, seasonNumber, label, isPack };
}

export function getItemQualityCategory(item: any): QualityCategory {
  if (!item) return 'Other';
  const text = `${item.quality || ''} ${item.qualityLabel || ''} ${item.file_name || ''} ${item.fileName || ''} ${item.url || ''} ${item.finalUrl || ''} ${item.locationTag || ''}`.toLowerCase();
  if (text.includes('2160p') || text.includes('4k')) return '2160p';
  if (text.includes('1080p')) return '1080p';
  if (text.includes('720p')) return '720p';
  if (text.includes('480p')) return '480p';
  return 'Other';
}

export function sortHitsByEpisodeAndQuality(hits: any[]) {
  return [...hits].sort((a, b) => {
    const infoA = getItemEpisodeInfo(a);
    const infoB = getItemEpisodeInfo(b);

    // 1. Season Packs first
    if (infoA.isPack && !infoB.isPack) return -1;
    if (!infoA.isPack && infoB.isPack) return 1;

    // 2. Episodes sorted by season ascending, then episode ascending
    if (infoA.isEpisode && infoB.isEpisode) {
      if (infoA.seasonNumber !== undefined && infoB.seasonNumber !== undefined && infoA.seasonNumber !== infoB.seasonNumber) {
        return infoA.seasonNumber - infoB.seasonNumber;
      }
      if (infoA.epNumber !== undefined && infoB.epNumber !== undefined && infoA.epNumber !== infoB.epNumber) {
        return infoA.epNumber - infoB.epNumber;
      }
    }
    if (infoA.isEpisode && !infoB.isEpisode) return -1;
    if (!infoA.isEpisode && infoB.isEpisode) return 1;

    // 3. Quality ascending (480p, 720p, 1080p, 2160p)
    const textA = `${a.file_name || ''} ${a.quality || ''} ${a.url || ''}`;
    const textB = `${b.file_name || ''} ${b.quality || ''} ${b.url || ''}`;
    const getQualityWeight = (item: any, text: string) => {
      const q = (item.quality || text).toLowerCase();
      if (q.includes('480p')) return 1;
      if (q.includes('720p')) return 2;
      if (q.includes('1080p')) return 3;
      if (q.includes('2160p') || q.includes('4k')) return 4;
      return 0;
    };
    const qA = getQualityWeight(a, textA);
    const qB = getQualityWeight(b, textB);
    if (qA !== qB) return qA - qB;

    return (a.file_name || '').localeCompare(b.file_name || '', undefined, { numeric: true, sensitivity: 'base' });
  });
}

export function sortResultsByEpisodeAndQuality(results: any[]) {
  return [...results].sort((a, b) => {
    const infoA = getItemEpisodeInfo(a);
    const infoB = getItemEpisodeInfo(b);

    if (infoA.isPack && !infoB.isPack) return -1;
    if (!infoA.isPack && infoB.isPack) return 1;

    if (infoA.isEpisode && infoB.isEpisode) {
      if (infoA.seasonNumber !== undefined && infoB.seasonNumber !== undefined && infoA.seasonNumber !== infoB.seasonNumber) {
        return infoA.seasonNumber - infoB.seasonNumber;
      }
      if (infoA.epNumber !== undefined && infoB.epNumber !== undefined && infoA.epNumber !== infoB.epNumber) {
        return infoA.epNumber - infoB.epNumber;
      }
    }
    if (infoA.isEpisode && !infoB.isEpisode) return -1;
    if (!infoA.isEpisode && infoB.isEpisode) return 1;

    const textA = `${a.fileName || ''} ${a.qualityLabel || ''} ${a.url || ''} ${a.finalUrl || ''}`;
    const textB = `${b.fileName || ''} ${b.qualityLabel || ''} ${b.url || ''} ${b.finalUrl || ''}`;

    const getQualityWeight = (item: any, text: string) => {
      const q = (item.qualityLabel || text).toLowerCase();
      if (q.includes('480p')) return 1;
      if (q.includes('720p')) return 2;
      if (q.includes('1080p')) return 3;
      if (q.includes('2160p') || q.includes('4k')) return 4;
      return 0;
    };

    const qA = getQualityWeight(a, textA);
    const qB = getQualityWeight(b, textB);
    if (qA !== qB) {
      return qA - qB;
    }

    return (a.fileName || a.url || '').localeCompare(b.fileName || b.url || '', undefined, { numeric: true, sensitivity: 'base' });
  });
}

export const getLocationTag = (item: {
  season?: number;
  episode?: number;
  isFullSeasonMKV?: boolean;
  isFullSeasonZIP?: boolean;
  fileName?: string;
  url?: string;
  finalUrl?: string;
  locationName?: string;
  linkName?: string;
  qualityLabel?: string;
  codecLabel?: string;
}): string | null => {
  if (item.locationName && item.locationName.trim().length > 0) {
    let loc = item.locationName.trim();
    if (item.isFullSeasonZIP && !/\bZIP\b/i.test(loc)) {
      loc = `${loc} ZIP`;
    } else if (item.isFullSeasonMKV && !/\bMKV\b/i.test(loc)) {
      loc = `${loc} MKV`;
    }
    return loc;
  }
  if (item.linkName && item.linkName.trim().length > 0) {
    let loc = item.linkName.trim();
    if (item.isFullSeasonZIP && !/\bZIP\b/i.test(loc)) {
      loc = `${loc} ZIP`;
    } else if (item.isFullSeasonMKV && !/\bMKV\b/i.test(loc)) {
      loc = `${loc} MKV`;
    }
    return loc;
  }

  let season = item.season;
  let episode = item.episode;
  let isFullSeasonMKV = item.isFullSeasonMKV;
  let isFullSeasonZIP = item.isFullSeasonZIP;

  // Fallback parsing from fileName, url, or finalUrl if season or episode missing
  if (season === undefined && episode === undefined) {
    const textToScan = `${item.fileName || ''} ${item.finalUrl || ''} ${item.url || ''}`.toLowerCase();
    const hasRange = isEpisodeRange(textToScan);

    const combinedMatch = hasRange ? null : (
      textToScan.match(/(?<=^|[^a-zA-Z0-9])s(\d+)\s*e(\d+)(?![a-z0-9])/i) ||
      textToScan.match(/season\s*(\d+).*?episode\s*(\d+)/i) ||
      textToScan.match(/(?<=^|[^a-zA-Z0-9])dl\s+(\d+)\s+(\d+)(?![a-z0-9])/i)
    );

    if (combinedMatch) {
      season = parseInt(combinedMatch[1], 10);
      episode = parseInt(combinedMatch[2], 10);
      isFullSeasonMKV = false;
      isFullSeasonZIP = false;
    } else {
      const sMatch = textToScan.match(/(?<=^|[^a-zA-Z0-9])(?:s(\d+)|season\s*(\d+)|ss\s*(\d+))(?![a-z0-9])/i);
      const eMatch = hasRange ? null : textToScan.match(/(?<=^|[^a-zA-Z0-9])(?:e(\d+)|episode\s*(\d+)|ep\s*(\d+))(?![a-z0-9])/i);

      if (sMatch) season = parseInt(sMatch[1] || sMatch[2] || sMatch[3], 10);
      if (eMatch) episode = parseInt(eMatch[1] || eMatch[2] || eMatch[3], 10);

      if (episode !== undefined) {
        isFullSeasonMKV = false;
        isFullSeasonZIP = false;
      } else {
        if (textToScan.includes('.zip')) isFullSeasonZIP = true;
        else if (textToScan.includes('.mkv') || hasRange || /full season|complete season|all episodes/i.test(textToScan)) {
          isFullSeasonMKV = true;
        }
      }
    }
  }

  if (episode !== undefined) {
    isFullSeasonMKV = false;
    isFullSeasonZIP = false;
  }

  const qual = item.qualityLabel || '';
  const codec = item.codecLabel ? ` ${item.codecLabel}` : '';

  if (season !== undefined && episode !== undefined) {
    return `S${season}E${episode}`;
  }
  if (season !== undefined) {
    if (isFullSeasonZIP) return qual ? `S${season} ${qual}${codec} ZIP`.trim() : `S${season} ZIP`;
    if (isFullSeasonMKV) return qual ? `S${season} ${qual}${codec} MKV`.trim() : `S${season} MKV`;
    return `S${season}`;
  }
  if (episode !== undefined) {
    return `E${episode}`;
  }
  if (isFullSeasonZIP) {
    return qual ? `${qual}${codec} ZIP`.trim() : 'ZIP';
  }
  if (isFullSeasonMKV) {
    return qual ? `${qual}${codec} MKV`.trim() : 'MKV';
  }

  if (qual) {
    return `${qual}${codec}`.trim();
  }

  return null;
};

export const hasSeriesOrZipIndicator = (hits: any[]): boolean => {
  if (!hits) return false;
  return hits.some((h: any) => {
    const name = (h.file_name || '').toLowerCase();
    const label = (h.label || '').toLowerCase();
    const url = (h.url || '').toLowerCase();
    const combined = `${name} ${label} ${url}`;
    return (
      combined.includes('zip') ||
      combined.includes('ep') ||
      combined.includes('episode') ||
      combined.includes('episodes') ||
      combined.includes('season') ||
      combined.includes('complete') ||
      combined.includes('pack') ||
      /\bs\d+/i.test(combined) ||
      /\bep\d+/i.test(combined)
    );
  });
};

export const isMissingPixeldrain = (
  r: { url?: string; candidates?: Array<{ text: string; href: string }> } | null | undefined
): boolean => {
  if (!r || !r.url) return false;
  const url = r.url.toLowerCase();
  const isHubcloud =
    url.includes('hubcloud') ||
    url.includes('vcloud') ||
    url.includes('hubdrive') ||
    url.includes('drivehub') ||
    url.includes('gdflix') ||
    url.includes('hubcdn') ||
    url.includes('hblinks');
  if (!isHubcloud) return false;
  if (!r.candidates || r.candidates.length === 0) return true;
  return !r.candidates.some(
    (c) =>
      (c.text && c.text.toLowerCase().includes('pixeldrain')) ||
      (c.href && c.href.toLowerCase().includes('pixeldrain'))
  );
};
