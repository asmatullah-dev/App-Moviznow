import { linkExtractionRouter } from "./_LinkExtractionModal.js";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import firebaseConfig from "../firebase-applet-config.json" with { type: "json" };
import pkg from "../package.json" with { type: "json" };
import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import axios from "axios";
import https from "https";
import * as cheerio from "cheerio";
import { normalizeDomain } from "./_domainUtils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Admin
let db: admin.firestore.Firestore | undefined;
try {
  if (!admin.apps.length) {
    let credential;
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      credential = admin.credential.cert(
        JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON),
      );
    } else {
      // Avoid crashing if applicationDefault is not available (e.g. Vercel)
      credential = admin.credential.applicationDefault();
    }
    admin.initializeApp({
      credential,
      projectId: firebaseConfig.projectId,
    });
  }
  db = getFirestore(admin.app(), (firebaseConfig as any).firestoreDatabaseId);
  try {
    db.settings({ ignoreUndefinedProperties: true });
  } catch {}
} catch (error) {
  console.warn("Failed to initialize Firebase Admin. Firebase services will be unavailable.", error);
}

import crypto from "crypto";

// Sync Service Account Helpers

function getAppFromKey(keyString?: string, prefix: string = "sync") {
  if (!keyString || typeof keyString !== "string") return null;

  const trimmedKey = keyString.trim();
  if (!trimmedKey) return null;

  try {
    const hash = crypto.createHash("md5").update(trimmedKey).digest("hex");
    const appName = `${prefix}_${hash}`;

    let app = admin.apps.find((a) => a?.name === appName);
    if (!app) {
      app = admin.initializeApp(
        {
          credential: admin.credential.cert(JSON.parse(trimmedKey)),
        },
        appName,
      );
    }
    return app;
  } catch (e) {
    console.error(`Error initializing dynamic app ${prefix}:`, e);
    return null;
  }
}

async function getSyncApps(
  sourceKey?: string,
  targetKey?: string,
  targetDbId?: string,
) {
  let sourceApp = getAppFromKey(sourceKey, "sync_src");

  // Try fallback to the default app if no specific source key provided/parsable
  if (!sourceApp) {
    sourceApp = admin.app();
  }

  let targetApp = getAppFromKey(targetKey, "sync_tgt");

  return { sourceApp, targetApp, targetDbId };
}

import { translateRouter } from "./_translate.js";
import { emailRouter } from "./_email.js";
import { tmdbRouter } from "./_tmdb.js";
import { ordersRouter } from "./_orders.js";
import { checkAndSendExpiryNotifications, sendMembershipUpdateNotification, sendOrderApprovedNotification } from "./_expiryService.js";

