# NativePlayer Streaming & Server Alignment Architecture

A refined, high-performance streaming architecture for `nativePlayer` that prioritizes direct client-side playback, decouples media delivery from Vercel compute and bandwidth limits, strictly binds subtitles, audio, and downloads to the active server (Pixeldrain or FSL), and ensures single-slot instant quality switching with continuous playback position retention.

### User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural decisions incorporate the latest user feedback and are codified into this implementation:

- **Confirmed Decision 1 (Pixeldrain Direct Playback via `/api/file/`)**:
  - Direct video playback for Pixeldrain strictly streams via the direct media endpoint: `https://pixeldrain.com/api/file/{id}` (or `https://pixeldrain.dev/api/file/{id}`).
  - Any `/u/{id}` link encountered is immediately normalized to `/api/file/{id}` for stream playback.
- **Confirmed Decision 2 (FSL Direct Playback)**:
  - FSL server streams directly via the FSL CDN/storage edge URL (`fslCandidate.href`).
- **Confirmed Decision 3 (Subtitle & Audio Sourcing)**:
  - When streaming via Pixeldrain, subtitles and audio are extracted directly from the Pixeldrain `/api/file/{id}` stream.
  - When streaming via FSL server, subtitles and audio are extracted directly from the FSL server stream.
  - No fallback to external CDN providers when embedded stream tracks exist.
- **Confirmed Decision 4 (Quality Switch Transition)**:
  - A single-slot instant transition will be used for quality adjustments, capturing the exact playback timestamp and restoring it immediately upon source load.
- **Confirmed Decision 5 (Download Handling - Open Drive in New Tab)**:
  - The download button opens the extracted drive/file link in a new tab (`target="_blank"`, `rel="noopener noreferrer"`) matching our previous proven download workflow:
    - For **Pixeldrain**, opens the Pixeldrain page (`getPixeldrainDownloadUrl(...)` e.g. `https://pixeldrain.com/u/{id}`).
    - For **FSL Server**, opens the FSL drive/direct link in a new tab.
- **Confirmed Decision 6 (Headers & Referrals)**:
  - Referrals and standard request headers are preserved (no forced `referrerPolicy="no-referrer"` stripping) so upstream CDN origins (e.g. hbplay, hubcloud) receive legitimate referrers without blocking requests.
  - Direct edge streaming to `<video src="..." />` is maintained to guarantee zero Vercel Fast Origin Transfer and zero Fast Data Transfer.
- **Confirmed Decision 7 (Icon-Only Control Buttons)**:
  - The Server switcher button in the player control bar is strictly **icon-only** (`<Server className="w-3.5 h-3.5" />`) with **no text label on the button**, maintaining a clean, minimalist UI without text clutter.

---

### 1. Overview & Core Concept

- **What It Does**: Upgrades the video player engine to operate with 100% direct-to-edge playback from primary content delivery servers:
  - Pixeldrain streams directly via `/api/file/{id}`.
  - FSL server streams directly via its high-speed storage/CDN edge.
  It eliminates heavy serverless proxying, prevents costly Vercel Fast Origin and Fast Data Transfer charges, isolates media metadata (audio streams, subtitle cues, and download endpoints) to the user's active streaming server, and guarantees lossless timeline continuity during quality transitions.
- **Target Audience / Persona**: Users seeking fast, buffer-free playback of high-definition video files with responsive track selection and reliable downloads.
- **Key Value**: Instant playback start times, zero serverless egress bottlenecks, clean subtitle synchronization, and unbroken continuity when altering video resolutions.

---

### 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Playback Initialization**: User opens a media title. Player probes the direct video stream from the active server (Pixeldrain `/api/file/{id}` by default if present, or FSL server direct URL). The `<video>` element loads directly from origin CDN edges with legitimate headers and referrals preserved.
  2. **Server Awareness & Selection**: When both Pixeldrain and FSL servers are detected, the bottom control bar displays a sleek, **icon-only** Server switcher button (`<Server className="w-3.5 h-3.5" />` with NO button text). Clicking it opens the popup menu listing "Pixeldrain Server" and "FSL Server" with checkmarks. Selecting a server immediately updates the stream, re-probes its embedded audio and subtitle tracks, updates the download target, and resumes at the current timestamp.
  3. **Strict Embedded Track Selection**: The Subtitle and Audio menus list only the tracks muxed inside the active server's video container. Selecting an audio track switches tracks directly in the browser via `HTMLMediaElement.audioTracks`. Selecting a subtitle track renders crisp overlay cues demuxed from the active server stream.
  4. **Single-Slot Quality Adjustment**: Clicking a resolution option (e.g. 1080p, 720p) stores `currentTime`, swaps the video `src` to the new quality candidate, and restores `currentTime` as soon as `canplay`/`loadedmetadata` fires, ensuring no loss of playback progress.
  5. **Direct Download in New Tab**: Clicking the top-right download button opens the extracted server link in a new tab (Pixeldrain `/u/:id` page for Pixeldrain, or FSL drive link for FSL server).

