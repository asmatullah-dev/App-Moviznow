# NativePlayer Streaming, Subtitles, Quality & Audio Fixes

A complete overhaul of nativePlayer's media pipeline to fix embedded subtitle extraction, quality pre-buffering, multi-track audio switching, and stream load latency.

### User Review & Critical Decisions

> [!IMPORTANT]
> The implementation plan incorporates all 3 confirmed choices from user clarification:
> - **Embedded Subtitles**: Strictly extract embedded subtitle tracks from the video file container without fake/online fallbacks, with extended timeout and disk/memory cue caching.
> - **Audio / Language Selection**: Seamless reload preserving exact playback timestamp and mapping the selected audio stream via universal fast remux.
> - **Quality Switching**: First extract the candidate stream link, pre-buffer the new stream in the background without freezing current playback, and switch video once buffered.

---

### 1. Overview & Core Problem Analysis

| Issue | Root Cause | Planned Fix |
|---|---|---|
| **1. Embedded subtitles showing "no embedded subtitles found"** | The backend `/api/native-player/subtitles` endpoint had a rigid 4.5s SIGKILL timeout. Demuxing subtitle packets from a remote 400MB stream over HTTP takes 10–15s, so FFmpeg was killed before writing cues. Additionally, track names containing website names (e.g. `moviesdrives.com`) masked clean language tags. | Extend extraction timeout to 35s, stream/parse WebVTT cues progressively, cache parsed cues in memory/disk by file hash and track ID, and sanitize track titles to show clean language names (e.g. "English"). |
| **2. Quality change shows "Unable to buffer" on working links** | `handleQualitySelect` tested buffering using a shadow `<video>` element. Because URLs like Pixeldrain do not end in `.mkv`, `isMkv` evaluated to `false`, causing the shadow video to load raw MKV bytes directly. Browsers cannot decode raw MKV in HTML5 `<video>`, triggering `onerror` and aborting working qualities. | First resolve/extract target quality link. Inspect container format via probe/metadata. Route MKV/HEVC through fast FFmpeg remux (`-c:v copy`) for the background test element. Verify buffer progress and swap sources once `readyState >= 3`. |
| **3. Audio/Language switch blocks stream & plays old audio** | `handleAudioSelect` attempted client-side `video.audioTracks[i].enabled = true`, which is not supported in Chromium on plain video streams and returned early without modifying the stream. When falling through, `streamMode` remained `"proxy"` (which ignores audio parameters), resetting seek to 0 and playing track 0. | Remove non-working client-side audio bypass. Trigger seamless server-side reload passing `audio=${trackId}` and `ss=${currentPos}`. Ensure backend FFmpeg maps the correct audio track (`-map 0:a:${trackId}`) with stereo AAC output for universal compatibility. |
| **4. Stream takes too long to play & lingers on "Loading Stream..."** | Pixeldrain MKVs were initially treated as plain MP4s due to missing `.mkv` in URL path. The player failed 2 playback attempts and waited 6+ seconds before escalating to transcode mode. Furthermore, an aggressive 6s watchdog attempted fallback to a non-existent FSL server. | Instant MKV container detection from Pixeldrain file info API (`video/matroska`) and probe data. Immediate fast-copy remux (`-c:v copy -c:a copy/aac`) starting in <1 second. Remove premature FSL watchdog. Dismiss loading overlay immediately on `canplay`. |

---

