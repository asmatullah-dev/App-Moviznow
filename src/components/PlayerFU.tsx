import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, X, Maximize, Minimize } from "lucide-react";
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
  onSwitchToNative?: () => void;
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
  onSwitchToNative,
}: PlayerFUProps) {
  const { t } = useLanguage();
  const { streamMeta } = usePlayerFU(content, season, episode);

  // Playback engine mode: "proxy" (Custom MovizNow player with duration preview guards & speed/audio sync)
  const [streamEngine, setStreamEngine] = useState<"direct" | "proxy">("proxy");

  // Snapshot the iframe URL once when opened so it NEVER changes during active playback
  const [activeIframeSrc, setActiveIframeSrc] = useState<string>("");
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [showControls, setShowControls] = useState<boolean>(true);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isSeekingPreviewRef = useRef<boolean>(false);

  const resetControlsTimeout = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
      controlsTimeoutRef.current = null;
    }
    // Do NOT hide controls while seeking preview on duration bar
    if (isSeekingPreviewRef.current) {
      return;
    }
    controlsTimeoutRef.current = setTimeout(() => {
      if (!isSeekingPreviewRef.current) {
        setShowControls(false);
      }
    }, 3000);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    resetControlsTimeout();

    const handleWindowBlur = () => {
      setTimeout(() => {
        if (document.activeElement instanceof HTMLIFrameElement) {
          resetControlsTimeout();
          try {
            (document.activeElement as HTMLElement)?.blur();
            window.focus();
          } catch {
            // Focus cleanup fallback
          }
        }
      }, 50);
    };

    const handleGlobalActivity = () => {
      resetControlsTimeout();
    };

    window.addEventListener("blur", handleWindowBlur);
    window.addEventListener("pointerdown", handleGlobalActivity);
    window.addEventListener("mousemove", handleGlobalActivity);
    window.addEventListener("touchstart", handleGlobalActivity);

    // Periodic check to capture iframe clicks reliably across mobile and desktop
    const focusInterval = setInterval(() => {
      if (document.activeElement instanceof HTMLIFrameElement) {
        resetControlsTimeout();
        try {
          (document.activeElement as HTMLElement)?.blur();
          window.focus();
        } catch {
          // Focus cleanup fallback
        }
      }
    }, 250);

    return () => {
      clearInterval(focusInterval);
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
      window.removeEventListener("blur", handleWindowBlur);
      window.removeEventListener("pointerdown", handleGlobalActivity);
      window.removeEventListener("mousemove", handleGlobalActivity);
      window.removeEventListener("touchstart", handleGlobalActivity);
    };
  }, [isOpen, resetControlsTimeout]);

  useEffect(() => {
    if (!isOpen || !content?.id || !imdbId) {
      setActiveIframeSrc("");
      return;
    }

    // Determine initial resume time once from unified storage key
    const progressKey = getPlaybackProgressKey(content.id, season, episode);
    const initialResumeTime = getSavedProgress(progressKey);

    // Determine remembered quality preference across all movies with fallback logic.
    // If preference is missing or set to auto, resolveBestQuality automatically selects minimum quality.
    const savedPref = getPreferredQuality();
    const preferredQuality = resolveBestQuality(savedPref, streamMeta?.qualities);

    // Determine remembered playback speed preference
    const savedSpeed = String(getPreferredPlaybackSpeed());

    if (streamEngine === "direct") {
      // Direct CDN embed from Play4U (https://play4u.org/tt...): browser connects directly to play4u
      // ZERO video bytes pass through Vercel serverless functions (0 Fast Origin Transfer)!
      const cleanImdb = imdbId.startsWith("tt") ? imdbId : `tt${imdbId}`;
      let directUrl = `https://play4u.org/${encodeURIComponent(cleanImdb)}`;
      const params = new URLSearchParams();
      params.set("autoplay", "1");
      if (preferredQuality && preferredQuality !== "auto") {
        params.set("quality", preferredQuality);
      }
      if (initialResumeTime > 2) {
        params.set("t", String(Math.floor(initialResumeTime)));
      }
      const qs = params.toString();
      if (qs) {
        directUrl += `?${qs}`;
      }
      setActiveIframeSrc(directUrl);
    } else {
      // Masked Player Route through backend proxy
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
    }
  }, [isOpen, content?.id, imdbId, streamMeta?.qualities, season, episode, streamEngine]);

  // Listen to playback & status messages from the player iframe to save progress & remember quality & speed
  useEffect(() => {
    if (!isOpen || !content?.id) return;

    const progressKey = getPlaybackProgressKey(content.id, season, episode);

    const handleMessage = (event: MessageEvent) => {
      if (!event.data) return;
      resetControlsTimeout();

      if (event.data.type === "MOVIZNOW_SEEKING_PREVIEW") {
        const isSeeking = Boolean(event.data.active);
        isSeekingPreviewRef.current = isSeeking;
        if (isSeeking) {
          setShowControls(true);
          if (controlsTimeoutRef.current) {
            clearTimeout(controlsTimeoutRef.current);
            controlsTimeoutRef.current = null;
          }
        } else {
          resetControlsTimeout();
        }
      } else if (event.data.type === "MOVIZNOW_PLAYBACK_PROGRESS") {
        const { currentTime } = event.data;
        if (typeof currentTime === "number" && currentTime > 2) {
          saveProgress(progressKey, currentTime);
        }
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
  }, [isOpen, content?.id, season, episode]);

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

      setIsFullscreen(isFs);
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

  const toggleFullscreen = useCallback(async () => {
    try {
      const isFs = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
      );

      if (!isFs) {
        const target = containerRef.current;
        if (!target) return;
        if (target.requestFullscreen) {
          await target.requestFullscreen();
        } else if ((target as any).webkitRequestFullscreen) {
          await (target as any).webkitRequestFullscreen();
        } else if ((target as any).mozRequestFullScreen) {
          await (target as any).mozRequestFullScreen();
        } else if ((target as any).msRequestFullscreen) {
          await (target as any).msRequestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if ((document as any).webkitExitFullscreen) {
          await (document as any).webkitExitFullscreen();
        } else if ((document as any).mozCancelFullScreen) {
          await (document as any).mozCancelFullScreen();
        } else if ((document as any).msExitFullscreen) {
          await (document as any).msExitFullscreen();
        }
      }
    } catch (err) {
      console.warn("Fullscreen toggle error:", err);
    }
  }, []);

  useModalBehavior(isOpen, onClose);

  return (
    <AnimatePresence>
      {isOpen && content && imdbId && (
        <motion.div
          key="playerfu-backdrop"
          {...modalBackdropAnimation}
          className="fixed inset-0 z-[10000] flex items-center justify-center p-2 sm:p-4 overflow-hidden bg-black/95 backdrop-blur-md transform-gpu will-change-[opacity]"
          onClick={() => {
            if (!showControls) {
              resetControlsTimeout();
            } else {
              onClose();
            }
          }}
        >
          <motion.div
            ref={containerRef}
            key="playerfu-card"
            {...modalContainerAnimation}
            style={modalGpuStyle}
            className={`relative w-full max-w-6xl aspect-video bg-black ${
              isFullscreen ? "h-full max-w-none rounded-none aspect-auto" : "rounded-2xl"
            } overflow-hidden shadow-[0_0_60px_rgba(0,0,0,0.8)] ring-1 ring-white/10 z-10 transform-gpu flex flex-col`}
            onClick={(e) => {
              e.stopPropagation();
              resetControlsTimeout();
            }}
            onMouseMove={resetControlsTimeout}
            onTouchStart={resetControlsTimeout}
            onPointerDown={resetControlsTimeout}
          >
            {/* Top Control Bar with Auto-Hide (No custom title; only essential controls) */}
            <div
              className={`absolute top-0 left-0 right-0 z-50 p-2.5 sm:p-4 flex items-center justify-end bg-gradient-to-b from-black/80 via-black/40 to-transparent transition-opacity duration-300 pointer-events-none ${
                showControls ? "opacity-100" : "opacity-0"
              }`}
            >
              <div className={`flex items-center gap-2 ${showControls ? "pointer-events-auto" : "pointer-events-none"}`}>
                {/* Dedicated Fullscreen Toggle Button */}
                <button
                  type="button"
                  onClick={toggleFullscreen}
                  className="p-1.5 sm:p-2 rounded-full bg-black/60 hover:bg-black/90 text-white/80 hover:text-white transition-all backdrop-blur-md border border-white/20 shadow-xl group cursor-pointer"
                  title={isFullscreen ? t("Exit Fullscreen") : t("Fullscreen")}
                  aria-label={isFullscreen ? t("Exit Fullscreen") : t("Fullscreen")}
                >
                  {isFullscreen ? (
                    <Minimize className="w-4 h-4 sm:w-5 sm:h-5 transition-transform group-hover:scale-110" />
                  ) : (
                    <Maximize className="w-4 h-4 sm:w-5 sm:h-5 transition-transform group-hover:scale-110" />
                  )}
                </button>

                {/* Minimalist Close Button */}
                <button
                  type="button"
                  onClick={onClose}
                  className="p-1.5 sm:p-2 rounded-full bg-black/60 hover:bg-black/90 text-white/80 hover:text-white transition-all backdrop-blur-md border border-white/20 shadow-xl group cursor-pointer"
                  title={t("Close Player")}
                  aria-label={t("Close Player")}
                >
                  <X className="w-4 h-4 sm:w-5 sm:h-5 transition-transform group-hover:scale-110" />
                </button>
              </div>
            </div>

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
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default PlayerFU;
