import { Router } from 'express';
import axios from 'axios';
import * as cheerio from 'cheerio';

export const linkExtractionRouter = Router();

const extractionCache = new Map<string, { data: any, timestamp: number }>();
const inFlightRequests = new Map<string, Promise<any>>();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes cache

const htmlCache = new Map<string, { data: any, status: number, headers: any, timestamp: number }>();
const inFlightHtmlRequests = new Map<string, Promise<any>>();
const HTML_CACHE_TTL = 10 * 60 * 1000;

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
  if (!response.data || typeof response.data !== "string") return false;
  const dataLower = response.data.substring(0, 10000).toLowerCase();
  if (
    dataLower.includes("<title>just a moment</title>") ||
    dataLower.includes("<title>cloudflare") ||
    dataLower.includes("<title>ddos protection</title>") ||
    dataLower.includes("<title>attention required!")
  ) {
    return true;
  }
  return false;
}

async function fetchWithApi(url: string, timeout = 10000, isVcloud = false) {
  if (isVcloud || url.includes("vcloud")) {
    const scraperApiUrl = `http://api.scraperapi.com?api_key=${process.env.SCRAPER_API_KEY || "9cd207e5fa77b2c6ef6072a7ea4c4326"}&url=${encodeURIComponent(url)}`;
    return axios.get(scraperApiUrl, {
      validateStatus: () => true,
      timeout,
      maxContentLength: 5242880,
      maxBodyLength: 5242880,
    });
  } else {
    const microlinkUrl = `https://api.microlink.io/?url=${encodeURIComponent(url)}&meta=false&data.body.selector=body&data.body.attr=html&force=true`;
    const res = await axios.get(microlinkUrl, {
      validateStatus: () => true,
      timeout,
    });
    if (res.data && res.data.data && res.data.data.body) {
      return {
        data: res.data.data.body,
        status: 200,
        headers: res.headers,
      };
    }
    return { data: "", status: res.status || 500, headers: res.headers || {} };
  }
}

async function fetchHtmlFallback(url: string, isVcloud = false) {
  let response;
  try {
    response = await fetchDirect(url, 6000);
    if (!isCloudflareResponse(response)) return response;
  } catch (err) {}

  try {
    response = await fetchWithApi(url, 10000, isVcloud);
    if (!isCloudflareResponse(response)) return response;
  } catch (err) {}

  try {
    response = await fetchWithApi(url, 12000, isVcloud);
  } catch (err) {
    response = { data: "", status: 500, headers: {} };
  }
  return response;
}

