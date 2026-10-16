import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Volume2,
  Volume1,
  VolumeX,
  Maximize2,
  Minimize2,
  X,
  Loader2,
  Tv,
  Film,
  Download,
  Ratio,
  Check,
  Layers,
  Subtitles,
  Mic,
  Gauge,
  RefreshCw,
} from "lucide-react";
import { useLanguage } from "../contexts/LanguageContext";
import { safeStorage } from "../utils/safeStorage";
import { useModalBehavior } from "../hooks/useModalBehavior";
import { getStreamingApiBase } from "../utils/domains";
export { getStreamingApiBase };
import { getCachedLinkExtraction, unifiedExtractStream } from "../utils/linkUtils";
import {
  getPlaybackProgressKey,
  getSavedProgress,
  saveProgress,
  extractQualityLabel,
  getPreferredQuality,
  setPreferredQuality,
  getPreferredPlaybackSpeed,
  setPreferredPlaybackSpeed,
  findBestQualityLink,
} from "../utils/playbackProgress";
import {
  modalBackdropAnimation,
  modalContainerAnimation,
  fullScreenModalAnimation,
  modalGpuStyle,
} from "../utils/modalAnimations";
import {
  fetchDirectSubtitleTracks,
  fetchDirectSubtitleCues,
  findActiveCue,
  cleanSubtitleCues,
  formatSubtitleLanguageLabel,
  DirectSubtitleTrack,
} from "../utils/subtitleParser";
import {
  switchAudioTrackNatively,
  ClientAudioSyncEngine,
} from "../utils/clientAudioDemuxer";

export interface NativeStreamData {
  hasWatchOnline?: boolean;
  playable?: boolean;
  watchUrl?: string;
  streamUrl?: string;
  directUrl?: string;
  sourceUrl?: string;
  title?: string;
  mime?: string;
  size?: string;
  quality?: string;
  candidates?: Array<{ text: string; href: string }>;
  duration?: number;
  format?: string;
  videoCodec?: string;
  audioCodec?: string;
  needsTranscode?: boolean;
  isHls?: boolean;
  audioTracks?: Array<any>;
  subtitleTracks?: Array<any>;
}

export interface NativePlayerQualityOption {
  id?: string;
  name?: string;
  label?: string;
  url: string;
  size?: string;
  unit?: string;
}

export interface NativePlayerProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  imdbId?: string;
  watchUrl?: string;
  streamUrl?: string;
  contentId?: string;
  poster?: string;
  year?: string | number;
  quality?: string;
  duration?: number | string;
  runtime?: number | string;
  seasonInfo?: { number?: number; seasonNumber?: number; title?: string };
  episodeInfo?: { number?: number; episodeNumber?: number; title?: string };
  candidates?: Array<{ text: string; href: string }>;
  availableQualities?: NativePlayerQualityOption[];
}

export interface MediaProbeInfo {
  duration: number;
  format: string;
  videoCodec: string;
  width: number;
  height: number;
  isMkv: boolean;
  audioTracks: Array<{ id: number; language: string; codec: string; title: string }>;
  subtitleTracks: Array<{ id: number; language: string; title: string }>;
  needsTranscode: boolean;
  hasFFmpeg?: boolean;
}

/**
 * Parses duration or runtime string/number into seconds.
 * E.g. "142 min", "142m", "2h 15m", "02:15:00", 142 -> seconds
 */
export function parseRuntimeSeconds(val?: number | string): number {
  if (!val) return 0;
  if (typeof val === "number" && !isNaN(val) && val > 0) {
    if (val <= 60) return 0; // A <= 60s runtime is never a legitimate movie/stream duration
    if (val > 300) return Math.round(val);
    return Math.round(val * 60);
  }
  if (typeof val === "string") {
    const s = val.trim().toLowerCase();
    if (s === "1s" || s === "1 sec" || s === "1 second" || s === "1" || s === "0:01" || s === "00:01") {
      return 0;
    }
    const minMatch = s.match(/(\d+)\s*(?:min|mins|m)\b/);
    const hrMatch = s.match(/(\d+)\s*(?:hr|hrs|h)\b/);
    if (hrMatch || minMatch) {
      const hrs = hrMatch ? parseInt(hrMatch[1], 10) : 0;
      const mins = minMatch ? parseInt(minMatch[1], 10) : 0;
      const totalSec = (hrs * 60 + mins) * 60;
      return totalSec > 60 ? totalSec : 0;
    }
    const colonParts = s.split(":");
    if (colonParts.length === 3) {
      const h = parseFloat(colonParts[0]) || 0;
      const m = parseFloat(colonParts[1]) || 0;
      const sec = parseFloat(colonParts[2]) || 0;
      const total = Math.round(h * 3600 + m * 60 + sec);
      return total > 60 ? total : 0;
    } else if (colonParts.length === 2) {
      const m = parseFloat(colonParts[0]) || 0;
      const sec = parseFloat(colonParts[1]) || 0;
      const total = Math.round(m * 60 + sec);
      return total > 60 ? total : 0;
    }
    const num = parseFloat(s);
    if (!isNaN(num) && num > 0) {
      if (num <= 1) return 0; // Reject 1 sec or 1 min placeholder
      const total = num > 300 ? Math.round(num) : Math.round(num * 60);
      return total > 60 ? total : 0;
    }
  }
  return 0;
}

/**
 * On Pixeldrain streams, downloads are only available through /u/:id.
 * Converts /api/file/:id into /u/:id for opening download page.
 */
export function getPixeldrainDownloadUrl(url?: string): string {
  if (!url || typeof url !== "string") return "";
  let trimmed = url.trim();
  try {
    if (trimmed.includes("%")) {
      const decoded = decodeURIComponent(trimmed);
      if (
        decoded.includes("pixeldrain") ||
        decoded.includes("pixel.drain") ||
        decoded.includes("/u/") ||
        decoded.includes("/api/file/")
      ) {
        trimmed = decoded;
      }
    }
  } catch {}

  const pdMatch = trimmed.match(
    /(?:https?:\/\/)?(?:www\.)?(pixeldrain\.(?:dev|com|net)|pixel\.drain|pixeldra\.in)\/(?:u|api\/file)\/([a-zA-Z0-9_-]+)/i
  );
  if (pdMatch && pdMatch[2]) {
    return `https://pixeldrain.com/u/${pdMatch[2]}`;
  }

  const idMatch = trimmed.match(/(?:pixeldrain[^\/]*)\/(?:api\/file|u)\/([a-zA-Z0-9_-]+)/i);
  if (idMatch && idMatch[1]) {
    return `https://pixeldrain.com/u/${idMatch[1]}`;
  }

  const fallbackMatch = trimmed.match(/\/(?:api\/file|u)\/([a-zA-Z0-9_-]{6,})/i);
  if (fallbackMatch && fallbackMatch[1] && (trimmed.toLowerCase().includes("pixel") || trimmed.toLowerCase().includes("drain"))) {
    return `https://pixeldrain.com/u/${fallbackMatch[1]}`;
  }

  return trimmed;
}

/**
 * Format seconds into HH:MM:SS or MM:SS
 */
function formatTime(seconds: number): string {
  if (isNaN(seconds) || !isFinite(seconds) || seconds < 0) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m < 10 ? "0" : ""}${m}:${s < 10 ? "0" : ""}${s}`;
  }
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

/**
 * Formats audio language for the nativePlayer audio button and overlays.
 * Uses the clean, full language name (e.g. Hindi, English, Tamil).
 * If the language name exceeds 8 characters, gracefully truncates with an ellipsis (e.g. Portugue...).
 */
export function formatAudioLanguageLabel(lang?: string, options?: { forButton?: boolean }): string {
  if (!lang || typeof lang !== "string") return "Audio";
  let clean = lang.trim();

  // Strip brackets, parentheses, technical codecs, bitrates, etc.
  clean = clean
    .replace(/\[[^\]]*\]/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\b(original|stereo|5\.1|7\.1|aac|ac3|dts|audio|dual|multi)\b/gi, "")
    .replace(/[-–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!clean || clean.toLowerCase() === "default" || clean.toLowerCase() === "unknown" || clean.toLowerCase() === "none") {
    return "Audio";
  }

  const lower = clean.toLowerCase();

  // Map known short codes or variations to clean full capitalized language names
  const FULL_NAME_MAP: Record<string, string> = {
    // Primary Indian languages
    hin: "Hindi",
    hi: "Hindi",
    hindi: "Hindi",
    tam: "Tamil",
    ta: "Tamil",
    tamil: "Tamil",
    tel: "Telugu",
    te: "Telugu",
    telugu: "Telugu",
    mal: "Malayalam",
    ml: "Malayalam",
    malayalam: "Malayalam",
    kan: "Kannada",
    kn: "Kannada",
    kannada: "Kannada",
    ben: "Bengali",
    bn: "Bengali",
    bengali: "Bengali",
    bangla: "Bengali",
    mar: "Marathi",
    mr: "Marathi",
    marathi: "Marathi",
    guj: "Gujarati",
    gu: "Gujarati",
    gujarati: "Gujarati",
    pan: "Punjabi",
    pa: "Punjabi",
    punjabi: "Punjabi",
    urd: "Urdu",
    ur: "Urdu",
    urdu: "Urdu",
    ori: "Odia",
    or: "Odia",
    odia: "Odia",
    oriya: "Odia",
    asm: "Assamese",
    as: "Assamese",
    assamese: "Assamese",
    bho: "Bhojpuri",
    bhojpuri: "Bhojpuri",
    san: "Sanskrit",
    sa: "Sanskrit",
    sanskrit: "Sanskrit",
    nep: "Nepali",
    ne: "Nepali",
    nepali: "Nepali",
    sin: "Sinhala",
    si: "Sinhala",
    sinhala: "Sinhala",

    // Major International languages
    eng: "English",
    en: "English",
    english: "English",
    spa: "Spanish",
    es: "Spanish",
    spanish: "Spanish",
    español: "Spanish",
    espanol: "Spanish",
    fra: "French",
    fre: "French",
    fr: "French",
    french: "French",
    français: "French",
    francais: "French",
    ger: "German",
    deu: "German",
    de: "German",
    german: "German",
    deutsch: "German",
    ita: "Italian",
    it: "Italian",
    italian: "Italian",
    italiano: "Italian",
    por: "Portuguese",
    pt: "Portuguese",
    portuguese: "Portuguese",
    português: "Portuguese",
    portugues: "Portuguese",
    rus: "Russian",
    ru: "Russian",
    russian: "Russian",
    русский: "Russian",
    jpn: "Japanese",
    ja: "Japanese",
    japanese: "Japanese",
    日本語: "Japanese",
    kor: "Korean",
    ko: "Korean",
    korean: "Korean",
    한국어: "Korean",
    chi: "Chinese",
    zho: "Chinese",
    zh: "Chinese",
    chinese: "Chinese",
    mandarin: "Chinese",
    cantonese: "Cantonese",
    yue: "Cantonese",
    中文: "Chinese",
    ara: "Arabic",
    ar: "Arabic",
    arabic: "Arabic",
    العربية: "Arabic",
    tur: "Turkish",
    tr: "Turkish",
    turkish: "Turkish",
    türkçe: "Turkish",
    vie: "Vietnamese",
    vi: "Vietnamese",
    vietnamese: "Vietnamese",
    tha: "Thai",
    th: "Thai",
    thai: "Thai",
    ไทย: "Thai",
    ind: "Indonesian",
    id: "Indonesian",
    indonesian: "Indonesian",
    msa: "Malay",
    ms: "Malay",
    malay: "Malay",
    fil: "Filipino",
    tl: "Filipino",
    tgl: "Filipino",
    filipino: "Filipino",
    tagalog: "Filipino",
    fas: "Persian",
    per: "Persian",
    fa: "Persian",
    persian: "Persian",
    farsi: "Persian",
    pol: "Polish",
    pl: "Polish",
    polish: "Polish",
    polski: "Polish",
    nld: "Dutch",
    dut: "Dutch",
    nl: "Dutch",
    dutch: "Dutch",
    nederlands: "Dutch",
    swe: "Swedish",
    sv: "Swedish",
    swedish: "Swedish",
    svenska: "Swedish",
    nor: "Norwegian",
    no: "Norwegian",
    norwegian: "Norwegian",
    norsk: "Norwegian",
    dan: "Danish",
    da: "Danish",
    danish: "Danish",
    dansk: "Danish",
    fin: "Finnish",
    fi: "Finnish",
    finnish: "Finnish",
    suomi: "Finnish",
    gre: "Greek",
    ell: "Greek",
    el: "Greek",
    greek: "Greek",
    heb: "Hebrew",
    he: "Hebrew",
    hebrew: "Hebrew",
    cze: "Czech",
    ces: "Czech",
    cs: "Czech",
    czech: "Czech",
    hun: "Hungarian",
    hu: "Hungarian",
    hungarian: "Hungarian",
    ron: "Romanian",
    rum: "Romanian",
    ro: "Romanian",
    romanian: "Romanian",
    ukr: "Ukrainian",
    uk: "Ukrainian",
    ukrainian: "Ukrainian",
  };

  let fullName = FULL_NAME_MAP[lower];

  if (!fullName) {
    // Check prefix match
    for (const [key, val] of Object.entries(FULL_NAME_MAP)) {
      if (key.length >= 3 && lower.startsWith(key)) {
        fullName = val;
        break;
      }
    }
  }

  if (!fullName) {
    fullName = clean.charAt(0).toUpperCase() + clean.slice(1);
  }

  // For button labels (or when forButton is true), if the language name is too long (> 8 chars), truncate with ellipsis
  if (options?.forButton && fullName.length > 8) {
    return fullName.slice(0, 8) + "...";
  }

  return fullName;
}

/**
 * Backward compatibility export
 */
export function getLanguageShortCode(lang?: string): string {
  return formatAudioLanguageLabel(lang, { forButton: true });
}

export interface ParsedHeaderTitle {
  isSeriesEpisode: boolean;
  isSeasonOnly: boolean;
  seriesName: string;
  seasonEpisodeTag?: string; // e.g. "S1E1" or "Season 1"
  episodeTitle?: string;
  cleanFullTitle: string;
}

/**
 * Parses and cleans nativePlayer title:
 * - Strips quality labels (- 720p, - 480p HEVC, etc.)
 * - Extracts Series Title, S1E1, and Episode Title for styled rendering
 * - Formats full season MKVs as "Series Title - Season X"
 */
export function parsePlayerHeaderTitle(
  rawTitle?: string,
  seasonInfo?: { number?: number; seasonNumber?: number; title?: string },
  episodeInfo?: { number?: number; episodeNumber?: number; title?: string }
): ParsedHeaderTitle {
  let titleStr = (rawTitle || "").trim();

  // Strip quality suffixes (e.g. " - 720p", " - 480p HEVC", " - 1080p", " 4K", etc.)
  titleStr = titleStr
    .replace(/\s*[-–—|•]?\s*\b(\d{3,4}p(?:[\s._\-–—]*\[?\(?hevc\)?\]?)?|4k(?:[\s._\-–—]*\[?\(?hevc\)?\]?)?|2160p|1080p|720p|480p|hevc|hdrip|webrip|web-dl|bluray|dvdrip|remux)\b.*$/i, "")
    .trim();

  const sNum = seasonInfo?.number ?? seasonInfo?.seasonNumber;
  const eNum = episodeInfo?.number ?? episodeInfo?.episodeNumber;

  // Case A: Series episode (detected by SxxExx in title or passed in props)
  const epMatch = titleStr.match(/^(.*?)\s*[-–—]?\s*\bS(\d{1,2})\s*E(\d{1,2})\b(?:\s*:\s*(.*)|\s*[-–—]\s*(.*)|(.*))?$/i);
  if (epMatch || (sNum !== undefined && eNum !== undefined)) {
    const s = sNum !== undefined ? sNum : parseInt(epMatch![2], 10);
    const e = eNum !== undefined ? eNum : parseInt(epMatch![3], 10);
    let seriesName = epMatch ? epMatch[1].trim() : titleStr;
    seriesName = seriesName.replace(/\s*[-–—:]\s*$/, "").trim();

    let epName = episodeInfo?.title || (epMatch ? (epMatch[4] || epMatch[5] || epMatch[6] || "") : "");
    epName = epName
      .replace(/^[:\s\-–—]+/, "")
      .replace(/\s*[-–—|•]?\s*\b(\d{3,4}p(?:[\s._\-–—]*\[?\(?hevc\)?\]?)?|4k|hevc).*/i, "")
      .trim();

    return {
      isSeriesEpisode: true,
      isSeasonOnly: false,
      seriesName: seriesName || "Series",
      seasonEpisodeTag: `S${s}E${e}`,
      episodeTitle: epName,
      cleanFullTitle: epName ? `${seriesName} - S${s}E${e}: ${epName}` : `${seriesName} - S${s}E${e}`,
    };
  }

  // Case B: Season-only pack (e.g. "Ishqa Ishqa Season 1 - 480p HEVC")
  const seasMatch = titleStr.match(/^(.*?)\s*[-–—]?\s*\b(?:Season\s*(\d{1,2})|S(\d{1,2}))\b(?:\s*[-–—]?\s*(.*))?$/i);
  if (seasMatch || (sNum !== undefined && eNum === undefined)) {
    const s = sNum !== undefined ? sNum : parseInt(seasMatch![2] || seasMatch![3], 10);
    let seriesName = seasMatch ? seasMatch[1].trim() : titleStr;
    seriesName = seriesName.replace(/\s*[-–—:]\s*$/, "").trim();

    return {
      isSeriesEpisode: false,
      isSeasonOnly: true,
      seriesName: seriesName || "Series",
      seasonEpisodeTag: `Season ${s}`,
      cleanFullTitle: `${seriesName} - Season ${s}`,
    };
  }

  // Case C: Movie / Generic
  return {
    isSeriesEpisode: false,
    isSeasonOnly: false,
    seriesName: titleStr,
    cleanFullTitle: titleStr,
  };
}

/**
 * Extract decoded stream info from a watch online link (e.g. hbplay.pages.dev/?u=...)
 */
export function normalizePixeldrainUrl(url?: string): string {
  if (!url || typeof url !== "string") return "";
  const trimmed = url.trim();
  const uMatch = trimmed.match(
    /(?:https?:\/\/)?(?:www\.)?(pixeldrain\.(?:dev|com|net)|pixel\.drain|pixeldra\.in)\/(?:u|api\/file)\/([a-zA-Z0-9_-]+)/i
  );
  if (uMatch && uMatch[2]) {
    const host = uMatch[1].toLowerCase().includes("dev") ? "pixeldrain.dev" : "pixeldrain.com";
    return `https://${host}/api/file/${uMatch[2]}`;
  }
  return trimmed;
}

