import { safeStorage } from './safeStorage';
import { HUBCLOUD_DOMAIN, HUBDRIVE_DOMAIN, getStreamingApiBase } from './domains';

export interface CachedExtractionResult {
  url: string; // The primary direct stream / download link
  streamUrl?: string; // Direct video stream URL for native player
  watchUrl?: string; // hbplay / watch online link
  candidates?: { text: string; href: string }[];
  size?: string;
  quality?: string;
  title?: string;
  timestamp: number;
  isCloudflare?: boolean;
}

const EXTRACTION_CACHE_KEY = 'hubcloud_extraction_cache';
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes unified cache TTL

// Fast in-memory extraction cache Map shared by all components in the active browser session
const unifiedMemoryCache = new Map<string, CachedExtractionResult>();

// In-flight request deduplication map to avoid parallel duplicate network requests for the same URL
const inFlightUnifiedRequests = new Map<string, Promise<CachedExtractionResult | null>>();

/**
 * Normalizes movie/series link URLs to active domains (HubCloud, HubDrive, etc.)
 */
export function normalizeContentUrl(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  let urlStr = rawUrl.trim();

  // If missing protocol, add https
  if (!urlStr.startsWith('http://') && !urlStr.startsWith('https://') && !urlStr.startsWith('tg://')) {
    urlStr = 'https://' + urlStr;
  }

  try {
    const parsed = new URL(urlStr);
    const host = parsed.hostname.toLowerCase();

    // Map legacy HubCloud hosts
    if (
      host.includes('hubcould') ||
      host.includes('hubcloud.one') ||
      host.includes('hubcloud.foo') ||
      host.includes('hubcloud.cx') ||
      host.includes('hubcloud.club') ||
      (host.includes('hubcloud') && !host.includes('hubcloud.ist'))
    ) {
      parsed.hostname = 'hubcloud.ist';
      return parsed.toString();
    }

    // Map legacy HubDrive hosts
    if (host.includes('hubdrive') && !host.includes('hubdrive.space')) {
      parsed.hostname = 'hubdrive.space';
      return parsed.toString();
    }

    return parsed.toString();
  } catch (e) {
    // If URL parsing fails, attempt regex fallback
    return urlStr
      .replace(/https?:\/\/(?:www\.)?(?:hubcloud\.one|hubcloud\.foo|hubcould\.\w+|hubcloud\.cx)/gi, HUBCLOUD_DOMAIN)
      .replace(/https?:\/\/(?:www\.)?hubdrive\.\w+/gi, HUBDRIVE_DOMAIN);
  }
}

/**
 * Converts pixeldrain view URLs into direct API file stream URLs
 */
export function normalizePixeldrainUrl(url?: string): string {
  if (!url || typeof url !== "string") return "";
  const trimmed = url.trim();
  const uMatch = trimmed.match(
    /(?:https?:\/\/)?(?:www\.)?(pixeldrain\.(?:dev|com|net)|pixel\.drain|pixeldra\.in)\/(?:u|api\/file)\/([a-zA-Z0-9_-]+)/i
  );
  if (uMatch && uMatch[2]) {
    const host = uMatch[1].toLowerCase().includes("dev") ? "pixeldrain.dev" : "pixeldrain.com";
    return `https://${host}/api/file/${uMatch[2]}`;
  }
  return trimmed;
}

export function isHubcloudRawLink(u: string): boolean {
  if (!u) return false;
  const l = u.toLowerCase();
  return (
    l.includes("hubcloud") ||
    l.includes("hubcould") ||
    l.includes("hubdrive") ||
    l.includes("moviesdrive") ||
    l.includes("drivehub") ||
    l.includes("vcloud")
  );
}

/**
 * Reads from the unified extraction cache (checks in-memory map first, then persistent storage)
 */
export function getCachedLinkExtraction(url: string): CachedExtractionResult | null {
  if (!url) return null;
  const rawUrl = url.trim();
  const normalized = normalizeContentUrl(rawUrl);

  const now = Date.now();

  // 1. Check in-memory session cache first
  const mem = unifiedMemoryCache.get(rawUrl) || unifiedMemoryCache.get(normalized);
  if (mem && now - mem.timestamp < CACHE_TTL_MS && mem.url && !isHubcloudRawLink(mem.url)) {
    return mem;
  }

  // 2. Check persistent storage
  try {
    const raw = safeStorage.getItem(EXTRACTION_CACHE_KEY);
    if (!raw) return null;

    const cache: Record<string, CachedExtractionResult> = JSON.parse(raw);
    const cached = cache[rawUrl] || cache[normalized];
    if (cached && now - cached.timestamp < CACHE_TTL_MS && cached.url && !isHubcloudRawLink(cached.url)) {
      // Re-populate in-memory cache
      unifiedMemoryCache.set(rawUrl, cached);
      if (normalized !== rawUrl) unifiedMemoryCache.set(normalized, cached);
      return cached;
    }
  } catch (e) {
    // Suppress parse errors
  }

  return null;
}

