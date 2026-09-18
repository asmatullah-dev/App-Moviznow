import { Language, Quality, QualityLinks } from '../types';
import {
  getFilmygoDomain,
  getMoviesdriveDomain,
  getHdhub4uDomain,
  getSkymoviesDomain,
  getFilmyflyDomain,
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

  const resolvedUrls = await resolveIntermediateUrls(candidates, signal);

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
  const concurrency = 20;

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
          undefined,
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

  const validResults = checkResults.filter((r) => {
    const isWorking =
      r.statusLabel === 'WORKING' ||
      r.statusLabel === 'REDIRECT' ||
      r.statusLabel === 'SMALL_FILE' ||
      r.statusLabel === 'MISSING_FILENAME' ||
      r.statusLabel === 'MISSING_METADATA' ||
      r.statusLabel === 'SIZE_MISMATCH';
    return isWorking && r.url;
  });

  const scrapedItems: ScrapedLinkItem[] = [];
  const detectedLangs = new Set<string>();
  let detectedPrintQuality: string | undefined;
  let detectedSubtitles = false;
  let sampleItem: ScrapedLinkItem | undefined;

  validResults.forEach((r, idx) => {
    const sourceText = `${r.fileName || ''} ${r.finalUrl || r.url || ''}`.toLowerCase();
    const isSample = Boolean(r.isSample || (r as any).is_sample || /\bsample\b/i.test(sourceText));

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

    const item: ScrapedLinkItem = {
      id: `bulk-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 4)}`,
      source: (r as any).source || 'FilmyGo',
      sourceTitle: r.fileName || title,
      url: normalizeUrl(r.finalUrl || r.url),
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

export function isPixeldrainOrHubcloudLink(item: ScrapedLinkItem | string): boolean {
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

export function isSatisfiedFilmygoStage(links: ScrapedLinkItem[], type: 'movie' | 'series' = 'movie'): boolean {
  if (!links || links.length === 0) return false;

  // Filter links strictly to those pointing to Pixeldrain or HubCloud (which extracts/serves Pixeldrain direct links)
  const pixeldrainLinks = links.filter((l) => isPixeldrainOrHubcloudLink(l));
  if (pixeldrainLinks.length === 0) return false;

  const linksToUse = pixeldrainLinks;

  if (type === 'series') {
    const validSeriesLinks = linksToUse.filter((l) => {
      if (l.isSample) return false;
      if (l.quality === '1080p') {
        const sizeGB = getHitSizeGB(l) || parseSizeInGB(l.size) || (l.bytes ? l.bytes / (1024 * 1024 * 1024) : 0);
        if (sizeGB >= 5.0) return false;
      }
      return true;
    });
    return hasAnyHdLinks(validSeriesLinks) && validSeriesLinks.length >= 2;
  }

  // Check 480p (strictly non-sample)
  const has480p = linksToUse.some((l) => l.quality === '480p' && !l.isSample);

  // Check 720p
  const nonHevc720p = linksToUse.filter((l) => l.quality === '720p' && !l.isHevc && !l.isSample);
  const hevc720p = linksToUse.filter((l) => l.quality === '720p' && l.isHevc && !l.isSample);
  const has720p = nonHevc720p.length > 0 || hevc720p.length > 0;

  let is720pOver145GB = false;
  if (nonHevc720p.length > 0) {
    const item720p = nonHevc720p[0];
    const sizeGB =
      getHitSizeGB(item720p) ||
      parseSizeInGB(item720p.size) ||
      (item720p.bytes ? item720p.bytes / (1024 * 1024 * 1024) : 0);
    if (sizeGB > 1.45) {
      is720pOver145GB = true;
    }
  }

  // When 720p > 1.45GB, 720p HEVC is required
  const hasRequired720p = is720pOver145GB
    ? nonHevc720p.length > 0 && hevc720p.length > 0
    : has720p;

  // Check 1080p: strictly skip if 5GB or greater (< 5GB required)!
  const has1080p = linksToUse.some((l) => {
    if (l.quality !== '1080p' || l.isSample) return false;
    const sizeGB =
      getHitSizeGB(l) ||
      parseSizeInGB(l.size) ||
      (l.bytes ? l.bytes / (1024 * 1024 * 1024) : 0);
    return sizeGB < 5.0;
  });

  return Boolean(has480p && hasRequired720p && has1080p);
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
    const has720p = deduplicated.some((l) => l.quality === '720p');
    const has1080p = deduplicated.some((l) => l.quality === '1080p');
    const has2160p = deduplicated.some((l) => l.quality === '2160p');
    const hasHdVersion = hasAnyHdLinks(deduplicated);

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
      isComplete: isComp,
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

  // ==========================================
  // STAGE 1: FilmyCab / FilmyGo (1st Priority)
  // ==========================================
  log(`[Stage 1/5] Querying FilmyCab / FilmyGo (${fgDomain}) for title "${cleanTitle}"...`);
  let stage1Candidates: { url: string; source: string; postTitle?: string; isSample?: boolean }[] =
    [];

  for (const q of uniqueQueryVariations) {
    if (signal?.aborted) break;
    try {
      const posts = await scrapeFilmygoPosts(q, 1, signal);
      if (!posts.length) continue;

      const verifiedPosts = rankAndVerifyPosts(posts, cleanTitle, searchYear);

      for (const p of verifiedPosts.slice(0, maxPostsPerProvider)) {
        if (signal?.aborted) break;
        const rawHits = await scrapeFilmygoPostLinks(p.url, signal);
        const filtered = filterFilmygoHits(rawHits, p.url);
        const toUse = filtered.length > 0 ? filtered : rawHits;
        toUse.forEach((h: any) => {
          const u = h.url || h.href;
          if (u) {
            stage1Candidates.push({
              url: u,
              source: 'FilmyGo',
              postTitle: p.title,
              isSample: Boolean(h.isSample || h.is_sample || /\bsample\b/i.test(h.file_name || '')),
            });
          }
        });
      }
      if (stage1Candidates.length > 0) break;
    } catch (e) {}
  }

  if (stage1Candidates.length > 0) {
    log(`FilmyGo: Found ${stage1Candidates.length} candidate links, verifying...`);
    const s1Result = await scanAndVerifyCandidates(
      stage1Candidates,
      cleanTitle,
      searchYear,
      type,
      languages,
      qualities,
      signal
    );
    allDiscoveredLinks.push(...s1Result.scrapedItems);
    allCheckResults.push(...s1Result.checkResults);
    finalMetadata = { ...finalMetadata, ...s1Result.metadata };
    if (s1Result.sample) finalSample = s1Result.sample;

    if (isSatisfiedFilmygoStage(s1Result.scrapedItems, type)) {
      log(`✓ FilmyGo: Complete set (480p, 720p [HEVC if >1.45GB], and 1080p [<5GB]) found by first stage! Stopping waterfall and using FilmyGo links.`);
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
      const over5gb1080p = s1Result.scrapedItems.find(
        (l) => l.quality === '1080p' && (getHitSizeGB(l) >= 5.0 || parseSizeInGB(l.size) >= 5.0)
      );
      if (over5gb1080p) {
        const sz = getHitSizeGB(over5gb1080p) || parseSizeInGB(over5gb1080p.size);
        log(`FilmyGo: 1080p link (${sz ? sz.toFixed(2) + ' GB' : '>=5GB'}) is 5GB or greater. Skipping and proceeding to next stage for 1080p < 5GB...`);
      } else {
        log(`FilmyGo: Missing one or more required qualities (480p, 720p [HEVC if >1.45GB], 1080p [<5GB]). Proceeding to Stage 2 (MoviesDrive)...`);
      }
    }
  } else {
    log(`FilmyGo: No matching posts/links found. Proceeding to Stage 2 (MoviesDrive)...`);
  }

  // ==========================================
  // STAGE 2: MoviesDrive (2nd Priority)
  // ==========================================
  if (!signal?.aborted) {
    log(`[Stage 2/5] Querying MoviesDrive (${mdDomain}) for title "${cleanTitle}"...`);
    let stage2Candidates: {
      url: string;
      source: string;
      postTitle?: string;
      isSample?: boolean;
    }[] = [];

    for (const q of uniqueQueryVariations) {
      if (signal?.aborted) break;
      try {
        const posts = await scrapeMoviesdrivePosts(q, 1, signal);
        if (!posts.length) continue;

        const verifiedPosts = rankAndVerifyPosts(posts, cleanTitle, searchYear);

        for (const p of verifiedPosts.slice(0, maxPostsPerProvider)) {
          if (signal?.aborted) break;
          const rawHits = await scrapeMoviesdrivePostLinks(p.url, signal);
          const filtered = filterMoviesdriveHits(rawHits, p.url);
          const toUse = filtered.length > 0 ? filtered : rawHits;
          toUse.forEach((h: any) => {
            const u = h.url || h.href;
            if (u) {
              stage2Candidates.push({
                url: u,
                source: 'MoviesDrive',
                postTitle: p.title,
                isSample: Boolean(h.isSample || h.is_sample),
              });
            }
          });
        }
        if (stage2Candidates.length > 0) break;
      } catch (e) {}
    }

    if (stage2Candidates.length > 0) {
      log(`MoviesDrive: Found ${stage2Candidates.length} candidate links, verifying...`);
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

      if (isSatisfiedFilmygoStage(allDiscoveredLinks, type)) {
        log(`✓ MoviesDrive: All required HD links verified in combination! Finalized at Stage 2.`);
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
        log(`MoviesDrive: Incomplete links. Proceeding to Stage 3 (HDHub4U)...`);
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
    let stage3Candidates: {
      url: string;
      source: string;
      postTitle?: string;
      isSample?: boolean;
    }[] = [];
    let hdHubPosts: any[] = [];

    for (const q of uniqueQueryVariations) {
      if (signal?.aborted) break;
      try {
        const posts = await scrapeHdhub4uPosts(q, signal);
        if (!posts.length) continue;

        const verifiedPosts = rankAndVerifyPosts(posts, cleanTitle, searchYear);
        hdHubPosts = verifiedPosts;

        for (const p of verifiedPosts.slice(0, maxPostsPerProvider)) {
          if (signal?.aborted) break;
          const rawHits = await scrapeHdhub4uPostLinks(p.url, signal);
          const filtered = filterHdhub4uHits(rawHits, p.url);
          const toUse = filtered.length > 0 ? filtered : rawHits;
          toUse.forEach((h: any) => {
            const u = h.url || h.href;
            if (u) {
              stage3Candidates.push({
                url: u,
                source: 'HDHub4U',
                postTitle: p.title,
                isSample: Boolean(h.isSample || h.is_sample),
              });
            }
          });
        }
        if (stage3Candidates.length > 0) break;
      } catch (e) {}
    }

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

      if (isSatisfiedFilmygoStage(allDiscoveredLinks, type)) {
        log(`✓ HDHub4U: All required HD links verified in combination! Finalized at Stage 3.`);
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
      }
    }

    // HD AVAILABILITY GATEKEEPER CHECK:
    // If after HDHub4U we still have NOT found ANY HD version across all 3 providers,
    // it means HD is not released yet anywhere on the web -> Halt waterfall.
    const hasAnyHdSoFar =
      hasAnyHdLinks(allDiscoveredLinks) || hdHubPosts.some((p) => isHdPrint(p.title || ''));
    if (!hasAnyHdSoFar) {
      stoppedReason = 'HD Version not available yet across web (Halted after HDHub4U check)';
      log(`⚠️ ${stoppedReason}. Halting waterfall search.`);
      finalProvider = 'HDHub4U (No HD Available)';
      return finishWaterfall(
        allDiscoveredLinks,
        allCheckResults,
        finalMetadata,
        finalSample,
        finalProvider,
        false,
        logs,
        type,
        stoppedReason
      );
    } else {
      log(`HD version detected on web, but missing some qualities. Proceeding to Stage 4 (SkyMoviesHD)...`);
    }
  }

  // ==========================================
  // STAGE 4: SkyMoviesHD (4th Priority)
  // ==========================================
  if (!signal?.aborted) {
    log(`[Stage 4/5] Querying SkyMoviesHD (${skyDomain}) for title "${cleanTitle}"...`);
    let stage4Candidates: {
      url: string;
      source: string;
      postTitle?: string;
      isSample?: boolean;
    }[] = [];

    for (const q of uniqueQueryVariations) {
      if (signal?.aborted) break;
      try {
        const posts = await scrapeSkymoviesPosts(q, signal);
        if (!posts.length) continue;

        const verifiedPosts = rankAndVerifyPosts(posts, cleanTitle, searchYear);

        for (const p of verifiedPosts.slice(0, maxPostsPerProvider)) {
          if (signal?.aborted) break;
          const rawHits = await scrapeSkymoviesPostLinks(p.url, signal);
          const filtered = filterSkymoviesHits(rawHits, p.url);
          const toUse = filtered.length > 0 ? filtered : rawHits;
          toUse.forEach((h: any) => {
            const u = h.url || h.href;
            if (u) {
              stage4Candidates.push({
                url: u,
                source: 'SkyMoviesHD',
                postTitle: p.title,
                isSample: Boolean(h.isSample || h.is_sample),
              });
            }
          });
        }
        if (stage4Candidates.length > 0) break;
      } catch (e) {}
    }

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

      if (isSatisfiedFilmygoStage(allDiscoveredLinks, type)) {
        log(`✓ SkyMoviesHD: All required HD links verified in combination! Finalized at Stage 4.`);
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
        log(`SkyMoviesHD: Proceeding to final fallback Stage 5 (FilmyFly)...`);
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
    let stage5Candidates: {
      url: string;
      source: string;
      postTitle?: string;
      isSample?: boolean;
    }[] = [];

    for (const q of uniqueQueryVariations) {
      if (signal?.aborted) break;
      try {
        const posts = await scrapeFilmyflyPosts(q, 1, signal);
        if (!posts.length) continue;

        const verifiedPosts = rankAndVerifyPosts(posts, cleanTitle, searchYear);

        for (const p of verifiedPosts.slice(0, maxPostsPerProvider)) {
          if (signal?.aborted) break;
          const rawHits = await scrapeFilmyflyPostLinks(p.url, signal);
          const filtered = filterFilmyflyHits(rawHits, p.url);
          const toUse = filtered.length > 0 ? filtered : rawHits;
          toUse.forEach((h: any) => {
            const u = h.url || h.href;
            if (u) {
              stage5Candidates.push({
                url: u,
                source: 'FilmyFly',
                postTitle: p.title,
                isSample: Boolean(h.isSample || h.is_sample),
              });
            }
          });
        }
        if (stage5Candidates.length > 0) break;
      } catch (e) {}
    }

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
  return finishWaterfall(
    allDiscoveredLinks,
    allCheckResults,
    finalMetadata,
    finalSample,
    finalProvider,
    isSatisfiedFilmygoStage(allDiscoveredLinks, type),
    logs,
    type,
    stoppedReason
  );
}
