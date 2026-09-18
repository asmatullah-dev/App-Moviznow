/**
 * HubCloud API Client Utilities
 * Handles communication with HubCloud extraction endpoints on local backend or AI Studio Cloud Run bridge.
 */

export const AI_STUDIO_API_URL =
  (import.meta.env.VITE_AI_STUDIO_API_URL as string) || "";

// In-memory frontend caches
const clientExtractCache = new Map<string, { data: any; timestamp: number }>();
const clientDirectCache = new Map<string, { data: any; timestamp: number }>();
const CLIENT_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// Helper to get from localStorage
function getLocalCache(storageKey: string, url: string): any {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const entry = parsed[url];
    if (entry && Date.now() - (entry.timestamp || 0) < CLIENT_CACHE_TTL) {
      return entry.data || entry;
    }
  } catch (e) {}
  return null;
}

// Helper to set to localStorage
function setLocalCache(storageKey: string, url: string, data: any) {
  try {
    const raw = localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : {};
    parsed[url] = { data, timestamp: Date.now() };
    // Cap localStorage items to avoid quota issues
    const keys = Object.keys(parsed);
    if (keys.length > 500) {
      delete parsed[keys[0]];
    }
    localStorage.setItem(storageKey, JSON.stringify(parsed));
  } catch (e) {}
}

/**
 * Check if the app is currently running on Vercel or an external deployment
 */
export function isVercelEnvironment(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname.toLowerCase();
  return host.includes("vercel.app") || host.includes("now.sh");
}

/**
 * Fetch raw HubCloud page HTML or parsed info.
 */
export async function fetchHubcloudPage(
  url: string,
  options?: { isVcloud?: boolean; force?: boolean },
): Promise<any> {
  const isVcloud = options?.isVcloud ?? url.includes("vcloud");
  const force = options?.force ?? false;

  // 1. First attempt: local /api/hubcloud/page
  try {
    const res = await fetch("/api/hubcloud/page", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, isVcloud, force }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.ok && !data.isCloudflare && data.html) {
        return data;
      }
    }
  } catch (e) {
    // Local failed, fallback to AI Studio if configured
  }

  // 2. Direct AI Studio Cloud Run API fallback (if configured and different host)
  if (AI_STUDIO_API_URL && AI_STUDIO_API_URL.startsWith("http")) {
    try {
      const aiStudioRes = await fetch(`${AI_STUDIO_API_URL.replace(/\/+$/, "")}/api/hubcloud/page`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-AI-Studio-Proxy": "client",
        },
        body: JSON.stringify({ url, isVcloud, force }),
      });
      if (aiStudioRes.ok) {
        const data = await aiStudioRes.json();
        if (data && data.ok && !data.isCloudflare) {
          return data;
        }
      }
    } catch (e) {
      console.warn("[fetchHubcloudPage] Failed to fetch via AI Studio API:", e);
    }
  }

  return { ok: false, error: "Failed to fetch page from backend" };
}

/**
 * Extract HubCloud metadata (title, size, status).
 */
export async function fetchHubcloudExtract(
  url: string,
  options?: { isVcloud?: boolean; force?: boolean; forceExtract?: boolean },
): Promise<any> {
  if (!url) return { isWorking: false, title: "", size: "" };
  const isVcloud = options?.isVcloud ?? url.includes("vcloud");
  const force = options?.force ?? false;
  const forceExtract = options?.forceExtract ?? false;

  // Check client-side memory and localStorage cache first
  if (!force) {
    const memCached = clientExtractCache.get(url);
    if (memCached && Date.now() - memCached.timestamp < CLIENT_CACHE_TTL) {
      return memCached.data;
    }
    const localCached = getLocalCache("hubcloud_extract_client_cache", url);
    if (localCached) {
      clientExtractCache.set(url, { data: localCached, timestamp: Date.now() });
      return localCached;
    }
  }

  // 1. Try local endpoint
  try {
    const res = await fetch("/api/hubcloud/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, isVcloud, force, forceExtract }),
    });
    if (res.ok) {
      const data = await res.json();
      const isCloudflare =
        data?.isCloudflare ||
        data?.title?.toLowerCase().includes("cloudflare") ||
        data?.title?.toLowerCase().includes("just a moment");
      if (!isCloudflare && (data.title || data.size || data.isWorking)) {
        clientExtractCache.set(url, { data, timestamp: Date.now() });
        setLocalCache("hubcloud_extract_client_cache", url, data);
        return data;
      }
    }
  } catch (e) {
    // Fall back
  }

  // 2. Fall back to AI Studio Cloud Run API if configured
  if (AI_STUDIO_API_URL && AI_STUDIO_API_URL.startsWith("http")) {
    try {
      const aiStudioRes = await fetch(`${AI_STUDIO_API_URL.replace(/\/+$/, "")}/api/hubcloud/extract`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-AI-Studio-Proxy": "client",
        },
        body: JSON.stringify({ url, isVcloud, force, forceExtract }),
      });
      if (aiStudioRes.ok) {
        const data = await aiStudioRes.json();
        clientExtractCache.set(url, { data, timestamp: Date.now() });
        setLocalCache("hubcloud_extract_client_cache", url, data);
        return data;
      }
    } catch (e) {
      console.warn("[fetchHubcloudExtract] AI Studio fallback error:", e);
    }
  }

  return { isWorking: false, title: "", size: "" };
}

/**
 * Direct Link resolver with client-side caching.
 */
export async function fetchHubcloudDirectLink(
  url: string,
  options?: { isVcloud?: boolean; force?: boolean; checkOnly?: boolean },
): Promise<any> {
  if (!url) return { url };
  const isVcloud = options?.isVcloud ?? url.includes("vcloud");
  const force = options?.force ?? false;
  const checkOnly = options?.checkOnly ?? false;

  // Check client-side memory and localStorage cache
  if (!force) {
    const memCached = clientDirectCache.get(url);
    if (memCached && Date.now() - memCached.timestamp < CLIENT_CACHE_TTL) {
      return memCached.data;
    }
    const localCached = getLocalCache("hubcloud_extraction_cache", url);
    if (localCached && localCached.url && localCached.url !== url) {
      clientDirectCache.set(url, { data: localCached, timestamp: Date.now() });
      return localCached;
    }
  }

  // 1. Try local endpoint
  try {
    const res = await fetch("/api/hubcloud/direct-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, isVcloud, force, checkOnly }),
    });
    if (res.ok) {
      const data = await res.json();
      if (!data?.isCloudflare && (data.url || data.candidates?.length)) {
        clientDirectCache.set(url, { data, timestamp: Date.now() });
        setLocalCache("hubcloud_extraction_cache", url, data);
        return data;
      }
    }
  } catch (e) {
    // Fall back
  }

  // 2. Fall back to AI Studio Cloud Run API if configured
  if (AI_STUDIO_API_URL && AI_STUDIO_API_URL.startsWith("http")) {
    try {
      const aiStudioRes = await fetch(`${AI_STUDIO_API_URL.replace(/\/+$/, "")}/api/hubcloud/direct-link`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-AI-Studio-Proxy": "client",
        },
        body: JSON.stringify({ url, isVcloud, force, checkOnly }),
      });
      if (aiStudioRes.ok) {
        const data = await aiStudioRes.json();
        clientDirectCache.set(url, { data, timestamp: Date.now() });
        setLocalCache("hubcloud_extraction_cache", url, data);
        return data;
      }
    } catch (e) {
      console.warn("[fetchHubcloudDirectLink] AI Studio fallback error:", e);
    }
  }

  return { url };
}