export function decodeWatchUrl(watchUrl?: string): {
  streamUrl?: string;
  mime?: string;
  title?: string;
} {
  if (!watchUrl) return {};
  try {
    const parsed = new URL(watchUrl);
    const uParam = parsed.searchParams.get("u");
    const mParam = parsed.searchParams.get("m");
    const tParam = parsed.searchParams.get("t");
    const urlParam = parsed.searchParams.get("url");

    const decodeBase64 = (s: string) => {
      let clean = s.replace(/-/g, "+").replace(/_/g, "/").replace(/\s/g, "");
      while (clean.length % 4 !== 0) clean += "=";
      return atob(clean);
    };

    let streamUrl = uParam ? decodeBase64(uParam) : undefined;
    if (!streamUrl && urlParam) {
      streamUrl = urlParam.startsWith("http") ? urlParam : decodeBase64(urlParam);
    }
    if (!streamUrl && (watchUrl.startsWith("http://") || watchUrl.startsWith("https://"))) {
      if (!watchUrl.includes("hbplay.pages.dev")) {
        streamUrl = watchUrl;
      }
    }
    const mime = mParam ? decodeBase64(mParam) : undefined;
    const title = tParam ? decodeBase64(tParam) : undefined;

    return {
      streamUrl: streamUrl && streamUrl.startsWith("http") ? normalizePixeldrainUrl(streamUrl) : undefined,
      mime,
      title,
    };
  } catch {
    if (watchUrl && (watchUrl.startsWith("http://") || watchUrl.startsWith("https://")) && !watchUrl.includes("hbplay.pages.dev")) {
      return { streamUrl: normalizePixeldrainUrl(watchUrl) };
    }
    return {};
  }
}

/**
 * Helper to find the FSL server candidate from a list of candidates
 */
export function findFslCandidate(
  candidates?: Array<{ text?: string; href?: string }>
): { text: string; href: string } | null {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  const match = candidates.find((c) => {
    if (!c || !c.href) return false;
    const t = (c.text || "").toLowerCase();
    const h = (c.href || "").toLowerCase();
    return (
      t.includes("fsl") ||
      h.includes("fsl") ||
      t.includes("fastserver") ||
      h.includes("fastserver") ||
      h.includes("cloudflarestorage") ||
      h.includes(".r2.")
    );
  });
  if (match && match.href) {
    return { text: match.text || "FSL Server", href: match.href };
  }
  return null;
}

/**
 * Pixeldrain playback is removed; returns null.
 */
export function findPixeldrainCandidate(
  _candidates?: Array<{ text?: string; href?: string }>
): null {
  return null;
}

/**
 * Helper to find the FSL server candidate or direct watch online candidate
 */
export function findWatchOnlineCandidate(
  candidates?: Array<{ text?: string; href?: string }>
): { text: string; href: string } | null {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  // Prioritize FSL server
  const fsl = findFslCandidate(candidates);
  if (fsl) {
    return fsl;
  }
  // Fallback to watch online, stream, or hbplay
  const match = candidates.find((c) => {
    if (!c || !c.href) return false;
    const t = (c.text || "").toLowerCase();
    const h = (c.href || "").toLowerCase();
    return (
      t.includes("watch online") ||
      t.includes("watch") ||
      t.includes("stream") ||
      h.includes("hbplay.pages.dev")
    );
  });
  if (match && match.href) {
    return { text: match.text || "Watch Online", href: match.href };
  }
  return null;
}

/**
 * Custom hook to automatically check Hubcloud links for a Watch Online / FSL extraction link
 */
const watchCheckCache = new Map<string, { data: NativeStreamData; timestamp: number }>();
const CACHE_TTL = 15 * 60 * 1000;

