/**
 * Client-Side Direct Subtitle Fetcher & WebVTT / SRT Parser
 * Fetches subtitles directly from open CDN endpoints with 0 Vercel bandwidth consumption.
 */

export interface SubtitleCue {
  start: number;
  end: number;
  text: string;
}

export interface DirectSubtitleTrack {
  id: string | number;
  language: string;
  title: string;
  url?: string;
  isDirect?: boolean;
}

const cuesCache = new Map<string, SubtitleCue[]>();

function decodeHtmlEntities(str: string): string {
  if (!str) return "";
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

/**
 * Robust WebVTT and SubRip (SRT) parser running directly in the browser
 */
export function parseWebVTT(vttText: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  if (!vttText || typeof vttText !== "string") return cues;

  const cleanText = vttText.replace(/^\uFEFF/, "");

  const parseTime = (str: string): number => {
    if (!str) return 0;
    const parts = str.trim().replace(",", ".").split(":");
    if (parts.length === 3) {
      return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
    } else if (parts.length === 2) {
      return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
    }
    return parseFloat(str) || 0;
  };

  const lines = cleanText.split(/\r?\n/);
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();
    if (line.includes("-->")) {
      const parts = line.split("-->");
      if (parts.length >= 2) {
        const startStr = parts[0].trim().split(/\s+/)[0];
        const endStr = parts[1].trim().split(/\s+/)[0];
        const start = parseTime(startStr);
        const end = parseTime(endStr);

        i++;
        const textLines: string[] = [];
        while (i < lines.length) {
          const rawL = lines[i].trim();
          if (rawL === "") {
            i++;
            break;
          }
          if (rawL.includes("-->")) {
            break;
          }
          if (/^\d+$/.test(rawL) && i + 1 < lines.length && lines[i + 1].includes("-->")) {
            break;
          }

          // Strip formatting tags and decode HTML entities
          const cleanL = decodeHtmlEntities(
            rawL.replace(/\{[^}]*\}/g, "").replace(/<[^>]+>/g, "").trim()
          );
          if (cleanL) textLines.push(cleanL);
          i++;
        }

        if (textLines.length > 0 && end > start) {
          cues.push({ start, end, text: textLines.join("\n") });
        }
      } else {
        i++;
      }
    } else {
      i++;
    }
  }

  // Guarantee chronological sort
  cues.sort((a, b) => a.start - b.start);

  return cleanSubtitleCues(cues);
}

/**
 * Sanitizes and cleans subtitle cues:
 * 1. Chronologically sorts by start time.
 * 2. Strips HTML tags and entities.
 * 3. Removes repeated previous lines (roll-up subtitle redundancy).
 * 4. Preserves true cue duration and natural dialogue synchronization.
 */
export function cleanSubtitleCues(rawCues: SubtitleCue[]): SubtitleCue[] {
  if (!rawCues || !Array.isArray(rawCues) || rawCues.length === 0) return [];

  // Clone and sort strictly by start time
  const cues: SubtitleCue[] = rawCues
    .map((c) => ({
      start: Number(c.start) || 0,
      end: Number(c.end) || 0,
      text: String(c.text || "").trim(),
    }))
    .filter((c) => c.text.length > 0 && c.end > c.start)
    .sort((a, b) => a.start - b.start);

  for (let idx = 0; idx < cues.length; idx++) {
    const cur = cues[idx];

    // Decode HTML entities and strip styling tags
    const cleanRaw = decodeHtmlEntities(
      cur.text
        .replace(/\{[^}]*\}/g, "")
        .replace(/<[^>]+>/g, "")
        .trim()
    );

    let lines = cleanRaw
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    // Roll-up caption cleanup: if this cue has multiple lines and the first line was the previous cue's text,
    // remove the repeated previous line so dialogue doesn't stack or duplicate!
    if (idx > 0 && lines.length > 1) {
      const prev = cues[idx - 1];
      const prevClean = prev.text.toLowerCase().trim();
      if (prevClean && lines[0].toLowerCase().trim() === prevClean) {
        lines.shift();
      } else if (prevClean) {
        const prevLines = prev.text.split(/\r?\n/).map((l) => l.toLowerCase().trim()).filter(Boolean);
        if (prevLines.length > 0 && lines[0].toLowerCase().trim() === prevLines[prevLines.length - 1]) {
          lines.shift();
        }
      }
    }

    cur.text = lines.join("\n");
  }

  return cues.filter((c) => c.text.trim().length > 0 && c.end > c.start);
}

/**
 * Ultra-reliable cue matcher for running playback.
 * Guaranteed to find the active dialogue at currentTime without missing cues or getting stuck.
 * When playback enters dialogue, returns active cue; when between dialogues, returns null.
 */
