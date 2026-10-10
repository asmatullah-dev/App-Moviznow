import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, X } from "lucide-react";
import { useLanguage } from "../contexts/LanguageContext";
import { safeStorage } from "../utils/safeStorage";
import { useModalBehavior } from "../hooks/useModalBehavior";
import { getStreamingApiBase } from "../utils/domains";
import {
  getPlaybackProgressKey,
  getSavedProgress,
  saveProgress,
  getPreferredQuality,
  setPreferredQuality,
  getPreferredPlaybackSpeed,
  setPreferredPlaybackSpeed,
} from "../utils/playbackProgress";
import {
  modalBackdropAnimation,
  modalContainerAnimation,
  modalGpuStyle,
} from "../utils/modalAnimations";

export interface StreamMetadata {
  qualities: Array<{ id?: string | number; slug?: string; label?: string; height?: number }>;
  languages: Array<{ id?: string | number; code: string; name: string }>;
  print_name?: string;
  runtime_minutes?: number;
  hasImax?: boolean;
}

export interface PlayerFUContent {
  id: string;
  title: string;
  year?: string | number;
  imdbLink?: string;
  imdbId?: string;
  imdb?: string;
}

export interface PlayerFUProps {
  isOpen: boolean;
  onClose: () => void;
  content: PlayerFUContent | null;
  imdbId?: string;
  className?: string;
  season?: number;
  episode?: number;
}

export interface PlayerFUButtonProps {
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  label?: string;
}

