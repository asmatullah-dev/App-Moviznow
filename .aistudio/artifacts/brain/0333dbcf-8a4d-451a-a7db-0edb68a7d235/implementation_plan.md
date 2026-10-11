# NativePlayer Title & Audio Language Display Enhancement

Enhance `nativePlayer` by removing quality labels from the top title, rendering the `S1E1` season/episode tag in emerald green directly inside the title (formatted as `Series Title - S1E1: Episode Title`), eliminating redundant season/episode info under the title, and displaying clean full language names (truncated with ellipsis if over 8 characters) on the audio button.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following user preferences were confirmed in Phase 1 and are locked into this plan:

- **Confirmed Decision 1 (S1E1 Accent Color)**: Render the `S1E1` indicator in vibrant **Emerald green** (`text-emerald-400 font-bold`) inside the title header, distinguishing it from white text.
- **Confirmed Decision 2 (Title Formatting)**: Format series episode titles as `Series Title - S1E1: Episode Title`, stripping any trailing quality suffixes (e.g., `- 720p`, `- 480p HEVC`).
- **Confirmed Decision 3 (Under-Title Metadata)**: Remove the redundant `• S1E1` pill/text from the metadata line below the title, keeping only year, duration, and audio track languages.
- **Confirmed Decision 4 (Audio Button Language)**: Display full language names (e.g., "Hindi", "English", "Spanish") instead of short 3-letter codes ("Hin", "Eng"). Names exceeding 8 characters will truncate with an ellipsis (e.g., "Portugue...").
- **Confirmed Decision 5 (Scope Isolation)**: All changes are isolated exclusively to `src/components/nativePlayer.tsx`.

---

## 1. Overview & Core Concept

### What It Does
1. **Title Sanitation & S1E1 Highlighting**:
   - Parses the active title and removes quality tags (`- 720p`, `- 1080p`, `- 480p HEVC`, `4K`, etc.).
   - Detects series episode patterns and constructs a split-styled title:
     `{Series Title} - ` (white) + `S{s}E{e}` (emerald green) + `: {Episode Title}` (white).
   - If it is a full season pack (e.g., `Ishqa Ishqa Season 1 - 480p HEVC`), formats as `{Series Title} - ` + `Season {s}` (emerald green) with quality stripped.
2. **Metadata Cleanup Under Title**:
   - Omits the duplicate `• S1E1` element under the title header so the top bar remains clean and uncluttered.
3. **Full Language Name on Audio Button**:
   - Replaces `getLanguageShortCode` with `formatAudioLanguageLabel` which returns proper capitalized language names (e.g., `Hindi`, `Tamil`, `Telugu`, `English`, `French`).
   - Normalizes raw short codes (`hin`, `eng`, `tam`) from media info into full names.
   - If length > 8 characters, gracefully truncates with `...` to prevent control bar overflow on mobile.

---

## 2. User Experience & Visual Design

### Top Bar Comparison

#### Before:
```
Below S1E1: Come Home Year - 720p                     [⬇] [✕]
2026 • 47:35 • S1E1 • Hindi, English
```

#### After:
```
Below - S1E1: Come Home Year                          [⬇] [✕]
2026 • 47:35 • Hindi, English
```
*(where `S1E1` is highlighted in emerald green `#34d399` / `text-emerald-400`)*

#### Full Season MKV Before:
```
Ishqa Ishqa Season 1 - 480p HEVC                      [⬇] [✕]
2026 • 3:53:26 • Hindi
```

#### Full Season MKV After:
```
Ishqa Ishqa - Season 1                                [⬇] [✕]
2026 • 3:53:26 • Hindi
```
*(where `Season 1` is highlighted in emerald green)*

### Audio Control Button Comparison

- **Before**: `[🎙 Hin]`
- **After**: `[🎙 Hindi]`
- **Long Language**: `[🎙 Portugue...]`

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Title Parsing Inside `nativePlayer.tsx`**:
  - *Chosen Approach*: Implement robust regex sanitization inside `nativePlayer.tsx` for `displayTitle`. It strips qualities and splits into `{prefix}`, `{badge}`, and `{suffix}` components.
  - *Why*: The user explicitly stated: *"Don't revise any other previous start as a new task and make changes only in nativeplayer"*. Making `nativePlayer` self-sufficient ensures all titles passed from any page (movies, seasons, episodes, link popups) are automatically cleaned and styled without touching external files.
- **Decision 2: Language Name Normalizer**:
  - *Chosen Approach*: Map common abbreviations (`hi`, `hin`, `en`, `eng`, `ta`, `tam`, `te`, `tel`, etc.) to full names (`Hindi`, `English`, `Tamil`, `Telugu`), while passing through already full names. Apply length capping at 8 characters + `...`.

---

## 4. Technical Architecture & Component Mapping

```
┌─────────────────────────────────────────────────────────────────┐
│                     nativePlayer.tsx Header                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  parsePlayerTitle(displayTitle, seasonInfo, episodeInfo)        │
│  │                                                              │
│  ├─► Strip quality: /[\s\-_]*(480p|720p|1080p|2160p|4k|hevc).*/i│
│  ├─► Extract Series Name                                        │
│  ├─► Extract S1E1 or Season N Tag ──► <span text-emerald-400>   │
│  └─► Extract Episode Title (if any)                             │
│                                                                 │
│  Header Info Sub-bar:                                           │
│  └─► {year} • {totalDuration} • {audioLanguages}                │
│      (Removes redundant seasonInfo/episodeInfo pill)            │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                     nativePlayer.tsx Controls                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  formatAudioLanguageLabel(rawLang)                              │
│  │                                                              │
│  ├─► ISO/Short Code Map (hin->Hindi, eng->English, etc.)        │
│  ├─► Strip brackets & codecs (e.g. "Hindi [Original]"->Hindi)   │
│  └─► Truncate: len > 8 ? lang.slice(0, 8) + "..." : lang        │
│                                                                 │
│  Audio Button:                                                  │
│  └─► <Mic /> <span>{formatAudioLanguageLabel(currentAudio)}</span>│
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```
