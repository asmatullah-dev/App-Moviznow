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
  getItemQualityCategory,
  extractTitleAndYear,
  isPreciseTitleMatch,
  rankAndVerifyPosts,
  deduplicateQualityLinks,
  pickLowerSizeQualityItem,
  resolveConfirmedQuality,
  parseSizeToBytes,
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
  LinkCheckResult,
} from './linkScanner';

export {
  deduplicateQualityLinks,
  pickLowerSizeQualityItem,
  resolveConfirmedQuality,
  parseSizeToBytes,
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
}

export interface WaterfallSearchResult {
  links: ScrapedLinkItem[];
  qualityLinks: QualityLinks;
  results: LinkCheckResult[];
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

  const checkResults: LinkCheckResult[] = [];
  const queue = [...resolvedUrls];
  const concurrency = 10;

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
          true
        );
        if (target.isSample) (res as any).isSample = true;
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
      source: 'WaterfallScanner',
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

/**
 * 5-Stage Multi-Source Waterfall Search:
 * Stage 1: FilmyCab / FilmyGo (if all required HD links found -> FINAL)
 * Stage 2: MoviesDrive (if found all required HD links -> FINAL, else proceed)
 * Stage 3: HDHub4U (if not found all required then proceed, BUT if NO HD version found at all anywhere -> STOP, HD not available yet)
 * Stage 4: SkyMoviesHD (if not all required -> proceed)
 * Stage 5: FilmyFly (final fallback)
 */