### 2. User Experience & Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Native Player Client                             │
│                                                                             │
│  ┌───────────────────────┐  ┌──────────────────────┐  ┌──────────────────┐  │
│  │   Quality Switcher    │  │   Audio Track Menu   │  │  Subtitle Menu   │  │
│  │ (Pre-buffer in bg ->  │  │ (Select Hindi/Eng -> │  │ (Embedded track  │  │
│  │  instant zero-freeze) │  │  seamless resume ss) │  │  WebVTT overlay) │  │
│  └───────────┬───────────┘  └──────────┬───────────┘  └────────┬─────────┘  │
│              │                         │                       │            │
│              ▼                         ▼                       ▼            │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │              Main HTML5 Video Element & High-DPI UI Overlay           │  │
│  └──────────────────────────────────┬────────────────────────────────────┘  │
└─────────────────────────────────────┼───────────────────────────────────────┘
                                      │ HTTP Range / Remux API
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Backend Streaming Engine                            │
│                                                                             │
│  ┌─────────────────────────┐  ┌──────────────────────┐  ┌────────────────┐  │
│  │ /api/native-player/info │  │ .../stream (Remux)   │  │ .../subtitles  │  │
│  │ - Pixeldrain mime check │  │ - Fast -c:v copy     │  │ - 35s timeout  │  │
│  │ - EBML track extraction │  │ - -map 0:a:${audio}  │  │ - Cue caching  │  │
│  │ - Clean language labels │  │ - Fast input -ss     │  │ - Clean names  │  │
│  └─────────────────────────┘  └──────────────────────┘  └────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Detailed Flow for Quality Switching
1. User clicks target quality (e.g., 720p or 1080p).
2. Link is extracted/resolved in background (cached if already resolved).
3. Background `<video>` element pre-buffers the stream at the exact current timestamp (`ss`).
4. Active video continues playing without stutter or freeze.
5. Once background video reaches `readyState >= 3` (ready to play through), player swaps `video.src` to new quality and resumes seamlessly.
6. If extraction or background buffer times out (15s), show informative toast and keep current quality uninterrupted.

#### Detailed Flow for Audio Switching
1. User selects target audio language (e.g., Hindi, English, Tamil).
2. Capture current playback position (`currentTime`).
3. Construct new stream URL with `audio=${trackId}` and `ss=${currentTime}`.
4. If video is H264 in MKV, FFmpeg immediately remuxes (`-c:v copy -map 0:v:0 -map 0:a:${trackId} -c:a aac`).
5. Update `video.src`, restore playback position, and hide buffer overlay as soon as frames arrive.

#### Detailed Flow for Embedded Subtitles
1. User selects subtitle track from menu.
2. Request `/api/native-player/subtitles?url=...&sub=${trackId}`.
3. Backend runs FFmpeg subtitle extraction with 35s timeout and memory caching.
4. Return parsed VTT cues directly to in-player subtitle renderer.
5. If extraction takes a few moments, show "Extracting subtitles..." toast until cues load.

---

### 3. Implementation Steps

#### Step 1: Backend `api/_nativePlayer.ts`
- Fix subtitle extraction timeout: increase from 4.5s to 35s; add in-memory/file cue caching.
- Sanitize audio & subtitle track names: if `name` looks like a URL/domain (e.g., `moviesdrives.com`), fallback to the detected ISO language name (e.g. `English`, `Hindi`).
- Enhance MKV detection in `/api/native-player/check` and `/api/native-player/info`: check Pixeldrain `mime_type === "video/matroska"`, file extensions in name, and EBML signatures.
- Improve FFmpeg remux pipeline in `/api/native-player/stream`:
  - When `audioIdx` is provided, ensure `-map 0:v:0 -map 0:a:${audioIdx}?` selects the right audio track and converts audio to AAC stereo.
  - Set `-c:v copy` when video codec is AVC/H264 for instant 0-CPU start.

#### Step 2: Frontend `src/components/nativePlayer.tsx`
- **Initial Stream Mode**: Detect MKV early (from `mediaInfo` or Pixeldrain info); do not attempt raw playback of MKV container in HTML5 `<video>` tags.
- **Audio Switching**: Remove faulty `v.audioTracks` bypass; implement clean position-preserving reload with `audio=${trackId}` and `ss=${currentPos}`.
- **Quality Switching**: First extract the candidate URL; determine correct stream mode (remux vs direct); pre-buffer in background with 15s timeout; switch smoothly when buffered.
- **Buffer & Watchdog cleanup**: Remove 6s premature FSL fallback timer; clear `isBuffering` promptly on `canplay` / `timeupdate` to avoid stuck "Loading Stream..." overlay.

#### Step 3: Verification & Testing
- Test with provided link: `https://pixeldrain.dev/u/QgL8g9rN`.
- Verify embedded English subtitle extraction and display on video.
- Verify audio track selection (Hindi AAC 5.1).
- Verify quality switching without false "unable to buffer" errors.
- Verify fast stream start time (<1.5 seconds) and no lingering "Loading Stream..." overlay.
- Run `compile_applet` to confirm clean build.