async function fetchHtml(url: string, isVcloud = false) {
  const cacheKey = url;
  const cached = htmlCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < HTML_CACHE_TTL) {
    return cached;
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
    htmlCache.set(cacheKey, result);
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
      const { url, forceExtract, isVcloud } = req.body;
      const isVcloudBool = Boolean(isVcloud);
      if (
        !url ||
        (!forceExtract && 
         !url.includes("hubcloud") &&
          !url.includes("moviesdrive") &&
          !url.includes("vcloud") &&
          !url.includes("hubdrive"))
      ) {
        return res.status(400).json({ error: "Invalid HubCloud URL" });
      }

      const cacheKey = `extract_${url}`;
      const cached = extractionCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return res.json(cached.data);
      }

      if (inFlightRequests.has(cacheKey)) {
        const data = await inFlightRequests.get(cacheKey);
        return res.json(data);
      }

      const performFetch = async () => {
        const response = await fetchHtml(url, isVcloudBool);
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

        let title = $("title").text() || $(".card-header").text() || "";
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
          response.status === 404 || title.toLowerCase().includes("not found");
        const isWorking =
          response.status < 400 ||
          response.status === 403 ||
          response.status === 503 ||
          title === "Unknown (Cloudflare Block)";

        const responseData = {
          size,
          unit,
          title: title.trim(),
          isWorking: isWorking && !isNotFound,
          isNotFound,
        };
        
        const isSuccessful = 
          responseData.isWorking && 
          !responseData.isNotFound && 
          responseData.title && 
          !responseData.title.toLowerCase().includes("cloudflare block") && 
          !responseData.title.toLowerCase().includes("timeout");

        if (isSuccessful) {
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

  async function performExtraction(url: string, checkOnly: boolean, depth = 0, isVcloud = false): Promise<any> {
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
          !url.includes("vcloud") &&
          !url.includes("hubdrive"))
      ) {
        return { url };
      }

      let response = await fetchHtml(url, isVcloud);
      let $ = cheerio.load(response.data);

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
        $("a.btn-zip").attr("href");

      // Extract url from script for vcloud if href is missing
      if (!nextUrl) {
         const scriptHtml = $.html();
         const match = scriptHtml.match(/var\s+url\s*=\s*['"]([^'"]+)['"]/i);
         if (match && match[1]) {
            nextUrl = match[1];
         }
      }

      let $2 = null;

      if (!nextUrl) {
        if ($("a.btn").length > 0) {
          $2 = $;
        } else {
          return { url };
        }
      } else {
        let res2 = await fetchHtml(nextUrl, isVcloud);
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
        if (href && !text.includes("telegram"))
          candidateLinks.push({ text, href });
      });

      if (candidateLinks.length === 0) {
        return { url };
      }

      // Sort: pixeldrain first, then .workers.dev, then others
      candidateLinks.sort((a, b) => {
        const isA_PD =
          /pixeldrain|pixel\.drain|pixeldra\.in/i.test(a.text) ||
          /pixeldrain|pixel\.drain|pixeldra\.in/i.test(a.href);
        const isB_PD =
          /pixeldrain|pixel\.drain|pixeldra\.in/i.test(b.text) ||
          /pixeldrain|pixel\.drain|pixeldra\.in/i.test(b.href);
        if (isA_PD && !isB_PD) return -1;
        if (!isA_PD && isB_PD) return 1;

        const isA_FSL = /fsl|servers*2/i.test(a.text) || /fsl|servers*2/i.test(a.href);const isB_FSL = /fsl|servers*2/i.test(b.text) || /fsl|servers*2/i.test(b.href);if (isA_FSL && !isB_FSL) return -1;if (!isA_FSL && isB_FSL) return 1;
        const isA_Worker = /\.workers\.dev/i.test(a.href);
        const isB_Worker = /\.workers\.dev/i.test(b.href);
        if (isA_Worker && !isB_Worker) return -1;
        if (!isA_Worker && isB_Worker) return 1;

        return 0;
      });

      // Find first working link
      let workingLink = url; if (candidateLinks.length > 0) { workingLink = candidateLinks[0].href; }

      /* Skipping expensive checks to speed up extraction */

      // First Priority for Pixeldrain: Rewrite to pixeldrain.dev/u/
      // Matches both api/file/xxx and /u/xxx
      if (
        /(?:pixeldrain\.(?:com|dev|net)|pixel\.drain|pixeldra\.in)\/(?:api\/file|u)\/([a-zA-Z0-9_-]+)/i.test(
          workingLink,
        )
      ) {
        workingLink = workingLink.replace(
          /.*(?:pixeldrain\.(?:com|dev|net)|pixel\.drain|pixeldra\.in)\/(?:api\/file|u)\/([a-zA-Z0-9_-]+).*/i,
          "https://pixeldrain.dev/u/$1",
        );
      }

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
        return { text: c.text.trim(), href };
      });

      const bodyText = $("body").text();
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
        if (c.href.includes("hubcloud") || c.href.includes("moviesdrive") || c.href.includes("vcloud") || c.href.includes("hubdrive")) {
           nextHubcloudLink = c.href;
           break;
        }
      }

      if (nextHubcloudLink && nextHubcloudLink !== url) {
         try {
           const recursiveRes = await performExtraction(nextHubcloudLink, false, depth + 1);
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

      return {
        url: workingLink,
        candidates: returnCandidates,
        size: sizeInfo,
      };
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
        if (finalUrl !== url && !finalUrl.includes('hubcloud') && !finalUrl.includes('moviesdrive') && !finalUrl.includes('vcloud') && !finalUrl.includes('hubdrive')) {
           return { url: finalUrl };
        }
      }
      console.error("Link extraction error:", e.message);
      return { url };
    }
  }

  linkExtractionRouter.post("/api/hubcloud/direct-link", async (req, res) => {
    try {
      const { url, checkOnly, isVcloud } = req.body;
      const isCheckOnly = Boolean(checkOnly);
      const isVcloudBool = Boolean(isVcloud);
      const cacheKey = `direct_${url}_${isCheckOnly}`;
      
      const cached = extractionCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return res.json(cached.data);
      }

      // In-flight coalescing
      if (inFlightRequests.has(cacheKey)) {
        const data = await inFlightRequests.get(cacheKey);
        return res.json(data);
      }

      const extractPromise = performExtraction(url, isCheckOnly, 0, isVcloudBool);
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

        // Only cache if extraction was successful (i.e. url has changed and is different from the input url)
        const isSuccessfulLink = data && data.url && data.url !== url;
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
      res.json({ url: req.body.url });
    }
  });
