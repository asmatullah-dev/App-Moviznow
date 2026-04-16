import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import firebaseConfig from "../firebase-applet-config.json" assert { type: "json" };
import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Admin
if (!admin.apps.length) {
  let credential;
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    credential = admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON));
  } else {
    credential = admin.credential.applicationDefault();
  }
  admin.initializeApp({
    credential,
    projectId: firebaseConfig.projectId
  });
}
const db = getFirestore(admin.app(), firebaseConfig.firestoreDatabaseId);

import crypto from 'crypto';

// Sync Service Account Helpers

function getAppFromKey(keyString?: string, prefix: string = 'sync') {
  if (!keyString || typeof keyString !== 'string') return null;
  
  const trimmedKey = keyString.trim();
  if (!trimmedKey) return null;

  try {
    const hash = crypto.createHash('md5').update(trimmedKey).digest('hex');
    const appName = `${prefix}_${hash}`;
    
    let app = admin.apps.find(a => a?.name === appName);
    if (!app) {
      app = admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(trimmedKey))
      }, appName);
    }
    return app;
  } catch (e) {
    console.error(`Error initializing dynamic app ${prefix}:`, e);
    return null;
  }
}

async function getSyncApps(sourceKey?: string, targetKey?: string, targetDbId?: string) {
  let sourceApp = getAppFromKey(sourceKey, 'sync_src');
  
  // Try fallback to the default app if no specific source key provided/parsable
  if (!sourceApp) {
    sourceApp = admin.app();
  }

  let targetApp = getAppFromKey(targetKey, 'sync_tgt');

  return { sourceApp, targetApp, targetDbId };
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // Background Scan Endpoint
  app.post(["/api/start-background-scan", "/start-background-scan"], async (req, res) => {
    console.log("Received request to /api/start-background-scan");
    const { links } = req.body;
    console.log("Links length:", links ? links.length : 'undefined');
    if (!links || !Array.isArray(links)) {
      console.log("Invalid links array");
      return res.status(400).json({ error: "Links array required" });
    }

    // Start background process
    const scanId = 'background';
    const scanDocRef = db.collection('scans').doc(scanId);

    try {
      await scanDocRef.set({
        id: scanId,
        status: 'scanning',
        scannedCount: 0,
        totalLinks: links.length,
        errorLinks: [],
        startedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastUpdated: admin.firestore.FieldValue.serverTimestamp()
      });
    } catch (error) {
      console.error("Error setting scan document:", error);
      return res.status(500).json({ error: "Failed to initialize scan document" });
    }

    res.json({ message: "Background scan started", scanId });

    // Run the scan in the background
    (async () => {
      const foundErrors: any[] = [];
      let scannedCount = 0;
      const concurrency = 10;
      const queue = [...links];

      const checkPixeldrainLink = async (url: string) => {
        if (!url || url.trim() === '') return { error: "Empty link" };
        const fileMatch = url.match(/pixeldrain\.(?:com|dev)\/(?:u|api\/file)\/([a-zA-Z0-9]+)/);
        const listMatch = url.match(/pixeldrain\.(?:com|dev)\/(?:l|api\/list)\/([a-zA-Z0-9]+)/);
        
        try {
          let apiUrl = "";
          if (fileMatch) apiUrl = `https://pixeldrain.com/api/file/${fileMatch[1]}/info`;
          else if (listMatch) apiUrl = `https://pixeldrain.com/api/list/${listMatch[1]}`;
          else return { error: null };

          const res = await fetch(apiUrl);
          if (res.status === 451) return { error: "Unavailable from Server" };
          if (!res.ok) return { error: `HTTP ${res.status}` };
          
          const data = await res.json();
          if (data.success === false) return { error: "File not found or deleted" };

          let sizeInBytes = 0;
          if (fileMatch) sizeInBytes = data.size;
          else if (listMatch && data.files) sizeInBytes = data.files.reduce((acc: number, f: any) => acc + (f.size || 0), 0);

          let size = 0;
          let unit: 'MB' | 'GB' = 'MB';
          if (sizeInBytes >= 1000 * 1000 * 1000) {
            size = sizeInBytes / (1000 * 1000 * 1000);
            unit = 'GB';
          } else {
            size = sizeInBytes / (1000 * 1000);
            unit = 'MB';
          }
          return { error: null, size: size.toFixed(2).replace(/\.00$/, ''), unit };
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

          if (!error && item.link.size && item.link.unit && result.size && result.unit) {
            const stored = `${item.link.size}${item.link.unit}`;
            const server = `${result.size}${result.unit}`;
            if (stored !== server) error = `Size mismatch`;
          }

          if (error) {
            foundErrors.push({
              ...item,
              errorDetail: error,
              fetchedSize: result.size,
              fetchedUnit: result.unit
            });
          }

          scannedCount++;
          if (scannedCount % 10 === 0 || scannedCount === links.length) {
            await scanDocRef.update({
              scannedCount,
              errorLinks: foundErrors,
              lastUpdated: admin.firestore.FieldValue.serverTimestamp()
            });
          }
        } catch (e) {
          console.error("Background scan error for link:", item.url, e);
        } finally {
          await processNext();
        }
      };

      const workers = Array.from({ length: Math.min(concurrency, links.length) }, () => processNext());
      await Promise.all(workers);

      await scanDocRef.update({
        status: 'completed',
        lastUpdated: admin.firestore.FieldValue.serverTimestamp()
      });
    })().catch(err => {
      console.error("Background scan fatal error:", err);
      scanDocRef.update({ status: 'error', lastUpdated: admin.firestore.FieldValue.serverTimestamp() });
    });
  });

  // IMDb Fetch Proxy
  app.get(["/api/imdb-fetch", "/imdb-fetch"], async (req, res) => {
    try {
      const { url } = req.query;
      if (!url || typeof url !== 'string') return res.status(400).json({ error: "IMDb URL required" });
      
      const match = url.match(/tt\d+/);
      if (!match) return res.status(400).json({ error: "Invalid IMDb URL" });
      const ttId = match[0];

      // Try TVMaze lookup
      console.log(`Fetching TVMaze for IMDb ID: ${ttId}`);
      const response = await fetch(`https://api.tvmaze.com/lookup/shows?imdb=${ttId}`);
      
      if (!response.ok) {
        if (response.status === 404) {
          console.error(`TVMaze lookup not found for ${ttId}`);
          return res.status(404).json({ error: "Content not found on TVMaze. Please try manual entry or Master Fetch." });
        }
        const errorText = await response.text();
        console.error(`TVMaze lookup failed for ${ttId}: ${response.status} - ${errorText}`);
        return res.status(response.status).json({ error: `Failed to fetch from TVMaze: ${response.statusText}` });
      }
      
      const showData = await response.json();
      
      // Fetch episodes
      console.log(`Fetching episodes for TVMaze ID: ${showData.id}`);
      const episodesResponse = await fetch(`https://api.tvmaze.com/shows/${showData.id}/episodes`);
      
      if (!episodesResponse.ok) {
        const errorText = await episodesResponse.text();
        console.error(`TVMaze episodes failed for ${showData.id}: ${episodesResponse.status} - ${errorText}`);
        return res.status(episodesResponse.status).json({ error: `Failed to fetch episodes from TVMaze: ${episodesResponse.statusText}` });
      }
      
      const episodes = await episodesResponse.json();

      res.json({
        ...showData,
        episodes
      });
    } catch (error) {
      console.error("IMDb Fetch Proxy Error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // IMDb Suggestion Proxy
  app.get(["/api/imdb/suggestion/:ttId", "/imdb/suggestion/:ttId"], async (req, res) => {
    try {
      const { ttId } = req.params;
      const firstLetter = ttId.charAt(0).toLowerCase();
      
      const response = await fetch(`https://v3.sg.media-imdb.com/suggestion/${firstLetter}/${ttId}.json`);
      if (!response.ok) {
        // Fallback to 'x' if the first letter doesn't work (sometimes used for newer IDs)
        const fallbackResponse = await fetch(`https://v3.sg.media-imdb.com/suggestion/x/${ttId}.json`);
        if (!fallbackResponse.ok) {
          return res.status(fallbackResponse.status).json({ error: "Failed to fetch from IMDb" });
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
  });

  // IMDb Title Page Proxy
  app.get(["/api/imdb/title/:ttId", "/imdb/title/:ttId"], async (req, res) => {
    try {
      const { ttId } = req.params;
      const response = await fetch(`https://www.imdb.com/title/${ttId}/`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'Sec-Ch-Ua': '"Chromium";v="122", "Not(A:Brand)";v="24", "Google Chrome";v="122"',
          'Sec-Ch-Ua-Mobile': '?0',
          'Sec-Ch-Ua-Platform': '"Windows"',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
          'Upgrade-Insecure-Requests': '1'
        }
      });
      if (!response.ok) {
        console.error(`IMDb Proxy: Failed to fetch ${ttId}, status: ${response.status}`);
        return res.status(response.status).json({ error: `Failed to fetch from IMDb: ${response.status}` });
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
      const response = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(q as string)}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
        }
      });
      const html = await response.text();
      // Extract the first video ID and title
      const match = html.match(/"videoId":"([^"]+)"/);
      const titleMatch = html.match(/"title":\{"runs":\[\{"text":"([^"]+)"\}\]/);
      
      if (match && match[1]) {
        return res.json({ 
          videoId: match[1], 
          url: `https://www.youtube.com/watch?v=${match[1]}`,
          title: titleMatch ? titleMatch[1] : "YouTube Video"
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
      if (!url || typeof url !== 'string') return res.status(400).json({ error: "URL required" });
      
      let fetchUrl = `https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`;
      if (alias && typeof alias === 'string') {
        fetchUrl += `&alias=${encodeURIComponent(alias)}`;
      }
      
      const response = await fetch(fetchUrl);
      const shortUrl = await response.text();
      
      if (!response.ok || shortUrl.toLowerCase().includes('<html') || !shortUrl.startsWith('http')) {
        console.error("TinyURL error response:", shortUrl);
        return res.status(500).json({ error: "TinyURL returned invalid response" });
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
      if (!links || !Array.isArray(links)) return res.status(400).json({ error: "Links array required" });

      console.log(`Starting server-side scan for ${links.length} links`);
      
      const results = await Promise.all(links.map(async (link) => {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 8000);
          
          let fetchUrl = link.url;
          // If it's a pixeldrain link, use the API for faster checking
          const pdMatch = fetchUrl.match(/pixeldrain\.(?:com|dev)\/(?:u|api\/file)\/([a-zA-Z0-9]+)/);
          if (pdMatch) {
            fetchUrl = `https://pixeldrain.com/api/file/${pdMatch[1]}/info`;
          }
          
          const response = await fetch(fetchUrl, { 
            method: pdMatch ? 'GET' : 'HEAD',
            signal: controller.signal 
          });
          
          clearTimeout(timeoutId);
          
          if (!response.ok) {
            return { ...link, errorDetail: `HTTP ${response.status}` };
          }
          return { ...link, errorDetail: null };
        } catch (e: any) {
          if (e.name === 'AbortError') {
            return { ...link, errorDetail: 'Timeout' };
          }
          return { ...link, errorDetail: 'Network error' };
        }
      }));

      res.json({ results });
    } catch (error) {
      console.error("Scan Links Error:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // Subscribe to FCM topic
  app.post(["/api/notifications/subscribe", "/notifications/subscribe"], async (req, res) => {
    try {
      const { token } = req.body;
      if (!token) return res.status(400).json({ error: "Token required" });
      
      // Check if messaging is available (requires service account)
      try {
        if (admin.apps.length === 0) {
          throw new Error("Firebase Admin not initialized");
        }
        await admin.messaging().subscribeToTopic(token, "all_users");
        res.json({ success: true });
      } catch (fcmError: any) {
        const isAuthError = fcmError.message.includes('401') || fcmError.message.includes('authentication');
        console.warn(`FCM Subscription failed: ${fcmError.message}${isAuthError ? ' (This usually means a Service Account Key is missing or invalid in the environment)' : ''}`);
        // Return success anyway to avoid client-side errors, as we can't fix this without user action
        res.json({ success: true, warning: "FCM not fully configured", details: fcmError.message });
      }
    } catch (error) {
      console.error("Error in subscribe endpoint:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // Send FCM notification
  app.post(["/api/notifications/send", "/notifications/send"], async (req, res) => {
    try {
      const { title, body, imageUrl, url } = req.body;
      
      const message = {
        data: {
          title,
          body,
          imageUrl: imageUrl || "",
          url: url || "/"
        },
        topic: "all_users"
      };

      try {
        const response = await admin.messaging().send(message);
        res.json({ success: true, messageId: response });
      } catch (fcmError: any) {
        console.error("FCM Send failed:", fcmError.message);
        res.status(500).json({ error: "FCM not configured or failed", details: fcmError.message });
      }
    } catch (error) {
      console.error("Error in send notification endpoint:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  // Admin Reset Password
  app.post(["/api/admin/reset-password", "/admin/reset-password"], async (req, res) => {
    try {
      const { uid, adminUid } = req.body;
      if (!uid || !adminUid) return res.status(400).json({ error: "Missing uid or adminUid" });

      // Verify admin
      const adminDoc = await db.collection('users').doc(adminUid).get();
      if (!adminDoc.exists || (adminDoc.data()?.role !== 'admin' && adminDoc.data()?.role !== 'owner')) {
        return res.status(403).json({ error: "Unauthorized" });
      }

      // Reset password to default and set flag
      const defaultPassword = "moviznow123";
      await admin.auth().updateUser(uid, { password: defaultPassword });
      await db.collection('users').doc(uid).update({ requirePasswordReset: true });

      res.json({ success: true, message: "Password reset to moviznow123" });
    } catch (error) {
      console.error("Admin Reset Password Error:", error);
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
  app.post(["/api/check-link", "/check-link"], async (req, res) => {
    try {
      const { url } = req.body;
      if (!url || typeof url !== "string") {
        return res.status(400).json({ ok: false, statusLabel: "BROKEN", message: "Missing URL" });
      }

      let parsed: URL;
      try { parsed = new URL(url); } catch {
        return res.status(400).json({ ok: false, statusLabel: "BROKEN", message: "Invalid URL" });
      }

      let currentUrl = url;
      let currentHost = parsed.hostname.replace(/^www\./, "");
      let currentParsed = parsed;

      const headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      };

      // Try to resolve redirects first if it's not already a known special host
      if (!currentHost.includes("pixeldrain.com") && !currentHost.includes("pixeldrain.dev") && !currentHost.includes("raj.lat")) {
        try {
          const redirectCheck = await fetch(currentUrl, { method: "HEAD", headers, redirect: "follow" });
          if (redirectCheck.url && redirectCheck.url !== currentUrl) {
            currentUrl = redirectCheck.url;
            currentParsed = new URL(currentUrl);
            currentHost = currentParsed.hostname.replace(/^www\./, "");
          }
        } catch (e) {
          try {
            const redirectCheckGet = await fetch(currentUrl, { method: "GET", headers: { ...headers, Range: "bytes=0-0" }, redirect: "follow" });
            if (redirectCheckGet.url && redirectCheckGet.url !== currentUrl) {
              currentUrl = redirectCheckGet.url;
              currentParsed = new URL(currentUrl);
              currentHost = currentParsed.hostname.replace(/^www\./, "");
            }
          } catch (e2) {}
        }
      }

      // PIXELDRAIN SPECIAL CHECK
      if (currentHost.includes("pixeldrain.com") || currentHost.includes("pixeldrain.dev")) {
        const match = currentParsed.pathname.match(/\/u\/([^/?#]+)/);
        if (match?.[1]) {
          const fileId = match[1];
          try {
            const infoRes = await fetch(
              `https://pixeldrain.com/api/file/${fileId}/info`,
              { method: "GET", headers: { ...headers, Accept: "application/json,text/plain,*/*" } }
            );

            if (infoRes.status === 404) {
              return res.json({ ok: false, status: 404, statusLabel: "BROKEN", message: "Pixeldrain file not found or deleted", finalUrl: currentUrl, source: "pixeldrain-api", host: currentHost });
            }

            if (infoRes.status === 429) {
              return res.json({ ok: false, status: 429, statusLabel: "UNAVAILABLE", message: "Pixeldrain temporarily unavailable or rate-limited", finalUrl: currentUrl, source: "pixeldrain-api", host: currentHost });
            }

            if (infoRes.ok) {
              const data: any = await infoRes.json();

              const dlRes = await fetch(
                `https://pixeldrain.com/api/file/${fileId}`,
                { method: "GET", headers: { ...headers, Range: "bytes=0-0" }, redirect: "manual" }
              ).catch(() => null);

              const contentType = dlRes?.headers.get("content-type") || "pixeldrain/file";
              const disposition = dlRes?.headers.get("content-disposition") || "";
              const contentLength = dlRes?.headers.get("content-length");
              const fileSize = typeof data?.size === "number" ? data.size : contentLength ? Number(contentLength) : undefined;
              const fileSizeText = formatBytes(fileSize);
              const fileNameMatch = disposition.match(/filename\*?=(?:UTF-8'')?"?([^";]+)/i);
              const fileName = data?.name || (fileNameMatch?.[1] ? decodeURIComponent(fileNameMatch[1]) : undefined);

              if (!dlRes) {
                return res.json({ ok: false, statusLabel: "UNAVAILABLE", message: "Pixeldrain metadata exists but file is temporarily unavailable.", finalUrl: currentUrl, contentType, isDirectDownload: false, fileName, fileSize, fileSizeText, source: "pixeldrain-download-probe", host: currentHost });
              }

              if (dlRes.status === 403 || dlRes.status === 451) {
                return res.json({ ok: false, status: dlRes.status, statusLabel: "UNAVAILABLE", message: "Pixeldrain file exists but is not available for download right now.", finalUrl: currentUrl, contentType, isDirectDownload: false, fileName, fileSize, fileSizeText, source: "pixeldrain-download-probe", host: currentHost });
              }

              if (dlRes.ok || dlRes.status === 206 || dlRes.status === 302) {
                return res.json({ ok: true, status: dlRes.status || 200, statusLabel: "WORKING", message: fileName ? `Pixeldrain file available: ${fileName}` : "Pixeldrain file is available", finalUrl: currentUrl, contentType, isDirectDownload: true, fileName, fileSize, fileSizeText, source: "pixeldrain-api+download-probe", host: currentHost });
              }

              return res.json({ ok: false, status: dlRes.status, statusLabel: "UNAVAILABLE", message: "Pixeldrain file metadata exists, but download appears unavailable.", finalUrl: currentUrl, contentType, isDirectDownload: false, fileName, fileSize, fileSizeText, source: "pixeldrain-api+download-probe", host: currentHost });
            }
          } catch {
            return res.json({ ok: false, statusLabel: "UNAVAILABLE", message: "Pixeldrain could not be verified right now.", finalUrl: currentUrl, source: "pixeldrain-api", host: currentHost });
          }
        }
      }

      // RAJ / GATE CHECK
      if (currentHost === "hub.raj.lat" || currentHost.endsWith(".raj.lat")) {
        try {
          const fetchRes = await fetch(currentUrl, { method: "GET", headers, redirect: "manual" });
          const location = fetchRes.headers.get("location") || undefined;
          const contentType = fetchRes.headers.get("content-type") || undefined;
          const disposition = fetchRes.headers.get("content-disposition") || "";
          const contentLength = fetchRes.headers.get("content-length");
          const fileSize = contentLength ? Number(contentLength) : undefined;
          const fileSizeText = formatBytes(fileSize);
          const isAttachment = /attachment/i.test(disposition);
          const isFileType = !!contentType && !/text\/html|application\/json/i.test(contentType);
          const isPartial = fetchRes.status === 206;
          const isDirectDownload = isAttachment || isFileType || isPartial;
          const fileNameMatch = disposition.match(/filename\*?=(?:UTF-8'')?"?([^";]+)/i);
          const fileName = fileNameMatch?.[1] ? decodeURIComponent(fileNameMatch[1]) : undefined;

          if (isDirectDownload && (fetchRes.ok || isPartial)) {
            return res.json({ ok: true, status: fetchRes.status, statusLabel: "WORKING", message: "Valid direct file / download link detected.", finalUrl: currentUrl, contentType, isDirectDownload: true, fileName, fileSize, fileSizeText, source: "download-detect", host: currentHost });
          }

          if (fetchRes.status >= 300 && fetchRes.status < 400) {
            return res.json({ ok: true, status: fetchRes.status, statusLabel: "REDIRECT", message: "Protected redirect link is alive", finalUrl: location || currentUrl, contentType, source: "redirect-probe", host: currentHost });
          }

          const html = await fetchRes.text().catch(() => "");
          const lower = html.toLowerCase();
          if (lower.includes("not found") || lower.includes("invalid link") || lower.includes("link expired") || lower.includes("expired") || lower.includes("404")) {
            return res.json({ ok: false, status: fetchRes.status || 404, statusLabel: "BROKEN", message: "Protected link exists but target appears invalid or expired", finalUrl: currentUrl, contentType, source: "html-scan", host: currentHost });
          }
          if (lower.includes("cloudflare") || lower.includes("checking your browser") || lower.includes("captcha") || lower.includes("access denied") || lower.includes("forbidden")) {
            return res.json({ ok: true, status: fetchRes.status || 200, statusLabel: "PROTECTED", message: "Link is alive but protected by anti-bot or gateway", finalUrl: currentUrl, contentType, source: "protection-detect", host: currentHost });
          }
          if (fetchRes.ok) {
            return res.json({ ok: true, status: fetchRes.status, statusLabel: "WORKING", message: "Protected landing page is reachable", finalUrl: currentUrl, contentType, source: "html-scan", host: currentHost });
          }
        } catch {}
      }

      // GENERAL CHECK
      try {
        let res_fetch = await fetch(currentUrl, { method: "HEAD", headers, redirect: "follow" });
        if (!res_fetch.ok || res_fetch.status === 405) {
          res_fetch = await fetch(currentUrl, { method: "GET", headers: { ...headers, Range: "bytes=0-0" }, redirect: "follow" });
        }

        const contentType = res_fetch.headers.get("content-type") || undefined;
        const disposition = res_fetch.headers.get("content-disposition") || "";
        const contentLength = res_fetch.headers.get("content-length");
        const fileSize = contentLength ? Number(contentLength) : undefined;
        const fileSizeText = formatBytes(fileSize);
        const isAttachment = /attachment/i.test(disposition);
        const isFileType = !!contentType && !/text\/html|application\/json/i.test(contentType);
        const isPartial = res_fetch.status === 206;
        const isDirectDownload = isAttachment || isFileType || isPartial;
        const fileNameMatch = disposition.match(/filename\*?=(?:UTF-8'')?"?([^";]+)/i);
        const fileName = fileNameMatch?.[1] ? decodeURIComponent(fileNameMatch[1]) : undefined;

        if (res_fetch.ok || res_fetch.status === 206) {
          return res.json({ ok: true, status: res_fetch.status, statusLabel: "WORKING", message: isDirectDownload ? "Valid direct file / download link detected." : "Link is reachable", finalUrl: res_fetch.url, contentType, isDirectDownload, fileName, fileSize, fileSizeText, source: "general-check", host: currentHost });
        }

        return res.json({ ok: false, status: res_fetch.status, statusLabel: "BROKEN", message: `HTTP ${res_fetch.status}`, finalUrl: res_fetch.url || currentUrl, contentType, source: "general-check", host: currentHost });
      } catch {
        return res.json({ ok: false, statusLabel: "UNKNOWN", message: "Could not verify this host", finalUrl: currentUrl, source: "general-check", host: currentHost });
      }
    } catch (error) {
      console.error("Check Link Error:", error);
      res.status(500).json({ ok: false, statusLabel: "UNKNOWN", message: "Unexpected server error" });
    }
  });

  // Helper to fetch movie details and generate OG tags
  const getOgTags = async (req: express.Request) => {
    const urlPath = req.originalUrl;
    const host = req.get('x-forwarded-host') || req.get('host') || '';
    const protocol = req.get('x-forwarded-proto') || req.protocol || 'https';
    const baseUrl = `${protocol}://${host}`;
    
    let title = "MovizNow - Premium Movies & Series";
    let description = "Watch the latest movies and series on MovizNow. Your ultimate entertainment destination.";
    let image = `${baseUrl}/pwa-512x512.png`; // Use absolute URL for OG image
    
    const movieMatch = urlPath.match(/^\/movie\/([^/?]+)/);
    if (movieMatch) {
      const movieId = movieMatch[1];
      try {
        const { projectId, firestoreDatabaseId, apiKey } = firebaseConfig;
        const dbId = firestoreDatabaseId || '(default)';
        const apiUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${dbId}/documents/content/${movieId}?key=${apiKey}`;
        
        const response = await fetch(apiUrl);
        if (response.ok) {
          const data = await response.json();
          if (data.fields) {
            const movieTitle = data.fields.title?.stringValue || "";
            const year = data.fields.year?.integerValue || data.fields.year?.stringValue || "";
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
                    const genreIds = data.fields.genreIds.arrayValue.values.map((v: any) => v.stringValue);
                    const matchedGenres = genresData.documents
                      .filter((doc: any) => genreIds.includes(doc.name.split('/').pop()))
                      .map((doc: any) => doc.fields.name?.stringValue)
                      .filter(Boolean);
                    if (matchedGenres.length > 0) {
                      genreNames = matchedGenres.join(', ');
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
                    const langIds = data.fields.languageIds.arrayValue.values.map((v: any) => v.stringValue);
                    const matchedLangs = langsData.documents
                      .filter((doc: any) => langIds.includes(doc.name.split('/').pop()))
                      .map((doc: any) => doc.fields.name?.stringValue)
                      .filter(Boolean);
                    if (matchedLangs.length > 0) {
                      languageNames = matchedLangs.join(', ');
                    }
                  }
                }
              } catch (e) {
                console.error("Error fetching languages for OG tags:", e);
              }
            }

            title = `${movieTitle} ${year ? `(${year})` : ''} - MovizNow`;
            
            const descParts = [];
            if (type) descParts.push(type.charAt(0).toUpperCase() + type.slice(1));
            if (genreNames) descParts.push(genreNames);
            if (languageNames) descParts.push(`Languages: ${languageNames}`);
            
            description = descParts.join(' | ') + '. ' + (data.fields.description?.stringValue || "");
            
            if (data.fields.posterUrl?.stringValue) {
              image = data.fields.posterUrl.stringValue;
              // Ensure image is absolute
              if (image.startsWith('/')) {
                image = `${baseUrl}${image}`;
              }
            }
          }
        }
      } catch (error) {
        console.error("Error fetching movie for OG tags:", error);
      }
    }

    return `
      <meta property="og:title" content="${title.replace(/"/g, '&quot;')}" />
      <meta property="og:description" content="${description.replace(/"/g, '&quot;').slice(0, 200)}..." />
      <meta property="og:image" content="${image}" />
      <meta property="og:type" content="video.movie" />
      <meta property="og:url" content="${baseUrl}${urlPath}" />
      <meta property="og:site_name" content="MovizNow" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content="${title.replace(/"/g, '&quot;')}" />
      <meta name="twitter:description" content="${description.replace(/"/g, '&quot;').slice(0, 200)}..." />
      <meta name="twitter:image" content="${image}" />
    `;
  };

  const normalizeData = (data: any): any => {
    if (!data) return data;
    
    // Handle Firestore Timestamps
    if (data && typeof data === 'object' && '_seconds' in data && '_nanoseconds' in data) {
      return new Date(data._seconds * 1000).toISOString();
    }
    if (data && typeof data.toDate === 'function') {
      return data.toDate().toISOString();
    }

    if (Array.isArray(data)) {
      return data.map(normalizeData);
    }

    if (typeof data === 'object') {
      const normalized: any = {};
      Object.keys(data).sort().forEach(key => {
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

    return JSON.stringify(normalizeData(d1)) === JSON.stringify(normalizeData(d2));
  };

  // Sync Endpoints
  app.post("/api/sync/status", async (req, res) => {
    try {
      const { sourceKey, targetKey, targetDbId } = req.body;
      const { sourceApp, targetApp } = await getSyncApps(sourceKey, targetKey, targetDbId);
      
      res.json({
        sourceConnected: !!sourceApp,
        targetConnected: !!targetApp,
        sourceKeyExists: !!sourceKey,
        targetKeyExists: !!targetKey
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/sync/compare", async (req, res) => {
    try {
      const { sourceKey, targetKey, targetDbId } = req.body;
      const { sourceApp, targetApp, targetDbId: tDbId } = await getSyncApps(sourceKey, targetKey, targetDbId);
      if (!sourceApp || !targetApp) {
        return res.status(400).json({ error: "Service account keys missing or invalid" });
      }

      const sourceDb = getFirestore(sourceApp, firebaseConfig.firestoreDatabaseId);
      const targetDb = getFirestore(targetApp, tDbId || '(default)');

      console.log(`Comparing source DB (${firebaseConfig.firestoreDatabaseId}) with target DB (${targetDbId || 'default'})`);

      const collections = [
        'genres', 'languages', 'qualities', 'content', 
        'users', 'admin_settings', 'notifications', 
        'notification_templates', 'orders', 'movie_requests', 
        'reported_links', 'error_links', 'whitelisted_phones', 
        'fcm_tokens', 'income'
      ];
      const results: any = {};

      for (const colName of collections) {
        const sourceSnap = await sourceDb.collection(colName).get();
        const targetSnap = await targetDb.collection(colName).get();

        const sourceDocs = sourceSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const targetDocs = targetSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        const sourceMap = new Map(sourceDocs.map(d => [d.id, d]));
        const targetMap = new Map(targetDocs.map(d => [d.id, d]));

        const diffs: any[] = [];

        sourceDocs.forEach((sDoc: any) => {
          const tDoc: any = targetMap.get(sDoc.id);
          if (!tDoc) {
            diffs.push({ 
              id: sDoc.id, 
              title: sDoc.title || sDoc.name || sDoc.id, 
              type: 'missing_in_target',
              sourceData: sDoc,
              targetData: null
            });
          } else {
            if (!areDocsEqual(sDoc, tDoc)) {
              diffs.push({ 
                id: sDoc.id, 
                title: sDoc.title || sDoc.name || sDoc.id, 
                type: 'different',
                sourceData: sDoc,
                targetData: tDoc
              });
            }
          }
        });

        targetDocs.forEach((tDoc: any) => {
          if (!sourceMap.has(tDoc.id)) {
            diffs.push({ 
              id: tDoc.id, 
              title: tDoc.title || tDoc.name || tDoc.id, 
              type: 'missing_in_source',
              sourceData: null,
              targetData: tDoc
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
      const { sourceKey, targetKey, targetDbId, mode, specificIds } = req.body;
      const { sourceApp, targetApp, targetDbId: tDbId } = await getSyncApps(sourceKey, targetKey, targetDbId);
      if (!sourceApp || !targetApp) return res.status(400).json({ error: "Keys missing" });

      const sourceDb = getFirestore(sourceApp, firebaseConfig.firestoreDatabaseId);
      const targetDb = getFirestore(targetApp, tDbId || '(default)');

      console.log(`Starting push: source (${firebaseConfig.firestoreDatabaseId}) -> target (${tDbId || 'default'}), mode: ${mode}, specificIds: ${specificIds ? Object.keys(specificIds).length : 'none'}`);

      const collections = [
        'genres', 'languages', 'qualities', 'content', 
        'users', 'admin_settings', 'notifications', 
        'notification_templates', 'orders', 'movie_requests', 
        'reported_links', 'error_links', 'whitelisted_phones', 
        'fcm_tokens', 'income'
      ];
      const logs: string[] = [];

      for (const colName of collections) {
        let docsToSync: any[] = [];

        if (specificIds && specificIds[colName]) {
          const ids = specificIds[colName];
          for (const id of ids) {
            const doc = await sourceDb.collection(colName).doc(id).get();
            if (doc.exists) docsToSync.push(doc);
          }
        } else {
          const sourceSnap = await sourceDb.collection(colName).get();
          docsToSync = sourceSnap.docs;

          if (mode === 'changed') {
            const targetSnap = await targetDb.collection(colName).get();
            const targetMap = new Map(targetSnap.docs.map(d => [d.id, d.data().updatedAt]));
            docsToSync = docsToSync.filter(d => {
              const sData = d.data();
              const sUpdate = normalizeData(sData.updatedAt || sData.createdAt || 0);
              const tUpdate = normalizeData(targetMap.get(d.id) || 0);
              return !tUpdate || sUpdate > tUpdate;
            });
          } else if (mode === 'missing') {
            const targetSnap = await targetDb.collection(colName).get();
            const targetIds = new Set(targetSnap.docs.map(d => d.id));
            docsToSync = docsToSync.filter(d => !targetIds.has(d.id));
          }
        }

        if (docsToSync.length === 0) continue;

        for (let i = 0; i < docsToSync.length; i += 500) {
          const batch = targetDb.batch();
          const chunk = docsToSync.slice(i, i + 500);
          chunk.forEach(d => {
            batch.set(targetDb.collection(colName).doc(d.id), d.data());
          });
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
      const { sourceKey, targetKey, targetDbId, specificIds, mode } = req.body;
      const { sourceApp, targetApp, targetDbId: tDbId } = await getSyncApps(sourceKey, targetKey, targetDbId);
      if (!sourceApp || !targetApp) return res.status(400).json({ error: "Keys missing" });

      const sourceDb = getFirestore(sourceApp, firebaseConfig.firestoreDatabaseId);
      const targetDb = getFirestore(targetApp, tDbId || '(default)');

      console.log(`Starting pull: target (${tDbId || 'default'}) -> source (${firebaseConfig.firestoreDatabaseId}), mode: ${mode}, specificIds: ${specificIds ? Object.keys(specificIds).length : 'none'}`);

      const collections = [
        'genres', 'languages', 'qualities', 'content', 
        'users', 'admin_settings', 'notifications', 
        'notification_templates', 'orders', 'movie_requests', 
        'reported_links', 'error_links', 'whitelisted_phones', 
        'fcm_tokens', 'income'
      ];
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

          if (mode === 'missing') {
            const sourceSnap = await sourceDb.collection(colName).get();
            const sourceIds = new Set(sourceSnap.docs.map(d => d.id));
            docsToSync = docsToSync.filter(d => !sourceIds.has(d.id));
          }
        }

        if (docsToSync.length === 0) continue;

        for (let i = 0; i < docsToSync.length; i += 500) {
          const batch = sourceDb.batch();
          const chunk = docsToSync.slice(i, i + 500);
          chunk.forEach(d => {
            batch.set(sourceDb.collection(colName).doc(d.id), d.data());
          });
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
    
    app.get('*', async (req, res, next) => {
      try {
        const url = req.originalUrl;
        let template = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        
        // Remove any existing OG tags to avoid duplication
        template = template.replace(/<meta property="og:[^>]+>/g, '');
        template = template.replace(/<meta name="twitter:[^>]+>/g, '');
        
        const ogTags = await getOgTags(req);
        const html = template.replace('</head>', `${ogTags}</head>`);
        
        res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    const distPath = path.resolve(__dirname, '../dist');
    app.use(express.static(distPath, { index: false })); // Disable default index.html serving
    
    // Explicitly serve PWA files with correct MIME types
    app.get('/manifest.webmanifest', (req, res) => {
      res.sendFile(path.join(distPath, 'manifest.webmanifest'), { headers: { 'Content-Type': 'application/manifest+json' } });
    });
    app.get('/sw.js', (req, res) => {
      res.sendFile(path.join(distPath, 'sw.js'), { headers: { 'Content-Type': 'application/javascript' } });
    });
    
    app.get('*', async (req, res) => {
      try {
        const templatePath = path.join(distPath, 'index.html');
        if (!fs.existsSync(templatePath)) {
          console.error(`Template not found at: ${templatePath}`);
          return res.status(404).send("Template not found. Make sure the app is built.");
        }
        let template = fs.readFileSync(templatePath, 'utf-8');
        
        // Remove any existing OG tags to avoid duplication
        template = template.replace(/<meta property="og:[^>]+>/g, '');
        template = template.replace(/<meta name="twitter:[^>]+>/g, '');
        
        const ogTags = await getOgTags(req);
        const html = template.replace('</head>', `${ogTags}</head>`);
        
        res.status(200).set({ 'Content-Type': 'text/html' }).send(html);
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
