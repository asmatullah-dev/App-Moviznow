# Client-Side Multi-Audio Track Switching on Vercel

Implement seamless, client-side audio language track switching in `NativePlayer` that works directly in the browser on Vercel without relying on backend FFmpeg or consuming any Vercel Fast Origin / Fast Data Transfer bandwidth.

## User Review & Critical Decisions

> [!IMPORTANT]
> The user confirmed the following requirements:
> 1. **Client-side multi-audio isolation in the browser**: Audio switching must occur entirely client-side on Vercel, bypassing server-side transcoding proxies and keeping Vercel Fast Data Transfer at strictly zero.
> 2. **Seamless transition (MX Player / VLC style)**: Switching languages must keep the current playback second and transition audio instantaneously without reloading the video container or showing a buffering stall.

- **Confirmed Decision 1 (Client-Side Track Management)**: Utilize `HTMLMediaElement.audioTracks` where supported (Safari, modern Chromium mobile/desktop, Edge), and provide client-side Web Audio / direct stream track demuxing for browsers where `video.audioTracks` is unavailable.
- **Confirmed Decision 2 (Zero Vercel Transfer)**: Video and audio packets are streamed directly from edge CDNs (Cloudflare R2 / FSL / Pixeldrain) directly to the browser. Vercel serverless functions are not used for media byte proxying.
- **Confirmed Decision 3 (Instant In-Place Sync)**: No video reloading or canvas unmounting when switching audio. Playback time is preserved to the exact frame, synchronizing audio dialogue smoothly just like MX Player and VLC.

---

## 1. Overview & Core Concept

- **What It Does**: Enables users to switch audio languages (e.g. Hindi, Telugu, Tamil, English) on multi-audio movies and episodes on Vercel. Selecting a new language switches the audio feed in real time at the exact current position without restarting or blinking the video.
- **Target Audience**: MovizNow viewers streaming dual-audio or multi-audio content across desktop and mobile browsers.
- **Key Value**: Fluid, instantaneous audio track switching on Vercel with 0 server proxy latency and 0 Vercel transfer cost.

---

## 2. User Experience & Visual Design

- **Audio Track Selection**:
  - The Audio menu dynamically lists all detected languages (e.g., `Hindi [Default]`, `Telugu`, `Tamil`, `English`) parsed from the media container's EBML tracks.
  - Clicking a language shows an immediate subtle toast (e.g., `Audio: Telugu`) with an active emerald checkmark.
- **Seamless MX Player / VLC Experience**:
  - The video does NOT flicker, reload, or jump back to 0.
  - Playback continues uninterrupted at the exact current timestamp.
  - Lip sync and subtitle synchronization remain locked to the running playback position.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Native AudioTrack API with Web Audio Client Demuxer Fallback**
  - *Chosen Approach*: First attempt `video.audioTracks` (supported natively by Safari, iOS WebKit, Edge, and modern Chromium). If the browser environment does not expose multiple audio tracks on direct `<video src>`, activate the client-side audio player feed using lightweight range-chunked audio synchronization.
  - *Why*: Direct in-browser switching avoids any server dependency, avoids Vercel compute timeouts, and operates with zero data transfer cost.
- **Decision 2: Elimination of Forced Server Transcoding on Vercel**
  - *Chosen Approach*: On Vercel (or when `streamMode !== "transcode"`), never route audio track switches through `/api/native-player/stream?mode=transcode` where FFmpeg is absent.
  - *Why*: Prevents HTTP 307 redirects that revert back to the default track, eliminating the bug where the UI shows the new language but the audio remains unchanged.
- **Decision 3: Precise Time & Subtitle Continuity**
  - *Chosen Approach*: Preserve `currentPosition` and `activeVid.currentTime` continuously during the switch, updating `selectedAudioTrack` and audio element state without mutating video element slot or reload state.
  - *Why*: Matches MX Player and VLC mobile UX where audio switches mid-sentence without stuttering.

---

## 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                        NativePlayer (Client)                          │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  ┌───────────────────────┐              ┌───────────────────────────┐  │
│  │ Direct Video Stream   │              │ Multi-Audio Track Manager │  │
│  │ (Cloudflare R2 / FSL) │              │ - HTMLMediaElement.audio- │  │
│  │ Direct Edge CDN URL   │              │   Tracks (Native Engine)  │  │
│  └───────────┬───────────┘              │ - Client Web Audio Engine │  │
│              │                          └─────────────┬─────────────┘  │
│              ▼                                        │                │
│  ┌───────────────────────┐                            │                │
│  │ HTML5 <video> Element │ ◄──────────────────────────┘                │
│  │ - Zero flicker/reload │   (Track enable/disable & in-place sync)    │
│  │ - Continuous position │                                             │
│  └───────────┬───────────┘                                             │
│              │                                                         │
│              ▼                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ Controls Bar & Audio Menu                                        │  │
│  │ - Instant track indicator & toast feedback                       │  │
│  │ - Zero Vercel Fast Origin / Data Transfer                        │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

### Component & File Workflows

1. `src/components/nativePlayer.tsx`:
   - In `handleAudioSelect`:
     - Inspect `video.audioTracks`: if the browser exposes `audioTracks` on the video element, iterate through tracks and set `enabled = (idx === trackId)` for instant client-side switching.
     - For browsers without native `audioTracks` exposed on `<video>`, manage an auxiliary client-side audio element synchronized to `activeVid.currentTime` playing the target audio stream directly from edge range requests, muting the video's default track.
     - Never force `setStreamMode("transcode")` or reload `/api/native-player/stream` when running on Vercel or when direct edge streaming is active.
     - Maintain continuous playback without invoking `setIsBuffering(true)` or unmounting the video slot.
2. `api/_nativePlayer.ts`:
   - Ensure media info probing accurately extracts all audio track IDs, language codes, and track names from EBML / container headers, providing the client with complete track metadata for Hindi, Telugu, Tamil, etc.
   - For environments with backend FFmpeg (AI Studio / Docker), preserve server remuxing capability as a secondary option while prioritizing zero-transfer direct edge playback.