/**
 * Saves a link extraction result safely to both in-memory cache and persistent storage
 */
export function saveCachedLinkExtraction(
  url: string,
  data: {
    finalUrl?: string;
    url?: string;
    streamUrl?: string;
    watchUrl?: string;
    finalCandidates?: { text: string; href: string }[];
    candidates?: { text: string; href: string }[];
    finalSize?: string;
    size?: string;
    quality?: string;
    title?: string;
    isCloudflare?: boolean;
  }
): void {
  const primaryUrl = (data.finalUrl || data.url || data.streamUrl || "").trim();
  if (!url || !primaryUrl || isHubcloudRawLink(primaryUrl)) return;

  const rawUrl = url.trim();
  const normalized = normalizeContentUrl(rawUrl);
  const now = Date.now();

  const payload: CachedExtractionResult = {
    url: primaryUrl,
    streamUrl: data.streamUrl ? normalizePixeldrainUrl(data.streamUrl) : normalizePixeldrainUrl(primaryUrl),
    watchUrl: data.watchUrl,
    candidates: data.finalCandidates || data.candidates,
    size: data.finalSize || data.size,
    quality: data.quality,
    title: data.title,
    isCloudflare: data.isCloudflare,
    timestamp: now,
  };

  // 1. Save in-memory
  unifiedMemoryCache.set(rawUrl, payload);
  if (normalized !== rawUrl) {
    unifiedMemoryCache.set(normalized, payload);
  }

  // 2. Save in persistent safeStorage
  try {
    const raw = safeStorage.getItem(EXTRACTION_CACHE_KEY);
    const cache: Record<string, CachedExtractionResult> = raw ? JSON.parse(raw) : {};

    // Prune entries older than TTL
    const cleanCache: Record<string, CachedExtractionResult> = {};
    for (const key in cache) {
      if (now - cache[key].timestamp < CACHE_TTL_MS) {
        cleanCache[key] = cache[key];
      }
    }

    cleanCache[rawUrl] = payload;
    if (normalized !== rawUrl) {
      cleanCache[normalized] = payload;
    }

    safeStorage.setItem(EXTRACTION_CACHE_KEY, JSON.stringify(cleanCache));
  } catch (e) {
    console.error('Failed to cache link extraction safely', e);
  }
}

/**
 * Unified stream and download link extractor
 * Unifies the extraction process and cache between Play Movie, Download Link Modal, and NativePlayer
 */
