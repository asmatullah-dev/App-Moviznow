# Fix FSL Server Playback, Duration Seeking, and Subtitle Rendering

Fix the FSL server playback issues in `nativePlayer` where enabling subtitles blocked duration updates and scrubber interaction, caused the "Loading Stream..." overlay to get stuck while video kept playing, and prevented subtitles from displaying properly.

## User Review & Critical Decisions

> [!IMPORTANT]
> User confirmed in Phase 1 that stream duration and seeking work smoothly when subtitles are disabled, but enabling subtitles blocks duration changes, causes seeking to freeze with a persistent loading overlay, and fails to display subtitles properly. Direct edge playback with **zero Vercel Fast Origin and Fast Data Transfer** is strictly preserved.

- **Confirmed Decision 1 (Client-Side Subtitle Priority)**: External WebVTT subtitles fetched directly via browser open-CDN (`fetchDirectSubtitleTracks` and `fetchDirectSubtitleCues`) are prioritized over remote server-side demuxing. This prevents backend FFmpeg processes from saturating and throttling the FSL stream connection.
- **Confirmed Decision 2 (Non-Blocking Subtitle Overlay)**: Subtitle cue container and inner text boxes receive strict `pointer-events-none` and a z-index of `z-[25]`, ensuring they sit behind player controls (`z-30`) and never intercept touch/click gestures on the timeline scrubber.
- **Confirmed Decision 3 (Zero Vercel Transfer)**: Video streams and subtitle files are fetched directly by the client browser from edge CDNs (Cloudflare R2 / Stremio open CDN), bypassing Vercel serverless compute and keeping transfer costs at zero.

---

## 1. Overview & Core Concept

- **What It Does**: Resolves playback and UI locks on the FSL server in `nativePlayer`. Users can toggle subtitles on FSL streams without freezing playback progress or the scrubber bar. Seeking on the timeline immediately updates the current time, dismisses the loading spinner as soon as video frames render, and displays synchronized subtitles cleanly.
- **Target Audience**: Mobile and desktop users streaming movies and TV episodes via the FSL server.
- **Key Value**: Fluid seeking, unblocked touch scrubber, reliable subtitles, and instantaneous overlay dismissal with 0 Vercel transfer overhead.

---

## 2. User Experience & Visual Design

- **Timeline Scrubber Interaction**:
  - The progress bar remains fully interactive and draggable regardless of subtitle state.
  - Watched progress (`emerald` gradient) and scrubber thumb smoothly track real playback seconds.
  - Total duration is reliably displayed (e.g. `01:42:15`) in both the controls bar and header info.
- **Loading Overlay Synchronization**:
  - The "Loading Stream..." spinner overlay dismisses immediately whenever the `<video>` element emits frames (`!video.paused`).
  - Seeking triggers a responsive, non-blocking seek state that safely clears within 800ms or on the very first decoded frame.
- **Subtitle Display**:
  - Subtitle text renders crisply in a high-contrast container with rounded corners and subtle drop shadows.
  - Subtitle containers are strictly non-interactive (`pointer-events-none` throughout), positioned above video (`z-25`) and under control buttons (`z-30`) so scrubber dragging is never obstructed.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Client-Side Open-CDN Subtitles Over Server FFmpeg Demuxing**
  - *Chosen Approach*: For FSL server streams, prioritize client-side direct subtitle tracks (`fetchDirectSubtitleTracks`) and parser (`fetchDirectSubtitleCues`). If an embedded subtitle is selected, avoid launching heavy backend FFmpeg processes against remote FSL stream URLs.
  - *Why*: Remote FFmpeg processes download huge byte chunks from FSL CDN URLs to parse subtitle tracks, triggering connection saturation, stream rate-limiting, and severe seeking stalls in the user's browser. Client-side open-CDN WebVTT streams consume 0 server resources and load in milliseconds.
- **Decision 2: Resilient Duration Fallback Hierarchy**
  - *Chosen Approach*: Stream duration is resolved via: `probed container duration > content metadata runtime > browser video.duration (finite and > 60)`.
  - *Why*: Direct streams on certain CDN edge servers or MKV formats can report `duration = Infinity` or `3600` in Chromium. Falling back to the content runtime ensures `totalDuration` is always valid, keeping the progress bar moving and accurately calibrated.
- **Decision 3: Unconditional Seeking Unlock on Frame Render**
  - *Chosen Approach*: In `handleTimeUpdate`, if `!activeVid.paused` and frames are progressing, immediately clear `isSeekingRef.current = false` and `setIsBuffering(false)`.
  - *Why*: Eliminates the dead-lock where a 1.5-second delta between requested seek position and actual keyframe seek position prevented `handleTimeUpdate` from updating `currentPosition` and resetting `isBuffering`.

---

## 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────┐
│                   NativePlayer (Client)               │
├────────────────────────────────────────────────────────┤
│                                                        │
│  ┌──────────────────┐            ┌──────────────────┐  │
│  │ Direct FSL Video │            │ Open-CDN Subs    │  │
│  │ Edge Stream (R2) │            │ (Stremio / VTT)  │  │
│  └────────┬─────────┘            └────────┬─────────┘  │
│           │                               │            │
│           ▼                               ▼            │
│  ┌──────────────────┐            ┌──────────────────┐  │
│  │  HTML5 <video>   │            │ Subtitle Overlay │  │
│  │  (Edge Direct)   │            │   (z-25, pointer-│  │
│  └────────┬─────────┘            │    events: none) │  │
│           │                      └──────────────────┘  │
│           ▼                                            │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Scrubber Controls & Progress Bar (z-30)          │  │
│  │ - Unblocked timeline dragging & tapping          │  │
│  │ - Accurate duration from metadata fallback       │  │
│  │ - Fast overlay dismissal on playback frames      │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────┘
```

### Component & State Mapping

1. `src/components/nativePlayer.tsx`:
   - **Subtitle Track List**: In `computedSubtitleTracks`, place `directSubtitlesList` as first priority so direct WebVTT tracks with open CORS are chosen, bypassing backend proxying.
   - **Subtitle DOM Overlay**: Ensure all outer and inner subtitle DOM containers have `pointer-events-none` and `z-[25]` to prevent swallowing progress bar clicks.
   - **`handleTimeUpdate` & `handleActiveSeeked`**: Remove restrictive seeking locks. When `!activeVid.paused`, unconditionally set `isBuffering = false` and update `currentPosition = activeVid.currentTime`.
   - **`executeSeek`**: Safely seek within `totalDuration`, reset safety timeout to 800ms, and update state without blocking future timeupdates.
   - **`totalDuration` Calculation**: If `activeVid.duration` is `Infinity` or missing, fall back to `propDurationSeconds` (content runtime) so total duration is never 0 or 100.
2. `api/_nativePlayer.ts`:
   - Safeguard `/api/native-player/subtitles` so that if an FSL stream is probed or requested, it does not lock server resources or exhaust connection budgets. Return direct online subtitles smoothly.
