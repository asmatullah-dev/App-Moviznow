import { Language, Quality, QualityLinks } from '../types';
import {
  getFilmygoDomain,
  getMoviesdriveDomain,
  getHdhub4uDomain,
  getSkymoviesDomain,
  getFilmyflyDomain,
  isHubcloudRecoveryLink,
  isHubcloudLibraryLink,
  getHubcloudLibraryUrl,
  normalizeHubcloudDomain,
} from './domains';
import {
  normalizeUrl,
  filterFilmygoHits,
  filterMoviesdriveHits,
  filterHdhub4uHits,
  filterSkymoviesHits,
  filterFilmyflyHits,
  getItemQualityCategory,
  extractTitleAndYear,
  isPreciseTitleMatch,
  rankAndVerifyPosts,
  deduplicateQualityLinks,
  pickLowerSizeQualityItem,
  resolveConfirmedQuality,
  parseSizeToBytes,
  parseSizeInGB,
  getHitSizeGB,
  ScrapedLinkItem,
  QualityCategory,
  buildQualityLinksPayload,
} from './linkSelector';
import {
  scrapeFilmygoPosts,
  scrapeFilmygoPostLinks,
  scrapeMoviesdrivePosts,
  scrapeMoviesdrivePostLinks,
  scrapeHdhub4uPosts,
  scrapeHdhub4uPostLinks,
  scrapeSkymoviesPosts,
  scrapeSkymoviesPostLinks,
  scrapeFilmyflyPosts,
  scrapeFilmyflyPostLinks,
  resolveIntermediateUrls,
} from './scraper';
import {
  performFullLinkScan,
  detectMetadataForLink,
  serverCheckLinksBatch,
  LinkCheckResult,
} from './linkScanner';
import {
  getImportCache,
  saveImportCache,
  removeImportCache,
} from './importCache';
import {
  verifyAndFetchTmdbData,
  VerifiedTmdbMetadata,
} from '../services/tmdbEnricher';
import { isMissingPixeldrain } from './episodeAndQuality';

export {
  deduplicateQualityLinks,
  pickLowerSizeQualityItem,
  resolveConfirmedQuality,
  parseSizeToBytes,
  getImportCache,
  saveImportCache,
  removeImportCache,
};

export interface WaterfallSearchOptions {
  title: string;
  year?: number;
  type?: 'movie' | 'series';
  languages?: Language[];
  qualities?: Quality[];
  signal?: AbortSignal;
  onProgress?: (msg: string) => void;
  maxPostsPerProvider?: number;
  skipCache?: boolean;
  skipTmdbVerification?: boolean;
}

export interface WaterfallSearchResult {
  links: ScrapedLinkItem[];
  qualityLinks: QualityLinks;
  results: LinkCheckResult[];
  tmdbData?: VerifiedTmdbMetadata;
  metadata: {
    title?: string;
    year?: number;
    languages: string[];
    printQuality?: string;
    subtitles?: boolean;
    type?: 'movie' | 'series';
    season?: number;
    episode?: number;
    sampleUrl?: string;
    tmdbData?: VerifiedTmdbMetadata;
    [key: string]: any;
  };
  sample?: ScrapedLinkItem;
  providerUsed: string;
  isComplete: boolean;
  has480p: boolean;
  has720p: boolean;
  has1080p: boolean;
  has2160p: boolean;
  hasHdVersion: boolean;
  stoppedReason?: string;
  logs: string[];
}

function isHdPrint(text: string): boolean {
  const t = text.toLowerCase();
  if (/\b(cam|camrip|predvd|pre-dvd|hdcam|telesync|hdts|ts|tc|dvdscr)\b/i.test(t)) {
    return false;
  }
  return /\b(720p|1080p|2160p|4k|web-dl|webrip|bluray|brrip|hdrip|hdtv)\b/i.test(t);
}

function hasAnyHdLinks(links: ScrapedLinkItem[]): boolean {
  return links.some((l) => {
    if (l.quality === '720p' || l.quality === '1080p' || l.quality === '2160p') {
      const txt = `${l.label} ${l.rawQuality || ''} ${l.fileName || ''}`.toLowerCase();
      return !/\b(cam|camrip|predvd|pre-dvd|hdcam|telesync|hdts)\b/i.test(txt);
    }
    return false;
  });
}

/**
 * Scans candidate URLs and converts them to ScrapedLinkItems
 */
