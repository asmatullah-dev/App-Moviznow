import * as fs from 'fs';

const filePath = 'api/LinkExtractionModal.ts';
let code = fs.readFileSync(filePath, 'utf8');

// The route handler starts at:
//   linkExtractionRouter.post("/api/hubcloud/direct-link", async (req, res) => {
// Then:
//     try {
//       const { url, checkOnly } = req.body;

const originalSignature = 'linkExtractionRouter.post("/api/hubcloud/direct-link", async (req, res) => {\\n    try {\\n      const { url, checkOnly } = req.body;';

const newSignature = `
  async function performExtraction(url: string, checkOnly: boolean, depth = 0): Promise<any> {
    try {`;

const endOfCodeToReplace = `      const bodyText = $("body").text();
      let sizeInfo = "";
      const sizeMatch = bodyText.match(/File Size\\s*([\\d.]+\\s*[A-Za-z]+)/i);
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
            newSize = newSize.replace(/\\.00$/, "").replace(/\\.0$/, "");
            sizeInfo = newSize + " " + unit;
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

      if (nextHubcloudLink && nextHubcloudLink !== url && depth < 2) {
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
        originalUrl: url
      };
    } catch (e: any) {
      console.error(e);
      return { url };
    }`;

// Let's locate the ending
code = code.replace(originalSignature, newSignature);

// Replacing the return json logic
const returnLogic = `      res.json({
        url: workingLink,
        candidates: returnCandidates,
        size: sizeInfo,
      });
    } catch (e: any) {
      console.error(e);
      res.json({ url: req.body.url });
    }`;

code = code.replace(returnLogic, endOfCodeToReplace);

// We still need to expose the API route!
code = code.replace('  });\n', `  }

  linkExtractionRouter.post("/api/hubcloud/direct-link", async (req, res) => {
    try {
      const { url, checkOnly } = req.body;
      const data = await performExtraction(url, checkOnly, 0);

      // Return ok stuff for checkOnly
      if (checkOnly && data && data.ok !== undefined) {
         return res.json(data);
      }

      // If cloudflare error
      if (data.isCloudflare) {
         return res.json({ url: data.url, isCloudflare: true });
      }

      return res.json(data);
    } catch (e: any) {
      console.error(e);
      res.json({ url: req.body.url });
    }
  });\n`);

// Also fix res.json return inside checkOnly
code = code.replace(/return res\\.json\\(\\{ ok: true \\}\\);/g, 'return { ok: true };');
code = code.replace(/return res\\.json\\(\\{ ok: true, location: checkRes\\.headers\\.location \\}\\);/g, 'return { ok: true, location: checkRes.headers.location };');
code = code.replace(/return res\\.json\\(\\{ ok: false \\}\\);/g, 'return { ok: false };');
code = code.replace(/return res\\.json\\(\\{ url \\}\\);/g, 'return { url };');
code = code.replace(/return res\\.json\\(\\{ url: url, isCloudflare: true \\}\\);/g, 'return { url: url, isCloudflare: true };');

// Convert size string templates that use backtick escaping issue
code = code.replace(/sizeInfo = \\\`\\$\\{newSize\\} \\$\\{unit\\}\\\`;/g, 'sizeInfo = newSize + " " + unit;');

fs.writeFileSync(filePath, code);
console.log("Rewrite successful!");