- **Visual Identity & Theme**:
  - *Color Palette & Mood*: Deep obsidian backdrop (`#000000` / `#0a0a0a`), crisp emerald accents (`text-emerald-400`, `bg-emerald-500/20`), translucent frosted-glass HUD overlays (`backdrop-blur-xl bg-black/60`).
  - *Typography & Controls*: High-legibility tabular figures (`font-mono tabular-nums`), clean unboxed metadata with bullet separators, icon-only server toggle button, and responsive touch controls.
  - *Feedback*: Subtle loading spinner within the quality button during stream resolution, toast notifications confirming server/quality changes, and clear checkmark indicators for active selections.

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1: Direct Edge Playback with Pixeldrain `/api/file/` and Referrals Preserved**
  - *Chosen Approach*:
    - Pixeldrain stream URLs are normalized to `https://pixeldrain.com/api/file/{id}` and supplied directly to `<video src="..." />`.
    - FSL stream URLs are supplied directly to `<video src="..." />`.
    - Standard browser headers and referrals are preserved.
    - Any auxiliary calls hitting `/api/native-player/stream` issue an immediate HTTP 307 redirect directly to origin.
  - *Why*: Eliminates Vercel Fast Origin Transfer and Fast Data Transfer bandwidth fees, while ensuring CDNs and storage providers that require referrers accept requests without 403 Forbidden errors.
  - *Alternatives Considered*: Server-side chunk streaming (rejected due to excessive serverless transfer costs and latency).

- **Decision 2: Strict Server-Bound Ecosystem for Pixeldrain & FSL**
  - *Chosen Approach*: When Pixeldrain is the active stream server, all audio tracks, subtitle tracks, and download triggers strictly derive from Pixeldrain. When FSL server is active, all tracks and download URLs strictly derive from FSL.
  - *Why*: Prevents track mismatches, audio desynchronization, or cross-server download failures.
  - *Alternatives Considered*: Mixed-source fallbacks (rejected per user requirement for strict server isolation).

- **Decision 3: Proven Download Tab Opening Workflow**
  - *Chosen Approach*: Clicking download opens the link in a new tab (`window.open(targetUrl, "_blank", "noopener,noreferrer")` / `<a href={targetUrl} target="_blank" rel="noopener noreferrer">`). For Pixeldrain, it opens the Pixeldrain page (`getPixeldrainDownloadUrl`); for FSL server, it opens the FSL drive/direct link.
  - *Why*: Matches previous proven download behavior that users rely on.
  - *Alternatives Considered*: Background blob downloading (rejected due to memory constraints on large multi-gigabyte video files).

- **Decision 4: Icon-Only Control Buttons**
  - *Chosen Approach*: The Server switcher button contains only the `<Server />` icon without text labels on the button surface.
  - *Why*: Maximizes horizontal real estate on mobile and tablet screens, avoids label clutter, and maintains clean aesthetic symmetry.
  - *Alternatives Considered*: Text labels on buttons (rejected per explicit user request).

- **Decision 5: Single-Slot Instant Switch with Exact Position Retention**
  - *Chosen Approach*: Streamlined single-slot switch: capture `currentTime`, set new `src`, trigger `.load()`, and restore `currentTime` inside `onLoadedMetadata` and `onCanPlay`.
  - *Why*: Eliminates dual-element memory overhead while maintaining exact frame-level continuity.
  - *Alternatives Considered*: Dual-slot background crossfading (passed over per user preference for lightweight single-slot handling).

---

### 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                        NativePlayer Architecture                       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
          ┌─────────────────────────┴─────────────────────────┐
          ▼                                                   ▼
┌───────────────────────────┐                       ┌───────────────────┐
│     Pixeldrain Server     │                       │     FSL Server    │
│  - Stream: /api/file/{id} │                       │ - Direct Stream   │
│  - Embedded Audio Tracks  │                       │ - Audio Tracks    │
│  - Embedded Subtitles     │                       │ - Subtitles       │
│  - Pixeldrain /u/:id Page │                       │ - FSL Drive Link  │
└─────────┬─────────────────┘                       └─────────┬─────────┘
          │                                                   │
          └─────────────────────────┬─────────────────────────┘
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                          Active Stream Context                         │
│  - activeServer: "pixeldrain" | "fsl" | "default"                      │
│  - directStreamUrl: Direct Edge Stream URL (Pixeldrain /api/file/)     │
│  - downloadUrl: Server-Bound Download Link (opens in new tab)          │
│  - mediaInfo: Probed Audio/Subtitle Tracks (Range EBML)                │
│  - pendingQualitySwitchPosRef: Saved Continuous Position               │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                          HTML5 <video> Element                         │
│  - Direct browser playback (0 Vercel data transfer)                    │
│  - Pixeldrain plays via /api/file/{id}                                 │
│  - Standard headers and referrals preserved                            │
│  - Download action: Opens extracted server link in new tab             │
│  - Icon-only server selector button with no button text                │
└────────────────────────────────────────────────────────────────────────┘
```

- **Interactive State Model**:
  - `activeServer`: Tracks whether playback is bound to `"pixeldrain"` or `"fsl"`.
  - `directStreamUrl`: Normalized direct URL for the current server and quality level (`/api/file/{id}` for Pixeldrain).
  - `pendingQualitySwitchPosRef`: Ephemeral timestamp preserving exact playback position across quality and server transitions.
  - `downloadUrl`: Dynamically set to Pixeldrain `/u/:id` when on Pixeldrain, or FSL link when on FSL server, opening in a new tab.
