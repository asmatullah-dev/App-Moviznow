import { Router } from 'express';
import axios from 'axios';
import * as cheerio from 'cheerio';

export const linkExtractionRouter = Router();

const extractionCache = new Map<string, { data: any, timestamp: number }>();
const CACHE_TTL = 30 * 1000; // 30 seconds

interface BypassResult {
  html: string;
  isCf: boolean;
  source: string;
}

async function raceSuccessfulBypasses(promises: Promise<BypassResult>[]): Promise<BypassResult> {
  return new Promise((resolve, reject) => {
    let rejectedCount = 0;
    const errors: any[] = [];
    if (promises.length === 0) {
      return reject(new Error("No promises provided"));
    }
    promises.forEach((p) => {
      p.then((val) => {
        resolve(val);
      }).catch((err) => {
        errors.push(err);
        rejectedCount++;
        if (rejectedCount === promises.length) {
          reject(new Error("All bypass attempts failed: " + errors.map((e) => e.message).join(", ")));
        }
      });
    });
  });
}

/**
 * Unified robust Cloudflare-bypass page fetcher with concurrent racing proxies.
 * Solves timeout issues by racing multiple proxy paths concurrently.
 */
async function fetchHtmlBypass(url: string, timeoutMs: number = 8500): Promise<{ html: string; isCf: boolean } | null> {
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
  };

  // 1. Super Fast Direct Check (1000ms limit).
  // If the target domain doesn't block direct server IPs or has transient bypasses, this returns in ~150-300ms.
  try {
    const res = await axios.get(url, { headers, timeout: 1000, validateStatus: () => true });
    if (res.status === 200 && typeof res.data === 'string') {
      const html = res.data;
      const $ = cheerio.load(html);
      const titleText = $("title").text().toLowerCase();
      const isCf =
        titleText.includes("just a moment") ||
        titleText.includes("cloudflare") ||
        titleText.includes("ddos protection");
      if (!isCf && html.length > 2000) {
        console.log(`[Bypass] Fast direct fetch succeeded for ${url}`);
        return { html, isCf: false };
      }
    }
  } catch (err: any) {
    console.log(`[Bypass] Fast direct probe failed for ${url}:`, err.message);
  }

  // Define parallel racing attempts
  const attempts: Promise<BypassResult>[] = [];

  // Route A: Microlink Standard (Very fast, fetches via residential network pool)
  attempts.push((async () => {
    const mlUrl = `https://api.microlink.io/?url=${encodeURIComponent(url)}&meta=false&data.body.selector=html&data.body.attr=html`;
    const res = await axios.get(mlUrl, { timeout: timeoutMs });
    if (res.data && res.data.data && res.data.data.body) {
      const html = res.data.data.body;
      const $ = cheerio.load(html);
      const titleText = $("title").text().toLowerCase();
      const isCf =
        titleText.includes("just a moment") ||
        titleText.includes("cloudflare") ||
        titleText.includes("ddos protection");
      if (!isCf && html.length > 2000) {
        return { html, isCf: false, source: "microlink-standard" };
      }
    }
    throw new Error("Microlink standard failed or returned Cloudflare");
  })());

  // Route B: Microlink Prerender/Headless Chromium (Highly reliable for complex JS bypasses)
  attempts.push((async () => {
    const mlUrlPrerender = `https://api.microlink.io/?url=${encodeURIComponent(url)}&meta=false&data.body.selector=html&data.body.attr=html&force=true&prerender=true`;
    const res = await axios.get(mlUrlPrerender, { timeout: timeoutMs + 1000 });
    if (res.data && res.data.data && res.data.data.body) {
      const html = res.data.data.body;
      const $ = cheerio.load(html);
      const titleText = $("title").text().toLowerCase();
      const isCf =
        titleText.includes("just a moment") ||
        titleText.includes("cloudflare") ||
        titleText.includes("ddos protection");
      if (!isCf && html.length > 2000) {
        return { html, isCf: false, source: "microlink-prerender" };
      }
    }
    throw new Error("Microlink prerender failed or returned Cloudflare");
  })());

  // Route C: AllOrigins CORS proxy fallback
  attempts.push((async () => {
    const aoUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
    const res = await axios.get(aoUrl, { timeout: timeoutMs - 1000 });
    if (res.data && res.data.contents) {
      const html = res.data.contents;
      const $ = cheerio.load(html);
      const titleText = $("title").text().toLowerCase();
      const isCf =
        titleText.includes("just a moment") ||
        titleText.includes("cloudflare") ||
        titleText.includes("ddos protection");
      if (!isCf && html.length > 2000) {
        return { html, isCf: false, source: "allorigins" };
      }
    }
    throw new Error("AllOrigins failed or returned Cloudflare");
  })());

  // Wait for any bypass to resolve successfully
  try {
    const winner = await raceSuccessfulBypasses(attempts);
    console.log(`[Bypass] Direct-link race won by ${winner.source} for ${url}`);
    return { html: winner.html, isCf: false };
  } catch (err: any) {
    console.log(`[Bypass] Racing attempts failed: ${err.message}. Falling back to last-ditch direct.`);
  }

  // 4. Last-Ditch Direct Fetch (4000ms max timeout)
  try {
    const res = await axios.get(url, { headers, timeout: 4000, validateStatus: () => true });
    if (res.data && typeof res.data === 'string') {
      const html = res.data;
      const $ = cheerio.load(html);
      const titleText = $("title").text().toLowerCase();
      const isCf =
        titleText.includes("just a moment") ||
        titleText.includes("cloudflare") ||
        titleText.includes("ddos protection");
      return { html, isCf };
    }
  } catch (err: any) {
    console.log(`[Bypass] Last-ditch direct fetch failed for ${url}:`, err.message);
  }

  return null;
}

