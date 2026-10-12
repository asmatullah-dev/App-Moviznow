# Implementation Plan: Zero-Bandwidth Direct Video Streaming, Pixeldrain Compatibility & User Status Handling

## 1. Executive Summary & Root Cause Analysis

### A. Why Vercel Bandwidth Spiked to 7.77 GB / 10 GB
- **Fast Origin Transfer**: Vercel charges "Fast Origin Transfer" on outgoing traffic emitted from serverless function invocations.
- **The Culprit**: In `/api/_nativePlayer.ts`, `/api/native-player/stream` was proxying raw video bytes by piping upstream fetch streams directly into the response (`nodeStream.pipe(res)`).
- **The Result**: Watching just 1–2 HD movies downloaded and re-uploaded 4–8 GB of data directly through Vercel compute, rapidly depleting your 10 GB monthly allowance.

### B. Why Pixeldrain Works on MX Player & VLC but Behaved Differently in Browsers
- **Address Bar vs Video Element**: When you type `https://pixeldrain.com/api/file/:id` directly into a browser address bar, Pixeldrain sends `Content-Disposition: attachment`, prompting a file download rather than playing in-tab. In contrast, an HTML5 `<video src="...">` element ignores `attachment` and streams media chunks over HTTP byte ranges (`Range: bytes=0-`).
- **Container & Codec Differences**: Many movies on Pixeldrain are formatted in Matroska containers (`.mkv`) with `HEVC / H.265` video and `AC-3 / E-AC-3` audio:
  - **MX Player & VLC** include internal decoders for MKV, HEVC, and AC-3/DTS audio, so they play network streams effortlessly.
  - **Web Browsers** (Chrome, Firefox, Safari) natively decode MP4 (H.264/AAC) and WebM, but can fail or stall on raw MKV/AC-3 without specialized decoding.
  - When proxying through Vercel, because Vercel serverless lacks FFmpeg/FFprobe, it was passing raw bytes without transcoding while burning all of your Vercel bandwidth quota.

---

## 2. Technical Architecture & Implementation Steps

### Step 1: Zero-Compute HTTP 302/307 Redirects on Vercel
- **Update `/api/_nativePlayer.ts` (`/api/native-player/stream`)**:
  - Replace the byte-streaming proxy pipeline (`nodeStream.pipe(res)`) with an immediate `HTTP 307 Temporary Redirect` (or 302) pointing directly to the target stream URL:
    ```ts
    res.setHeader("Location", targetUrl);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(307).end();
    ```
  - Standard HTML5 `<video>` elements follow HTTP 307/302 redirects automatically and negotiate byte ranges (`Range: bytes=...`) directly with the target CDN / media host.
  - **Result**: Bandwidth consumed by Vercel compute drops from **~4 GB per movie to ~200 bytes per stream request** (a 99.999% reduction).

### Step 2: Stream Resolution & Pixeldrain Normalization
- **Direct in-App Streaming**:
  - Maintain primary prioritization of FSL / Cloudflare CDN streams (which load instantly and support web streaming).
  - Normalize Pixeldrain URLs (`https://pixeldrain.com/u/:id` → `https://pixeldrain.com/api/file/:id`).
  - Pixeldrain natively sends `Access-Control-Allow-Origin: *` headers, enabling direct browser streaming.
  - For browser-supported media (MP4, H.264, WebM), video plays directly in-app with 0 compute overhead.

### Step 3: Audio Language & Subtitle Metadata Accuracy
- **Keep Lightweight JSON Probes on Vercel**:
  - Maintain `/api/native-player/info` for fast container inspection (~1 KB of JSON payload).
  - Ensure detected audio languages (Hindi, Tamil, Telugu, English, etc.) are accurately mapped and presented in the player track selector.
  - Keep `/api/native-player/subtitles` so WebVTT subtitle cues from Cinemeta / OpenSubtitles are fetched sub-second and rendered via the player overlay without delays or missing cues.

### Step 4: UI Discipline ("No keep untouch")
- Keep the native player UI controls clean and untouched:
  - No new cluttered buttons on the bottom control bar.
  - Maintain the existing clean layout, top title overlay, audio/subtitle menus, and minimal error fallback card.

### Step 5: New User Status Default to "Pending"
- Ensure that when a new user signs up or logs in for the first time:
  - If the user is neither Owner (`asmatn628@gmail.com`) nor an Admin, their initial profile is created with `role: "user"` and `status: "pending"` (rather than `"active"`).
  - Maintain strict admin verification before full access is granted.

---

## 3. Verification & Testing Checklist
1. **Bandwidth Test**: Verify that calling `/api/native-player/stream` issues an HTTP 307 redirect directly to upstream instead of buffering and piping bytes through Vercel.
2. **Playback Test**: Verify that the in-app player plays streams directly, seeks accurately, and displays buffer progress.
3. **Audio & Subtitle Test**: Verify that audio language tracks and subtitle overlays load quickly without errors.
4. **Auth Status Test**: Verify that new user sign-ins receive `role: "user"` and `status: "pending"`.
5. **Build Verification**: Run `compile_applet` and `lint_applet` to verify clean compilation with zero regressions.