export function findActiveCue(cues: SubtitleCue[], currentTime: number): SubtitleCue | null {
  if (!cues || cues.length === 0) return null;

  // 1. Binary search to find the highest index whose start <= currentTime
  let low = 0;
  let high = cues.length - 1;
  let candidateIndex = -1;

  while (low <= high) {
    const mid = (low + high) >> 1;
    if (cues[mid].start <= currentTime) {
      candidateIndex = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  if (candidateIndex === -1) {
    return null;
  }

  // 2. Check candidateIndex first (most recent dialogue that has started)
  const candidate = cues[candidateIndex];
  if (candidate.start <= currentTime && currentTime <= candidate.end) {
    return candidate;
  }

  // 3. In case candidate already ended but an earlier ongoing dialogue is still active
  for (let i = candidateIndex - 1; i >= Math.max(0, candidateIndex - 8); i--) {
    const prevCue = cues[i];
    if (prevCue.start <= currentTime && currentTime <= prevCue.end) {
      return prevCue;
    }
  }

  return null;
}

/**
 * Formats subtitle language label cleanly.
 * NEVER returns "Audio". Always returns clean language name or "Default Subtitles".
 */
export function formatSubtitleLanguageLabel(lang?: string, title?: string, id?: string | number): string {
  if (title && !title.toLowerCase().includes("audio") && title.trim().length > 0) {
    return title.trim();
  }
  if (!lang || typeof lang !== "string") {
    return id !== undefined && id !== null ? `Subtitle ${String(id).replace("direct_", "")}` : "Default Subtitles";
  }
  const clean = lang.trim().toLowerCase();
  if (clean === "und" || clean === "none" || clean === "default" || clean === "") {
    return id !== undefined && id !== null ? `Subtitle ${String(id).replace("direct_", "")}` : "Default Subtitles";
  }
  if (LANGUAGE_LABELS[clean]) {
    return LANGUAGE_LABELS[clean];
  }
  for (const [code, label] of Object.entries(LANGUAGE_LABELS)) {
    if (clean === code || (code.length >= 3 && clean.startsWith(code))) {
      return label;
    }
  }
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

const LANGUAGE_LABELS: Record<string, string> = {
  eng: "English",
  en: "English",
  hin: "Hindi",
  hi: "Hindi",
  tam: "Tamil",
  ta: "Tamil",
  tel: "Telugu",
  te: "Telugu",
  mal: "Malayalam",
  ml: "Malayalam",
  kan: "Kannada",
  kn: "Kannada",
  spa: "Spanish",
  es: "Spanish",
  fre: "French",
  fra: "French",
  fr: "French",
  ger: "German",
  deu: "German",
  de: "German",
  ita: "Italian",
  it: "Italian",
  ara: "Arabic",
  ar: "Arabic",
  rus: "Russian",
  ru: "Russian",
  por: "Portuguese",
  pob: "Portuguese (BR)",
  pt: "Portuguese",
  tur: "Turkish",
  tr: "Turkish",
  kor: "Korean",
  ko: "Korean",
  jpn: "Japanese",
  ja: "Japanese",
  zho: "Chinese",
  chi: "Chinese",
  zh: "Chinese",
  ind: "Indonesian",
  id: "Indonesian",
};

export function getLanguageName(code: string): string {
  const clean = (code || "").trim().toLowerCase();
  return LANGUAGE_LABELS[clean] || clean.toUpperCase();
}

/**
 * Fetch subtitle tracks directly from OpenSubtitles Stremio CDN with open CORS
 */
export async function fetchDirectSubtitleTracks(
  imdbId: string,
  season?: number,
  episode?: number
): Promise<DirectSubtitleTrack[]> {
  if (!imdbId) return [];

  const cleanImdb = imdbId.startsWith("tt") ? imdbId : `tt${imdbId}`;
  const isSeries = season !== undefined && season !== null && episode !== undefined && episode !== null;
  const endpoint = isSeries
    ? `https://opensubtitles-v3.strem.io/subtitles/series/${encodeURIComponent(cleanImdb)}:${season}:${episode}.json`
    : `https://opensubtitles-v3.strem.io/subtitles/movie/${encodeURIComponent(cleanImdb)}.json`;

  try {
    const res = await fetch(endpoint, {
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) return [];
    const data = await res.json();
    const subs: any[] = data?.subtitles || [];
    if (!Array.isArray(subs) || subs.length === 0) return [];

    const seenLangs = new Set<string>();
    const tracks: DirectSubtitleTrack[] = [];

    // Prioritize high-demand languages first
    const priorityLangs = ["eng", "en", "hin", "hi", "tam", "tel", "spa", "es", "fre", "fr", "ara", "ger", "ita"];

    // First pass for priority languages
    for (const priority of priorityLangs) {
      const match = subs.find(
        (s) => (s.lang || "").toLowerCase() === priority && s.url && !seenLangs.has((s.lang || "").toLowerCase())
      );
      if (match) {
        const langCode = (match.lang || "eng").toLowerCase();
        seenLangs.add(langCode);
        tracks.push({
          id: `direct_${langCode}_${match.id || tracks.length}`,
          language: langCode,
          title: getLanguageName(langCode),
          url: match.url,
          isDirect: true,
        });
      }
    }

    // Second pass for all other available languages
    for (const sub of subs) {
      if (!sub.url) continue;
      const langCode = (sub.lang || "und").toLowerCase();
      if (!seenLangs.has(langCode)) {
        seenLangs.add(langCode);
        tracks.push({
          id: `direct_${langCode}_${sub.id || tracks.length}`,
          language: langCode,
          title: getLanguageName(langCode),
          url: sub.url,
          isDirect: true,
        });
      }
    }

    return tracks;
  } catch (err) {
    console.warn("[Direct subtitles fetch warning]:", err);
    return [];
  }
}

/**
 * Directly fetch subtitle file and parse cues without routing through Vercel
 */
export async function fetchDirectSubtitleCues(url: string): Promise<SubtitleCue[]> {
  if (!url) return [];
  if (cuesCache.has(url)) {
    return cuesCache.get(url)!;
  }

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return [];
    const text = await res.text();
    const cues = parseWebVTT(text);
    if (cues.length > 0) {
      cuesCache.set(url, cues);
    }
    return cues;
  } catch (err) {
    console.warn("[Direct subtitle cue fetch warning]:", err);
    return [];
  }
}
