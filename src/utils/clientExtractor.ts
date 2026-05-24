export async function extractHubcloudDirectLink(url: string, useCorsProxy = true): Promise<{url: string, size?: string, candidates?: any[], isCloudflare?: boolean, error?: string}> {
  // Try fetching directly. If CORS blocks it, fallback to our proxy or cors proxy if specified
  let fetchUrl = url;
  if (useCorsProxy) {
    // We can use an open proxy just to avoid the vercel proxy limit
    fetchUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
  }

  try {
    const res = await fetch(fetchUrl);
    
    // allorigins wraps response in JSON
    if (useCorsProxy) {
        const data = await res.json();
        const html = data.contents;
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");
        
        // Find links
        // Cloudflare check
        if (html.includes("cf-browser-verification") || html.includes("Cloudflare")) {
           return { url, isCloudflare: true };
        }
        
        const possibleLinks = Array.from(doc.querySelectorAll('a.btn, a[href*="pixeldrain"], a[href*="hubcloud"]'));
        
        let targetLink = url;
        for (const a of possibleLinks) {
            const href = a.getAttribute('href');
            if (href && (href.includes('pixeldrain.com') || href.includes('hubcloud') || href.includes('vcloud'))) {
                targetLink = href;
                break;
            }
        }
        
        return { url: targetLink };
    }
  } catch (e) {
    return { url, error: String(e) };
  }
  return { url };
}
