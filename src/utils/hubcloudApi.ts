/**
 * HubCloud API Client Utilities
 * Handles communication with HubCloud extraction endpoints on local backend or AI Studio Cloud Run bridge.
 */

export const AI_STUDIO_API_URL =
  (import.meta.env.VITE_AI_STUDIO_API_URL as string) ||
  "https://ais-pre-ztgr34s3xe3g6vxljx3ldl-684080073915.asia-southeast1.run.app";

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
 * Tries local /api/hubcloud/page, and if that fails or returns Cloudflare/error,
 * falls back to AI Studio's Cloud Run API.
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
    // Local failed, fallback to AI Studio
  }

  // 2. Direct AI Studio Cloud Run API fallback
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

  return { ok: false, error: "Failed to fetch page from backend and AI Studio API" };
}

/**
 * Extract HubCloud metadata (title, size, status).
 * Handles automatic fallback from local Vercel endpoint to AI Studio Cloud Run endpoint.
 */
export async function fetchHubcloudExtract(
  url: string,
  options?: { isVcloud?: boolean; force?: boolean; forceExtract?: boolean },
): Promise<any> {
  const isVcloud = options?.isVcloud ?? url.includes("vcloud");
  const force = options?.force ?? false;
  const forceExtract = options?.forceExtract ?? false;

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
      if (!isCloudflare) {
        return data;
      }
    }
  } catch (e) {
    // Fall back to AI Studio API
  }

  // 2. Fall back to AI Studio Cloud Run API
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
      return data;
    }
  } catch (e) {
    console.warn("[fetchHubcloudExtract] AI Studio fallback error:", e);
  }

  return { isWorking: false, title: "", size: "" };
}

/**
 * Direct Link resolver with fallback to AI Studio Cloud Run endpoint.
 */
export async function fetchHubcloudDirectLink(
  url: string,
  options?: { isVcloud?: boolean; force?: boolean; checkOnly?: boolean },
): Promise<any> {
  const isVcloud = options?.isVcloud ?? url.includes("vcloud");
  const force = options?.force ?? false;
  const checkOnly = options?.checkOnly ?? false;

  // 1. Try local endpoint
  try {
    const res = await fetch("/api/hubcloud/direct-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, isVcloud, force, checkOnly }),
    });
    if (res.ok) {
      const data = await res.json();
      if (!data?.isCloudflare) {
        return data;
      }
    }
  } catch (e) {
    // Fall back to AI Studio
  }

  // 2. Fall back to AI Studio Cloud Run API
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
      return data;
    }
  } catch (e) {
    console.warn("[fetchHubcloudDirectLink] AI Studio fallback error:", e);
  }

  return { url };
}
