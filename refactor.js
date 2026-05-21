const fs = require('fs');

let content = fs.readFileSync('api/LinkExtractionModal.ts', 'utf8');

// We need to replace the entire `linkExtractionRouter.post("/api/hubcloud/direct-link"...` and `processHubcloudUrl` blocks.
// We can find lines by indices.
const lines = content.split('\n');
const startIdx = lines.findIndex(l => l.includes('async function processHubcloudUrl(url: string, depth = 0)'));
const endIdx = lines.findIndex(l => l.includes('  });')) + 1; // last line of router.post

// Ensure we have correct boundaries
let newCode = lines.slice(0, startIdx).join('\n') + `
  async function processHubcloudUrl(url: string, depth = 0, headers: any): Promise<{url: string, candidates: any[], size: string, isCloudflare?: boolean}> {
    if (depth > 2) return { url, candidates: [], size: "" };

    const response = await axios.get(url, {
      headers,
      validateStatus: () => true,
      timeout: 5000,
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
          \`https://api.microlink.io/?url=\${encodeURIComponent(url)}&meta=false&data.body.selector=body&data.body.attr=html&force=true\`,
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
            return { url: url, isCloudflare: true, candidates: [], size: "" };
          }
        } else {
          return { url: url, isCloudflare: true, candidates: [], size: "" };
        }
      } catch (err) {
        return { url: url, isCloudflare: true, candidates: [], size: "" };
      }
    }

    let nextUrl =
      $("#download").attr("href") ||
      $('a:contains("Generate Direct Download Link")').attr("href") ||
      $("a.btn-zip").attr("href");

    if (!nextUrl) {
       const scriptHtml = $.html();
       const match = scriptHtml.match(/var\\s+url\\s*=\\s*['"]([^'"]+)['"]/i);
       if (match && match[1]) {
          nextUrl = match[1];
       }
    }

    let $2 = null;

    if (!nextUrl) {
      if ($("a.btn").length > 0) {
        $2 = $;
      } else {
        return { url, candidates: [], size: "" };
      }
    } else {
      let res2 = await axios.get(nextUrl, {
        headers,
        validateStatus: () => true,
        timeout: 5000,
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
            \`https://api.microlink.io/?url=\${encodeURIComponent(nextUrl)}&meta=false&data.body.selector=body&data.body.attr=html&force=true\`,
            { timeout: 8000 },
          );
          if (dlRes2.data && dlRes2.data.data && dlRes2.data.data.body) {
            $2 = cheerio.load(dlRes2.data.data.body);
          }
        } catch (err) { }
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
            scriptContent.includes(\`getElementById("\${id}")\`) ||
            scriptContent.includes(\`getElementById('\${id}')\`)
          ) {
            const assignmentMatch = scriptContent.match(
              new RegExp(
                \`getElementById\\\\(['"]\${id}['"]\\\\)\\\\.href\\\\s*=\\\\s*([a-zA-Z0-9_]+)\`
              ),
            );
            if (assignmentMatch && assignmentMatch[1]) {
              const varName = assignmentMatch[1];
              const varMatch = scriptContent.match(
                new RegExp(
                  \`(?:var|let|const)\\\\s+\${varName}\\\\s*=\\\\s*['"]([^'"]+)['"]\`
                ),
              );
              if (varMatch && varMatch[1]) {
                href = varMatch[1];
              }
            } else {
              const directMatch = scriptContent.match(
                new RegExp(
                  \`getElementById\\\\(['"]\${id}['"]\\\\)\\\\.href\\\\s*=\\\\s*['"]([^'"]+)['"]\`
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
      return { url, candidates: [], size: "" };
    }

    candidateLinks.sort((a, b) => {
      const isA_PD = /pixeldrain|pixel\\.drain|pixeldra\\.in/i.test(a.text) || /pixeldrain|pixel\\.drain|pixeldra\\.in/i.test(a.href);
      const isB_PD = /pixeldrain|pixel\\.drain|pixeldra\\.in/i.test(b.text) || /pixeldrain|pixel\\.drain|pixeldra\\.in/i.test(b.href);
      if (isA_PD && !isB_PD) return -1;
      if (!isA_PD && isB_PD) return 1;

      const isA_Worker = /\\.workers\\.dev/i.test(a.href);
      const isB_Worker = /\\.workers\\.dev/i.test(b.href);
      if (isA_Worker && !isB_Worker) return -1;
      if (!isA_Worker && isB_Worker) return 1;

      return 0;
    });

    let workingLink = url;
    const checkPromises = candidateLinks.map(async (candidate, index) => {
      let checkUrl = candidate.href;
      const checkRes = await axios.get(checkUrl, {
        headers: { ...headers, Range: "bytes=0-0" },
        maxRedirects: 0,
        validateStatus: () => true,
        timeout: 2500,
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
            timeout: 2500,
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
      if (bestIndex === -1 && candidateLinks.length > 0) {
        workingLink = candidateLinks[0].href;
      }
    } catch (e) {
      if (candidateLinks.length > 0) {
        workingLink = candidateLinks[0].href;
      }
    }

    if (/(?:pixeldrain\\.(?:com|dev|net)|pixel\\.drain|pixeldra\\.in)\\/(?:api\\/file|u)\\/([a-zA-Z0-9_-]+)/i.test(workingLink)) {
      workingLink = workingLink.replace(
        /.*(?:pixeldrain\\.(?:com|dev|net)|pixel\\.drain|pixeldra\\.in)\\/(?:api\\/file|u)\\/([a-zA-Z0-9_-]+).*/i,
        "https://pixeldrain.dev/u/$1",
      );
    }

    const returnCandidates = candidateLinks.map((c) => {
      let href = c.href;
      if (/(?:pixeldrain\\.(?:com|dev|net)|pixel\\.drain|pixeldra\\.in)\\/(?:api\\/file|u)\\/([a-zA-Z0-9_-]+)/i.test(href)) {
        href = href.replace(
          /.*(?:pixeldrain\\.(?:com|dev|net)|pixel\\.drain|pixeldra\\.in)\\/(?:api\\/file|u)\\/([a-zA-Z0-9_-]+).*/i,
          "https://pixeldrain.dev/u/$1",
        );
      }
      return { text: c.text.trim(), href };
    });

    const bodyText = $("body").text();
    let sizeInfo = "";
    const sizeMatch = bodyText.match(/File Size\\s*([\\d.]+\\s*[A-Za-z]+)/i);
    if (sizeMatch && sizeMatch[1]) {
      sizeInfo = sizeMatch[1].trim();
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
          newSize = newSize.replace(/\\.00$/, "").replace(/\\.0$/, "");
          sizeInfo = \`\${newSize} \${unit}\`;
        }
      }
    }

    // Now check if there is a hubcloud candidate, if so we recurse!
    let nextHubcloudLink = "";
    for (const c of returnCandidates) {
      if (c.href.includes("hubcloud") || c.href.includes("moviesdrive") || c.href.includes("vcloud") || c.href.includes("hubdrive")) {
         nextHubcloudLink = c.href;
         break;
      }
    }

    if (nextHubcloudLink && nextHubcloudLink !== url) {
       try {
         const recursiveRes = await processHubcloudUrl(nextHubcloudLink, depth + 1, headers);
         if (recursiveRes.candidates && recursiveRes.candidates.length > 0) {
           if (!recursiveRes.size && sizeInfo) recursiveRes.size = sizeInfo;
           return recursiveRes;
         }
       } catch (err) {
         console.error("Recursive hubcloud error", err);
       }
    }

    return {
      url: workingLink,
      candidates: returnCandidates,
      size: sizeInfo,
    };
  }

  linkExtractionRouter.post("/api/hubcloud/direct-link", async (req, res) => {
    try {
      const { url, checkOnly } = req.body;
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
            return res.json({ ok: true });
          }
          if (
            checkRes.status >= 300 &&
            checkRes.status < 400 &&
            checkRes.headers.location
          ) {
            return res.json({ ok: true, location: checkRes.headers.location });
          }
          return res.json({ ok: false });
        } catch (e) {
          return res.json({ ok: false });
        }
      }

      if (
        !url ||
        (!url.includes("hubcloud") &&
          !url.includes("moviesdrive") &&
          !url.includes("vcloud") &&
          !url.includes("hubdrive"))
      ) {
        return res.json({ url });
      }

      const result = await processHubcloudUrl(url, 0, headers);
      if (result.isCloudflare) {
        return res.json({ url: result.url, isCloudflare: true });
      }
      return res.json({
        url: result.url,
        candidates: result.candidates,
        size: result.size
      });
    } catch (e: any) {
      console.error(e);
      res.json({ url: req.body.url });
    }
  });

` + lines.slice(endIdx).join('\n');

fs.writeFileSync('api/LinkExtractionModal.ts', newCode);
console.log('done modifying api/LinkExtractionModal.ts');