export function useNativePlayerCheck(hubcloudUrl?: string) {
  const [data, setData] = useState<NativeStreamData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  useEffect(() => {
    if (!hubcloudUrl) {
      setData(null);
      setIsLoading(false);
      return;
    }

    const trimmedUrl = hubcloudUrl.trim();

    // 1. Check unified cache first (shares cache with Play Movie and Download extraction)
    const cachedUnified = getCachedLinkExtraction(trimmedUrl);
    if (cachedUnified && (cachedUnified.streamUrl || cachedUnified.url)) {
      const stream = cachedUnified.streamUrl || cachedUnified.url;
      const normalized: NativeStreamData = {
        hasWatchOnline: true,
        playable: true,
        streamUrl: stream,
        watchUrl: cachedUnified.watchUrl || stream,
        candidates: cachedUnified.candidates || [{ text: "Stream Server", href: stream }],
        size: cachedUnified.size,
        quality: cachedUnified.quality,
        title: cachedUnified.title,
      };
      setData(normalized);
      setIsLoading(false);
      return;
    }

    const cached = watchCheckCache.get(trimmedUrl);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      setData(cached.data);
      return;
    }

    let isMounted = true;
    setIsLoading(true);

    unifiedExtractStream(trimmedUrl)
      .then((resData) => {
        if (!isMounted) return;
        if (resData && (resData.streamUrl || resData.url)) {
          const stream = resData.streamUrl || resData.url;
          const normalized: NativeStreamData = {
            hasWatchOnline: true,
            playable: true,
            streamUrl: stream,
            watchUrl: resData.watchUrl || stream,
            candidates: resData.candidates || [{ text: "Stream Server", href: stream }],
            size: resData.size,
            quality: resData.quality,
            title: resData.title,
          };
          watchCheckCache.set(trimmedUrl, { data: normalized, timestamp: Date.now() });
          setData(normalized);
        } else {
          setData(null);
        }
        setIsLoading(false);
      })
      .catch((err) => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [hubcloudUrl]);

  return {
    isAvailable: Boolean(data?.hasWatchOnline || data?.playable || data?.streamUrl),
    streamData: data,
    isLoading,
  };
}

/**
 * NativePlayer Component
 */
export function NativePlayer({
  isOpen,
  onClose,
  title = "Movie",
  imdbId,
  watchUrl = "",
  streamUrl: propStreamUrl,
  contentId = "default_content",
  poster = "",
  year,
  quality = "720p",
  duration: propDuration,
  runtime,
  seasonInfo,
  episodeInfo,
  candidates,
  availableQualities,
}: NativePlayerProps) {
  const { t } = useLanguage();
  useModalBehavior(isOpen, onClose);

  const video0Ref = useRef<HTMLVideoElement | null>(null);
  const video1Ref = useRef<HTMLVideoElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [activeSlot, setActiveSlot] = useState<0 | 1>(0);
  const activeSlotRef = useRef<0 | 1>(0);
  const [slot0Src, setSlot0Src] = useState<string>("");
  const [slot1Src, setSlot1Src] = useState<string>("");

  // Keep videoRef.current aligned with active video element for all playback interactions
  useEffect(() => {
    activeSlotRef.current = activeSlot;
    videoRef.current = (activeSlot === 0 ? video0Ref.current : video1Ref.current) as HTMLVideoElement;
  }, [activeSlot]);

  const containerRef = useRef<HTMLDivElement>(null);
  const controlsTimeoutRef = useRef<any>(null);
  const progressSaveIntervalRef = useRef<any>(null);
  const toastTimeoutRef = useRef<any>(null);

  // Active quality, stream, watchUrl, and candidates state for seamless dynamic quality switching
  const [currentQuality, setCurrentQuality] = useState<string>(quality || "720p");
  const [activeWatchUrl, setActiveWatchUrl] = useState<string>(watchUrl || "");
  const [activeStreamUrl, setActiveStreamUrl] = useState<string>(propStreamUrl || "");
  const [activeCandidates, setActiveCandidates] = useState<Array<{ text: string; href: string }>>(() => {
    return Array.isArray(candidates) ? candidates : [];
  });
  const [isSwitchingQuality, setIsSwitchingQuality] = useState<boolean>(false);
  const [switchingQualityLabel, setSwitchingQualityLabel] = useState<string | null>(null);
  const pendingQualitySwitchPosRef = useRef<number | null>(null);
  const isSwitchingQualityRef = useRef<boolean>(false);
  const wasPlayingBeforeQualitySwitchRef = useRef<boolean>(true);
  const isSeekingRef = useRef<boolean>(false);
  const seekSafetyTimerRef = useRef<any>(null);

  // Parse direct stream URL (exclusively play using FSL server)
  const fslCandidate = useMemo(() => findFslCandidate(activeCandidates), [activeCandidates]);
  const decodedMeta = useMemo(() => decodeWatchUrl(activeWatchUrl), [activeWatchUrl]);

  const rawStreamUrl = useMemo(() => {
    if (fslCandidate?.href) {
      return fslCandidate.href;
    }
    return (
      activeStreamUrl ||
      propStreamUrl ||
      decodedMeta.streamUrl ||
      (activeWatchUrl && !activeWatchUrl.includes("hbplay.pages.dev") ? activeWatchUrl : "") ||
      ""
    );
  }, [fslCandidate, activeStreamUrl, propStreamUrl, decodedMeta, activeWatchUrl]);

  const directStreamUrl = rawStreamUrl;

  // Computes the download URL: FSL direct stream URL
  const downloadUrl = useMemo(() => {
    return fslCandidate?.href || directStreamUrl || rawStreamUrl || activeWatchUrl || "";
  }, [fslCandidate, directStreamUrl, rawStreamUrl, activeWatchUrl]);

  // Initial duration in seconds from content metadata/runtime
  const propDurationSeconds = useMemo(() => {
    return parseRuntimeSeconds(propDuration || runtime);
  }, [propDuration, runtime]);

  const parsedHeaderTitle = useMemo(() => {
    return parsePlayerHeaderTitle(decodedMeta.title || title, seasonInfo, episodeInfo);
  }, [decodedMeta.title, title, seasonInfo, episodeInfo]);
  const displayTitle = parsedHeaderTitle.cleanFullTitle;

  // Extract concise clean quality label (e.g. "480P", "720P", "1080P", "4K")
  const currentQualityLabel = useMemo(() => {
    return extractQualityLabel(currentQuality);
  }, [currentQuality]);

  // Available qualities parsed for quality selector menu
  const qualityOptions = useMemo(() => {
    if (Array.isArray(availableQualities) && availableQualities.length > 0) {
      const valid = availableQualities.filter((q) => q && q.url);
      if (valid.length > 0) {
        return valid.map((q) => ({
          id: q.id,
          label: extractQualityLabel(q.name || q.label),
          name: q.name || q.label || "HD",
          url: q.url,
          size: q.size,
          unit: q.unit || "",
        }));
      }
    }
    return [
      {
        id: "default-quality",
        label: currentQualityLabel,
        name: currentQuality,
        url: activeWatchUrl || activeStreamUrl,
        size: undefined,
        unit: "",
      },
    ];
  }, [availableQualities, currentQualityLabel, currentQuality, activeWatchUrl, activeStreamUrl]);

  // Engine: "native" (Universal Codec Transcode Engine) or "web" (HubCloud Web Player)
  const [engine, setEngine] = useState<"native" | "web">("native");
  const [mediaInfo, setMediaInfo] = useState<MediaProbeInfo | null>(null);

  const isDirectMkv = useMemo(() => {
    if (
      decodedMeta.mime?.includes("matroska") ||
      decodedMeta.title?.toLowerCase().includes(".mkv") ||
      decodedMeta.title?.toLowerCase().includes("hevc")
    ) {
      return true;
    }
    if (title && (title.toLowerCase().includes(".mkv") || title.toLowerCase().includes("hevc"))) {
      return true;
    }
    if (quality && quality.toLowerCase().includes("hevc")) {
      return true;
    }
    if (Boolean(mediaInfo?.isMkv) || Boolean(mediaInfo?.needsTranscode)) {
      return true;
    }
    if (!directStreamUrl) return false;
    const lower = directStreamUrl.toLowerCase();
    return (
      lower.includes(".mkv") ||
      lower.includes("matroska") ||
      lower.includes("hevc") ||
      lower.includes("h265")
    );
  }, [directStreamUrl, decodedMeta, title, quality, mediaInfo]);

  const [streamAttempt, setStreamAttempt] = useState<number>(0);
  const [streamMode, setStreamMode] = useState<"direct" | "proxy" | "transcode">(() => {
    if (
      decodedMeta.mime?.includes("matroska") ||
      decodedMeta.title?.toLowerCase().includes(".mkv") ||
      decodedMeta.title?.toLowerCase().includes("hevc") ||
      (title && (title.toLowerCase().includes(".mkv") || title.toLowerCase().includes("hevc"))) ||
      (quality && quality.toLowerCase().includes("hevc"))
    ) {
      return "transcode";
    }
    return "direct";
  });

  useEffect(() => {
    // If running on Vercel or environment where FFmpeg is not installed, use direct mode
    if (mediaInfo?.hasFFmpeg === false) {
      setStreamMode("direct");
      return;
    }
    if (mediaInfo?.hasFFmpeg && (isDirectMkv || mediaInfo?.needsTranscode)) {
      setStreamMode("transcode");
    }
  }, [isDirectMkv, mediaInfo]);
  const [seekOffset, setSeekOffset] = useState<number>(0);
  const [totalDuration, setTotalDuration] = useState<number>(() => {
    return propDurationSeconds > 60 ? propDurationSeconds : 0;
  });

  // Ensure totalDuration is populated from prop runtime if stream metadata hasn't loaded yet
  useEffect(() => {
    if (propDurationSeconds > 60 && totalDuration <= 60) {
      setTotalDuration(propDurationSeconds);
    }
  }, [propDurationSeconds, totalDuration]);
  const [selectedAudioTrack, setSelectedAudioTrack] = useState<number>(0);
  const [selectedSubtitleTrack, setSelectedSubtitleTrack] = useState<string | number | null>(null);
  const selectedSubtitleTrackRef = useRef<string | number | null>(null);
  const [directSubtitlesList, setDirectSubtitlesList] = useState<DirectSubtitleTrack[]>([]);
  const [subtitleCues, setSubtitleCues] = useState<Array<{ start: number; end: number; text: string }>>([]);
  const [activeSubtitleText, setActiveSubtitleText] = useState<string>("");
  const subtitleCuesRef = useRef<Array<{ start: number; end: number; text: string }>>([]);
  const activeSubtitleTextRef = useRef<string>("");
  const [subtitleSize, setSubtitleSize] = useState<"small" | "normal" | "large">(() => {
    const s = safeStorage.getItem("moviznow_subtitle_size");
    return (s as any) || "normal";
  });
  const [subtitleBg, setSubtitleBg] = useState<"black" | "semi" | "transparent">(() => {
    const b = safeStorage.getItem("moviznow_subtitle_bg");
    return (b as any) || "black";
  });

  useEffect(() => {
    selectedSubtitleTrackRef.current = selectedSubtitleTrack;
  }, [selectedSubtitleTrack]);

  const clientAudioSyncRef = useRef<ClientAudioSyncEngine | null>(null);

  useEffect(() => {
    if (!isOpen) {
      if (clientAudioSyncRef.current) {
        clientAudioSyncRef.current.destroy();
        clientAudioSyncRef.current = null;
      }
      return;
    }
    if (!clientAudioSyncRef.current) {
      clientAudioSyncRef.current = new ClientAudioSyncEngine();
    }
    const activeVid = (activeSlotRef.current === 0 ? video0Ref.current : video1Ref.current) || videoRef.current;
    if (activeVid && directStreamUrl) {
      clientAudioSyncRef.current.attach(activeVid, directStreamUrl);
    }
  }, [isOpen, activeSlot, directStreamUrl]);

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentPosition, setCurrentPosition] = useState<number>(0);
  const [bufferedPercent, setBufferedPercent] = useState<number>(0);
  const [volume, setVolume] = useState<number>(() => {
    const saved = safeStorage.getItem("moviznow_volume");
    return saved ? parseFloat(saved) : 1;
  });
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(() => {
    return getPreferredPlaybackSpeed();
  });
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isControlsVisible, setIsControlsVisible] = useState<boolean>(true);
  const [isBuffering, setIsBuffering] = useState<boolean>(true);
  const bufferingSafetyTimerRef = useRef<any>(null);

  const setBufferingWithSafety = useCallback((buffering: boolean, maxWaitMs = 3500) => {
    if (bufferingSafetyTimerRef.current) {
      clearTimeout(bufferingSafetyTimerRef.current);
      bufferingSafetyTimerRef.current = null;
    }
    if (buffering) {
      setIsBuffering(true);
      bufferingSafetyTimerRef.current = setTimeout(() => {
        setIsBuffering(false);
      }, maxWaitMs);
    } else {
      setIsBuffering(false);
    }
  }, []);

  const audioSwitchResumePosRef = useRef<number>(0);
  const [hasPlaybackError, setHasPlaybackError] = useState<boolean>(false);
  const [fitMode, setFitMode] = useState<"contain" | "cover" | "fill">("contain");

  const [activeMenu, setActiveMenu] = useState<"speed" | "audio" | "subtitles" | "quality" | null>(null);
  const activeMenuRef = useRef<"speed" | "audio" | "subtitles" | "quality" | null>(null);
  useEffect(() => {
    activeMenuRef.current = activeMenu;
  }, [activeMenu]);

  const [subtitleDelay, setSubtitleDelay] = useState<number>(0);
  const subtitleDelayRef = useRef<number>(0);
  useEffect(() => {
    subtitleDelayRef.current = subtitleDelay;
  }, [subtitleDelay]);
  const [doubleTapFeedback, setDoubleTapFeedback] = useState<"left" | "right" | null>(null);

  // Measure container width for responsive adaptive controls priority
  const [containerWidth, setContainerWidth] = useState<number>(() => {
    if (typeof window !== "undefined") {
      return window.innerWidth;
    }
    return 800;
  });

  useEffect(() => {
    if (!isOpen) return;

    const measure = () => {
      if (containerRef.current) {
        const w = containerRef.current.clientWidth || containerRef.current.getBoundingClientRect().width;
        if (w > 0) {
          setContainerWidth(w);
        }
      } else if (typeof window !== "undefined") {
        setContainerWidth(window.innerWidth);
      }
    };

    measure();

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined" && containerRef.current) {
      ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const w = entry.contentRect?.width;
          if (typeof w === "number" && w > 0) {
            setContainerWidth(w);
          }
        }
      });
      ro.observe(containerRef.current);
    }

    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);

    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
  }, [isOpen]);

  // Priority system for buttons under progress bar:
  // 1. Play/pause, quality and full screen button and running progress duration time (Always visible)
  // 2. Audio/language button
  // 3. Playback speed button
  // 4. Subtitles button
  // 5. Mute + volume adjuster button
  // 6. Crop, aspect ratio button
  // 7. Total duration of stream (under progress bar only when enough space; upside remains untouched)
  // 8. Other all
  const showP2Audio = containerWidth >= 360;
  const showP3Speed = containerWidth >= 420;
  const showP4Subtitles = containerWidth >= 480;
  const showP5Volume = containerWidth >= 550;
  const showP6CropRatio = containerWidth >= 620;
  const showP7TotalDuration = containerWidth >= 700;

  // Auto-close active menu if its corresponding button becomes hidden by space constraints
  useEffect(() => {
    if (activeMenu === "audio" && !showP2Audio) setActiveMenu(null);
    if (activeMenu === "speed" && !showP3Speed) setActiveMenu(null);
    if (activeMenu === "subtitles" && !showP4Subtitles) setActiveMenu(null);
  }, [activeMenu, showP2Audio, showP3Speed, showP4Subtitles]);

  // Unified storage key for playback progress (movie: contentId; series: contentId + season + episode)
  const sNum = seasonInfo?.seasonNumber ?? seasonInfo?.number;
  const eNum = episodeInfo?.episodeNumber ?? episodeInfo?.number;
  const storageKey = useMemo(() => {
    return getPlaybackProgressKey(contentId, sNum, eNum);
  }, [contentId, sNum, eNum]);

  // Unique composite content & link identifier to detect when link or content is changed
  const contentKey = useMemo(() => {
    return `${contentId || ""}_s${sNum ?? ""}_e${eNum ?? ""}_${watchUrl || ""}_${propStreamUrl || ""}`;
  }, [contentId, sNum, eNum, watchUrl, propStreamUrl]);

  const latestPositionRef = useRef<number>(0);
  const lastSaveTimeRef = useRef<number>(0);
  const prevContentKeyRef = useRef<string>("");
  const hasExtractedPrefRef = useRef<string>("");

  const savePlaybackPosition = useCallback((timeToSave: number) => {
    if (timeToSave > 3) {
      const rounded = Math.floor(timeToSave);
      latestPositionRef.current = rounded;
      saveProgress(storageKey, rounded);
      lastSaveTimeRef.current = Date.now();
    }
  }, [storageKey]);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 2200);
  }, []);

  // Complete reset of player state
  const resetPlayerState = useCallback((targetPosition = 0) => {
    if (video0Ref.current) {
      try {
        video0Ref.current.pause();
        video0Ref.current.currentTime = 0;
      } catch {}
    }
    if (video1Ref.current) {
      try {
        video1Ref.current.pause();
        video1Ref.current.currentTime = 0;
      } catch {}
    }
    activeSlotRef.current = 0;
    setActiveSlot(0);
    setSlot1Src("");

    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    if (progressSaveIntervalRef.current) clearInterval(progressSaveIntervalRef.current);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);

    setIsPlaying(false);
    setCurrentPosition(targetPosition);
    setSeekOffset(0);
    latestPositionRef.current = targetPosition;
    setTotalDuration(propDurationSeconds > 60 ? propDurationSeconds : 0);
    setBufferedPercent(0);

    setHasPlaybackError(false);
    setStreamAttempt(0);
    setBufferingWithSafety(true, 4000);

    setMediaInfo(null);
    setSubtitleCues([]);
    subtitleCuesRef.current = [];
    setActiveSubtitleText("");
    activeSubtitleTextRef.current = "";
    setSelectedSubtitleTrack(null);
    selectedSubtitleTrackRef.current = null;
    setSubtitleDelay(0);
    subtitleDelayRef.current = 0;
    setDirectSubtitlesList([]);
    setSelectedAudioTrack(0);

    setActiveMenu(null);
    setToastMessage(null);
    setIsSwitchingQuality(false);
    hasStartedPlaybackRef.current = false;
  }, []);

  // Full reset when player closes (unmounted or closed)
  useEffect(() => {
    if (!isOpen) {
      if (latestPositionRef.current > 3 && storageKey) {
        saveProgress(storageKey, latestPositionRef.current);
      }
      resetPlayerState(0);
      prevContentKeyRef.current = "";
      hasExtractedPrefRef.current = "";

      if (document.fullscreenElement) {
        try {
          document.exitFullscreen().catch(() => {});
        } catch {}
      }
      const screenOrientation = window.screen?.orientation as any;
      if (screenOrientation && typeof screenOrientation.unlock === "function") {
        try {
          screenOrientation.unlock();
        } catch {}
      }
      setIsFullscreen(false);
    }
  }, [isOpen, resetPlayerState, storageKey]);

  // Detect when content or link changes: reset duration, previous errors, and load new progress
  useEffect(() => {
    if (!isOpen) {
      prevContentKeyRef.current = "";
      return;
    }

    if (prevContentKeyRef.current !== contentKey) {
      prevContentKeyRef.current = contentKey;

      const savedTime = getSavedProgress(storageKey);
      resetPlayerState(savedTime);

      setCurrentQuality(quality || getPreferredQuality() || "720p");
      setActiveWatchUrl(watchUrl || "");
      setActiveStreamUrl(propStreamUrl || "");
      setActiveCandidates(Array.isArray(candidates) ? candidates : []);

      if (savedTime > 5) {
        showToast(`${t("Resumed from")} ${formatTime(savedTime)}`);
      }
    }
  }, [
    isOpen,
    contentKey,
    storageKey,
    quality,
    watchUrl,
    propStreamUrl,
    candidates,
    resetPlayerState,
    showToast,
    t,
  ]);

  // Handler to switch stream quality dynamically while preserving exact playback position
  const handleQualitySelect = useCallback(
    async (opt: { label: string; name: string; url: string; size?: string; unit?: string }) => {
      const isCurrentlyActive =
        opt.label.toUpperCase() === currentQualityLabel.toUpperCase() &&
        (opt.url === activeWatchUrl || opt.url === activeStreamUrl);

      if (isCurrentlyActive || isSwitchingQuality) {
        return;
      }

      // Keep previous quality state for seamless fallback if new quality fails to play/buffer
      const prevQualityLabel = currentQualityLabel;

      // Identify active video element (keeps playing uninterrupted) and hidden buffer element
      const curSlot = activeSlotRef.current;
      const bufferSlot = (curSlot === 0 ? 1 : 0) as 0 | 1;
      const curVideo = curSlot === 0 ? video0Ref.current : video1Ref.current;
      const bufferVideo = bufferSlot === 0 ? video0Ref.current : video1Ref.current;

      // DO NOT pause the stream! The current stream continues playing smoothly with ZERO interruption!
      setIsSwitchingQuality(true);
      isSwitchingQualityRef.current = true;
      wasPlayingBeforeQualitySwitchRef.current = isPlaying || Boolean(curVideo && !curVideo.paused);
      setSwitchingQualityLabel(opt.label);
      showToast(`${t("Buffering")} ${opt.label}...`);

      const targetUrl = (opt.url || "").trim();
      const lowerUrl = targetUrl.toLowerCase();

      try {
        let newWatchUrl = targetUrl;
        let candidateRawStream = "";
        let newCandidates: Array<{ text: string; href: string }> = [];

        const isDirect =
          lowerUrl.includes("pixeldrain") ||
          lowerUrl.includes("pixel.drain") ||
          lowerUrl.includes("pixeldra.in") ||
          lowerUrl.includes(".mp4") ||
          lowerUrl.includes(".mkv") ||
          lowerUrl.includes("workers.dev");

        let data: any = null;
        if (isDirect) {
          candidateRawStream = normalizePixeldrainUrl(targetUrl);
          newWatchUrl = targetUrl;
          newCandidates = [{ text: "Direct Stream", href: candidateRawStream }];
          try {
            const apiBase = getStreamingApiBase();
            const res = await fetch(`${apiBase}/api/native-player/check`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ url: targetUrl }),
              signal: AbortSignal.timeout(3500),
            }).catch(() => null);
            if (res && res.ok) {
              data = await res.json();
            }
          } catch {}
        } else {
          // Extract link in background without pausing active playback
          const apiBase = getStreamingApiBase();
          const doCheck = async (base: string) => {
            const res = await fetch(`${base}/api/native-player/check`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ url: targetUrl }),
              signal: AbortSignal.timeout(10000),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
          };

          try {
            data = await doCheck(apiBase);
          } catch {
            if (apiBase) {
              try {
                data = await doCheck("");
              } catch {}
            }
          }

          if (!data || (!data.streamUrl && !data.watchUrl && (!data.candidates || data.candidates.length === 0))) {
            console.warn(`[NativePlayer] Failed to extract link for ${opt.label}, keeping ${prevQualityLabel}`);
            showToast(`${t("Failed to load")} ${opt.label}, ${t("keeping")} ${prevQualityLabel}`);
            isSwitchingQualityRef.current = false;
            setIsSwitchingQuality(false);
            setSwitchingQualityLabel(null);
            return;
          }

          newCandidates = Array.isArray(data.candidates) ? data.candidates : [];
          const fsl = findFslCandidate(newCandidates);
          if (fsl) {
            candidateRawStream = fsl.href;
          } else {
            const watch = findWatchOnlineCandidate(newCandidates);
            const chosen = watch || (newCandidates.length > 0 ? newCandidates[0] : null);
            candidateRawStream = chosen ? chosen.href : (data.streamUrl || targetUrl);
          }
          newWatchUrl = data.watchUrl || targetUrl;
        }

        const normalizedStream = candidateRawStream;
        if (!normalizedStream) {
          showToast(`${t("Unable to play")} ${opt.label}, ${t("keeping")} ${prevQualityLabel}`);
          isSwitchingQualityRef.current = false;
          setIsSwitchingQuality(false);
          setSwitchingQualityLabel(null);
          return;
        }

        // Capture exact continuous playback position before switching
        const currentPlaybackPos = curVideo && !isNaN(curVideo.currentTime) && curVideo.currentTime > 0
          ? curVideo.currentTime
          : (latestPositionRef.current || currentPosition || 0);

        pendingQualitySwitchPosRef.current = currentPlaybackPos;
        savePlaybackPosition(currentPlaybackPos);

        // Update state to the new link and server
        setCurrentQuality(opt.name || opt.label);
        setPreferredQuality(opt.label || opt.name);
        setActiveWatchUrl(newWatchUrl);
        setActiveStreamUrl(normalizedStream);
        setActiveCandidates(
          newCandidates.length > 0 ? newCandidates : [{ text: "FSL Server", href: normalizedStream }]
        );
        setStreamMode("direct");
        setSeekOffset(0);
        setHasPlaybackError(false);
        setIsBuffering(true);
        setMediaInfo(null);
        setSelectedSubtitleTrack(null);
        setSelectedAudioTrack(0);

        // Direct stream update to video element (0 Vercel Fast Origin / Data Transfer)
        if (activeSlotRef.current === 0) {
          setSlot0Src(normalizedStream);
        } else {
          setSlot1Src(normalizedStream);
        }
        if (videoRef.current) {
          videoRef.current.src = normalizedStream;
          videoRef.current.load();
          videoRef.current.play().then(() => {
            setIsPlaying(true);
            hasStartedPlaybackRef.current = true;
          }).catch(() => {});
        }

        showToast(`${t("Quality:")} ${opt.label}`);
      } catch (err) {
        console.warn("[handleQualitySelect error]:", err);
        showToast(`${t("Failed to switch quality")}, ${t("keeping")} ${prevQualityLabel}`);
        isSwitchingQualityRef.current = false;
        setIsSwitchingQuality(false);
        setSwitchingQualityLabel(null);
      }
    },
    [
      currentQualityLabel,
      activeWatchUrl,
      activeStreamUrl,
      isSwitchingQuality,
      streamMode,
      seekOffset,
      currentPosition,
      mediaInfo,
      savePlaybackPosition,
      showToast,
      t,
    ]
  );

  const hasStartedPlaybackRef = useRef<boolean>(false);

  // Fetch probe media info (exact duration, audio streams, subtitles)
  useEffect(() => {
    if (!isOpen || !directStreamUrl) return;

    let isMounted = true;
    const apiBase = getStreamingApiBase();
    const epSuffix = (seasonInfo && episodeInfo)
      ? ` S${seasonInfo.number ?? (seasonInfo as any).seasonNumber ?? 1}E${episodeInfo.number ?? (episodeInfo as any).episodeNumber ?? 1}`
      : "";
    const probeTitle = (displayTitle || title || "") + epSuffix;
    fetch(`${apiBase}/api/native-player/info?url=${encodeURIComponent(directStreamUrl)}&title=${encodeURIComponent(probeTitle)}&imdbId=${encodeURIComponent(imdbId || "")}`)
      .then((res) => res.json())
      .then((data: MediaProbeInfo) => {
        if (!isMounted) return;
        setMediaInfo(data);
        if (data.duration && data.duration > 60) {
          setTotalDuration(Math.round(data.duration));
        }
        if ((data.isMkv || data.needsTranscode) && data.hasFFmpeg !== false) {
          setStreamMode("transcode");
        }
        // Auto-load embedded subtitles if user has enabled subtitles
        if (data.subtitleTracks && Array.isArray(data.subtitleTracks) && data.subtitleTracks.length > 0) {
          const prefSub = safeStorage.getItem("moviznow_subtitles_enabled");
          if (prefSub === "true") {
            setTimeout(() => {
              if (isMounted) handleSubtitleSelect(0, { silent: true });
            }, 300);
          }
        }
      })
      .catch((err) => {
        console.warn("[Media probe warning]:", err);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, directStreamUrl, displayTitle, title, imdbId, seasonInfo, episodeInfo]);

  // Fetch direct subtitles from open CDN endpoint with 0 Vercel transfer
  useEffect(() => {
    if (!isOpen || !imdbId) return;
    let isMounted = true;
    const epNum = episodeInfo?.number ?? (episodeInfo as any)?.episodeNumber;
    const sNum = seasonInfo?.number ?? (seasonInfo as any)?.seasonNumber;

    fetchDirectSubtitleTracks(imdbId, sNum, epNum).then((tracks) => {
      if (isMounted && tracks.length > 0) {
        setDirectSubtitlesList(tracks);
        const prefSub = safeStorage.getItem("moviznow_subtitles_enabled");
        if (prefSub === "true") {
          handleSubtitleSelect(tracks[0].id, { silent: true });
        }
      }
    });

    return () => {
      isMounted = false;
    };
  }, [isOpen, imdbId, seasonInfo, episodeInfo]);

  // Construct stream URL: direct playback from FSL origin CDN edge (0 Vercel Fast Origin / Data Transfer)
  const currentStreamSrc = useMemo(() => {
    if (!directStreamUrl) return "";

    const apiBase = getStreamingApiBase();

    // If stream is in transcode mode OR a non-default audio track is selected AND backend FFmpeg is available
    if ((streamMode === "transcode" || selectedAudioTrack > 0) && mediaInfo?.hasFFmpeg !== false) {
      const params = new URLSearchParams();
      params.set("url", directStreamUrl);
      params.set("mode", "transcode");
      params.set("audio", String(selectedAudioTrack || 0));
      params.set("vcopy", "1");
      if (seekOffset > 0) params.set("ss", String(seekOffset));
      return `${apiBase}/api/native-player/stream?${params.toString()}`;
    }

    // Direct playback in nativePlayer from FSL CDN edge
    return directStreamUrl;
  }, [directStreamUrl, streamMode, seekOffset, selectedAudioTrack, streamAttempt, mediaInfo]);

  // Synchronize stream source to active slot when not performing a background quality switch
  useEffect(() => {
    if (!isSwitchingQualityRef.current) {
      if (activeSlotRef.current === 0) {
        setSlot0Src(currentStreamSrc);
      } else {
        setSlot1Src(currentStreamSrc);
      }
    }
  }, [currentStreamSrc]);

  // Ensure video element loads and starts playback seamlessly on stream ready
  useEffect(() => {
    if (!isOpen || !currentStreamSrc) return;
    const activeVid = (activeSlotRef.current === 0 ? video0Ref.current : video1Ref.current) || videoRef.current;
    if (activeVid) {
      if (activeVid.src !== currentStreamSrc) {
        activeVid.src = currentStreamSrc;
      }
      activeVid.load();
      setBufferingWithSafety(true, 2500);
      const playPromise = activeVid.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            setIsPlaying(true);
            hasStartedPlaybackRef.current = true;
            setIsBuffering(false);
            setHasPlaybackError(false);
          })
          .catch(() => {
            setIsBuffering(false);
          });
      }
    }
  }, [isOpen, currentStreamSrc, setBufferingWithSafety]);

  const controlsShownAtRef = useRef<number>(Date.now());
  const isInteractingControlsRef = useRef<boolean>(false);

  // Handle Controls Auto-Hide: NEVER hide if any menu or window is open, or during active user interaction
  const resetControlsTimeout = useCallback(() => {
    setIsControlsVisible(true);
    controlsShownAtRef.current = Date.now();
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    // Don't hide menu when any window or popup is open, or user is actively interacting with controls!
    if (activeMenuRef.current !== null || activeMenu !== null || isInteractingControlsRef.current) {
      return;
    }
    if (isPlaying) {
      controlsTimeoutRef.current = setTimeout(() => {
        if (activeMenuRef.current === null && activeMenu === null && !isInteractingControlsRef.current) {
          setIsControlsVisible(false);
        }
      }, 5000);
    }
  }, [isPlaying, activeMenu]);

  useEffect(() => {
    if (activeMenu !== null) {
      setIsControlsVisible(true);
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    } else if (isPlaying) {
      resetControlsTimeout();
    } else {
      setIsControlsVisible(true);
      controlsShownAtRef.current = Date.now();
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    }
    return () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, [isPlaying, activeMenu, resetControlsTimeout]);

  // Controls are strictly visible if isControlsVisible is true OR any popup window/menu is open
  const effectiveControlsVisible = isControlsVisible || activeMenu !== null;

  // Prevent changing duration on 1st click only when menu/controls are completely hidden
  const canSeekNow = useCallback((): boolean => {
    if (!effectiveControlsVisible) {
      resetControlsTimeout();
      return false;
    }
    return true;
  }, [effectiveControlsVisible, resetControlsTimeout]);

  // Remember new position every 5 to 10 seconds during playback
  useEffect(() => {
    if (!isOpen) return;
    progressSaveIntervalRef.current = setInterval(() => {
      if (videoRef.current && !videoRef.current.paused) {
        const time = Math.floor(seekOffset + (videoRef.current.currentTime || 0));
        if (time > 3) {
          savePlaybackPosition(time);
        }
      }
    }, 5000);

    return () => {
      if (progressSaveIntervalRef.current) clearInterval(progressSaveIntervalRef.current);
    };
  }, [isOpen, savePlaybackPosition, seekOffset]);

  // Save latest progress on exit / unmount
  useEffect(() => {
    return () => {
      if (latestPositionRef.current > 3) {
        try {
          safeStorage.setItem(storageKey, String(latestPositionRef.current));
          localStorage.setItem(storageKey, String(latestPositionRef.current));
        } catch {}
      }
    };
  }, [storageKey]);

  // Sync volume & speed to HTML5 video element
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = volume;
      videoRef.current.muted = isMuted;
      videoRef.current.playbackRate = playbackSpeed;
    }
  }, [volume, isMuted, playbackSpeed, engine]);

  // Fullscreen change listener & orientation unlock
  useEffect(() => {
    const handleFsChange = () => {
      const isFs = Boolean(document.fullscreenElement || (document as any).webkitFullscreenElement);
      setIsFullscreen(isFs);
      if (!isFs) {
        const screenOrientation = window.screen?.orientation as any;
        if (screenOrientation && typeof screenOrientation.unlock === "function") {
          try {
            screenOrientation.unlock();
          } catch {}
        }
      }
    };
    document.addEventListener("fullscreenchange", handleFsChange);
    document.addEventListener("webkitfullscreenchange", handleFsChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFsChange);
      document.removeEventListener("webkitfullscreenchange", handleFsChange);
    };
  }, []);

  // Keyboard controls
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA")) return;

      switch (e.key) {
        case " ":
        case "k":
        case "K":
          e.preventDefault();
          togglePlay();
          break;
        case "ArrowLeft":
        case "j":
        case "J":
          e.preventDefault();
          seekBy(-10);
          break;
        case "ArrowRight":
        case "l":
        case "L":
          e.preventDefault();
          seekBy(10);
          break;
        case "ArrowUp":
          e.preventDefault();
          setVolume((v) => {
            const next = Math.min(1, v + 0.1);
            safeStorage.setItem("moviznow_volume", String(next));
            return next;
          });
          setIsMuted(false);
          resetControlsTimeout();
          break;
        case "ArrowDown":
          e.preventDefault();
          setVolume((v) => {
            const next = Math.max(0, v - 0.1);
            safeStorage.setItem("moviznow_volume", String(next));
            return next;
          });
          resetControlsTimeout();
          break;
        case "m":
        case "M":
          e.preventDefault();
          setIsMuted((m) => !m);
          resetControlsTimeout();
          break;
        case "c":
        case "C":
          e.preventDefault();
          handleSubtitleSelect(selectedSubtitleTrack === null ? 0 : null);
          break;
        case "g":
        case "G":
          e.preventDefault();
          handleSubtitleDelayChange(subtitleDelayRef.current - 0.25);
          break;
        case "h":
        case "H":
          e.preventDefault();
          handleSubtitleDelayChange(subtitleDelayRef.current + 0.25);
          break;
        case "f":
        case "F":
          e.preventDefault();
          toggleFullscreen();
          break;
        case "p":
        case "P":
          e.preventDefault();
          togglePip();
          break;
        case "Escape":
          if (!document.fullscreenElement) {
            onClose();
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, resetControlsTimeout, isPlaying, seekOffset, totalDuration, selectedSubtitleTrack]);

  // Keep track of buffer ahead (15s to 1 min) and update scrubber buffer bar
  const updateBufferMetrics = () => {
    if (!videoRef.current) return;
    const v = videoRef.current;
    if (v.buffered.length > 0) {
      let curBufferedEnd = 0;
      for (let i = 0; i < v.buffered.length; i++) {
        if (v.currentTime >= v.buffered.start(i) && v.currentTime <= v.buffered.end(i)) {
          curBufferedEnd = v.buffered.end(i);
          break;
        }
      }
      if (curBufferedEnd === 0) {
        curBufferedEnd = v.buffered.end(v.buffered.length - 1);
      }
      const effectiveDuration = totalDuration || v.duration;
      if (effectiveDuration > 0) {
        const bufferedPos = streamMode === "transcode" ? seekOffset + curBufferedEnd : curBufferedEnd;
        setBufferedPercent(Math.min(100, (bufferedPos / effectiveDuration) * 100));
      }
    }
  };

  // Video Event Handlers
  const handleProgress = () => {
    updateBufferMetrics();
  };

  const handleTimeUpdate = () => {
    const activeVid = (activeSlotRef.current === 0 ? video0Ref.current : video1Ref.current) || videoRef.current;
    if (!activeVid) return;
    if (!videoRef.current) {
      videoRef.current = activeVid;
    }

    // If stream is playing and not paused, NEVER keep buffering spinner or seeking lock on!
    if (!activeVid.paused) {
      if (isSeekingRef.current) isSeekingRef.current = false;
      if (isBuffering) setIsBuffering(false);
      if (!isPlaying) setIsPlaying(true);
    }

    // While user is seeking, do not let temporary video element latency snap position back if paused
    if (isSeekingRef.current) {
      if (!activeVid.paused || Math.abs(activeVid.currentTime - currentPosition) < 2.0) {
        isSeekingRef.current = false;
        setIsBuffering(false);
      } else {
        return;
      }
    }

    // Guard against temporary 0s during quality transition
    if (pendingQualitySwitchPosRef.current !== null) {
      const targetPos = pendingQualitySwitchPosRef.current;
      const vTime = activeVid.currentTime;
      if (streamMode === "transcode" && seekOffset > 0) {
        pendingQualitySwitchPosRef.current = null;
      } else if (vTime < 1 && targetPos > 2 && activeVid.paused) {
        return;
      } else {
        pendingQualitySwitchPosRef.current = null;
      }
    }

    const current =
      streamMode === "transcode" && seekOffset > 0
        ? seekOffset + activeVid.currentTime
        : activeVid.currentTime;
    setCurrentPosition(current);
    latestPositionRef.current = Math.floor(current);

    if (current > 0 || activeVid.currentTime > 0) {
      hasStartedPlaybackRef.current = true;
    }

    // Keep remembering new position every 5 to 10 seconds while playing
    const now = Date.now();
    if (now - lastSaveTimeRef.current >= 5000) {
      savePlaybackPosition(current);
    }

    // If stream is playing and not paused, NEVER keep buffering spinner on!
    if (!activeVid.paused) {
      setIsBuffering(false);
      if (!isPlaying) setIsPlaying(true);
    }

    // Match inbuilt or external subtitle cue without delay on running playback
    const currentSubTrack = selectedSubtitleTrackRef.current !== null ? selectedSubtitleTrackRef.current : selectedSubtitleTrack;
    const currentCues = subtitleCuesRef.current.length > 0 ? subtitleCuesRef.current : subtitleCues;
    if (currentSubTrack !== null && currentCues.length > 0) {
      const activeCue = findActiveCue(currentCues, current + subtitleDelayRef.current);
      const targetText = activeCue ? activeCue.text : "";
      if (targetText !== activeSubtitleTextRef.current) {
        activeSubtitleTextRef.current = targetText;
        setActiveSubtitleText(targetText);
      }
    } else if (currentSubTrack === null && activeSubtitleTextRef.current) {
      activeSubtitleTextRef.current = "";
      setActiveSubtitleText("");
    }

    // Authoritative media duration: probed media file duration > video element (finite & valid) > content runtime
    if (mediaInfo?.duration && mediaInfo.duration > 60) {
      const targetDur = Math.round(mediaInfo.duration);
      if (totalDuration !== targetDur) {
        setTotalDuration(targetDur);
      }
    } else if (activeVid && isFinite(activeVid.duration) && activeVid.duration > 60 && Math.round(activeVid.duration) !== 3600) {
      const targetDur = Math.round(activeVid.duration);
      if (totalDuration <= 60 || totalDuration === 100 || Math.abs(totalDuration - targetDur) > 60) {
        setTotalDuration(targetDur);
      }
    } else if (propDurationSeconds > 60 && (totalDuration <= 60 || totalDuration === 100)) {
      setTotalDuration(propDurationSeconds);
    } else if (current > totalDuration && totalDuration > 0) {
      setTotalDuration(Math.max(totalDuration, Math.round(current) + 120));
    }

    updateBufferMetrics();
  };

  const handleLoadedMetadata = () => {
    const activeVid = activeSlotRef.current === 0 ? video0Ref.current : video1Ref.current || videoRef.current;
    if (!activeVid) return;
    const vidDur = activeVid.duration;

    // Authoritative media duration: probed media container duration > content runtime > video element
    if (mediaInfo?.duration && mediaInfo.duration > 60) {
      setTotalDuration(Math.round(mediaInfo.duration));
    } else if (propDurationSeconds > 60) {
      setTotalDuration(propDurationSeconds);
    } else if (vidDur && isFinite(vidDur) && vidDur > 60 && Math.round(vidDur) !== 3600) {
      if (!totalDuration || Math.abs(totalDuration - vidDur) > 30) {
        setTotalDuration(Math.round(vidDur));
      }
    } else if (totalDuration <= 60 && propDurationSeconds > 0) {
      setTotalDuration(propDurationSeconds);
    }
    setIsBuffering(false);
    setHasPlaybackError(false);

    // If resuming in proxy or direct mode (where full video duration is preserved), seek to remembered position
    const savedTarget =
      pendingQualitySwitchPosRef.current !== null
        ? pendingQualitySwitchPosRef.current
        : (latestPositionRef.current || currentPosition);
    if (savedTarget > 2 && (streamMode !== "transcode" || seekOffset === 0)) {
      try {
        activeVid.currentTime = savedTarget;
      } catch {}
    }

    activeVid.playbackRate = playbackSpeed;
    activeVid.play().then(() => {
      setIsPlaying(true);
      hasStartedPlaybackRef.current = true;
    }).catch(() => {
      setIsPlaying(false);
    });
  };

  // Continuous subtitle sync loop during active playback
  // Guarantees subtitle dialogue changes accurately with duration on running playback
  useEffect(() => {
    if (!isPlaying || selectedSubtitleTrack === null) return;
    let animId: number;
    const syncSubtitle = () => {
      const vid = (activeSlotRef.current === 0 ? video0Ref.current : video1Ref.current) || videoRef.current;
      if (vid && !vid.paused) {
        const cur = (streamMode === "transcode" && seekOffset > 0 ? seekOffset + vid.currentTime : vid.currentTime) + subtitleDelayRef.current;
        const cues = subtitleCuesRef.current.length > 0 ? subtitleCuesRef.current : subtitleCues;
        if (cues.length > 0) {
          const activeCue = findActiveCue(cues, cur);
          const targetText = activeCue ? activeCue.text : "";
          if (targetText !== activeSubtitleTextRef.current) {
            activeSubtitleTextRef.current = targetText;
            setActiveSubtitleText(targetText);
          }
        }
      }
      animId = requestAnimationFrame(syncSubtitle);
    };
    animId = requestAnimationFrame(syncSubtitle);
    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, [isPlaying, selectedSubtitleTrack, subtitleCues, streamMode, seekOffset, subtitleDelay]);

  const handleRetryPlayback = useCallback(() => {
    setHasPlaybackError(false);
    setIsBuffering(true);
    if (mediaInfo?.hasFFmpeg !== false) {
      setStreamMode("transcode");
    } else {
      setStreamMode("proxy");
    }
    setStreamAttempt((prev) => prev + 1);

    const targetTime = latestPositionRef.current || currentPosition;
    if (videoRef.current) {
      try {
        videoRef.current.load();
        const p = videoRef.current.play();
        if (p !== undefined) {
          p.then(() => {
            setIsPlaying(true);
            setIsBuffering(false);
            if (targetTime > 0) {
              try {
                videoRef.current!.currentTime = targetTime;
              } catch {}
            }
          }).catch(() => {
            setIsPlaying(false);
            setIsBuffering(false);
          });
        }
      } catch (e) {
        console.warn("[Retry playback error]:", e);
      }
    }
  }, [currentPosition]);

  const handleVideoError = () => {
    setIsBuffering(false);
    const vid = videoRef.current;
    const mediaErr = vid?.error;

    // Ignore aborted loads (e.g. browser seeking or switching streams)
    if (mediaErr && mediaErr.code === 1 /* MEDIA_ERR_ABORTED */) {
      return;
    }

    // If the video is actually playing and healthy, ignore spurious error events
    if (vid && !vid.paused && vid.currentTime > 0) {
      return;
    }

    // If playback has successfully started previously and current time is progressing,
    // do not treat transient network hiccups as fatal server error
    if (hasStartedPlaybackRef.current && vid && vid.currentTime > 2) {
      console.warn("[NativePlayer] Transient glitch during active playback.");
      return;
    }

    // Do not handle errors during seamless quality switching!
    if (isSwitchingQualityRef.current) {
      console.warn("[NativePlayer] Suppressing error handling during active quality change.");
      return;
    }

    // 1. If proxy mode failed on stream and FFmpeg is available, escalate to transcode once
    if (streamMode === "proxy" && mediaInfo?.hasFFmpeg !== false && streamAttempt === 0) {
      console.warn("[NativePlayer] Proxy mode failed. Escalating to transcode engine...");
      setStreamMode("transcode");
      setStreamAttempt(1);
      setIsBuffering(true);
      return;
    }

    // 2. If direct streams cannot be decoded natively on this browser and watchUrl is available, seamlessly use HubCloud Web Engine
    if (watchUrl && engine === "native") {
      console.warn("[NativePlayer] Direct stream could not be decoded natively on this device. Switching to HubCloud Web Engine...");
      showToast(t("Playing via Web Player..."));
      setEngine("web");
      setIsBuffering(false);
      setHasPlaybackError(false);
      return;
    }

    // 3. All viable stream options exhausted. Showing playback notice.
    console.warn("[NativePlayer] All available stream servers exhausted. Showing playback notice.");
    setIsBuffering(false);
    setHasPlaybackError(true);
  };

  // Play/Pause: resumes seamlessly from remembered position if stopped/interrupted
  const togglePlay = () => {
    if (engine === "web") return;
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      // Resuming playback after video was stopped/paused
      const rememberedTarget = latestPositionRef.current || currentPosition;
      const currentVidPos = Math.floor(
        streamMode === "transcode" && seekOffset > 0
          ? seekOffset + (videoRef.current.currentTime || 0)
          : videoRef.current.currentTime || 0
      );

      // If video connection dropped, reset to 0, ended, or drifted > 3s from remembered position:
      if (
        videoRef.current.ended ||
        videoRef.current.error ||
        videoRef.current.readyState < 2 ||
        (rememberedTarget > 3 && Math.abs(currentVidPos - rememberedTarget) > 3)
      ) {
        executeSeek(rememberedTarget > 0 ? rememberedTarget : currentVidPos);
      } else {
        videoRef.current.play().then(() => {
          setIsPlaying(true);
        }).catch((err) => {
          console.warn("[Video play error - seeking to remembered position]:", err);
          executeSeek(rememberedTarget > 0 ? rememberedTarget : currentVidPos);
        });
      }
      setIsPlaying(true);
    } else {
      // Stopping / pausing playback: save current position immediately
      const current = Math.floor(
        streamMode === "transcode" && seekOffset > 0
          ? seekOffset + (videoRef.current.currentTime || 0)
          : videoRef.current.currentTime || 0
      );
      latestPositionRef.current = current;
      savePlaybackPosition(current);
      videoRef.current.pause();
      setIsPlaying(false);
    }
    resetControlsTimeout();
  };

  // Check if target seek time is already buffered in video element
  const isTimeBuffered = useCallback((v: HTMLVideoElement | null, targetTime: number): boolean => {
    if (!v || !v.buffered) return false;
    const b = v.buffered;
    for (let i = 0; i < b.length; i++) {
      if (targetTime >= b.start(i) - 0.25 && targetTime <= b.end(i) + 0.1) {
        return true;
      }
    }
    return false;
  }, []);

  // Perform seek
  const executeSeek = (targetSeconds: number) => {
    const activeVid = activeSlotRef.current === 0 ? video0Ref.current : video1Ref.current || videoRef.current;
    const duration =
      totalDuration > 60
        ? totalDuration
        : mediaInfo?.duration && mediaInfo.duration > 60
        ? Math.round(mediaInfo.duration)
        : (activeVid && isFinite(activeVid.duration) && activeVid.duration > 60 && Math.round(activeVid.duration) !== 3600)
        ? Math.round(activeVid.duration)
        : propDurationSeconds > 60
        ? propDurationSeconds
        : 100;
    const clampedTarget = Math.max(0, Math.min(duration, targetSeconds));

    // Do NOT show loading stream spinner if target seek is ALREADY buffered or already playing!
    const alreadyBuffered =
      streamMode !== "transcode" &&
      activeVid &&
      isTimeBuffered(activeVid, clampedTarget);

    isSeekingRef.current = true;
    if (seekSafetyTimerRef.current) clearTimeout(seekSafetyTimerRef.current);
    seekSafetyTimerRef.current = setTimeout(() => {
      isSeekingRef.current = false;
      setIsBuffering(false);
    }, 600);

    if (!alreadyBuffered && activeVid?.paused) {
      setIsBuffering(true);
    }
    setCurrentPosition(clampedTarget);
    latestPositionRef.current = Math.floor(clampedTarget);
    savePlaybackPosition(clampedTarget);

    // Instantly preview subtitle cue at new position if subtitles are on
    const currentCues = subtitleCuesRef.current.length > 0 ? subtitleCuesRef.current : subtitleCues;
    if (selectedSubtitleTrack !== null && currentCues.length > 0) {
      const activeCue = findActiveCue(currentCues, clampedTarget);
      const targetText = activeCue ? activeCue.text : "";
      activeSubtitleTextRef.current = targetText;
      setActiveSubtitleText(targetText);
    }

    if (streamMode === "transcode" && mediaInfo?.hasFFmpeg !== false) {
      setSeekOffset(clampedTarget);
      if (activeVid) {
        activeVid.currentTime = 0;
      }
    } else {
      setSeekOffset(0);
      if (activeVid) {
        try {
          activeVid.currentTime = clampedTarget;
        } catch {
          setSeekOffset(clampedTarget);
        }
      }
    }
    resetControlsTimeout();
  };

  const seekBy = (seconds: number) => {
    const next = currentPosition + seconds;
    executeSeek(next);
    setDoubleTapFeedback(seconds > 0 ? "right" : "left");
    setTimeout(() => setDoubleTapFeedback(null), 600);
  };

  const handleScrubberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // When menu is hidden, don't change duration on 1st click
    if (!canSeekNow()) {
      return;
    }
    const val = parseFloat(e.target.value);
    executeSeek(val);
  };

  const handleToggleFitMode = () => {
    setFitMode((prev) => {
      let next: "contain" | "cover" | "fill";
      if (prev === "contain") {
        next = "cover";
      } else if (prev === "cover") {
        next = "fill";
      } else {
        next = "contain";
      }
      const label =
        next === "contain"
          ? "Fit"
          : next === "cover"
          ? "Cover"
          : "Fill";
      showToast(`${t("Aspect Ratio")}: ${label}`);
      return next;
    });
    resetControlsTimeout();
  };

  const toggleFullscreen = async () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      try {
        if (containerRef.current.requestFullscreen) {
          await containerRef.current.requestFullscreen();
        } else if ((containerRef.current as any).webkitRequestFullscreen) {
          await (containerRef.current as any).webkitRequestFullscreen();
        }
        setIsFullscreen(true);

        // On full screen button change layout to landscape
        const screenOrientation = window.screen?.orientation as any;
        if (screenOrientation && typeof screenOrientation.lock === "function") {
          try {
            await screenOrientation.lock("landscape");
          } catch {
            try {
              await screenOrientation.lock("landscape-primary");
            } catch {}
          }
        }
      } catch {
        setIsFullscreen((prev) => !prev);
      }
    } else {
      try {
        const screenOrientation = window.screen?.orientation as any;
        if (screenOrientation && typeof screenOrientation.unlock === "function") {
          try {
            screenOrientation.unlock();
          } catch {}
        }
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if ((document as any).webkitExitFullscreen) {
          await (document as any).webkitExitFullscreen();
        }
        setIsFullscreen(false);
      } catch {
        setIsFullscreen(false);
      }
    }
  };

  const togglePip = async () => {
    if (!videoRef.current) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (document.pictureInPictureEnabled) {
        await videoRef.current.requestPictureInPicture();
      }
    } catch {}
  };

  const handleSpeedSelect = (speed: number) => {
    setPlaybackSpeed(speed);
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
    }
    setPreferredPlaybackSpeed(speed);
    showToast(`Speed: ${speed}x`);
    resetControlsTimeout();
  };

  const computedSubtitleTracks = useMemo(() => {
    const list: Array<DirectSubtitleTrack | { id: number | string; language: string; title: string; isDirect?: boolean }> = [];

    // 1. Direct external subtitles from open CDN as first priority (0 Vercel transfer, 0 server choking)
    if (directSubtitlesList.length > 0) {
      list.push(...directSubtitlesList);
    }

    // 2. Add embedded subtitle tracks from media container
    if (mediaInfo?.subtitleTracks && Array.isArray(mediaInfo.subtitleTracks) && mediaInfo.subtitleTracks.length > 0) {
      mediaInfo.subtitleTracks.forEach((s) => {
        if (s && typeof s.id === "number") {
          const sLang = (s.language || "und").toLowerCase();
          const alreadyInList = list.some((existing) => {
            const exLang = (existing.language || "").toLowerCase();
            return exLang === sLang || (sLang.length >= 2 && exLang.startsWith(sLang.slice(0, 2)));
          });
          if (!alreadyInList) {
            list.push({
              id: s.id,
              language: s.language || "und",
              title: formatSubtitleLanguageLabel(s.language, s.title, s.id + 1),
              isDirect: false,
            });
          }
        }
      });
    }

    return list;
  }, [mediaInfo, directSubtitlesList, fslCandidate, directStreamUrl]);

  // If no subtitles are available for this video, guarantee selectedSubtitleTrack is null and text is cleared
  useEffect(() => {
    if (computedSubtitleTracks.length === 0 && selectedSubtitleTrack !== null) {
      setSelectedSubtitleTrack(null);
      selectedSubtitleTrackRef.current = null;
      setSubtitleCues([]);
      subtitleCuesRef.current = [];
      setActiveSubtitleText("");
      activeSubtitleTextRef.current = "";
    }
  }, [computedSubtitleTracks.length, selectedSubtitleTrack]);

  const handleAudioSelect = (trackId: number) => {
    const track = mediaInfo?.audioTracks?.find((a) => a.id === trackId);
    if (trackId === selectedAudioTrack) {
      return;
    }

    setSelectedAudioTrack(trackId);
    showToast(`Audio: ${formatAudioLanguageLabel(track?.language) || "Track " + (trackId + 1)}`);

    const activeVid = (activeSlotRef.current === 0 ? video0Ref.current : video1Ref.current) || videoRef.current;
    
    // 1. Direct browser audio track switching via HTMLMediaElement.audioTracks (Safari / native multi-track)
    let switchedNatively = false;
    if (activeVid) {
      switchedNatively = switchAudioTrackNatively(activeVid, trackId);
      // Ensure the video element sound is never muted on audio track change
      activeVid.muted = isMuted;
      activeVid.volume = volume;
    }

    // If native switching worked in-place, we are done
    if (switchedNatively) {
      if (activeVid) {
        activeVid.muted = isMuted;
        activeVid.volume = volume;
      }
      resetControlsTimeout();
      return;
    }

    // 2. Client-side audio sync engine (if present, keep track id updated without muting)
    if (clientAudioSyncRef.current) {
      clientAudioSyncRef.current.selectTrack(trackId, mediaInfo?.audioTracks);
    }

    // 3. For all browsers where native multi-track is not exposed (Chrome, Android, Edge, Firefox)
    // or when backend transcoding is needed: switch stream to transcode mode with the requested audio track

    const targetPos = activeVid
      ? Math.floor(
          (streamMode === "transcode" && seekOffset > 0 ? seekOffset : 0) +
            (activeVid.currentTime || 0)
        )
      : Math.floor(currentPosition);

    audioSwitchResumePosRef.current = targetPos;
    pendingQualitySwitchPosRef.current = targetPos;
    latestPositionRef.current = targetPos;
    setCurrentPosition(targetPos);
    savePlaybackPosition(targetPos);

    setStreamMode("transcode");
    setSeekOffset(targetPos);
    setStreamAttempt((p) => p + 1);

    if (activeVid) {
      activeVid.muted = isMuted;
      activeVid.volume = volume;
    }
    resetControlsTimeout();
  };

  const handleSubtitleSelect = async (subId: string | number | null, options?: { silent?: boolean }) => {
    if (subId === null) {
      setSelectedSubtitleTrack(null);
      selectedSubtitleTrackRef.current = null;
      subtitleCuesRef.current = [];
      activeSubtitleTextRef.current = "";
      setSubtitleCues([]);
      setActiveSubtitleText("");
      safeStorage.setItem("moviznow_subtitles_enabled", "false");
      if (!options?.silent) {
        showToast("Subtitles: Off");
      }
      resetControlsTimeout();
      return;
    }

    const sub = computedSubtitleTracks.find((s) => String(s.id) === String(subId));
    const subLabel = formatSubtitleLanguageLabel(sub?.language, sub?.title, subId);
    if (!options?.silent) {
      showToast(`Loading ${subLabel}...`);
    }

    const applyLoadedCues = (rawCues: any[]) => {
      const cues = cleanSubtitleCues(rawCues);
      if (!cues || cues.length === 0) {
        handleFailedCues();
        return;
      }
      setSelectedSubtitleTrack(subId);
      selectedSubtitleTrackRef.current = subId;
      subtitleCuesRef.current = cues;
      setSubtitleCues(cues);
      safeStorage.setItem("moviznow_subtitles_enabled", "true");
      const curTime = (videoRef.current
        ? (streamMode === "transcode" && seekOffset > 0 ? seekOffset : 0) + (videoRef.current.currentTime || 0)
        : currentPosition) + subtitleDelayRef.current;
      const activeCue = findActiveCue(cues, curTime);
      const activeTxt = activeCue ? activeCue.text : "";
      activeSubtitleTextRef.current = activeTxt;
      setActiveSubtitleText(activeTxt);
      if (!options?.silent) {
        showToast(`Subtitles: ${subLabel}`);
      }
      resetControlsTimeout();
    };

    const handleFailedCues = () => {
      setSelectedSubtitleTrack(null);
      selectedSubtitleTrackRef.current = null;
      subtitleCuesRef.current = [];
      setSubtitleCues([]);
      activeSubtitleTextRef.current = "";
      setActiveSubtitleText("");
      setDirectSubtitlesList((prev) => prev.filter((d) => String(d.id) !== String(subId)));
      if (!options?.silent) {
        showToast(t("No subtitles available"));
      }
      resetControlsTimeout();
    };

    // 1. Direct Subtitle Fetch: Fetch directly in browser from open CDN (0 Vercel transfer!)
    if (sub?.isDirect && (sub as DirectSubtitleTrack).url) {
      try {
        const cues = await fetchDirectSubtitleCues((sub as DirectSubtitleTrack).url!);
        if (cues && cues.length > 0) {
          applyLoadedCues(cues);
          return;
        }
      } catch (err) {
        console.warn("[Direct subtitle fetch error, checking alternative]:", err);
      }
    }

    // 1b. Check if directSubtitlesList has matching track for this language before calling server
    const targetLang = (sub?.language || "").toLowerCase();
    const directMatch = directSubtitlesList.find((d) => {
      const dLang = (d.language || "").toLowerCase();
      return dLang === targetLang || (targetLang.length >= 2 && dLang.startsWith(targetLang.slice(0, 2)));
    });
    if (directMatch && directMatch.url) {
      try {
        const cues = await fetchDirectSubtitleCues(directMatch.url);
        if (cues && cues.length > 0) {
          applyLoadedCues(cues);
          return;
        }
      } catch (err) {}
    }

    // 2. Direct online subtitle lookup via OpenSubtitles CDN before server demuxing (0 server choking)
    if (imdbId) {
      try {
        const epNum = episodeInfo?.number ?? (episodeInfo as any)?.episodeNumber;
        const sNum = seasonInfo?.number ?? (seasonInfo as any)?.seasonNumber;
        const openTracks = await fetchDirectSubtitleTracks(imdbId, sNum, epNum);
        if (openTracks.length > 0) {
          const matchingOpen = openTracks.find((o) => {
            const oLang = (o.language || "").toLowerCase();
            return (
              oLang === targetLang ||
              (targetLang.length >= 2 && oLang.startsWith(targetLang.slice(0, 2))) ||
              oLang.includes("eng")
            );
          }) || openTracks[0];

          if (matchingOpen && matchingOpen.url) {
            const cues = await fetchDirectSubtitleCues(matchingOpen.url);
            if (cues && cues.length > 0) {
              applyLoadedCues(cues);
              return;
            }
          }
        }
      } catch (e) {
        console.warn("[Direct subtitle fallback warning]:", e);
      }
    }

    // 3. Server-side extraction for embedded MKV subtitle tracks
    const apiBase = getStreamingApiBase();
    const epNum = episodeInfo?.number ?? (episodeInfo as any)?.episodeNumber;
    const sNum = seasonInfo?.number ?? (seasonInfo as any)?.seasonNumber;
    const cleanTitle = displayTitle || title || "";
    const params = new URLSearchParams();
    params.set("url", directStreamUrl);
    params.set("sub", String(subId).replace("direct_", ""));
    if (cleanTitle) params.set("title", cleanTitle);
    if (imdbId) params.set("imdbId", imdbId);
    if (sub?.language) params.set("lang", sub.language);
    if (sNum !== undefined && sNum !== null) params.set("season", String(sNum));
    if (epNum !== undefined && epNum !== null) params.set("episode", String(epNum));

    fetch(`${apiBase}/api/native-player/subtitles?${params.toString()}`)
      .then((r) => r.json())
      .then((res) => {
        if (res.cues && Array.isArray(res.cues) && res.cues.length > 0) {
          applyLoadedCues(res.cues);
        } else {
          handleFailedCues();
        }
      })
      .catch((err) => {
        console.warn("Subtitle fetch error:", err);
        handleFailedCues();
      });
  };

  const handleSubtitleSizeSelect = (size: "small" | "normal" | "large") => {
    setSubtitleSize(size);
    safeStorage.setItem("moviznow_subtitle_size", size);
    resetControlsTimeout();
    const sizeMap: Record<string, string> = {
      small: "Small",
      normal: "Normal",
      large: "Large",
    };
    showToast(`${t("Subtitle Size:")} ${sizeMap[size] || size}`);
  };

  const handleSubtitleBgSelect = (bg: "black" | "semi" | "transparent") => {
    setSubtitleBg(bg);
    safeStorage.setItem("moviznow_subtitle_bg", bg);
    resetControlsTimeout();
    const bgMap: Record<string, string> = {
      black: "Black",
      semi: "Semi-Transparent",
      transparent: "None",
    };
    showToast(`${t("Subtitle Background:")} ${bgMap[bg] || bg}`);
  };

  const handleSubtitleDelayChange = (newDelay: number) => {
    const clamped = Math.round(newDelay * 100) / 100;
    setSubtitleDelay(clamped);
    subtitleDelayRef.current = clamped;
    safeStorage.setItem("moviznow_subtitle_delay", String(clamped));
    resetControlsTimeout();
    const sign = clamped > 0 ? "+" : "";
    showToast(`${t("Subtitle Sync:")} ${sign}${clamped.toFixed(2)}s`);
  };

  // Double tap to seek on touch screens (strictly on video viewport background)
  const lastTapRef = useRef<{ time: number; x: number }>({ time: 0, x: 0 });
  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    // If touch originated on or inside ANY button, slider, control bar, popup menu, or interactive element:
    // NEVER seek and clear tap memory!
    const target = e.target as HTMLElement | null;
    if (
      target &&
      target.closest(
        'button, input, select, a, [role="button"], .control-bar, .popup-menu, [data-player-control="true"]'
      )
    ) {
      lastTapRef.current = { time: 0, x: 0 };
      return;
    }

    const now = Date.now();
    const touch = e.changedTouches[0];
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    // When menu is hidden, 1st tap ONLY shows the menu and never changes duration
    if (!canSeekNow()) {
      lastTapRef.current = { time: 0, x: 0 };
      return;
    }

    const diff = now - lastTapRef.current.time;
    // Require rapid double tap between 60ms and 300ms strictly on edges (left 35% or right 35%)
    if (diff > 60 && diff < 300) {
      const clickX = touch.clientX - rect.left;
      if (clickX < rect.width * 0.35) {
        seekBy(-10);
      } else if (clickX > rect.width * 0.65) {
        seekBy(10);
      }
      lastTapRef.current = { time: 0, x: 0 };
    } else {
      lastTapRef.current = { time: now, x: touch.clientX };
      resetControlsTimeout();
    }
  };

  const handleActiveLoadedData = useCallback(() => {
    if (!isSwitchingQualityRef.current) {
      setBufferingWithSafety(false);
      setIsBuffering(false);
    }
    setHasPlaybackError(false);
    const activeVid = activeSlotRef.current === 0 ? video0Ref.current : video1Ref.current;
    if (activeVid) {
      activeVid.muted = isMuted;
      activeVid.volume = volume;
      if (!hasStartedPlaybackRef.current) {
        activeVid.playbackRate = playbackSpeed;
        const p = activeVid.play();
        if (p !== undefined) {
          p.then(() => {
            setIsPlaying(true);
            setBufferingWithSafety(false);
            setIsBuffering(false);
            hasStartedPlaybackRef.current = true;
          }).catch(() => {
            setIsPlaying(false);
            setBufferingWithSafety(false);
            setIsBuffering(false);
          });
        }
      }
    }
  }, [isMuted, volume, playbackSpeed, setBufferingWithSafety]);

  const handleActiveCanPlay = useCallback(() => {
    if (isSwitchingQualityRef.current) {
      isSwitchingQualityRef.current = false;
      setIsSwitchingQuality(false);
      setSwitchingQualityLabel(null);
    }
    setBufferingWithSafety(false);
    setIsBuffering(false);
    setHasPlaybackError(false);
    const activeVid = activeSlotRef.current === 0 ? video0Ref.current : video1Ref.current;
    if (activeVid) {
      activeVid.muted = isMuted;
      activeVid.volume = volume;
    }
    const savedTarget =
      pendingQualitySwitchPosRef.current !== null
        ? pendingQualitySwitchPosRef.current
        : (latestPositionRef.current || currentPosition);
    if (
      savedTarget > 2 &&
      activeVid &&
      (streamMode !== "transcode" || seekOffset === 0) &&
      activeVid.currentTime < 1
    ) {
      try {
        activeVid.currentTime = savedTarget;
      } catch {}
    }
    pendingQualitySwitchPosRef.current = null;
    if (audioSwitchResumePosRef.current > 0 && activeVid) {
      if (streamMode !== "transcode") {
        try {
          activeVid.currentTime = audioSwitchResumePosRef.current;
        } catch {}
      }
      audioSwitchResumePosRef.current = 0;
    }
    if (wasPlayingBeforeQualitySwitchRef.current || isPlaying || !hasStartedPlaybackRef.current) {
      const p = activeVid?.play();
      if (p !== undefined) {
        p.then(() => {
          setIsPlaying(true);
          setBufferingWithSafety(false);
          hasStartedPlaybackRef.current = true;
        }).catch(() => {
          setIsPlaying(false);
          setBufferingWithSafety(false);
        });
      }
    }
  }, [isPlaying, currentPosition, streamMode, seekOffset, isMuted, volume, setBufferingWithSafety]);

  const handleActiveCanPlayThrough = useCallback(() => {
    if (!isSwitchingQualityRef.current) {
      setBufferingWithSafety(false);
    }
  }, [setBufferingWithSafety]);

  const handleActiveWaiting = useCallback(() => {
    if (!isSwitchingQualityRef.current) {
      const activeVid = activeSlotRef.current === 0 ? video0Ref.current : video1Ref.current;
      // Only show buffering indicator if video is playing (not manually paused)
      if (activeVid && !activeVid.paused) {
        setBufferingWithSafety(true, 4000);
      }
    }
  }, [setBufferingWithSafety]);

  const handleActiveStalled = useCallback(() => {
    if (!isSwitchingQualityRef.current) {
      const activeVid = activeSlotRef.current === 0 ? video0Ref.current : video1Ref.current;
      // Only buffer if actively playing and stalled on data (stalling during preload paused is normal)
      if (activeVid && !activeVid.paused && activeVid.currentTime > 0) {
        setBufferingWithSafety(true, 4000);
      }
    }
  }, [setBufferingWithSafety]);

  const handleActiveLoadStart = useCallback(() => {
    if (!isSwitchingQualityRef.current) {
      const activeVid = activeSlotRef.current === 0 ? video0Ref.current : video1Ref.current;
      if (!activeVid || !hasStartedPlaybackRef.current) {
        setBufferingWithSafety(true, 2500);
      }
    }
  }, [setBufferingWithSafety]);

  const handleActiveSeeking = useCallback(() => {
    if (!isSwitchingQualityRef.current) {
      const activeVid = activeSlotRef.current === 0 ? video0Ref.current : video1Ref.current;
      if (activeVid && activeVid.paused) {
        setBufferingWithSafety(true, 2000);
      }
    }
  }, [setBufferingWithSafety]);

  const handleActiveSeeked = useCallback(() => {
    isSeekingRef.current = false;
    if (!isSwitchingQualityRef.current) {
      setBufferingWithSafety(false);
    }
  }, [setBufferingWithSafety]);

  const handleActivePlaying = useCallback(() => {
    isSeekingRef.current = false;
    setIsBuffering(false);
    setIsPlaying(true);
    setIsSwitchingQuality(false);
    isSwitchingQualityRef.current = false;
    setSwitchingQualityLabel(null);
    setHasPlaybackError(false);
    hasStartedPlaybackRef.current = true;
  }, []);

  const handleActivePause = useCallback(() => {
    if (isSwitchingQualityRef.current) {
      return;
    }
    setIsPlaying(false);
    const activeVid = activeSlotRef.current === 0 ? video0Ref.current : video1Ref.current;
    if (activeVid) {
      const pos = Math.floor(
        streamMode === "transcode" && seekOffset > 0
          ? seekOffset + (activeVid.currentTime || 0)
          : activeVid.currentTime || 0
      );
      latestPositionRef.current = pos;
      savePlaybackPosition(pos);
    }
  }, [streamMode, seekOffset, savePlaybackPosition]);

  const handleActiveEnded = useCallback(() => {
    setIsPlaying(false);
    const activeVid = activeSlotRef.current === 0 ? video0Ref.current : video1Ref.current;
    if (activeVid) {
      const pos = Math.floor(
        streamMode === "transcode" && seekOffset > 0
          ? seekOffset + (activeVid.currentTime || 0)
          : activeVid.currentTime || 0
      );
      latestPositionRef.current = pos;
      savePlaybackPosition(pos);
    }
  }, [streamMode, seekOffset, savePlaybackPosition]);

  const handleActiveError = useCallback(() => {
    const activeVid = activeSlotRef.current === 0 ? video0Ref.current : video1Ref.current;
    if (activeVid) {
      const pos = Math.floor(
        streamMode === "transcode" && seekOffset > 0
          ? seekOffset + (activeVid.currentTime || 0)
          : activeVid.currentTime || 0
      );
      if (pos > 0) {
        latestPositionRef.current = pos;
        savePlaybackPosition(pos);
      }
    }
    handleVideoError();
  }, [streamMode, seekOffset, savePlaybackPosition, handleVideoError]);

  const effectiveWebPlayerUrl = useMemo(() => {
    if (activeWatchUrl && activeWatchUrl.includes("hbplay.pages.dev")) {
      return activeWatchUrl;
    }
    return activeWatchUrl || watchUrl || "";
  }, [activeWatchUrl, watchUrl]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div
        key="native-player-wrapper"
        className="fixed inset-0 z-[10000] flex items-center justify-center p-2 sm:p-4 overflow-hidden"
      >
        <motion.div
          key="native-player-backdrop"
          {...modalBackdropAnimation}
          className="fixed inset-0 bg-black/95 backdrop-blur-xs transform-gpu will-change-[opacity]"
          onClick={onClose}
        />
        <motion.div
          key="native-player-card"
          {...fullScreenModalAnimation}
          style={modalGpuStyle}
          ref={containerRef}
          onClick={(e) => {
            e.stopPropagation();
            resetControlsTimeout();
          }}
          onMouseMove={resetControlsTimeout}
          onTouchEnd={handleTouchEnd}
          className={`relative w-full ${
            isFullscreen
              ? "!fixed !inset-0 !w-screen !h-screen !max-w-none !max-h-none !aspect-auto !rounded-none !border-none !z-[100001]"
              : "max-w-5xl aspect-video rounded-2xl ring-1 ring-white/10 shadow-[0_0_50px_rgba(0,0,0,0.5)]"
          } bg-black overflow-hidden flex flex-col items-center justify-center select-none transform-gpu`}
        >
          {/* Main Video Viewport */}
          <div
            onClick={(e) => {
              e.stopPropagation();
              if (activeMenu) {
                setActiveMenu(null);
              }
              resetControlsTimeout();
            }}
            className="relative w-full h-full flex items-center justify-center overflow-hidden bg-black"
          >
            {engine === "native" && (slot0Src || slot1Src || currentStreamSrc) ? (
              <>
                <video
                  ref={(el) => {
                    video0Ref.current = el;
                    if (activeSlotRef.current === 0 && el) {
                      videoRef.current = el;
                    }
                  }}
                  src={(slot0Src || (activeSlot === 0 ? currentStreamSrc : undefined)) || undefined}
                  poster={poster || undefined}
                  playsInline
                  autoPlay
                  preload="auto"
                  crossOrigin="anonymous"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (activeMenu) setActiveMenu(null);
                    resetControlsTimeout();
                  }}
                  onProgress={() => activeSlotRef.current === 0 && handleProgress()}
                  onTimeUpdate={() => activeSlotRef.current === 0 && handleTimeUpdate()}
                  onLoadedMetadata={() => activeSlotRef.current === 0 && handleLoadedMetadata()}
                  onLoadedData={() => activeSlotRef.current === 0 && handleActiveLoadedData()}
                  onCanPlay={() => activeSlotRef.current === 0 && handleActiveCanPlay()}
                  onCanPlayThrough={() => activeSlotRef.current === 0 && handleActiveCanPlayThrough()}
                  onWaiting={() => activeSlotRef.current === 0 && handleActiveWaiting()}
                  onStalled={() => activeSlotRef.current === 0 && handleActiveStalled()}
                  onLoadStart={() => activeSlotRef.current === 0 && handleActiveLoadStart()}
                  onSeeking={() => activeSlotRef.current === 0 && handleActiveSeeking()}
                  onSeeked={() => activeSlotRef.current === 0 && handleActiveSeeked()}
                  onPlaying={() => activeSlotRef.current === 0 && handleActivePlaying()}
                  onPause={() => activeSlotRef.current === 0 && handleActivePause()}
                  onEnded={() => activeSlotRef.current === 0 && handleActiveEnded()}
                  onError={() => activeSlotRef.current === 0 && handleActiveError()}
                  className={`w-full h-full cursor-default transition-opacity duration-300 ${
                    activeSlot === 0
                      ? "opacity-100 relative z-10 pointer-events-auto"
                      : "opacity-0 absolute inset-0 z-0 pointer-events-none"
                  } ${
                    fitMode === "cover"
                      ? "object-cover"
                      : fitMode === "fill"
                      ? "object-fill"
                      : "object-contain"
                  }`}
                >
                  {(slot0Src || (activeSlot === 0 ? currentStreamSrc : "")) && (
                    <>
                      <source src={slot0Src || (activeSlot === 0 ? currentStreamSrc : "")} type="video/mp4" />
                      <source src={slot0Src || (activeSlot === 0 ? currentStreamSrc : "")} type="video/webm" />
                      <source src={slot0Src || (activeSlot === 0 ? currentStreamSrc : "")} />
                    </>
                  )}
                </video>
                <video
                  ref={(el) => {
                    video1Ref.current = el;
                    if (activeSlotRef.current === 1 && el) {
                      videoRef.current = el;
                    }
                  }}
                  src={(slot1Src || (activeSlot === 1 ? currentStreamSrc : undefined)) || undefined}
                  poster={poster || undefined}
                  playsInline
                  autoPlay
                  preload="auto"
                  crossOrigin="anonymous"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (activeMenu) setActiveMenu(null);
                    resetControlsTimeout();
                  }}
                  onProgress={() => activeSlotRef.current === 1 && handleProgress()}
                  onTimeUpdate={() => activeSlotRef.current === 1 && handleTimeUpdate()}
                  onLoadedMetadata={() => activeSlotRef.current === 1 && handleLoadedMetadata()}
                  onLoadedData={() => activeSlotRef.current === 1 && handleActiveLoadedData()}
                  onCanPlay={() => activeSlotRef.current === 1 && handleActiveCanPlay()}
                  onCanPlayThrough={() => activeSlotRef.current === 1 && handleActiveCanPlayThrough()}
                  onWaiting={() => activeSlotRef.current === 1 && handleActiveWaiting()}
                  onStalled={() => activeSlotRef.current === 1 && handleActiveStalled()}
                  onLoadStart={() => activeSlotRef.current === 1 && handleActiveLoadStart()}
                  onSeeking={() => activeSlotRef.current === 1 && handleActiveSeeking()}
                  onSeeked={() => activeSlotRef.current === 1 && handleActiveSeeked()}
                  onPlaying={() => activeSlotRef.current === 1 && handleActivePlaying()}
                  onPause={() => activeSlotRef.current === 1 && handleActivePause()}
                  onEnded={() => activeSlotRef.current === 1 && handleActiveEnded()}
                  onError={() => activeSlotRef.current === 1 && handleActiveError()}
                  className={`w-full h-full cursor-default transition-opacity duration-300 ${
                    activeSlot === 1
                      ? "opacity-100 relative z-10 pointer-events-auto"
                      : "opacity-0 absolute inset-0 z-0 pointer-events-none"
                  } ${
                    fitMode === "cover"
                      ? "object-cover"
                      : fitMode === "fill"
                      ? "object-fill"
                      : "object-contain"
                  }`}
                >
                  {(slot1Src || (activeSlot === 1 ? currentStreamSrc : "")) && (
                    <>
                      <source src={slot1Src || (activeSlot === 1 ? currentStreamSrc : "")} type="video/mp4" />
                      <source src={slot1Src || (activeSlot === 1 ? currentStreamSrc : "")} type="video/webm" />
                      <source src={slot1Src || (activeSlot === 1 ? currentStreamSrc : "")} />
                    </>
                  )}
                </video>
              </>
            ) : (
              <iframe
                src={effectiveWebPlayerUrl || undefined}
                allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
                className="w-full h-full border-none"
                title={displayTitle}
              />
            )}

            {/* Custom High-Definition Subtitle Cue Overlay in Background Overlay Layer */}
            {selectedSubtitleTrack !== null && activeSubtitleText && (
              <div
                className={`absolute pointer-events-none inset-x-0 flex flex-col items-center justify-center px-4 transition-all duration-200 z-10 ${
                  effectiveControlsVisible ? "bottom-20 sm:bottom-24" : "bottom-6 sm:bottom-8"
                }`}
              >
                <div className="pointer-events-none flex flex-col items-center text-center select-none max-w-[90%] sm:max-w-[80%]">
                  {activeSubtitleText
                    .split("\n")
                    .map((line) => line.trim())
                    .filter(Boolean)
                    .map((line, idx) => (
                      <span
                        key={idx}
                        className={`pointer-events-none inline font-semibold text-center select-none tracking-normal transition-all ${
                          subtitleBg === "transparent"
                            ? "bg-transparent text-white drop-shadow-[0_2px_4px_rgba(0,0,0,1)]"
                            : subtitleBg === "semi"
                            ? "bg-black/50 text-white px-1.5 py-0.5 rounded-[4px] shadow-sm backdrop-blur-2xs"
                            : "bg-black/80 text-white px-1.5 py-0.5 rounded-[4px] shadow-sm"
                        }`}
                        style={{
                          pointerEvents: "none",
                          fontSize:
                            subtitleSize === "small"
                              ? "13px"
                              : subtitleSize === "large"
                              ? "19px"
                              : "15px",
                          lineHeight: 1.35,
                          boxDecorationBreak: "clone",
                          WebkitBoxDecorationBreak: "clone",
                          textShadow:
                            subtitleBg === "transparent"
                              ? "0 2px 4px #000, 0 0 3px #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000"
                              : "0 1px 2px rgba(0,0,0,0.8)",
                        }}
                      >
                        {line}
                      </span>
                    ))}
                </div>
              </div>
            )}

            {/* Toast Feedback Notification */}
            <AnimatePresence>
              {toastMessage && (
                <motion.div
                  initial={{ opacity: 0, y: -15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  className="absolute top-20 left-1/2 -translate-x-1/2 z-40 bg-zinc-900/90 text-white font-bold text-xs sm:text-sm px-4 py-2 rounded-xl shadow-xl border border-zinc-700/80 backdrop-blur-md pointer-events-none flex items-center gap-2"
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span>{toastMessage}</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Buffering Indicator - Show each time stream is buffering / loading */}
            {isBuffering && !isSwitchingQuality && engine === "native" && !hasPlaybackError && (
              <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center bg-black/40 backdrop-blur-xs z-20">
                <Loader2 className="w-14 h-14 text-emerald-500 animate-spin mb-3" />
                <span className="text-xs font-bold uppercase tracking-widest text-zinc-300">
                  {t("Loading Stream...")}
                </span>
              </div>
            )}


            {/* Seamless Quality Switch Badge (no full-screen Loading Stream when switching quality) */}
            {isSwitchingQuality && engine === "native" && (
              <div className="absolute top-16 left-1/2 -translate-x-1/2 pointer-events-none flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-black/80 backdrop-blur-md border border-emerald-500/30 text-emerald-400 text-xs font-semibold shadow-xl z-20 animate-in fade-in duration-150">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400 shrink-0" />
                <span>
                  {t("Switching Quality to")} {switchingQualityLabel || currentQualityLabel}...
                </span>
              </div>
            )}

            {/* Double Tap Seek Feedback Overlay */}
            <AnimatePresence>
              {doubleTapFeedback && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className={`absolute pointer-events-none top-1/2 -translate-y-1/2 flex items-center justify-center gap-2 p-5 rounded-full bg-black/60 text-white font-extrabold text-sm backdrop-blur-md z-30 ${
                    doubleTapFeedback === "left" ? "left-12" : "right-12"
                  }`}
                >
                  {doubleTapFeedback === "left" ? (
                    <>
                      <RotateCcw className="w-6 h-6 animate-pulse" />
                      <span>-10s</span>
                    </>
                  ) : (
                    <>
                      <span>+10s</span>
                      <RotateCw className="w-6 h-6 animate-pulse" />
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>


            {/* Playback Error Fallback Card (No buttons on Playback notice) */}
            {hasPlaybackError && engine === "native" && (
              <div className="absolute inset-0 bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center z-30">
                <div className="w-14 h-14 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-500 mb-4">
                  <Tv className="w-7 h-7" />
                </div>
                <h3 className="text-base sm:text-lg font-black text-white mb-2">
                  {t("Playback Notice")}
                </h3>
                <p className="text-zinc-400 text-xs sm:text-sm max-w-sm leading-relaxed">
                  {t("Playback paused due to a temporary network delay. Retrying automatically...")}
                </p>
              </div>
            )}

            {/* Center Play/Pause Overlay Circle (Unified from PlayerFU) */}
            {engine === "native" && !hasPlaybackError && !isBuffering && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  togglePlay();
                }}
                className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 w-12 h-12 sm:w-14 sm:h-14 rounded-full border border-white/85 bg-black/65 hover:bg-black/85 hover:scale-108 backdrop-blur-md shadow-2xl flex items-center justify-center cursor-pointer transition-all duration-200 active:scale-95 ${
                  !isPlaying
                    ? "opacity-100 pointer-events-auto"
                    : effectiveControlsVisible
                    ? "opacity-85 pointer-events-auto"
                    : "opacity-0 pointer-events-none"
                }`}
                title={isPlaying ? t("Pause") : t("Play")}
                aria-label={isPlaying ? t("Pause") : t("Play")}
              >
                {!isPlaying ? (
                  <Play className="w-5 h-5 sm:w-6 sm:h-6 fill-white text-white ml-0.5" />
                ) : (
                  <Pause className="w-5 h-5 sm:w-6 sm:h-6 fill-white text-white" />
                )}
              </button>
            )}
          </div>

          {/* Clean Top Bar Overlay (Unified layout from PlayerFU) */}
          <div
            className={`absolute top-0 inset-x-0 p-4 sm:p-5 bg-gradient-to-b from-black/85 via-black/40 to-transparent flex items-center justify-between z-30 transition-opacity duration-300 ${
              effectiveControlsVisible ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
            }`}
          >
            {/* Title & Metadata (Unified from PlayerFU embed-chrome) */}
            <div className="flex flex-col gap-0.5 max-w-[80%] sm:max-w-[85%]">
              {parsedHeaderTitle.isSeriesEpisode ? (
                <h2 className="text-sm sm:text-base md:text-lg font-bold text-white tracking-tight drop-shadow-md truncate">
                  <span>{parsedHeaderTitle.seriesName} - </span>
                  <span className="text-emerald-400 font-extrabold">{parsedHeaderTitle.seasonEpisodeTag}</span>
                  {parsedHeaderTitle.episodeTitle && <span>: {parsedHeaderTitle.episodeTitle}</span>}
                </h2>
              ) : parsedHeaderTitle.isSeasonOnly ? (
                <h2 className="text-sm sm:text-base md:text-lg font-bold text-white tracking-tight drop-shadow-md truncate">
                  <span>{parsedHeaderTitle.seriesName} - </span>
                  <span className="text-emerald-400 font-extrabold">{parsedHeaderTitle.seasonEpisodeTag}</span>
                </h2>
              ) : (
                <h2 className="text-sm sm:text-base md:text-lg font-bold text-white tracking-tight drop-shadow-md truncate">
                  {parsedHeaderTitle.cleanFullTitle}
                </h2>
              )}
              <div className="flex items-center gap-2 text-[11px] sm:text-xs text-zinc-300 font-medium flex-wrap">
                {year && <span>{year}</span>}
                {totalDuration > 60 && <span>• {formatTime(totalDuration)}</span>}
                {mediaInfo?.audioTracks && mediaInfo.audioTracks.length > 0 && (
                  <span className="text-zinc-400 font-normal">
                    • {mediaInfo.audioTracks.map((a: any) => formatAudioLanguageLabel(a.language)).filter(Boolean).join(", ")}
                  </span>
                )}
              </div>
            </div>

            {/* Top Right Actions: Direct Download & Floating Round Close Button */}
            <div className="flex items-center gap-2 shrink-0">
              {downloadUrl && (
                <a
                  href={downloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (downloadUrl) {
                      window.open(downloadUrl, "_blank", "noopener,noreferrer");
                    }
                  }}
                  onTouchEnd={(e) => e.stopPropagation()}
                  className="w-9 h-9 rounded-full bg-black/60 hover:bg-black/90 text-white/80 hover:text-white transition-all backdrop-blur-md border border-white/20 shadow-xl flex items-center justify-center cursor-pointer"
                  title={t("Download File")}
                >
                  <Download className="w-4 h-4" />
                </a>
              )}

              {/* Minimalist Round Close Button (Unified from PlayerFU) */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onClose();
                }}
                onTouchEnd={(e) => e.stopPropagation()}
                className="w-9 h-9 rounded-full bg-black/60 hover:bg-black/90 text-white/80 hover:text-white transition-all backdrop-blur-md border border-white/20 shadow-xl flex items-center justify-center cursor-pointer group"
                title={t("Close Player")}
                aria-label={t("Close Player")}
              >
                <X className="w-5 h-5 transition-transform group-hover:scale-110" />
              </button>
            </div>
          </div>

          {/* Subtle Mini Progress Bar at the bottom edge when controls are hidden (Unified from PlayerFU) */}
          {engine === "native" && (
            <div
              onClick={(e) => {
                e.stopPropagation();
                resetControlsTimeout();
              }}
              onPointerDown={(e) => {
                e.stopPropagation();
                resetControlsTimeout();
              }}
              className={`absolute bottom-0 inset-x-0 h-1 sm:h-1.5 z-20 cursor-pointer transition-opacity duration-300 ${
                !effectiveControlsVisible ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
              }`}
              title="Click to show controls"
            >
              {/* Unplayed blurred black background */}
              <div className="absolute inset-0 bg-black/85 backdrop-blur-md border-t border-white/20" />
              {/* Buffer Bar */}
              <div
                className="absolute h-full bg-zinc-600/60 transition-all pointer-events-none"
                style={{ width: `${Math.min(100, bufferedPercent)}%` }}
              />
              {/* Watched Progress Bar in native emerald color */}
              <div
                className="absolute h-full bg-gradient-to-r from-emerald-500 to-teal-400 shadow-[0_0_8px_rgba(16,185,129,0.7)] transition-all pointer-events-none"
                style={{
                  width: `${totalDuration > 0 ? (currentPosition / totalDuration) * 100 : 0}%`,
                }}
              />
            </div>
          )}

          {/* Bottom Controls Bar (Unified layout from PlayerFU) */}
          {engine === "native" && (
            <div
              data-player-control="true"
              onClick={(e) => {
                e.stopPropagation();
                resetControlsTimeout();
              }}
              onTouchEnd={(e) => {
                e.stopPropagation();
                resetControlsTimeout();
              }}
              onMouseEnter={() => {
                if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
                setIsControlsVisible(true);
              }}
              onMouseMove={(e) => {
                e.stopPropagation();
                resetControlsTimeout();
              }}
              className={`control-bar absolute bottom-0 inset-x-0 p-3 sm:p-4 md:p-5 bg-gradient-to-t from-black/90 via-black/50 to-transparent flex flex-col gap-2 z-30 transition-opacity duration-300 ${
                effectiveControlsVisible ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
              }`}
            >
              {/* Timeline Progress Bar (Full Width across controls, unified position from PlayerFU) */}
              <div
                data-player-control="true"
                className="relative w-full flex items-center h-4 cursor-pointer group mb-1"
                onClick={(e) => {
                  e.stopPropagation();
                  if (!canSeekNow()) {
                    return;
                  }
                  const rect = e.currentTarget.getBoundingClientRect();
                  const clickX = e.clientX - rect.left;
                  const pct = Math.max(0, Math.min(1, clickX / rect.width));
                  const target = pct * (totalDuration || 100);
                  executeSeek(target);
                }}
                onTouchEnd={(e) => {
                  e.stopPropagation();
                }}
              >
                {/* Unplayed track background */}
                <div className="absolute inset-x-0 h-1.5 group-hover:h-2 bg-black/80 backdrop-blur-md rounded-full border border-white/15 shadow-inner pointer-events-none transition-all" />

                {/* Buffer Bar */}
                <div
                  className="absolute h-1.5 group-hover:h-2 bg-zinc-600/60 rounded-full pointer-events-none transition-all"
                  style={{ width: `${Math.min(100, bufferedPercent)}%` }}
                />

                {/* Watched Progress Bar (native emerald gradient) */}
                <div
                  className="absolute h-1.5 group-hover:h-2 bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full pointer-events-none transition-all shadow-[0_0_8px_rgba(16,185,129,0.7)]"
                  style={{
                    width: `${totalDuration > 0 ? (currentPosition / totalDuration) * 100 : 0}%`,
                  }}
                />

                {/* Scrubber thumb circle knob */}
                <div
                  className={`absolute w-3 h-3 -ml-1.5 bg-white rounded-full shadow-[0_0_8px_rgba(16,185,129,0.9)] border border-emerald-500 pointer-events-none transition-transform duration-100 ${
                    isControlsVisible ? "scale-100" : "scale-0"
                  } group-hover:scale-125`}
                  style={{
                    left: `${totalDuration > 0 ? (currentPosition / totalDuration) * 100 : 0}%`,
                  }}
                />

                {/* Native range input for accessible scrubbing */}
                <input
                  type="range"
                  min={0}
                  max={totalDuration || 100}
                  step={1}
                  value={currentPosition}
                  disabled={!isControlsVisible}
                  onChange={handleScrubberChange}
                  onClick={(e) => e.stopPropagation()}
                  onTouchEnd={(e) => e.stopPropagation()}
                  className="w-full h-3 opacity-0 cursor-pointer z-10"
                />
              </div>

              {/* Action Buttons Row (Priority & space-adaptive layout) */}
              <div className="w-full flex items-center justify-between gap-1.5 sm:gap-3">
                {/* Left side: Play button, Volume wrap (Priority 5), Time display (Priority 1 + 7) */}
                <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
                  {/* Priority 1: Dedicated Play/Pause button */}
                  <button
                    type="button"
                    data-player-control="true"
                    onClick={(e) => {
                      e.stopPropagation();
                      togglePlay();
                    }}
                    onTouchEnd={(e) => e.stopPropagation()}
                    className="w-8.5 h-8.5 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl border border-white/10 hover:border-emerald-500/40 bg-white/5 hover:bg-emerald-500/20 text-white hover:text-emerald-300 transition-all flex items-center justify-center cursor-pointer active:scale-95 shadow-sm shrink-0"
                    title={isPlaying ? "Pause (Space)" : "Play (Space)"}
                    aria-label={isPlaying ? "Pause (Space)" : "Play (Space)"}
                  >
                    {isPlaying ? (
                      <Pause className="w-4.5 h-4.5 fill-current" />
                    ) : (
                      <Play className="w-4.5 h-4.5 fill-current ml-0.5" />
                    )}
                  </button>

                  {/* Priority 5: Mute + volume adjuster button */}
                  {showP5Volume && (
                    <div
                      data-player-control="true"
                      onClick={(e) => e.stopPropagation()}
                      onTouchEnd={(e) => e.stopPropagation()}
                      className="flex items-center gap-1.5 shrink-0"
                    >
                      <button
                        type="button"
                        data-player-control="true"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsMuted(!isMuted);
                        }}
                        onTouchEnd={(e) => e.stopPropagation()}
                        className="w-8 h-8 rounded-lg border border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10 text-white flex items-center justify-center transition-all cursor-pointer"
                        title={isMuted ? "Unmute (M)" : "Mute (M)"}
                        aria-label={isMuted ? "Unmute (M)" : "Mute (M)"}
                      >
                        {isMuted || volume === 0 ? (
                          <VolumeX className="w-4 h-4 text-red-400" />
                        ) : volume < 0.5 ? (
                          <Volume1 className="w-4 h-4" />
                        ) : (
                          <Volume2 className="w-4 h-4" />
                        )}
                      </button>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={isMuted ? 0 : volume}
                        onClick={(e) => {
                          e.stopPropagation();
                          resetControlsTimeout();
                        }}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          isInteractingControlsRef.current = true;
                          resetControlsTimeout();
                        }}
                        onPointerUp={(e) => {
                          e.stopPropagation();
                          isInteractingControlsRef.current = false;
                          resetControlsTimeout();
                        }}
                        onTouchStart={(e) => {
                          e.stopPropagation();
                          isInteractingControlsRef.current = true;
                          resetControlsTimeout();
                        }}
                        onTouchEnd={(e) => {
                          e.stopPropagation();
                          isInteractingControlsRef.current = false;
                          resetControlsTimeout();
                        }}
                        onChange={(e) => {
                          e.stopPropagation();
                          const val = parseFloat(e.target.value);
                          setVolume(val);
                          setIsMuted(false);
                          safeStorage.setItem("moviznow_volume", String(val));
                          resetControlsTimeout();
                        }}
                        className="w-12 sm:w-20 h-1 accent-emerald-500 bg-zinc-700/80 rounded-lg cursor-pointer"
                        title="Volume"
                        aria-label="Volume"
                      />
                    </div>
                  )}

                  {/* Priority 1: Running progress duration time; Priority 7: Total duration under progress bar when enough space */}
                  <div className="flex items-center text-xs sm:text-[12.5px] font-mono font-semibold ml-0.5 sm:ml-1 shrink-0">
                    <span className="text-white">{formatTime(currentPosition)}</span>
                    {showP7TotalDuration && totalDuration > 60 && (
                      <>
                        <span className="text-zinc-500 mx-1">/</span>
                        <span className="text-zinc-400">{formatTime(totalDuration)}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Middle Spacer */}
                <div className="flex-1 min-w-[4px]" />

                {/* Right side: Crop (P6), Speed (P3), Audio (P2), Subtitles (P4), Quality (P1), Fullscreen (P1) */}
                <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                  {/* Priority 6: Screen Aspect / Fit Mode Toggle (btnVideoFit) */}
                  {showP6CropRatio && (
                    <button
                      type="button"
                      data-player-control="true"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleFitMode();
                      }}
                      onTouchEnd={(e) => e.stopPropagation()}
                      className="h-8 px-2 sm:px-2.5 rounded-lg border border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10 text-white text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 shrink-0"
                      title={`Screen Aspect: ${fitMode === "contain" ? "Fit (16:9)" : fitMode === "cover" ? "Cover" : "Fill"}`}
                    >
                      <Ratio className="w-3.5 h-3.5" />
                      <span className="capitalize">{fitMode === "contain" ? "Fit" : fitMode === "cover" ? "Cover" : "Fill"}</span>
                    </button>
                  )}

                  {/* Priority 3: Playback Speed Button (btnSpeed) */}
                  {showP3Speed && (
                    <button
                      type="button"
                      data-player-control="true"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveMenu(activeMenu === "speed" ? null : "speed");
                      }}
                      onTouchEnd={(e) => e.stopPropagation()}
                      className={`h-8 px-2 sm:px-2.5 rounded-lg border text-xs font-semibold font-mono flex items-center justify-center transition-all cursor-pointer shrink-0 ${
                        activeMenu === "speed"
                          ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400"
                          : "border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10 text-white"
                      }`}
                      title={t("Playback speed")}
                      aria-label={t("Playback speed")}
                    >
                      <span>{playbackSpeed}x</span>
                    </button>
                  )}

                  {/* Priority 2: Audio Languages Button (btnAudio) */}
                  {showP2Audio && (
                    <button
                      type="button"
                      data-player-control="true"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveMenu(activeMenu === "audio" ? null : "audio");
                      }}
                      onTouchEnd={(e) => e.stopPropagation()}
                      className={`h-8 px-2 sm:px-2.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${
                        activeMenu === "audio"
                          ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400"
                          : "border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10 text-white"
                      }`}
                      title={t("Audio Language")}
                      aria-label={t("Audio Language")}
                    >
                      <Mic className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="max-w-[95px] truncate">
                        {formatAudioLanguageLabel(mediaInfo?.audioTracks?.find((a) => a.id === selectedAudioTrack)?.language, { forButton: true })}
                      </span>
                    </button>
                  )}

                  {/* Priority 4: Subtitles Button (btnSubs) */}
                  {showP4Subtitles && (
                    <button
                      type="button"
                      data-player-control="true"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveMenu(activeMenu === "subtitles" ? null : "subtitles");
                      }}
                      onTouchEnd={(e) => e.stopPropagation()}
                      className={`h-8 px-2 sm:px-2.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${
                        selectedSubtitleTrack !== null
                          ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400"
                          : activeMenu === "subtitles"
                          ? "bg-white/10 border-white/20 text-white"
                          : "border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10 text-white"
                      }`}
                      title={t("Subtitles (C)")}
                      aria-label={t("Subtitles (C)")}
                    >
                      <Subtitles className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="max-w-[65px] truncate">
                        {selectedSubtitleTrack === null
                          ? "Off"
                          : computedSubtitleTracks.find((s) => String(s.id) === String(selectedSubtitleTrack))?.title || "Subtitles"}
                      </span>
                    </button>
                  )}



                  {/* Priority 1: Quality Button (btnQuality) */}
                  <button
                    type="button"
                    data-player-control="true"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveMenu(activeMenu === "quality" ? null : "quality");
                    }}
                    onTouchEnd={(e) => e.stopPropagation()}
                    className={`h-8 px-2 sm:px-2.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shrink-0 ${
                      activeMenu === "quality"
                        ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-400"
                        : "border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10 text-white"
                    }`}
                    title={t("Quality")}
                    aria-label={t("Quality")}
                  >
                    <Tv className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{currentQualityLabel}</span>
                    {isSwitchingQuality && <Loader2 className="w-3 h-3 animate-spin text-emerald-300" />}
                  </button>

                  {/* Priority 1: Fullscreen Button (btnFullscreen) */}
                  <button
                    type="button"
                    data-player-control="true"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFullscreen();
                    }}
                    onTouchEnd={(e) => e.stopPropagation()}
                    className="w-8 h-8 rounded-lg border border-white/10 hover:border-white/20 bg-white/5 hover:bg-white/10 text-white flex items-center justify-center transition-all cursor-pointer shrink-0"
                    title={isFullscreen ? "Exit Fullscreen (F)" : "Fullscreen (F)"}
                    aria-label={isFullscreen ? "Exit Fullscreen (F)" : "Fullscreen (F)"}
                  >
                    {isFullscreen ? (
                      <Minimize2 className="w-4 h-4" />
                    ) : (
                      <Maximize2 className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Active Selection Menu Window (Anchored near its triggering button at safest edge, single-line layout) */}
          {activeMenu && (
            <div className="absolute inset-0 z-40 pointer-events-none">
              {/* Invisible backdrop to dismiss window on outside clicks */}
              <div
                onClick={() => setActiveMenu(null)}
                className="absolute inset-0 pointer-events-auto cursor-default"
                aria-label="Dismiss menu"
              />

              {/* Safe bounding container: bounded above bottom controls/progress bar and below top bar */}
              <div className="absolute inset-x-0 top-10 sm:top-12 bottom-16 sm:bottom-18 md:bottom-20 pointer-events-none flex items-end justify-end px-2 sm:px-3 md:px-5">
                <div
                  data-player-control="true"
                  onClick={(e) => e.stopPropagation()}
                  onTouchEnd={(e) => e.stopPropagation()}
                  className={`popup-menu pointer-events-auto w-auto min-w-[210px] sm:min-w-[230px] max-w-[calc(100%-1rem)] max-h-full bg-[#141414]/95 border border-zinc-700/80 rounded-2xl shadow-2xl backdrop-blur-2xl flex flex-col p-2 sm:p-2.5 overflow-hidden ring-1 ring-white/10 animate-in fade-in zoom-in-95 duration-150 ${
                    activeMenu === "quality"
                      ? "mr-0 sm:mr-1 md:mr-3"
                      : activeMenu === "subtitles"
                      ? "mr-0 sm:mr-4 md:mr-8"
                      : activeMenu === "audio"
                      ? "mr-0 sm:mr-8 md:mr-16"
                      : "mr-0 sm:mr-12 md:mr-28"
                  }`}
                >
                  {/* Header with section title, icon & quick close 'X' button */}
                  <div className="flex items-center justify-between px-1.5 pb-2 border-b border-white/10 mb-1.5 shrink-0">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-200">
                      {activeMenu === "speed" && <Gauge className="w-3.5 h-3.5 text-emerald-400" />}
                      {activeMenu === "audio" && <Mic className="w-3.5 h-3.5 text-emerald-400" />}
                      {activeMenu === "subtitles" && <Subtitles className="w-3.5 h-3.5 text-emerald-400" />}
                      {activeMenu === "quality" && <Tv className="w-3.5 h-3.5 text-emerald-400" />}
                      <span>
                        {activeMenu === "speed" && t("Playback speed")}
                        {activeMenu === "audio" && t("Audio Language")}
                        {activeMenu === "subtitles" && t("Subtitles")}
                        {activeMenu === "quality" && t("Quality")}
                      </span>
                      {activeMenu === "quality" && (
                        <span className="text-[10px] text-zinc-500 font-normal ml-1">
                          ({qualityOptions.length})
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveMenu(null)}
                      className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                      title={t("Close")}
                      aria-label={t("Close")}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Scrollable Content Options (fills expanded vertical space upwards) */}
                  <div className="flex-1 overflow-y-auto space-y-1 pr-0.5 custom-scrollbar">
                    {/* Speed Menu Content */}
                    {activeMenu === "speed" && (
                      <>
                        {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3].map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => handleSpeedSelect(s)}
                            className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center justify-between cursor-pointer ${
                              playbackSpeed === s
                                ? "bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30"
                                : "text-zinc-300 hover:bg-white/10 hover:text-white"
                            }`}
                          >
                            <span>{s === 1 ? "1x (Normal)" : `${s}x`}</span>
                            {playbackSpeed === s && <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 ml-auto" />}
                          </button>
                        ))}
                      </>
                    )}

                    {/* Audio Language Menu Content - Single Line (e.g. Hindi AAC Stereo) */}
                    {activeMenu === "audio" && (
                      <>
                        {(mediaInfo?.audioTracks && mediaInfo.audioTracks.length > 0
                          ? mediaInfo.audioTracks
                          : [{ id: 0, language: "Default", codec: "AAC", title: "Default Audio" }]
                        ).map((tr) => (
                          <button
                            key={tr.id}
                            type="button"
                            onClick={() => handleAudioSelect(tr.id)}
                            className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center justify-between gap-3 cursor-pointer ${
                              selectedAudioTrack === tr.id
                                ? "bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30"
                                : "text-zinc-300 hover:bg-white/10 hover:text-white"
                            }`}
                          >
                            <div className="flex items-center gap-1.5 truncate min-w-0">
                              <span className="font-bold truncate">{formatAudioLanguageLabel(tr.language)}</span>
                              <span className={`text-[11px] font-normal uppercase shrink-0 ${
                                selectedAudioTrack === tr.id ? "text-emerald-300/80" : "text-zinc-400"
                              }`}>
                                {tr.codec || "AAC"} Stereo
                              </span>
                            </div>
                            {selectedAudioTrack === tr.id && <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 ml-auto" />}
                          </button>
                        ))}
                      </>
                    )}

                    {/* Subtitles Menu Content - Single Line */}
                    {activeMenu === "subtitles" && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleSubtitleSelect(null)}
                          className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center justify-between cursor-pointer ${
                            selectedSubtitleTrack === null
                              ? "bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30"
                              : "text-zinc-300 hover:bg-white/10 hover:text-white"
                          }`}
                        >
                          <span>{t("Off")}</span>
                          {selectedSubtitleTrack === null && <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 ml-auto" />}
                        </button>
                        {computedSubtitleTracks.length === 0 ? (
                          <div className="px-2.5 py-1.5 text-[11px] text-zinc-400 italic">
                            {t("No subtitles available")}
                          </div>
                        ) : (
                          computedSubtitleTracks.map((sub) => {
                            const cleanSubLabel =
                              sub.title ||
                              formatSubtitleLanguageLabel(sub.language, undefined, sub.id);

                            const isSelected = String(selectedSubtitleTrack) === String(sub.id);

                            return (
                              <button
                                key={sub.id}
                                type="button"
                                onClick={() => handleSubtitleSelect(sub.id)}
                                className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center justify-between cursor-pointer ${
                                  isSelected
                                    ? "bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30"
                                    : "text-zinc-300 hover:bg-white/10 hover:text-white"
                                }`}
                              >
                                <span className="truncate">{cleanSubLabel}</span>
                                {isSelected && <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 ml-auto" />}
                              </button>
                            );
                          })
                        )}

                        {/* Subtitle Size Adjuster */}
                        {selectedSubtitleTrack !== null && (
                          <div className="border-t border-white/10 pt-1.5 mt-1 flex flex-col gap-1">
                            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider px-2 py-0.5">
                              {t("Subtitle Size")}
                            </span>
                            <div className="grid grid-cols-3 gap-1 px-1">
                              {(["small", "normal", "large"] as const).map((sz) => (
                                <button
                                  key={sz}
                                  type="button"
                                  onClick={() => handleSubtitleSizeSelect(sz)}
                                  className={`py-1 text-[11px] font-bold rounded-lg capitalize transition-all cursor-pointer ${
                                    subtitleSize === sz
                                      ? "bg-emerald-500 text-white"
                                      : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                                  }`}
                                >
                                  {sz}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Subtitle Background Adjuster */}
                        {selectedSubtitleTrack !== null && (
                          <div className="border-t border-white/10 pt-1.5 mt-1 flex flex-col gap-1">
                            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider px-2 py-0.5">
                              {t("Subtitle Background")}
                            </span>
                            <div className="grid grid-cols-3 gap-1 px-1">
                              {([
                                { id: "black", label: t("Black") },
                                { id: "semi", label: t("Semi") },
                                { id: "transparent", label: t("None") },
                              ] as const).map((bgOpt) => (
                                <button
                                  key={bgOpt.id}
                                  type="button"
                                  onClick={() => handleSubtitleBgSelect(bgOpt.id)}
                                  className={`py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer ${
                                    subtitleBg === bgOpt.id
                                      ? "bg-emerald-500 text-white"
                                      : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                                  }`}
                                >
                                  {bgOpt.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    {/* Quality Menu Content - Single Line (e.g. 480p 650MB, 720p 1.1GB, 1080p 3.2GB) */}
                    {activeMenu === "quality" && (
                      <>
                        {qualityOptions.map((opt, idx) => {
                          const isCurrent = opt.label.toUpperCase() === currentQualityLabel.toUpperCase();
                          const isBufferingThis = isSwitchingQuality && switchingQualityLabel === opt.label;
                          const rawSize = opt.size ? String(opt.size).trim() : "";
                          const rawUnit = opt.unit ? String(opt.unit).trim() : "";
                          const sizeDisplay = rawSize
                            ? rawUnit && !rawSize.toUpperCase().endsWith(rawUnit.toUpperCase())
                              ? `${rawSize}${rawUnit}`
                              : rawSize
                            : "";

                          return (
                            <button
                              key={`${opt.url}-${idx}`}
                              type="button"
                              onClick={() => handleQualitySelect(opt)}
                              disabled={isSwitchingQuality}
                              className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center justify-between gap-3 cursor-pointer ${
                                isCurrent
                                  ? "bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30"
                                  : "text-zinc-300 hover:bg-white/10 hover:text-white"
                              }`}
                            >
                              <div className="flex items-center gap-2 truncate">
                                <span className="font-bold">{opt.label}</span>
                                {sizeDisplay && (
                                  <span className={`text-[11px] font-normal ${isCurrent ? "text-emerald-300/80" : "text-zinc-400"}`}>
                                    {sizeDisplay}
                                  </span>
                                )}
                              </div>
                              {isBufferingThis ? (
                                <span className="text-[10px] text-amber-300 font-medium animate-pulse ml-auto shrink-0 flex items-center gap-1">
                                  <Loader2 className="w-3 h-3 animate-spin text-amber-300" />
                                  <span>{t("Buffering...")}</span>
                                </span>
                              ) : isCurrent ? (
                                <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 ml-auto" />
                              ) : null}
                            </button>
                          );
                        })}
                      </>
                    )}


                  </div>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

export default NativePlayer;
