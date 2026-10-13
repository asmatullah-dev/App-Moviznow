# Fix NativePlayer Playback for Pixeldrain & FSL Server Streams

Restore direct, buffer-free playback for extracted HubCloud links (Pixeldrain and FSL Server) inside `nativePlayer` while strictly preserving zero Vercel Fast Data Transfer and Fast Origin Transfer.

---

## 1. Problem Diagnosis & Root Causes

Through live testing of `https://hubcloud.ist/drive/dqqii2ppchdd2vv`:
1. **CORS Rejection on FSL Server (Cloudflare R2)**:
   - In `src/components/nativePlayer.tsx`, `<video crossOrigin="anonymous">` was added.
   - FSL Server streams from Cloudflare R2 (`b4d5...r2.cloudflarestorage.com`), which does **not** send `Access-Control-Allow-Origin`.
   - The browser's media player immediately rejected the stream with a CORS failure before fetching video frames.
2. **Matroska (MKV) & HEVC Container Incompatibility in HTML5 `<video>`**:
   - The extracted link is `Maremma (2026) ... 480p.mkv` (HEVC video in Matroska container).
   - Standard browser `<video src="...">` cannot decode raw `.mkv` files natively on desktop Chrome/Firefox without remuxing.
3. **Overly Aggressive 307 Redirect in API**:
   - `api/_nativePlayer.ts` was redirecting all FSL/Pixeldrain requests with HTTP 307 right back to the raw MKV URL even when a remux or transcode was required, creating an unplayable loop.
4. **Download & Direct Link Retention**:
   - Downloads should still open the official server drive/link in a new tab (Pixeldrain `/u/:id` and FSL direct drive link).

---

## 2. Proposed Architecture & Solution

### A. Remove Blocking `crossOrigin="anonymous"` from Video Elements
- HTML5 `<video src="...">` can play media cross-origin without CORS credentials if `crossOrigin` attribute is omitted.
- Stripping `crossOrigin="anonymous"` allows Cloudflare R2 FSL links to load and stream directly without CORS blocks.

### B. Client-First Direct Edge Playback (0 Vercel Bandwidth)
- **Direct Edge Strategy**:
  - Pixeldrain streams directly via `https://pixeldrain.com/api/file/{id}`.
  - FSL Server streams directly via the presigned edge URL without passing bytes through Vercel.
  - No video packets route through Vercel serverless functions (guaranteeing 0 Fast Data Transfer and 0 Fast Origin Transfer).

### C. Graceful Fallback for MKV/HEVC Containers
- If a client device cannot decode the direct MKV stream (or on unsupported desktop browsers):
  - In environments where backend FFmpeg is available (e.g. Docker, Cloud Run, local node server), stream through fast container remux (`-c:v copy -c:a aac`) at 0 CPU overhead.
  - In Vercel environments (where FFmpeg is unavailable and serverless egress costs apply), seamlessly toggle to the HubCloud Web Engine (`engine === "web"` with `watchUrl` from `hbplay.pages.dev`) inside `nativePlayer` so playback never fails and 0 Vercel bandwidth is consumed.

### D. Server Selector & Track Synchronization
- The icon-only Server switcher button (`<Server className="w-3.5 h-3.5" />`) seamlessly toggles between **Pixeldrain Server** and **FSL Server**.
- Switching servers retains current playback time (`currentTime`), refreshes embedded audio and subtitle tracks, and updates the download link.

---

## 3. Verification & Testing Steps

1. Test extraction of `https://hubcloud.ist/drive/dqqii2ppchdd2vv` in `nativePlayer`.
2. Verify Pixeldrain stream plays directly from `pixeldrain.com/api/file/9z8KpkwP`.
3. Verify FSL Server plays without CORS errors.
4. Verify server switching between Pixeldrain and FSL preserves playback timestamp.
5. Verify download button opens Pixeldrain `/u/9z8KpkwP` or FSL drive link in a new tab.
6. Verify app builds cleanly via `compile_applet`.
