# Implementation Plan - PlayerFU Optimization & Vercel Bandwidth Protection

## Overview
**PlayerFU** is MovizNow's instant web player powered by Play4U streams (`api/_playerFU.ts` and `src/components/PlayerFU.tsx`). It provides instant playback for movies with synchronized progress tracking, quality resolution, and custom controls.

Currently, media range requests and video segments (`/range/*`, `/api/stream/range/*`) are proxied directly through Vercel Serverless Functions via Node streaming pipes (`nodeStream.pipe(res)`). On Vercel, this consumes substantial **Fast Origin Transfer** bandwidth and risks hitting serverless execution timeouts.

This plan details how to keep PlayerFU running reliably while completely eliminating Vercel video data transfer, preventing infinite reload loops, and maintaining seamless coordination with the Native Player.

---

## Key Objectives

1. **Eliminate Vercel Fast Origin Transfer in PlayerFU**:
   - Update `api/_playerFU.ts` so video chunk range requests do not proxy binary data through the serverless function.
   - Implement HTTP 302 redirects directly to upstream media CDNs (`https://uprising.best/...`) with client-side CORS headers, or direct client fetch where appropriate.
   - Ensure Vercel functions only deliver small HTML shells (~15KB) and metadata (~1KB), cutting serverless bandwidth consumption by >99%.

2. **Preserve Player Features & UX**:
   - Keep quality selection (1080p, 720p, 480p), audio track preferences (Hindi/English), playback speed memory, and resume progress intact.
   - Retain cross-origin postMessage communication between PlayerFU iframe and the MovizNow app shell for watch history tracking.

3. **Prevent Buffering & Reload Loops**:
   - Protect PlayerFU's iframe source from remounting when stream status updates occur.
   - Add graceful error detection: if an upstream CDN stream fails or is geo-blocked, provide a direct fallback prompt to switch to the Native Player or alternative mirrors instead of stalling.

---

## Proposed Changes

### 1. Backend Range Proxying (`api/_playerFU.ts`)
- Replace the raw media chunk streaming pipe in `play4uRouter.all(["/range/*", ...])` with:
  - If request is a manifest (`.m3u8` or small text playlist), continue parsing and rewriting relative URLs.
  - If request is a media segment (`.ts`, `.mp4`, or video range byte requests), return an immediate `302 Found` redirect directly to the upstream CDN URL, offloading all video byte transfer away from Vercel.
  - Preserve CORS headers (`Access-Control-Allow-Origin: *`, `Access-Control-Expose-Headers`) so cross-origin HTML5 video/HLS players can follow the redirect smoothly.

### 2. Frontend Player Integration (`src/components/PlayerFU.tsx`)
- Verify that `activeIframeSrc` remains frozen during active playback.
- Add an error state handler: if Play4U stream is unavailable or encounters playback error, display a clean button to open the title in the **Native Player**.

### 3. Coexistence with Native Player (`src/pages/user/MovieDetails.tsx`)
- Ensure both the **Instant Play (PlayerFU)** and **Native Player** buttons are cleanly presented with clear indicators of their stream source.

---

## Verification Plan

### Automated Tests & Compilation
- Run `npm run build` / `compile_applet` to verify TypeScript contracts and imports.
- Run `lint_applet` to ensure no lint regressions.

### Manual Verification
1. Open a movie with available streams in MovizNow.
2. Launch PlayerFU ("Instant Play") and verify video loads promptly.
3. Check network tab to confirm media segment requests redirect directly to upstream CDN rather than consuming backend function bandwidth.
4. Verify playback progress saves to local storage and syncs properly.
5. Verify Native Player continues to work independently without interference.
