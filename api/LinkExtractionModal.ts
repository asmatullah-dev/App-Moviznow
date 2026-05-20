import { Router } from 'express';
import axios from 'axios';
import * as cheerio from 'cheerio';

export const linkExtractionRouter = Router();

const extractionCache = new Map<string, { data: any, timestamp: number }>();
const CACHE_TTL = 30 * 1000; // 30 seconds

/**
 * Super-resilient HTML fetcher with 4 layers of fallback for bypassing network, DNS, and cloudflare restrictions.
 */
async function fetchPageHtml(url: string, useProxyInitially = false): Promise<string> {
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
  };

  if (!useProxyInitially) {
    try {
      const res = await axios.get(url, {
        headers,
        validateStatus: () => true,
        timeout: 4000,
      });
      const html = res.data;
      if (html && typeof html === "string") {
        const $ = cheerio.load(html);
        const title = $("title").text() || "";
        const isCf =
          title.toLowerCase().includes("just a moment") ||
          title.toLowerCase().includes("cloudflare") ||
          title.toLowerCase().includes("ddos protection") ||
          res.status === 403 ||
          res.status === 503;
        
        if (!isCf) {
          return html;
        }
      }
    } catch (err: any) {
      console.warn(`Direct fetch failed for ${url}: ${err.message}. Trying proxies...`);
    }
  }

  // Fallback 1: Microlink without prerender (lightweight, super speed, bypasses IP locks & simple CF)
  try {
    const target = `https://api.microlink.io/?url=${encodeURIComponent(url)}&prerender=false&meta=false&data.body.selector=html&force=true`;
    const res = await axios.get(target, { timeout: 4000 });
    if (res.data && res.data.data && res.data.data.body) {
      return res.data.data.body;
    }
  } catch (err: any) {
    console.warn(`Microlink fast fetch failed for ${url}: ${err.message}`);
  }

  // Fallback 2: Codetabs proxy (simple, reliable fallback)
  try {
    const target = `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`;
    const res = await axios.get(target, { headers, timeout: 4000 });
    if (res.data && typeof res.data === "string") {
      return res.data;
    }
  } catch (err: any) {
    console.warn(`Codetabs fetch failed for ${url}: ${err.message}`);
  }

  // Fallback 3: Microlink with prerender=true (last resort headless chrome scraper)
  try {
    const target = `https://api.microlink.io/?url=${encodeURIComponent(url)}&prerender=true&meta=false&data.body.selector=html&force=true`;
    const res = await axios.get(target, { timeout: 6000 });
    if (res.data && res.data.data && res.data.data.body) {
      return res.data.data.body;
    }
  } catch (err: any) {
    console.warn(`Microlink heavy fetch failed for ${url}: ${err.message}`);
  }

  throw new Error(`Failed to retrieve HTML content for ${url}`);
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

    const html = await fetchPageHtml(url);
    const $ = cheerio.load(html);

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

    const title = ($("title").text() || $(".card-header").text() || "Unknown File").trim();

    const responseData = {
      size,
      unit,
      title,
      isWorking: true,
      isNotFound: false,
    };
    
    extractionCache.set(cacheKey, { data: responseData, timestamp: Date.now() });
    res.json(responseData);
  } catch (e: any) {
    console.error("Hubcloud extract error:", e.message);
    // Suppress status 500 error on Vercel to preserve fluid user interface
    const responseData = {
      size: "",
      unit: "",
      title: "Unknown File",
      isWorking: true,
      isNotFound: false,
    };
    res.json(responseData);
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
          timeout: 2500,
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

    const html = await fetchPageHtml(url);
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
      let absoluteNextUrl = nextUrl;
      if (!nextUrl.startsWith("http") && !nextUrl.startsWith("//")) {
        try {
          absoluteNextUrl = new URL(nextUrl, url).toString();
        } catch (e) {
          console.error("Failed to construct absolute next URL:", e);
        }
      } else if (nextUrl.startsWith("//")) {
        absoluteNextUrl = "https:" + nextUrl;
      }

      const html2 = await fetchPageHtml(absoluteNextUrl);
      $2 = cheerio.load(html2);
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

      if (href) {
        let absoluteHref = href;
        if (!href.startsWith("http") && !href.startsWith("//")) {
          try {
            const baseContext = nextUrl ? new URL(nextUrl, url).toString() : url;
            absoluteHref = new URL(href, baseContext).toString();
          } catch (e) {
            console.error("Failed to resolve candidate URL:", e);
          }
        } else if (href.startsWith("//")) {
          absoluteHref = "https:" + href;
        }

        if (!text.includes("telegram")) {
          candidateLinks.push({ text: text.trim(), href: absoluteHref });
        }
      }
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
    if (candidateLinks.length > 0) {
      workingLink = candidateLinks[0].href;
    }

    // First Priority for Pixeldrain: Rewrite to pixeldrain.dev/u/
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
      return { text: c.text, href };
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

    extractionCache.set(cacheKey, { data, timestamp: Date.now() });
    return res.json(data);
  } catch (e: any) {
    console.error(e);
    res.json({ url: req.body.url });
  }
});