export async function unifiedExtractStream(
  rawUrl: string,
  options?: {
    force?: boolean;
    timeoutMs?: number;
    isVcloud?: boolean;
    isVcloudName?: boolean;
  }
): Promise<CachedExtractionResult | null> {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const url = rawUrl.trim();
  const normalized = normalizeContentUrl(url);

  // 1. Direct stream check (Pixeldrain, direct .mp4/.mkv, R2, Cloudflare storage)
  const isPd = (u: string) => {
    const l = u.toLowerCase();
    return l.includes("pixeldrain") || l.includes("pixel.drain") || l.includes("pixeldra.in");
  };

  if (isPd(url)) {
    const stream = normalizePixeldrainUrl(url);
    const directResult: CachedExtractionResult = {
      url: stream,
      streamUrl: stream,
      watchUrl: stream,
      candidates: [{ text: "Pixeldrain Server", href: stream }],
      timestamp: Date.now(),
    };
    saveCachedLinkExtraction(url, directResult);
    return directResult;
  }

  const isDirectVideo = (u: string) => {
    const l = u.toLowerCase();
    return l.includes(".mp4") || l.includes(".mkv") || l.includes(".webm") || l.includes("workers.dev");
  };

  if (isDirectVideo(url)) {
    const stream = normalizePixeldrainUrl(url);
    const directResult: CachedExtractionResult = {
      url: stream,
      streamUrl: stream,
      watchUrl: stream,
      candidates: [{ text: "Direct Stream", href: stream }],
      timestamp: Date.now(),
    };
    saveCachedLinkExtraction(url, directResult);
    return directResult;
  }

  // 2. Check unified cache (unless force refresh requested)
  if (!options?.force) {
    const cached = getCachedLinkExtraction(url);
    if (cached && cached.url && !isHubcloudRawLink(cached.url)) {
      return cached;
    }
  }

  // If offline, do not attempt network extraction
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return getCachedLinkExtraction(url) || null;
  }

  // 3. Deduplicate in-flight extraction requests
  const requestKey = `${url}_${Boolean(options?.force)}`;
  if (inFlightUnifiedRequests.has(requestKey)) {
    return inFlightUnifiedRequests.get(requestKey)!;
  }

  const isVcloud = Boolean(options?.isVcloud || url.includes("vcloud") || options?.isVcloudName);

  // 4. Perform extraction with immediate retry on transient errors
  const extractTask = async (): Promise<CachedExtractionResult | null> => {
    let attempts = 0;
    const maxAttempts = 2;

    while (attempts < maxAttempts) {
      attempts++;
      const timeoutMs = options?.timeoutMs || (attempts === 1 ? 9000 : 7000);

      try {
        // Step 4a: Call core HubCloud extraction endpoint
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        const res = await fetch("/api/hubcloud/direct-link", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url,
            isVcloud,
            forceExtract: Boolean(options?.isVcloudName),
            force: attempts > 1 || Boolean(options?.force),
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (res.ok) {
          const data = await res.json();
          const candidates: { text: string; href: string }[] = Array.isArray(data.candidates) ? data.candidates : [];

          // Find Pixeldrain, FSL, or direct stream candidates
          const isPixelCand = (c: any) => {
            if (!c || !c.href) return false;
            const t = (c.text || '').toLowerCase();
            const h = (c.href || '').toLowerCase();
            return t.includes('pixel') || h.includes('pixeldrain') || h.includes('pixelserver');
          };
          const isFslCand = (c: any) => {
            if (!c || !c.href) return false;
            const t = (c.text || '').toLowerCase();
            const h = (c.href || '').toLowerCase();
            return t.includes('fsl') || h.includes('cloudflarestorage') || h.includes('.r2.');
          };

          const pixelCand = candidates.find(isPixelCand);
          const fslCand = candidates.find(isFslCand);
          const anyDirectCand = candidates.find((c) => c.href && !isHubcloudRawLink(c.href));

          let directStream = "";
          if (fslCand?.href) {
            directStream = fslCand.href;
          } else if (pixelCand?.href) {
            directStream = pixelCand.href;
          } else if (anyDirectCand?.href) {
            directStream = anyDirectCand.href;
          } else if (data.url && !isHubcloudRawLink(data.url)) {
            directStream = data.url;
          }

          if (directStream && !isHubcloudRawLink(directStream)) {
            const normalizedStream = normalizePixeldrainUrl(directStream);
            const downloadUrl = pixelCand?.href ? normalizePixeldrainUrl(pixelCand.href) : normalizedStream;

            const finalCandidates = candidates.length > 0
              ? candidates
              : [{ text: "Direct Stream", href: downloadUrl }];

            const result: CachedExtractionResult = {
              url: downloadUrl,
              streamUrl: normalizedStream,
              watchUrl: data.watchUrl || normalizedStream,
              candidates: finalCandidates,
              size: data.size,
              quality: data.quality || data.shortQuality,
              title: data.title || data.original_title,
              isCloudflare: Boolean(data.isCloudflare),
              timestamp: Date.now(),
            };

            saveCachedLinkExtraction(url, result);
            return result;
          }
        }
      } catch (err: any) {
        console.warn(`[unifiedExtractStream] Attempt ${attempts} failed for ${url}:`, err.message || err);
      }

      // Step 4b: Fallback to native-player/check endpoint
      try {
        const apiBase = getStreamingApiBase();
        const controller2 = new AbortController();
        const timeoutId2 = setTimeout(() => controller2.abort(), 6000);

        const checkRes = await fetch(`${apiBase}/api/native-player/check`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
          signal: controller2.signal,
        });

        clearTimeout(timeoutId2);

        if (checkRes.ok) {
          const checkData = await checkRes.json();
          const stream = checkData.streamUrl || checkData.directUrl || checkData.sourceUrl;
          if (stream && !isHubcloudRawLink(stream)) {
            const normalizedStream = normalizePixeldrainUrl(stream);
            const result: CachedExtractionResult = {
              url: normalizedStream,
              streamUrl: normalizedStream,
              watchUrl: checkData.watchUrl || normalizedStream,
              candidates: checkData.candidates || [{ text: "Stream Server", href: normalizedStream }],
              size: checkData.size,
              quality: checkData.quality,
              title: checkData.title,
              timestamp: Date.now(),
            };
            saveCachedLinkExtraction(url, result);
            return result;
          }
        }
      } catch (checkErr: any) {
        console.warn(`[unifiedExtractStream] native-player/check fallback error:`, checkErr.message || checkErr);
      }

      // If attempt 1 failed, immediately retry without pause
      if (attempts < maxAttempts) {
        await new Promise((r) => setTimeout(r, 100));
      }
    }

    return null;
  };

  const taskPromise = extractTask().finally(() => {
    inFlightUnifiedRequests.delete(requestKey);
  });

  inFlightUnifiedRequests.set(requestKey, taskPromise);
  return taskPromise;
}

