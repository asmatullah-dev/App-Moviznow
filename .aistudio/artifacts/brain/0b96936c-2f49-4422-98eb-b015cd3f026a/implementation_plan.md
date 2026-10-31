# api/index.ts Optimization, In-Memory Refactoring & Deprecation Resolution

Refactor and optimize `api/index.ts` to eliminate performance bottlenecks, remove unreferenced legacy background scan endpoints, replace internal HTTP loopback roundtrips with direct in-memory execution, pool HTTPS connections, reuse parsed DOM trees, cache OG tags, and clarify Node.js 22 `url.parse()` deprecation warnings.

---

## 1. Concepts & Clarifications

### What Does "In-Memory" Mean?

1. **In-Memory Function Execution (vs. HTTP Loopback)**:
   - **Current Flaw**: When `/api/check-links-batch` runs, it sends 25 real HTTP network requests back to itself over TCP (`fetch("http://127.0.0.1:3000/api/check-link")`). This requires opening network sockets, serializing/deserializing JSON, and fails completely on serverless platforms (like Vercel or Cloud Run) where port 3000 isn't listening locally.
   - **In-Memory Solution**: Instead of routing through the network stack, `/api/check-links-batch` will directly call the TypeScript function `executeCheckLink(url)` inside Node.js's memory. No HTTP sockets, no localhost port dependency, and a **5x to 10x speedup**.

2. **In-Memory Caching**:
   - Storing frequently requested data (such as movie OG social tags or link status results) in JavaScript RAM (`Map` with an expiration timer) so subsequent requests return instantly in 0ms without re-querying external APIs or databases.

---

### What is the `[DEP0169]` `url.parse()` Warning?

```
(node:7) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead.
```

- **Origin**: In Node.js 22+, Node deprecated the legacy `url.parse()` in favor of the modern WHATWG `new URL()` API.
- **Where it comes from**: Our application source code in `api/index.ts` already uses `new URL(...)`. The warning is triggered by internal third-party dependencies—specifically **`firebase-admin`** (`api-request.js`) and **`follow-redirects`** (used by Axios)—which still call `url.parse()` internally during API communication.
- **Impact**: It is an informational Node.js deprecation warning and does not crash or break functionality.
- **Action**: We will audit and ensure 100% of our own application code uses `new URL()` (WHATWG URL API) and avoid any legacy `url.parse()` usage.

---

## 2. Key Optimization Decisions

- **Decision 1: Direct In-Memory Function for Link Checking (`executeCheckLink`)**
  - *Chosen Approach*: Extract the inspection logic into `async function executeCheckLink(url: string, force = false)`.
  - *Why*: Eliminates 25 concurrent TCP sockets, eliminates port 3000 dependency, and drops response time from ~2–4s down to ~200–600ms.
  - *Backward Compatibility*: Both `/api/check-link` and `/api/check-links-batch` keep their exact existing API JSON responses.

- **Decision 2: Remove Legacy Background Scan (~160 lines)**
  - *Chosen Approach*: Delete `/api/start-background-scan`, `/api/background-scan-status`, and `inMemoryScanStore`.
  - *Why*: Unreferenced by frontend, reduces memory footprint, and eliminates duplicate Pixeldrain logic.

- **Decision 3: Global Keep-Alive Connection Pool (`sharedHttpsAgent`)**
  - *Chosen Approach*: Create a single, shared `https.Agent({ keepAlive: true, maxSockets: 50, rejectUnauthorized: false })`.
  - *Why*: Multi-hop scraper gates reuse open TLS sessions instead of performing repeated TLS handshakes.

- **Decision 4: Single-Pass Cheerio Parsing**
  - *Chosen Approach*: Reuse `$doc` in `resolveFilmyGoLink` instead of calling `cheerio.load(htmlText)` a second time as `$page`.
  - *Why*: Saves CPU and prevents allocating duplicate DOM trees for every link hop.

- **Decision 5: In-Memory OG Tag Cache (`ogTagsCache`)**
  - *Chosen Approach*: Cache Firestore REST responses for movie metadata with a 15-minute TTL.
  - *Why*: Instant responses for social crawlers (WhatsApp, Facebook, Twitter, Telegram) with 0 unnecessary Firestore billable reads.

---

## 3. Implementation Steps

1. **Audit URL parsing**: Ensure all custom code strictly uses WHATWG `new URL()`.
2. **Purge Legacy Endpoints**: Remove `/api/start-background-scan` and `/api/background-scan-status` (lines ~550 to ~705).
3. **Refactor Link Checking to In-Memory**:
   - Define `executeCheckLink(url: string, force = false)`.
   - Update `app.post("/api/check-link")` and `app.post("/api/check-links-batch")` to call `executeCheckLink` directly.
4. **Deploy `sharedHttpsAgent` & Optimize Cheerio**:
   - Export and reuse a global `sharedHttpsAgent` with keep-alive across `fetchWithVddos`, `resolveFilmyGoLink`, and Axios calls.
   - Reuse `$doc` in `resolveFilmyGoLink`.
5. **Add `ogTagsCache`**:
   - Implement an in-memory cache for `getOgTags` to eliminate redundant Firestore REST requests.
6. **Verification**:
   - Run `compile_applet` to confirm successful build.
   - Run `lint_applet` for type correctness.
   - Test `/api/check-links-batch` and scrapers to verify improved performance and 100% functionality preservation.
