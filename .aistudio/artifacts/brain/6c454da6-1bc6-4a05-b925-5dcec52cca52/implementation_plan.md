# YouTube Trailer Download Option in Trailer Popup

Add a dedicated trailer download action and dropdown menu to the YouTube trailer popup top bar in MovizNow, enabling users to choose video quality (1080p, 720p, 360p) or MP3 audio and start downloading via a reliable fast-redirect downloader service.

## User Review & Critical Decisions

> [!IMPORTANT]
> **Bandwidth, CDN & Server Consumption Guarantee (0 Bytes on Vercel & Cloud Run)**:
> - **Server Usage**: The trailer downloader runs **100% on the client side**. Neither Vercel serverless functions nor Google Cloud Run containers process or stream any video/audio data.
> - **Bandwidth & CDN Cost**: **Consumes 0 bytes** of Vercel Fast Origin Transfer, 0 Edge requests, and 0 Cloud Run network egress. All data transfer is handled directly between the user's browser and external YouTube downloader networks.
> - **External Web Services Used**: Proven, high-speed public web downloader services:
>   - **Y2Mate / SSYouTube / SaveFrom**: Handles multi-quality selection (1080p, 720p, 480p, 360p, MP3) with direct links.
>   - **Cobalt Tools**: Modern, open-source, ad-free video/audio downloader instance.

---

## 1. Overview & Core Concept

- **What It Does**: When users watch a movie or TV series trailer in the MovizNow YouTube trailer modal, a **Download Trailer** button appears in the top header. Clicking the button opens a dropdown menu displaying format and quality choices (1080p HD, 720p HD, 360p, and MP3 audio). Selecting any option opens the video in the downloader service with the YouTube video ID pre-loaded, ready for instant download.
- **Target Audience**: MovizNow viewers who want to save trailers offline, share high-resolution movie clips, or extract official teaser audio tracks.
- **Key Value**: Delivers instant offline access to official media trailers without leaving the MovizNow interface, installing extra software, or incurring any server bandwidth costs for the site owner.

---

## 2. Infrastructure, Hosting & Quota Safety

### Web Server & CDN Impact Analysis
| Resource | Consumption | How It Works |
| :--- | :--- | :--- |
| **Vercel Fast Origin Transfer** | **0 MB** | Client-side only. Vercel never touches video streams. |
| **Vercel Edge Requests** | **0 Requests** | Download routes bypass Vercel middleware entirely. |
| **Cloud Run CPU & Egress** | **0% CPU / 0 MB** | No server processes or FFmpeg jobs spawned. |
| **Downloader Services** | Public CDNs | Hosted by Y2Mate, SSYouTube, and Cobalt networks. |

### Why This Protects Your Deployment
1. **No IP Bans from YouTube**: YouTube aggressively rate-limits and blocks data center IPs (like Vercel and Google Cloud Run). A server-side scraper would quickly fail or get banned. By routing via client-side redirect, each download originates from the end-user's normal residential connection.
2. **Zero Hosting Bills**: High-bitrate 1080p video downloads would rapidly exhaust monthly Vercel or Cloud Run bandwidth quotas. Client-side routing ensures your hosting remains 100% free of video transfer charges.

---

## 3. User Experience & Visual Design

### Key User Flows
1. **Discoverability**: User clicks "Watch Trailer" on `MovieDetails` (or `ComingSoonSection`). The YouTube trailer popup opens with the video playing.
2. **Top Bar Action**: In the top-right overlay of the trailer card (next to "Open externally" and the close button), a compact glassmorphism button appears:
   - Icon: `Download` (Lucide icon)
   - Label: `Download` with a subtle chevron indicator `ChevronDown`
   - Styling: `bg-black/60 backdrop-blur-md text-white border border-white/10 hover:bg-black/80 hover:border-emerald-500/40 shadow-lg`