linkExtractionRouter.post("/api/hubcloud/extract", async (req, res) => {
  try {
    const { url } = req.body;
    if (
      !url ||
      (!url.includes("hubcloud") &&
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

    const fetchResult = await fetchHtmlBypass(url);
    if (!fetchResult) {
      return res.json({
        size: "",
        unit: "",
        title: "Unknown (Bypass Failed)",
        isWorking: false,
        isNotFound: false,
      });
    }

    const { html, isCf } = fetchResult;
    const $ = cheerio.load(html);

    let title = "";
    let sizeStr = "";

    if (isCf) {
      title = "Unknown (Cloudflare Block)";
    } else {
      title = $("title").text() || $(".card-header").text() || "";
      sizeStr =
        $('td:contains("File Size")').next('td').text() ||
        $('li:contains("File Size") i').text() ||
        $('li:contains("File Size")').text() ||
        $('li:contains("Size") i').text() ||
        $('li:contains("Size")').text() ||
        "";
    }

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

    const isNotFound = title.toLowerCase().includes("not found");
    const isWorking = !isCf && !isNotFound && !!title;

    const responseData = {
      size,
      unit,
      title: title.trim(),
      isWorking: isWorking,
      isNotFound,
      isCloudflare: isCf,
    };
    
    // Cache ONLY successful resolutions
    if (responseData.isWorking && responseData.title && !responseData.title.includes("Cloudflare")) {
      extractionCache.set(cacheKey, { data: responseData, timestamp: Date.now() });
    }

    res.json(responseData);
  } catch (e: any) {
    console.error("Hubcloud extract error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

async function performExtraction(url: string, checkOnly: boolean, depth = 0): Promise<any> {
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
        const checkRes = await axios.get(url, {
          headers: { ...headers, Range: "bytes=0-0" },
          maxRedirects: 0,
          validateStatus: () => true,
          timeout: 1800,
        });
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
      (!url.includes("hubcloud") &&
        !url.includes("moviesdrive") &&
        !url.includes("vcloud") &&
        !url.includes("hubdrive"))
    ) {
      return { url };
    }

    const fetchResult = await fetchHtmlBypass(url);
    if (!fetchResult) {
      return { url };
    }

    const { html, isCf } = fetchResult;
    if (isCf) {
      return { url, isCloudflare: true };
    }

    const $ = cheerio.load(html);

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
      const fetchResult2 = await fetchHtmlBypass(nextUrl);
      if (fetchResult2) {
        if (fetchResult2.isCf) {
          return { url, isCloudflare: true };
        }
        $2 = cheerio.load(fetchResult2.html);
      }
    }

    if (!$2) {
      return { url };
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

      const isA_Worker = /\.workers\.dev/i.test(a.href);
      const isB_Worker = /\.workers\.dev/i.test(b.href);
      if (isA_Worker && !isB_Worker) return -1;
      if (!isA_Worker && isB_Worker) return 1;

      return 0;
    });

    // Find first working link
    let workingLink = url; // fallback to original hubcloud url

    const checkPromises = candidateLinks.map(async (candidate, index) => {
      let checkUrl = candidate.href;
      const checkRes = await axios.get(checkUrl, {
        headers: { ...headers, Range: "bytes=0-0" },
        maxRedirects: 0,
        validateStatus: () => true,
        timeout: 1500,
      });

      let resultLink = candidate.href;
      let isWorking = false;

      if (
        checkRes.status >= 300 &&
        checkRes.status < 400 &&
        checkRes.headers.location
      ) {
        resultLink = checkRes.headers.location;
        try {
          const nextRes = await axios.get(resultLink, {
            headers: { ...headers, Range: "bytes=0-0" },
            maxRedirects: 0,
            validateStatus: () => true,
            timeout: 1500,
          });
          if (
            nextRes.status >= 300 &&
            nextRes.status < 400 &&
            nextRes.headers.location
          ) {
            resultLink = nextRes.headers.location;
          }
          if (
            nextRes.status < 400 ||
            nextRes.status === 405 ||
            nextRes.status === 416
          ) {
            isWorking = true;
          } else {
            isWorking = false;
          }
        } catch (e) {
          isWorking = true;
        }
      } else if (
        checkRes.status < 400 ||
        checkRes.status === 405 ||
        checkRes.status === 416
      ) {
        isWorking = true;
      }

      if (isWorking) {
        return { index, link: resultLink };
      }
      throw new Error("Not working");
    });

    try {
      const results = await Promise.allSettled(checkPromises);
      let bestIndex = -1;

      for (const result of results) {
        if (result.status === "fulfilled") {
          if (bestIndex === -1 || result.value.index < bestIndex) {
            bestIndex = result.value.index;
            workingLink = result.value.link;
          }
        }
      }

      // If all rejected and we have candidates, fallback to first
      if (bestIndex === -1 && candidateLinks.length > 0) {
        workingLink = candidateLinks[0].href;
      }
    } catch (e) {
      if (candidateLinks.length > 0) {
        workingLink = candidateLinks[0].href;
      }
    }

    // Rewrite Pixeldrain URLs
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
    console.error(e);
    return { url };
  }
}

linkExtractionRouter.post("/api/hubcloud/direct-link", async (req, res) => {
  try {
    const { url, checkOnly } = req.body;
    const cacheKey = `direct_${url}_${checkOnly}`;
    
    const cached = extractionCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return res.json(cached.data);
    }

    const data = await performExtraction(url, checkOnly, 0);

    // Return ok stuff for checkOnly
    if (checkOnly && data && data.ok !== undefined) {
       extractionCache.set(cacheKey, { data, timestamp: Date.now() });
       return res.json(data);
    }

    // If cloudflare error
    if (data.isCloudflare) {
       const responseData = { url: data.url, isCloudflare: true };
       extractionCache.set(cacheKey, { data: responseData, timestamp: Date.now() });
       return res.json(responseData);
    }

    // Cache ONLY if successfully resolved
    if (data && ((data.candidates && data.candidates.length > 0) || (data.url && data.url !== url))) {
      extractionCache.set(cacheKey, { data, timestamp: Date.now() });
    }

    return res.json(data);
  } catch (e: any) {
    console.error(e);
    res.json({ url: req.body.url });
  }
});
