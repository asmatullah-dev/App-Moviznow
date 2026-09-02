import { Router } from 'express';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { normalizeDomain } from './_domainUtils.js';

export const linkExtractionRouter = Router();

const extractionCache = new Map<string, { data: any, timestamp: number }>();
const inFlightRequests = new Map<string, Promise<any>>();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes cache

const htmlCache = new Map<string, { data: any, status: number, headers: any, timestamp: number }>();
const inFlightHtmlRequests = new Map<string, Promise<any>>();
const HTML_CACHE_TTL = 30 * 60 * 1000; // 30 minutes HTML cache

export function getCachedHubcloudData(url: string) {
  if (!url) return null;
  const normalizedUrl = normalizeDomain(url);
  const cached = extractionCache.get(`extract_${url}`) || 
                 extractionCache.get(`extract_${normalizedUrl}`) ||
                 extractionCache.get(`direct_${url}_false`) ||
                 extractionCache.get(`direct_${url}_true`) ||
                 extractionCache.get(`direct_${normalizedUrl}_false`) ||
                 extractionCache.get(`direct_${normalizedUrl}_true`);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  return null;
}

export function setCachedHubcloudData(url: string, data: any) {
  if (!url || !data) return;
  const normalizedUrl = normalizeDomain(url);
  const item = { data, timestamp: Date.now() };
  extractionCache.set(`extract_${url}`, item);
  extractionCache.set(`extract_${normalizedUrl}`, item);
  extractionCache.set(`direct_${url}_false`, item);
  extractionCache.set(`direct_${normalizedUrl}_false`, item);
}