3. **Dropdown Interaction**: Clicking the button toggles a quality selection menu:
   - 🎬 **1080p Full HD (MP4)** — High bitrate official visual quality
   - 🎬 **720p HD (MP4)** — Balanced fast download
   - 📱 **360p Mobile (MP4)** — Lightweight cellular download
   - 🎵 **MP3 Audio (Audio Only)** — Soundtrack & teaser theme audio
   - ⚡ **Direct Web Downloader (Ad-free Cobalt / Y2Mate)**
4. **Download Execution**: Selecting an option triggers the download route in a new tab and fires a momentary success toast (e.g. `Downloading 1080p trailer...`).

### Visual Identity & Theme
- **Surface**: Ultra-dark glassmorphism backdrop (`bg-zinc-950/95 backdrop-blur-xl border border-white/15 rounded-xl shadow-2xl`).
- **Typography**: Clean Plus Jakarta Sans / system typography with single-line labels and subtle muted format badges.
- **Contrast & Ergonomics**: Meets touch-target standards ($40\text{px}+$ touch targets) and closes automatically when clicking outside or pressing Escape.

---

## 4. Technical Architecture & Data Strategy

### Component Hierarchy & Interaction Flow

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Trailer Modal Viewport                          │
│                                                                        │
│   ┌──────────────────────────────────────────────────────────────┐     │
│   │ Top Control Bar                                              │     │
│   │                                                              │     │
│   │  [Title / Movie Info]     [⬇ Download ▾] [↗ Open Externally] [✕] │
│   └──────────────────────────────────│───────────────────────────┘     │
│                                      ▼                                 │
│                       ┌──────────────────────────────┐                 │
│                       │ Format & Quality Dropdown    │                 │
│                       │                              │                 │
│                       │  • 1080p Full HD (MP4)       │                 │
│                       │  • 720p HD (MP4)             │                 │
│                       │  • 360p Mobile (MP4)         │                 │
│                       │  • MP3 Audio (Audio Only)    │                 │
│                       │  • Open Full Downloader Web  │                 │
│                       └──────────────┬───────────────┘                 │
│                                      ▼                                 │
│                 [ Extract YouTube Video ID in Browser ]                │
│                                      ▼                                 │
│                 [ Direct Client Redirect to Downloader ]               │
│                   (0 Vercel / 0 Cloud Run Bandwidth)                   │
│                                      ▼                                 │
│                      [ Show User Feedback Toast ]                      │
└────────────────────────────────────────────────────────────────────────┘
```

### Key Modules & Files to Implement
1. **`src/utils/youtubeDownloader.ts`**:
   - Client utility that extracts the 11-char YouTube video ID from `watch?v=`, `youtu.be/`, or `embed/` URLs.
   - Generates direct URL targets for the selected quality/format using trusted services (SSYouTube/SaveFrom, Y2Mate, and Cobalt).
2. **`src/components/TrailerDownloadDropdown.tsx`**:
   - Modular dropdown component with Lucide icons (`Download`, `Film`, `Music`, `ExternalLink`, `ChevronDown`).
   - Click-outside and keyboard escape dismissal listeners.
3. **`src/pages/user/MovieDetails.tsx`**:
   - Embed `TrailerDownloadDropdown` into the trailer popup top bar adjacent to the `Open externally` link.
4. **`src/components/ComingSoonSection.tsx`**:
   - Embed `TrailerDownloadDropdown` into the fullscreen upcoming trailer modal.

---

## 5. Verification Checklist

- [ ] Confirmed 0 bytes of Vercel or Cloud Run bandwidth / CDN consumption.
- [ ] Video ID regex reliably extracts 11-char ID from all YouTube trailer URLs.
- [ ] Dropdown appears smoothly and aligns beneath the download button.
- [ ] Clicking any quality option opens the download destination in a new tab and shows toast feedback.
- [ ] Clicking outside or pressing Escape cleanly closes the dropdown.
- [ ] Mobile viewports (375px) display comfortably without header wrapping.
- [ ] Clean TypeScript compilation and zero lint errors.
