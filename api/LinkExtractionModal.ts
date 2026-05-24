import { Router } from 'express';
import axios from 'axios';
import * as cheerio from 'cheerio';

export const linkExtractionRouter = Router();

const extractionCache = new Map<string, { data: any, timestamp: number }>();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes cache

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

      const headers = {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      };

      const response = await axios.get(url, {
        headers,
        validateStatus: () => true,
        timeout: 8000,
        maxContentLength: 5242880,
        maxBodyLength: 5242880,
      });
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

      if (isCloudflare) {
        try {
          // Use Microlink proxy API to bypass Cloudflare
          const dlRes = await axios.get(
            `https://api.microlink.io/?url=${encodeURIComponent(url)}&meta=false&data.body.selector=body&data.body.attr=html&force=true`,
            { timeout: 8000 },
          );
          if (dlRes.data && dlRes.data.data && dlRes.data.data.body) {
            const proxyHtml = dlRes.data.data.body;
            const $proxy = cheerio.load(proxyHtml);
            let sStr =
              $proxy('li:contains("File Size") i').text() ||
              $proxy('li:contains("File Size")').text() ||
              $proxy('li:contains("Size") i').text() ||
              $proxy('li:contains("Size")').text();
            sStr = sStr.replace("File Size", "").replace("Size", "").trim();
            if (sStr) {
              sizeStr = sStr;
            }

            const proxyTitle =
              $proxy("title").text() || $proxy(".card-header").text() || "";
            if (
              proxyTitle &&
              !proxyTitle.toLowerCase().includes("just a moment")
            ) {
              title = proxyTitle;

              // Recalculate size stuff based on fixed html
              if (sizeStr) {
                const parts = sizeStr.split(" ");
                if (parts.length >= 2) {
                  let num = parseFloat(parts[0]);
                  unit = parts[1].toUpperCase();
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
            } else {
              title = "Unknown (Cloudflare Block)";
            }
          } else {
            title = "Unknown (Cloudflare Block)";
          }
        } catch (err) {
          title = "Unknown (Cloudflare Block)";
        }
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

      res.json(responseData);
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
            timeout: 5000,
            responseType: "stream",
          });
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
        (!url.includes("hubcloud") &&
          !url.includes("moviesdrive") &&
          !url.includes("vcloud") &&
          !url.includes("hubdrive"))
      ) {
        return { url };
      }

      const response = await axios.get(url, {
        headers,
        validateStatus: () => true,
        timeout: 10000,
        maxContentLength: 5242880,
        maxBodyLength: 5242880,
      });
      let $ = cheerio.load(response.data);

      const titleText = $("title").text().toLowerCase();
      const isCf =
        titleText.includes("just a moment") ||
        titleText.includes("cloudflare") ||
        titleText.includes("ddos protection") ||
        response.status === 403 ||
        response.status === 503;

      if (isCf) {
        try {
          const dlRes = await axios.get(
            `https://api.microlink.io/?url=${encodeURIComponent(url)}&meta=false&data.body.selector=body&data.body.attr=html&force=true`,
            { timeout: 8000 },
          );
          if (dlRes.data && dlRes.data.data && dlRes.data.data.body) {
            const proxyTitle =
              cheerio.load(dlRes.data.data.body)("title").text().toLowerCase() || "";
            if (
              !proxyTitle.includes("just a moment") &&
              !proxyTitle.includes("cloudflare") &&
              !proxyTitle.includes("ddos protection")
            ) {
              $ = cheerio.load(dlRes.data.data.body);
            } else {
              return { url: url, isCloudflare: true };
            }
          } else {
            return { url: url, isCloudflare: true };
          }
        } catch (err) {
          return { url: url, isCloudflare: true };
        }
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
        let res2 = await axios.get(nextUrl, {
          headers,
          validateStatus: () => true,
          timeout: 8000,
          maxContentLength: 5242880,
          maxBodyLength: 5242880,
        });
        $2 = cheerio.load(res2.data);

        const titleText2 = $2("title").text().toLowerCase();
        const isCf2 =
          titleText2.includes("just a moment") ||
          titleText2.includes("cloudflare") ||
          titleText2.includes("ddos protection") ||
          res2.status === 403 ||
          res2.status === 503;

        if (isCf2) {
          try {
            const dlRes2 = await axios.get(
              `https://api.microlink.io/?url=${encodeURIComponent(nextUrl)}&meta=false&data.body.selector=body&data.body.attr=html&force=true`,
              { timeout: 8000 },
            );
            if (dlRes2.data && dlRes2.data.data && dlRes2.data.data.body) {
              $2 = cheerio.load(dlRes2.data.data.body);
            }
          } catch (err) {
            // Ignore and continue with original $2
          }
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
          timeout: 5000, // Reduced to avoid hitting vercel function 10s limit
          responseType: "stream",
        });
        if (checkRes.data && typeof checkRes.data.destroy === "function") {
          checkRes.data.destroy();
        }

        let resultLink = candidate.href;
        let isWorking = false;

        if (
          checkRes.status >= 300 &&
          checkRes.status < 400 &&
          checkRes.headers.location
        ) {
          resultLink = checkRes.headers.location;
          isWorking = true; // Instantly mark as working and bypass expensive nested destination check
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
    } catch (e: any) {
      console.error(e);
      res.json({ url: req.body.url });
    }
  });
