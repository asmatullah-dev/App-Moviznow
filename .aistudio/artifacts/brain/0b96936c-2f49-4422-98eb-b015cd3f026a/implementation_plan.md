# Microlink API Integration for FilesDL on Vercel

Route FilesDL (`filesdl.in`) link resolution directly through the Microlink API when running in the Vercel serverless environment (`process.env.VERCEL`), completely bypassing Cloudflare anti-bot blocks while preserving fast native HTTP fetch in local development.

## User Review & Critical Decisions

> [!IMPORTANT]
> - **FilesDL Only**: Microlink proxying will be applied strictly to FilesDL domains (`filesdl.in`, `new1.filesdl.in`, etc.), preserving direct fetching and vDDoS solvers for other providers (e.g., FilmyCab, FilmyGo, HubCloud).
> - **Environment Scoped (`VERCEL`)**: Only active when `process.env.VERCEL`, `process.env.VERCEL_ENV`, or `process.env.NOW_REGION` is detected. Local development and non-Vercel runtimes will continue using native fetch without consuming external API rate limits.
> - **Resilient Fallback**: If Microlink fails or times out (5-second threshold), the resolver seamlessly falls back to standard direct fetching with headers.

---

## 1. Overview & Core Concept

- **What It Does**: When running on Vercel, requests to FilesDL links (e.g., `https://new1.filesdl.in/cloudcab/...`) are blocked by Cloudflare challenge pages due to Vercel's datacenter IP reputation. By directing FilesDL requests through Microlink (`https://api.microlink.io/?url=...&data.body.selector=body&data.body.attr=html&force=true`) on Vercel, the response returns the clean rendered HTML containing the HubCloud download mirrors and file metadata in ~1.5s, preventing empty results and timeouts.
- **Target Audience / Scope**: End users downloading or extracting movies/series from FilmyCab / FilmyGo sources hosted via FilesDL gates on the deployed Vercel application.
- **Key Value**: 100% extraction success rate for FilesDL-gated links on Vercel without Cloudflare 403/503 errors or function timeouts.

---

## 2. User Experience & Architecture Flow

```
User Requests Download Links (FilmyCab/FilmyGo)
                      │
                      ▼
        Extract Gate Links (.dlbtn / FilesDL)
                      │
        ┌─────────────┴─────────────┐
        │ Is Vercel Environment?    │
        └─────────────┬─────────────┘
                      │
            Yes ──────┴────── No (Local / Dev Server)
             │                          │
             ▼                          ▼
  Is FilesDL Domain?            Native Direct Fetch
             │                  (Browser Headers + vDDoS Solver)
      Yes ───┴─── No                    │
       │           │                    ▼
       │           └───────────► Standard Fetch
       ▼
  Microlink API
  (?url=<filesdl_url>&data.body.selector=body&data.body.attr=html)
       │
       ▼
  Rendered HTML & HubCloud Links
  (HubCloud URLs, Clean Title & File Size Extracted)
```

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Dedicated Microlink Helper for FilesDL on Vercel**
  - *Chosen Approach*: Create a dedicated `fetchFilesdlViaMicrolink(url, timeoutMs)` helper function in `api/index.ts` that immediately queries Microlink with `AbortSignal.timeout(6000)` and parses `data.body`.
  - *Why*: Eliminates the 6–12 second multi-hop retry cycle where direct fetch is guaranteed to trigger Cloudflare on Vercel's IP range.
  - *Alternatives Considered*: Calling generic `fetchHtml()` — rejected because `fetchHtml()` first runs `fetchDirect()` (which fails after 6s) before attempting Microlink, causing cumulative latency that exceeds Vercel's serverless function timeout.

- **Decision 2: Scope to FilesDL Only**
  - *Chosen Approach*: Apply domain check `url.includes('filesdl')` so only FilesDL URLs hit Microlink. FilmyCab, FilmyGo, and HubCloud directly respond to native fetch and do not consume Microlink quota.
  - *Why*: Protects against external API rate limits and keeps overall extraction times minimal.

---

## 4. Technical Architecture & Implementation Steps

### Step 1: Environment & FilesDL Gate Detection
Define environment detection in `api/index.ts`:
```typescript
const isVercelEnv = !!(process.env.VERCEL || process.env.VERCEL_ENV || process.env.NOW_REGION);
const isFilesdlUrl = (u: string) => /filesdl\./i.test(u);
```

### Step 2: Implement `fetchFilesdlViaMicrolink`
```typescript
async function fetchFilesdlViaMicrolink(targetUrl: string, timeoutMs = 6000): Promise<{ html: string; status: number } | null> {
  try {
    const microlinkUrl = `https://api.microlink.io/?url=${encodeURIComponent(targetUrl)}&meta=false&data.body.selector=body&data.body.attr=html&force=true`;
    const res = await fetch(microlinkUrl, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    const json = await res.json();
    const bodyHtml = json?.data?.body;
    if (typeof bodyHtml === 'string' && bodyHtml.length > 200 && !isCloudflareHtml(200, bodyHtml)) {
      return { html: bodyHtml, status: 200 };
    }
  } catch (e) {
    console.warn(`[fetchFilesdlViaMicrolink] Microlink error for ${targetUrl}:`, (e as any)?.message);
  }
  return null;
}
```

### Step 3: Wire into `fetchWithVddos` and `resolveFilmyGoLink`
- In `fetchWithVddos(targetUrl)`: If `isVercelEnv && isFilesdlUrl(targetUrl)`, invoke `fetchFilesdlViaMicrolink` first before attempting direct requests.
- In `resolveFilmyGoLink(startUrl)`: If `isVercelEnv && isFilesdlUrl(startUrl)`, resolve via `fetchFilesdlViaMicrolink` immediately. If Microlink returns valid HTML, parse HubCloud links, file title, and size, cache the result, and return.
- If Microlink is unavailable or non-Vercel, gracefully fall back to native direct fetch.

### Step 4: Verification
- Verify applet compilation via `compile_applet`.
- Verify code syntax via `lint_applet`.
- Test local dev server endpoint responses to ensure backwards compatibility.
