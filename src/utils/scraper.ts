import { Content, Language, Quality, QualityLinks } from '../types';
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
  ScrapedLinkItem,
  QualityCategory,
  buildQualityLinksPayload,
} from './linkSelector';
import {
  performFullLinkScan,
  detectMetadataForLink,
  LinkCheckResult,
} from './linkScanner';

export interface ProviderPost {
  title: string;
  url: string;
  image?: string;
  raw?: any;
}

export interface ProviderLinkHit {
  url: string;
  file_name?: string;
  label?: string;
  quality?: string;
  size?: string;
  isSample?: boolean;
  is_sample?: boolean;
}

/**
 * Searches FilmyCab / FilmyGo for posts.
 */
export async function scrapeFilmygoPosts(
  query: string,
  page = 1,
  signal?: AbortSignal
): Promise<ProviderPost[]> {
  try {
    const domain = getFilmygoDomain();
    const sUrl = `${domain}/site-search.html?to-search=${encodeURIComponent(query)}&to-page=${page}`;
    const res = await fetch(`/api/filmygo?url=${encodeURIComponent(sUrl)}`, { signal });
    if (!res.ok) return [];
    const data = await res.json();
    return data.posts || [];
  } catch {
    return [];
  }
}

/**
 * Extracts candidate links from a FilmyCab / FilmyGo post page.
 */
export async function scrapeFilmygoPostLinks(
  postUrl: string,
  signal?: AbortSignal
): Promise<ProviderLinkHit[]> {
  try {
    const res = await fetch(`/api/filmygo?url=${encodeURIComponent(postUrl)}`, { signal });
    if (!res.ok) return [];
    const data = await res.json();
    return data.hits || data.links || [];
  } catch {
    return [];
  }
}

/**
 * Searches MoviesDrive for posts.
 */
export async function scrapeMoviesdrivePosts(
  query: string,
  page = 1,
  signal?: AbortSignal
): Promise<ProviderPost[]> {
  try {
    const domain = getMoviesdriveDomain();
    const sUrl = `${domain}/search.html?q=${encodeURIComponent(query)}&page=${page}`;
    const res = await fetch(`/api/moviesdrive?url=${encodeURIComponent(sUrl)}`, { signal });
    if (!res.ok) return [];
    const data = await res.json();
    return data.posts || [];
  } catch {
    return [];
  }
}

/**
 * Extracts candidate links from a MoviesDrive post page.
 */
export async function scrapeMoviesdrivePostLinks(
  postUrl: string,
  signal?: AbortSignal
): Promise<ProviderLinkHit[]> {
  try {
    const res = await fetch(`/api/moviesdrive?url=${encodeURIComponent(postUrl)}`, { signal });
    if (!res.ok) return [];
    const data = await res.json();
    return data.hits || [];
  } catch {
    return [];
  }
}

/**
 * Searches HDHub4U for posts.
 */
export async function scrapeHdhub4uPosts(
  query: string,
  pageOrSignal: number | AbortSignal = 1,
  signal?: AbortSignal
): Promise<ProviderPost[]> {
  try {
    const page = typeof pageOrSignal === 'number' ? pageOrSignal : 1;
    const sig = typeof pageOrSignal === 'number' ? signal : pageOrSignal;
    const domain = getHdhub4uDomain();
    const sUrl = page > 1 
      ? `${domain}/search.html?q=${encodeURIComponent(query)}&page=${page}`
      : `${domain}/search.html?q=${encodeURIComponent(query)}`;
    const res = await fetch(`/api/hdhub4u?url=${encodeURIComponent(sUrl)}`, { signal: sig });
    if (!res.ok) return [];
    const data = await res.json();
    return data.posts || [];
  } catch {
    return [];
  }
}

/**
 * Extracts candidate links from an HDHub4U post page.
 */
export async function scrapeHdhub4uPostLinks(
  postUrl: string,
  signal?: AbortSignal
): Promise<ProviderLinkHit[]> {
  try {
    const res = await fetch(`/api/hdhub4u?url=${encodeURIComponent(postUrl)}`, { signal });
    if (!res.ok) return [];
    const data = await res.json();
    return data.hits || data.candidates || data.links || [];
  } catch {
    return [];
  }
}

/**
 * Searches SkyMoviesHD for posts.
 */