export function parseSeasonEpisode(text: string): {
  season?: number;
  episode?: number | string;
  seasonEpLabel?: string;
} {
  if (!text) return {};
  
  const clean = text.replace(/&#8211;/g, '-').replace(/&amp;/g, '&').trim();

  // Pattern 1: S01E02 / S1E2 / S01.E02 / S01_E02 / S01-E02
  let m = clean.match(/\bS(\d{1,2})\s*[-._]?\s*E(\d{1,3})\b/i);
  if (m) {
    const s = parseInt(m[1], 10);
    const e = parseInt(m[2], 10);
    const sStr = s < 10 ? `S0${s}` : `S${s}`;
    const eStr = e < 10 ? `E0${e}` : `E${e}`;
    return { season: s, episode: e, seasonEpLabel: `${sStr}${eStr}` };
  }

  // Pattern 2: Season 1 Episode 2 / Season 01 Ep 02
  m = clean.match(/\bSeason\s*[-._]?\s*(\d{1,2})\s*[-._]?\s*(?:Episode|Ep)\s*[-._]?\s*(\d{1,3})\b/i);
  if (m) {
    const s = parseInt(m[1], 10);
    const e = parseInt(m[2], 10);
    const sStr = s < 10 ? `S0${s}` : `S${s}`;
    const eStr = e < 10 ? `E0${e}` : `E${e}`;
    return { season: s, episode: e, seasonEpLabel: `${sStr}${eStr}` };
  }

  // Pattern 3: S01 Ep 01-10 or S01E01-E10
  m = clean.match(/\bS(\d{1,2})\s*[-._]?\s*(?:E|Ep|Episodes?)\s*[-._]?\s*(\d{1,3})\s*[-~to]+\s*(?:E|Ep)?\s*(\d{1,3})\b/i);
  if (m) {
    const s = parseInt(m[1], 10);
    const eStart = parseInt(m[2], 10);
    const eEnd = parseInt(m[3], 10);
    const sStr = s < 10 ? `S0${s}` : `S${s}`;
    return { season: s, episode: `${eStart}-${eEnd}`, seasonEpLabel: `${sStr} Ep ${eStart}-${eEnd}` };
  }

  // Pattern 4: Season only: S01 or Season 1
  let season: number | undefined;
  let sMatch = clean.match(/\bS(\d{1,2})\b/i) || clean.match(/\bSeason\s*[-._]?\s*(\d{1,2})\b/i);
  if (sMatch) {
    season = parseInt(sMatch[1], 10);
  }

  // Pattern 5: Episode only: E02 or Ep 02 or Episode 2
  let episode: number | string | undefined;
  let eMatch = clean.match(/\b(?:Episode|Ep|E)\s*[-._]?\s*(\d{1,3})\b/i) || clean.match(/\b(\d{1,3})\s*(?:st|nd|rd|th)?\s*Episode\b/i);
  if (eMatch) {
    episode = parseInt(eMatch[1], 10);
  }

  if (season !== undefined && episode !== undefined) {
    const sStr = season < 10 ? `S0${season}` : `S${season}`;
    const eNum = typeof episode === 'number' ? (episode < 10 ? `E0${episode}` : `E${episode}`) : `Ep ${episode}`;
    return { season, episode, seasonEpLabel: `${sStr}${eNum}` };
  } else if (season !== undefined) {
    const sStr = season < 10 ? `S0${season}` : `S${season}`;
    return { season, episode: undefined, seasonEpLabel: sStr };
  } else if (episode !== undefined) {
    const eNum = typeof episode === 'number' ? (episode < 10 ? `E0${episode}` : `E${episode}`) : `Ep ${episode}`;
    return { season: undefined, episode, seasonEpLabel: eNum };
  }

  return {};
}

export function isGenericTitle(str: string): boolean {
  if (!str) return true;
  const s = str.trim().toLowerCase();
  if (s.length < 3) return true;
  if (/^\[?\s*(?:download|direct download|direct|hubcloud|vcloud|link|server|click|fast server|gdrive|stream|watch|480p?|720p?|1080p?|2160p?|4k|direct link)\s*\]?$/i.test(s)) return true;
  if (/^(direct|download|hubcloud|vcloud)\s*\[?\s*\d{3,4}p?\s*\]?$/i.test(s)) return true;
  if (/^\[?\s*\d{3,4}p?\s*\]?$/i.test(s)) return true;
  if (/just a moment|cloudflare|ddos protection|attention required/i.test(s)) return true;
  return false;
}

export function parseDetailedQuality(text: string): { qualityLabel: string; shortQuality: string } {
  if (!text) return { qualityLabel: "", shortQuality: "" };

  const resMatch = text.match(/\b(2160p|4k|1080p|720p|480p)\b/i);
  let shortQuality = "";
  let resStr = "";
  if (resMatch) {
    const rawRes = resMatch[1].toLowerCase();
    if (rawRes === "4k" || rawRes === "2160p") {
      shortQuality = "2160p";
      resStr = rawRes === "4k" ? "4K" : "2160P";
    } else {
      shortQuality = rawRes;
      resStr = rawRes.toUpperCase();
    }
  }

  const is10Bit = /\b10-?bit\b/i.test(text);
  const isHevc = /\b(hevc|x265|h265)\b/i.test(text);
  const isX264 = /\b(x264|h264|avc)\b/i.test(text);

  let codecStr = "";
  if (is10Bit && isHevc) {
    codecStr = "10Bit HEVC";
  } else if (isHevc) {
    codecStr = "HEVC";
  } else if (isX264) {
    codecStr = "x264";
  } else if (is10Bit) {
    codecStr = "10Bit";
  }

  let qualityLabel = "";
  if (resStr && codecStr) {
    qualityLabel = `${resStr} ${codecStr}`;
  } else if (resStr) {
    qualityLabel = resStr;
  } else if (codecStr) {
    qualityLabel = codecStr;
  }

  return { qualityLabel, shortQuality };
}

export function parseHubcloudHtmlTitle($: cheerio.CheerioAPI, htmlData: string): {
  original_title: string;
  clean_title: string;
  season?: number;
  episode?: number | string;
  seasonEpLabel?: string;
  quality?: string;
  shortQuality?: string;
} {
  let rawTitle = "";

  if ($) {
    const filenameElements = [
      $('.file-name, #file-name, .filename, #filename, [class*="filename"], [class*="file-name"]'),
      $('td:contains("File Name"), td:contains("Filename")').next('td'),
      $('li:contains("File Name"), li:contains("Filename")'),
      $('div:contains("File Name:"), p:contains("File Name:"), span:contains("File Name:")'),
      $('strong:contains("File Name:"), b:contains("File Name:")'),
      $('.card-header'),
      $('.card-title'),
      $('h1'),
      $('h2'),
      $('h3'),
      $('title')
    ];

    for (const element of filenameElements) {
      if (element && element.length > 0) {
        element.each((_, el) => {
          let text = $(el).text().trim();
          if (text.includes(':')) {
            const parts = text.split(':');
            text = parts.slice(1).join(':').trim();
          }
          if (text && !isGenericTitle(text)) {
            if (!rawTitle || (isGenericTitle(rawTitle) && !isGenericTitle(text)) || (text.length > rawTitle.length && !isGenericTitle(text))) {
              rawTitle = text;
            }
          }
        });
      }
      if (rawTitle && !isGenericTitle(rawTitle) && rawTitle.length > 8) {
        break;
      }
    }
  }

  if ((!rawTitle || isGenericTitle(rawTitle)) && htmlData) {
    const fnMatch = htmlData.match(/(?:file\s*name|filename|title|name)\s*[:=]\s*["']?([^"'\n\r<>{}]+)["']?/i) ||
                    htmlData.match(/class=["']?(?:file-name|filename|card-header|card-title)["']?[^>]*>([^<]+)</i) ||
                    htmlData.match(/([a-zA-Z0-9._\-\s\[\]()]{6,}\.(?:mkv|mp4|avi|webm|zip|rar))/i);
    if (fnMatch && fnMatch[1] && !isGenericTitle(fnMatch[1])) {
      rawTitle = fnMatch[1].trim();
    }
  }

  if (!rawTitle) {
    rawTitle = "";
  }

  let original_title = rawTitle.replace(/&#8211;/g, '-').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

  let clean_title = original_title
    .replace(/https?:\/\/[^\s]+/gi, "")
    .replace(/(?:hubcloud\.club|hubcloud\.ink|hubcloud\.foo|hubcloud\.best|hubcloud\.lol|hubcloud\.online|hubcloud|moviesdrive|hubdrive|vcloud\.live|vcloud|skymovies|mdrive|filmygo|filesdl|linkmake)(?:\s*-\s*|\s*\|\s*|\s*:\s*)?/gi, "")
    .replace(/^download\s*/i, "")
    .replace(/\s*-\s*download$/i, "")
    .replace(/\s*-\s*hubcloud$/i, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!clean_title || isGenericTitle(clean_title)) {
    clean_title = original_title;
  }

  const { season, episode, seasonEpLabel } = parseSeasonEpisode(original_title || clean_title);
  const { qualityLabel, shortQuality } = parseDetailedQuality(original_title || clean_title || htmlData);

  return {
    original_title,
    clean_title,
    season,
    episode,
    seasonEpLabel,
    quality: qualityLabel,
    shortQuality
  };
}

setInterval(() => {
  const now = Date.now();
  for (const [key, value] of extractionCache.entries()) {
    if (now - value.timestamp >= CACHE_TTL) {
      extractionCache.delete(key);
    }
  }
  for (const [key, value] of htmlCache.entries()) {
    if (now - value.timestamp >= HTML_CACHE_TTL) {
      htmlCache.delete(key);
    }
  }
}, 5 * 60 * 1000);

async function fetchDirect(url: string, timeout = 6000) {
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
  };
  return axios.get(url, {
    headers,
    validateStatus: () => true,
    timeout,
    maxContentLength: 5242880,
    maxBodyLength: 5242880,
  });
}

function isCloudflareResponse(response: any) {
  if (!response) return true;
  if (response.status === 403 || response.status === 503 || response.status >= 500) return true;
  if (response.status === 404) return false;
  if (!response.data || typeof response.data !== "string") return true;
  const dataTrim = response.data.trim();
  if (dataTrim.length < 100) return true;
  const dataLower = dataTrim.substring(0, 10000).toLowerCase();
  if (
    dataLower.includes("<title>just a moment</title>") ||
    dataLower.includes("<title>cloudflare") ||
    dataLower.includes("<title>ddos protection</title>") ||
    dataLower.includes("<title>attention required!") ||
    dataLower.includes("enable javascript and cookies") ||
    dataLower.includes("checking your browser")
  ) {
    return true;
  }
  return false;
}

async function fetchWithApi(url: string, timeout = 12000, isVcloud = false) {
  const apiKey = process.env.SCRAPER_API_KEY || "9cd207e5fa77b2c6ef6072a7ea4c4326";

  // Try ScraperAPI first for vcloud
  if (isVcloud || url.includes("vcloud")) {
    try {
      const scraperApiUrl = `http://api.scraperapi.com?api_key=${apiKey}&url=${encodeURIComponent(url)}`;
      const res = await axios.get(scraperApiUrl, {
        validateStatus: () => true,
        timeout,
        maxContentLength: 5242880,
        maxBodyLength: 5242880,
      });
      if (!isCloudflareResponse(res)) return res;
    } catch (err) {}
  }

  // Try Microlink for non-vcloud
  try {
    const microlinkUrl = `https://api.microlink.io/?url=${encodeURIComponent(url)}&meta=false&data.body.selector=body&data.body.attr=html&force=true`;
    const res = await axios.get(microlinkUrl, {
      validateStatus: () => true,
      timeout: Math.min(timeout, 8000),
    });
    if (res.data && res.data.data && res.data.data.body && typeof res.data.data.body === "string" && res.data.data.body.length > 200) {
      const fakeResp = { data: res.data.data.body, status: 200, headers: res.headers };
      if (!isCloudflareResponse(fakeResp)) return fakeResp;
    }
  } catch (err) {}

  // Fallback to ScraperAPI for all Hubcloud variants if Microlink failed or returned Cloudflare
  try {
    const scraperApiUrl = `http://api.scraperapi.com?api_key=${apiKey}&url=${encodeURIComponent(url)}`;
    const scraperRes = await axios.get(scraperApiUrl, {
      validateStatus: () => true,
      timeout,
      maxContentLength: 5242880,
      maxBodyLength: 5242880,
    });
    if (!isCloudflareResponse(scraperRes)) return scraperRes;
  } catch (err) {}

  // Fallback to Jina AI Reader
  try {
    const jinaUrl = `https://r.jina.ai/${url}`;
    const jinaRes = await axios.get(jinaUrl, {
      headers: { "X-No-Cache": "true" },
      validateStatus: () => true,
      timeout: 8000,
    });
    if (jinaRes.data && typeof jinaRes.data === "string" && jinaRes.data.length > 100) {
      const fakeResp = { data: jinaRes.data, status: 200, headers: jinaRes.headers || {} };
      if (!isCloudflareResponse(fakeResp)) return fakeResp;
    }
  } catch (err) {}

  return { data: "", status: 500, headers: {} };
}

async function fetchHtmlFallback(url: string, isVcloud = false) {
  let response;
  
  // Vercel IPs are blocked by Cloudflare, so skip direct fetch to save time
  if (!process.env.VERCEL) {
    try {
      response = await fetchDirect(url, 6000);
      if (!isCloudflareResponse(response)) return response;
    } catch (err) {}
  }

  try {
    response = await fetchWithApi(url, 12000, isVcloud);
    if (!isCloudflareResponse(response)) return response;
  } catch (err) {}

  try {
    response = await fetchWithApi(url, 14000, isVcloud);
  } catch (err) {
    response = { data: "", status: 500, headers: {} };
  }
  return response;
}

export async function fetchHtml(url: string, isVcloud = false, force = false) {
  const cacheKey = url;
  const cached = htmlCache.get(cacheKey);
  if (!force && cached && Date.now() - cached.timestamp < HTML_CACHE_TTL) {
    if (cached.data && typeof cached.data === "string" && cached.data.length > 200 && !isCloudflareResponse({ status: cached.status, data: cached.data })) {
      return cached;
    }
  }
  if (inFlightHtmlRequests.has(cacheKey)) {
    return await inFlightHtmlRequests.get(cacheKey);
  }

  const promise = (async () => {
    let response = await fetchHtmlFallback(url, isVcloud);
    const result = {
      data: response?.data || "",
      status: response?.status || 500,
      headers: response?.headers || {},
      timestamp: Date.now(),
    };
    if (result.data && typeof result.data === "string" && result.data.length > 200 && !isCloudflareResponse(response)) {
      htmlCache.set(cacheKey, result);
    }
    return result;
  })();

  inFlightHtmlRequests.set(cacheKey, promise);
  try {
    const result = await promise;
    inFlightHtmlRequests.delete(cacheKey);
    return result;
  } catch (err) {
    inFlightHtmlRequests.delete(cacheKey);
    throw err;
  }
}

  linkExtractionRouter.post("/api/hubcloud/extract", async (req, res) => {
    try {
      const { url, forceExtract, isVcloud, force } = req.body;
      const isVcloudBool = Boolean(isVcloud);
      if (
        !url ||
        (!forceExtract && 
         !url.includes("hubcloud") &&
          !url.includes("hubcould") &&
          !url.includes("moviesdrive") &&
          !url.includes("skymovies") &&
          !url.includes("mdrive") &&
          !url.includes("filmygo") &&
          !url.includes("vcloud") &&
          !url.includes("hubdrive"))
      ) {
        return res.status(400).json({ error: "Invalid HubCloud URL" });
      }

      const cacheKey = `extract_${url}`;
      const cached = extractionCache.get(cacheKey);
      if (!force && cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return res.json(cached.data);
      }

      if (inFlightRequests.has(cacheKey)) {
        const data = await inFlightRequests.get(cacheKey);
        return res.json(data);
      }

      const performFetch = async () => {
        const response = await fetchHtml(url, isVcloudBool, force);
        const $ = cheerio.load(response.data);

        let sizeStr =
          $('td:contains("File Size")').next('td').text() ||
          $('li:contains("File Size") i').text() ||
          $('li:contains("File Size")').text() ||
          $('li:contains("Size") i').text() ||
          $('li:contains("Size")').text();
        sizeStr = sizeStr.replace("File Size", "").replace("Size", "").trim();

        let size = "";
        let unit = "";
        if (sizeStr) {
          const parts = sizeStr.split(" ");
          if (parts.length >= 2) {
            let num = parseFloat(parts[0]);
            unit = parts[1].toUpperCase();

            if (!isNaN(num)) {
              // Convert from Hubcloud's Base-1024 to our Base-1000
              const multiplier =
                unit === "GB"
                  ? (1024 * 1024 * 1024) / (1000 * 1000 * 1000)
                  : unit === "MB"
                    ? (1024 * 1024) / (1000 * 1000)
                    : unit === "KB"
                      ? 1024 / 1000
                      : 1;
              num = num * multiplier;
              size =
                num >= 100
                  ? num.toFixed(0)
                  : num >= 10
                    ? num.toFixed(1)
                    : num.toFixed(2);
              size = size.replace(/\.00$/, "").replace(/\.0$/, "");
            } else {
              size = parts[0];
            }
          } else {
            size = sizeStr;
          }
        }

        const parsedMeta = parseHubcloudHtmlTitle($, response.data || "");
        let title = parsedMeta.clean_title || parsedMeta.original_title || "";
        
        const isCloudflare =
          title.toLowerCase().includes("just a moment") ||
          title.toLowerCase().includes("cloudflare") ||
          title.toLowerCase().includes("ddos protection") ||
          response.status === 403 ||
          response.status === 503;

        if (isCloudflare && !title) {
          title = "Unknown (Cloudflare Block)";
        } else if (isCloudflare && title.toLowerCase().includes("just a moment")) {
          title = "Unknown (Cloudflare Block)";
        }

        const isNotFound =
          response.status === 404 || title.toLowerCase().includes("not found") || title.toLowerCase().includes("file not found");
        const isWorking =
          (response.status < 400 ||
          response.status === 403 ||
          response.status === 503 ||
          title === "Unknown (Cloudflare Block)") && !isNotFound;

        const responseData = {
          size,
          unit,
          title: title.trim(),
          original_title: parsedMeta.original_title,
          season: parsedMeta.season,
          episode: parsedMeta.episode,
          seasonEpLabel: parsedMeta.seasonEpLabel,
          isWorking,
          isNotFound,
        };
        
        const isSuccessful = 
          responseData.isWorking && 
          !responseData.isNotFound && 
          responseData.title && 
          !responseData.title.toLowerCase().includes("cloudflare block") && 
          !responseData.title.toLowerCase().includes("timeout") &&
          !responseData.title.toLowerCase().includes("just a moment");

        if (isSuccessful) {
          setCachedHubcloudData(url, responseData);
          extractionCache.set(cacheKey, { data: responseData, timestamp: Date.now() });
        }

        return responseData;
      };

      try {
        inFlightRequests.set(cacheKey, performFetch());
        const data = await inFlightRequests.get(cacheKey);
        inFlightRequests.delete(cacheKey);
        return res.json(data);
      } catch (err) {
        inFlightRequests.delete(cacheKey);
        throw err;
      }
    } catch (e: any) {
      console.error("Hubcloud extract error:", e.message);
      // Even if it fails (like timeout on Vercel), return a generic response instead of 500
      // since the link might actually be working but just blocked by Vercel's datacenter IPs
      if (e.code === "ECONNABORTED" || e.message.includes("timeout")) {
        return res.json({
          size: "",
          unit: "",
          title: "Unknown (Timeout)",
          isWorking: true, // Assume it works if it just timed out
          isNotFound: false,
        });
      }
      res.status(500).json({ error: e.message });
    }
  });

  async function performExtraction(url: string, checkOnly: boolean, depth = 0, isVcloud = false, force = false): Promise<any> {
    try {
      if (depth > 2) return { url, candidates: [], size: "" };
      const headers = {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      };

      if (checkOnly && url) {
        try {
          let checkRes = await axios.get(url, {
            headers: { ...headers, Range: "bytes=0-0" },
            maxRedirects: 0,
            validateStatus: () => true,
            timeout: 5000,
            responseType: "stream",
          });

          // Fallback to scraper for vcloud if direct fails (e.g. 403, 503)
          if ((checkRes.status === 403 || checkRes.status === 503) && (isVcloud || url.includes("vcloud"))) {
             if (checkRes.data && typeof checkRes.data.destroy === "function") {
               checkRes.data.destroy();
             }
             const checkUrl = `http://api.scraperapi.com?api_key=${process.env.SCRAPER_API_KEY || "9cd207e5fa77b2c6ef6072a7ea4c4326"}&url=${encodeURIComponent(url)}`;
             checkRes = await axios.get(checkUrl, {
               maxRedirects: 0,
               validateStatus: () => true,
               timeout: 10000,
               responseType: "stream",
             });
          }

          if (checkRes.data && typeof checkRes.data.destroy === "function") {
            checkRes.data.destroy();
          }

          if (
            checkRes.status < 400 ||
            checkRes.status === 405 ||
            checkRes.status === 416
          ) {
            return { ok: true };
          }
          if (
            checkRes.status >= 300 &&
            checkRes.status < 400 &&
            checkRes.headers.location
          ) {
            return { ok: true, location: checkRes.headers.location };
          }
          return { ok: false };
        } catch (e) {
          return { ok: false };
        }
      }

      if (
        !url ||
        (!isVcloud && 
          !url.includes("hubcloud") &&
          !url.includes("moviesdrive") &&
          !url.includes("skymovies") &&
          !url.includes("mdrive") &&
          !url.includes("filmygo") &&
          !url.includes("vcloud") &&
          !url.includes("hubdrive"))
      ) {
        return { url };
      }

      let $2 = null;
      let $ = null;

      let response = await fetchHtml(url, isVcloud, force);
      $ = cheerio.load(response.data);

      const titleText = $("title").text().toLowerCase();
      const isCf =
        titleText.includes("just a moment") ||
        titleText.includes("cloudflare") ||
        titleText.includes("ddos protection") ||
        response.status === 403 ||
        response.status === 503;

      if (isCf) {
        return { url: url, isCloudflare: true };
      }

      let nextUrl =
        $("#download").attr("href") ||
        $('a:contains("Generate Direct Download Link")').attr("href") ||
        $("a.btn-zip").attr("href") ||
        "";

      // Extract url from script for vcloud if href is missing
      if (!nextUrl) {
         const scriptHtml = $.html();
         const match = scriptHtml.match(/var\s+url\s*=\s*['"]([^'"]+)['"]/i);
         if (match && match[1]) {
            nextUrl = match[1];
         }
      }

      if (!nextUrl) {
        if ($("a.btn").length > 0) {
          $2 = $;
        } else {
          return { url };
        }
      }

      if (!$2 && nextUrl) {
        let res2 = await fetchHtml(nextUrl, isVcloud, force);
        $2 = cheerio.load(res2.data);

        const titleText2 = $2("title").text().toLowerCase();
        const isCf2 =
          titleText2.includes("just a moment") ||
          titleText2.includes("cloudflare") ||
          titleText2.includes("ddos protection") ||
          res2.status === 403 ||
          res2.status === 503;

        if (isCf2) {
           // We could return isCloudflare here if it's completely unbypassable
           // but keeping original behavior we just ignore and continue with what we have
        }
      }

      const candidateLinks: { text: string; href: string }[] = [];
      $2("a.btn").each((i, el) => {
        let href = $2(el).attr("href") || "";
        const text = $2(el).text().toLowerCase();
        const id = $2(el).attr("id");

        if (id) {
          $2("script").each((_, scriptEl) => {
            const scriptContent = $2(scriptEl).html();
            if (!scriptContent) return;

            if (
              scriptContent.includes(`getElementById("${id}")`) ||
              scriptContent.includes(`getElementById('${id}')`)
            ) {
              const assignmentMatch = scriptContent.match(
                new RegExp(
                  `getElementById\\(['"]${id}['"]\\)\\.href\\s*=\\s*([a-zA-Z0-9_]+)`,
                ),
              );
              if (assignmentMatch && assignmentMatch[1]) {
                const varName = assignmentMatch[1];
                const varMatch = scriptContent.match(
                  new RegExp(
                    `(?:var|let|const)\\s+${varName}\\s*=\\s*['"]([^'"]+)['"]`,
                  ),
                );
                if (varMatch && varMatch[1]) {
                  href = varMatch[1];
                }
              } else {
                const directMatch = scriptContent.match(
                  new RegExp(
                    `getElementById\\(['"]${id}['"]\\)\\.href\\s*=\\s*['"]([^'"]+)['"]`,
                  ),
                );
                if (directMatch && directMatch[1]) {
                  href = directMatch[1];
                }
              }
            }
          });
        }
        if (href && !text.includes("telegram")) {
          candidateLinks.push({ text, href });
        }
      });

      if (candidateLinks.length === 0) {
        return { url };
      }

      // Sort: pixeldrain first, then .workers.dev
      candidateLinks.sort((a, b) => {
        const isA_PD =
          /pixeldrain|pixel\.drain|pixeldra\.in/i.test(a.text) ||
          /pixeldrain|pixel\.drain|pixeldra\.in/i.test(a.href);
        const isB_PD =
          /pixeldrain|pixel\.drain|pixeldra\.in/i.test(b.text) ||
          /pixeldrain|pixel\.drain|pixeldra\.in/i.test(b.href);
        if (isA_PD && !isB_PD) return -1;
        if (!isA_PD && isB_PD) return 1;

        const isA_Worker = /\.workers\.dev/i.test(a.href);
        const isB_Worker = /\.workers\.dev/i.test(b.href);
        if (isA_Worker && !isB_Worker) return -1;
        if (!isA_Worker && isB_Worker) return 1;

        const isA_FSL = /fsl|servers*2/i.test(a.text) || /fsl|servers*2/i.test(a.href);
        const isB_FSL = /fsl|servers*2/i.test(b.text) || /fsl|servers*2/i.test(b.href);
        if (isA_FSL && !isB_FSL) return -1;
        if (!isA_FSL && isB_FSL) return 1;

        return 0;
      });

      // Find first working link
      let workingLink = url; 
      if (candidateLinks.length > 0) { 
        workingLink = candidateLinks[0].href; 
      }

      /* Skipping expensive checks to speed up extraction */

      const returnCandidates = candidateLinks.map((c) => {
        let href = c.href;
        if (
          /(?:pixeldrain\.(?:com|dev|net)|pixel\.drain|pixeldra\.in)\/(?:api\/file|u)\/([a-zA-Z0-9_-]+)/i.test(
            href,
          )
        ) {
          href = href.replace(
            /.*(?:pixeldrain\.(?:com|dev|net)|pixel\.drain|pixeldra\.in)\/(?:api\/file|u)\/([a-zA-Z0-9_-]+).*/i,
            "https://pixeldrain.dev/u/$1",
          );
        }
        return { text: c.text.trim(), href: normalizeDomain(href) };
      });

      const active$ = $ || $2;
      const bodyText = active$ ? active$("body").text() : "";
      let sizeInfo = "";
      const sizeMatch = bodyText.match(/File Size\s*([\d.]+\s*[A-Za-z]+)/i);
      if (sizeMatch && sizeMatch[1]) {
        sizeInfo = sizeMatch[1].trim();

        // Convert to base-1000
        const parts = sizeInfo.split(" ");
        if (parts.length >= 2) {
          let num = parseFloat(parts[0]);
          let unit = parts[1].toUpperCase();
          if (!isNaN(num)) {
            const multiplier =
              unit === "GB"
                ? (1024 * 1024 * 1024) / (1000 * 1000 * 1000)
                : unit === "MB"
                  ? (1024 * 1024) / (1000 * 1000)
                  : unit === "KB"
                    ? 1024 / 1000
                    : 1;
            num = num * multiplier;
            let newSize =
              num >= 100
                ? num.toFixed(0)
                : num >= 10
                  ? num.toFixed(1)
                  : num.toFixed(2);
            newSize = newSize.replace(/\.00$/, "").replace(/\.0$/, "");
            sizeInfo = `${newSize} ${unit}`;
          }
        }
      }

      let nextHubcloudLink = "";
      for (const c of returnCandidates) {
        if (c.href.includes("hubcloud") || c.href.includes("moviesdrive") || c.href.includes("vcloud") || c.href.includes("hubdrive") || c.href.includes("skymovies") || c.href.includes("mdrive") || c.href.includes("filmygo")) {
           nextHubcloudLink = c.href;
           break;
        }
      }

      if (nextHubcloudLink && nextHubcloudLink !== url) {
         try {
           const recursiveRes = await performExtraction(nextHubcloudLink, false, depth + 1, isVcloud, force);
           if (recursiveRes.candidates && recursiveRes.candidates.length > 0) {
             if (!recursiveRes.size && sizeInfo) recursiveRes.size = sizeInfo;
             if (recursiveRes.url) {
               return recursiveRes;
             }
           }
         } catch (e) {
           console.error("Recursion error", e);
         }
      }

      const htmlBody = active$ ? active$.html() : "";
      const parsedMeta = parseHubcloudHtmlTitle(active$, htmlBody || "");
      let extractedTitle = parsedMeta.clean_title || parsedMeta.original_title || "";

      const finalExtractedData = {
        url: normalizeDomain(workingLink),
        candidates: returnCandidates,
        size: sizeInfo,
        title: extractedTitle || undefined,
        original_title: parsedMeta.original_title || undefined,
        season: parsedMeta.season,
        episode: parsedMeta.episode,
        seasonEpLabel: parsedMeta.seasonEpLabel,
        quality: parsedMeta.quality,
        shortQuality: parsedMeta.shortQuality,
      };

      if (finalExtractedData.title || finalExtractedData.original_title) {
        setCachedHubcloudData(url, finalExtractedData);
        if (workingLink && workingLink !== url) {
          setCachedHubcloudData(workingLink, finalExtractedData);
        }
      }

      return finalExtractedData;
    } catch (e: any) {
      if (e.isAxiosError && e.message.includes('maxContentLength exceed') || e.message.includes('maxContentLength')) {
        let finalUrl = url;
        if (e.request && e.request.res && e.request.res.responseUrl) {
           finalUrl = e.request.res.responseUrl;
        } else if (e.request && e.request._currentUrl) {
           finalUrl = e.request._currentUrl;
        } else if (e.config && e.config.url) {
           finalUrl = e.config.url;
        }
        if (finalUrl !== url && !finalUrl.includes('hubcloud') && !finalUrl.includes('moviesdrive') && !finalUrl.includes('vcloud') && !finalUrl.includes('hubdrive') && !finalUrl.includes('skymovies') && !finalUrl.includes('mdrive') && !finalUrl.includes('filmygo')) {
           return { url: normalizeDomain(finalUrl) };
        }
      }
      console.error("Link extraction error:", e.message);
      return { url: normalizeDomain(url) };
    }
  }

  linkExtractionRouter.post("/api/hubcloud/direct-link", async (req, res) => {
    try {
      const { url, checkOnly, isVcloud, force } = req.body;
      const isCheckOnly = Boolean(checkOnly);
      const isVcloudBool = Boolean(isVcloud);
      const cacheKey = `direct_${url}_${isCheckOnly}`;
      
      const cached = extractionCache.get(cacheKey);
      if (!force && cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return res.json(cached.data);
      }

      // In-flight coalescing
      if (inFlightRequests.has(cacheKey)) {
        const data = await inFlightRequests.get(cacheKey);
        return res.json(data);
      }

      const extractPromise = performExtraction(url, isCheckOnly, 0, isVcloudBool, force);
      inFlightRequests.set(cacheKey, extractPromise);

      try {
        const data = await extractPromise;
        inFlightRequests.delete(cacheKey);

        // Return ok stuff for checkOnly
        if (isCheckOnly && data && data.ok !== undefined) {
           if (data.ok) {
              extractionCache.set(cacheKey, { data, timestamp: Date.now() });
           }
           return res.json(data);
        }

        // If cloudflare error
        if (data.isCloudflare) {
           const responseData = { url: data.url, isCloudflare: true };
           return res.json(responseData);
        }

        // Cache if extraction found valid candidates, size, or changed url
        const isSuccessfulLink = data && ((data.candidates && data.candidates.length > 0) || (data.url && data.url !== url) || data.title);
        if (isSuccessfulLink) {
           extractionCache.set(cacheKey, { data, timestamp: Date.now() });
        }
        return res.json(data);
      } catch (err) {
        inFlightRequests.delete(cacheKey);
        throw err;
      }
    } catch (e: any) {
      console.error(e);
      res.json({ url: normalizeDomain(req.body.url) });
    }
  });


  linkExtractionRouter.get('/api/resolve-tg', async (req: any, res: any) => {
    try {
      let { url } = req.query;
      if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: 'Valid URL required' });
      }

      url = url.trim();

      const formatTgUrl = (rawUrl: string) => {
        if (!rawUrl) return rawUrl;
        if (rawUrl.startsWith('tg://')) return rawUrl;
        try {
          const u = new URL(rawUrl);
          const domain = u.pathname.replace(/^\//, '').split('/')[0];
          const start = u.searchParams.get('start');
          if (domain && start) {
            return `tg://resolve?domain=${domain}&start=${start}`;
          } else if (domain) {
            return `tg://resolve?domain=${domain}`;
          }
        } catch (e) {}
        return rawUrl;
      };

      if (url.startsWith('tg://') || url.includes('t.me/') || url.includes('telegram.me/')) {
        return res.json({ url: formatTgUrl(url) });
      }

      const findTgLinks = ($doc: cheerio.CheerioAPI, baseUrl: string) => {
        let tgGoUrl = "";
        let tgDirectUrl = "";
        let gatewayUrl = "";
        let nextGenUrl = "";

        $doc('a').each((_, el) => {
          const href = $doc(el).attr('href');
          if (!href) return;
          const text = $doc(el).text().trim().toLowerCase();
          const html = $doc(el).html() || "";

          if (href.includes('t.me/hubcloudreport') || href.includes('t.me/hubdrive') || href.includes('t.me/joinchat')) return;

          if (href.includes('/tg/go')) {
            tgGoUrl = href.startsWith('http') ? href : new URL(href, baseUrl).toString();
          } else if (href.includes('tg://') || href.includes('t.me/') || href.includes('telegram.me/')) {
            tgDirectUrl = href;
          } else if (text.includes('telegram') || html.includes('fa-telegram')) {
            tgGoUrl = href.startsWith('http') ? href : new URL(href, baseUrl).toString();
          } else if (href.includes('gamerxyt.com')) {
            gatewayUrl = href.startsWith('http') ? href : new URL(href, baseUrl).toString();
          } else if (
            text.includes('generate direct download link') ||
            text.includes('download link') ||
            href.includes('hubcloud.php') ||
            href.includes('sportverse.cc') ||
            href.includes('generator') ||
            href.includes('vcloud.php')
          ) {
            if (!nextGenUrl) {
              nextGenUrl = href.startsWith('http') ? href : new URL(href, baseUrl).toString();
            }
          }
        });

        if (!tgGoUrl) {
          const html = $doc.html();
          const tgGoMatch = html.match(/href=["'](https?:\/\/[^"']+\/tg\/go[^"']*)["']/i);
          if (tgGoMatch) {
            tgGoUrl = tgGoMatch[1].replace(/&amp;/g, '&');
          }
        }

        if (!gatewayUrl) {
          const html = $doc.html();
          const gxMatch = html.match(/href=["'](https?:\/\/[^"']*gamerxyt\.com[^"']+)["']/i);
          if (gxMatch) {
            gatewayUrl = gxMatch[1].replace(/&amp;/g, '&');
          }
        }

        return { tgGoUrl, tgDirectUrl, gatewayUrl, nextGenUrl };
      };

      const isVcloud = url.includes("vcloud");
      const res1 = await fetchHtml(url, isVcloud, false);
      let $ = cheerio.load(res1.data || "");
      let found = findTgLinks($, url);

      if (!found.tgGoUrl && !found.tgDirectUrl && !found.gatewayUrl && found.nextGenUrl) {
        const res2 = await fetchHtml(found.nextGenUrl, isVcloud, false);
        $ = cheerio.load(res2.data || "");
        found = findTgLinks($, found.nextGenUrl);
      }

      let tgGoTarget = found.tgGoUrl;
      let finalTg = found.tgDirectUrl;

      if (!finalTg && !tgGoTarget && found.gatewayUrl) {
        const resGw = await fetchHtml(found.gatewayUrl, false, false);
        $ = cheerio.load(resGw.data || "");
        const gwFound = findTgLinks($, found.gatewayUrl);
        tgGoTarget = gwFound.tgGoUrl;
        finalTg = gwFound.tgDirectUrl;
      }

      if (finalTg) {
        return res.json({ url: formatTgUrl(finalTg) });
      }

      if (tgGoTarget) {
        tgGoTarget = tgGoTarget.replace(/&amp;/g, '&');
        
        let resolvedTg = "";
        try {
          const headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
          };
          const tgRes = await axios.get(tgGoTarget, { headers, timeout: 10000, maxRedirects: 5, validateStatus: () => true });
          const finalResUrl = tgRes.request?.res?.responseUrl || tgGoTarget;

          const $tg = cheerio.load(tgRes.data || "");

          $tg("meta").each((_, el) => {
            const content = $tg(el).attr("content");
            if (content) {
              const m = content.match(/tg:\/\/[^\s"',]+/);
              if (m) resolvedTg = m[0];
              else if (content.includes("t.me/") || content.includes("telegram.me/")) {
                const m2 = content.match(/https?:\/\/(?:t\.me|telegram\.me)\/[^\s"',]+/);
                if (m2) resolvedTg = m2[0];
              }
            }
          });

          if (!resolvedTg) {
            $tg("a").each((_, el) => {
              const href = $tg(el).attr("href");
              if (href) {
                const m = href.match(/tg:\/\/[^\s"',]+/);
                if (m) resolvedTg = m[0];
                else if (href.includes("t.me/") || href.includes("telegram.me/")) {
                  resolvedTg = href;
                }
              }
            });
          }

          if (!resolvedTg && (finalResUrl.includes("t.me/") || finalResUrl.includes("telegram.me/"))) {
            resolvedTg = finalResUrl;
          }
        } catch (e: any) {
          console.error("tg/go fetch failed:", e.message);
        }

        if (resolvedTg) {
          return res.json({ url: formatTgUrl(resolvedTg) });
        } else {
          return res.json({ url: tgGoTarget });
        }
      }

      return res.status(404).json({ error: 'Could not resolve Telegram link from this URL' });
    } catch (error: any) {
      console.error('Resolve TG error:', error.message || error);
      res.status(500).json({ error: error.message || 'Failed to resolve Telegram link' });
    }
  });