export async function runWaterfallLinkSearch(
  options: WaterfallSearchOptions
): Promise<WaterfallSearchResult> {
  const {
    title,
    year,
    type = 'movie',
    languages = [],
    qualities = [],
    signal,
    onProgress,
    maxPostsPerProvider = 2,
  } = options;

  const logs: string[] = [];
  const log = (msg: string) => {
    logs.push(msg);
    if (onProgress) onProgress(msg);
  };

  const parsed = extractTitleAndYear(title);
  // Pure title ONLY (remove any years or brackets so we query providers by pure title)
  let cleanTitle = (parsed.title || title).trim();
  cleanTitle = cleanTitle
    .replace(/\s*\(\s*(19\d\d|20[0-2]\d)\s*\)\s*/g, ' ')
    .replace(/\s*\[\s*(19\d\d|20[0-2]\d)\s*\]\s*/g, ' ')
    .replace(/\b(19\d\d|20[0-2]\d)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const searchYear = year || parsed.year;

  // Search by pure title ONLY (never with year in query string)
  const queryVariations = [
    cleanTitle,
    cleanTitle.includes(':') ? cleanTitle.split(':')[0].trim() : '',
  ]
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i);

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

  const isSatisfiedHD = (links: ScrapedLinkItem[]): boolean => {
    const has480 = links.some((l) => l.quality === '480p');
    const has720 = links.some((l) => l.quality === '720p');
    const has1080 = links.some((l) => l.quality === '1080p');
    const isHd = hasAnyHdLinks(links);
    if (type === 'movie') {
      return isHd && (has720 || has1080) && (has480 || (has720 && has1080));
    }
    return isHd && links.length >= 2;
  };

  // ==========================================
  // STAGE 1: FilmyCab / FilmyGo (1st Priority)
  // ==========================================
  log(`[Stage 1/5] Querying FilmyCab / FilmyGo (${fgDomain}) for "${cleanTitle}"...`);
  let stage1Candidates: { url: string; source: string; postTitle?: string; isSample?: boolean }[] =
    [];

  for (const q of queryVariations) {
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
              source: 'FilmyCab',
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
    log(`FilmyCab: Found ${stage1Candidates.length} candidate links, verifying...`);
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

    if (isSatisfiedHD(s1Result.scrapedItems)) {
      log(`✓ FilmyCab: All required HD links verified! Waterfall finalized at Stage 1.`);
      finalProvider = 'FilmyCab (Final)';
      return buildFinalResult(
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
      log(`FilmyCab: Some links found, but not all required HD. Proceeding to Stage 2...`);
    }
  } else {
    log(`FilmyCab: No matching posts/links found. Proceeding to Stage 2...`);
  }

  // ==========================================
  // STAGE 2: MoviesDrive (2nd Priority)
  // ==========================================
  if (!signal?.aborted) {
    log(`[Stage 2/5] Querying MoviesDrive (${mdDomain}) for "${cleanTitle}"...`);
    let stage2Candidates: {
      url: string;
      source: string;
      postTitle?: string;
      isSample?: boolean;
    }[] = [];

    for (const q of queryVariations) {
      if (signal?.aborted) break;
      try {
        const posts = await scrapeMoviesdrivePosts(q, 1, signal);
        if (!posts.length) continue;

        const verifiedPosts = rankAndVerifyPosts(posts, cleanTitle, searchYear);

        for (const p of verifiedPosts.slice(0, maxPostsPerProvider)) {
          if (signal?.aborted) break;
          const rawHits = await scrapeMoviesdrivePostLinks(p.url, signal);
          const filtered = filterFilmygoHits(rawHits, p.url);
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

      if (isSatisfiedHD(allDiscoveredLinks)) {
        log(`✓ MoviesDrive: All required HD links verified! Waterfall finalized at Stage 2.`);
        finalProvider = 'MoviesDrive (Final)';
        return buildFinalResult(
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
        log(`MoviesDrive: Incomplete HD links. Proceeding to Stage 3 (HDHub4U)...`);
      }
    } else {
      log(`MoviesDrive: No matching posts/links found. Proceeding to Stage 3 (HDHub4U)...`);
    }
  }

  // ==========================================
  // STAGE 3: HDHub4U (3rd Priority & HD Availability Gatekeeper)
  // ==========================================
  if (!signal?.aborted) {
    log(`[Stage 3/5] Querying HDHub4U (${hdDomain}) for "${cleanTitle}"...`);
    let stage3Candidates: {
      url: string;
      source: string;
      postTitle?: string;
      isSample?: boolean;
    }[] = [];
    let hdHubPosts: any[] = [];

    for (const q of queryVariations) {
      if (signal?.aborted) break;
      try {
        const posts = await scrapeHdhub4uPosts(q, signal);
        if (!posts.length) continue;

        const verifiedPosts = rankAndVerifyPosts(posts, cleanTitle, searchYear);
        hdHubPosts = verifiedPosts;

        for (const p of verifiedPosts.slice(0, maxPostsPerProvider)) {
          if (signal?.aborted) break;
          const rawHits = await scrapeHdhub4uPostLinks(p.url, signal);
          const filtered = filterFilmygoHits(rawHits, p.url);
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

      if (isSatisfiedHD(allDiscoveredLinks)) {
        log(`✓ HDHub4U: All required HD links verified! Waterfall finalized at Stage 3.`);
        finalProvider = 'HDHub4U (Final)';
        return buildFinalResult(
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
      return buildFinalResult(
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
    log(`[Stage 4/5] Querying SkyMoviesHD (${skyDomain}) for "${cleanTitle}"...`);
    let stage4Candidates: {
      url: string;
      source: string;
      postTitle?: string;
      isSample?: boolean;
    }[] = [];

    for (const q of queryVariations) {
      if (signal?.aborted) break;
      try {
        const posts = await scrapeSkymoviesPosts(q, signal);
        if (!posts.length) continue;

        const verifiedPosts = rankAndVerifyPosts(posts, cleanTitle, searchYear);

        for (const p of verifiedPosts.slice(0, maxPostsPerProvider)) {
          if (signal?.aborted) break;
          const rawHits = await scrapeSkymoviesPostLinks(p.url, signal);
          const filtered = filterFilmygoHits(rawHits, p.url);
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

      if (isSatisfiedHD(allDiscoveredLinks)) {
        log(`✓ SkyMoviesHD: All required HD links verified! Waterfall finalized at Stage 4.`);
        finalProvider = 'SkyMoviesHD (Final)';
        return buildFinalResult(
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
    log(`[Stage 5/5] Querying FilmyFly (${ffDomain}) for "${cleanTitle}"...`);
    let stage5Candidates: {
      url: string;
      source: string;
      postTitle?: string;
      isSample?: boolean;
    }[] = [];

    for (const q of queryVariations) {
      if (signal?.aborted) break;
      try {
        const posts = await scrapeFilmyflyPosts(q, 1, signal);
        if (!posts.length) continue;

        const verifiedPosts = rankAndVerifyPosts(posts, cleanTitle, searchYear);

        for (const p of verifiedPosts.slice(0, maxPostsPerProvider)) {
          if (signal?.aborted) break;
          const rawHits = await scrapeFilmyflyPostLinks(p.url, signal);
          const filtered = filterFilmygoHits(rawHits, p.url);
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
  return buildFinalResult(
    allDiscoveredLinks,
    allCheckResults,
    finalMetadata,
    finalSample,
    finalProvider,
    isSatisfiedHD(allDiscoveredLinks),
    logs,
    type,
    stoppedReason
  );
}

function buildFinalResult(
  rawLinks: ScrapedLinkItem[],
  results: LinkCheckResult[],
  metadata: any,
  sample: ScrapedLinkItem | undefined,
  providerUsed: string,
  isComplete: boolean,
  logs: string[],
  type: 'movie' | 'series',
  stoppedReason?: string
): WaterfallSearchResult {
  // Apply deduplication: exactly 1 link per quality category (480p, 720p, 1080p, 2160p), choosing lower size on duplicates
  const deduplicated = deduplicateQualityLinks(rawLinks, type);

  const has480p = deduplicated.some((l) => l.quality === '480p');
  const has720p = deduplicated.some((l) => l.quality === '720p');
  const has1080p = deduplicated.some((l) => l.quality === '1080p');
  const has2160p = deduplicated.some((l) => l.quality === '2160p');
  const hasHdVersion = hasAnyHdLinks(deduplicated);

  const qualityLinks: QualityLinks = buildQualityLinksPayload(deduplicated);

  return {
    links: deduplicated,
    qualityLinks,
    results,
    metadata,
    sample,
    providerUsed,
    isComplete,
    has480p,
    has720p,
    has1080p,
    has2160p,
    hasHdVersion,
    stoppedReason,
    logs,
  };
}