export async function fetchWithVddos(targetUrl: string, customHeaders?: Record<string, string>, timeoutMs = 10000) {
  const httpsAgent = new https.Agent({ rejectUnauthorized: false });
  const baseHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Referer': targetUrl,
    ...(customHeaders || {})
  };

  let res = await axios.get(targetUrl, {
    headers: baseHeaders,
    httpsAgent,
    timeout: timeoutMs,
    maxContentLength: 5 * 1024 * 1024,
    validateStatus: () => true,
    maxRedirects: 5
  });

  let html = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
  let finalUrl = res.request?.res?.responseUrl || targetUrl;

  if (
    res.status === 202 ||
    html.includes('vDDoS-zn') ||
    html.includes('vddos') ||
    html.includes('w3IncludeHTML')
  ) {
    let cookieVal = '';
    const cookieMatch = html.match(/document\.cookie\s*=\s*['"]([^'"]+)['"]/i);
    if (cookieMatch) {
      cookieVal = cookieMatch[1].split(';')[0].trim();
    }
    if (res.headers['set-cookie']) {
      const setCookies = Array.isArray(res.headers['set-cookie']) ? res.headers['set-cookie'] : [res.headers['set-cookie']];
      const sc = setCookies.map((c) => c.split(';')[0]).join('; ');
      cookieVal = cookieVal ? cookieVal + '; ' + sc : sc;
    }

    let redirectUrl = targetUrl;
    const redirectMatch = html.match(/location\.href\s*=\s*['"]([^'"]+)['"]/i);
    if (redirectMatch) {
      redirectUrl = redirectMatch[1];
      if (redirectUrl.startsWith('http://') && targetUrl.startsWith('https://')) {
        redirectUrl = redirectUrl.replace('http://', 'https://');
      }
    } else if (!targetUrl.includes('?d=1') && !targetUrl.includes('&d=1')) {
      redirectUrl = targetUrl.includes('?') ? targetUrl + '&d=1' : targetUrl + '?d=1';
    }

    try {
      const followRes = await axios.get(redirectUrl, {
        headers: {
          ...baseHeaders,
          ...(cookieVal ? { 'Cookie': cookieVal } : {}),
          'Referer': targetUrl
        },
        httpsAgent,
        timeout: timeoutMs,
        maxContentLength: 5 * 1024 * 1024,
        validateStatus: () => true,
        maxRedirects: 5
      });

      html = typeof followRes.data === 'string' ? followRes.data : JSON.stringify(followRes.data);
      res = followRes;
      finalUrl = followRes.request?.res?.responseUrl || redirectUrl;
    } catch (err: any) {
      console.warn(`[fetchWithVddos] Follow redirect error for ${redirectUrl}:`, err.message);
    }
  }

  return { html, status: res.status, finalUrl };
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Block automated bot scans & probes early to save CPU/memory and stop scanner spam
  app.use((req, res, next) => {
    const url = req.path.toLowerCase();
    if (
      url.endsWith('.php') ||
      url.endsWith('.asp') ||
      url.endsWith('.aspx') ||
      url.endsWith('.jsp') ||
      url.endsWith('.cgi') ||
      url.endsWith('.env') ||
      url.endsWith('.sql') ||
      url.endsWith('.bak') ||
      url.startsWith('/wp-') ||
      url.startsWith('/wordpress') ||
      url.startsWith('/xmlrpc') ||
      url.startsWith('/phpmyadmin') ||
      url.startsWith('/pma') ||
      url.startsWith('/cgi-bin') ||
      url.startsWith('/.env') ||
      url.startsWith('/.git')
    ) {
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.status(404).send('Not Found');
    }
    next();
  });

  app.get("/ads.txt", (req, res) => {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.send("google.com, pub-3128773545517669, DIRECT, f08c47fec0942fa0\n");
  });

  app.get("/robots.txt", (req, res) => {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send("User-agent: Mediapartners-Google\nAllow: /\n\nUser-agent: Google-Adwords-Instant\nAllow: /\n\nUser-agent: *\nAllow: /\nDisallow: /api/\n");
  });

  app.use(express.json({ limit: "50mb" }));
  app.use("/api", translateRouter);
  app.use("/api/email", emailRouter);
  app.use("/api", tmdbRouter);
  app.use("/api/orders", ordersRouter);

  // Dynamic build info generated on Vercel or locally
  const SERVER_BUILD_TIME = new Date().toISOString();
  const SERVER_BUILD_ID = process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID || process.env.npm_package_version || pkg.version || '3.2.3';

  app.get(["/api/version", "/version"], (req, res) => {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate, max-age=0, s-maxage=0");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.json({
      version: SERVER_BUILD_ID,
      buildTime: SERVER_BUILD_TIME,
      commit: process.env.VERCEL_GIT_COMMIT_SHA || null,
      deploymentId: process.env.VERCEL_DEPLOYMENT_ID || null,
      timestamp: Date.now()
    });
  });

  // Background Scan Endpoint
  // In-memory background scan storage to avoid Firestore writes
  const inMemoryScanStore: Record<string, any> = {};

  app.post(
    ["/api/start-background-scan", "/start-background-scan"],
    async (req, res) => {
      console.log("Received request to /api/start-background-scan");
      const { links } = req.body;
      console.log("Links length:", links ? links.length : "undefined");
      if (!links || !Array.isArray(links)) {
        console.log("Invalid links array");
        return res.status(400).json({ error: "Links array required" });
      }

      // Start in-memory background process
      const scanId = "background";
      inMemoryScanStore[scanId] = {
        id: scanId,
        status: "scanning",
        scannedCount: 0,
        totalLinks: links.length,
        errorLinks: [],
        startedAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
      };

      res.json({ message: "Background scan started (in-memory)", scanId });

      // Run the scan in the background
      (async () => {
        const foundErrors: any[] = [];
        let scannedCount = 0;
        const concurrency = 10;
        const queue = [...links];

        const checkPixeldrainLink = async (url: string) => {
          if (!url || url.trim() === "") return { error: "Empty link" };
          const fileMatch = url.match(
            /pixeldrain\.(?:com|dev)\/(?:u|api\/file)\/([a-zA-Z0-9]+)/,
          );
          const listMatch = url.match(
            /pixeldrain\.(?:com|dev)\/(?:l|api\/list)\/([a-zA-Z0-9]+)/,
          );

          try {
            let apiUrl = "";
            if (fileMatch)
              apiUrl = `https://pixeldrain.com/api/file/${fileMatch[1]}/info`;
            else if (listMatch)
              apiUrl = `https://pixeldrain.com/api/list/${listMatch[1]}`;
            else return { error: null };

            const res = await fetch(apiUrl);
            if (res.status === 451) return { error: "Unavailable from Server" };
            if (!res.ok) return { error: `HTTP ${res.status}` };

            const data = await res.json();
            if (data.success === false)
              return { error: "File not found or deleted" };

            let sizeInBytes = 0;
            if (fileMatch) sizeInBytes = data.size;
            else if (listMatch && data.files)
              sizeInBytes = data.files.reduce(
                (acc: number, f: any) => acc + (f.size || 0),
                0,
              );

            let size = 0;
            let unit: "MB" | "GB" = "MB";
            if (sizeInBytes >= 1000 * 1000 * 1000) {
              size = sizeInBytes / (1000 * 1000 * 1000);
              unit = "GB";
            } else {
              size = sizeInBytes / (1000 * 1000);
              unit = "MB";
            }
            return {
              error: null,
              size: size.toFixed(2).replace(/\.00$/, ""),
              unit,
            };
          } catch (e) {
            return { error: "Network error" };
          }
        };

        const processNext = async (): Promise<void> => {
          if (queue.length === 0) return;
          const item = queue.shift()!;

          try {
            const result = await checkPixeldrainLink(item.url);
            let error = result.error;

            if (!error && (!item.link.size || !item.link.unit)) {
              error = "Missing size or unit";
            }

            if (
              !error &&
              item.link.size &&
              item.link.unit &&
              result.size &&
              result.unit
            ) {
              const stored = `${item.link.size}${item.link.unit}`;
              const server = `${result.size}${result.unit}`;
              if (stored !== server) error = `Size mismatch`;
            }

            if (error) {
              foundErrors.push({
                ...item,
                errorDetail: error,
                fetchedSize: result.size,
                fetchedUnit: result.unit,
              });
            }

            scannedCount++;
            if (inMemoryScanStore[scanId]) {
              inMemoryScanStore[scanId].scannedCount = scannedCount;
              inMemoryScanStore[scanId].errorLinks = foundErrors;
              inMemoryScanStore[scanId].lastUpdated = new Date().toISOString();
            }
          } catch (e) {
            console.error("Background scan error for link:", item.url, e);
          } finally {
            await processNext();
          }
        };

        const workers = Array.from(
          { length: Math.min(concurrency, links.length) },
          () => processNext(),
        );
        await Promise.all(workers);

        if (inMemoryScanStore[scanId]) {
          inMemoryScanStore[scanId].status = "completed";
          inMemoryScanStore[scanId].lastUpdated = new Date().toISOString();
        }
      })().catch((err) => {
        console.error("Background scan fatal error:", err);
        if (inMemoryScanStore[scanId]) {
          inMemoryScanStore[scanId].status = "error";
          inMemoryScanStore[scanId].lastUpdated = new Date().toISOString();
        }
      });
    },
  );

  app.get(
    ["/api/background-scan-status", "/background-scan-status"],
    (req, res) => {
      const scanId = (req.query.scanId as string) || "background";
      res.json(inMemoryScanStore[scanId] || { status: "not_found" });
    }
  );

  // IMDb Fetch Proxy
  app.get(["/api/image-proxy"], async (req, res) => {
    try {
      const { url } = req.query;
      if (!url || typeof url !== "string")
        return res.status(400).json({ error: "URL required" });

      const response = await fetch(url);
      if (!response.ok) {
        return res
          .status(response.status)
          .send(`Failed to fetch image: ${response.statusText}`);
      }
      const buffer = await response.arrayBuffer();
      res.setHeader(
        "Content-Type",
        response.headers.get("content-type") || "application/octet-stream",
      );
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.send(Buffer.from(buffer));
    } catch (error) {
      console.error("Image proxy error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  app.get(["/api/imdb-fetch", "/imdb-fetch"], async (req, res) => {
    try {
      const { url } = req.query;
      if (!url || typeof url !== "string")
        return res.status(400).json({ error: "IMDb URL required" });

      const match = url.match(/tt\d+/);
      if (!match) return res.status(400).json({ error: "Invalid IMDb URL" });
      const ttId = match[0];

      // Try TVMaze lookup
      console.log(`Fetching TVMaze for IMDb ID: ${ttId}`);
      const response = await fetch(
        `https://api.tvmaze.com/lookup/shows?imdb=${ttId}`,
      );

      if (!response.ok) {
        if (response.status === 404) {
          console.error(`TVMaze lookup not found for ${ttId}`);
          return res.status(404).json({
            error:
              "Content not found on TVMaze. Please try manual entry or Master Fetch.",
          });
        }
        const errorText = await response.text();
        console.error(
          `TVMaze lookup failed for ${ttId}: ${response.status} - ${errorText}`,
        );
        return res.status(response.status).json({
          error: `Failed to fetch from TVMaze: ${response.statusText}`,
        });
      }

      const showData = await response.json();

      // Fetch episodes
      console.log(`Fetching episodes for TVMaze ID: ${showData.id}`);
      const episodesResponse = await fetch(
        `https://api.tvmaze.com/shows/${showData.id}/episodes`,
      );

      if (!episodesResponse.ok) {
        const errorText = await episodesResponse.text();
        console.error(
          `TVMaze episodes failed for ${showData.id}: ${episodesResponse.status} - ${errorText}`,
        );
        return res.status(episodesResponse.status).json({
          error: `Failed to fetch episodes from TVMaze: ${episodesResponse.statusText}`,
        });
      }

      const episodes = await episodesResponse.json();

      res.json({
        ...showData,
        episodes,
      });
    } catch (error) {
      console.error("IMDb Fetch Proxy Error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // IMDb Suggestion Proxy
  app.get(
    ["/api/imdb/suggestion/:ttId", "/imdb/suggestion/:ttId"],
    async (req, res) => {
      try {
        const { ttId } = req.params;
        const firstLetter = ttId.charAt(0).toLowerCase();

        const response = await fetch(
          `https://v3.sg.media-imdb.com/suggestion/${firstLetter}/${ttId}.json`,
        );
        if (!response.ok) {
          // Fallback to 'x' if the first letter doesn't work (sometimes used for newer IDs)
          const fallbackResponse = await fetch(
            `https://v3.sg.media-imdb.com/suggestion/x/${ttId}.json`,
          );
          if (!fallbackResponse.ok) {
            return res
              .status(fallbackResponse.status)
              .json({ error: "Failed to fetch from IMDb" });
          }
          const data = await fallbackResponse.json();
          return res.json(data);
        }
        const data = await response.json();
        res.json(data);
      } catch (error) {
        console.error("IMDb Suggestion Proxy Error:", error);
        res.status(500).json({ error: "Internal Server Error" });
      }
    },
  );

  // IMDb Title Page Proxy
  app.get(["/api/imdb/title/:ttId", "/imdb/title/:ttId"], async (req, res) => {
    try {
      const { ttId } = req.params;
      const response = await fetch(`https://www.imdb.com/title/${ttId}/`, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
          "Accept-Language": "en-US,en;q=0.9",
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
          "Sec-Ch-Ua":
            '"Chromium";v="122", "Not(A:Brand)";v="24", "Google Chrome";v="122"',
          "Sec-Ch-Ua-Mobile": "?0",
          "Sec-Ch-Ua-Platform": '"Windows"',
          "Sec-Fetch-Dest": "document",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-Site": "none",
          "Sec-Fetch-User": "?1",
          "Upgrade-Insecure-Requests": "1",
        },
      });
      if (!response.ok) {
        console.error(
          `IMDb Proxy: Failed to fetch ${ttId}, status: ${response.status}`,
        );
        return res
          .status(response.status)
          .json({ error: `Failed to fetch from IMDb: ${response.status}` });
      }
      const html = await response.text();
      res.send(html);
    } catch (error) {
      console.error("IMDb Title Proxy Error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // YouTube Search Proxy
  app.get(["/api/youtube/search", "/youtube/search"], async (req, res) => {
    try {
      const { q } = req.query;
      if (!q) return res.status(400).json({ error: "Query required" });
      const response = await fetch(
        `https://www.youtube.com/results?search_query=${encodeURIComponent(q as string)}`,
        {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9",
          },
        },
      );
      const html = await response.text();
      // Extract the first video ID and title
      const match = html.match(/"videoId":"([^"]+)"/);
      const titleMatch = html.match(
        /"title":\{"runs":\[\{"text":"([^"]+)"\}\]/,
      );

      if (match && match[1]) {
        return res.json({
          videoId: match[1],
          url: `https://www.youtube.com/watch?v=${match[1]}`,
          title: titleMatch ? titleMatch[1] : "YouTube Video",
        });
      }
      res.status(404).json({ error: "No video found" });
    } catch (error) {
      console.error("YouTube Proxy Error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // TinyURL Proxy
  app.get(["/api/tinyurl", "/tinyurl"], async (req, res) => {
    try {
      const { url, alias } = req.query;
      if (!url || typeof url !== "string")
        return res.status(400).json({ error: "URL required" });

      let fetchUrl = `https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`;
      if (alias && typeof alias === "string") {
        fetchUrl += `&alias=${encodeURIComponent(alias)}`;
      }

      const response = await fetch(fetchUrl);
      const shortUrl = await response.text();

      if (
        !response.ok ||
        shortUrl.toLowerCase().includes("<html") ||
        !shortUrl.startsWith("http")
      ) {
        console.error("TinyURL error response:", shortUrl);
        return res
          .status(500)
          .json({ error: "TinyURL returned invalid response" });
      }
      res.send(shortUrl);
    } catch (error) {
      console.error("TinyURL Proxy Error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // Server-side Link Scanner
  app.post(["/api/scan-links", "/scan-links"], async (req, res) => {
    try {
      const { links } = req.body;
      if (!links || !Array.isArray(links))
        return res.status(400).json({ error: "Links array required" });

      console.log(`Starting server-side scan for ${links.length} links`);

      const results = await Promise.all(
        links.map(async (link) => {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000);

            let fetchUrl = link.url;
            // If it's a pixeldrain link, use the API for faster checking
            const pdMatch = fetchUrl.match(
              /pixeldrain\.(?:com|dev)\/(?:u|api\/file)\/([a-zA-Z0-9]+)/,
            );
            if (pdMatch) {
              fetchUrl = `https://pixeldrain.com/api/file/${pdMatch[1]}/info`;
            }

            const response = await fetch(fetchUrl, {
              method: "GET",
              headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Range": "bytes=0-0",
                "Accept": "*/*"
              },
              signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
              return { ...link, errorDetail: `HTTP ${response.status}` };
            }
            return { ...link, errorDetail: null };
          } catch (e: any) {
            if (e.name === "AbortError") {
              return { ...link, errorDetail: "Timeout" };
            }
            return { ...link, errorDetail: "Network error" };
          }
        }),
      );

      res.json({ results });
    } catch (error) {
      console.error("Scan Links Error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // MDrive Extraction API
  app.get('/api/mdrive', async (req: express.Request, res: express.Response) => {
    try {
      let { url } = req.query;
      if (!url || typeof url !== 'string' || (!url.includes('mdrive.lol') && !url.includes('mdrvie.lol'))) {
        return res.status(400).json({ error: 'Valid mdrive.lol or mdrvie.lol URL required' });
      }

      if (!url.startsWith('http')) {
         url = 'https://' + url;
      }

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      
      if (!response.ok) {
        throw new Error(`MDrive returned ${response.status}`);
      }

      const text = await response.text();
      const rawHits: any[] = [];
      let mainTitle = "Unknown Title";
      const titleMatch = text.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (titleMatch) {
          mainTitle = titleMatch[1].replace(/(?:\s*-\s*mdrive\.lol|\s*-\s*MDrive|HubCloud|HubDrive|vcloud|hubcould|hub-cloud)/ig, "").trim();
      }
      
      // Split on link opening tags to evaluate the preceding text for context
      const parts = text.split('<a ');
      let lastFilename = "File";
      
      for (let i = 1; i < parts.length; i++) {
          const hrefMatch = parts[i].match(/href="([^"]+)"/);
          if (hrefMatch) {
              const link = hrefMatch[1];
              
              // Check if it's a HubCloud link
              if (link.includes('hubcloud.foo') || link.includes('hubcould.') || link.includes('hubcloud.') || link.includes('hubdrive.') || link.includes('vcloud.')) {
                  const prev = parts[i-1];
                  
                  // Mdrive stores the file name in a heading directly before the link
                  const h5Match = prev.match(/<h[1-6][^>]*>(.*?)<\/h[1-6]>\s*(?:<[^>]+>\s*)*$/i);
                  let title = lastFilename;
                  if (h5Match) {
                      title = h5Match[1].replace(/<[^>]+>/g, '').trim();
                      lastFilename = title; // Fallback for links that don't have a direct heading
                  }
                  
                  let titleClean = title.replace(/(?:HubCloud|HubDrive(?:\.space)?|vcloud|hubcould|hub-cloud)(?:\s*-)?/ig, '').trim();
                  
                  let tLower = titleClean.toLowerCase();
                  let mLower = mainTitle.toLowerCase();
                  if (tLower === 'file') titleClean = "";
                  
                  let combined = mainTitle;
                  if (titleClean) {
                      if (tLower.includes(mLower)) {
                          combined = titleClean;
                      } else if (mLower.includes(tLower)) {
                          combined = mainTitle;
                      } else {
                          combined = `${mainTitle} ${titleClean}`;
                      }
                  }
                  
                  let finalFileName = combined.replace(/&#8211;/g, '-').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
                  
                  // Clean up sizes with /E (e.g., [440MB/E]) from the main title part
                  finalFileName = finalFileName.replace(/\[?\s*\d+(?:\.\d+)?\s*(?:GB|MB|KB)\/E\s*\]?/gi, '').trim();
                  
                  // Scrape size if available in the text
                  let size = "Unknown";
                  const sizeMatch = title.match(/\[?\s*(\d+(?:\.\d+)?\s*(?:GB|MB|KB))\s*\]?/i) || prev.match(/\[?\s*(\d+(?:\.\d+)?\s*(?:GB|MB|KB))\s*\]?/i);
                  if (sizeMatch) {
                      size = sizeMatch[1].toUpperCase();
                      // Remove size from filename to make matching easier
                      const escapedSize = size.replace(/\./g, '\\.');
                      finalFileName = finalFileName.replace(new RegExp(`\\[?\\s*${escapedSize}\\s*\\]?`, 'gi'), "").replace(/[\[\]()\-_\s]+$/, "").trim();
                  }

                  rawHits.push({
                     file_name: finalFileName,
                     url: normalizeDomain(link),
                     size: size !== "Unknown" ? size : null,
                     date: new Date().toISOString().split('T')[0]
                  });
              }
          }
      }

      // Deduplicate: If same file found in hubcloud, skip hubdrive
      const hits: any[] = [];
      const seenFiles = new Map<string, string>(); // Add URL host to know which we kept
      
      for (const hit of rawHits) {
         const isHubdrive = hit.url.includes('hubdrive.');
         const existing = seenFiles.get(hit.file_name);
         
         if (existing) {
             // If we already have this file...
             if (isHubdrive && !existing.includes('hubdrive.')) {
                 // Skip hubdrive if we already have non-hubdrive (hubcloud)
                 continue;
             }
             if (!isHubdrive && existing.includes('hubdrive.')) {
                 // Replace hubdrive with hubcloud
                 const idx = hits.findIndex(h => h.file_name === hit.file_name && h.url === existing);
                 if (idx !== -1) hits.splice(idx, 1);
                 hits.push(hit);
                 seenFiles.set(hit.file_name, hit.url);
                 continue;
             }
             // Otherwise just keep the first one
             continue;
         }
         
         hits.push(hit);
         seenFiles.set(hit.file_name, hit.url);
      }

      res.json({ hits, found: hits.length, all_fetched: true });
    } catch (error: any) {
      console.error('MDrive extract error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // HowBlogs Extraction API
  app.get('/api/howblogs', async (req: express.Request, res: express.Response) => {
    try {
      let { url } = req.query;
      if (!url || typeof url !== 'string' || !url.includes('howblogs.xyz')) {
        return res.status(400).json({ error: 'Valid howblogs.xyz URL required' });
      }

      if (!url.startsWith('http')) {
         url = 'https://' + url;
      }

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        signal: AbortSignal.timeout(7000)
      });
      
      if (!response.ok) {
        throw new Error(`HowBlogs returned ${response.status}`);
      }

      const text = await response.text();
      // Look for HubCloud links - they usually start with hubcloud. or hubcould.
      const hubcloudMatch = text.match(/https?:\/\/[^"'\s]*(?:hubcloud|hubcould)\.[^"'\s]*/i);
      
      if (hubcloudMatch) {
          res.json({ url: normalizeDomain(hubcloudMatch[0]) });
      } else {
          res.status(404).json({ error: 'No HubCloud link found' });
      }
    } catch (error: any) {
      console.error('HowBlogs extract error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // FilesDL Extraction API
  app.get('/api/filesdl', async (req: express.Request, res: express.Response) => {
    try {
      let { url } = req.query;
      if (!url || typeof url !== 'string' || (!url.includes('filesdl') && !url.includes('linkmake'))) {
        return res.status(400).json({ error: 'Valid filesdl/linkmake URL required' });
      }

      if (!url.startsWith('http')) {
         url = 'https://' + url;
      }

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Referer': url
        },
        signal: AbortSignal.timeout(7000)
      });
      
      // Try to read text anyway because Cloudflare might return 403 but the HTML might still contain the link or we can extract it
      const text = await response.text();
      // Look for HubCloud links
      const hubcloudMatch = text.match(/https?:\/\/[^"'\s]*(?:hubcloud|hubcould|vcloud\.live|hubdrive)\.[^"'\s]*/i);
      
      if (hubcloudMatch) {
          res.json({ url: normalizeDomain(hubcloudMatch[0]) });
      } else {
          if (!response.ok) {
            throw new Error(`FilesDL returned ${response.status} and no valid link was found in response`);
          }
          res.status(404).json({ error: 'No HubCloud link found on FilesDL page' });
      }
    } catch (error: any) {
      console.error('FilesDL extract error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // MoviesDrive Extraction API
  app.get('/api/moviesdrive', async (req: express.Request, res: express.Response) => {
    try {
      let { url } = req.query;
      if (!url || typeof url !== 'string' || (!url.trim().startsWith('http') && !url.includes('.'))) {
        return res.status(400).json({ error: 'Valid URL required' });
      }

      // Clean URL
      let targetUrl = url.trim().replace(/[:\s]+$/, '');
      if (!targetUrl.startsWith('http')) {
         targetUrl = 'https://' + targetUrl;
      }

      console.log(`[MoviesDrive] Extracting from: ${targetUrl}`);

      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Referer': targetUrl
      };

      const urlObj = new URL(targetUrl);
      const q = urlObj.searchParams.get('q') || urlObj.searchParams.get('s') || '';
      const page = urlObj.searchParams.get('page') || '1';
      const isSearchUrl = targetUrl.includes('search.html') || targetUrl.includes('search.php') || Boolean(q) || urlObj.pathname === '/' || urlObj.pathname === '' || urlObj.pathname.endsWith('index.html');

      let effectiveOrigin = urlObj.origin;

      // 1. If URL is a search page or contains query parameter 'q' or 's', check search.php first
      if (isSearchUrl && q) {
        let searchApiUrl = `${effectiveOrigin}/search.php?q=${encodeURIComponent(q)}&page=${page}`;
        console.log(`[MoviesDrive] Querying search endpoint: ${searchApiUrl}`);
        try {
          let sRes = await fetch(searchApiUrl, { headers, signal: AbortSignal.timeout(7000) });
          if (sRes.url) {
            try {
              const resObj = new URL(sRes.url);
              if (resObj.origin !== effectiveOrigin || resObj.searchParams.get('q') !== q) {
                effectiveOrigin = resObj.origin;
                const fixedSearchUrl = `${effectiveOrigin}/search.php?q=${encodeURIComponent(q)}&page=${page}`;
                console.log(`[MoviesDrive] Domain redirect or query loss detected, re-querying: ${fixedSearchUrl}`);
                sRes = await fetch(fixedSearchUrl, { headers, signal: AbortSignal.timeout(7000) });
              }
            } catch (e) {}
          }

          if (sRes.ok) {
            const sData = await sRes.json().catch(() => null);
            if (sData && Array.isArray(sData.hits) && sData.hits.length > 0) {
              const posts = sData.hits.map((h: any) => {
                const doc = h.document || h;
                const permalink = doc.permalink || doc.url || "";
                const fullUrl = permalink.startsWith("http")
                  ? permalink
                  : `${effectiveOrigin}${permalink.startsWith("/") ? "" : "/"}${permalink}`;
                const title = (doc.post_title || doc.title || "Untitled")
                  .replace(/&#8211;/g, '-')
                  .replace(/&amp;/g, '&')
                  .replace(/\s+/g, ' ')
                  .trim();
                const image = doc.post_thumbnail || doc.image || doc.poster || doc.thumb || doc.thumbnail || "";
                return { title, url: fullUrl, image };
              }).filter((p: any) => p.url && p.title);

              if (posts.length > 0) {
                return res.json({ is_search: true, posts, found: posts.length });
              }
            }
          }
        } catch (sErr) {
          console.warn(`[MoviesDrive] search.php error, falling back to HTML parse:`, sErr);
        }
      }

      // 2. Fetch the HTML page
      const response = await fetch(targetUrl, { headers, signal: AbortSignal.timeout(7000) });
      if (!response.ok) throw new Error(`MoviesDrive returned ${response.status}`);
      if (response.url) {
        try {
          effectiveOrigin = new URL(response.url).origin;
        } catch (e) {}
      }
      const text = await response.text();

      // Check if it's a single post containing MDrive links
      const hasMdriveLinks = /(?:mdrive|mdrvie)\.lol\/archive\//i.test(text);

      if (hasMdriveLinks) {
        const hits: any[] = [];
        const seenUrls = new Set<string>();
        const parts = text.split('<a ');
        
        for(let i = 1; i < parts.length; i++) {
          const p = parts[i];
          const m = p.match(/href=["']([^"']*(?:mdrive|mdrvie)\.lol\/archive\/[^"']*)["']/i);
          if (m) {
            const mUrl = m[1].trim();
            if (!seenUrls.has(mUrl)) {
              seenUrls.add(mUrl);
              
              let label = "";
              const closeAnchorIndex = p.indexOf('</a>');
              if (closeAnchorIndex !== -1) {
                const anchorContent = p.substring(0, closeAnchorIndex);
                const tagEndIndex = anchorContent.indexOf('>');
                if (tagEndIndex !== -1) {
                  const innerHtml = anchorContent.substring(tagEndIndex + 1);
                  label = innerHtml.replace(/<[^>]*>/g, '').trim();
                }
              }
              
              if (!label) label = "Download Link";
              label = label.replace(/&#8211;/g, '-').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
              
              hits.push({
                file_name: label,
                url: normalizeDomain(mUrl),
                size: null,
                is_direct: false
              });
            }
          }
        }

        if (hits.length > 0) {
          return res.json({ is_search: false, hits, found: hits.length });
        }
      }

      // 3. Fallback: Parse catalog/search/archive HTML with Cheerio if no MDrive links found directly
      const $ = cheerio.load(text);
      const postsMap = new Map<string, { title: string; image?: string }>();

      $("a[href]").each((_, el) => {
        let href = $(el).attr("href") || "";
        if (!href) return;
        if (href.startsWith("/")) href = effectiveOrigin + href;
        if (!href.startsWith("http")) return;

        try {
          const u = new URL(href);
          const effectiveHost = new URL(effectiveOrigin).hostname;
          if (u.hostname !== effectiveHost && u.hostname !== urlObj.hostname) return;
          const path = u.pathname;
          if (path === "/" || path.includes("search.html") || path.includes("search.php") || path.includes("/category/") || path.includes("/genre/") || path.includes("/tag/") || path.includes("/page/")) return;
          if (/\.(jpg|jpeg|png|gif|webp|css|js|xml|svg|zip|rar|mkv|mp4)$/i.test(path)) return;
          if (/(contact|dmca|about|privacy|disclaimer|telegram|facebook|twitter|instagram|mdrive|hubcloud|login|register|request|how-to|howto|faq|terms|sitemap|report)/i.test(path)) return;

          const getImgSrc = (imgEl: any): string => {
            if (!imgEl || imgEl.length === 0) return "";
            let src =
              imgEl.attr("data-src") ||
              imgEl.attr("data-original") ||
              imgEl.attr("data-lazy-src") ||
              imgEl.attr("data-cfsrc") ||
              imgEl.attr("src") ||
              "";
            if (!src) {
              const srcset = imgEl.attr("srcset") || imgEl.attr("data-srcset");
              if (srcset) {
                src = srcset.split(",")[0].trim().split(" ")[0];
              }
            }
            return src || "";
          };

          let title = $(el).text().trim() || $(el).attr("title") || $(el).find("img").attr("alt") || "";
          let image = getImgSrc($(el).find("img"));
          const container = $(el).closest("article, .post, .entry, .card, div");
          if (!title) {
            title = container.find("h1, h2, h3, h4, .entry-title, .post-title").text().trim();
          }
          if (!image) {
            image = getImgSrc(container.find("img"));
          }
          if (!image) {
            image = getImgSrc($(el).prev("img")) || getImgSrc($(el).next("img")) || getImgSrc($(el).parent().find("img"));
          }
          if (image) {
            try { image = new URL(image, targetUrl).href; } catch(e) {}
          }
          title = title.replace(/&#8211;/g, "-").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
          if (/(contact|dmca|about|privacy|disclaimer|telegram|facebook|twitter|instagram|login|register|request|how to|site search|search|faq|terms|sitemap|report|help)/i.test(title)) return;
          if (title && title.length > 3) {
            if (!postsMap.has(href)) {
              postsMap.set(href, { title, image: image || undefined });
            } else if (image && !postsMap.get(href)?.image) {
              postsMap.get(href)!.image = image;
            }
          }
        } catch (e) {}
      });

      const posts = Array.from(postsMap.entries()).map(([postUrl, data]) => ({ title: data.title, url: postUrl, image: data.image }));

      if (posts.length > 0 && isSearchUrl) {
        return res.json({ is_search: true, posts, found: posts.length });
      }

      // Fallback for native HubCloud links on post page
      const hits: any[] = [];
      const seenUrls = new Set<string>();
      const hubcloudMatch = text.match(/https?:\/\/[^"'\s<>\[\]]*(?:hubcloud|hubcould|hub-cloud|vcloud\.live|hubdrive|skymovies|moviesdrive|mdrive|filmygo)\.[^"'\s<>\[\]]*/gi);
      if (hubcloudMatch) {
         hubcloudMatch.forEach(hubUrl => {
            const cleanHubUrl = hubUrl.replace(/&amp;/g, '&');
            if (!seenUrls.has(cleanHubUrl)) {
               seenUrls.add(cleanHubUrl);
               hits.push({
                  file_name: "Original HubCloud Link",
                  url: normalizeDomain(cleanHubUrl),
                  size: null,
                  is_direct: true
               });
            }
         });
      }

      return res.json({ is_search: false, hits, found: hits.length });
    } catch (error: any) {
      console.error('MoviesDrive extract error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // FilmyGo / FilmyCab Extraction API
  app.get('/api/filmygo', async (req: express.Request, res: express.Response) => {
    try {
      let { url } = req.query;
      if (!url || typeof url !== 'string' || (!url.trim().startsWith('http') && !url.includes('.'))) {
        return res.status(400).json({ error: 'Valid FilmyGo / FilmyCab URL required' });
      }

      // Clean URL
      let targetUrl = url.trim().replace(/[:\s]+$/, '');
      if (!targetUrl.startsWith('http')) {
        targetUrl = 'https://' + targetUrl;
      }

      console.log(`[FilmyGo/FilmyCab] Extracting FilesDL links from: ${targetUrl}`);

      const { html: text, status: initialStatus, finalUrl: resolvedTargetUrl } = await fetchWithVddos(targetUrl);
      const $ = cheerio.load(text);
      const urlObj = new URL(resolvedTargetUrl || targetUrl);

      const searchParam = urlObj.searchParams.get('to-search') || urlObj.searchParams.get('search') || urlObj.searchParams.get('q') || urlObj.searchParams.get('s') || '';
      const isSearchUrl = targetUrl.includes('site-search.html') || Boolean(searchParam) || urlObj.searchParams.has('to-page') || urlObj.pathname === '/' || urlObj.pathname === '' || urlObj.pathname.endsWith('index.html');

      if (isSearchUrl) {
        console.log(`[FilmyGo] Search/catalog page detected: ${targetUrl}`);
        
        const postsMap = new Map<string, { title: string; image?: string }>();

        const getImgSrc = (imgEl: any): string => {
          if (!imgEl || imgEl.length === 0) return "";
          let src =
            imgEl.attr("data-src") ||
            imgEl.attr("data-original") ||
            imgEl.attr("data-lazy-src") ||
            imgEl.attr("data-cfsrc") ||
            imgEl.attr("src") ||
            "";
          if (!src) {
            const srcset = imgEl.attr("srcset") || imgEl.attr("data-srcset");
            if (srcset) {
              src = srcset.split(",")[0].trim().split(" ")[0];
            }
          }
          return src || "";
        };

        $("a[href]").each((_, el) => {
          let rawHref = $(el).attr("href") || "";
          if (!rawHref || rawHref.startsWith("#") || rawHref.startsWith("javascript:")) return;

          // Skip links inside the trending slider or sticky lists
          if ($(el).closest('.trending-slider, .images-list').length > 0) return;

          try {
            const fullUrl = new URL(rawHref, targetUrl).href;
            const u = new URL(fullUrl);
            if (u.hostname !== urlObj.hostname) return;
            const path = u.pathname;
            const searchStr = u.search;

            if (path === "/" || path.includes("site-search") || searchStr.includes("to-search=") || searchStr.includes("to-page=")) return;
            if (path.includes("/category/") || path.includes("/genre/") || path.includes("/tag/") || path.includes("/page/")) return;
            if (/\.(jpg|jpeg|png|gif|webp|css|js|xml|svg|zip|rar|mkv|mp4)$/i.test(path)) return;
            if (/(contact|dmca|about|privacy|disclaimer|telegram|facebook|twitter|instagram|filesdl|login|register|request|site-request|how-to|howto|faq|terms|sitemap|report|help)/i.test(path) || /(request|site-request|report|contact|dmca|about|privacy|disclaimer)/i.test(fullUrl)) return;

            let title = $(el).text().trim() || $(el).attr("title") || $(el).find("img").attr("alt") || "";
            let image = getImgSrc($(el).find("img"));

            const container = $(el).closest("article, .post, .entry, .card, .item, .single-post, .film-item, div, tr, td, p, li");
            if (!title) {
              title = container.find("h1, h2, h3, h4, .entry-title, .post-title, .title, b, strong").text().trim();
            }
            if (!image) {
              image = getImgSrc(container.find("img"));
            }
            if (!image) {
              image = getImgSrc($(el).prev("img")) || getImgSrc($(el).next("img")) || getImgSrc($(el).parent().find("img"));
            }
            if (image) {
              try { image = new URL(image, targetUrl).href; } catch(e) {}
            }

            title = title.replace(/&#8211;/g, "-").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
            if (/(contact|dmca|about|privacy|disclaimer|telegram|facebook|twitter|instagram|login|register|request|how to|site search|search|faq|terms|sitemap|report|help)/i.test(title)) return;

            // Exclude category names that are incorrectly treated as posts
            const isCategory = /^(animation movies?|bengali movies?|bhojpuri movies?|bollywood movies?|gujarati movies?|hindi hq dub movies?|hollywood movies?|marathi movies?|odia movies?|odia movie|punjabi movies?|south movies?|web series)$/i.test(title);
            if (isCategory) return;

            if (title && title.length > 2) {
              if (!postsMap.has(fullUrl)) {
                postsMap.set(fullUrl, { title, image: image || undefined });
              } else if (image && !postsMap.get(fullUrl)?.image) {
                postsMap.get(fullUrl)!.image = image;
              }
            }
          } catch (e) {}
        });

        // Secondary pass for any posts missing images
        for (const [pUrl, pData] of postsMap.entries()) {
          if (!pData.image) {
            try {
              const relPath = new URL(pUrl).pathname;
              $(`a[href*="${relPath}"]`).each((_, aEl) => {
                const parent = $(aEl).closest("article, .post, .entry, .card, .item, div, tr, li");
                const foundImg = getImgSrc(parent.find("img"));
                if (foundImg) {
                  try { pData.image = new URL(foundImg, targetUrl).href; } catch(e) {}
                }
              });
            } catch (e) {}
          }
        }

        const posts = Array.from(postsMap.entries()).map(([postUrl, data]) => ({ title: data.title, url: postUrl, image: data.image }));
        if (posts.length > 0) {
          return res.json({ is_search: true, posts, found: posts.length });
        }
      }
      
      // Remove sidebars, recommended/trending posts, and footers so we only extract links belonging to this specific movie
      $("aside, .sidebar, #secondary, .widget, .related-posts, .related, .trending, .popular-posts, .popular, footer, #footer, #comments").remove();

      const $mainContainer = $(".entry-content, .post-content, article, main, .entry").length > 0
        ? $(".entry-content, .post-content, article, main, .entry")
        : $("body");

      const fdlData = new Map<string, { label: string }>();
      $mainContainer.find("a[href]").each((_, el) => {
        let href = $(el).attr("href") || "";
        if (!href) return;
        href = href.trim();
        if (href.startsWith("/")) {
          try { href = new URL(href, targetUrl).href; } catch(e) {}
        }

        // Ignore self-links back to targetUrl
        if (href === targetUrl || href.replace(/\/$/, "") === targetUrl.replace(/\/$/, "")) return;

        if (
          href.includes("filesdl") ||
          href.includes("linkmake") ||
          href.includes("hubcloud") ||
          href.includes("vcloud") ||
          href.includes("hubdrive") ||
          href.includes("mdrive") ||
          href.includes("fastdl") ||
          href.includes("filepress") ||
          href.includes("drivehub")
        ) {
          if (href.includes("gdflix")) return;
          let rawLabel = $(el).text().trim() || $(el).attr("title") || "";
          let label = rawLabel.replace(/&#8211;/g, '-').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

          if (!label || /^(direct\s*)?download(\s*now)?$/i.test(label) || label.length < 3) {
            const container = $(el).closest("p, div, tr, td, li, article");
            let containerText = container.clone().children("a").remove().end().text().trim();
            if (!containerText) {
              containerText = container.prev().text().trim() || container.text().trim();
            }
            if (containerText) {
              label = containerText.replace(/\s+/g, ' ').trim();
            }
          }

          const lower = label.toLowerCase();
          const hasHindiLine = /\bhindi\b.*?\bline\b/.test(lower);

          if (lower.includes("480p") && lower.includes("hevc")) label = "Download Now 480p HEVC";
          else if (lower.includes("720p") && lower.includes("hevc")) label = "Download Now 720p HEVC";
          else if (lower.includes("1080p") && lower.includes("hevc")) label = "Download Now 1080p HEVC";
          else if (lower.includes("480p")) label = "Download Now 480p";
          else if (lower.includes("720p")) label = "Download Now 720p";
          else if (lower.includes("1080p")) label = "Download Now 1080p";

          if (hasHindiLine && !label.includes("Hindi (Line)")) {
            label += " Hindi (Line)";
          }

          if (!label) label = "Download Link";

          if (href.startsWith("http")) {
            fdlData.set(href, { label });
          }
        }
      });

      if (fdlData.size === 0) {
        const parts = text.split('<a ');
        for(let i = 1; i < parts.length; i++) {
          const p = parts[i];
          const m = p.match(/href=["']([^"']*(?:filesdl|linkmake|hubcloud|vcloud|mdrive|fastdl|filepress|drivehub)[^"']*)["']/i);
          if (m) {
            let fdlUrl = m[1].trim();
            if (fdlUrl.includes("gdflix")) continue;
            if (fdlUrl.startsWith("/")) {
              try { fdlUrl = new URL(fdlUrl, targetUrl).href; } catch(e) {}
            }
            if (fdlUrl === targetUrl || fdlUrl.replace(/\/$/, "") === targetUrl.replace(/\/$/, "")) continue;
            
            let label = "";
            const closeAnchorIndex = p.indexOf('</a>');
            if (closeAnchorIndex !== -1) {
              const anchorContent = p.substring(0, closeAnchorIndex);
              const tagEndIndex = anchorContent.indexOf('>');
              if (tagEndIndex !== -1) {
                const innerHtml = anchorContent.substring(tagEndIndex + 1);
                label = innerHtml.replace(/<[^>]*>/g, '').trim();
              }
            }
            
            if (!label) label = "Download Link";
            label = label.replace(/&#8211;/g, '-').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
            
            fdlData.set(fdlUrl, { label });
          }
        }
      }

      // Helper to check if URL is a valid HubCloud / mirror link
      const isHubCloudUrl = (u: string): boolean => {
        if (!u || typeof u !== 'string') return false;
        const lower = u.toLowerCase();
        if (lower.includes("gdflix") || lower.includes("failed") || lower.includes("please check") || lower.includes("cdn-cgi")) return false;
        return /(?:hubcloud|hubcould|hub-cloud|vcloud\.live|vcloud|hubdrive|mdrive|fastdl|filepress|drivehub)\./i.test(lower);
      };

      // Recursive multi-hop resolver for FilmyGo / FilmyCab gates (e.g. FilmyGo -> LinkMake -> FilesDL -> HubCloud)
      const visited = new Set<string>();
      visited.add(targetUrl);

      async function resolveFilmyGoLink(
        startUrl: string,
        parentLabel: string,
        depth = 0
      ): Promise<Array<{ file_name: string; url: string; size: string | null; is_direct: boolean }>> {
        if (depth > 4 || visited.has(startUrl) || startUrl.toLowerCase().includes("gdflix")) return [];
        visited.add(startUrl);

        try {
          const { html: htmlText, finalUrl: resolvedStartUrl } = await fetchWithVddos(startUrl, undefined, 8000);
          const finalUrl = resolvedStartUrl || startUrl;
          if (finalUrl && finalUrl !== startUrl) {
            visited.add(finalUrl);
          }

          // Direct match for HubCloud / VCloud / HubDrive / Mdrive / FastDL / FilePress
          const rawHubMatches: string[] = htmlText.match(/https?:\/\/[^"'\s<>\[\]]*(?:hubcloud|hubcould|hub-cloud|vcloud\.live|vcloud|hubdrive|mdrive|fastdl|filepress|drivehub)\.[^"'\s<>\[\]]*/gi) || [];
          const hubMatches = rawHubMatches.filter((hubUrl: string) => 
            !hubUrl.toLowerCase().includes("failed") &&
            !hubUrl.toLowerCase().includes("gdflix") &&
            !hubUrl.toLowerCase().includes("please check") &&
            !hubUrl.includes(" ")
          );

          if (hubMatches.length > 0) {
            const sizeMatch = htmlText.match(/Size:<\/span>\s*<span>([^<]+)<\/span>/i) || 
                              htmlText.match(/Size:\s*([0-9.]+\s*(?:GB|MB|KB))/i) || 
                              htmlText.match(/(\d+(?:\.\d+)?\s*(?:GB|MB|KB))/i);
            const size = sizeMatch ? sizeMatch[1].toUpperCase() : null;

            let finalName = parentLabel || "HubCloud Link";
            if (size) {
              const escapedSize = size.replace(/\./g, '\\.');
              finalName = finalName.replace(new RegExp(`\\[?${escapedSize}\\]?`, 'gi'), "").trim();
              finalName = finalName.replace(/[\[\]()\-_\s]+$/, "").trim();
            }

            return hubMatches.map((hubUrl) => ({
              file_name: finalName || "HubCloud Link",
              url: normalizeDomain(hubUrl.replace(/&amp;/g, '&')),
              size,
              is_direct: true,
            }));
          }

          // Otherwise, parse HTML with Cheerio to find nested linkmake / intermediate gate links
          const $page = cheerio.load(htmlText);
          const nestedCandidates: Array<{ url: string; label: string }> = [];

          $page("a[href]").each((_, el) => {
            let href = $page(el).attr("href") || "";
            if (!href || href.startsWith("#") || href.startsWith("javascript:")) return;

            try {
              href = new URL(href, finalUrl).href;
            } catch (e) {
              return;
            }

            if (visited.has(href)) return;

            const lowerHref = href.toLowerCase();
            if (lowerHref.includes("gdflix") || lowerHref.includes("cdn-cgi") || lowerHref.includes("download.php")) return;

            const isTargetHost = href.includes("filmygo.") || href.includes("filmycab.");
            
            if (isTargetHost && (href === finalUrl || href.includes("site-search") || href.includes("category") || href.includes("contact"))) {
              return;
            }

            if (
              lowerHref.includes("filesdl") ||
              lowerHref.includes("linkmake") ||
              lowerHref.includes("hubcloud") ||
              lowerHref.includes("vcloud") ||
              lowerHref.includes("hubdrive") ||
              lowerHref.includes("mdrive") ||
              lowerHref.includes("fastdl") ||
              lowerHref.includes("filepress") ||
              lowerHref.includes("drivehub") ||
              lowerHref.includes("page-download")
            ) {
              let anchorText = $page(el).text().trim() || $page(el).attr("title") || "";
              anchorText = anchorText.replace(/&#8211;/g, '-').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

              let updatedLabel = parentLabel;
              const lowerAnchor = anchorText.toLowerCase();

              if (anchorText && !/^(direct\s*)?download(\s*now)?$/i.test(anchorText)) {
                let resLabel = "";
                if (lowerAnchor.includes("480p") && lowerAnchor.includes("hevc")) resLabel = "Download Now 480p HEVC";
                else if (lowerAnchor.includes("720p") && lowerAnchor.includes("hevc")) resLabel = "Download Now 720p HEVC";
                else if (lowerAnchor.includes("1080p") && lowerAnchor.includes("hevc")) resLabel = "Download Now 1080p HEVC";
                else if (lowerAnchor.includes("480p")) resLabel = "Download Now 480p";
                else if (lowerAnchor.includes("720p")) resLabel = "Download Now 720p";
                else if (lowerAnchor.includes("1080p")) resLabel = "Download Now 1080p";
                else if (lowerAnchor.includes("4k") || lowerAnchor.includes("2160p")) resLabel = "Download Now 4K";

                if (resLabel) {
                  if (/\bhindi\b.*?\bline\b/i.test(lowerAnchor) || /\bhindi\b.*?\bline\b/i.test(parentLabel)) {
                    resLabel += " Hindi (Line)";
                  }
                  updatedLabel = resLabel;
                }
              }

              nestedCandidates.push({ url: href, label: updatedLabel });
            }
          });

          // Fallback raw regex for gates
          if (nestedCandidates.length === 0) {
            const rawMatches = htmlText.match(/https?:\/\/[^"'\s<>\[\]]*(?:filesdl|linkmake|hubcloud|vcloud|hubdrive|mdrive|fastdl|filepress)[^"'\s<>\[\]]*/gi) || [];
            for (const rawUrl of rawMatches) {
              const cleanUrl = rawUrl.replace(/&amp;/g, '&');
              if (!visited.has(cleanUrl) && !cleanUrl.toLowerCase().includes("gdflix") && !cleanUrl.toLowerCase().includes("failed") && !cleanUrl.toLowerCase().includes("download.php")) {
                nestedCandidates.push({ url: cleanUrl, label: parentLabel });
              }
            }
          }

          const uniqueCandidates = nestedCandidates.filter((cand, index, self) =>
            index === self.findIndex((c) => c.url === cand.url)
          );

          if (uniqueCandidates.length > 0) {
            const subResults = await Promise.all(
              uniqueCandidates.map((cand) =>
                resolveFilmyGoLink(cand.url, cand.label, depth + 1)
              )
            );
            const flattened = subResults.flat().filter(h => isHubCloudUrl(h.url));
            if (flattened.length > 0) {
              return flattened;
            }
          }

          // If startUrl itself is a HubCloud URL, return it; otherwise return empty array
          if (isHubCloudUrl(startUrl)) {
            return [{
              file_name: parentLabel || "HubCloud Link",
              url: normalizeDomain(startUrl),
              size: null,
              is_direct: true,
            }];
          }
          return [];
        } catch (e) {
          if (isHubCloudUrl(startUrl)) {
            return [{
              file_name: parentLabel || "HubCloud Link",
              url: normalizeDomain(startUrl),
              size: null,
              is_direct: true,
            }];
          }
          return [];
        }
      }

      const rawResults = await Promise.all(
        Array.from(fdlData.entries()).map(([fdlUrl, data]) =>
          resolveFilmyGoLink(fdlUrl, data.label, 0)
        )
      );

      let finalHits = rawResults.flat().filter((hit, index, self) => 
        isHubCloudUrl(hit.url) &&
        index === self.findIndex((t) => t.url === hit.url)
      );

      // Deduplicate Hubdrive vs Hubcloud based on file_name
      const dedupedHits: any[] = [];
      const seenFiles = new Map<string, string>();
      
      for (const hit of finalHits) {
         const isHubdrive = hit.url.includes('hubdrive.');
         const existing = seenFiles.get(hit.file_name);
         
         if (existing) {
             if (isHubdrive && !existing.includes('hubdrive.')) {
                 continue;
             }
             if (!isHubdrive && existing.includes('hubdrive.')) {
                 const idx = dedupedHits.findIndex(h => h.file_name === hit.file_name && h.url === existing);
                 if (idx !== -1) dedupedHits.splice(idx, 1);
                 dedupedHits.push(hit);
                 seenFiles.set(hit.file_name, hit.url);
                 continue;
             }
             continue;
         }
         
         dedupedHits.push(hit);
         seenFiles.set(hit.file_name, hit.url);
      }
      finalHits = dedupedHits;
      
      res.json({ hits: finalHits, found: finalHits.length });
    } catch (error: any) {
      console.error('FilmyGo extract error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // SkymoviesHD Extraction API
  app.get('/api/skymovieshd', async (req: express.Request, res: express.Response) => {
    try {
      let { url } = req.query;
      if (!url || typeof url !== 'string' || (!url.trim().startsWith('http') && !url.includes('.'))) {
        return res.status(400).json({ error: 'Valid SkymoviesHD URL required' });
      }

      // Clean URL
      let targetUrl = url.trim().replace(/[:\s]+$/, '');
      if (!targetUrl.startsWith('http')) {
        targetUrl = 'https://' + targetUrl;
      }

      console.log(`[SkymoviesHD] Extracting redirection links from: ${targetUrl}`);

      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Referer': targetUrl
      };

      const urlObj = new URL(targetUrl);
      const searchParam = urlObj.searchParams.get('search') || urlObj.searchParams.get('q') || urlObj.searchParams.get('s') || '';
      const isSearchUrl = targetUrl.includes('search.php') || Boolean(searchParam) || urlObj.pathname === '/' || urlObj.pathname === '' || urlObj.pathname.endsWith('index.php') || urlObj.pathname.endsWith('index.html');

      const response = await fetch(targetUrl, { headers, signal: AbortSignal.timeout(7000) });
      if (!response.ok) throw new Error(`SkymoviesHD returned ${response.status}`);
      const text = await response.text();
      const $ = cheerio.load(text);

      if (isSearchUrl) {
        console.log(`[SkymoviesHD] Search page detected, parsing catalog posts...`);
        const postsMap = new Map<string, { title: string; image?: string }>();

        const isDummyImg = (src?: string) => {
          if (!src) return true;
          return /arw\.gif|logo|favicon|icon|blank|default|\.gif$/i.test(src);
        };

        $("a[href]").each((_, el) => {
          let href = $(el).attr("href") || "";
          if (!href) return;
          if (href.startsWith("/")) href = urlObj.origin + href;
          if (!href.startsWith("http")) return;

          try {
            const u = new URL(href);
            const path = u.pathname;
            if (path === "/" || path.includes("search.php") || path.includes("/category/") || path.includes("/genre/") || path.includes("/tag/") || path.includes("/page/")) return;
            if (/\.(jpg|jpeg|png|gif|webp|css|js|xml|svg|zip|rar|mkv|mp4)$/i.test(path)) return;
            if (/(contact|dmca|about|privacy|disclaimer|telegram|facebook|twitter|instagram|login|register|request|site-request|how-to|howto|faq|terms|sitemap|report|help)/i.test(path)) return;

            const getImgSrc = (imgEl: any): string => {
              if (!imgEl || imgEl.length === 0) return "";
              let src =
                imgEl.attr("data-src") ||
                imgEl.attr("data-original") ||
                imgEl.attr("data-lazy-src") ||
                imgEl.attr("data-cfsrc") ||
                imgEl.attr("src") ||
                "";
              if (!src) {
                const srcset = imgEl.attr("srcset") || imgEl.attr("data-srcset");
                if (srcset) {
                  src = srcset.split(",")[0].trim().split(" ")[0];
                }
              }
              return src || "";
            };

            let title = $(el).text().trim() || $(el).attr("title") || $(el).find("img").attr("alt") || "";
            let image = getImgSrc($(el).find("img"));
            const container = $(el).closest("article, .post, .entry, .card, div, tr, td, p");
            if (!title) {
              title = container.find("h1, h2, h3, h4, .entry-title, .post-title, b, strong").text().trim();
            }
            if (isDummyImg(image)) {
              image = getImgSrc(container.find("img"));
            }
            if (isDummyImg(image)) {
              image = getImgSrc($(el).prev("img")) || getImgSrc($(el).next("img")) || getImgSrc($(el).parent().find("img"));
            }
            if (image) {
              try { image = new URL(image, targetUrl).href; } catch(e) {}
            }
            if (isDummyImg(image)) image = "";

            title = title.replace(/&#8211;/g, "-").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
            if (/(contact|dmca|about|privacy|disclaimer|telegram|facebook|twitter|instagram|login|register|request|how to|site search|search|faq|terms|sitemap|report|help)/i.test(title)) return;

            if (title && title.length > 2) {
              if (!postsMap.has(href)) {
                postsMap.set(href, { title, image: image || undefined });
              } else if (image && !postsMap.get(href)?.image) {
                postsMap.get(href)!.image = image;
              }
            }
          } catch (e) {}
        });

        const posts = Array.from(postsMap.entries()).map(([postUrl, data]) => ({ title: data.title, url: postUrl, image: data.image }));

        // Fetch real poster images for top 15 posts if image is missing/dummy
        const needPosterBatch = posts.slice(0, 15).filter(p => !p.image || isDummyImg(p.image));
        if (needPosterBatch.length > 0) {
          await Promise.all(needPosterBatch.map(async (p) => {
            try {
              const pRes = await fetch(p.url, {
                headers: { 'User-Agent': headers['User-Agent'] },
                signal: AbortSignal.timeout(2200)
              });
              if (pRes.ok) {
                const pText = await pRes.text();
                const p$ = cheerio.load(pText);
                let foundImg = "";
                p$("img").each((_, imgEl) => {
                  let src = p$(imgEl).attr("src") || p$(imgEl).attr("data-src") || p$(imgEl).attr("data-original") || "";
                  if (src && !isDummyImg(src)) {
                    try { foundImg = new URL(src, p.url).href; } catch(e) { foundImg = src; }
                    return false; // break
                  }
                });
                if (foundImg) p.image = foundImg;
              }
            } catch(e) {}
          }));
        }

        if (posts.length > 0) {
          return res.json({ is_search: true, posts, found: posts.length });
        }
      }

      const hbData = new Map<string, { label: string }>();
      const parts = text.split('<a ');
      for(let i = 1; i < parts.length; i++) {
        const p = parts[i];
        const m = p.match(/href=["']([^"']*(?:howblogs\.xyz|howblog\.xyz|sky-blogs\.xyz|sky-blog\.xyz|moviesapi|skymovies)\/[^"']*)["']/i);
        if (m) {
          const hbUrl = m[1].trim();
          
          let label = "";
          const closeAnchorIndex = p.indexOf('</a>');
          if (closeAnchorIndex !== -1) {
            const anchorContent = p.substring(0, closeAnchorIndex);
            const tagEndIndex = anchorContent.indexOf('>');
            if (tagEndIndex !== -1) {
              const innerHtml = anchorContent.substring(tagEndIndex + 1);
              label = innerHtml.replace(/<[^>]*>/g, '').trim();
            }
          }
          
          if (!label) label = "Download Link";
          label = label.replace(/&#8211;/g, '-').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
          
          hbData.set(hbUrl, { label });
        }
      }
      
      if (hbData.size === 0) {
        // Fallback: Check if page contains catalog post links
        const postsMap = new Map<string, { title: string; image?: string }>();
        $("a[href]").each((_, el) => {
          let href = $(el).attr("href") || "";
          if (!href) return;
          if (href.startsWith("/")) href = urlObj.origin + href;
          if (!href.startsWith("http")) return;

          try {
            const u = new URL(href);
            const path = u.pathname;
            if (path === "/" || path.includes("search.php") || path.includes("/category/") || path.includes("/genre/") || path.includes("/tag/") || path.includes("/page/")) return;
            if (/\.(jpg|jpeg|png|gif|webp|css|js|xml|svg|zip|rar|mkv|mp4)$/i.test(path)) return;
            if (/(contact|dmca|about|privacy|disclaimer|telegram|facebook|twitter|instagram|login|register)/i.test(path)) return;

            let title = $(el).text().trim() || $(el).attr("title") || $(el).find("img").attr("alt") || "";
            let image = $(el).find("img").attr("src") || $(el).find("img").attr("data-src") || "";
            const container = $(el).closest("article, .post, .entry, .card, div, tr, td, p");
            if (!title) {
              title = container.find("h1, h2, h3, h4, .entry-title, .post-title, b, strong").text().trim();
            }
            if (!image) {
              image = container.find("img").attr("src") || container.find("img").attr("data-src") || "";
            }
            title = title.replace(/&#8211;/g, "-").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
            if (title && title.length > 2 && !postsMap.has(href)) {
              postsMap.set(href, { title, image: image || undefined });
            }
          } catch (e) {}
        });

        const posts = Array.from(postsMap.entries()).map(([postUrl, data]) => ({ title: data.title, url: postUrl, image: data.image })).reverse();
        if (posts.length > 0) {
          return res.json({ is_search: true, posts, found: posts.length });
        }

        return res.json({ hits: [], found: 0 });
      }

      const results = await Promise.all(Array.from(hbData.keys()).map(async (hbUrl) => {
        try {
          const hbRes = await fetch(hbUrl, { headers, signal: AbortSignal.timeout(6000) });
          if (!hbRes.ok) return [];
          const hbText = await hbRes.text();
          
          const hubcloudMatch = hbText.match(/https?:\/\/[^"'\s<>\[\]]*(?:hubcloud|hubcould|hub-cloud|vcloud\.live|hubdrive|skymovies|moviesdrive|mdrive|filmygo)\.[^"'\s<>\[\]]*/gi);
          if (hubcloudMatch) {
            const sizeMatch = hbText.match(/\[?(\d+(?:\.\d+)?\s*(?:GB|MB|KB))\]?/i) || hbText.match(/Size:\s*([^<]+)/i);
            const size = sizeMatch ? (sizeMatch[1] || sizeMatch[2]).toUpperCase() : null;

            let finalName = hbData.get(hbUrl)?.label || "HubCloud Link";
            if (size) {
                const escapedSize = size.replace(/\./g, '\\.');
                finalName = finalName.replace(new RegExp(`\\[?${escapedSize}\\]?`, 'gi'), "").trim();
                finalName = finalName.replace(/[\[\]()\-_\s]+$/, "").trim();
            }

            return hubcloudMatch.map(hubUrl => ({
              file_name: finalName || "HubCloud Link",
              url: normalizeDomain(hubUrl),
              size: size,
              is_direct: true
            }));
          }
          return [];
        } catch (e) {
          return [];
        }
      }));

      let finalHits = results.flat().filter((hit, index, self) => 
        index === self.findIndex((t) => t.url === hit.url)
      );

      // Deduplicate Hubdrive vs Hubcloud based on finalName
      const dedupedHits: any[] = [];
      const seenFiles = new Map<string, string>(); // Add URL host to know which we kept
      
      for (const hit of finalHits) {
         const isHubdrive = hit.url.includes('hubdrive.');
         const existing = seenFiles.get(hit.file_name);
         
         if (existing) {
             if (isHubdrive && !existing.includes('hubdrive.')) {
                 continue;
             }
             if (!isHubdrive && existing.includes('hubdrive.')) {
                 const idx = dedupedHits.findIndex(h => h.file_name === hit.file_name && h.url === existing);
                 if (idx !== -1) dedupedHits.splice(idx, 1);
                 dedupedHits.push(hit);
                 seenFiles.set(hit.file_name, hit.url);
                 continue;
             }
             continue;
         }
         
         dedupedHits.push(hit);
         seenFiles.set(hit.file_name, hit.url);
      }
      finalHits = dedupedHits;
      
      res.json({ hits: finalHits, found: finalHits.length });
    } catch (error: any) {
      console.error('SkymoviesHD extract error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Helper to purge old FCM tokens for a user so that only 1 active device receives push notifications
  async function cleanupOldUserFcmTokens(
    firestore: admin.firestore.Firestore,
    userId: string,
    currentToken: string
  ) {
    if (!userId || userId === "anonymous") return [];

    const oldTokens: string[] = [];

    try {
      if (currentToken === "DUMMY_NONE") {
        // User logout or deletion: do NOT re-create the user doc or scan all chunks
        return oldTokens;
      }

      // Check user document for existing previous token
      const userDocRef = firestore.collection("users").doc(userId);
      const userSnap = await userDocRef.get();
      if (userSnap.exists) {
        const userData = userSnap.data() || {};
        const previousToken = userData.fcmToken;
        if (previousToken && previousToken !== currentToken && admin.apps.length > 0) {
          oldTokens.push(previousToken);
          try {
            await admin.messaging().unsubscribeFromTopic(previousToken, "all_users");
          } catch (e) {}
          try {
            await admin.messaging().unsubscribeFromTopic(previousToken, `user_${userId}`);
          } catch (e) {}
        }
      }

      // Update user document in Firestore with single active fcmToken
      await userDocRef
        .set(
          {
            fcmToken: currentToken,
            fcmTokenUpdatedAt: new Date().toISOString(),
          },
          { merge: true }
        )
        .catch(() => {});
    } catch (err) {
      console.warn(`[FCM Token Cleanup Error] user ${userId}:`, err);
    }

    return oldTokens;
  }

  // Subscribe to FCM topic & enforce single device token per user
  app.post(
    ["/api/notifications/subscribe", "/notifications/subscribe"],
    async (req, res) => {
      try {
        const { token, userId } = req.body;
        if (!token) return res.status(400).json({ error: "Token required" });

        // Check if messaging is available (requires service account)
        try {
          if (admin.apps.length === 0) {
            throw new Error("Firebase Admin not initialized");
          }

          // Cleanup previous tokens for this user to ensure only 1 active device receives notifications
          if (userId && db) {
            await cleanupOldUserFcmTokens(db, userId, token);
          }

          await admin.messaging().subscribeToTopic(token, "all_users");
          
          if (userId) {
            await admin.messaging().subscribeToTopic(token, `user_${userId}`);
          }
          
          res.json({ success: true });
        } catch (fcmError: any) {
          const isAuthError =
            fcmError.message.includes("401") ||
            fcmError.message.includes("authentication");
          console.warn(
            `FCM Subscription failed: ${fcmError.message}${isAuthError ? " (This usually means a Service Account Key is missing or invalid in the environment)" : ""}`,
          );
          // Return success anyway to avoid client-side errors, as we can't fix this without user action
          res.json({
            success: true,
            warning: "FCM not fully configured",
            details: fcmError.message,
          });
        }
      } catch (error) {
        console.error("Error in subscribe endpoint:", error);
        res.status(500).json({ error: "Internal Server Error" });
      }
    },
  );

  // Unsubscribe FCM token / remove tokens on logout or user deletion
  app.post(
    ["/api/notifications/unsubscribe", "/notifications/unsubscribe"],
    async (req, res) => {
      try {
        const { token, userId } = req.body;
        if (!token && !userId) return res.status(400).json({ error: "Token or userId required" });

        if (admin.apps.length > 0 && token) {
          try { await admin.messaging().unsubscribeFromTopic(token, "all_users"); } catch (e) {}
          if (userId) {
            try { await admin.messaging().unsubscribeFromTopic(token, `user_${userId}`); } catch (e) {}
          }
        }
        res.json({ success: true });
      } catch (error) {
        console.error("Error in unsubscribe endpoint:", error);
        res.status(500).json({ error: "Internal Server Error" });
      }
    },
  );

  // Send FCM notification
  app.post(
    ["/api/notifications/send", "/notifications/send"],
    async (req, res) => {
      try {
        const { title, body, imageUrl, url, buttonUrl, targetUserIds } = req.body;
        const targetUrl = buttonUrl || url || "/";

        try {
          if (Array.isArray(targetUserIds) && targetUserIds.length > 0) {
            const messages: any[] = targetUserIds.map((uid: string) => ({
              notification: {
                title,
                body,
                imageUrl: imageUrl || undefined,
              },
              data: {
                title,
                body,
                imageUrl: imageUrl || "",
                url: targetUrl,
                link: targetUrl,
                click_action: targetUrl,
              },
              webpush: {
                fcmOptions: {
                  link: targetUrl,
                },
                notification: {
                  title,
                  body,
                  icon: imageUrl || "/launcher.svg",
                  badge: "/launcher.svg",
                  image: imageUrl || undefined,
                  data: {
                    url: targetUrl,
                    link: targetUrl,
                    click_action: targetUrl,
                  },
                },
              },
              topic: `user_${uid}`,
            }));
            
            let successCount = 0;
            let failureCount = 0;
            
            for (let i = 0; i < messages.length; i += 500) {
              const batch = messages.slice(i, i + 500);
              const response = await admin.messaging().sendEach(batch);
              successCount += response.successCount;
              failureCount += response.failureCount;
            }
            res.json({ success: true, successCount, failureCount });
          } else {
            const message: any = {
              notification: {
                title,
                body,
                imageUrl: imageUrl || undefined,
              },
              data: {
                title,
                body,
                imageUrl: imageUrl || "",
                url: targetUrl,
                link: targetUrl,
                click_action: targetUrl,
              },
              webpush: {
                fcmOptions: {
                  link: targetUrl,
                },
                notification: {
                  title,
                  body,
                  icon: imageUrl || "/launcher.svg",
                  badge: "/launcher.svg",
                  image: imageUrl || undefined,
                  data: {
                    url: targetUrl,
                    link: targetUrl,
                    click_action: targetUrl,
                  },
                },
              },
              topic: "all_users",
            };

            const response = await admin.messaging().send(message);
            res.json({ success: true, messageId: response });
          }
        } catch (fcmError: any) {
          console.error("FCM Send failed:", fcmError.message);
          res.status(500).json({
            error: "FCM not configured or failed",
            details: fcmError.message,
          });
        }
      } catch (error) {
        console.error("Error in send notification endpoint:", error);
        res.status(500).json({ error: "Internal Server Error" });
      }
    },
  );

  // Expiry notifications trigger endpoint (checks target users for expired membership)
  app.post(
    ["/api/notifications/check-expiry", "/notifications/check-expiry"],
    async (req, res) => {
      try {
        const { targetUserId, targetUserIds, adminUid } = req.body || {};
        const uids = targetUserIds || targetUserId || req.query.userId?.toString();

        if (adminUid) {
          const adminDoc = await db.collection("users").doc(adminUid).get();
          if (!adminDoc.exists) {
            return res.status(403).json({ error: "Unauthorized" });
          }
          const adminRole = adminDoc.data()?.role;
          if (adminRole !== "admin" && adminRole !== "owner") {
            return res.status(403).json({ error: "Unauthorized: Only Admin or Owner can trigger expiry notifications" });
          }
        }

        const result = await checkAndSendExpiryNotifications(uids, true);
        res.json({ success: true, ...result });
      } catch (error: any) {
        console.error("Error checking expiry notifications:", error);
        res.status(500).json({ error: error.message || "Failed to check expiry notifications" });
      }
    },
  );

  // Membership update notification endpoint
  app.post(
    ["/api/notifications/notify-membership-update", "/notifications/notify-membership-update"],
    async (req, res) => {
      try {
        const { userId, newExpiryDate, previousExpiryDate, role, status, adminName } = req.body || {};
        if (!userId || !newExpiryDate) {
          return res.status(400).json({ error: "Missing required fields: userId and newExpiryDate" });
        }
        const result = await sendMembershipUpdateNotification({
          userId,
          newExpiryDate,
          previousExpiryDate,
          role,
          status,
          adminName,
        });
        res.json(result);
      } catch (error: any) {
        console.error("Error sending membership update notification:", error);
        res.status(500).json({ error: error.message || "Failed to send membership update notification" });
      }
    },
  );

  // Order Approved notification endpoint
  app.post(
    ["/api/notifications/notify-order-approved", "/notifications/notify-order-approved"],
    async (req, res) => {
      try {
        const { userId, orderId, orderType, newExpiryDate } = req.body || {};
        if (!userId || !orderId || !orderType) {
          return res.status(400).json({ error: "Missing required fields" });
        }
        const result = await sendOrderApprovedNotification({
          userId,
          orderId,
          orderType,
          newExpiryDate,
        });
        res.json(result);
      } catch (error: any) {
        console.error("Error sending order approved notification:", error);
        res.status(500).json({ error: error.message || "Failed to send notification" });
      }
    },
  );

  // Admin Reset Password
  app.post(
    ["/api/admin/reset-password", "/admin/reset-password"],
    async (req, res) => {
      try {
        const { uid, adminUid } = req.body;
        if (!uid || !adminUid)
          return res.status(400).json({ error: "Missing uid or adminUid" });

        // Verify admin
        const adminDoc = await db.collection("users").doc(adminUid).get();
        if (
          !adminDoc.exists ||
          (adminDoc.data()?.role !== "admin" &&
            adminDoc.data()?.role !== "owner")
        ) {
          return res.status(403).json({ error: "Unauthorized" });
        }

        // Reset password to default and set flag
        const defaultPassword = "moviznow123";
        await admin.auth().updateUser(uid, { password: defaultPassword });
        await db
          .collection("users")
          .doc(uid)
          .update({ requirePasswordReset: true });

        res.json({ success: true, message: "Password reset to moviznow123" });
      } catch (error) {
        console.error("Admin Reset Password Error:", error);
        res.status(500).json({ error: "Internal Server Error" });
      }
    },
  );

  app.post("/api/admin/users/delete", async (req, res) => {
    try {
      const { uid, uids, adminUid } = req.body;
      const targetUids: string[] = Array.isArray(uids)
        ? uids
        : uid
        ? [uid]
        : [];
      if (targetUids.length === 0 || !adminUid)
        return res.status(400).json({ error: "Missing uid/uids or adminUid" });

      // Verify admin
      const adminDoc = await db.collection("users").doc(adminUid).get();
      if (
        !adminDoc.exists ||
        (adminDoc.data()?.role !== "admin" &&
          adminDoc.data()?.role !== "owner")
      ) {
        return res.status(403).json({ error: "Unauthorized" });
      }

      // Delete user(s) from Firebase Auth
      const results = await Promise.allSettled(
        targetUids.map((u) => admin.auth().deleteUser(u))
      );

      const deletedCount = results.filter((r) => r.status === "fulfilled").length;
      const failedCount = results.filter((r) => r.status === "rejected").length;

      res.json({ success: true, deletedCount, failedCount });
    } catch (error) {
      console.error("Admin Delete User Error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  function formatBytes(bytes?: number) {
    if (!bytes || Number.isNaN(bytes)) return undefined;
    const units = ["B", "KB", "MB", "GB", "TB"];
    let size = bytes;
    let unit = 0;
    while (size >= 1000 && unit < units.length - 1) {
      size /= 1000;
      unit++;
    }
    return `${size >= 100 ? size.toFixed(0) : size >= 10 ? size.toFixed(1) : size.toFixed(2)} ${units[unit]}`;
  }

  // Advanced Link Checker API
  const checkLinkCache = new Map<string, { data: any, timestamp: number }>();
  const CHECK_LINK_CACHE_TTL = 10 * 60 * 1000; // 10 minutes cache

  app.post(["/api/check-link", "/check-link"], async (req, res) => {
    try {
      const { url } = req.body;
      if (!url || typeof url !== "string") {
        return res
          .status(400)
          .json({ ok: false, statusLabel: "BROKEN", message: "Missing URL" });
      }

      const cacheKey = url;
      const cached = checkLinkCache.get(cacheKey);
      if (!req.body.force && cached && Date.now() - cached.timestamp < CHECK_LINK_CACHE_TTL) {
         return res.json(cached.data);
      }

      const originalJson = res.json.bind(res);
      res.json = (data: any) => {
        if (data && data.ok === true && data.statusLabel === "WORKING") {
          checkLinkCache.set(cacheKey, { data, timestamp: Date.now() });
        }
        return originalJson(data);
      };


      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        return res
          .status(400)
          .json({ ok: false, statusLabel: "BROKEN", message: "Invalid URL" });
      }

      let currentUrl = url;
      let currentHost = parsed.hostname.replace(/^www\./, "");
      let currentParsed = parsed;

      const headers = {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      };

      // Try to resolve redirects first if it's not already a known special host
      if (
        !currentHost.includes("pixeldrain.com") &&
        !currentHost.includes("pixeldrain.dev") &&
        !currentHost.includes("raj.lat")
      ) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 8000);
          const redirectCheck = await fetch(currentUrl, {
            method: "HEAD",
            headers,
            redirect: "follow",
            signal: controller.signal,
          });
          clearTimeout(timeout);
          if (redirectCheck.url && redirectCheck.url !== currentUrl) {
            currentUrl = redirectCheck.url;
            currentParsed = new URL(currentUrl);
            currentHost = currentParsed.hostname.replace(/^www\./, "");
          }
        } catch (e) {
          try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 8000);
            const redirectCheckGet = await fetch(currentUrl, {
              method: "GET",
              headers: { ...headers, Range: "bytes=0-0" },
              redirect: "follow",
              signal: controller.signal,
            });
            clearTimeout(timeout);
            if (redirectCheckGet.url && redirectCheckGet.url !== currentUrl) {
              currentUrl = redirectCheckGet.url;
              currentParsed = new URL(currentUrl);
              currentHost = currentParsed.hostname.replace(/^www\./, "");
            }
          } catch (e2) {}
        }
      }

      // PIXELDRAIN SPECIAL CHECK
      if (
        currentHost.includes("pixeldrain.com") ||
        currentHost.includes("pixeldrain.dev") ||
        currentHost.includes("pixeldrain.net")
      ) {
        const match = currentParsed.pathname.match(/\/u\/([^/?#]+)/);
        if (match?.[1]) {
          const fileId = match[1];
          try {
            const infoRes = await fetch(
              `https://pixeldrain.com/api/file/${fileId}/info`,
              {
                method: "GET",
                headers: {
                  ...headers,
                  Accept: "application/json,text/plain,*/*",
                },
              },
            );

            if (infoRes.status === 404) {
              return res.json({
                ok: false,
                status: 404,
                statusLabel: "BROKEN",
                message: "Pixeldrain file not found or deleted",
                finalUrl: currentUrl,
                source: "pixeldrain-api",
                host: currentHost,
              });
            }

            if (infoRes.status === 429) {
              return res.json({
                ok: false,
                status: 429,
                statusLabel: "UNAVAILABLE",
                message: "Pixeldrain temporarily unavailable or rate-limited",
                finalUrl: currentUrl,
                source: "pixeldrain-api",
                host: currentHost,
              });
            }

            if (infoRes.ok) {
              const data: any = await infoRes.json();

              const dlRes = await fetch(
                `https://pixeldrain.com/api/file/${fileId}`,
                {
                  method: "GET",
                  headers: { ...headers, Range: "bytes=0-0" },
                  redirect: "manual",
                },
              ).catch(() => null);

              const contentType =
                dlRes?.headers.get("content-type") || "pixeldrain/file";
              const disposition =
                dlRes?.headers.get("content-disposition") || "";
              const contentLength = dlRes?.headers.get("content-length");
              const fileSize =
                typeof data?.size === "number"
                  ? data.size
                  : contentLength
                    ? Number(contentLength)
                    : undefined;
              const fileSizeText = formatBytes(fileSize);
              const fileNameMatch = disposition.match(
                /filename\*?=(?:UTF-8'')?"?([^";]+)/i,
              );
              const fileName =
                data?.name ||
                (fileNameMatch?.[1]
                  ? decodeURIComponent(fileNameMatch[1])
                  : undefined);

              if (!dlRes) {
                return res.json({
                  ok: false,
                  statusLabel: "UNAVAILABLE",
                  message:
                    "Pixeldrain metadata exists but file is temporarily unavailable.",
                  finalUrl: currentUrl,
                  contentType,
                  isDirectDownload: false,
                  fileName,
                  fileSize,
                  fileSizeText,
                  source: "pixeldrain-download-probe",
                  host: currentHost,
                });
              }

              if (dlRes.status === 403 || dlRes.status === 451) {
                return res.json({
                  ok: false,
                  status: dlRes.status,
                  statusLabel: "UNAVAILABLE",
                  message:
                    "Pixeldrain file exists but is not available for download right now.",
                  finalUrl: currentUrl,
                  contentType,
                  isDirectDownload: false,
                  fileName,
                  fileSize,
                  fileSizeText,
                  source: "pixeldrain-download-probe",
                  host: currentHost,
                });
              }

              if (dlRes.ok || dlRes.status === 206 || dlRes.status === 302) {
                return res.json({
                  ok: true,
                  status: dlRes.status || 200,
                  statusLabel: "WORKING",
                  message: fileName
                    ? `Pixeldrain file available: ${fileName}`
                    : "Pixeldrain file is available",
                  finalUrl: currentUrl,
                  contentType,
                  isDirectDownload: true,
                  fileName,
                  fileSize,
                  fileSizeText,
                  source: "pixeldrain-api+download-probe",
                  host: currentHost,
                });
              }

              return res.json({
                ok: false,
                status: dlRes.status,
                statusLabel: "UNAVAILABLE",
                message:
                  "Pixeldrain file metadata exists, but download appears unavailable.",
                finalUrl: currentUrl,
                contentType,
                isDirectDownload: false,
                fileName,
                fileSize,
                fileSizeText,
                source: "pixeldrain-api+download-probe",
                host: currentHost,
              });
            }
          } catch {
            return res.json({
              ok: false,
              statusLabel: "UNAVAILABLE",
              message: "Pixeldrain could not be verified right now.",
              finalUrl: currentUrl,
              source: "pixeldrain-api",
              host: currentHost,
            });
          }
        }
      }

      // RAJ / GATE CHECK
      if (currentHost === "hub.raj.lat" || currentHost.endsWith(".raj.lat")) {
        try {
          const fetchRes = await fetch(currentUrl, {
            method: "GET",
            headers,
            redirect: "manual",
          });
          const location = fetchRes.headers.get("location") || undefined;
          const contentType = fetchRes.headers.get("content-type") || undefined;
          const disposition = fetchRes.headers.get("content-disposition") || "";
          const contentLength = fetchRes.headers.get("content-length");
          const fileSize = contentLength ? Number(contentLength) : undefined;
          const fileSizeText = formatBytes(fileSize);
          const isAttachment = /attachment/i.test(disposition);
          const isFileType =
            !!contentType && !/text\/html|application\/json/i.test(contentType);
          const isPartial = fetchRes.status === 206;
          const isDirectDownload = isAttachment || isFileType || isPartial;
          const fileNameMatch = disposition.match(
            /filename\*?=(?:UTF-8'')?"?([^";]+)/i,
          );
          const fileName = fileNameMatch?.[1]
            ? decodeURIComponent(fileNameMatch[1])
            : undefined;

          if (isDirectDownload && (fetchRes.ok || isPartial)) {
            return res.json({
              ok: true,
              status: fetchRes.status,
              statusLabel: "WORKING",
              message: "Valid direct file / download link detected.",
              finalUrl: currentUrl,
              contentType,
              isDirectDownload: true,
              fileName,
              fileSize,
              fileSizeText,
              source: "download-detect",
              host: currentHost,
            });
          }

          if (fetchRes.status >= 300 && fetchRes.status < 400) {
            return res.json({
              ok: true,
              status: fetchRes.status,
              statusLabel: "REDIRECT",
              message: "Protected redirect link is alive",
              finalUrl: location || currentUrl,
              contentType,
              source: "redirect-probe",
              host: currentHost,
            });
          }

          const html = await fetchRes.text().catch(() => "");
          const lower = html.toLowerCase();
          if (
            lower.includes("not found") ||
            lower.includes("invalid link") ||
            lower.includes("link expired") ||
            lower.includes("expired") ||
            lower.includes("404")
          ) {
            return res.json({
              ok: false,
              status: fetchRes.status || 404,
              statusLabel: "BROKEN",
              message:
                "Protected link exists but target appears invalid or expired",
              finalUrl: currentUrl,
              contentType,
              source: "html-scan",
              host: currentHost,
            });
          }
          if (
            lower.includes("cloudflare") ||
            lower.includes("checking your browser") ||
            lower.includes("captcha") ||
            lower.includes("access denied") ||
            lower.includes("forbidden")
          ) {
            return res.json({
              ok: true,
              status: fetchRes.status || 200,
              statusLabel: "PROTECTED",
              message: "Link is alive but protected by anti-bot or gateway",
              finalUrl: currentUrl,
              contentType,
              source: "protection-detect",
              host: currentHost,
            });
          }
          if (fetchRes.ok) {
            return res.json({
              ok: true,
              status: fetchRes.status,
              statusLabel: "WORKING",
              message: "Protected landing page is reachable",
              finalUrl: currentUrl,
              contentType,
              source: "html-scan",
              host: currentHost,
            });
          }
        } catch {}
      }

      // GENERAL CHECK
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 12000);

        let res_fetch: Response;
        try {
          res_fetch = await fetch(currentUrl, {
            method: "HEAD",
            headers,
            redirect: "follow",
            signal: controller.signal,
          });
          if (!res_fetch.ok || res_fetch.status === 405) {
            const getController = new AbortController();
            const getTimeout = setTimeout(() => getController.abort(), 12000);
            res_fetch = await fetch(currentUrl, {
              method: "GET",
              headers: { ...headers, Range: "bytes=0-0" },
              redirect: "follow",
              signal: getController.signal,
            });
            clearTimeout(getTimeout);
          }
        } catch (fetchErr) {
          clearTimeout(timeout);
          return res.json({
            ok: false,
            statusLabel: "UNKNOWN",
            message: "Network error or timeout reaching host",
            finalUrl: currentUrl,
            source: "general-check",
            host: currentHost,
          });
        }

        clearTimeout(timeout);

        const contentType = res_fetch.headers.get("content-type") || undefined;
        const disposition = res_fetch.headers.get("content-disposition") || "";
        const contentLength = res_fetch.headers.get("content-length");
        const fileSize = contentLength ? Number(contentLength) : undefined;
        const fileSizeText = formatBytes(fileSize);
        const isAttachment = /attachment/i.test(disposition);
        const isFileType =
          !!contentType && !/text\/html|application\/json/i.test(contentType);
        const isPartial = res_fetch.status === 206;
        const isDirectDownload = isAttachment || isFileType || isPartial;
        const fileNameMatch = disposition.match(
          /filename\*?=(?:UTF-8'')?"?([^";]+)/i,
        );
        const fileName = fileNameMatch?.[1]
          ? decodeURIComponent(fileNameMatch[1])
          : undefined;

        if (res_fetch.ok || res_fetch.status === 206) {
          return res.json({
            ok: true,
            status: res_fetch.status,
            statusLabel: "WORKING",
            message: isDirectDownload
              ? "Valid direct file / download link detected."
              : "Link is reachable",
            finalUrl: res_fetch.url,
            contentType,
            isDirectDownload,
            fileName,
            fileSize,
            fileSizeText,
            source: "general-check",
            host: currentHost,
          });
        }

        return res.json({
          ok: false,
          status: res_fetch.status,
          statusLabel: "BROKEN",
          message: `HTTP ${res_fetch.status}`,
          finalUrl: res_fetch.url || currentUrl,
          contentType,
          source: "general-check",
          host: currentHost,
        });
      } catch {
        return res.json({
          ok: false,
          statusLabel: "UNKNOWN",
          message: "Could not verify this host",
          finalUrl: currentUrl,
          source: "general-check",
          host: currentHost,
        });
      }
    } catch (error) {
      console.error("Check Link Error:", error);
      res.status(500).json({
        ok: false,
        statusLabel: "UNKNOWN",
        message: "Unexpected server error",
      });
    }
  });

  // Helper to fetch movie details and generate OG tags
  const getOgTags = async (req: express.Request) => {
    const urlPath = req.originalUrl;
    let host = req.get("host") || req.get("x-forwarded-host") || "";
    if (host.includes(",")) {
      host = host.split(",")[0].trim();
    }
    
    // Fallback to VERCEL_URL if we are on Vercel and host is empty or points to localhost
    if ((!host || host.includes("localhost") || host.includes("127.0.0.1") || host.includes("0.0.0.0") || host.includes("::1")) && process.env.VERCEL_URL) {
      host = process.env.VERCEL_URL;
    }
    
    // Force HTTPS for all production environments to satisfy strict social card requirements (WhatsApp, Facebook, Twitter, Discord)
    const isLocalhost = host.includes("localhost") || host.includes("127.0.0.1") || host.includes("0.0.0.0") || host.includes("::1");
    const protocol = isLocalhost ? "http" : "https";
    const baseUrl = `${protocol}://${host}`;

    const hasRef = req.query.ref || urlPath.includes("ref=");

    let title = "MovizNow - Premium Movies & Series";
    let description =
      "Watch the latest movies and series on MovizNow. Your ultimate entertainment destination.";
    let image = `${baseUrl}/moviznow_share_banner.jpg`; // Use our beautiful banner as the default social share preview image

    if (hasRef) {
      title = "Join MovizNow - Premium Movies & Series";
      description =
        "Get 5 Days of premium membership for free on MovizNow! Watch and download your favorite movies and series.";
    }

    const movieMatch = urlPath.match(/^\/movie\/([^/?]+)/);
    if (movieMatch) {
      const movieId = movieMatch[1];
      try {
        const { projectId, firestoreDatabaseId, apiKey } = firebaseConfig;
        const dbId = firestoreDatabaseId || "(default)";
        const apiUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${dbId}/documents/content/${movieId}?key=${apiKey}`;

        const response = await fetch(apiUrl);
        if (response.ok) {
          const data = await response.json();
          if (data.fields) {
            const movieTitle = data.fields.title?.stringValue || "";
            const year =
              data.fields.year?.integerValue ||
              data.fields.year?.stringValue ||
              "";
            const type = data.fields.type?.stringValue || "movie";

            // Fetch genres if available
            let genreNames = "";
            if (data.fields.genreIds?.arrayValue?.values) {
              try {
                const genresUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${dbId}/documents/genres?key=${apiKey}`;
                const genresResponse = await fetch(genresUrl);
                if (genresResponse.ok) {
                  const genresData = await genresResponse.json();
                  if (genresData.documents) {
                    const genreIds = data.fields.genreIds.arrayValue.values.map(
                      (v: any) => v.stringValue,
                    );
                    const matchedGenres = genresData.documents
                      .filter((doc: any) =>
                        genreIds.includes(doc.name.split("/").pop()),
                      )
                      .map((doc: any) => doc.fields.name?.stringValue)
                      .filter(Boolean);
                    if (matchedGenres.length > 0) {
                      genreNames = matchedGenres.join(", ");
                    }
                  }
                }
              } catch (e) {
                console.error("Error fetching genres for OG tags:", e);
              }
            }

            // Fetch languages if available
            let languageNames = "";
            if (data.fields.languageIds?.arrayValue?.values) {
              try {
                const langsUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${dbId}/documents/languages?key=${apiKey}`;
                const langsResponse = await fetch(langsUrl);
                if (langsResponse.ok) {
                  const langsData = await langsResponse.json();
                  if (langsData.documents) {
                    const langIds =
                      data.fields.languageIds.arrayValue.values.map(
                        (v: any) => v.stringValue,
                      );
                    const matchedLangs = langsData.documents
                      .filter((doc: any) =>
                        langIds.includes(doc.name.split("/").pop()),
                      )
                      .map((doc: any) => doc.fields.name?.stringValue)
                      .filter(Boolean);
                    if (matchedLangs.length > 0) {
                      languageNames = matchedLangs.join(", ");
                    }
                  }
                }
              } catch (e) {
                console.error("Error fetching languages for OG tags:", e);
              }
            }

            title = `${movieTitle} ${year ? `(${year})` : ""} - MovizNow`;

            const descParts = [];
            if (type)
              descParts.push(type.charAt(0).toUpperCase() + type.slice(1));
            if (genreNames) descParts.push(genreNames);
            if (languageNames) descParts.push(`Languages: ${languageNames}`);

            description =
              descParts.join(" | ") +
              ". " +
              (data.fields.description?.stringValue || "");

            if (data.fields.posterUrl?.stringValue) {
              image = data.fields.posterUrl.stringValue;
              // Ensure image is absolute
              if (image.startsWith("/")) {
                image = `${baseUrl}${image}`;
              }
            }
          }
        }
      } catch (error) {
        console.error("Error fetching movie for OG tags:", error);
      }
    }

    const imageType = image.toLowerCase().includes(".png") ? "image/png" : "image/jpeg";

    return `
      <meta property="og:title" content="${title.replace(/"/g, "&quot;")}" />
      <meta property="og:description" content="${description.replace(/"/g, "&quot;").slice(0, 200)}..." />
      <meta property="og:image" content="${image}" />
      <meta property="og:image:secure_url" content="${image}" />
      <meta property="og:image:type" content="${imageType}" />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:type" content="website" />
      <meta property="og:url" content="${baseUrl}${urlPath}" />
      <meta property="og:site_name" content="MovizNow" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content="${title.replace(/"/g, "&quot;")}" />
      <meta name="twitter:description" content="${description.replace(/"/g, "&quot;").slice(0, 200)}..." />
      <meta name="twitter:image" content="${image}" />
    `;
  };

  const normalizeData = (data: any): any => {
    if (!data) return data;

    // Handle Firestore Timestamps
    if (
      data &&
      typeof data === "object" &&
      "_seconds" in data &&
      "_nanoseconds" in data
    ) {
      return new Date(data._seconds * 1000).toISOString();
    }
    if (data && typeof data.toDate === "function") {
      return data.toDate().toISOString();
    }

    if (Array.isArray(data)) {
      return data.map(normalizeData);
    }

    if (typeof data === "object") {
      const normalized: any = {};
      Object.keys(data)
        .sort()
        .forEach((key) => {
          normalized[key] = normalizeData(data[key]);
        });
      return normalized;
    }

    return data;
  };

  const areDocsEqual = (doc1: any, doc2: any) => {
    const d1 = { ...doc1 };
    const d2 = { ...doc2 };

    // Ignore metadata fields for content comparison
    delete d1.updatedAt;
    delete d1.createdAt;
    delete d1.id;
    delete d2.updatedAt;
    delete d2.createdAt;
    delete d2.id;

    return (
      JSON.stringify(normalizeData(d1)) === JSON.stringify(normalizeData(d2))
    );
  };

  app.use(linkExtractionRouter);

  // Sync Endpoints
  app.post("/api/sync/status", async (req, res) => {
    try {
      const { sourceKey, targetKey, targetDbId } = req.body;
      const { sourceApp, targetApp } = await getSyncApps(
        sourceKey,
        targetKey,
        targetDbId,
      );

      res.json({
        sourceConnected: !!sourceApp,
        targetConnected: !!targetApp,
        sourceKeyExists: !!sourceKey,
        targetKeyExists: !!targetKey,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/sync/compare", async (req, res) => {
    try {
      const { sourceKey, targetKey, targetDbId, onlyPublished, syncAllData } =
        req.body;
      const {
        sourceApp,
        targetApp,
        targetDbId: tDbId,
      } = await getSyncApps(sourceKey, targetKey, targetDbId);
      if (!sourceApp || !targetApp) {
        return res
          .status(400)
          .json({ error: "Service account keys missing or invalid" });
      }

      const sourceDb = getFirestore(
        sourceApp,
        (firebaseConfig as any).firestoreDatabaseId,
      );
      const targetDb = getFirestore(targetApp, tDbId || "(default)");

      console.log(
        `Comparing source DB (${(firebaseConfig as any).firestoreDatabaseId}) with target DB (${targetDbId || "default"})`,
      );

      let collections = [
        "genres",
        "languages",
        "qualities",
        "content_chunks",
        "chunk_meta",
        "collections",
        "collection_chunks"
      ];
      if (syncAllData) {
        const sourceCols = (await sourceDb.listCollections()).map(c => c.id);
        const targetCols = (await targetDb.listCollections()).map(c => c.id);
        collections = Array.from(new Set([...sourceCols, ...targetCols]));
      }
      const results: any = {};

      for (const colName of collections) {
        let sourceSnap = await sourceDb.collection(colName).get();
        let targetSnap = await targetDb.collection(colName).get();

        let sourceDocs = sourceSnap.docs.map((d) => {
          const data = d.data();
          if (colName === "chunk_meta" && d.id === "versions" && !syncAllData) {
            delete data.users; // Ignore users in compare if not syncing all data
          }
          return { id: d.id, ...data };
        });
        let targetDocs = targetSnap.docs.map((d) => {
          const data = d.data();
          if (colName === "chunk_meta" && d.id === "versions" && !syncAllData) {
            delete data.users; // Ignore users in compare if not syncing all data
          }
          return { id: d.id, ...data };
        });

        if (onlyPublished && colName === "content") {
          sourceDocs = sourceDocs.filter((d: any) => d.status === "published");
          targetDocs = targetDocs.filter((d: any) => d.status === "published");
        }

        const sourceMap = new Map(sourceDocs.map((d) => [d.id, d]));
        const targetMap = new Map(targetDocs.map((d) => [d.id, d]));

        const diffs: any[] = [];

        sourceDocs.forEach((sDoc: any) => {
          const tDoc: any = targetMap.get(sDoc.id);
          if (!tDoc) {
            diffs.push({
              id: sDoc.id,
              title: sDoc.title || sDoc.name || sDoc.id,
              type: "missing_in_target",
              sourceData: sDoc,
              targetData: null,
            });
          } else {
            if (!areDocsEqual(sDoc, tDoc)) {
              diffs.push({
                id: sDoc.id,
                title: sDoc.title || sDoc.name || sDoc.id,
                type: "different",
                sourceData: sDoc,
                targetData: tDoc,
              });
            }
          }
        });

        targetDocs.forEach((tDoc: any) => {
          if (!sourceMap.has(tDoc.id)) {
            diffs.push({
              id: tDoc.id,
              title: tDoc.title || tDoc.name || tDoc.id,
              type: "missing_in_source",
              sourceData: null,
              targetData: tDoc,
            });
          }
        });

        results[colName] = diffs;
      }

      res.json(results);
    } catch (error: any) {
      console.error("Sync Compare Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/sync/push", async (req, res) => {
    try {
      const {
        sourceKey,
        targetKey,
        targetDbId,
        mode,
        specificIds,
        onlyPublished,
        syncAllData,
      } = req.body;
      const {
        sourceApp,
        targetApp,
        targetDbId: tDbId,
      } = await getSyncApps(sourceKey, targetKey, targetDbId);
      if (!sourceApp || !targetApp)
        return res.status(400).json({ error: "Keys missing" });

      const sourceDb = getFirestore(
        sourceApp,
        (firebaseConfig as any).firestoreDatabaseId,
      );
      const targetDb = getFirestore(targetApp, tDbId || "(default)");

      console.log(
        `Starting push: source (${(firebaseConfig as any).firestoreDatabaseId}) -> target (${tDbId || "default"}), mode: ${mode}, specificIds: ${specificIds ? Object.keys(specificIds).length : "none"}, syncAllData: ${syncAllData}`,
      );

      let collections = [
        "genres",
        "languages",
        "qualities",
        "content_chunks",
        "chunk_meta",
        "collections",
        "collection_chunks"
      ];
      if (syncAllData) {
        const sourceCols = (await sourceDb.listCollections()).map(c => c.id);
        const targetCols = (await targetDb.listCollections()).map(c => c.id);
        collections = Array.from(new Set([...sourceCols, ...targetCols]));
      }
      const logs: string[] = [];

      for (const colName of collections) {
        let docsToSync: any[] = [];
        let docsToDeleteFromTarget: string[] = [];

        if (specificIds && specificIds[colName]) {
          const ids = specificIds[colName];
          for (const id of ids) {
            const doc = await sourceDb.collection(colName).doc(id).get();
            if (doc.exists) docsToSync.push(doc);
          }
        } else {
          const sourceSnap = await sourceDb.collection(colName).get();
          docsToSync = sourceSnap.docs;

          if (mode === "all") {
            // Full content sync push: If any doc exists in target but is missing from source (e.g. deleted user or content), delete it from target
            const targetSnap = await targetDb.collection(colName).get();
            const sourceIds = new Set(sourceSnap.docs.map((d) => d.id));

            targetSnap.docs.forEach((tDoc) => {
              if (!sourceIds.has(tDoc.id)) {
                if (colName === "chunk_meta" && tDoc.id === "versions" && !syncAllData) {
                  return; // Preserve versions metadata if not syncing all data
                }
                docsToDeleteFromTarget.push(tDoc.id);
              }
            });
          } else if (mode === "changed") {
            const targetSnap = await targetDb.collection(colName).get();
            const targetMap = new Map(
              targetSnap.docs.map((d) => {
                const data = d.data();
                if (
                  colName === "chunk_meta" &&
                  d.id === "versions" &&
                  !syncAllData
                ) {
                  delete data.users;
                }
                return [d.id, data];
              }),
            );
            docsToSync = docsToSync.filter((d) => {
              const sData = d.data();
              if (
                colName === "chunk_meta" &&
                d.id === "versions" &&
                !syncAllData
              ) {
                delete sData.users;
              }
              const sUpdate = normalizeData(
                sData.updatedAt || sData.createdAt || 0,
              );
              const tData = targetMap.get(d.id);
              if (!tData) return true; // Missing in target
              
              const tUpdate = normalizeData(
                tData.updatedAt || tData.createdAt || 0,
              );
              // For chunk_meta, we should just merge if not equal
              if (colName === "chunk_meta") {
                return !areDocsEqual(sData, tData);
              }
              return sUpdate !== tUpdate || !areDocsEqual(sData, tData);
            });
          } else if (mode === "missing") {
            const targetSnap = await targetDb.collection(colName).get();
            const targetIds = new Set(targetSnap.docs.map((d) => d.id));
            docsToSync = docsToSync.filter((d) => !targetIds.has(d.id));
          }
        }

        if (onlyPublished && colName === "content") {
          docsToSync = docsToSync.filter(
            (d) => d.data().status === "published",
          );
        }

        // Delete extra documents from target if full content sync push (mode === 'all')
        if (docsToDeleteFromTarget.length > 0) {
          for (let i = 0; i < docsToDeleteFromTarget.length; i += 500) {
            const batch = targetDb.batch();
            const chunk = docsToDeleteFromTarget.slice(i, i + 500);
            for (const docId of chunk) {
              batch.delete(targetDb.collection(colName).doc(docId));
            }
            await batch.commit();
          }
          logs.push(`Deleted ${docsToDeleteFromTarget.length} obsolete items from target for ${colName}`);
        }

        if (docsToSync.length === 0) continue;

        for (let i = 0; i < docsToSync.length; i += 500) {
          const batch = targetDb.batch();
          const chunk = docsToSync.slice(i, i + 500);
          for (const d of chunk) {
            let data = d.data();
            if (
              colName === "chunk_meta" &&
              d.id === "versions" &&
              !syncAllData
            ) {
              const targetDoc = await targetDb
                .collection(colName)
                .doc(d.id)
                .get();
              if (targetDoc.exists) {
                const tData = targetDoc.data();
                data.users = tData.users || {};
              } else {
                delete data.users;
              }
            }
            batch.set(targetDb.collection(colName).doc(d.id), data);
          }
          await batch.commit();
        }
        logs.push(`Synced ${docsToSync.length} items for ${colName}`);
      }

      res.json({ success: true, logs });
    } catch (error: any) {
      console.error("Sync Push Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/sync/pull", async (req, res) => {
    try {
      const {
        sourceKey,
        targetKey,
        targetDbId,
        specificIds,
        mode,
        onlyPublished,
        syncAllData,
      } = req.body;
      const {
        sourceApp,
        targetApp,
        targetDbId: tDbId,
      } = await getSyncApps(sourceKey, targetKey, targetDbId);
      if (!sourceApp || !targetApp)
        return res.status(400).json({ error: "Keys missing" });

      const sourceDb = getFirestore(
        sourceApp,
        (firebaseConfig as any).firestoreDatabaseId,
      );
      const targetDb = getFirestore(targetApp, tDbId || "(default)");

      console.log(
        `Starting pull: target (${tDbId || "default"}) -> source (${(firebaseConfig as any).firestoreDatabaseId}), mode: ${mode}, specificIds: ${specificIds ? Object.keys(specificIds).length : "none"}, syncAllData: ${syncAllData}`,
      );

      let collections = [
        "genres",
        "languages",
        "qualities",
        "content_chunks",
        "chunk_meta",
        "collections",
        "collection_chunks"
      ];
      if (syncAllData) {
        const sourceCols = (await sourceDb.listCollections()).map(c => c.id);
        const targetCols = (await targetDb.listCollections()).map(c => c.id);
        collections = Array.from(new Set([...sourceCols, ...targetCols]));
      }
      const logs: string[] = [];

      for (const colName of collections) {
        let docsToSync: any[] = [];

        if (specificIds && specificIds[colName]) {
          const ids = specificIds[colName];
          for (const id of ids) {
            const doc = await targetDb.collection(colName).doc(id).get();
            if (doc.exists) docsToSync.push(doc);
          }
        } else {
          const targetSnap = await targetDb.collection(colName).get();
          docsToSync = targetSnap.docs;

          if (mode === "missing") {
            const sourceSnap = await sourceDb.collection(colName).get();
            const sourceIds = new Set(sourceSnap.docs.map((d) => d.id));
            docsToSync = docsToSync.filter((d) => !sourceIds.has(d.id));
          } else if (mode === "changed") {
            const sourceSnap = await sourceDb.collection(colName).get();
            const sourceMap = new Map(
              sourceSnap.docs.map((d) => {
                const data = d.data();
                if (
                  colName === "chunk_meta" &&
                  d.id === "versions" &&
                  !syncAllData
                ) {
                  delete data.users;
                }
                return [d.id, data];
              }),
            );
            docsToSync = docsToSync.filter((d) => {
              const tData = d.data();
              if (
                colName === "chunk_meta" &&
                d.id === "versions" &&
                !syncAllData
              ) {
                delete tData.users;
              }
              const tUpdate = normalizeData(
                tData.updatedAt || tData.createdAt || 0,
              );
              const sData = sourceMap.get(d.id);
              if (!sData) return true; // Missing in source
              
              const sUpdate = normalizeData(
                sData.updatedAt || sData.createdAt || 0,
              );
              if (colName === "chunk_meta") {
                return !areDocsEqual(tData, sData);
              }
              return tUpdate !== sUpdate || !areDocsEqual(tData, sData);
            });
          }
        }

        if (onlyPublished && colName === "content") {
          docsToSync = docsToSync.filter(
            (d) => d.data().status === "published",
          );
        }

        if (docsToSync.length === 0) continue;

        for (let i = 0; i < docsToSync.length; i += 500) {
          const batch = sourceDb.batch();
          const chunk = docsToSync.slice(i, i + 500);
          for (const d of chunk) {
            let data = d.data();
            if (
              colName === "chunk_meta" &&
              d.id === "versions" &&
              !syncAllData
            ) {
              const sourceDoc = await sourceDb
                .collection(colName)
                .doc(d.id)
                .get();
              if (sourceDoc.exists) {
                const sData = sourceDoc.data();
                data.users = sData.users || {};
              } else {
                delete data.users;
              }
            }
            batch.set(sourceDb.collection(colName).doc(d.id), data);
          }
          await batch.commit();
        }
        logs.push(`Pulled ${docsToSync.length} items for ${colName}`);
      }

      res.json({ success: true, logs });
    } catch (error: any) {
      console.error("Sync Pull Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "custom", // Change to custom to handle HTML manually
    });
    app.use(vite.middlewares);

    app.get("*", async (req, res, next) => {
      try {
        const url = req.originalUrl;
        let template = fs.readFileSync(
          path.resolve(__dirname, "../index.html"),
          "utf-8",
        );
        template = await vite.transformIndexHtml(url, template);

        // Remove any existing OG tags to avoid duplication
        template = template.replace(/<meta[^>]*(property="og:|name="twitter:)[^>]*>/gi, "");

        const ogTags = await getOgTags(req);
        const html = template.replace("</head>", `${ogTags}</head>`);

        res.status(200).set({ "Content-Type": "text/html" }).end(html);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    let distPath = path.resolve(__dirname, "../dist");
    if (!fs.existsSync(distPath)) {
      distPath = path.join(process.cwd(), "dist");
    }
    app.use(express.static(distPath, { index: false })); // Disable default index.html serving

    // Explicitly serve PWA files with correct MIME types
    app.get("/moviznow_share_banner.jpg", (req, res) => {
      res.sendFile(path.join(distPath, "moviznow_share_banner.jpg"), {
        headers: { "Content-Type": "image/jpeg" },
      });
    });

    app.get("/manifest.webmanifest", (req, res) => {
      res.sendFile(path.join(distPath, "manifest.webmanifest"), {
        headers: { "Content-Type": "application/manifest+json" },
      });
    });
    app.get("/sw.js", (req, res) => {
      res.sendFile(path.join(distPath, "sw.js"), {
        headers: {
          "Content-Type": "application/javascript",
          "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0, s-maxage=0",
          "Pragma": "no-cache",
          "Expires": "0"
        },
      });
    });

    app.get("*", async (req, res) => {
      // Return 404 for missing static assets instead of serving index.html
      if (req.path.startsWith("/assets/") || /\.(js|css|json|png|jpg|jpeg|gif|ico|svg|woff2?|ttf|eot)$/i.test(req.path)) {
        return res.status(404).send("Asset not found");
      }

      try {
        let templatePath = path.join(distPath, "app.html");
        if (!fs.existsSync(templatePath)) {
          templatePath = path.join(distPath, "index.html");
        }
        if (!fs.existsSync(templatePath)) {
          console.error(`Template not found at: ${templatePath}`);
          return res
            .status(404)
            .send("Template not found. Make sure the app is built.");
        }
        let template = fs.readFileSync(templatePath, "utf-8");

        // Remove any existing OG tags to avoid duplication
        template = template.replace(/<meta[^>]*(property="og:|name="twitter:)[^>]*>/gi, "");

        const ogTags = await getOgTags(req);
        const html = template.replace("</head>", `${ogTags}</head>`);

        res.status(200).set({
          "Content-Type": "text/html",
          "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0, s-maxage=0",
          "Pragma": "no-cache",
          "Expires": "0"
        }).send(html);
      } catch (e) {
        console.error("Production Error:", e);
        res.status(500).end((e as Error).message);
      }
    });
  }

  // Only listen if not running as a Vercel function
  if (!process.env.VERCEL) {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }

  return app;
}

// For Vercel serverless functions, we need to export the app
const appPromise = startServer();
export default async (req: express.Request, res: express.Response) => {
  const app = await appPromise;
  return app(req, res);
};