export async function scrapeSkymoviesPosts(
  query: string,
  pageOrSignal: number | AbortSignal = 1,
  signal?: AbortSignal
): Promise<ProviderPost[]> {
  try {
    const page = typeof pageOrSignal === 'number' ? pageOrSignal : 1;
    const sig = typeof pageOrSignal === 'number' ? signal : pageOrSignal;
    const domain = getSkymoviesDomain();
    const sUrl = page > 1
      ? `${domain}/search.php?search=${encodeURIComponent(query)}&page=${page}&cat=All`
      : `${domain}/search.php?search=${encodeURIComponent(query)}&cat=All`;
    const res = await fetch(`/api/skymovieshd?url=${encodeURIComponent(sUrl)}`, { signal: sig });
    if (!res.ok) return [];
    const data = await res.json();
    return data.posts || [];
  } catch {
    return [];
  }
}

/**
 * Extracts candidate links from a SkyMoviesHD post page.
 */
export async function scrapeSkymoviesPostLinks(
  postUrl: string,
  signal?: AbortSignal
): Promise<ProviderLinkHit[]> {
  try {
    const res = await fetch(`/api/skymovieshd?url=${encodeURIComponent(postUrl)}`, { signal });
    if (!res.ok) return [];
    const data = await res.json();
    return data.hits || data.links || [];
  } catch {
    return [];
  }
}

/**
 * Searches FilmyFly for posts.
 */
export async function scrapeFilmyflyPosts(
  query: string,
  page = 1,
  signal?: AbortSignal
): Promise<ProviderPost[]> {
  try {
    const domain = getFilmyflyDomain();
    const sUrl = `${domain}/search.html?search=${encodeURIComponent(query)}&page=${page}`;
    const res = await fetch(`/api/filmyfly?url=${encodeURIComponent(sUrl)}&search=${encodeURIComponent(query)}`, { signal });
    if (!res.ok) return [];
    const data = await res.json();
    return data.posts || [];
  } catch {
    return [];
  }
}

/**
 * Extracts candidate links from a FilmyFly post page.
 */
export async function scrapeFilmyflyPostLinks(
  postUrl: string,
  signal?: AbortSignal
): Promise<ProviderLinkHit[]> {
  try {
    const res = await fetch(`/api/filmyfly?url=${encodeURIComponent(postUrl)}`, { signal });
    if (!res.ok) return [];
    const data = await res.json();
    return data.hits || data.links || [];
  } catch {
    return [];
  }
}

/**
 * Extracts MDrive hits from an mdrive.lol URL.
 */
export async function scrapeMdriveLinks(
  url: string,
  signal?: AbortSignal
): Promise<ProviderLinkHit[]> {
  try {
    const res = await fetch(`/api/mdrive?url=${encodeURIComponent(url)}`, { signal });
    if (!res.ok) return [];
    const data = await res.json();
    return data.hits || [];
  } catch {
    return [];
  }
}

/**
 * Unwraps HowBlogs intermediate link.
 */
export async function scrapeHowblogsLink(
  url: string,
  signal?: AbortSignal
): Promise<string | null> {
  try {
    const res = await fetch(`/api/howblogs?url=${encodeURIComponent(url)}`, { signal });
    if (!res.ok) return null;
    const data = await res.json();
    return data.url || null;
  } catch {
    return null;
  }
}

/**
 * Unwraps FilesDL intermediate link.
 */
export async function scrapeFilesdlLink(
  url: string,
  signal?: AbortSignal
): Promise<string | null> {
  try {
    const res = await fetch(`/api/filesdl?url=${encodeURIComponent(url)}`, { signal });
    if (!res.ok) return null;
    const data = await res.json();
    return data.url || null;
  } catch {
    return null;
  }
}

/**
 * Directly extracts resolved metadata and clean direct link from Hubcloud.
 */
