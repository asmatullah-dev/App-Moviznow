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
  RefreshCw,
  Server,
} from "lucide-react";
import { useLanguage } from "../contexts/LanguageContext";
import { safeStorage } from "../utils/safeStorage";
import { useModalBehavior } from "../hooks/useModalBehavior";
import { getStreamingApiBase } from "../utils/domains";
export { getStreamingApiBase };
import {
  modalBackdropAnimation,
  modalContainerAnimation,
  fullScreenModalAnimation,
  modalGpuStyle,
} from "../utils/modalAnimations";

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

export interface NativePlayerProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  watchUrl?: string;
  streamUrl?: string;
  contentId?: string;
  poster?: string;
  year?: string | number;
  quality?: string;
  seasonInfo?: { number: number; title?: string };
  episodeInfo?: { number: number; title?: string };
  candidates?: Array<{ text: string; href: string }>;
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
 * Helper to find the Pixeldrain candidate from a list of candidates
 */
export function findPixeldrainCandidate(
  candidates?: Array<{ text?: string; href?: string }>
): { text: string; href: string; streamUrl: string } | null {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  const match = candidates.find((c) => {
    if (!c || !c.href) return false;
    const t = (c.text || "").toLowerCase();
    const h = (c.href || "").toLowerCase();
    return (
      t.includes("pixel") ||
      h.includes("pixeldrain") ||
      h.includes("pixelserver") ||
      h.includes("pixel.drain") ||
      h.includes("pixeldra.in") ||
      t.includes("pdrain")
    );
  });
  if (match && match.href) {
    const rawHref = match.href.trim();
    return {
      text: match.text || "Pixeldrain Server",
      href: rawHref,
      streamUrl: normalizePixeldrainUrl(rawHref),
    };
  }
  return null;
}

/**
 * Helper to find the watch online or FSL candidate from a list of candidates
 */
