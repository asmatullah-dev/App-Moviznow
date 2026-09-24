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
 * Parses size strings like "1.4 GB", "750 MB", "2.1GB", "14.2 GiB" into gigabytes.
 */
export function parseSizeInGB(sizeStr?: string | null): number {
  if (!sizeStr || typeof sizeStr !== 'string') return 0;
  const match = sizeStr.match(/(\d+(?:\.\d+)?)\s*(GB|GIB|MB|MIB|KB|KIB|TB|TIB|G|M|K|T)\b/i);
  if (!match) return 0;
  const val = parseFloat(match[1]);
  const unit = match[2].toUpperCase();
  if (unit.startsWith('T')) return val * 1024;
  if (unit.startsWith('G')) return val;
  if (unit.startsWith('M')) return val / 1024;
  if (unit.startsWith('K')) return val / (1024 * 1024);
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
  if (typeof h.bytes === 'number' && h.bytes > 0) {
    return h.bytes / (1024 * 1024 * 1024);
  }
  if (typeof h.fileSize === 'number' && h.fileSize > 0) {
    return h.fileSize / (1024 * 1024 * 1024);
  }
  if (h.size && h.unit) {
    const n = parseFloat(String(h.size).replace(/,/g, ''));
    if (!isNaN(n) && n > 0) {
      const u = String(h.unit).toUpperCase();
      if (u === 'GB') return n;
      if (u === 'MB') return n / 1024;
      if (u === 'TB') return n * 1024;
    }
  }
  if (h.size) {
    const s = parseSizeInGB(String(h.size));
    if (s > 0) return s;
  }
  if (h.fileSizeText) {
    const s = parseSizeInGB(String(h.fileSizeText));
    if (s > 0) return s;
  }
  if (h.file_name) {
    const s = parseSizeInGB(String(h.file_name));
    if (s > 0) return s;
  }
  if (h.fileName) {
    const s = parseSizeInGB(String(h.fileName));
    if (s > 0) return s;
  }
  if (h.label) {
    const s = parseSizeInGB(String(h.label));
    if (s > 0) return s;
  }
  if (h.quality) {
    const s = parseSizeInGB(String(h.quality));
    if (s > 0) return s;
  }
  if (h.rawQuality) {
    const s = parseSizeInGB(String(h.rawQuality));
    if (s > 0) return s;
  }
  if (h.url) {
    const s = parseSizeInGB(String(h.url));
    if (s > 0) return s;
  }
  return 0;
}

/**
 * Detects if a hit is HEVC / x265 / 10-bit encoded.
 */