export async function extractHubcloudDirectLink(url: string): Promise<any> {
  try {
    const res = await fetch('/api/hubcloud/direct-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

const intermediateResolutionCache = new Map<string, { url: string; source: string; postTitle?: string; isSample?: boolean }[]>();

/**
 * Resolves intermediate wrapper links (mdrive, howblogs, filesdl) into direct cloud links.
 */
export async function resolveIntermediateUrls(
  rawCandidates: { url: string; source: string; postTitle?: string; isSample?: boolean }[],
  signal?: AbortSignal
): Promise<{ url: string; source: string; postTitle?: string; isSample?: boolean }[]> {
  const resolved: { url: string; source: string; postTitle?: string; isSample?: boolean }[] = [];
  const uniqueUrls = new Set<string>();
  const candidatesToProcess: { url: string; source: string; postTitle?: string; isSample?: boolean }[] = [];

  for (const item of rawCandidates) {
    const norm = normalizeUrl(item.url);
    if (!norm || uniqueUrls.has(norm)) continue;
    uniqueUrls.add(norm);

    const cached = intermediateResolutionCache.get(norm);
    if (cached) {
      resolved.push(...cached);
    } else {
      candidatesToProcess.push({ ...item, url: norm });
    }
  }

  if (candidatesToProcess.length === 0) {
    return resolved;
  }

  const concurrency = 25;
  const queue = [...candidatesToProcess];

  const processCandidate = async (item: { url: string; source: string; postTitle?: string; isSample?: boolean }) => {
    const norm = item.url;
    const itemResolved: { url: string; source: string; postTitle?: string; isSample?: boolean }[] = [];

    try {
      const candidateTimeoutController = new AbortController();
      const timeoutId = setTimeout(() => candidateTimeoutController.abort(), 6000);
      const combinedSignal = signal ? AbortSignal.any([signal, candidateTimeoutController.signal]) : candidateTimeoutController.signal;

      if (norm.includes('mdrive.lol') || norm.includes('mdrvie.lol')) {
        const mHits = await scrapeMdriveLinks(norm, combinedSignal);
        clearTimeout(timeoutId);
        const nonGdflix = mHits.filter((h) => !/(gdflix)/i.test(h.url || ''));
        const hubcloud = nonGdflix.filter((h) =>
          /(hubcloud|vcloud|hubdrive|drivehub|hubcdn|hblinks)/i.test(h.url || '')
        );
        const chosen = hubcloud.length > 0 ? hubcloud : nonGdflix;
        chosen.slice(0, 3).forEach((ch) => {
          if (ch.url) {
            itemResolved.push({
              url: ch.url,
              source: item.source,
              postTitle: item.postTitle,
              isSample: Boolean(item.isSample || ch.isSample || ch.is_sample),
            });
          }
        });
      } else if (norm.includes('howblogs.xyz')) {
        const hbUrl = await scrapeHowblogsLink(norm, combinedSignal);
        clearTimeout(timeoutId);
        if (hbUrl) {
          itemResolved.push({
            url: hbUrl,
            source: item.source,
            postTitle: item.postTitle,
            isSample: item.isSample,
          });
        }
      } else if (
        norm.includes('filesdl.') ||
        norm.includes('filesdl.in') ||
        norm.includes('filesdl.top')
      ) {
        const fUrl = await scrapeFilesdlLink(norm, combinedSignal);
        clearTimeout(timeoutId);
        if (fUrl) {
          itemResolved.push({
            url: fUrl,
            source: item.source,
            postTitle: item.postTitle,
            isSample: item.isSample,
          });
        }
      } else {
        clearTimeout(timeoutId);
      }
    } catch {}

    if (itemResolved.length === 0) {
      itemResolved.push(item);
    }

    intermediateResolutionCache.set(norm, itemResolved);
    resolved.push(...itemResolved);
  };

  const worker = async () => {
    while (queue.length > 0) {
      if (signal?.aborted) break;
      const target = queue.shift();
      if (!target) break;
      await processCandidate(target);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, queue.length) }, () => worker())
  );

  return resolved;
}

export interface CheckContentViaLinkCheckerOptions {
  title?: string;
  year?: number;
  type?: 'movie' | 'series';
  input?: string;
  content?: Content | null;
  languages?: Language[];
  qualities?: Quality[];
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
  maxPostsPerProvider?: number;
}

export interface CheckContentViaLinkCheckerResult {
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
}

/**
 * Splits text into individual URL tokens.
 */
export function splitLinks(text: string): string[] {
  if (!text) return [];
  const lines = text.split(/[\r\n\t,;\s]+/);
  return lines.filter((l) => l.trim().length > 0);
}

/**
 * Unified Multi-Provider Scraping & Link Checking Orchestrator.
 * Searches across FilmyCab, HDHub4U, SkyMoviesHD, MoviesDrive, FilmyFly, unwraps links, and validates via performFullLinkScan.
 */
export async function checkContentViaLinkChecker(
  options: CheckContentViaLinkCheckerOptions
): Promise<CheckContentViaLinkCheckerResult> {
  const {
    title = '',
    year,
    input = '',
    languages = [],
    qualities = [],
    signal,
    onProgress,
    maxPostsPerProvider = 2,
  } = options;

  const log = (msg: string) => {
    if (onProgress) onProgress(msg);
  };

  const rawCandidateUrls: { url: string; source: string; postTitle?: string; isSample?: boolean }[] = [];

  // 1. Direct input links if provided
  if (input.trim()) {
    const directLinks = splitLinks(input).map(normalizeUrl).filter(Boolean);
    directLinks.forEach((u) => {
      rawCandidateUrls.push({ url: u, source: 'Direct Input' });
    });
  }

  // 2. If title is provided, perform Multi-Source Search across all 5 providers
  if (title.trim()) {
    log(`Searching providers for "${title}"...`);
    const cleanTitle = title.trim();
    // Search by title only (then verify by year)
    const queryVariations = [
      cleanTitle,
      cleanTitle.includes(':') ? cleanTitle.split(':')[0].trim() : '',
    ].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);

    const providerTasks = [
      // FilmyGo / FilmyCab
      async () => {
        for (const q of queryVariations) {
          if (signal?.aborted) break;
          const posts = await scrapeFilmygoPosts(q, 1, signal);
          if (!posts.length) continue;
          const verifiedPosts = rankAndVerifyPosts(posts, cleanTitle, year);

          for (const p of verifiedPosts.slice(0, maxPostsPerProvider)) {
            if (signal?.aborted) break;
            const rawHits = await scrapeFilmygoPostLinks(p.url, signal);
            const filtered = filterFilmygoHits(rawHits, p.url);
            const toUse = filtered.length > 0 ? filtered : rawHits;
            toUse.forEach((h: any) => {
              const u = h.url || h.href;
              if (u) {
                rawCandidateUrls.push({
                  url: u,
                  source: 'FilmyGo',
                  postTitle: p.title,
                  isSample: Boolean(h.isSample || h.is_sample || /\bsample\b/i.test(h.file_name || '')),
                });
              }
            });
          }
          if (rawCandidateUrls.length > 0) break;
        }
      },
      // HDHub4U
      async () => {
        for (const q of queryVariations) {
          if (signal?.aborted) break;
          const posts = await scrapeHdhub4uPosts(q, signal);
          if (!posts.length) continue;
          const verifiedPosts = rankAndVerifyPosts(posts, cleanTitle, year);

          for (const p of verifiedPosts.slice(0, maxPostsPerProvider)) {
            if (signal?.aborted) break;
            const rawHits = await scrapeHdhub4uPostLinks(p.url, signal);
            const filtered = filterHdhub4uHits(rawHits, p.url);
            const toUse = filtered.length > 0 ? filtered : rawHits;
            toUse.forEach((h: any) => {
              const u = h.url || h.href;
              if (u) {
                rawCandidateUrls.push({
                  url: u,
                  source: 'HDHub4U',
                  postTitle: p.title,
                  isSample: Boolean(h.isSample || h.is_sample),
                });
              }
            });
          }
          if (rawCandidateUrls.length > 0) break;
        }
      },
      // SkyMoviesHD
      async () => {
        for (const q of queryVariations) {
          if (signal?.aborted) break;
          const posts = await scrapeSkymoviesPosts(q, signal);
          if (!posts.length) continue;
          const verifiedPosts = rankAndVerifyPosts(posts, cleanTitle, year);

          for (const p of verifiedPosts.slice(0, maxPostsPerProvider)) {
            if (signal?.aborted) break;
            const rawHits = await scrapeSkymoviesPostLinks(p.url, signal);
            const filtered = filterSkymoviesHits(rawHits, p.url);
            const toUse = filtered.length > 0 ? filtered : rawHits;
            toUse.forEach((h: any) => {
              const u = h.url || h.href;
              if (u) {
                rawCandidateUrls.push({
                  url: u,
                  source: 'SkyMoviesHD',
                  postTitle: p.title,
                  isSample: Boolean(h.isSample || h.is_sample),
                });
              }
            });
          }
          if (rawCandidateUrls.length > 0) break;
        }
      },
      // MoviesDrive
      async () => {
        for (const q of queryVariations) {
          if (signal?.aborted) break;
          const posts = await scrapeMoviesdrivePosts(q, 1, signal);
          if (!posts.length) continue;
          const verifiedPosts = rankAndVerifyPosts(posts, cleanTitle, year);

          for (const p of verifiedPosts.slice(0, maxPostsPerProvider)) {
            if (signal?.aborted) break;
            const rawHits = await scrapeMoviesdrivePostLinks(p.url, signal);
            const filtered = filterMoviesdriveHits(rawHits, p.url);
            const toUse = filtered.length > 0 ? filtered : rawHits;
            toUse.forEach((h: any) => {
              const u = h.url || h.href;
              if (u) {
                rawCandidateUrls.push({
                  url: u,
                  source: 'MoviesDrive',
                  postTitle: p.title,
                  isSample: Boolean(h.isSample || h.is_sample),
                });
              }
            });
          }
          if (rawCandidateUrls.length > 0) break;
        }
      },
      // FilmyFly
      async () => {
        for (const q of queryVariations) {
          if (signal?.aborted) break;
          const posts = await scrapeFilmyflyPosts(q, 1, signal);
          if (!posts.length) continue;
          const verifiedPosts = rankAndVerifyPosts(posts, cleanTitle, year);

          for (const p of verifiedPosts.slice(0, maxPostsPerProvider)) {
            if (signal?.aborted) break;
            const rawHits = await scrapeFilmyflyPostLinks(p.url, signal);
            const filtered = filterFilmyflyHits(rawHits, p.url);
            const toUse = filtered.length > 0 ? filtered : rawHits;
            toUse.forEach((h: any) => {
              const u = h.url || h.href;
              if (u) {
                rawCandidateUrls.push({
                  url: u,
                  source: 'FilmyFly',
                  postTitle: p.title,
                  isSample: Boolean(h.isSample || h.is_sample),
                });
              }
            });
          }
          if (rawCandidateUrls.length > 0) break;
        }
      },
    ];

    await Promise.all(providerTasks.map((fn) => fn()));
  }

  // 3. Resolve intermediate wrapper links (mdrive, howblogs, filesdl)
  const resolvedDirectUrls = await resolveIntermediateUrls(rawCandidateUrls, signal);

  log(`Checking and verifying ${resolvedDirectUrls.length} links via LinkChecker engine...`);

  // 4. Run performFullLinkScan on candidate URLs (parallel with concurrency limit)
  const metaMap: Record<string, any> = {};
  const fullTextContext = resolvedDirectUrls.map((r) => `${r.postTitle || ''} ${r.url}`).join('\n');
  resolvedDirectUrls.forEach((r) => {
    metaMap[r.url] = detectMetadataForLink(fullTextContext, r.url, languages, qualities);
  });

  const checkResults: LinkCheckResult[] = [];
  const concurrency = 12;
  const queue = [...resolvedDirectUrls];

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
    Array.from({ length: Math.min(concurrency, resolvedDirectUrls.length) }, () => worker())
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
  let detectedType: 'movie' | 'series' = options.type || 'movie';
  let detectedSeason: number | undefined;
  let detectedEpisode: number | undefined;
  let sampleScrapedItem: ScrapedLinkItem | undefined;

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
      id: `lc-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 4)}`,
      source: 'LinkChecker',
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

    if (isSample && !sampleScrapedItem) {
      sampleScrapedItem = item;
    }
    scrapedItems.push(item);
  });

  const qualityLinks: QualityLinks = buildQualityLinksPayload(scrapedItems);

  return {
    links: scrapedItems,
    qualityLinks,
    results: checkResults,
    metadata: {
      title: title || undefined,
      year: year || undefined,
      languages: Array.from(detectedLangs),
      printQuality: detectedPrintQuality,
      subtitles: detectedSubtitles,
      type: detectedType,
      season: detectedSeason,
      episode: detectedEpisode,
      sampleUrl: sampleScrapedItem ? sampleScrapedItem.url : undefined,
    },
    sample: sampleScrapedItem,
  };
}