export function findWatchOnlineCandidate(
  candidates?: Array<{ text?: string; href?: string }>
): { text: string; href: string } | null {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  // 1. Always prioritize FSL Server
  const fsl = findFslCandidate(candidates);
  if (fsl) {
    return fsl;
  }
  // 2. If FSL Server is missing, prioritize Pixeldrain server
  const pixel = findPixeldrainCandidate(candidates);
  if (pixel) {
    return { text: pixel.text, href: pixel.streamUrl };
  }
  // 3. Fallback to watch online, stream, or hbplay
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
    const cached = watchCheckCache.get(trimmedUrl);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      setData(cached.data);
      return;
    }

    let isMounted = true;
    setIsLoading(true);

    const apiBase = getStreamingApiBase();
    const controller = new AbortController();

    const doFetch = (base: string) => {
      return fetch(`${base}/api/native-player/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmedUrl }),
        signal: controller.signal,
      }).then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      });
    };

    const handleSuccess = (resData: any) => {
      if (isMounted) {
        const stream = resData?.streamUrl || resData?.sourceUrl || resData?.directUrl;
        const normalized: NativeStreamData = {
          ...resData,
          hasWatchOnline: Boolean(resData?.hasWatchOnline || resData?.playable || stream),
          streamUrl: stream,
          watchUrl: resData?.watchUrl || stream,
          playable: resData?.playable !== undefined ? resData.playable : Boolean(stream),
        };
        watchCheckCache.set(trimmedUrl, { data: normalized, timestamp: Date.now() });
        setData(normalized);
        setIsLoading(false);
      }
    };

    doFetch(apiBase)
      .then(handleSuccess)
      .catch((err) => {
        if (apiBase && !controller.signal.aborted) {
          doFetch("")
            .then(handleSuccess)
            .catch((fallbackErr) => {
              if (isMounted && fallbackErr.name !== "AbortError") {
                setIsLoading(false);
              }
            });
          return;
        }
        if (isMounted && err.name !== "AbortError") {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
      controller.abort();
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
  watchUrl = "",
  streamUrl: propStreamUrl,
  contentId = "default_content",
  poster = "",
  quality = "720p",
  seasonInfo,
  episodeInfo,
  candidates,
}: NativePlayerProps) {
  const { t } = useLanguage();
  useModalBehavior(isOpen, onClose);

  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const controlsTimeoutRef = useRef<any>(null);
  const progressSaveIntervalRef = useRef<any>(null);
  const toastTimeoutRef = useRef<any>(null);

  // Parse direct stream URL (prioritizing FSL candidate, Pixeldrain candidate if FSL missing, decoded meta, propStreamUrl, or direct watchUrl)
  const fslCandidate = useMemo(() => findFslCandidate(candidates), [candidates]);
  const pixeldrainCandidate = useMemo(() => findPixeldrainCandidate(candidates), [candidates]);
  const decodedMeta = useMemo(() => decodeWatchUrl(watchUrl), [watchUrl]);

  // Active server: default to "fsl" if fslCandidate exists, otherwise "pixeldrain" if pixeldrainCandidate exists, else "default"
  const [activeServer, setActiveServer] = useState<"fsl" | "pixeldrain" | "default">(() => {
    if (fslCandidate) return "fsl";
    if (pixeldrainCandidate) return "pixeldrain";
    return "default";
  });

  // Keep activeServer in sync when modal opens or candidates change
  useEffect(() => {
    if (isOpen) {
      if (fslCandidate) {
        setActiveServer("fsl");
      } else if (pixeldrainCandidate) {
        setActiveServer("pixeldrain");
      } else {
        setActiveServer("default");
      }
    }
  }, [isOpen, fslCandidate, pixeldrainCandidate]);

  const rawStreamUrl = useMemo(() => {
    if (activeServer === "pixeldrain" && pixeldrainCandidate) {
      return pixeldrainCandidate.streamUrl || pixeldrainCandidate.href;
    }
    if (activeServer === "fsl" && fslCandidate) {
      return fslCandidate.href;
    }
    return (
      fslCandidate?.href ||
      pixeldrainCandidate?.streamUrl ||
      propStreamUrl ||
      decodedMeta.streamUrl ||
      (watchUrl && !watchUrl.includes("hbplay.pages.dev") ? watchUrl : "")
    );
  }, [activeServer, fslCandidate, pixeldrainCandidate, propStreamUrl, decodedMeta, watchUrl]);

  const directStreamUrl = normalizePixeldrainUrl(rawStreamUrl);
  const displayTitle = decodedMeta.title || title;

  // Engine: "native" (Universal Codec Transcode Engine) or "web" (HubCloud Web Player)
  const [engine, setEngine] = useState<"native" | "web">("native");
  const [mediaInfo, setMediaInfo] = useState<MediaProbeInfo | null>(null);

  const isDirectMkv = useMemo(() => {
    if (!directStreamUrl) return false;
    const lower = directStreamUrl.toLowerCase();
    return (
      lower.includes(".mkv") ||
      lower.includes("matroska") ||
      Boolean(mediaInfo?.isMkv) ||
      Boolean(mediaInfo?.needsTranscode)
    );
  }, [directStreamUrl, mediaInfo]);

  const [streamAttempt, setStreamAttempt] = useState<number>(0);
  const [streamMode, setStreamMode] = useState<"proxy" | "transcode">(() => {
    return isDirectMkv ? "transcode" : "proxy";
  });

  useEffect(() => {
    if (isDirectMkv || mediaInfo?.isMkv || mediaInfo?.needsTranscode) {
      setStreamMode("transcode");
    }
  }, [isDirectMkv, mediaInfo]);
  const [seekOffset, setSeekOffset] = useState<number>(0);
  const [totalDuration, setTotalDuration] = useState<number>(0);
  const [selectedAudioTrack, setSelectedAudioTrack] = useState<number>(0);
  const [selectedSubtitleTrack, setSelectedSubtitleTrack] = useState<number | null>(null);
  const [subtitleCues, setSubtitleCues] = useState<Array<{ start: number; end: number; text: string }>>([]);
  const [activeSubtitleText, setActiveSubtitleText] = useState<string>("");
  const [subtitleSize, setSubtitleSize] = useState<"small" | "normal" | "large">(() => {
    const s = safeStorage.getItem("moviznow_subtitle_size");
    return (s as any) || "normal";
  });

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
    const saved = safeStorage.getItem("moviznow_playback_speed");
    return saved ? parseFloat(saved) : 1;
  });
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isControlsVisible, setIsControlsVisible] = useState<boolean>(true);
  const [isBuffering, setIsBuffering] = useState<boolean>(true);
  const [hasPlaybackError, setHasPlaybackError] = useState<boolean>(false);
  const [fitMode, setFitMode] = useState<"contain" | "cover" | "fill">("contain");

  const [activeMenu, setActiveMenu] = useState<"speed" | "audio" | "subtitles" | null>(null);
  const [doubleTapFeedback, setDoubleTapFeedback] = useState<"left" | "right" | null>(null);

  // Storage key for resume
  const storageKey = `moviznow_progress_${contentId}`;
  const latestPositionRef = useRef<number>(0);
  const lastSaveTimeRef = useRef<number>(0);

  const savePlaybackPosition = useCallback((timeToSave: number) => {
    if (timeToSave > 3) {
      const rounded = Math.floor(timeToSave);
      latestPositionRef.current = rounded;
      try {
        safeStorage.setItem(storageKey, String(rounded));
        localStorage.setItem(storageKey, String(rounded));
        lastSaveTimeRef.current = Date.now();
      } catch {}
    }
  }, [storageKey]);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 2200);
  }, []);

  const hasStartedPlaybackRef = useRef<boolean>(false);

  // 15-second fallback: if playing on FSL server and it fails to start playing in 15 seconds, change to Pixeldrain
  useEffect(() => {
    if (!isOpen || engine !== "native") return;
    if (activeServer !== "fsl") return;
    if (!pixeldrainCandidate) return;

    hasStartedPlaybackRef.current = false;
    const timerId = setTimeout(() => {
      // If FSL server failed to start playback in 15 seconds
      if (!hasStartedPlaybackRef.current) {
        console.warn("[NativePlayer] FSL Server failed to start playback within 15 seconds. Switching to Pixeldrain Server...");
        showToast(t("FSL server took too long. Switching to Pixeldrain..."));
        setActiveServer("pixeldrain");
        setStreamMode("proxy");
        setHasPlaybackError(false);
        setStreamAttempt((prev) => prev + 1);
        setIsBuffering(true);
      }
    }, 15000);

    return () => {
      clearTimeout(timerId);
    };
  }, [isOpen, activeServer, pixeldrainCandidate, engine, streamAttempt, showToast, t]);

  // Fetch probe media info (exact duration, audio streams, subtitles)
  useEffect(() => {
    if (!isOpen || !directStreamUrl) return;

    let isMounted = true;
    const apiBase = getStreamingApiBase();
    fetch(`${apiBase}/api/native-player/info?url=${encodeURIComponent(directStreamUrl)}`)
      .then((res) => res.json())
      .then((data: MediaProbeInfo) => {
        if (!isMounted) return;
        setMediaInfo(data);
        if (data.duration && data.duration > 0) {
          setTotalDuration(data.duration);
        }
      })
      .catch((err) => {
        console.warn("[Media probe warning]:", err);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, directStreamUrl]);

  // Initial auto-resume detection (automatically resume from saved progress without asking)
  useEffect(() => {
    if (!isOpen) return;
    try {
      const saved = safeStorage.getItem(storageKey) || localStorage.getItem(storageKey);
      if (saved) {
        const time = parseFloat(saved);
        if (!isNaN(time) && time > 5) {
          const roundedTime = Math.floor(time);
          latestPositionRef.current = roundedTime;
          setSeekOffset(roundedTime);
          setCurrentPosition(roundedTime);
          showToast(`${t("Resumed from")} ${formatTime(roundedTime)}`);
        }
      }
    } catch {}
  }, [isOpen, storageKey, t, showToast]);

  // Construct stream URL with seek offset and audio track
  const currentStreamSrc = useMemo(() => {
    if (!directStreamUrl) return "";

    const requiresTranscode =
      streamMode === "transcode" ||
      isDirectMkv ||
      Boolean(mediaInfo?.isMkv) ||
      Boolean(mediaInfo?.needsTranscode);

    // If on Pixeldrain and proxy failed on retry (streamAttempt >= 1), only stream directly if file DOES NOT require transcoding
    // Pixeldrain supports CORS (Access-Control-Allow-Origin: *), completely bypassing serverless limits for native mp4
    if (
      !requiresTranscode &&
      activeServer === "pixeldrain" &&
      streamAttempt >= 1 &&
      directStreamUrl.startsWith("http") &&
      selectedAudioTrack === 0 &&
      seekOffset === 0
    ) {
      return directStreamUrl;
    }

    const params = new URLSearchParams();
    params.set("url", directStreamUrl);
    params.set("mode", streamMode);

    if (streamMode === "transcode" && seekOffset > 0) {
      params.set("ss", String(seekOffset));
    }
    if (selectedAudioTrack > 0) {
      params.set("audio", String(selectedAudioTrack));
    }
    if (streamAttempt > 0) {
      params.set("_r", String(streamAttempt));
    }

    const apiBase = getStreamingApiBase();
    return `${apiBase}/api/native-player/stream?${params.toString()}`;
  }, [directStreamUrl, activeServer, streamMode, seekOffset, selectedAudioTrack, streamAttempt, isDirectMkv, mediaInfo]);

  const controlsShownAtRef = useRef<number>(Date.now());

  // Handle Controls Auto-Hide
  const resetControlsTimeout = useCallback(() => {
    setIsControlsVisible((prev) => {
      if (!prev) {
        controlsShownAtRef.current = Date.now();
      }
      return true;
    });
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    if (isPlaying) {
      controlsTimeoutRef.current = setTimeout(() => {
        setIsControlsVisible(false);
        setActiveMenu(null);
      }, 3500);
    }
  }, [isPlaying]);

  useEffect(() => {
    if (isPlaying) {
      resetControlsTimeout();
    } else {
      setIsControlsVisible(true);
      controlsShownAtRef.current = Date.now();
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    }
    return () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, [isPlaying, resetControlsTimeout]);

  // Prevent changing duration on 1st click when menu/controls are hidden
  const canSeekNow = useCallback((): boolean => {
    if (!isControlsVisible || Date.now() - controlsShownAtRef.current < 500) {
      resetControlsTimeout();
      return false;
    }
    return true;
  }, [isControlsVisible, resetControlsTimeout]);

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

  // Video Event Handlers
  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const current =
      streamMode === "transcode"
        ? seekOffset + videoRef.current.currentTime
        : videoRef.current.currentTime;
    setCurrentPosition(current);
    latestPositionRef.current = Math.floor(current);

    // Keep remembering new position every 5 to 10 seconds while playing
    const now = Date.now();
    if (now - lastSaveTimeRef.current >= 5000) {
      savePlaybackPosition(current);
    }

    // If time is actively advancing, stream is playing and NOT buffering!
    if (!videoRef.current.paused) {
      if (isBuffering) setIsBuffering(false);
      if (!isPlaying) setIsPlaying(true);
    }

    // Match inbuilt subtitle cue from MKV file without any track downloads
    if (selectedSubtitleTrack !== null && subtitleCues.length > 0) {
      const activeCue = subtitleCues.find(
        (cue) => current >= cue.start && current <= cue.end
      );
      setActiveSubtitleText(activeCue ? activeCue.text : "");
    } else if (selectedSubtitleTrack === null && activeSubtitleText) {
      setActiveSubtitleText("");
    }

    if (videoRef.current.buffered.length > 0) {
      const bufferedEnd = videoRef.current.buffered.end(videoRef.current.buffered.length - 1);
      const effectiveDuration = totalDuration || videoRef.current.duration;
      if (effectiveDuration > 0) {
        const bufferedPos = streamMode === "transcode" ? seekOffset + bufferedEnd : bufferedEnd;
        setBufferedPercent((bufferedPos / effectiveDuration) * 100);
      }
    }
  };

  const handleLoadedMetadata = () => {
    if (!videoRef.current) return;
    if (!totalDuration && videoRef.current.duration && isFinite(videoRef.current.duration)) {
      setTotalDuration(videoRef.current.duration);
    }
    setIsBuffering(false);
    setHasPlaybackError(false);

    // If resuming in proxy mode, seek to remembered position
    const savedTarget = latestPositionRef.current || currentPosition;
    if (streamMode === "proxy" && savedTarget > 3) {
      try {
        videoRef.current.currentTime = savedTarget;
      } catch {}
    }

    videoRef.current.playbackRate = playbackSpeed;
    videoRef.current.play().then(() => {
      setIsPlaying(true);
      hasStartedPlaybackRef.current = true;
    }).catch(() => {
      setIsPlaying(false);
    });
  };

  const handleRetryPlayback = useCallback(() => {
    setHasPlaybackError(false);
    setIsBuffering(true);
    setStreamMode("transcode");
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
    // If on FSL server and Pixeldrain candidate is available, switch immediately to Pixeldrain!
    if (activeServer === "fsl" && pixeldrainCandidate) {
      console.warn("[NativePlayer] FSL server error encountered. Switching to Pixeldrain Server...");
      showToast(t("FSL server error. Switching to Pixeldrain..."));
      setActiveServer("pixeldrain");
      const needsTc = isDirectMkv || mediaInfo?.isMkv || mediaInfo?.needsTranscode;
      setStreamMode(needsTc ? "transcode" : "proxy");
      setHasPlaybackError(false);
      setStreamAttempt((prev) => prev + 1);
      setIsBuffering(true);
      return;
    }

    // If proxy failed on Pixeldrain or any stream, escalate to transcode mode before failing!
    if (streamMode === "proxy") {
      console.warn("[NativePlayer] Proxy mode failed. Escalating to transcode engine...");
      setStreamMode("transcode");
      setStreamAttempt((prev) => prev + 1);
      setIsBuffering(true);
      return;
    }

    // If transcode failed on attempt 0 or 1, retry once
    if (streamAttempt === 0) {
      setStreamAttempt(1);
      setIsBuffering(true);
      return;
    }

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
        streamMode === "transcode"
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
        streamMode === "transcode"
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

  // Perform seek
  const executeSeek = (targetSeconds: number) => {
    const duration = totalDuration || 100;
    const clampedTarget = Math.max(0, Math.min(duration, targetSeconds));

    setIsBuffering(true);
    setCurrentPosition(clampedTarget);
    latestPositionRef.current = Math.floor(clampedTarget);
    savePlaybackPosition(clampedTarget);

    if (streamMode === "transcode") {
      setSeekOffset(clampedTarget);
      if (videoRef.current) {
        videoRef.current.currentTime = 0;
      }
    } else {
      if (videoRef.current) {
        try {
          videoRef.current.currentTime = clampedTarget;
          setIsBuffering(false);
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
    safeStorage.setItem("moviznow_playback_speed", String(speed));
    setActiveMenu(null);
    showToast(`Speed: ${speed}x`);
    resetControlsTimeout();
  };

  const handleAudioSelect = (trackId: number) => {
    setSelectedAudioTrack(trackId);
    executeSeek(currentPosition);
    setActiveMenu(null);
    const track = mediaInfo?.audioTracks.find((a) => a.id === trackId);
    if (track) {
      showToast(`Audio: ${track.language}`);
    }
  };

  const handleSubtitleSelect = (subId: number | null) => {
    setSelectedSubtitleTrack(subId);
    setActiveMenu(null);
    if (subId === null) {
      setSubtitleCues([]);
      setActiveSubtitleText("");
      showToast("Subtitles: Off");
      return;
    }
    const sub = mediaInfo?.subtitleTracks.find((s) => s.id === subId);
    showToast(`Loading ${sub?.language || "English"} Subtitles...`);

    const apiBase = getStreamingApiBase();
    fetch(`${apiBase}/api/native-player/subtitles?url=${encodeURIComponent(directStreamUrl)}&sub=${subId}`)
      .then((r) => r.json())
      .then((res) => {
        if (res.cues && Array.isArray(res.cues)) {
          setSubtitleCues(res.cues);
          showToast(`Subtitles: ${sub?.language || "English"}`);
        } else {
          showToast("Subtitles unavailable");
        }
      })
      .catch((err) => {
        console.warn("Subtitle fetch error:", err);
        showToast("Subtitles unavailable");
      });
  };

  const handleSubtitleSizeSelect = (size: "small" | "normal" | "large") => {
    setSubtitleSize(size);
    safeStorage.setItem("moviznow_subtitle_size", size);
  };

  // Double tap to seek on touch screens
  const lastTapRef = useRef<{ time: number; x: number }>({ time: 0, x: 0 });
  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
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
    if (diff < 300) {
      const clickX = touch.clientX - rect.left;
      if (clickX < rect.width / 2) {
        seekBy(-10);
      } else {
        seekBy(10);
      }
      lastTapRef.current = { time: 0, x: 0 };
    } else {
      lastTapRef.current = { time: now, x: touch.clientX };
      resetControlsTimeout();
    }
  };

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
              resetControlsTimeout();
            }}
            className="relative w-full h-full flex items-center justify-center overflow-hidden bg-black"
          >
            {engine === "native" && currentStreamSrc ? (
              <video
                ref={videoRef}
                src={currentStreamSrc}
                poster={poster}
                playsInline
                preload="auto"
                onClick={(e) => {
                  e.stopPropagation();
                  resetControlsTimeout();
                }}
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                onCanPlay={() => {
                  setIsBuffering(false);
                  setHasPlaybackError(false);
                }}
                onCanPlayThrough={() => {
                  setIsBuffering(false);
                }}
                onWaiting={() => {
                  if (videoRef.current?.paused || videoRef.current?.seeking) {
                    setIsBuffering(true);
                  }
                }}
                onPlaying={() => {
                  setIsBuffering(false);
                  setIsPlaying(true);
                  setHasPlaybackError(false);
                  hasStartedPlaybackRef.current = true;
                }}
                onPause={() => {
                  setIsPlaying(false);
                  if (videoRef.current) {
                    const pos = Math.floor(seekOffset + (videoRef.current.currentTime || 0));
                    latestPositionRef.current = pos;
                    savePlaybackPosition(pos);
                  }
                }}
                onEnded={() => {
                  setIsPlaying(false);
                  if (videoRef.current) {
                    const pos = Math.floor(seekOffset + (videoRef.current.currentTime || 0));
                    latestPositionRef.current = pos;
                    savePlaybackPosition(pos);
                  }
                }}
                onError={() => {
                  if (videoRef.current) {
                    const pos = Math.floor(seekOffset + (videoRef.current.currentTime || 0));
                    if (pos > 0) {
                      latestPositionRef.current = pos;
                      savePlaybackPosition(pos);
                    }
                  }
                  handleVideoError();
                }}
                className={`w-full h-full cursor-default transition-all duration-300 ${
                  fitMode === "cover"
                    ? "object-cover"
                    : fitMode === "fill"
                    ? "object-fill"
                    : "object-contain"
                }`}
              />
            ) : (
              <iframe
                src={watchUrl}
                allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
                className="w-full h-full border-none"
                title={displayTitle}
              />
            )}

            {/* Custom High-Definition Subtitle Cue Overlay */}
            {selectedSubtitleTrack !== null && activeSubtitleText && (
              <div
                className={`absolute pointer-events-none inset-x-0 flex items-center justify-center px-4 transition-all duration-300 z-25 ${
                  isControlsVisible ? "bottom-24 sm:bottom-28" : "bottom-10 sm:bottom-14"
                }`}
              >
                <div
                  className="bg-black/85 backdrop-blur-xs text-white font-semibold text-center rounded-xl px-4 py-2 max-w-[88%] sm:max-w-[78%] leading-relaxed shadow-2xl border border-white/10 select-none animate-in fade-in duration-150"
                  style={{
                    fontSize:
                      subtitleSize === "small"
                        ? "13px"
                        : subtitleSize === "large"
                        ? "20px"
                        : "16px",
                  }}
                  dangerouslySetInnerHTML={{
                    __html: activeSubtitleText.replace(/\n/g, "<br/>"),
                  }}
                />
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

            {/* Buffering Indicator */}
            {isBuffering && (!videoRef.current || videoRef.current.paused || videoRef.current.currentTime === 0) && engine === "native" && !hasPlaybackError && (
              <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center bg-black/40 backdrop-blur-xs z-20">
                <Loader2 className="w-14 h-14 text-emerald-500 animate-spin mb-3" />
                <span className="text-xs font-bold uppercase tracking-widest text-zinc-300">
                  {t("Loading Stream...")}
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


            {/* Playback Error Fallback Card */}
            {hasPlaybackError && engine === "native" && (
              <div className="absolute inset-0 bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center z-30">
                <div className="w-14 h-14 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-500 mb-4">
                  <Tv className="w-7 h-7" />
                </div>
                <h3 className="text-base sm:text-lg font-black text-white mb-2">
                  {t("Playback Notice")}
                </h3>
                <p className="text-zinc-400 text-xs sm:text-sm max-w-sm mb-6 leading-relaxed">
                  {t("Playback paused due to a temporary network delay. Click Replay or switch Stream Server.")}
                </p>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={handleRetryPlayback}
                    className="px-5 py-3 bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-white font-bold text-sm rounded-xl shadow-lg shadow-emerald-500/25 transition-all flex items-center gap-2 cursor-pointer"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>{t("Replay Video")}</span>
                  </button>
                  {fslCandidate && pixeldrainCandidate && (
                    <button
                      type="button"
                      onClick={() => {
                        const target = activeServer === "fsl" ? "pixeldrain" : "fsl";
                        setActiveServer(target);
                        const needsTc = isDirectMkv || mediaInfo?.isMkv || mediaInfo?.needsTranscode;
                        setStreamMode(target === "pixeldrain" && needsTc ? "transcode" : "proxy");
                        setHasPlaybackError(false);
                        setStreamAttempt((p) => p + 1);
                        setIsBuffering(true);
                        showToast(t(`Switched to ${target === "fsl" ? "FSL" : "Pixeldrain"} Server`));
                      }}
                      className="px-5 py-3 bg-zinc-800 hover:bg-zinc-700 active:scale-95 text-zinc-200 font-bold text-sm rounded-xl border border-zinc-700 transition-all flex items-center gap-2 cursor-pointer"
                    >
                      <Server className="w-4 h-4" />
                      <span>{t("Switch Server")}</span>
                    </button>
                  )}
                  {directStreamUrl && (
                    <a
                      href={directStreamUrl}
                      download
                      target="_blank"
                      rel="noreferrer"
                      className="px-5 py-3 bg-zinc-800/80 hover:bg-zinc-700/80 active:scale-95 text-zinc-300 font-semibold text-sm rounded-xl border border-zinc-700/60 transition-all flex items-center gap-2"
                    >
                      <Download className="w-4 h-4" />
                      <span>{t("Direct Download")}</span>
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Clean Top Bar Overlay (No FSL batch, no codec text) */}
          <div
            className={`absolute top-0 inset-x-0 p-4 sm:p-6 bg-gradient-to-b from-black/85 via-black/40 to-transparent flex items-center justify-between z-30 transition-opacity duration-300 ${
              isControlsVisible ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
            }`}
          >
            <div className="flex items-center gap-3 max-w-[70%]">
              <div className="p-2 bg-emerald-500/20 border border-emerald-500/30 rounded-xl text-emerald-400 shrink-0">
                <Film className="w-5 h-5" />
              </div>
              <div className="truncate">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm sm:text-base font-extrabold text-white truncate">
                    {displayTitle}
                  </h2>
                  <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                    {quality}
                  </span>
                  {seasonInfo && episodeInfo && (
                    <span className="text-[10px] font-bold text-zinc-300 bg-zinc-800 px-2 py-0.5 rounded-md">
                      S{seasonInfo.number}E{episodeInfo.number}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {/* Server Switcher Pill if both FSL and Pixeldrain candidates exist */}
              {fslCandidate && pixeldrainCandidate && (
                <div className="flex items-center gap-1 bg-zinc-900/90 backdrop-blur-md p-1 rounded-xl border border-zinc-700/60 text-xs shadow-md">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (activeServer !== "fsl") {
                        setActiveServer("fsl");
                        setStreamAttempt((p) => p + 1);
                        setIsBuffering(true);
                        showToast(t("Switched to FSL Server"));
                      }
                    }}
                    className={`px-2.5 py-1 rounded-lg font-bold transition-all text-xs cursor-pointer ${
                      activeServer === "fsl"
                        ? "bg-emerald-500 text-white shadow-sm"
                        : "text-zinc-400 hover:text-white"
                    }`}
                  >
                    FSL
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (activeServer !== "pixeldrain") {
                        setActiveServer("pixeldrain");
                        const needsTc = isDirectMkv || mediaInfo?.isMkv || mediaInfo?.needsTranscode;
                        setStreamMode(needsTc ? "transcode" : "proxy");
                        setHasPlaybackError(false);
                        setStreamAttempt((p) => p + 1);
                        setIsBuffering(true);
                        showToast(t("Switched to Pixeldrain Server"));
                      }
                    }}
                    className={`px-2.5 py-1 rounded-lg font-bold transition-all text-xs cursor-pointer ${
                      activeServer === "pixeldrain"
                        ? "bg-cyan-500 text-white shadow-sm"
                        : "text-zinc-400 hover:text-white"
                    }`}
                  >
                    Pixeldrain
                  </button>
                </div>
              )}

              {/* Direct Download Button */}
              {directStreamUrl && (
                <a
                  href={directStreamUrl}
                  download
                  target="_blank"
                  rel="noreferrer"
                  className="p-2 rounded-xl bg-zinc-800/80 hover:bg-zinc-700/80 border border-zinc-700/60 text-zinc-300 hover:text-white transition-all hidden sm:flex"
                  title="Download File"
                >
                  <Download className="w-4 h-4" />
                </a>
              )}

              {/* Close Button */}
              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-xl bg-zinc-800/80 hover:bg-zinc-700/80 border border-zinc-700/60 text-zinc-300 hover:text-white transition-all"
                title="Close Player"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Subtle Mini Progress Bar at the bottom edge when controls are hidden */}
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
                !isControlsVisible ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
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
              {/* Watched Progress Bar */}
              <div
                className="absolute h-full bg-gradient-to-r from-emerald-500 to-teal-400 shadow-[0_0_8px_rgba(16,185,129,0.7)] transition-all pointer-events-none"
                style={{
                  width: `${totalDuration > 0 ? (currentPosition / totalDuration) * 100 : 0}%`,
                }}
              />
            </div>
          )}

          {/* Bottom Controls Bar */}
          {engine === "native" && (
            <div
              className={`absolute bottom-0 inset-x-0 p-4 sm:p-6 bg-gradient-to-t from-black/90 via-black/50 to-transparent flex flex-col gap-3 z-30 transition-opacity duration-300 ${
                isControlsVisible ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
              }`}
            >
              {/* Timeline Progress Bar */}
              <div className="w-full flex items-center gap-3">
                <span className="text-[11px] sm:text-xs font-mono font-bold text-zinc-300 min-w-[45px] text-right">
                  {formatTime(currentPosition)}
                </span>
                <div
                  className="relative flex-1 flex items-center h-5 cursor-pointer group"
                  onClick={(e) => {
                    if (!canSeekNow()) {
                      e.stopPropagation();
                      return;
                    }
                    const rect = e.currentTarget.getBoundingClientRect();
                    const clickX = e.clientX - rect.left;
                    const pct = Math.max(0, Math.min(1, clickX / rect.width));
                    const target = pct * (totalDuration || 100);
                    executeSeek(target);
                  }}
                  onPointerDown={(e) => {
                    if (!canSeekNow()) {
                      e.stopPropagation();
                    }
                  }}
                >
                  {/* Unplayed progress bar location with blur black background */}
                  <div
                    className="absolute inset-x-0 h-2 group-hover:h-2.5 bg-black/80 backdrop-blur-md rounded-full border border-white/20 shadow-inner ring-1 ring-black/50 pointer-events-none transition-all"
                  />

                  {/* Buffer Bar */}
                  <div
                    className="absolute h-2 group-hover:h-2.5 bg-zinc-600/60 rounded-full pointer-events-none transition-all"
                    style={{ width: `${Math.min(100, bufferedPercent)}%` }}
                  />

                  {/* Played / Watched Progress Bar */}
                  <div
                    className="absolute h-2 group-hover:h-2.5 bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full pointer-events-none transition-all shadow-[0_0_10px_rgba(16,185,129,0.6)]"
                    style={{
                      width: `${totalDuration > 0 ? (currentPosition / totalDuration) * 100 : 0}%`,
                    }}
                  />

                  {/* Scrubber thumb circle */}
                  <div
                    className={`absolute w-3.5 h-3.5 -ml-1.75 bg-white rounded-full shadow-[0_0_8px_rgba(16,185,129,0.9)] border-2 border-emerald-500 pointer-events-none transition-transform duration-100 ${
                      isControlsVisible ? "scale-100" : "scale-0"
                    } group-hover:scale-125`}
                    style={{
                      left: `${totalDuration > 0 ? (currentPosition / totalDuration) * 100 : 0}%`,
                    }}
                  />

                  {/* Styled Range input (only interactive when controls are shown) */}
                  <input
                    type="range"
                    min={0}
                    max={totalDuration || 100}
                    step={1}
                    value={currentPosition}
                    disabled={!isControlsVisible || Date.now() - controlsShownAtRef.current < 500}
                    onChange={handleScrubberChange}
                    onClick={(e) => {
                      if (!canSeekNow()) {
                        e.preventDefault();
                        e.stopPropagation();
                      }
                    }}
                    onPointerDown={(e) => {
                      if (!canSeekNow()) {
                        e.preventDefault();
                        e.stopPropagation();
                      }
                    }}
                    className={`w-full h-3 opacity-0 cursor-pointer z-10 ${
                      !isControlsVisible ? "pointer-events-none" : ""
                    }`}
                  />
                </div>
                <span className="text-[11px] sm:text-xs font-mono font-bold text-zinc-400 min-w-[45px]">
                  {formatTime(totalDuration)}
                </span>
              </div>

              {/* Action Buttons Row */}
              <div className="w-full flex items-center justify-between gap-3">
                {/* Left controls: Play/Pause button (always visible), Seek & Volume (only in fullscreen) */}
                <div className="flex items-center gap-2 sm:gap-3">
                  {/* Dedicated Play/Pause button */}
                  <button
                    type="button"
                    onClick={togglePlay}
                    className="p-2 sm:p-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white transition-all active:scale-95 shadow-md shadow-emerald-500/20"
                    title={isPlaying ? "Pause (Space)" : "Play (Space)"}
                  >
                    {isPlaying ? (
                      <Pause className="w-5 h-5 fill-current" />
                    ) : (
                      <Play className="w-5 h-5 fill-current" />
                    )}
                  </button>

                  {/* Hide forward/rewind, mute buttons in normal screen and show in full screen */}
                  {isFullscreen && (
                    <>
                      <button
                        type="button"
                        onClick={() => seekBy(-10)}
                        className="p-2 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 text-zinc-200 transition-all active:scale-95"
                        title="Rewind 10s (J / Left Arrow)"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => seekBy(10)}
                        className="p-2 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 text-zinc-200 transition-all active:scale-95"
                        title="Fast forward 10s (L / Right Arrow)"
                      >
                        <RotateCw className="w-4 h-4" />
                      </button>

                      {/* Volume Controller (Full Screen Only) */}
                      <div className="flex items-center gap-1.5 ml-1">
                        <button
                          type="button"
                          onClick={() => setIsMuted(!isMuted)}
                          className="p-2 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 text-zinc-200 transition-all"
                          title={isMuted ? "Unmute (M)" : "Mute (M)"}
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
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            setVolume(val);
                            setIsMuted(false);
                            safeStorage.setItem("moviznow_volume", String(val));
                          }}
                          className="w-16 sm:w-24 h-1 accent-emerald-500 bg-zinc-700 rounded-lg cursor-pointer"
                        />
                      </div>
                    </>
                  )}
                </div>

                {/* Right controls: Audio Languages, Subtitles, Speed, Fit, PiP, Fullscreen */}
                <div className="flex items-center gap-1.5 sm:gap-2">
                  {/* Audio Language Switcher Menu */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() =>
                        setActiveMenu(activeMenu === "audio" ? null : "audio")
                      }
                      className={`px-2.5 py-1.5 rounded-xl border text-xs font-bold transition-all flex items-center gap-1.5 ${
                        activeMenu === "audio"
                          ? "bg-emerald-500 text-white border-emerald-400"
                          : "bg-zinc-800/80 hover:bg-zinc-700 border-zinc-700/60 text-zinc-200"
                      }`}
                      title="Audio Language"
                    >
                      <Mic className="w-3.5 h-3.5 text-emerald-400" />
                      <span>
                        {mediaInfo?.audioTracks?.find((a) => a.id === selectedAudioTrack)?.language || "Audio"}
                      </span>
                    </button>

                    {activeMenu === "audio" && (
                      <div className="absolute bottom-full right-0 mb-2 w-48 bg-zinc-900/98 border border-zinc-700/90 rounded-2xl p-2.5 shadow-2xl backdrop-blur-2xl z-50 flex flex-col gap-1.5 max-h-64 overflow-y-auto">
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider px-2 py-0.5">
                          {t("Audio Language")}
                        </span>
                        {(mediaInfo?.audioTracks && mediaInfo.audioTracks.length > 0
                          ? mediaInfo.audioTracks
                          : [{ id: 0, language: "Default", codec: "AAC", title: "Default Audio" }]
                        ).map((tr) => (
                          <button
                            key={tr.id}
                            onClick={() => handleAudioSelect(tr.id)}
                            className={`w-full text-left px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-between ${
                              selectedAudioTrack === tr.id
                                ? "bg-emerald-500 text-white shadow-md shadow-emerald-500/20"
                                : "text-zinc-200 hover:bg-zinc-800/80"
                            }`}
                          >
                            <div className="flex flex-col">
                              <span>{tr.language}</span>
                              <span className="text-[10px] opacity-75 font-normal uppercase">
                                {tr.codec} Stereo
                              </span>
                            </div>
                            {selectedAudioTrack === tr.id && <Check className="w-4 h-4 shrink-0" />}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Enhanced Subtitles Menu */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() =>
                        setActiveMenu(activeMenu === "subtitles" ? null : "subtitles")
                      }
                      className={`px-2.5 py-1.5 rounded-xl border text-xs font-bold transition-all flex items-center gap-1.5 ${
                        selectedSubtitleTrack !== null
                          ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-300"
                          : "bg-zinc-800/80 border-zinc-700/60 text-zinc-300 hover:bg-zinc-700"
                      }`}
                      title="Subtitles (C)"
                    >
                      <Subtitles className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">
                        {selectedSubtitleTrack === null
                          ? "Subtitles"
                          : mediaInfo?.subtitleTracks?.find((s) => s.id === selectedSubtitleTrack)?.language || "Subtitles"}
                      </span>
                    </button>

                    {activeMenu === "subtitles" && (
                      <div className="absolute bottom-full right-0 mb-2 w-52 bg-zinc-900/98 border border-zinc-700/90 rounded-2xl p-2.5 shadow-2xl backdrop-blur-2xl z-50 flex flex-col gap-2 max-h-72 overflow-y-auto">
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider px-2 py-0.5">
                            {t("Subtitles")}
                          </span>
                          <button
                            onClick={() => handleSubtitleSelect(null)}
                            className={`w-full text-left px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center justify-between ${
                              selectedSubtitleTrack === null
                                ? "bg-emerald-500 text-white"
                                : "text-zinc-300 hover:bg-zinc-800"
                            }`}
                          >
                            <span>{t("Off")}</span>
                            {selectedSubtitleTrack === null && <Check className="w-3.5 h-3.5" />}
                          </button>
                          {(mediaInfo?.subtitleTracks && mediaInfo.subtitleTracks.length > 0
                            ? mediaInfo.subtitleTracks
                            : [{ id: 0, language: "English", title: "English" }]
                          ).map((sub) => (
                            <button
                              key={sub.id}
                              onClick={() => handleSubtitleSelect(sub.id)}
                              className={`w-full text-left px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center justify-between ${
                                selectedSubtitleTrack === sub.id
                                  ? "bg-emerald-500 text-white"
                                  : "text-zinc-300 hover:bg-zinc-800"
                              }`}
                            >
                              <span>{sub.language}</span>
                              {selectedSubtitleTrack === sub.id && <Check className="w-3.5 h-3.5" />}
                            </button>
                          ))}
                        </div>

                        {/* Subtitle Font Size Adjuster */}
                        {selectedSubtitleTrack !== null && (
                          <div className="border-t border-zinc-800 pt-2 flex flex-col gap-1">
                            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider px-2 py-0.5">
                              {t("Subtitle Size")}
                            </span>
                            <div className="grid grid-cols-3 gap-1 px-1">
                              {(["small", "normal", "large"] as const).map((sz) => (
                                <button
                                  key={sz}
                                  onClick={() => handleSubtitleSizeSelect(sz)}
                                  className={`py-1 text-[11px] font-bold rounded-lg capitalize transition-all ${
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
                      </div>
                    )}
                  </div>

                  {/* Playback Speed Menu */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() =>
                        setActiveMenu(activeMenu === "speed" ? null : "speed")
                      }
                      className="px-2.5 py-1.5 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 text-zinc-200 text-xs font-bold font-mono transition-all flex items-center gap-1"
                    >
                      <span>{playbackSpeed}x</span>
                    </button>

                    {activeMenu === "speed" && (
                      <div className="absolute bottom-full right-0 mb-2 w-36 bg-zinc-900/98 border border-zinc-700/90 rounded-2xl p-2 shadow-2xl backdrop-blur-2xl z-50 flex flex-col gap-1 max-h-56 overflow-y-auto">
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider px-2 py-1">
                          {t("Playback Speed")}
                        </span>
                        {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3].map((s) => (
                          <button
                            key={s}
                            onClick={() => handleSpeedSelect(s)}
                            className={`w-full text-left px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center justify-between ${
                              playbackSpeed === s
                                ? "bg-emerald-500 text-white"
                                : "text-zinc-300 hover:bg-zinc-800"
                            }`}
                          >
                            <span>{s === 1 ? "1x (Normal)" : `${s}x`}</span>
                            {playbackSpeed === s && <Check className="w-3.5 h-3.5" />}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Screen Aspect / Fit Mode Toggle */}
                  <button
                    type="button"
                    onClick={handleToggleFitMode}
                    className={`px-2.5 py-1.5 rounded-xl border text-xs font-bold transition-all flex items-center gap-1.5 active:scale-95 ${
                      fitMode !== "contain"
                        ? "bg-emerald-500 hover:bg-emerald-400 text-white border-emerald-400 shadow-md shadow-emerald-500/25"
                        : "bg-zinc-800/80 hover:bg-zinc-700 border-zinc-700/60 text-zinc-200"
                    }`}
                    title={`Screen Aspect: ${fitMode === "contain" ? "Fit (16:9)" : fitMode === "cover" ? "Cover" : "Fill"}`}
                  >
                    <Ratio className="w-3.5 h-3.5" />
                    <span className="text-[11px] font-bold capitalize">
                      {fitMode === "contain" ? "Fit" : fitMode === "cover" ? "Cover" : "Fill"}
                    </span>
                  </button>

                  {/* Picture in Picture */}
                  <button
                    type="button"
                    onClick={togglePip}
                    className="p-2 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 text-zinc-200 transition-all hidden sm:flex"
                    title="Picture-in-Picture (P)"
                  >
                    <Tv className="w-4 h-4" />
                  </button>

                  {/* Fullscreen Toggle */}
                  <button
                    type="button"
                    onClick={toggleFullscreen}
                    className="p-2 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 text-zinc-200 transition-all"
                    title={isFullscreen ? "Exit Fullscreen (F)" : "Fullscreen (F)"}
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
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

export default NativePlayer;