async function scanAndVerifyCandidates(
  candidates: { url: string; source: string; postTitle?: string; isSample?: boolean }[],
  title: string,
  year?: number,
  type: 'movie' | 'series' = 'movie',
  languages: Language[] = [],
  qualities: Quality[] = [],
  signal?: AbortSignal
): Promise<{
  scrapedItems: ScrapedLinkItem[];
  checkResults: LinkCheckResult[];
  metadata: any;
  sample?: ScrapedLinkItem;
}> {
  if (candidates.length === 0) {
    return { scrapedItems: [], checkResults: [], metadata: { title, year, languages: [], type } };
  }

  const uniqueCandidateMap = new Map<string, { url: string; source: string; postTitle?: string; isSample?: boolean }>();
  candidates.forEach((c) => {
    if (isHubcloudRecoveryLink(c.url)) return;
    const norm = normalizeUrl(c.url);
    if (norm && !uniqueCandidateMap.has(norm)) {
      uniqueCandidateMap.set(norm, c);
    }
  });
  const dedupedCandidates = Array.from(uniqueCandidateMap.values());

  const resolvedUrls = await resolveIntermediateUrls(dedupedCandidates, signal);

  const metaMap: Record<string, any> = {};
  const fullTextContext = resolvedUrls.map((r) => `${r.postTitle || ''} ${r.url}`).join('\n');
  resolvedUrls.forEach((r) => {
    metaMap[r.url] = detectMetadataForLink(fullTextContext, r.url, languages, qualities);
  });

  // Fast pre-flight batch checking for non-HubCloud links
  const nonHubcloudUrls = resolvedUrls
    .filter((r) => !/(hubcloud|vcloud|hubdrive|drivehub|gdflix|hubcdn|hblinks)/i.test(r.url))
    .map((r) => r.url);

  if (nonHubcloudUrls.length > 0 && !signal?.aborted) {
    try {
      await serverCheckLinksBatch(nonHubcloudUrls, signal);
    } catch {}
  }

  const checkResults: LinkCheckResult[] = [];
  const queue = [...resolvedUrls];
  const concurrency = 8;

  const worker = async () => {
    while (queue.length > 0) {
      if (signal?.aborted) break;
      const target = queue.shift();
      if (!target) break;

      try {
        const res = await performFullLinkScan(
          target.url,
          metaMap,
          languages,
          qualities,
          signal,
          undefined,
          undefined,
          false
        );
        if (target.isSample) (res as any).isSample = true;
        (res as any).source = target.source;
        checkResults.push(res);
      } catch (err: any) {
        checkResults.push({
          url: target.url,
          ok: false,
          statusLabel: 'UNKNOWN',
          message: err?.message || 'Check failed',
        });
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, resolvedUrls.length) }, () => worker())
  );

  const validResults: LinkCheckResult[] = [];
  for (const r of checkResults) {
    const isWorking =
      r.statusLabel === 'WORKING' ||
      r.statusLabel === 'REDIRECT' ||
      r.statusLabel === 'SMALL_FILE' ||
      r.statusLabel === 'MISSING_FILENAME' ||
      r.statusLabel === 'MISSING_METADATA' ||
      r.statusLabel === 'SIZE_MISMATCH';
    if (!isWorking || !r.url) continue;

    if (isMissingPixeldrain(r)) {
      // If candidates list was empty (e.g. momentary timeout during concurrent batch check),
      // do a fast single targeted re-scan to rescue the working link before fallback
      try {
        const recheck = await performFullLinkScan(
          r.url,
          metaMap,
          languages,
          qualities,
          signal,
          undefined,
          undefined,
          true
        );
        if (r.isSample) (recheck as any).isSample = true;
        (recheck as any).source = (r as any).source;
        if (!isMissingPixeldrain(recheck)) {
          validResults.push(recheck);
          continue;
        }
        validResults.push(recheck);
        continue;
      } catch {}
      validResults.push(r);
      continue;
    }

    validResults.push(r);
  }

  const scrapedItems: ScrapedLinkItem[] = [];
  const detectedLangs = new Set<string>();
  let detectedPrintQuality: string | undefined;
  let detectedSubtitles = false;
  let sampleItem: ScrapedLinkItem | undefined;

  validResults.forEach((r, idx) => {
    const sourceText = `${r.fileName || ''} ${r.finalUrl || r.url || ''}`.toLowerCase();
    const isSample = Boolean(r.isSample || (r as any).is_sample || /\bsample\b/i.test(sourceText));

    // 1. Strict Type Verification: If searching for movie, reject series/season/episode links
    const hasSeriesMarkers = Boolean(
      r.season !== undefined ||
      r.episode !== undefined ||
      r.isFullSeasonMKV ||
      r.isFullSeasonZIP ||
      /\b(s\d+|season\s*\d+|episodes?|ep\s*\d+|e\d+|complete\s*(web\s*)?series|web\s*series)\b/i.test(sourceText)
    );

    if (type === 'movie' && hasSeriesMarkers) {
      return;
    }
    if (type === 'series' && !hasSeriesMarkers) {
      if (/\b(full\s*movie|the\s*movie)\b/i.test(sourceText)) {
        return;
      }
    }

    // 2. Strict Title Verification if fileName is present
    if (r.fileName && title) {
      const fnParsed = extractTitleAndYear(r.fileName);
      const isTitleMatched =
        isPreciseTitleMatch(fnParsed.title, title) ||
        isPreciseTitleMatch(r.fileName, title);

      // If filename has an identifiable title and it does not match target title, reject!
      if (!isTitleMatched && fnParsed.title && fnParsed.title.length > 1) {
        return;
      }
    }

    // 3. Strict Year Verification
    if (year) {
      const linkText = `${r.fileName || ''} ${r.finalUrl || r.url || ''}`;
      const yearMatches = linkText.match(/\b(19\d{2}|20[0-2]\d)\b/g);
      if (yearMatches && yearMatches.length > 0) {
        const yearsFound = yearMatches.map((y) => parseInt(y, 10));
        const exactMatch = yearsFound.includes(year);
        if (!exactMatch) {
          const hasFutureYear = yearsFound.some((y) => y > year);
          const hasDistantYear = yearsFound.some((y) => Math.abs(y - year) > 1);
          if (hasFutureYear || hasDistantYear) {
            return;
          }

          // Past 1-year diff (e.g. 2024 film on OTT in 2025) allowed only with verified title match
          const hasPreviousYear = yearsFound.some((y) => y === year - 1);
          if (hasPreviousYear) {
            const fnParsed = r.fileName ? extractTitleAndYear(r.fileName) : null;
            const isExactTitle = fnParsed?.title ? isPreciseTitleMatch(fnParsed.title, title) : false;
            if (!isExactTitle) {
              return;
            }
          } else {
            return;
          }
        }
      }
    }

    const qCategory = getItemQualityCategory(r);
    const qualityStr = r.qualityLabel || qCategory;

    let sizeFormatted = '';
    const bytes = r.fileSize || 0;
    if (r.fileSizeText) {
      sizeFormatted = r.fileSizeText;
    } else if (bytes > 0) {
      const mb = bytes / (1024 * 1024);
      sizeFormatted = mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(0)} MB`;
    }

    if (r.audioLabel) {
      r.audioLabel.split(' / ').forEach((l) => detectedLangs.add(l.trim()));
    }
    if (r.printQualityLabel && !detectedPrintQuality) {
      detectedPrintQuality = r.printQualityLabel;
    }
    if (r.subtitleLabel || /subtitles|subs|softsub|hardsub|esub|esubs/i.test(sourceText)) {
      detectedSubtitles = true;
    }

    // Strictly reject any recovery links
    if (isHubcloudRecoveryLink(r.url || '') || isHubcloudRecoveryLink(r.finalUrl || '')) {
      return;
    }

    // Strictly select ONLY valid HubCloud links (never raw Pixeldrain or recovery)
    const hubLibraryUrl = getHubcloudLibraryUrl(r);
    if (!hubLibraryUrl) {
      return;
    }

    const hasPixel = hasPixeldrainDownload(r);
    const item: ScrapedLinkItem = {
      id: `bulk-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 4)}`,
      source: (r as any).source || 'FilmyGo',
      sourceTitle: r.fileName || title,
      url: hubLibraryUrl,
      quality: qCategory,
      label: isSample ? 'Sample' : `${qualityStr}${r.codecLabel ? ` ${r.codecLabel}` : ''}`,
      rawQuality: qualityStr,
      audio: r.audioLabel || 'Hindi',
      size: sizeFormatted,
      bytes: bytes,
      season: r.season,
      episode: r.episode,
      isFullSeasonMKV: r.isFullSeasonMKV,
      isFullSeasonZIP: r.isFullSeasonZIP,
      isSample: isSample,
      isHevc: r.codecLabel === 'HEVC' || /hevc|x265|10bit/i.test(sourceText),
      isDual: /dual|multi/i.test(sourceText) || (r.audioLabel && r.audioLabel.includes('Dual')),
      status: r.statusLabel,
      fileName: r.fileName,
      finalUrl: r.finalUrl,
      hasPixeldrain: hasPixel,
      candidates: r.candidates,
    };

    if (isSample && !sampleItem) {
      sampleItem = item;
    }
    scrapedItems.push(item);
  });

  return {
    scrapedItems,
    checkResults,
    metadata: {
      title,
      year,
      languages: Array.from(detectedLangs),
      printQuality: detectedPrintQuality,
      subtitles: detectedSubtitles,
      type,
      sampleUrl: sampleItem?.url,
    },
    sample: sampleItem,
  };
}

export function hasPixeldrainDownload(
  item:
    | ScrapedLinkItem
    | LinkCheckResult
    | {
        url?: string;
        finalUrl?: string;
        candidates?: Array<{ text: string; href: string }>;
        hasPixeldrain?: boolean;
      }
    | null
    | undefined,
  checkResults?: LinkCheckResult[]
): boolean {
  if (!item) return false;
  if ((item as any).hasPixeldrain === true) return true;

  const url = ((item as any).finalUrl || (item as any).url || '').toLowerCase();

  // 1. Direct Pixeldrain URL
  if (
    url.includes('pixeldrain.com') ||
    url.includes('pixeldrain.dev') ||
    url.includes('pixeldrain.net') ||
    url.includes('pixel.drain') ||
    url.includes('pixeldra.in')
  ) {
    return true;
  }

  // 2. Candidates attached directly to item
  const candidates = (item as any).candidates;
  if (Array.isArray(candidates) && candidates.length > 0) {
    const hasPixelCandidate = candidates.some((c) => {
      const text = (c?.text || '').toLowerCase();
      const href = (c?.href || '').toLowerCase();
      return (
        text.includes('pixeldrain') ||
        text.includes('pixel.drain') ||
        text.includes('pixeldra.in') ||
        href.includes('pixeldrain') ||
        href.includes('pixel.drain') ||
        href.includes('pixeldra.in')
      );
    });
    if (hasPixelCandidate) return true;
  }

  // 3. Match against checkResults if provided
  if (checkResults && checkResults.length > 0) {
    const normUrl = normalizeUrl((item as any).url || '');
    const normFinal = normalizeUrl((item as any).finalUrl || '');
    const matched = checkResults.find((r) => {
      const rNorm = normalizeUrl(r.url || '');
      const rFinal = normalizeUrl(r.finalUrl || '');
      return (
        (normUrl && (normUrl === rNorm || normUrl === rFinal)) ||
        (normFinal && (normFinal === rNorm || normFinal === rFinal))
      );
    });
    if (matched) {
      if (
        matched.url?.toLowerCase().includes('pixeldrain') ||
        matched.finalUrl?.toLowerCase().includes('pixeldrain')
      ) {
        return true;
      }
      if (Array.isArray(matched.candidates) && matched.candidates.length > 0) {
        return matched.candidates.some((c) => {
          const text = (c?.text || '').toLowerCase();
          const href = (c?.href || '').toLowerCase();
          return (
            text.includes('pixeldrain') ||
            text.includes('pixel.drain') ||
            text.includes('pixeldra.in') ||
            href.includes('pixeldrain') ||
            href.includes('pixel.drain') ||
            href.includes('pixeldra.in')
          );
        });
      }
    }
  }

  return false;
}

export function isPixeldrainOrHubcloudLink(item: ScrapedLinkItem | string): boolean {
  if (typeof item !== 'string' && hasPixeldrainDownload(item)) return true;
  const text = typeof item === 'string'
    ? item.toLowerCase()
    : `${item.url || ''} ${item.finalUrl || ''} ${item.fileName || ''} ${item.sourceTitle || ''}`.toLowerCase();

  return (
    text.includes('pixeldrain') ||
    text.includes('pixel.drain') ||
    text.includes('pixeldra.in') ||
    text.includes('hubcloud') ||
    text.includes('vcloud') ||
    text.includes('hubdrive') ||
    text.includes('drivehub') ||
    text.includes('hubcdn') ||
    text.includes('hblinks')
  );
}

export interface WaterfallSatisfactionStatus {
  isSatisfied: boolean;
  missingReasons: string[];
  has480pWithPixeldrain: boolean;
  has720pWithPixeldrain: boolean;
  has720pHevcWithPixeldrain: boolean;
  is720pOver145GB: boolean;
  has1080pWithPixeldrain: boolean;
  over5gb1080pFound: boolean;
}

export function evaluateWaterfallSatisfaction(
  links: ScrapedLinkItem[],
  type: 'movie' | 'series' = 'movie',
  checkResults?: LinkCheckResult[]
): WaterfallSatisfactionStatus {
  const missingReasons: string[] = [];

  if (!links || links.length === 0) {
    return {
      isSatisfied: false,
      missingReasons: ['No links discovered yet'],
      has480pWithPixeldrain: false,
      has720pWithPixeldrain: false,
      has720pHevcWithPixeldrain: false,
      is720pOver145GB: false,
      has1080pWithPixeldrain: false,
      over5gb1080pFound: false,
    };
  }

  if (type === 'series') {
    const validSeriesLinks = links.filter((l) => {
      if (l.isSample) return false;
      if (l.quality === '1080p') {
        const sizeGB = getHitSizeGB(l) || parseSizeInGB(l.size) || (l.bytes ? l.bytes / (1024 * 1024 * 1024) : 0);
        if (sizeGB >= 5.0) return false;
      }
      return hasPixeldrainDownload(l, checkResults);
    });

    const isSatisfied = hasAnyHdLinks(validSeriesLinks) && validSeriesLinks.length >= 2;
    if (!isSatisfied) {
      missingReasons.push('Series requires at least 2 HD episode links with Pixeldrain');
    }
    return {
      isSatisfied,
      missingReasons,
      has480pWithPixeldrain: false,
      has720pWithPixeldrain: false,
      has720pHevcWithPixeldrain: false,
      is720pOver145GB: false,
      has1080pWithPixeldrain: false,
      over5gb1080pFound: false,
    };
  }

  // === MOVIE EVALUATION ===
  // 1. Check 480p (strictly non-sample with verified Pixeldrain)
  const nonSample480p = links.filter((l) => l.quality === '480p' && !l.isSample);
  const pixel480p = nonSample480p.filter((l) => hasPixeldrainDownload(l, checkResults));
  const has480pWithPixeldrain = pixel480p.length > 0;

  if (!has480pWithPixeldrain) {
    if (nonSample480p.length > 0) {
      missingReasons.push('480p found but missing Pixeldrain download option');
    } else {
      missingReasons.push('480p missing completely');
    }
  }

  // 2. Check 720p
  const nonSample720p = links.filter((l) => l.quality === '720p' && !l.isSample);
  const nonHevc720p = nonSample720p.filter((l) => !l.isHevc);
  const hevc720p = nonSample720p.filter((l) => l.isHevc);

  const pixelNonHevc720p = nonHevc720p.filter((l) => hasPixeldrainDownload(l, checkResults));
  const pixelHevc720p = hevc720p.filter((l) => hasPixeldrainDownload(l, checkResults));

  let is720pOver145GB = false;
  let smallest720pSizeGB = 0;
  if (nonHevc720p.length > 0) {
    const smallest720p = nonHevc720p.reduce((min, cur) => {
      const szMin = getHitSizeGB(min) || parseSizeInGB(min.size) || (min.bytes ? min.bytes / (1024 * 1024 * 1024) : 0);
      const szCur = getHitSizeGB(cur) || parseSizeInGB(cur.size) || (cur.bytes ? cur.bytes / (1024 * 1024 * 1024) : 0);
      return (szCur > 0 && (szMin === 0 || szCur < szMin)) ? cur : min;
    }, nonHevc720p[0]);

    smallest720pSizeGB =
      getHitSizeGB(smallest720p) ||
      parseSizeInGB(smallest720p.size) ||
      (smallest720p.bytes ? smallest720p.bytes / (1024 * 1024 * 1024) : 0);
    if (smallest720pSizeGB > 1.45) {
      is720pOver145GB = true;
    }
  }

  // If 720p is greater than 1.45GB, 720p HEVC with Pixeldrain is strictly COMPULSORY
  const has720pHevcWithPixeldrain = pixelHevc720p.length > 0;
  const has720pWithPixeldrain = is720pOver145GB
    ? has720pHevcWithPixeldrain
    : (pixelNonHevc720p.length > 0 || pixelHevc720p.length > 0);

  if (!has720pWithPixeldrain) {
    if (is720pOver145GB) {
      if (hevc720p.length > 0) {
        missingReasons.push(`720p is ${smallest720pSizeGB.toFixed(2)} GB (>1.45GB); 720p HEVC found but missing Pixeldrain`);
      } else {
        missingReasons.push(`720p is ${smallest720pSizeGB.toFixed(2)} GB (>1.45GB); compulsory 720p HEVC with Pixeldrain not found`);
      }
    } else {
      if (nonSample720p.length > 0) {
        missingReasons.push('720p found but missing Pixeldrain download option');
      } else {
        missingReasons.push('720p missing completely');
      }
    }
  }

  // 3. Check 1080p (< 5.0 GB)
  const nonSample1080p = links.filter((l) => l.quality === '1080p' && !l.isSample);
  const over5gb1080pList = nonSample1080p.filter((l) => {
    const sizeGB = getHitSizeGB(l) || parseSizeInGB(l.size) || (l.bytes ? l.bytes / (1024 * 1024 * 1024) : 0);
    return sizeGB >= 5.0;
  });
  const under5gb1080p = nonSample1080p.filter((l) => {
    const sizeGB = getHitSizeGB(l) || parseSizeInGB(l.size) || (l.bytes ? l.bytes / (1024 * 1024 * 1024) : 0);
    return sizeGB < 5.0;
  });
  const pixel1080p = under5gb1080p.filter((l) => hasPixeldrainDownload(l, checkResults));
  const has1080pWithPixeldrain = pixel1080p.length > 0;

  if (!has1080pWithPixeldrain) {
    if (under5gb1080p.length > 0) {
      missingReasons.push('1080p (<5GB) found but missing Pixeldrain download option');
    } else if (over5gb1080pList.length > 0) {
      const sz = getHitSizeGB(over5gb1080pList[0]) || parseSizeInGB(over5gb1080pList[0].size);
      missingReasons.push(`1080p (${sz ? sz.toFixed(2) + ' GB' : '>=5GB'}) is 5GB or greater (<5GB required)`);
    } else {
      missingReasons.push('1080p (<5GB) missing completely');
    }
  }

  const isSatisfied = Boolean(has480pWithPixeldrain && has720pWithPixeldrain && has1080pWithPixeldrain);

  return {
    isSatisfied,
    missingReasons,
    has480pWithPixeldrain,
    has720pWithPixeldrain,
    has720pHevcWithPixeldrain,
    is720pOver145GB,
    has1080pWithPixeldrain,
    over5gb1080pFound: over5gb1080pList.length > 0,
  };
}

export function isSatisfiedFilmygoStage(
  links: ScrapedLinkItem[],
  type: 'movie' | 'series' = 'movie',
  checkResults?: LinkCheckResult[]
): boolean {
  return evaluateWaterfallSatisfaction(links, type, checkResults).isSatisfied;
}

/**
 * 5-Stage Multi-Source Waterfall Search:
 * Stage 1: FilmyCab / FilmyGo (if 480p, 720p [HEVC if >1.45GB], and 1080p found -> STOP and use FilmyGo links)
 * Stage 2: MoviesDrive (2nd priority)
 * Stage 3: HDHub4U (3rd priority & HD availability gatekeeper)
 * Stage 4: SkyMoviesHD (4th priority)
 * Stage 5: FilmyFly (5th fallback)
 */
export async function runWaterfallLinkSearch(
  options: WaterfallSearchOptions
): Promise<WaterfallSearchResult> {
  const {
    title,
    year,
    type: initialType = 'movie',
    languages = [],
    qualities = [],
    signal,
    onProgress,
    maxPostsPerProvider = 2,
    skipCache = false,
    skipTmdbVerification = false,
  } = options;

  let type = initialType;

  const logs: string[] = [];
  const log = (msg: string) => {
    logs.push(msg);
    if (onProgress) onProgress(msg);
  };

  const parsed = extractTitleAndYear(title);
  // Pure title ONLY (remove any years or brackets so we query providers by pure title)
  let cleanTitle = (parsed.title || title).trim();
  cleanTitle = cleanTitle
    .replace(/\s*\(\s*(19\d\d|20[0-2]\d)\s*\)\s*/gi, ' ')
    .replace(/\s*\[\s*(19\d\d|20[0-2]\d)\s*\]\s*/gi, ' ')
    .replace(/\b(19\d\d|20[0-2]\d)\b/g, ' ')
    .replace(/[🎬]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  let searchYear = year || parsed.year;

  // 1. Check 30-minute auto-expiring cache first
  if (!skipCache) {
    const cached = getImportCache(cleanTitle, searchYear) || getImportCache(title, searchYear);
    if (cached && cached.links && cached.links.length > 0) {
      log(`[30-Min Cache Hit] Found cached verified links & TMDB data for "${cached.title}" (${cached.year || 'N/A'}).`);
      const has480p = cached.links.some((l) => l.quality === '480p');
      const has720p = cached.links.some((l) => l.quality === '720p');
      const has1080p = cached.links.some((l) => l.quality === '1080p');
      const has2160p = cached.links.some((l) => l.quality === '2160p');
      const hasHdVersion = hasAnyHdLinks(cached.links);

      return {
        links: cached.links,
        qualityLinks: cached.qualityLinks || buildQualityLinksPayload(cached.links),
        results: cached.checkResults || [],
        tmdbData: cached.tmdbData,
        metadata: {
          ...cached.metadata,
          title: cached.tmdbData?.title || cached.title,
          year: cached.tmdbData?.year || cached.year,
          type: cached.tmdbData?.type || cached.type,
          sampleUrl: cached.sample?.url || (cached as any).sampleUrl,
          tmdbData: cached.tmdbData,
        },
        sample: cached.sample,
        providerUsed: 'Cached (30-Min Active Cache)',
        isComplete: Boolean(has480p && has720p && has1080p),
        has480p,
        has720p,
        has1080p,
        has2160p,
        hasHdVersion,
        logs: [
          `Loaded from 30-min active cache for "${cached.title}"`,
          `Cached qualities: [480p: ${has480p ? '✓' : '✗'} | 720p: ${has720p ? '✓' : '✗'} | 1080p: ${has1080p ? '✓' : '✗'}]`,
        ],
      };
    }
  }

  // 2. TMDB Title Verification and Full Data Retrieval
  let verifiedTmdbData: VerifiedTmdbMetadata | null = null;
  if (!skipTmdbVerification) {
    log(`Verifying title "${cleanTitle}" against TMDB...`);
    try {
      verifiedTmdbData = await verifyAndFetchTmdbData(cleanTitle, searchYear, type);
      if (verifiedTmdbData) {
        log(`✓ TMDB Verified: "${verifiedTmdbData.title}" (${verifiedTmdbData.year || 'N/A'}) [${verifiedTmdbData.type.toUpperCase()}]`);
        if (verifiedTmdbData.year && !searchYear) {
          searchYear = verifiedTmdbData.year;
        }
        if (verifiedTmdbData.type) {
          type = verifiedTmdbData.type;
        }
      } else {
        log(`TMDB: No direct match found, proceeding with clean title "${cleanTitle}".`);
      }
    } catch (e) {
      log(`TMDB verification error, proceeding with clean title.`);
    }
  }

  // Search by pure title ONLY (never with year in query string)
  const queryVariations = [
    verifiedTmdbData?.title,
    cleanTitle,
    cleanTitle.includes(':') ? cleanTitle.split(':')[0].trim() : '',
    verifiedTmdbData?.secondTitle,
  ]
    .filter(Boolean) as string[];

  // Deduplicate query variations preserving order
  const uniqueQueryVariations = queryVariations.filter((v, i, a) => a.indexOf(v) === i);

  log(
    `Initiating Waterfall search by title "${cleanTitle}"${
      searchYear ? ` (will verify results by year ${searchYear})` : ''
    }...`
  );

  let allDiscoveredLinks: ScrapedLinkItem[] = [];
  let allCheckResults: LinkCheckResult[] = [];
  let finalProvider = '';
  let stoppedReason: string | undefined;
  let finalMetadata: any = {};
  let finalSample: ScrapedLinkItem | undefined;

  const fgDomain = getFilmygoDomain();
  const mdDomain = getMoviesdriveDomain();
  const hdDomain = getHdhub4uDomain();
  const skyDomain = getSkymoviesDomain();
  const ffDomain = getFilmyflyDomain();

  // Helper inside runWaterfallLinkSearch to finalize and automatically cache for 30 minutes
  function finishWaterfall(
    rawLinks: ScrapedLinkItem[],
    results: LinkCheckResult[],
    meta: any,
    sample: ScrapedLinkItem | undefined,
    provider: string,
    isComp: boolean,
    outLogs: string[],
    itemType: 'movie' | 'series',
    stopReason?: string
  ): WaterfallSearchResult {
    const deduplicated = deduplicateQualityLinks(rawLinks, itemType);

    const has480p = deduplicated.some((l) => l.quality === '480p');
    const nonHevc720 = deduplicated.find((l) => l.quality === '720p' && !l.isHevc);
    const hevc720 = deduplicated.find((l) => l.quality === '720p' && l.isHevc);
    const size720GB = nonHevc720
      ? (getHitSizeGB(nonHevc720) || parseSizeInGB(nonHevc720.size) || (nonHevc720.bytes ? nonHevc720.bytes / (1024 * 1024 * 1024) : 0))
      : 0;
    const is720Over145 = size720GB > 1.45;
    const hasRequired720 = is720Over145 ? Boolean(hevc720) : Boolean(nonHevc720 || hevc720);
    const has720p = Boolean(nonHevc720 || hevc720);
    const has1080p = deduplicated.some((l) => l.quality === '1080p');
    const has2160p = deduplicated.some((l) => l.quality === '2160p');
    const hasHdVersion = hasAnyHdLinks(deduplicated);

    const isComplete = itemType === 'series'
      ? (hasAnyHdLinks(deduplicated) && deduplicated.length >= 2)
      : (isComp && Boolean(has480p && hasRequired720 && has1080p));

    const qualityLinks: QualityLinks = buildQualityLinksPayload(deduplicated);

    // Filter check results to only keep those belonging to deduplicated quality links + sample
    const dedupedUrlSet = new Set<string>();
    deduplicated.forEach((d) => {
      if (d.url) dedupedUrlSet.add(normalizeUrl(d.url));
    });
    if (sample?.url) {
      dedupedUrlSet.add(normalizeUrl(sample.url));
    }

    const dedupedResults = results.filter((r) => {
      if (isHubcloudRecoveryLink(r.url || '') || isHubcloudRecoveryLink(r.finalUrl || '')) {
        return false;
      }
      const u1 = normalizeUrl(r.url);
      const u2 = normalizeUrl(r.finalUrl || r.url);
      return dedupedUrlSet.has(u1) || dedupedUrlSet.has(u2);
    });

    const finalResults = dedupedResults.length > 0 ? dedupedResults : results;

    const mergedMetadata = {
      ...meta,
      title: verifiedTmdbData?.title || meta?.title || cleanTitle,
      year: verifiedTmdbData?.year || meta?.year || searchYear,
      type: verifiedTmdbData?.type || meta?.type || itemType,
      sampleUrl: sample?.url || meta?.sampleUrl,
      tmdbData: verifiedTmdbData || undefined,
    };

    const finalResultPayload: WaterfallSearchResult = {
      links: deduplicated,
      qualityLinks,
      results: finalResults,
      metadata: mergedMetadata,
      tmdbData: verifiedTmdbData || undefined,
      sample,
      providerUsed: provider,
      isComplete,
      has480p,
      has720p,
      has1080p,
      has2160p,
      hasHdVersion,
      stoppedReason: stopReason,
      logs: outLogs,
    };

    // Cache all data (links and TMDB data) for 30 minutes until saved to library or automatically purged
    try {
      saveImportCache({
        title: verifiedTmdbData?.title || cleanTitle,
        cleanTitle,
        year: verifiedTmdbData?.year || searchYear,
        type: itemType,
        tmdbData: verifiedTmdbData || undefined,
        links: deduplicated,
        qualityLinks,
        checkResults: finalResults,
        sample,
        metadata: mergedMetadata,
      });
    } catch (err) {
      console.error('Failed to save to import cache:', err);
    }

    return finalResultPayload;
  }

  // Fast concurrent query helper for waterfall providers: searches by pure title without year,
  // and keeps finding across pages until correctly found title+year
  async function queryProviderFast(
    providerName: string,
    searchFn: (query: string, page: number, signal?: AbortSignal) => Promise<any[]>,
    getLinksFn: (postUrl: string, signal?: AbortSignal) => Promise<any[]>,
    filterFn: (hits: any[], pageUrl?: string) => any[],
    maxPagesToSearch = 2
  ): Promise<{ candidates: { url: string; source: string; postTitle?: string; isSample?: boolean }[]; posts: any[] }> {
    if (signal?.aborted) return { candidates: [], posts: [] };

    let verifiedPosts: any[] = [];

    // Searches a specific query across pages 1..maxPagesToSearch until confirmed title+year is found
    async function searchAcrossPages(q: string, maxPages = maxPagesToSearch): Promise<any[]> {
      for (let page = 1; page <= maxPages; page++) {
        if (signal?.aborted) break;
        try {
          const posts = await searchFn(q, page, signal);
          if (posts && posts.length > 0) {
            const verified = rankAndVerifyPosts(posts, cleanTitle, searchYear, type);
            if (verified && verified.length > 0) {
              log(`✓ [${providerName}] Found ${verified.length} confirmed post(s) matching "${cleanTitle}"${searchYear ? ` (${searchYear})` : ''} on page ${page}.`);
              return verified;
            }
          } else {
            // No posts returned on this page, stop paging for this query
            break;
          }
        } catch {
          break;
        }
      }
      return [];
    }

    // 1. Search primary query variation across pages (page 1, 2)
    const primaryQuery = uniqueQueryVariations[0];
    if (primaryQuery) {
      verifiedPosts = await searchAcrossPages(primaryQuery, maxPagesToSearch);
    }

    // 2. If not found yet and fallback queries exist, try first fallback on page 1
    if (verifiedPosts.length === 0 && uniqueQueryVariations.length > 1) {
      const fallbackQueries = uniqueQueryVariations.slice(1, 2);
      for (const fq of fallbackQueries) {
        if (signal?.aborted) break;
        verifiedPosts = await searchAcrossPages(fq, 1);
        if (verifiedPosts.length > 0) {
          break;
        }
      }
    }

    if (verifiedPosts.length === 0) return { candidates: [], posts: [] };

    const postsToScrape = verifiedPosts.slice(0, maxPostsPerProvider);
    const postResults = await Promise.all(
      postsToScrape.map(async (p) => {
        try {
          const rawHits = await getLinksFn(p.url, signal);
          const filtered = filterFn(rawHits, p.url);
          const toUse = filtered.length > 0 ? filtered : rawHits;
          return toUse.map((h: any) => {
            const u = h.url || h.href;
            if (!u) return null;
            return {
              url: u,
              source: providerName,
              postTitle: p.title,
              isSample: Boolean(h.isSample || h.is_sample || /\bsample\b/i.test(h.file_name || '')),
            };
          }).filter(Boolean) as { url: string; source: string; postTitle?: string; isSample?: boolean }[];
        } catch {
          return [];
        }
      })
    );

    return { candidates: postResults.flat(), posts: verifiedPosts };
  }

  // ==========================================
  // STAGE 1: FilmyCab / FilmyGo (Primary Priority)
  // ==========================================
  log(`[Stage 1/5] Querying FilmyCab / FilmyGo (${fgDomain}) for title "${cleanTitle}"...`);
  const s1Fast = await queryProviderFast(
    'FilmyGo',
    (q, page, sig) => scrapeFilmygoPosts(q, page, sig),
    scrapeFilmygoPostLinks,
    filterFilmygoHits,
    2
  );
  const stage1Candidates = s1Fast.candidates;

  if (stage1Candidates.length > 0) {
    log(`FilmyGo: Found ${stage1Candidates.length} candidate links, verifying in batch...`);
    let s1Result = await scanAndVerifyCandidates(
      stage1Candidates,
      cleanTitle,
      searchYear,
      type,
      languages,
      qualities,
      signal
    );

    // Auto-rescue check: If 480p candidate existed in stage1Candidates but is missing from s1Result
    const has480pScraped = s1Result.scrapedItems.some((l) => l.quality === '480p' && !l.isSample);
    if (!has480pScraped) {
      const cand480p = stage1Candidates.find((c) => {
        const text = `${c.postTitle || ''} ${c.url || ''}`.toLowerCase();
        return (text.includes('480p') || /\bsd\b/i.test(text)) && !c.isSample && !/\bsample\b/i.test(text);
      });
      if (cand480p) {
        log(`FilmyGo: Rescuing missing 480p link (${cand480p.url})...`);
        try {
          const rescueRes = await scanAndVerifyCandidates(
            [cand480p],
            cleanTitle,
            searchYear,
            type,
            languages,
            qualities,
            signal
          );
          if (rescueRes.scrapedItems.length > 0) {
            s1Result.scrapedItems.push(...rescueRes.scrapedItems);
            s1Result.checkResults.push(...rescueRes.checkResults);
          }
        } catch {}
      }
    }

    allDiscoveredLinks.push(...s1Result.scrapedItems);
    allCheckResults.push(...s1Result.checkResults);
    finalMetadata = { ...finalMetadata, ...s1Result.metadata };
    if (s1Result.sample) finalSample = s1Result.sample;

    const s1Eval = evaluateWaterfallSatisfaction(s1Result.scrapedItems, type, allCheckResults);
    if (s1Eval.isSatisfied) {
      log(`✓ FilmyGo: Complete set (480p, 720p [HEVC if >1.45GB], and 1080p [<5GB]) ALL with Pixeldrain verified! Stopping waterfall immediately.`);
      finalProvider = 'FilmyGo (Complete)';
      return finishWaterfall(
        allDiscoveredLinks,
        allCheckResults,
        finalMetadata,
        finalSample,
        finalProvider,
        true,
        logs,
        type
      );
    } else {
      log(`FilmyGo: ${s1Eval.missingReasons.join('; ')}. Proceeding to Stage 2 (MoviesDrive)...`);
    }
  } else {
    log(`FilmyGo: No matching posts/links found. Proceeding to Stage 2 (MoviesDrive)...`);
  }

  // ==========================================
  // STAGE 2: MoviesDrive (2nd Priority - Queried on demand if Stage 1 incomplete)
  // ==========================================
  if (!signal?.aborted) {
    log(`[Stage 2/5] Inspecting MoviesDrive (${mdDomain}) for title "${cleanTitle}"...`);
    const s2Fast = await queryProviderFast(
      'MoviesDrive',
      (q, page, sig) => scrapeMoviesdrivePosts(q, page, sig),
      scrapeMoviesdrivePostLinks,
      filterMoviesdriveHits,
      2
    );
    const stage2Candidates = s2Fast.candidates;

    if (stage2Candidates.length > 0) {
      log(`MoviesDrive: Found ${stage2Candidates.length} candidate links, verifying in batch...`);
      const s2Result = await scanAndVerifyCandidates(
        stage2Candidates,
        cleanTitle,
        searchYear,
        type,
        languages,
        qualities,
        signal
      );
      allDiscoveredLinks.push(...s2Result.scrapedItems);
      allCheckResults.push(...s2Result.checkResults);
      finalMetadata = { ...finalMetadata, ...s2Result.metadata };
      if (s2Result.sample && !finalSample) finalSample = s2Result.sample;

      const s2Eval = evaluateWaterfallSatisfaction(allDiscoveredLinks, type, allCheckResults);
      if (s2Eval.isSatisfied) {
        log(`✓ MoviesDrive: All required HD links (480p, 720p, 1080p) with Pixeldrain verified in combination! Finalized at Stage 2.`);
        finalProvider = 'MoviesDrive / Multi-Source';
        return finishWaterfall(
          allDiscoveredLinks,
          allCheckResults,
          finalMetadata,
          finalSample,
          finalProvider,
          true,
          logs,
          type
        );
      } else {
        log(`MoviesDrive: ${s2Eval.missingReasons.join('; ')}. Proceeding to Stage 3 (HDHub4U)...`);
      }
    } else {
      log(`MoviesDrive: No matching posts/links found. Proceeding to Stage 3 (HDHub4U)...`);
    }
  }

  // ==========================================
  // STAGE 3: HDHub4U (3rd Priority & HD Availability Gatekeeper)
  // ==========================================
  if (!signal?.aborted) {
    log(`[Stage 3/5] Querying HDHub4U (${hdDomain}) for title "${cleanTitle}"...`);
    const s3Fast = await queryProviderFast(
      'HDHub4U',
      (q, page, sig) => scrapeHdhub4uPosts(q, page, sig),
      scrapeHdhub4uPostLinks,
      filterHdhub4uHits
    );
    const stage3Candidates = s3Fast.candidates;
    const hdHubPosts = s3Fast.posts;

    if (stage3Candidates.length > 0) {
      log(`HDHub4U: Found ${stage3Candidates.length} candidate links, verifying...`);
      const s3Result = await scanAndVerifyCandidates(
        stage3Candidates,
        cleanTitle,
        searchYear,
        type,
        languages,
        qualities,
        signal
      );
      allDiscoveredLinks.push(...s3Result.scrapedItems);
      allCheckResults.push(...s3Result.checkResults);
      finalMetadata = { ...finalMetadata, ...s3Result.metadata };
      if (s3Result.sample && !finalSample) finalSample = s3Result.sample;

      const s3Eval = evaluateWaterfallSatisfaction(allDiscoveredLinks, type, allCheckResults);
      if (s3Eval.isSatisfied) {
        log(`✓ HDHub4U: All required HD links (480p, 720p, 1080p) with Pixeldrain verified in combination! Finalized at Stage 3.`);
        finalProvider = 'HDHub4U / Multi-Source';
        return finishWaterfall(
          allDiscoveredLinks,
          allCheckResults,
          finalMetadata,
          finalSample,
          finalProvider,
          true,
          logs,
          type
        );
      } else {
        log(`HDHub4U: ${s3Eval.missingReasons.join('; ')}. Proceeding to Stage 4 (SkyMoviesHD)...`);
      }
    } else {
      log(`HDHub4U: No matching posts/links found. Proceeding to Stage 4 (SkyMoviesHD)...`);
    }
  }

  // ==========================================
  // STAGE 4: SkyMoviesHD (4th Priority)
  // ==========================================
  if (!signal?.aborted) {
    log(`[Stage 4/5] Querying SkyMoviesHD (${skyDomain}) for title "${cleanTitle}"...`);
    const s4Fast = await queryProviderFast(
      'SkyMoviesHD',
      (q, page, sig) => scrapeSkymoviesPosts(q, page, sig),
      scrapeSkymoviesPostLinks,
      filterSkymoviesHits
    );
    const stage4Candidates = s4Fast.candidates;

    if (stage4Candidates.length > 0) {
      log(`SkyMoviesHD: Found ${stage4Candidates.length} candidate links, verifying...`);
      const s4Result = await scanAndVerifyCandidates(
        stage4Candidates,
        cleanTitle,
        searchYear,
        type,
        languages,
        qualities,
        signal
      );
      allDiscoveredLinks.push(...s4Result.scrapedItems);
      allCheckResults.push(...s4Result.checkResults);
      finalMetadata = { ...finalMetadata, ...s4Result.metadata };
      if (s4Result.sample && !finalSample) finalSample = s4Result.sample;

      const s4Eval = evaluateWaterfallSatisfaction(allDiscoveredLinks, type, allCheckResults);
      if (s4Eval.isSatisfied) {
        log(`✓ SkyMoviesHD: All required HD links (480p, 720p, 1080p) with Pixeldrain verified in combination! Finalized at Stage 4.`);
        finalProvider = 'SkyMoviesHD / Multi-Source';
        return finishWaterfall(
          allDiscoveredLinks,
          allCheckResults,
          finalMetadata,
          finalSample,
          finalProvider,
          true,
          logs,
          type
        );
      } else {
        log(`SkyMoviesHD: ${s4Eval.missingReasons.join('; ')}. Proceeding to final fallback Stage 5 (FilmyFly)...`);
      }
    } else {
      log(`SkyMoviesHD: No matching posts/links found. Proceeding to final Stage 5 (FilmyFly)...`);
    }
  }

  // ==========================================
  // STAGE 5: FilmyFly (5th Fallback)
  // ==========================================
  if (!signal?.aborted) {
    log(`[Stage 5/5] Querying FilmyFly (${ffDomain}) for title "${cleanTitle}"...`);
    const s5Fast = await queryProviderFast(
      'FilmyFly',
      (q, page, sig) => scrapeFilmyflyPosts(q, page, sig),
      scrapeFilmyflyPostLinks,
      filterFilmyflyHits
    );
    const stage5Candidates = s5Fast.candidates;

    if (stage5Candidates.length > 0) {
      log(`FilmyFly: Found ${stage5Candidates.length} candidate links, verifying...`);
      const s5Result = await scanAndVerifyCandidates(
        stage5Candidates,
        cleanTitle,
        searchYear,
        type,
        languages,
        qualities,
        signal
      );
      allDiscoveredLinks.push(...s5Result.scrapedItems);
      allCheckResults.push(...s5Result.checkResults);
      finalMetadata = { ...finalMetadata, ...s5Result.metadata };
      if (s5Result.sample && !finalSample) finalSample = s5Result.sample;
    }
  }

  finalProvider = allDiscoveredLinks.length > 0 ? 'Multi-Source Combined' : 'None';
  const finalEval = evaluateWaterfallSatisfaction(allDiscoveredLinks, type, allCheckResults);
  return finishWaterfall(
    allDiscoveredLinks,
    allCheckResults,
    finalMetadata,
    finalSample,
    finalProvider,
    finalEval.isSatisfied,
    logs,
    type,
    stoppedReason
  );
}