export function isHitHevc(h: any): boolean {
  const text = `${h.file_name || ''} ${h.fileName || ''} ${h.label || ''} ${h.quality || ''} ${h.rawQuality || ''}`.toLowerCase();
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
 * Detects if a hit is an x264 encode (and NOT a Hybrid / AMZN encode).
 */
export function isHitX264(h: any): boolean {
  const text = `${h.file_name || ''} ${h.fileName || ''} ${h.label || ''} ${h.quality || ''} ${h.rawQuality || ''} ${h.url || ''}`.toLowerCase();
  return /\bx264\b/i.test(text) && !/\bhybrid\b/i.test(text);
}

/**
 * Detects if a hit is H264, H265, or a Hybrid encode.
 */
export function isHitH264OrHybrid(h: any): boolean {
  const text = `${h.file_name || ''} ${h.fileName || ''} ${h.label || ''} ${h.quality || ''} ${h.rawQuality || ''} ${h.url || ''}`.toLowerCase();
  return /\b(hybrid|h264|h\.264|h265|h\.265)\b/i.test(text);
}

/**
 * Helper to identify if 4k tag is part of a DS4K / downscaled 4k / 4k source tag (not true 4K resolution)
 */
export function isDs4kOrSource4k(text: string): boolean {
  return /ds\s*[\-\_]?\s*4k|downscaled\s*[\-\_]?\s*4k|4k\s*[\-\_]?\s*source|4k\s*[\-\_]?\s*remastered|ds4k|4kds/i.test(text);
}

/**
 * Checks if text represents a true 4K / 2160p resolution release.
 */
export function isTrue4k(text: string): boolean {
  const lower = text.toLowerCase();
  if (lower.includes('2160p') || lower.includes('2160')) return true;
  if (isDs4kOrSource4k(lower)) return false;
  return /\b(4k|uhd|ultra\s*hd)\b/i.test(lower);
}

/**
 * Parses the standard QualityCategory ('480p' | '720p' | '1080p' | '2160p' | 'Other') from raw text.
 * Prioritizes explicit height markers (1080p, 720p, 480p, 2160p) and ignores DS4K tags as 4K.
 */
export function parseQualityCategoryFromText(text: string): QualityCategory {
  if (!text) return 'Other';
  const lower = text.toLowerCase();

  // 1. Explicit height resolution markers (highest precision)
  if (lower.includes('1080p')) return '1080p';
  if (lower.includes('720p')) return '720p';
  if (lower.includes('480p') || /\b480p?\b/i.test(lower) || /\bsd\b/i.test(lower)) return '480p';
  if (lower.includes('2160p') || lower.includes('2160')) return '2160p';

  // 2. True 4K check (only if not DS4K / downscaled / source 4k tag)
  if (isTrue4k(lower)) return '2160p';

  return 'Other';
}

/**
 * Resolves standard resolution bucket: '480p' | '720p' | '1080p' | '4k' | 'other'
 */
export function getHitResolution(h: any): '480p' | '720p' | '1080p' | '4k' | 'other' {
  const text = `${h.file_name || ''} ${h.fileName || ''} ${h.label || ''} ${h.quality || ''} ${h.rawQuality || ''} ${h.url || ''}`.toLowerCase();
  const cat = parseQualityCategoryFromText(text);
  if (cat === '2160p') return '4k';
  if (cat === '1080p') return '1080p';
  if (cat === '720p') return '720p';
  if (cat === '480p') return '480p';
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
 * Checks if a hit represents a full ZIP pack / complete batch / season pack.
 */
export function isHitZipOrPack(h: any): boolean {
  if (h.isZip || h.isPack || h.isFullSeasonZIP || h.isFullSeasonMKV) return true;
  const text = `${h.file_name || ''} ${h.fileName || ''} ${h.label || ''} ${h.quality || ''} ${h.rawQuality || ''}`.toLowerCase();
  const optionName = text.includes('|') ? text.split('|')[1].trim() : text;
  
  if (optionName.includes('single episode') || optionName.includes('single ep')) {
    return false;
  }
  
  return (
    optionName.includes('zip') ||
    optionName.includes('pack') ||
    optionName.includes('batch') ||
    optionName.includes('complete') ||
    optionName.includes('full season') ||
    optionName.includes('all episodes') ||
    /\b(zip|pack|batch)\b/i.test(text)
  );
}

/**
 * Checks if a hit represents a single episode or episode archive row.
 */
export function isHitSingleEpisode(h: any): boolean {
  if (isHitZipOrPack(h)) return false;
  const text = `${h.file_name || ''} ${h.fileName || ''} ${h.label || ''} ${h.quality || ''} ${h.rawQuality || ''}`.toLowerCase();
  return (
    text.includes('single episode') ||
    text.includes('single ep') ||
    /\b(?:episode|ep)\s*0*(\d+)\b/i.test(text) ||
    /\be\s*0*(\d+)\b/i.test(text) ||
    Boolean(h.isEpisode)
  );
}

/**
 * Extracts season number from a hit or its text context (defaults to Season 1).
 */
export function getHitSeasonNumber(h: any): number {
  const text = `${h.file_name || ''} ${h.fileName || ''} ${h.label || ''} ${h.quality || ''} ${h.rawQuality || ''} ${h.headingText || ''}`.toLowerCase();
  const m = text.match(/\b(?:season|s)\s*0*(\d+)\b/i);
  if (m) return parseInt(m[1], 10);
  return 1;
}

/**
 * Extracts episode number from a hit if available.
 */
export function getHitEpisodeNumber(h: any): number | undefined {
  const text = `${h.file_name || ''} ${h.fileName || ''} ${h.label || ''}`.toLowerCase();
  const m = text.match(/\b(?:episode|ep|e)\s*0*(\d+)\b/i);
  if (m) return parseInt(m[1], 10);
  return undefined;
}

/**
 * Checks if a post / hits collection represents a series.
 */
export function isSeriesPostOrHits(hits: any[], pageUrl: string = '', postData?: any): boolean {
  if (postData?.is_series) return true;
  if (postData?.is_movie) return false;
  if (/\b(season|seasons|s\d+|series|episodes|tv-shows|tv-series)\b/i.test(pageUrl)) return true;
  if (/\b(movie|film)\b/i.test(pageUrl) && !/\b(season|s\d+|ep\d+)\b/i.test(pageUrl)) return false;

  if (!hits || hits.length === 0) return false;

  return hits.some((h) => {
    const text = `${h.file_name || ''} ${h.fileName || ''} ${h.label || ''} ${h.quality || ''} ${h.rawQuality || ''} ${h.url || ''}`.toLowerCase();
    return (
      text.includes('season') ||
      text.includes('episode') ||
      text.includes('single ep') ||
      text.includes('single episode') ||
      text.includes('full season') ||
      text.includes('all episodes') ||
      /\b(?:s|season)\s*0*(\d+)\b/i.test(text) ||
      /\b(?:ep|episode|e)\s*0*(\d+)\b/i.test(text) ||
      Boolean(h.isSeries || h.is_series || h.isFullSeasonZIP || h.isFullSeasonMKV || h.isEpisode)
    );
  });
}

export interface SeriesSelectionResult {
  canAutoSelect: boolean;
  selectedIndices: number[];
  selectedHits: any[];
  reason?: string;
}

/**
 * Series-specific selection logic strictly for MoviesDrive & HDHub4U.
 * Auto-selects with popup if ALL available seasons have 480p, 720p, 1080p ZIPs AND 720p single episodes.
 * Non-HEVC is selected, unless 1080p zip > 10GB in which case 1080p HEVC is selected.
 * If any season lacks any condition, falls back to manual selection (canAutoSelect: false).
 */
export function selectMoviesdriveOrHdhub4uSeriesLinks(hits: any[], pageUrl: string = ''): SeriesSelectionResult {
  if (!hits || hits.length === 0) {
    return { canAutoSelect: false, selectedIndices: [], selectedHits: [], reason: 'No hits available' };
  }

  // Filter out sample items & gdflix
  const nonGdflixEntries: { item: any; originalIndex: number }[] = [];
  hits.forEach((item, originalIndex) => {
    const u = (item.url || '').toLowerCase();
    const name = (item.file_name || '').toLowerCase();
    if (u.includes('gdflix') || name.includes('gdflix')) return;
    if (
      item.is_sample ||
      item.isSample ||
      /\bsample\b/i.test(item.file_name || '') ||
      /\bsample\b/i.test(item.label || '') ||
      /\bsample\b/i.test(item.url || '')
    ) {
      return;
    }
    nonGdflixEntries.push({ item, originalIndex });
  });

  if (nonGdflixEntries.length === 0) {
    return { canAutoSelect: false, selectedIndices: [], selectedHits: [], reason: 'No non-gdflix candidate links' };
  }

  // Check if this is a pure episode archive or episode-only page (e.g., mdrive.lol/archive/ or no zip/pack items)
  const hasAnyZip = nonGdflixEntries.some(entry => 
    isHitZipOrPack(entry.item) || 
    /\b(zip|pack|batch|complete)\b/i.test(`${entry.item.file_name || ''} ${entry.item.label || ''}`)
  );
  const isArchivePage = pageUrl.includes('/archive/') || pageUrl.includes('archive') || !hasAnyZip;

  if (isArchivePage && !hasAnyZip) {
    // Pure episode collection / archive page: auto-select ALL episodes
    const nonHevcEpisodes = nonGdflixEntries.filter(e => !isHitHevc(e.item));
    const candidateEpisodes = nonHevcEpisodes.length > 0 ? nonHevcEpisodes : nonGdflixEntries;

    // If multiple resolutions exist in the archive, prefer 720p if available
    const has720p = candidateEpisodes.some(e => getHitResolution(e.item) === '720p');
    const filteredByRes = has720p ? candidateEpisodes.filter(e => getHitResolution(e.item) === '720p') : candidateEpisodes;

    // Group by episode number to pick unique episodes (avoiding duplicates if any)
    const epByNumber = new Map<string, { item: any; originalIndex: number }[]>();
    filteredByRes.forEach(e => {
      const epNum = getHitEpisodeNumber(e.item);
      const key = epNum !== undefined ? `ep_${epNum}` : `idx_${e.originalIndex}`;
      const list = epByNumber.get(key) || [];
      list.push(e);
      epByNumber.set(key, list);
    });

    const chosenEpisodes: { item: any; originalIndex: number }[] = [];
    for (const [, candidates] of epByNumber.entries()) {
      if (candidates.length === 1) {
        chosenEpisodes.push(candidates[0]);
      } else {
        // Pick largest size to avoid smaller HEVC/compressed variants
        const sorted = [...candidates].sort((a, b) => getHitSizeGB(b.item) - getHitSizeGB(a.item));
        chosenEpisodes.push(sorted[0]);
      }
    }

    if (chosenEpisodes.length > 0) {
      const uniqueIndices = Array.from(new Set(chosenEpisodes.map(e => e.originalIndex)));
      const selectedHits = uniqueIndices.map(idx => hits[idx]).filter(Boolean);
      return {
        canAutoSelect: true,
        selectedIndices: uniqueIndices,
        selectedHits: selectedHits,
        reason: `Auto-selected all ${selectedHits.length} episodes from archive`
      };
    }
  }

  // Group entries by season number
  const seasonMap = new Map<number, { item: any; originalIndex: number }[]>();
  nonGdflixEntries.forEach(entry => {
    const sNum = getHitSeasonNumber(entry.item);
    const list = seasonMap.get(sNum) || [];
    list.push(entry);
    seasonMap.set(sNum, list);
  });

  if (seasonMap.size === 0) {
    return { canAutoSelect: false, selectedIndices: [], selectedHits: [], reason: 'No season detected' };
  }

  const allSelectedEntries: { item: any; originalIndex: number }[] = [];

  const pickSmallest = (entries: { item: any; originalIndex: number }[]): { item: any; originalIndex: number } | undefined => {
    if (!entries || entries.length === 0) return undefined;
    if (entries.length === 1) return entries[0];
    const sorted = [...entries].sort((a, b) => {
      const sA = getHitSizeGB(a.item);
      const sB = getHitSizeGB(b.item);
      if (sA > 0 && sB > 0) return sA - sB;
      if (sA > 0 && sB <= 0) return -1;
      if (sB > 0 && sA <= 0) return 1;
      return 0;
    });
    return sorted[0];
  };

  for (const [seasonNum, seasonItems] of seasonMap.entries()) {
    const zips: { item: any; originalIndex: number }[] = [];
    const episodes: { item: any; originalIndex: number }[] = [];

    seasonItems.forEach(entry => {
      if (isHitZipOrPack(entry.item)) {
        zips.push(entry);
      } else if (isHitSingleEpisode(entry.item)) {
        episodes.push(entry);
      } else {
        const text = `${entry.item.file_name || ''} ${entry.item.label || ''}`.toLowerCase();
        if (text.includes('ep') || text.includes('episode') || /\be\d+\b/i.test(text)) {
          episodes.push(entry);
        } else if (text.includes('zip') || text.includes('pack') || text.includes('batch') || text.includes('complete')) {
          zips.push(entry);
        } else {
          episodes.push(entry);
        }
      }
    });

    // -------------------------------------------------------------
    // Condition 1: 480p Zip available (without HEVC)
    // -------------------------------------------------------------
    const zips480p = zips.filter(z => getHitResolution(z.item) === '480p');
    const nonHevc480pZips = zips480p.filter(z => !isHitHevc(z.item));
    if (nonHevc480pZips.length === 0) {
      return {
        canAutoSelect: false,
        selectedIndices: [],
        selectedHits: [],
        reason: `Season ${seasonNum}: Missing 480p non-HEVC ZIP (found ${zips480p.length} 480p zips)`
      };
    }
    const chosen480pZip = pickSmallest(nonHevc480pZips);
    if (!chosen480pZip) {
      return {
        canAutoSelect: false,
        selectedIndices: [],
        selectedHits: [],
        reason: `Season ${seasonNum}: Could not determine 480p ZIP`
      };
    }

    // -------------------------------------------------------------
    // Condition 2: 720p Zip available (without HEVC)
    // -------------------------------------------------------------
    const zips720p = zips.filter(z => getHitResolution(z.item) === '720p');
    const nonHevc720pZips = zips720p.filter(z => !isHitHevc(z.item));
    if (nonHevc720pZips.length === 0) {
      return {
        canAutoSelect: false,
        selectedIndices: [],
        selectedHits: [],
        reason: `Season ${seasonNum}: Missing 720p non-HEVC ZIP (found ${zips720p.length} 720p zips)`
      };
    }
    const chosen720pZip = pickSmallest(nonHevc720pZips);
    if (!chosen720pZip) {
      return {
        canAutoSelect: false,
        selectedIndices: [],
        selectedHits: [],
        reason: `Season ${seasonNum}: Could not determine 720p ZIP`
      };
    }

    // -------------------------------------------------------------
    // Condition 3: 1080p Zip available
    // Rule: Select lower size of 1080p that is under 10GB.
    // If no 1080p non-HEVC is under 10GB, then select HEVC for 1080p.
    // -------------------------------------------------------------
    const zips1080p = zips.filter(z => getHitResolution(z.item) === '1080p');
    const nonHevc1080pZips = zips1080p.filter(z => !isHitHevc(z.item));
    const hevc1080pZips = zips1080p.filter(z => isHitHevc(z.item));

    let chosen1080pZip: { item: any; originalIndex: number } | undefined;

    // Filter non-HEVC 1080p ZIPs that are under 10GB (<= 10.0 GB)
    const nonHevcUnder10GB = nonHevc1080pZips.filter(z => {
      const s = getHitSizeGB(z.item);
      return s > 0 && s <= 10.0;
    });

    if (nonHevcUnder10GB.length > 0) {
      // Select the lower size of 1080p non-HEVC that is under 10GB
      chosen1080pZip = pickSmallest(nonHevcUnder10GB);
    } else if (hevc1080pZips.length > 0) {
      // If no 1080p non-HEVC under 10GB, select HEVC for 1080p (lower size if multiple)
      chosen1080pZip = pickSmallest(hevc1080pZips);
    } else if (nonHevc1080pZips.length > 0) {
      // No non-HEVC under 10GB and no HEVC is available
      const smallestNonHevc = pickSmallest(nonHevc1080pZips)!;
      const sizeGB = getHitSizeGB(smallestNonHevc.item);
      if (sizeGB > 10.0) {
        return {
          canAutoSelect: false,
          selectedIndices: [],
          selectedHits: [],
          reason: `Season ${seasonNum}: 1080p non-HEVC ZIP exceeds 10GB (${sizeGB.toFixed(1)}GB) and no HEVC 1080p ZIP available`
        };
      }
      chosen1080pZip = smallestNonHevc;
    } else {
      // Missing 1080p ZIP completely
      return {
        canAutoSelect: false,
        selectedIndices: [],
        selectedHits: [],
        reason: `Season ${seasonNum}: Missing 1080p ZIP`
      };
    }

    if (!chosen1080pZip) {
      return {
        canAutoSelect: false,
        selectedIndices: [],
        selectedHits: [],
        reason: `Season ${seasonNum}: Could not determine 1080p ZIP`
      };
    }

    // -------------------------------------------------------------
    // Condition 4: 720p single episodes available
    // Rule: Select all 720p episodes but avoid selecting 720p HEVC episodes.
    // (x265 / HEVC / smaller size is HEVC -> avoid them; if not available, fallback)
    // -------------------------------------------------------------
    const ep720p = episodes.filter(e => getHitResolution(e.item) === '720p');
    if (ep720p.length === 0) {
      return {
        canAutoSelect: false,
        selectedIndices: [],
        selectedHits: [],
        reason: `Season ${seasonNum}: Missing 720p single episodes`
      };
    }

    // Check if there is an archive / single episode parent link
    const singleEpArchiveRows = ep720p.filter(e => {
      const text = `${e.item.file_name || ''} ${e.item.label || ''}`.toLowerCase();
      return text.includes('single episode') || text.includes('single ep');
    });

    const chosen720pEpisodes: { item: any; originalIndex: number }[] = [];

    if (singleEpArchiveRows.length > 0) {
      // Archive link mode (e.g. MoviesDrive single episode link)
      const nonHevcArchiveRows = singleEpArchiveRows.filter(e => !isHitHevc(e.item));
      if (nonHevcArchiveRows.length === 0) {
        return {
          canAutoSelect: false,
          selectedIndices: [],
          selectedHits: [],
          reason: `Season ${seasonNum}: Only HEVC 720p Single Episode link available (missing standard non-HEVC 720p)`
        };
      }
      chosen720pEpisodes.push(nonHevcArchiveRows[0]);
    } else {
      // Direct episode links (e.g. HDHub4U or direct episode list)
      const nonHevcEp720p = ep720p.filter(e => !isHitHevc(e.item));
      if (nonHevcEp720p.length === 0) {
        return {
          canAutoSelect: false,
          selectedIndices: [],
          selectedHits: [],
          reason: `Season ${seasonNum}: Only HEVC 720p episodes available`
        };
      }

      // Group by episode number
      const epByNumber = new Map<number, { item: any; originalIndex: number }[]>();
      nonHevcEp720p.forEach(e => {
        const epNum = getHitEpisodeNumber(e.item) ?? 0;
        const list = epByNumber.get(epNum) || [];
        list.push(e);
        epByNumber.set(epNum, list);
      });

      for (const [, candidates] of epByNumber.entries()) {
        if (candidates.length === 1) {
          chosen720pEpisodes.push(candidates[0]);
        } else {
          // If multiple candidates exist for the same episode, pick the larger size to avoid the smaller HEVC variant
          const sortedBySizeDesc = [...candidates].sort((a, b) => getHitSizeGB(b.item) - getHitSizeGB(a.item));
          chosen720pEpisodes.push(sortedBySizeDesc[0]);
        }
      }
    }

    if (chosen720pEpisodes.length === 0) {
      return {
        canAutoSelect: false,
        selectedIndices: [],
        selectedHits: [],
        reason: `Season ${seasonNum}: No valid 720p non-HEVC single episodes selected`
      };
    }

    // Add all approved items for this season
    allSelectedEntries.push(chosen480pZip);
    allSelectedEntries.push(chosen720pZip);
    allSelectedEntries.push(chosen1080pZip);
    allSelectedEntries.push(...chosen720pEpisodes);
  }

  const uniqueIndices = Array.from(new Set(allSelectedEntries.map(e => e.originalIndex)));
  const selectedHits = uniqueIndices.map(idx => hits[idx]).filter(Boolean);

  return {
    canAutoSelect: true,
    selectedIndices: uniqueIndices,
    selectedHits: selectedHits,
  };
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

function isPackOrSeriesHit(h: any): boolean {
  const text = `${h.file_name || ''} ${h.fileName || ''} ${h.label || ''} ${h.rawQuality || ''} ${h.url || ''}`.toLowerCase();
  return (
    Boolean(h.isFullSeasonMKV || h.isFullSeasonZIP || h.isSeries || h.is_series) ||
    /\b(season|seasons|complete|pack|zip|batch|all\s*episodes|s\d+|ep\s*\d+|web-series|series)\b/i.test(text)
  );
}

/**
 * Helper to select standard quality set from a pool of candidate hits:
 * - 480p: At most 1 (prefer non-HEVC, fallback to HEVC, smallest size)
 * - 720p: Smallest size 720p; if > 1.45GB also smallest 720p HEVC; fallback to 720p HEVC if no 720p
 * - 1080p: At most 1 (prefer < 5GB for single movie, smallest size, standard or HEVC; for series packs allow full pack size)
 * - 4K: Smallest size if < 10GB (or smallest available if series pack)
 */
function selectStandardQualityPool(candidateHits: any[]): any[] {
  const selected: any[] = [];
  if (!candidateHits || candidateHits.length === 0) return selected;

  const isSeriesOrPack = candidateHits.some(isPackOrSeriesHit);

  const all480p = candidateHits.filter((h) => getHitResolution(h) === '480p' && !isHitHevc(h));
  const all480pHevc = candidateHits.filter((h) => getHitResolution(h) === '480p' && isHitHevc(h));
  const hit480p = getSmallestHit(all480p);
  const hit480pHevc = getSmallestHit(all480pHevc);

  const all720p = candidateHits.filter((h) => getHitResolution(h) === '720p' && !isHitHevc(h));
  const all720pHevc = candidateHits.filter((h) => getHitResolution(h) === '720p' && isHitHevc(h));
  const hit720p = getSmallestHit(all720p);
  const hit720pHevc = getSmallestHit(all720pHevc);

  // 1080p candidates
  const all1080pRaw = candidateHits.filter((h) => getHitResolution(h) === '1080p' && !isHitHevc(h));
  const all1080pHevc = candidateHits.filter((h) => getHitResolution(h) === '1080p' && isHitHevc(h));

  // Priority: x264 has first priority over Hybrid, H264, or H265
  const has1080pX264 = all1080pRaw.some(isHitX264);
  const all1080p = has1080pX264
    ? all1080pRaw.filter(h => isHitX264(h) && !isHitH264OrHybrid(h))
    : all1080pRaw.filter(h => !isHitH264OrHybrid(h)).length > 0
      ? all1080pRaw.filter(h => !isHitH264OrHybrid(h))
      : all1080pRaw;

  const cand1080pUnder5GB = all1080p.filter((h) => {
    const sizeGB = getHitSizeGB(h);
    return sizeGB === 0 || sizeGB < 5.0;
  });
  const cand1080pHevcUnder5GB = all1080pHevc.filter((h) => {
    const sizeGB = getHitSizeGB(h);
    return sizeGB === 0 || sizeGB < 5.0;
  });

  // For series packs or when candidates only have links >= 5GB, allow smallest available
  const pool1080p = (cand1080pUnder5GB.length > 0) ? cand1080pUnder5GB : (isSeriesOrPack || cand1080pHevcUnder5GB.length === 0 ? all1080p : []);
  const pool1080pHevc = (cand1080pHevcUnder5GB.length > 0) ? cand1080pHevcUnder5GB : (isSeriesOrPack || cand1080pUnder5GB.length === 0 ? all1080pHevc : []);

  const hit1080p = getSmallestHit(pool1080p.length > 0 ? pool1080p : all1080p);
  const hit1080pHevc = getSmallestHit(pool1080pHevc.length > 0 ? pool1080pHevc : all1080pHevc);

  // 4K candidates: prefer < 10GB, allow smallest available for series packs
  const all4k = candidateHits.filter((h) => getHitResolution(h) === '4k');
  const cand4kUnder10GB = all4k.filter((h) => {
    const sizeGB = getHitSizeGB(h);
    return sizeGB === 0 || sizeGB < 10;
  });
  const hit4k = getSmallestHit(cand4kUnder10GB.length > 0 ? cand4kUnder10GB : (isSeriesOrPack ? all4k : []));

  // 1. 480p selection: strictly at most ONE 480p link
  if (hit480p) {
    selected.push(hit480p);
  } else if (hit480pHevc) {
    selected.push(hit480pHevc);
  }

  // 2. 720p selection:
  // Always select smaller size 720p. If > 1.45GB, also select 720p HEVC. If 720p not available, select 720p HEVC.
  if (hit720p) {
    selected.push(hit720p);
    const size720p = getHitSizeGB(hit720p);
    if (size720p > 1.45 && hit720pHevc) {
      selected.push(hit720pHevc);
    }
  } else if (hit720pHevc) {
    selected.push(hit720pHevc);
  }

  // 3. 1080p selection: strictly at most ONE 1080p link
  if (hit1080p && hit1080pHevc) {
    const sStd = getHitSizeGB(hit1080p);
    const sHevc = getHitSizeGB(hit1080pHevc);
    if (sStd > 0 && sStd < 5.0) {
      selected.push(hit1080p);
    } else if (sHevc > 0 && sHevc < 5.0) {
      selected.push(hit1080pHevc);
    } else {
      selected.push(hit1080p);
    }
  } else if (hit1080p) {
    selected.push(hit1080p);
  } else if (hit1080pHevc) {
    selected.push(hit1080pHevc);
  }

  // 4. 4K selection:
  if (hit4k) {
    selected.push(hit4k);
  }

  return selected;
}

/**
 * ============================================================================
 * FILMYGO LINK SELECTION (Strictly isolated domain logic)
 * Always selects links no matter series or movie according to selection criteria:
 * - Excludes gdflix links
 * - Prefers Hindi line if present
 * - 480p: at most 1 link (prefer non-HEVC, fallback to HEVC, smallest size)
 * - 720p: smallest size 720p; if >1.45GB also select 720p HEVC; fallback to 720p HEVC
 * - 1080p: at most 1 link < 5GB (smallest size)
 * - 4K: < 10GB
 * - Includes sample link if present
 * - Works consistently for single titles, multi-episodes, and packs
 * ============================================================================
 */
export function filterFilmygoHits(hits: any[], pageUrl: string = ''): any[] {
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

  // Separate sample hits
  const isSampleHit = (h: any): boolean => {
    return Boolean(
      h.is_sample ||
      h.isSample ||
      /\bsample\b/i.test(h.file_name || '') ||
      /\bsample\b/i.test(h.fileName || '') ||
      /\bsample\b/i.test(h.label || '') ||
      /\bsample\b/i.test(h.quality || '') ||
      /\bsample\b/i.test(h.url || '')
    );
  };

  const sampleHits = effectiveHits.filter(isSampleHit);
  const regularHits = effectiveHits.filter((h) => !isSampleHit(h));
  const candidateHits = regularHits.length > 0 ? regularHits : effectiveHits;

  // Detect if hits contain multiple distinct episode numbers (e.g. S01E01, Ep 02, etc.)
  const episodeMap = new Map<string, any[]>();
  let hasMultipleEpisodes = false;

  for (const h of candidateHits) {
    const raw = `${h.file_name || ''} ${h.label || ''} ${h.url || ''}`;
    const parsed = extractTitleAndYear(raw);
    if (parsed.episode !== undefined && parsed.episode > 0) {
      const epKey = `s${parsed.season || 1}e${parsed.episode}`;
      if (!episodeMap.has(epKey)) episodeMap.set(epKey, []);
      episodeMap.get(epKey)!.push(h);
    }
  }

  if (episodeMap.size > 1) {
    hasMultipleEpisodes = true;
  }

  const selected: any[] = [];

  if (hasMultipleEpisodes) {
    // For episodic series: select standard qualities for every episode
    for (const [, epHits] of episodeMap.entries()) {
      selected.push(...selectStandardQualityPool(epHits));
    }
  } else {
    // For movies, single packs, or general posts: select standard qualities
    selected.push(...selectStandardQualityPool(candidateHits));
  }

  // Attach sample hit if available
  if (sampleHits.length > 0) {
    selected.push(sampleHits[0]);
  }

  // Deduplicate selected hits by URL
  const uniqueSelected: any[] = [];
  const seenSelectedUrls = new Set<string>();

  for (const item of selected) {
    if (!item || !item.url) continue;
    const norm = String(item.url).trim().toLowerCase();
    if (seenSelectedUrls.has(norm)) continue;
    seenSelectedUrls.add(norm);
    uniqueSelected.push(item);
  }

  return uniqueSelected;
}

/**
 * ============================================================================
 * MOVIESDRIVE LINK SELECTION (Strictly isolated domain logic)
 * ============================================================================
 */
export function filterMoviesdriveHits(hits: any[], pageUrl: string = ''): any[] {
  if (!hits || hits.length === 0) return [];

  const nonGdflixHits = hits.filter((h) => {
    const u = (h.url || '').toLowerCase();
    const name = (h.file_name || '').toLowerCase();
    return !u.includes('gdflix') && !name.includes('gdflix');
  });
  if (nonGdflixHits.length === 0) return [];

  // Series-specific selection logic for MoviesDrive
  if (isSeriesPostOrHits(nonGdflixHits, pageUrl)) {
    const seriesResult = selectMoviesdriveOrHdhub4uSeriesLinks(nonGdflixHits, pageUrl);
    if (seriesResult.canAutoSelect && seriesResult.selectedHits.length > 0) {
      return seriesResult.selectedHits;
    }
    // Fallback for manual selection
    return [];
  }

  // Movie selection logic (100% untouched)
  const isSampleHit = (h: any): boolean => {
    return Boolean(
      h.is_sample ||
      h.isSample ||
      /\bsample\b/i.test(h.file_name || '') ||
      /\bsample\b/i.test(h.fileName || '') ||
      /\bsample\b/i.test(h.label || '') ||
      /\bsample\b/i.test(h.quality || '') ||
      /\bsample\b/i.test(h.url || '')
    );
  };

  const sampleHits = nonGdflixHits.filter(isSampleHit);
  const regularHits = nonGdflixHits.filter((h) => !isSampleHit(h));
  const candidateHits = regularHits.length > 0 ? regularHits : nonGdflixHits;

  const selected = selectStandardQualityPool(candidateHits);
  if (sampleHits.length > 0) {
    selected.push(sampleHits[0]);
  }

  const uniqueSelected: any[] = [];
  const seenSelectedUrls = new Set<string>();
  for (const item of selected) {
    if (!item || !item.url) continue;
    const norm = String(item.url).trim().toLowerCase();
    if (seenSelectedUrls.has(norm)) continue;
    seenSelectedUrls.add(norm);
    uniqueSelected.push(item);
  }
  return uniqueSelected;
}

/**
 * ============================================================================
 * HDHUB4U LINK SELECTION (Strictly isolated domain logic)
 * ============================================================================
 */
export function filterHdhub4uHits(hits: any[], pageUrl: string = ''): any[] {
  if (!hits || hits.length === 0) return [];

  const nonGdflixHits = hits.filter((h) => {
    const u = (h.url || '').toLowerCase();
    const name = (h.file_name || '').toLowerCase();
    return !u.includes('gdflix') && !name.includes('gdflix');
  });
  if (nonGdflixHits.length === 0) return [];

  // Series-specific selection logic for HDHub4U
  if (isSeriesPostOrHits(nonGdflixHits, pageUrl)) {
    const seriesResult = selectMoviesdriveOrHdhub4uSeriesLinks(nonGdflixHits, pageUrl);
    if (seriesResult.canAutoSelect && seriesResult.selectedHits.length > 0) {
      return seriesResult.selectedHits;
    }
    // Fallback for manual selection
    return [];
  }

  // Movie selection logic (100% untouched)
  const isSampleHit = (h: any): boolean => {
    return Boolean(
      h.is_sample ||
      h.isSample ||
      /\bsample\b/i.test(h.file_name || '') ||
      /\bsample\b/i.test(h.fileName || '') ||
      /\bsample\b/i.test(h.label || '') ||
      /\bsample\b/i.test(h.quality || '') ||
      /\bsample\b/i.test(h.url || '')
    );
  };

  const sampleHits = nonGdflixHits.filter(isSampleHit);
  const regularHits = nonGdflixHits.filter((h) => !isSampleHit(h));
  const candidateHits = regularHits.length > 0 ? regularHits : nonGdflixHits;

  const selected = selectStandardQualityPool(candidateHits);
  if (sampleHits.length > 0) {
    selected.push(sampleHits[0]);
  }

  const uniqueSelected: any[] = [];
  const seenSelectedUrls = new Set<string>();
  for (const item of selected) {
    if (!item || !item.url) continue;
    const norm = String(item.url).trim().toLowerCase();
    if (seenSelectedUrls.has(norm)) continue;
    seenSelectedUrls.add(norm);
    uniqueSelected.push(item);
  }
  return uniqueSelected;
}

/**
 * ============================================================================
 * SKYMOVIESHD LINK SELECTION (Strictly isolated domain logic)
 * ============================================================================
 */
export function filterSkymoviesHits(hits: any[], pageUrl: string = ''): any[] {
  if (!hits || hits.length === 0) return [];

  const nonGdflixHits = hits.filter((h) => {
    const u = (h.url || '').toLowerCase();
    const name = (h.file_name || '').toLowerCase();
    return !u.includes('gdflix') && !name.includes('gdflix');
  });
  if (nonGdflixHits.length === 0) return [];

  if (isSeriesPostOrHits(nonGdflixHits, pageUrl)) {
    const seriesResult = selectMoviesdriveOrHdhub4uSeriesLinks(nonGdflixHits, pageUrl);
    if (seriesResult.canAutoSelect && seriesResult.selectedHits.length > 0) {
      return seriesResult.selectedHits;
    }
  }

  const isSampleHit = (h: any): boolean => {
    return Boolean(
      h.is_sample ||
      h.isSample ||
      /\bsample\b/i.test(h.file_name || '') ||
      /\bsample\b/i.test(h.fileName || '') ||
      /\bsample\b/i.test(h.label || '') ||
      /\bsample\b/i.test(h.quality || '') ||
      /\bsample\b/i.test(h.url || '')
    );
  };

  const sampleHits = nonGdflixHits.filter(isSampleHit);
  const regularHits = nonGdflixHits.filter((h) => !isSampleHit(h));
  const candidateHits = regularHits.length > 0 ? regularHits : nonGdflixHits;

  // Enrich hits that lack resolution tag using pageUrl
  const pageRes = getHitResolution({ url: pageUrl, file_name: pageUrl });
  const enrichedHits = candidateHits.map((h) => {
    if (getHitResolution(h) === 'other' && pageRes !== 'other') {
      return {
        ...h,
        file_name: `${h.file_name || ''} ${pageRes}`.trim()
      };
    }
    return h;
  });

  // If pageUrl points to a specific resolution post (e.g. 1080p, 720p, 480p)
  if (pageRes !== 'other') {
    const hitsForPageRes = enrichedHits.filter(h => getHitResolution(h) === pageRes);
    if (hitsForPageRes.length > 0) {
      let chosenHits: any[] = [];
      if (pageRes === '1080p') {
        const x264Hits = hitsForPageRes.filter(h => isHitX264(h) && !isHitH264OrHybrid(h));
        if (x264Hits.length > 0) {
          const best = getSmallestHit(x264Hits);
          chosenHits = best ? [best] : [x264Hits[0]];
        } else {
          const nonHybridHits = hitsForPageRes.filter(h => !isHitH264OrHybrid(h));
          if (nonHybridHits.length > 0) {
            const best = getSmallestHit(nonHybridHits);
            chosenHits = best ? [best] : [nonHybridHits[0]];
          } else {
            const best = getSmallestHit(hitsForPageRes);
            chosenHits = best ? [best] : [hitsForPageRes[0]];
          }
        }
      } else {
        const pool = selectStandardQualityPool(hitsForPageRes);
        chosenHits = pool.length > 0 ? pool : [hitsForPageRes[0]];
      }

      if (sampleHits.length > 0) {
        chosenHits.push(sampleHits[0]);
      }

      const uniqueHits: any[] = [];
      const seen = new Set<string>();
      for (const item of chosenHits) {
        if (!item || !item.url) continue;
        const norm = String(item.url).trim().toLowerCase();
        if (seen.has(norm)) continue;
        seen.add(norm);
        uniqueHits.push(item);
      }
      return uniqueHits;
    }
  }

  let selected = selectStandardQualityPool(enrichedHits);

  // If selectStandardQualityPool returned nothing, fallback to candidate hits
  if (selected.length === 0 && candidateHits.length > 0) {
    selected = [...candidateHits];
  }

  if (sampleHits.length > 0) {
    selected.push(sampleHits[0]);
  }

  const uniqueSelected: any[] = [];
  const seenSelectedUrls = new Set<string>();
  for (const item of selected) {
    if (!item || !item.url) continue;
    const norm = String(item.url).trim().toLowerCase();
    if (seenSelectedUrls.has(norm)) continue;
    seenSelectedUrls.add(norm);
    uniqueSelected.push(item);
  }
  return uniqueSelected;
}

/**
 * ============================================================================
 * FILMYFLY LINK SELECTION (Strictly isolated domain logic)
 * ============================================================================
 */
export function filterFilmyflyHits(hits: any[], pageUrl: string = ''): any[] {
  if (!hits || hits.length === 0) return [];

  const nonGdflixHits = hits.filter((h) => {
    const u = (h.url || '').toLowerCase();
    const name = (h.file_name || '').toLowerCase();
    return !u.includes('gdflix') && !name.includes('gdflix');
  });
  if (nonGdflixHits.length === 0) return [];

  const isSampleHit = (h: any): boolean => {
    return Boolean(
      h.is_sample ||
      h.isSample ||
      /\bsample\b/i.test(h.file_name || '') ||
      /\bsample\b/i.test(h.fileName || '') ||
      /\bsample\b/i.test(h.label || '') ||
      /\bsample\b/i.test(h.quality || '') ||
      /\bsample\b/i.test(h.url || '')
    );
  };

  const sampleHits = nonGdflixHits.filter(isSampleHit);
  const regularHits = nonGdflixHits.filter((h) => !isSampleHit(h));
  const candidateHits = regularHits.length > 0 ? regularHits : nonGdflixHits;

  const selected = selectStandardQualityPool(candidateHits);
  if (sampleHits.length > 0) {
    selected.push(sampleHits[0]);
  }

  const uniqueSelected: any[] = [];
  const seenSelectedUrls = new Set<string>();
  for (const item of selected) {
    if (!item || !item.url) continue;
    const norm = String(item.url).trim().toLowerCase();
    if (seenSelectedUrls.has(norm)) continue;
    seenSelectedUrls.add(norm);
    uniqueSelected.push(item);
  }
  return uniqueSelected;
}

/**
 * Resolves quality category from result or scraped item.
 */
export function getItemQualityCategory(item: {
  qualityLabel?: string;
  rawQuality?: string;
  fileName?: string;
  file_name?: string;
  url?: string;
  finalUrl?: string;
  locationTag?: string;
  quality?: any;
} | any): QualityCategory {
  if (!item) return 'Other';
  const text = `${item.qualityLabel || ''} ${item.rawQuality || ''} ${item.quality || ''} ${
    item.fileName || ''
  } ${item.file_name || ''} ${item.url || ''} ${item.finalUrl || ''} ${item.locationTag || ''}`.toLowerCase();

  return parseQualityCategoryFromText(text);
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

  const inferred = getItemQualityCategory(item);
  let q: QualityCategory = (inferred !== 'Other') ? inferred : item.quality;
  if (!CONFIRMED_QUALITIES.includes(q)) {
    q = getItemQualityCategory(item);
  }

  if (!CONFIRMED_QUALITIES.includes(q)) {
    return null;
  }

  return q;
}

export function getProviderRank(source?: string): number {
  if (!source) return 99;
  const s = source.toLowerCase();
  if (s.includes('filmygo') || s.includes('filmycab') || s.includes('filmy_go')) return 1;
  if (s.includes('moviesdrive') || s.includes('movies_drive')) return 2;
  if (s.includes('hdhub4u') || s.includes('hdhub')) return 3;
  if (s.includes('skymovies') || s.includes('skymovieshd')) return 4;
  if (s.includes('filmyfly') || s.includes('filmy_fly')) return 5;
  return 50;
}

/**
 * Compares two items of the same confirmed quality category (e.g. two 1080p links)
 * and selects based on strict provider sequence (filmygo > moviesdrive > HDHub4U > skymovieshd > Filmyfly),
 * and if from the same provider, picks the one with the LOWER file size.
 */
export function pickLowerSizeQualityItem(a: ScrapedLinkItem, b: ScrapedLinkItem): ScrapedLinkItem {
  const isWorking = (s?: string) =>
    s === 'WORKING' || s === 'REDIRECT' || s === 'SMALL_FILE' || s === 'MISSING_METADATA';
  const aWork = isWorking(a.status);
  const bWork = isWorking(b.status);
  if (aWork && !bWork) return a;
  if (!aWork && bWork) return b;

  // 1. Strict provider sequence: FilmyGo (1) > MoviesDrive (2) > HDHub4U (3) > SkyMoviesHD (4) > FilmyFly (5)
  const rankA = getProviderRank(a.source);
  const rankB = getProviderRank(b.source);
  if (rankA !== rankB) {
    return rankA < rankB ? a : b;
  }

  // 2. Same provider rank: pick lower file size
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
 * Deduplicates quality links with strict rules:
 * - Movies: 480p, 720p, 720p HEVC (when 720p > 1.45GB or fallback), 1080p, 2160p (<10GB)
 * - Provider priority: FilmyGo > MoviesDrive > HDHub4U > SkyMoviesHD > FilmyFly
 * - Lower file size chosen when duplicate from same provider
 */
export function deduplicateQualityLinks(
  items: ScrapedLinkItem[],
  type: 'movie' | 'series' = 'movie'
): ScrapedLinkItem[] {
  if (items.length === 0) return [];

  if (type === 'movie') {
    let best480p: ScrapedLinkItem | undefined;
    let best480pHevc: ScrapedLinkItem | undefined;
    let best720p: ScrapedLinkItem | undefined;
    let best720pHevc: ScrapedLinkItem | undefined;
    let best1080p: ScrapedLinkItem | undefined;
    let best1080pHevc: ScrapedLinkItem | undefined;
    let best2160p: ScrapedLinkItem | undefined;

    for (const it of items) {
      if (it.isSample) continue;

      const confirmedQ = resolveConfirmedQuality(it);
      if (!confirmedQ) continue;

      const normalizedItem: ScrapedLinkItem = {
        ...it,
        quality: confirmedQ,
        label: `${confirmedQ}${it.isHevc ? ' HEVC' : ''}`.trim(),
      };

      if (confirmedQ === '480p') {
        if (it.isHevc) {
          best480pHevc = best480pHevc ? pickLowerSizeQualityItem(normalizedItem, best480pHevc) : normalizedItem;
        } else {
          best480p = best480p ? pickLowerSizeQualityItem(normalizedItem, best480p) : normalizedItem;
        }
      } else if (confirmedQ === '720p') {
        if (it.isHevc) {
          best720pHevc = best720pHevc ? pickLowerSizeQualityItem(normalizedItem, best720pHevc) : normalizedItem;
        } else {
          best720p = best720p ? pickLowerSizeQualityItem(normalizedItem, best720p) : normalizedItem;
        }
      } else if (confirmedQ === '1080p') {
        const sizeGB = getHitSizeGB(it) || parseSizeInGB(it.size) || (it.bytes ? it.bytes / (1024 * 1024 * 1024) : 0);
        if (sizeGB >= 5.0) {
          continue; // Skip 1080p of 5GB or greater
        }
        if (it.isHevc) {
          best1080pHevc = best1080pHevc ? pickLowerSizeQualityItem(normalizedItem, best1080pHevc) : normalizedItem;
        } else {
          best1080p = best1080p ? pickLowerSizeQualityItem(normalizedItem, best1080p) : normalizedItem;
        }
      } else if (confirmedQ === '2160p') {
        const sizeGB = getHitSizeGB(it) || parseSizeInGB(it.size) || (it.bytes ? it.bytes / (1024 * 1024 * 1024) : 0);
        if (sizeGB === 0 || sizeGB < 10) {
          best2160p = best2160p ? pickLowerSizeQualityItem(normalizedItem, best2160p) : normalizedItem;
        }
      }
    }

    const result: ScrapedLinkItem[] = [];

    // 1. 480p selection: strictly at most ONE 480p link (prefer non-HEVC, fallback to HEVC)
    const final480p = best480p || best480pHevc;
    if (final480p) {
      result.push(final480p);
    }

    // 2. 720p selection:
    // Always select 720p. If not available, select 720p HEVC.
    // If 720p is available and greater than 1.45GB, also select 720p HEVC (if available).
    if (best720p) {
      result.push(best720p);
      const size720GB = getHitSizeGB(best720p) || parseSizeInGB(best720p.size) || (best720p.bytes ? best720p.bytes / (1024 * 1024 * 1024) : 0);
      if (size720GB > 1.45 && best720pHevc && normalizeUrl(best720pHevc.url) !== normalizeUrl(best720p.url)) {
        result.push(best720pHevc);
      }
    } else if (best720pHevc) {
      result.push(best720pHevc);
    }

    // 3. 1080p selection: strictly at most ONE 1080p link (< 5GB)
    const final1080p = best1080p || best1080pHevc;
    if (final1080p) {
      const size1080GB = getHitSizeGB(final1080p) || parseSizeInGB(final1080p.size) || (final1080p.bytes ? final1080p.bytes / (1024 * 1024 * 1024) : 0);
      if (size1080GB < 5.0) {
        result.push(final1080p);
      }
    }

    // 4. 2160p selection (<10GB)
    if (best2160p) {
      result.push(best2160p);
    }

    // Safety deduplication: ensure unique URLs and at most one 480p, one 1080p (<5GB), one 2160p
    const seenUrls = new Set<string>();
    const sanitized: ScrapedLinkItem[] = [];
    let count480p = 0;
    let count1080p = 0;
    let count2160p = 0;

    for (const item of result) {
      const norm = normalizeUrl(item.url);
      if (!norm || seenUrls.has(norm)) continue;
      const q = resolveConfirmedQuality(item) || item.quality;
      if (q === '480p') {
        if (count480p > 0) continue;
        count480p++;
      } else if (q === '1080p') {
        const sGB = getHitSizeGB(item) || parseSizeInGB(item.size) || (item.bytes ? item.bytes / (1024 * 1024 * 1024) : 0);
        if (sGB >= 5.0) continue; // Skip 1080p of 5GB or greater
        if (count1080p > 0) continue;
        count1080p++;
      } else if (q === '2160p') {
        const sGB = getHitSizeGB(item) || parseSizeInGB(item.size) || (item.bytes ? item.bytes / (1024 * 1024 * 1024) : 0);
        if (sGB >= 10.0) continue;
        if (count2160p > 0) continue;
        count2160p++;
      }
      seenUrls.add(norm);
      sanitized.push(item);
    }

    return sanitized;
  } else {
    // Episodic series: group by season + episode / pack + confirmed quality
    const episodeQualitySlots: Record<string, ScrapedLinkItem> = {};

    for (const it of items) {
      if (it.isSample) continue;

      const confirmedQ = resolveConfirmedQuality(it);
      if (!confirmedQ) continue;

      if (confirmedQ === '1080p') {
        const sizeGB = getHitSizeGB(it) || parseSizeInGB(it.size) || (it.bytes ? it.bytes / (1024 * 1024 * 1024) : 0);
        if (sizeGB >= 5.0) {
          continue; // Skip 1080p of 5GB or greater
        }
      }

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

      // Strictly at most ONE 480p link per episode/pack, never separate -hevc slot!
      // Strictly at most ONE 1080p link per episode/pack (< 5GB)
      const key = confirmedQ === '480p'
        ? `${seasonKey}-480p`
        : confirmedQ === '1080p'
        ? `${seasonKey}-1080p`
        : `${seasonKey}-${confirmedQ}${normalizedItem.isHevc ? '-hevc' : ''}`;

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

  // Detect year - look for bracketed year first (e.g. (2024), [2024]), or 4 digits (19xx or 20xx)
  const bracketYearMatch = cleanText.match(/[\(\[]\s*(19\d{2}|20[0-2]\d)\s*[\)\]]/);
  const yearPattern = /(?:\D|^)(19\d{2}|20[0-2]\d)(?:\D|$)/;
  const yearMatch = bracketYearMatch || cleanText.match(yearPattern);

  if (yearMatch) {
    year = parseInt(yearMatch[1], 10);
    const yearIndex = cleanText.indexOf(yearMatch[1]);
    title = cleanText.substring(0, yearIndex).trim();
  } else {
    const noiseMarkers = [
      '\\d{3,4}p', '[0-9]k', 'web[-.\\s_]?(dl|rip)',
      'hd[-.\\s_]?rip', 'blu[-.\\s_]?ray', 'bd[-.\\s_]?rip',
      'br[-.\\s_]?rip', 'v\\d+[-.\\s_]?hdtc', 'v\\d+', 'hq[-.\\s_]?hdtc', 'hdtc', 'hdcam', 'dvdrip', 'webrip',
      'lines?', 'line',
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

  const cleanTarget = targetTitle
    .replace(/\s*\(\s*(19\d\d|20[0-2]\d)\s*\)\s*/gi, ' ')
    .replace(/\s*\[\s*(19\d\d|20[0-2]\d)\s*\]\s*/gi, ' ')
    .replace(/\b(19\d\d|20[0-2]\d)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const scored = posts.map((p: any) => {
    const postTitle = p.title || p.postTitle || '';
    const parsed = extractTitleAndYear(postTitle);
    const postCleanTitle = parsed.title || postTitle;

    const isMatch = isPreciseTitleMatch(postCleanTitle, cleanTarget);
    
    let yearScore = 0;
    let yearConflict = false;

    if (expectedYear) {
      let detectedYear = parsed.year;
      // Also inspect post URL for release year if post title text omitted it
      if (!detectedYear && p.url) {
        const urlYearMatch = p.url.match(/(?:\D|^)(19\d{2}|20[0-2]\d)(?:\D|$)/);
        if (urlYearMatch) {
          detectedYear = parseInt(urlYearMatch[1], 10);
        }
      }

      if (detectedYear) {
        const diff = Math.abs(detectedYear - expectedYear);
        if (diff === 0) {
          yearScore = 100;
        } else if (diff === 1) {
          yearScore = 80;
        } else {
          yearScore = -100;
          yearConflict = true;
        }
      } else {
        // No year detected in post title or URL
        yearScore = 0;
      }
    }

    return {
      post: p,
      isMatch,
      yearScore,
      yearConflict,
      parsed,
    };
  });

  // Filter out any post that is not a precise title match or has conflicting year
  const matchingPosts = scored.filter((s) => s.isMatch && !s.yearConflict);
  if (matchingPosts.length === 0) {
    return [];
  }

  // When expectedYear is specified: strictly confirm with year!
  // Only accept posts that confirmed the year (exact match or diff <= 1).
  // If no post on the current page confirmed the year, return [] so the waterfall search
  // continues searching subsequent pages (page 2, 3, etc.) or fallback queries until correctly found.
  if (expectedYear) {
    const confirmedYearPosts = matchingPosts.filter((s) => s.yearScore >= 80);
    if (confirmedYearPosts.length > 0) {
      confirmedYearPosts.sort((a, b) => b.yearScore - a.yearScore);
      return confirmedYearPosts.map((s) => s.post);
    }
    // No post confirmed the year on this page yet
    return [];
  }

  // If no expectedYear was provided, sort by exact title match
  matchingPosts.sort((a, b) => {
    const aExact = a.parsed.title?.toLowerCase() === cleanTarget.toLowerCase() ? 1 : 0;
    const bExact = b.parsed.title?.toLowerCase() === cleanTarget.toLowerCase() ? 1 : 0;
    return bExact - aExact;
  });

  return matchingPosts.map((s) => s.post);
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