// In-memory cache for stream availability checks to prevent redundant network fetches
const streamCheckCache = new Map<string, { exists: boolean; meta: StreamMetadata | null; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Custom hook encapsulating all Play4U stream discovery, metadata, and progress logic.
 */
export function resolveBestQuality(
  savedPref: string,
  availableQualities?: Array<string | number | { height?: number; slug?: string; label?: string; id?: string | number }>
): string {
  const parseHeight = (item: any): number => {
    if (!item) return 0;
    if (typeof item === "number") return item;
    if (typeof item === "object") {
      if (item.height) return Number(item.height);
      if (item.slug) return parseHeight(item.slug);
      if (item.label) return parseHeight(item.label);
    }
    if (typeof item === "string") {
      const match = item.match(/(\d{3,4})/);
      return match ? parseInt(match[1], 10) : 0;
    }
    return 0;
  };

  const availableHeights = Array.from(
    new Set((availableQualities || []).map(parseHeight).filter((h) => h > 0))
  ).sort((a, b) => a - b);

  const minHeight = availableHeights.length > 0 ? availableHeights[0] : 480;

  const rawPref = (savedPref || "").trim().toLowerCase();
  let targetHeight = parseHeight(rawPref);

  // Don't select auto in quality; if missing or auto, select minimum quality
  if (!targetHeight || rawPref === "auto" || rawPref === "") {
    return `${minHeight}p`;
  }

  if (availableHeights.length === 0) {
    return `${targetHeight}p`;
  }

  // 1. Direct match
  if (availableHeights.includes(targetHeight)) {
    return `${targetHeight}p`;
  }

  // 2. Minimal lower quality (highest lower quality)
  const lower = availableHeights.filter((h) => h < targetHeight);
  if (lower.length > 0) {
    const maxLower = Math.max(...lower);
    return `${maxLower}p`;
  }

  // 3. Minimal higher quality (lowest higher quality)
  const higher = availableHeights.filter((h) => h > targetHeight);
  if (higher.length > 0) {
    const minHigher = Math.min(...higher);
    return `${minHigher}p`;
  }

  return `${minHeight}p`;
}

export function usePlayerFU(
  content: PlayerFUContent | null,
  season?: number,
  episode?: number
) {
  const [isAvailable, setIsAvailable] = useState<boolean>(false);
  const [streamMeta, setStreamMeta] = useState<StreamMetadata | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Extract IMDb ID cleanly from imdbLink, imdbId, or imdb property
  const currentImdbId = useMemo(() => {
    if (!content) return "";
    if (content.imdbLink) {
      const match = content.imdbLink.match(/tt\d+/i);
      if (match) return match[0];
    }
    if (content.imdbId) return content.imdbId;
    if (content.imdb) return content.imdb;
    return "";
  }, [content?.imdbLink, content?.imdbId, content?.imdb]);

  // Check stream availability against Play4U provider
  useEffect(() => {
    if (!currentImdbId) {
      setIsAvailable(false);
      setStreamMeta(null);
      return;
    }

    // Check memory cache first
    const cached = streamCheckCache.get(currentImdbId);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      setIsAvailable(cached.exists);
      setStreamMeta(cached.meta);
      return;
    }

    let isMounted = true;
    setIsLoading(true);

    const apiBase = getStreamingApiBase();
    const handleSuccess = (data: any) => {
      if (!isMounted) return;
      const exists = Boolean(data && data.exists);
      const meta: StreamMetadata | null = exists
        ? {
            qualities: data.qualities || [],
            languages: data.languages || [],
            print_name: data.print_name || "",
            runtime_minutes: data.runtime_minutes || 0,
            hasImax: Boolean(data.hasImax),
          }
        : null;

      streamCheckCache.set(currentImdbId, {
        exists,
        meta,
        timestamp: Date.now(),
      });

      setIsAvailable(exists);
      setStreamMeta(meta);
      setIsLoading(false);
    };

    const doFetch = (base: string) => {
      return fetch(`${base}/api/stream/check?imdbId=${currentImdbId}`).then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      });
    };

    doFetch(apiBase)
      .then(handleSuccess)
      .catch((err) => {
        if (apiBase) {
          // Fallback to relative endpoint on current host
          doFetch("")
            .then(handleSuccess)
            .catch(() => {
              if (isMounted) {
                setIsAvailable(false);
                setStreamMeta(null);
                setIsLoading(false);
              }
            });
          return;
        }
        if (isMounted) {
          setIsAvailable(false);
          setStreamMeta(null);
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [currentImdbId]);

  // Read saved playback position from local storage
  const getSavedPlaybackTime = useCallback((): number => {
    if (!content?.id) return 0;
    const key = getPlaybackProgressKey(content.id, season, episode);
    return getSavedProgress(key);
  }, [content?.id, season, episode]);

  return {
    isAvailable,
    currentImdbId,
    streamMeta,
    isLoading,
    getSavedPlaybackTime,
  };
}

/**
 * Unified "Play Movie" action button styled identically to "Watch Trailer".
 */
export function PlayerFUButton({
  onClick,
  disabled = false,
  className,
  label,
}: PlayerFUButtonProps) {
  const { t } = useLanguage();

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={
        className ||
        "bg-[#ff9000] hover:bg-[#ffa42a] text-black px-6 py-3.5 text-sm sm:text-base rounded-2xl font-black flex items-center gap-2.5 transition-all duration-300 active:scale-95 border border-[#ff9000]/50 shadow-xl shadow-[#ff9000]/30 hover:shadow-[#ff9000]/50 disabled:opacity-50 cursor-pointer"
      }
    >
      <Play className="w-5 h-5 fill-current" />
      <span>{label || t("Play Movie")}</span>
    </button>
  );
}

/**
 * Fullscreen PlayerFU Stream Modal.
 *
 * CRITICAL FIX: The iframe URL is frozen once on open using a stable snapshot
 * of initial resume time. This ensures that real-time progress updates do NOT
 * cause the iframe src to change, eliminating the ~5-second pause & reload loop.
 */
export function PlayerFU({
  isOpen,
  onClose,
  content,
  imdbId,
  season,
  episode,
}: PlayerFUProps) {
  const { t } = useLanguage();
  const { streamMeta } = usePlayerFU(content, season, episode);

  // Snapshot the iframe URL once when opened so it NEVER changes during active playback
  const [activeIframeSrc, setActiveIframeSrc] = useState<string>("");
  const [playbackProgress, setPlaybackProgress] = useState<{
    currentTime: number;
    duration: number;
    percent: number;
    bufferedPercent: number;
  }>({
    currentTime: 0,
    duration: 0,
    percent: 0,
    bufferedPercent: 0,
  });
  const [isControlsVisible, setIsControlsVisible] = useState<boolean>(true);
  const controlsTimeoutRef = useRef<any>(null);

  const resetControlsTimeout = useCallback(() => {
    setIsControlsVisible(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      setIsControlsVisible(false);
    }, 3500);
  }, []);

  useEffect(() => {
    if (isOpen) {
      resetControlsTimeout();
    }
    return () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, [isOpen, resetControlsTimeout]);

  useEffect(() => {
    if (!isOpen || !content?.id || !imdbId) {
      setActiveIframeSrc("");
      setPlaybackProgress({ currentTime: 0, duration: 0, percent: 0, bufferedPercent: 0 });
      return;
    }

    // Determine initial resume time once from unified storage key
    const progressKey = getPlaybackProgressKey(content.id, season, episode);
    const initialResumeTime = getSavedProgress(progressKey);
    const estDuration = streamMeta?.runtime_minutes ? streamMeta.runtime_minutes * 60 : 0;
    if (initialResumeTime > 0) {
      setPlaybackProgress((prev) => ({
        ...prev,
        currentTime: initialResumeTime,
        duration: prev.duration || estDuration,
        percent:
          (prev.duration || estDuration) > 0
            ? Math.min(100, (initialResumeTime / (prev.duration || estDuration)) * 100)
            : 0,
      }));
    }

    // Determine remembered quality preference across all movies with fallback logic.
    // If preference is missing or set to auto, resolveBestQuality automatically selects minimum quality.
    const savedPref = getPreferredQuality();
    const preferredQuality = resolveBestQuality(savedPref, streamMeta?.qualities);

    // Determine remembered playback speed preference
    const savedSpeed = String(getPreferredPlaybackSpeed());

    // Construct immutable URL for this session with explicit quality, speed & Hindi language preference
    const apiBase = getStreamingApiBase();
    let stableUrl = `${apiBase}/api/stream/player/${content.id}?imdb=${encodeURIComponent(
      imdbId,
    )}&t=${initialResumeTime}&quality=${encodeURIComponent(preferredQuality)}&speed=${encodeURIComponent(savedSpeed)}&lang=hi&autoplay=1&_v=2`;
    if (season !== undefined && season !== null) {
      stableUrl += `&season=${encodeURIComponent(String(season))}`;
    }
    if (episode !== undefined && episode !== null) {
      stableUrl += `&episode=${encodeURIComponent(String(episode))}`;
    }
    setActiveIframeSrc(stableUrl);
  }, [isOpen, content?.id, imdbId, streamMeta?.qualities, season, episode]);

  // Listen to playback & status messages from the player iframe to save progress & remember quality & speed
  useEffect(() => {
    if (!isOpen || !content?.id) return;

    const progressKey = getPlaybackProgressKey(content.id, season, episode);

    const handleMessage = (event: MessageEvent) => {
      if (!event.data) return;

      if (event.data.type === "MOVIZNOW_PLAYBACK_PROGRESS") {
        const { currentTime, duration, percent, bufferedPercent } = event.data;
        if (typeof currentTime === "number" && currentTime > 2) {
          saveProgress(progressKey, currentTime);
        }
        setPlaybackProgress((prev) => {
          const curTime = typeof currentTime === "number" ? currentTime : prev.currentTime;
          const dur =
            typeof duration === "number" && duration > 0
              ? duration
              : prev.duration || (streamMeta?.runtime_minutes ? streamMeta.runtime_minutes * 60 : 0);
          const pct =
            typeof percent === "number" && percent >= 0
              ? percent
              : dur > 0
              ? (curTime / dur) * 100
              : prev.percent;
          const bufPct =
            typeof bufferedPercent === "number" ? bufferedPercent : prev.bufferedPercent;
          return {
            currentTime: curTime,
            duration: dur,
            percent: Math.min(100, Math.max(0, pct)),
            bufferedPercent: Math.min(100, Math.max(0, bufPct)),
          };
        });
      } else if (event.data.type === "MOVIZNOW_CONTROLS_VISIBILITY") {
        setIsControlsVisible(Boolean(event.data.visible));
      } else if (event.data.type === "MOVIZNOW_PLAYER_STATUS") {
        const rawQuality = event.data.quality;
        if (typeof rawQuality === "string" && rawQuality.trim()) {
          const lowerQ = rawQuality.trim().toLowerCase();
          // Never save preference if selected Auto
          if (!lowerQ.startsWith("auto")) {
            setPreferredQuality(lowerQ);
          }
        }

        const speed = event.data.speed;
        if (typeof speed === "number" && speed >= 0.25 && speed <= 4) {
          setPreferredPlaybackSpeed(speed);
        }
      }
    };

    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [isOpen, content?.id, season, episode, streamMeta?.runtime_minutes]);

  // Handle ESC key to close modal
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    const notifyOrientation = () => {
      const isFs = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
      );
      const isLandscape = window.innerWidth > window.innerHeight;
      const iframe = document.querySelector<HTMLIFrameElement>('iframe[title*="Player"]');
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage(
          {
            type: "MOVIZNOW_ORIENTATION_CHANGE",
            isLandscape,
            isFs,
          },
          "*"
        );
      }
    };

    const handleFullscreenChange = () => {
      const isFs = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
      );

      notifyOrientation();

      if (isFs) {
        if (
          window.screen &&
          window.screen.orientation &&
          typeof (window.screen.orientation as any).lock === "function"
        ) {
          (window.screen.orientation as any).lock("landscape").catch(() => {
            // Orientation lock fallback
          });
        }
      } else {
        if (
          window.screen &&
          window.screen.orientation &&
          typeof window.screen.orientation.unlock === "function"
        ) {
          try {
            window.screen.orientation.unlock();
          } catch {
            // Orientation unlock fallback
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    document.addEventListener("mozfullscreenchange", handleFullscreenChange);
    window.addEventListener("resize", notifyOrientation);
    window.addEventListener("orientationchange", notifyOrientation);
    const intervalId = setInterval(notifyOrientation, 500);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
      document.removeEventListener("mozfullscreenchange", handleFullscreenChange);
      window.removeEventListener("resize", notifyOrientation);
      window.removeEventListener("orientationchange", notifyOrientation);
    };
  }, [isOpen, onClose]);

  useModalBehavior(isOpen, onClose);

  return (
    <AnimatePresence>
      {isOpen && content && imdbId && (
        <motion.div
          key="playerfu-backdrop"
          {...modalBackdropAnimation}
          className="fixed inset-0 z-[10000] flex items-center justify-center p-2 sm:p-4 overflow-hidden bg-black/95 backdrop-blur-md transform-gpu will-change-[opacity]"
          onClick={onClose}
        >
          <motion.div
            key="playerfu-card"
            {...modalContainerAnimation}
            style={modalGpuStyle}
            className="relative w-full max-w-6xl aspect-video bg-black rounded-2xl overflow-hidden shadow-[0_0_60px_rgba(0,0,0,0.8)] ring-1 ring-white/10 z-10 transform-gpu flex flex-col"
            onClick={(e) => {
              e.stopPropagation();
              resetControlsTimeout();
            }}
            onMouseMove={resetControlsTimeout}
            onTouchStart={resetControlsTimeout}
          >
            {/* Floating Minimalist Close Button */}
            <button
              type="button"
              onClick={onClose}
              className={`absolute top-3 right-3 z-50 p-2 rounded-full bg-black/60 hover:bg-black/90 text-white/80 hover:text-white transition-all backdrop-blur-md border border-white/20 shadow-xl group cursor-pointer ${
                isControlsVisible ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
              }`}
              title={t("Close Player")}
              aria-label={t("Close Player")}
            >
              <X className="w-5 h-5 transition-transform group-hover:scale-110" />
            </button>

            {/* Native Play4U Stream Player */}
            <div className="w-full h-full relative bg-black">
              {activeIframeSrc ? (
                <iframe
                  src={activeIframeSrc}
                  title={`${content.title} - Player`}
                  className="w-full h-full border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                  allowFullScreen
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-black">
                  <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>

            {/* Subtle Mini Progress Bar at the bottom edge when controls/menu are hidden (identical to nativePlayer, with PlayerFU signature amber color) */}
            <div
              onClick={(e) => {
                e.stopPropagation();
                setIsControlsVisible(true);
                const iframe = document.querySelector<HTMLIFrameElement>('iframe[title*="Player"]');
                if (iframe && iframe.contentWindow) {
                  const rect = e.currentTarget.getBoundingClientRect();
                  if (rect.width > 0) {
                    const clickX = e.clientX - rect.left;
                    const pct = Math.max(0, Math.min(1, clickX / rect.width));
                    iframe.contentWindow.postMessage({ type: "MOVIZNOW_SEEK", percent: pct }, "*");
                  }
                  iframe.contentWindow.postMessage({ type: "MOVIZNOW_WAKE_CONTROLS" }, "*");
                }
              }}
              onPointerDown={(e) => {
                e.stopPropagation();
                setIsControlsVisible(true);
                const iframe = document.querySelector<HTMLIFrameElement>('iframe[title*="Player"]');
                if (iframe && iframe.contentWindow) {
                  iframe.contentWindow.postMessage({ type: "MOVIZNOW_WAKE_CONTROLS" }, "*");
                }
              }}
              className={`absolute bottom-0 inset-x-0 h-1 sm:h-1.5 z-40 cursor-pointer transition-opacity duration-300 ${
                !isControlsVisible ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
              }`}
              title={t("Click to show controls")}
            >
              {/* Unplayed blurred black background */}
              <div className="absolute inset-0 bg-black/85 backdrop-blur-md border-t border-white/20" />
              {/* Buffer Bar (matching nativePlayer) */}
              <div
                className="absolute h-full bg-zinc-600/60 transition-all pointer-events-none"
                style={{ width: `${Math.min(100, playbackProgress.bufferedPercent)}%` }}
              />
              {/* Watched Progress Bar with PlayerFU signature amber color */}
              <div
                className="absolute h-full bg-gradient-to-r from-[#ff7a00] via-[#ff9000] to-[#ffa42a] shadow-[0_0_8px_rgba(255,144,0,0.85)] transition-all pointer-events-none"
                style={{
                  width: `${Math.min(
                    100,
                    playbackProgress.percent > 0
                      ? playbackProgress.percent
                      : playbackProgress.duration > 0
                      ? (playbackProgress.currentTime / playbackProgress.duration) * 100
                      : 0
                  )}%`,
                }}
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default PlayerFU;
