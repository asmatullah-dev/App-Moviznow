import { Language, Quality, QualityLinks, LinkDef } from '../types';
import { LinkCheckResult } from './linkScanner';

export type QualityCategory = '480p' | '720p' | '1080p' | '2160p' | 'Other';

export const QUALITY_ORDER: QualityCategory[] = ['480p', '720p', '1080p', '2160p', 'Other'];

export const QUALITY_LABELS: Record<QualityCategory, string> = {
  '480p': '480p SD',
  '720p': '720p HD',
  '1080p': '1080p FHD',
  '2160p': '4K UHD',
  'Other': 'Other Quality',
};

export const QUALITY_COLORS: Record<QualityCategory, { bg: string; text: string; border: string }> = {
  '480p': { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30' },
  '720p': { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30' },
  '1080p': { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  '2160p': { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/30' },
  'Other': { bg: 'bg-zinc-500/10', text: 'text-zinc-400', border: 'border-zinc-500/30' },
};

export interface ScrapedLinkItem {
  id: string;
  source: string;
  sourceTitle?: string;
  url: string;
  quality: QualityCategory;
  label: string;
  rawQuality?: string;
  audio?: string;
  size?: string;
  bytes?: number;
  season?: number;
  episode?: number;
  isFullSeasonMKV?: boolean;
  isFullSeasonZIP?: boolean;
  isSample?: boolean;
  isHevc?: boolean;
  isDual?: boolean;
  status?: string;
  fileName?: string;
  finalUrl?: string;
}

/**
 * Normalizes a URL ensuring https protocol and trimmed whitespace.
 */
export function normalizeUrl(url: string): string {
  if (!url) return '';
  let u = url.trim();
  if (!u.startsWith('http://') && !u.startsWith('https://')) {
    u = 'https://' + u;
  }
  return u;
}

/**
 * Parses size strings like "1.4 GB", "750 MB", "2.1GB" into gigabytes.
 */
export function parseSizeInGB(sizeStr?: string | null): number {
  if (!sizeStr || typeof sizeStr !== 'string') return 0;
  const match = sizeStr.match(/(\d+(?:\.\d+)?)\s*(GB|MB|KB)/i);
  if (!match) return 0;
  const val = parseFloat(match[1]);
  const unit = match[2].toUpperCase();
  if (unit === 'GB') return val;
  if (unit === 'MB') return val / 1024;
  if (unit === 'KB') return val / (1024 * 1024);
  return 0;
}

/**
 * Parses any size representation into integer bytes.
 */
export function parseSizeToBytes(item: { bytes?: number; size?: string; fileSize?: number; fileSizeText?: string }): number {
  if (item.bytes && item.bytes > 0) return item.bytes;
  if (item.fileSize && item.fileSize > 0) return item.fileSize;
  const text = item.size || item.fileSizeText || '';
  if (!text) return 0;
  const match = text.match(/([\d.]+)\s*(GB|MB|KB|G|M|K|Bytes|B)?/i);
  if (!match) return 0;
  const val = parseFloat(match[1]);
  if (isNaN(val) || val <= 0) return 0;
  const unit = (match[2] || 'MB').toUpperCase();
  if (unit.startsWith('G')) return Math.round(val * 1024 * 1024 * 1024);
  if (unit.startsWith('M')) return Math.round(val * 1024 * 1024);
  if (unit.startsWith('K')) return Math.round(val * 1024);
  return Math.round(val);
}

/**
 * Extracts size in GB from a hit object across possible field names.
 */
export function getHitSizeGB(h: any): number {
  if (!h) return 0;
  if (h.size) {
    const s = parseSizeInGB(h.size);
    if (s > 0) return s;
  }
  if (h.file_name) {
    const s = parseSizeInGB(h.file_name);
    if (s > 0) return s;
  }
  if (h.label) {
    const s = parseSizeInGB(h.label);
    if (s > 0) return s;
  }
  if (h.quality) {
    const s = parseSizeInGB(h.quality);
    if (s > 0) return s;
  }
  if (h.url) {
    const s = parseSizeInGB(h.url);
    if (s > 0) return s;
  }
  return 0;
}

/**
 * Detects if a hit is HEVC / x265 / 10-bit encoded.
 */
export function isHitHevc(h: any): boolean {
  const text = `${h.file_name || ''} ${h.label || ''} ${h.quality || ''}`.toLowerCase();
  return (
    text.includes('hevc') ||
    text.includes('x265') ||
    text.includes('h265') ||
    text.includes('h.265') ||
    text.includes('10bit') ||
    text.includes('10-bit')
  );
}

/**
 * Resolves standard resolution bucket: '480p' | '720p' | '1080p' | '4k' | 'other'
 */
export function getHitResolution(h: any): '480p' | '720p' | '1080p' | '4k' | 'other' {
  const text = `${h.file_name || ''} ${h.label || ''} ${h.quality || ''}`.toLowerCase();
  if (text.includes('4k') || text.includes('2160p')) return '4k';
  if (text.includes('1080p')) return '1080p';
  if (text.includes('720p')) return '720p';
  if (text.includes('480p')) return '480p';
  return 'other';
}

/**
 * Picks the candidate hit with the smallest positive file size.
 */
export function getSmallestHit(candidates: any[]): any | undefined {
  if (!candidates || candidates.length === 0) return undefined;
  if (candidates.length === 1) return candidates[0];

  const sorted = [...candidates].sort((a, b) => {
    const sizeA = getHitSizeGB(a);
    const sizeB = getHitSizeGB(b);
    if (sizeA > 0 && sizeB > 0) {
      return sizeA - sizeB;
    }
    if (sizeA > 0 && sizeB <= 0) return -1;
    if (sizeB > 0 && sizeA <= 0) return 1;
    return 0;
  });

  return sorted[0];
}

/**
 * Checks if hit has Hindi audio line indicators.
 */
export function isHindiLineHit(h: any): boolean {
  const name = `${h.file_name || ''} ${h.label || ''}`.toLowerCase();
  return /\bhindi\b.*?\bline\b/i.test(name);
}

/**
 * Checks if filename or candidate list contains season / episode / zip indicators.
 */
export function hasSeriesOrZipIndicator(hits: any[]): boolean {
  return hits.some((h) => {
    const name = `${h.file_name || ''} ${h.label || ''} ${h.url || ''}`.toLowerCase();
    return /\b(season|seasons|s\d+|s0\d+|ep\d+|episode|episodes|complete|zip)\b/i.test(name);
  });
}

/**
 * Checks if string indicates an episode range like "E01-E08", "Ep 1 to 10", "Episodes 1-6"
 */
export function isEpisodeRange(text: string): boolean {
  const t = text.toLowerCase();
  return (
    /\be\d+\s*[-–—to]+\s*e?\d+\b/i.test(t) ||
    /\bepisodes?\s*\d+\s*[-–—to]+\s*\d+\b/i.test(t) ||
    /\bep\s*\d+\s*[-–—to]+\s*\d+\b/i.test(t) ||
    /\bpart\s*\d+\s*[-–—to]+\s*\d+\b/i.test(t)
  );
}

/**
 * Core link selection algorithm from LinkCheckerModal.
 * Filters out gdflix, handles movie vs series heuristics, prioritizes low size on duplicate qualities,
 * selects HEVC as appropriate, and ensures strictly valid Hubcloud/direct links.
 */
export function filterFilmygoHits(hits: any[], pageUrl: string): any[] {
  if (!hits || hits.length === 0) return [];

  // Exclude gdflix links completely
  const nonGdflixHits = hits.filter((h) => {
    const u = (h.url || '').toLowerCase();
    const name = (h.file_name || '').toLowerCase();
    return !u.includes('gdflix') && !name.includes('gdflix');
  });
  if (nonGdflixHits.length === 0) return [];

  let effectiveHits = nonGdflixHits;
  const hasAnyHindiLine = effectiveHits.some(isHindiLineHit);

  if (hasAnyHindiLine) {
    effectiveHits = effectiveHits.filter((h) => {
      const name = `${h.file_name || ''} ${h.label || ''}`.toLowerCase();
      if (/\bhindi\b/i.test(name)) {
        return isHindiLineHit(h);
      }
      return true;
    });
  }

  const pageUrlLower = pageUrl.toLowerCase();

  // Check if non-HEVC quality links exist at all in the hits list
  const hasAnyNonHevc = effectiveHits.some((h) => {
    const res = getHitResolution(h);
    return res !== 'other' && !isHitHevc(h);
  });

  const isSeriesUrl =
    pageUrlLower.includes('series') ||
    pageUrlLower.includes('season') ||
    pageUrlLower.includes('s01') ||
    pageUrlLower.includes('s02') ||
    pageUrlLower.includes('s1') ||
    pageUrlLower.includes('s2') ||
    pageUrlLower.includes('episode');

  const hasSeasonInFilename = effectiveHits.some((h) => {
    const name = (h.file_name || '').toLowerCase();
    return /\b(season|seasons|s\d+|s0\d+|ep\d+|episode|episodes)\b/i.test(name);
  });

  // Movie vs Series: If Season not declared in filename and isSeriesUrl is false, then treat as Movie
  const isSeries = (isSeriesUrl || hasSeasonInFilename) && hasAnyNonHevc;

  const selected: any[] = [];

  if (isSeries) {
    // Series rule: select "480p HEVC", "720p HEVC", "1080p HEVC" (smaller size if duplicates)
    const hit480pHevc = getSmallestHit(
      effectiveHits.filter((h) => getHitResolution(h) === '480p' && isHitHevc(h))
    );
    const hit720pHevc = getSmallestHit(
      effectiveHits.filter((h) => getHitResolution(h) === '720p' && isHitHevc(h))
    );
    const hit1080pHevc = getSmallestHit(
      effectiveHits.filter((h) => getHitResolution(h) === '1080p' && isHitHevc(h))
    );

    if (hit480pHevc) selected.push(hit480pHevc);
    if (hit720pHevc) selected.push(hit720pHevc);
    if (hit1080pHevc) selected.push(hit1080pHevc);

    if (selected.length === 0) {
      for (const hit of hits) {
        const nameLower = (hit.file_name || '').toLowerCase();
        if (
          nameLower.includes('480p hevc') ||
          nameLower.includes('720p hevc') ||
          nameLower.includes('1080p hevc')
        ) {
          selected.push(hit);
        }
      }
    }
  } else {
    // Movie selection rules:
    // Candidate pools by quality and HEVC status
    const cand480p = effectiveHits.filter((h) => getHitResolution(h) === '480p' && !isHitHevc(h));
    const cand480pHevc = effectiveHits.filter((h) => getHitResolution(h) === '480p' && isHitHevc(h));
    const hit480p = getSmallestHit(cand480p);
    const hit480pHevc = getSmallestHit(cand480pHevc);

    const cand720p = effectiveHits.filter((h) => getHitResolution(h) === '720p' && !isHitHevc(h));
    const cand720pHevc = effectiveHits.filter((h) => getHitResolution(h) === '720p' && isHitHevc(h));
    const hit720p = getSmallestHit(cand720p);
    const hit720pHevc = getSmallestHit(cand720pHevc);

    const cand1080p = effectiveHits.filter((h) => getHitResolution(h) === '1080p' && !isHitHevc(h));
    const cand1080pHevc = effectiveHits.filter((h) => getHitResolution(h) === '1080p' && isHitHevc(h));
    const hit1080p = getSmallestHit(cand1080p);
    const hit1080pHevc = getSmallestHit(cand1080pHevc);

    // 4K candidates (whether HEVC or not): only select if less than 10 GB
    const cand4k = effectiveHits.filter((h) => getHitResolution(h) === '4k');
    const cand4kUnder10GB = cand4k.filter((h) => {
      const sizeGB = getHitSizeGB(h);
      return sizeGB > 0 && sizeGB < 10;
    });
    const hit4k = getSmallestHit(cand4kUnder10GB);

    // 1. 480p selection:
    // Always select smaller size 480p. If 480p is not available, select 480p HEVC (smaller size).
    if (hit480p) {
      selected.push(hit480p);
    } else if (hit480pHevc) {
      selected.push(hit480pHevc);
    }

    // 2. 720p selection:
    // Always select smaller size 720p. If 720p not available, select 720p HEVC (smaller size).
    // If 720p is available and greater than 1.45GB, also select 720p HEVC (smaller size).
    if (hit720p) {
      selected.push(hit720p);
      const size720p = getHitSizeGB(hit720p);
      if (size720p > 1.45 && hit720pHevc) {
        selected.push(hit720pHevc);
      }
    } else if (hit720pHevc) {
      selected.push(hit720pHevc);
    }

    // 3. 1080p selection:
    // Always select smaller size 1080p (skipping higher-sized 1080p links).
    // If 1080p is not available, select 1080p HEVC (smaller size).
    if (hit1080p) {
      selected.push(hit1080p);
    } else if (hit1080pHevc) {
      selected.push(hit1080pHevc);
    }

    // 4. 4K selection:
    // Select 4K only if less than 10GB (whether HEVC or not, select smaller size if multiple).
    if (hit4k) {
      selected.push(hit4k);
    }
  }

  if (selected.length === 0) {
    return effectiveHits;
  }

  // Deduplicate selected hits by URL while preserving order
  const uniqueSelected: any[] = [];
  const seenSelectedUrls = new Set<string>();
  for (const item of selected) {
    if (item && item.url && !seenSelectedUrls.has(item.url)) {
      seenSelectedUrls.add(item.url);
      uniqueSelected.push(item);
    }
  }

  return uniqueSelected.length > 0 ? uniqueSelected : effectiveHits;
}

/**
 * Resolves quality category from result or scraped item.
 */
export function getItemQualityCategory(item: {
  qualityLabel?: string;
  rawQuality?: string;
  fileName?: string;
  url?: string;
  quality?: any;
}): QualityCategory {
  const text = `${item.qualityLabel || ''} ${item.rawQuality || ''} ${item.quality || ''} ${
    item.fileName || ''
  } ${item.url || ''}`.toLowerCase();

  if (text.includes('2160p') || text.includes('4k')) return '2160p';
  if (text.includes('1080p')) return '1080p';
  if (text.includes('720p')) return '720p';
  if (text.includes('480p')) return '480p';
  return 'Other';
}

const CONFIRMED_QUALITIES: QualityCategory[] = ['480p', '720p', '1080p', '2160p'];

/**
 * Resolves confirmed quality category or returns null if unconfirmed / sample / loading.
 */
export function resolveConfirmedQuality(item: ScrapedLinkItem): QualityCategory | null {
  const checkText = `${item.label || ''} ${item.rawQuality || ''} ${item.fileName || ''} ${
    item.url || ''
  }`.toLowerCase();

  if (item.isSample || /\bsample\b/i.test(checkText)) {
    return null;
  }

  if (
    checkText.includes('loading') ||
    checkText.includes('unknown') ||
    checkText.includes('checking')
  ) {
    return null;
  }

  let q: QualityCategory = item.quality;
  if (!CONFIRMED_QUALITIES.includes(q)) {
    q = getItemQualityCategory(item);
  }

  if (!CONFIRMED_QUALITIES.includes(q)) {
    return null;
  }

  return q;
}

/**
 * Compares two items of the same confirmed quality category (e.g. two 1080p links)
 * and selects the one with the LOWER file size.
 */
export function pickLowerSizeQualityItem(a: ScrapedLinkItem, b: ScrapedLinkItem): ScrapedLinkItem {
  const isWorking = (s?: string) =>
    s === 'WORKING' || s === 'REDIRECT' || s === 'SMALL_FILE' || s === 'MISSING_METADATA';
  const aWork = isWorking(a.status);
  const bWork = isWorking(b.status);
  if (aWork && !bWork) return a;
  if (!aWork && bWork) return b;

  const sizeA = parseSizeToBytes(a);
  const sizeB = parseSizeToBytes(b);
  const MIN_VALID_SIZE = 30 * 1024 * 1024; // 30 MB

  if (sizeA >= MIN_VALID_SIZE && sizeB >= MIN_VALID_SIZE) {
    if (sizeA < sizeB) return a; // Lower size chosen!
    if (sizeB < sizeA) return b; // Lower size chosen!
  } else if (sizeA >= MIN_VALID_SIZE && sizeB < MIN_VALID_SIZE) {
    return a;
  } else if (sizeB >= MIN_VALID_SIZE && sizeA < MIN_VALID_SIZE) {
    return b;
  }

  const getHostScore = (item: ScrapedLinkItem): number => {
    const u = (item.url || '').toLowerCase();
    if (u.includes('pixeldrain.com') || u.includes('hubcloud') || u.includes('vcloud')) return 20;
    if (u.includes('drivehub') || u.includes('hubdrive') || u.includes('gdflix')) return 10;
    return 0;
  };
  const hostA = getHostScore(a);
  const hostB = getHostScore(b);
  if (hostA !== hostB) {
    return hostA > hostB ? a : b;
  }

  if (a.isHevc && !b.isHevc) return a;
  if (!a.isHevc && b.isHevc) return b;

  return a;
}

/**
 * Deduplicates quality links ensuring strictly ONE link per confirmed quality category (480p, 720p, 1080p, 2160p).
 * When duplicate qualities exist, selects the lower size link.
 */
export function deduplicateQualityLinks(
  items: ScrapedLinkItem[],
  type: 'movie' | 'series' = 'movie'
): ScrapedLinkItem[] {
  if (items.length === 0) return [];

  if (type === 'movie') {
    const qualitySlots: Partial<Record<QualityCategory, ScrapedLinkItem>> = {};

    for (const it of items) {
      if (it.isSample) continue;

      const confirmedQ = resolveConfirmedQuality(it);
      if (!confirmedQ) continue;

      const normalizedItem: ScrapedLinkItem = {
        ...it,
        quality: confirmedQ,
        label: `${confirmedQ}${it.isHevc ? ' HEVC' : ''}`.trim(),
      };

      const existing = qualitySlots[confirmedQ];
      if (!existing) {
        qualitySlots[confirmedQ] = normalizedItem;
      } else {
        qualitySlots[confirmedQ] = pickLowerSizeQualityItem(normalizedItem, existing);
      }
    }

    const standardOrder: QualityCategory[] = ['480p', '720p', '1080p', '2160p'];
    const result: ScrapedLinkItem[] = [];
    for (const q of standardOrder) {
      const slot = qualitySlots[q];
      if (slot) {
        result.push(slot);
      }
    }

    return result;
  } else {
    // Episodic series: group by season + episode / pack + confirmed quality
    const episodeQualitySlots: Record<string, ScrapedLinkItem> = {};

    for (const it of items) {
      if (it.isSample) continue;

      const confirmedQ = resolveConfirmedQuality(it);
      if (!confirmedQ) continue;

      const normalizedItem: ScrapedLinkItem = {
        ...it,
        quality: confirmedQ,
        label: `${confirmedQ}${it.isHevc ? ' HEVC' : ''}`.trim(),
      };

      const seasonKey = normalizedItem.isFullSeasonZIP
        ? `pack-zip-s${normalizedItem.season || 1}`
        : normalizedItem.isFullSeasonMKV
        ? `pack-mkv-s${normalizedItem.season || 1}`
        : `s${normalizedItem.season || 1}e${normalizedItem.episode || 1}`;

      const key = `${seasonKey}-${confirmedQ}`;
      const existing = episodeQualitySlots[key];
      if (!existing) {
        episodeQualitySlots[key] = normalizedItem;
      } else {
        episodeQualitySlots[key] = pickLowerSizeQualityItem(normalizedItem, existing);
      }
    }

    return Object.values(episodeQualitySlots).sort((a, b) => {
      const seasonA = a.season || 1;
      const seasonB = b.season || 1;
      if (seasonA !== seasonB) return seasonA - seasonB;

      const isPackA = Boolean(a.isFullSeasonMKV || a.isFullSeasonZIP);
      const isPackB = Boolean(b.isFullSeasonMKV || b.isFullSeasonZIP);
      if (isPackA && !isPackB) return -1;
      if (!isPackA && isPackB) return 1;

      const epA = a.episode || 0;
      const epB = b.episode || 0;
      if (epA !== epB) return epA - epB;

      const qWeight: Record<QualityCategory, number> = {
        '480p': 1,
        '720p': 2,
        '1080p': 3,
        '2160p': 4,
        Other: 9,
      };
      return (qWeight[a.quality] || 9) - (qWeight[b.quality] || 9);
    });
  }
}

/**
 * Extracts clean title, year, season, episode from text.
 */
export function extractTitleAndYear(text: string): {
  title?: string;
  year?: number;
  season?: number;
  episode?: number;
  isEpisodeRange?: boolean;
} {
  let year: number | undefined;
  let title: string | undefined;
  let season: number | undefined;
  let episode: number | undefined;

  let cleanText = text.trim();
  cleanText = cleanText.replace(/^(?:sample|sample[-_.\s]+)/i, '').trim();
  cleanText = cleanText.replace(/^(download|watch|stream|movie|series)\b\s*/i, '');

  const isEpRange = isEpisodeRange(cleanText);

  // Extract season and episode
  const combinedMatch = cleanText.match(/\bs(\d+)e(\d+)(?![a-z0-9])/i) ||
                        cleanText.match(/season\s*(\d+).*?episode\s*(\d+)/i) ||
                        cleanText.match(/\bs(\d+)\s*e(\d+)\b/i);
  if (combinedMatch) {
    season = parseInt(combinedMatch[1], 10);
    episode = parseInt(combinedMatch[2], 10);
  } else {
    const sMatch = cleanText.match(/\bs(\d+)\b/i) || cleanText.match(/season\s*(\d+)/i) || cleanText.match(/ss\s*(\d+)/i);
    const eMatch = cleanText.match(/\be(\d+)\b/i) || cleanText.match(/episode\s*(\d+)\b/i) || cleanText.match(/ep\s*(\d+)\b/i);
    if (sMatch) season = parseInt(sMatch[1], 10);
    if (eMatch && !isEpRange) episode = parseInt(eMatch[1], 10);
  }

  // Detect year - look for 4 digits (19xx or 20xx)
  const yearPattern = /(?:\D|^)(19\d{2}|20\d{2})(?:\D|$)/;
  const yearMatch = cleanText.match(yearPattern);

  if (yearMatch) {
    year = parseInt(yearMatch[1], 10);
    const yearIndex = cleanText.indexOf(yearMatch[1]);
    title = cleanText.substring(0, yearIndex).trim();
  } else {
    const noiseMarkers = [
      '\\d{3,4}p', '[0-9]k', 'web[-.\\s_]?(dl|rip)',
      'hd[-.\\s_]?rip', 'blu[-.\\s_]?ray', 'bd[-.\\s_]?rip',
      'br[-.\\s_]?rip', 'hdtc', 'hdcam', 'dvdrip', 'webrip',
      'hq', 'proper', 'repack', 'internal', 'hevc', 'x264', 'x265', 'aac', 'ac3',
      'dual[-.\\s_]?audio', 'multi[-.\\s_]?audio',
      'hindi', 'english', 'tamil', 'telugu', 'malayalam', 'kannada', 'urdu', 'punjabi',
      's\\d+e\\d+', 's\\d+', 'season', 'episode'
    ];
    const markerRegex = new RegExp(`\\b(${noiseMarkers.join('|')})\\b`, 'i');
    const markerMatch = cleanText.match(markerRegex);

    if (markerMatch) {
      title = cleanText.substring(0, markerMatch.index).trim();
    } else {
      title = cleanText.trim();
    }
  }

  if (title) {
    title = title
      .replace(/\.(mkv|mp4|zip|rar|avi|mov|wmv|flv|ts)$/i, '')
      .replace(/[\[\]\(\)\{\}\.\-_/]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    title = title.replace(/^[🎬\s*]+/, '');

    title = title
      .replace(/\b(seasons?|s)\s*[-_]?\s*\d{1,2}\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    title = title
      .split(' ')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');

    return { title: title || undefined, year, season, episode, isEpisodeRange: isEpRange };
  }

  return { title: undefined, year, season, episode, isEpisodeRange: isEpRange };
}

/**
 * Checks precise title match between two strings.
 */
export function isPreciseTitleMatch(postTitle: string, targetTitle: string): boolean {
  if (!postTitle || !targetTitle) return false;
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const normPost = normalize(postTitle);
  const normTarget = normalize(targetTitle);

  if (normPost === normTarget) return true;
  if (normPost.startsWith(normTarget) || normPost.includes(normTarget)) return true;

  // Check word containment
  const targetWords = normTarget.split(' ').filter((w) => w.length > 2);
  if (targetWords.length > 0 && targetWords.every((w) => normPost.includes(w))) {
    return true;
  }

  return false;
}

/**
 * Ranks and verifies posts discovered by title-only search:
 * - Checks exact or precise title match
 * - Verifies against expected release year when present (gives high priority to matching year)
 * - Penalizes posts with heavily conflicting release years
 */
export function rankAndVerifyPosts(posts: any[], targetTitle: string, expectedYear?: number): any[] {
  if (!posts || posts.length === 0) return [];

  return [...posts].sort((a: any, b: any) => {
    const aTitle = a.title || a.postTitle || '';
    const bTitle = b.title || b.postTitle || '';

    const aParsed = extractTitleAndYear(aTitle);
    const bParsed = extractTitleAndYear(bTitle);

    const aTitleMatch = isPreciseTitleMatch(aParsed.title || aTitle, targetTitle) ? 1 : 0;
    const bTitleMatch = isPreciseTitleMatch(bParsed.title || bTitle, targetTitle) ? 1 : 0;

    // 1. Precise title match priority
    if (aTitleMatch !== bTitleMatch) {
      return bTitleMatch - aTitleMatch;
    }

    // 2. Year verification priority if year is provided
    if (expectedYear) {
      const aHasYear = Boolean(aParsed.year);
      const bHasYear = Boolean(bParsed.year);

      const aYearDiff = aParsed.year ? Math.abs(aParsed.year - expectedYear) : 999;
      const bYearDiff = bParsed.year ? Math.abs(bParsed.year - expectedYear) : 999;

      const aMatchesYear = aYearDiff <= 1 ? 1 : 0;
      const bMatchesYear = bYearDiff <= 1 ? 1 : 0;

      if (aMatchesYear !== bMatchesYear) {
        return bMatchesYear - aMatchesYear;
      }

      if (aHasYear && bHasYear && aYearDiff !== bYearDiff) {
        return aYearDiff - bYearDiff;
      }
    }

    return 0;
  });
}

/**
 * Builds standard QualityLinks array formatted for storage with sample links, sizes, and season/episode flags.
 */
export function buildQualityLinksPayload(items: ScrapedLinkItem[]): QualityLinks {
  return items.map((s) => ({
    id: s.id || Math.random().toString(36).substr(2, 9),
    name: s.label,
    url: normalizeUrl(s.finalUrl || s.url),
    size: s.size ? s.size.replace(/MB|GB/i, '').trim() : '',
    unit: s.size && s.size.toLowerCase().includes('gb') ? 'GB' : 'MB',
    season: s.season,
    episode: s.episode,
    isFullSeasonMKV: s.isFullSeasonMKV,
    isFullSeasonZIP: s.isFullSeasonZIP,
    isSample: s.isSample,
  }));
}
