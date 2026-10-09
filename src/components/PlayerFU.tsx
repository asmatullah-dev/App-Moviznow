import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, X } from "lucide-react";
import { useLanguage } from "../contexts/LanguageContext";
import { safeStorage } from "../utils/safeStorage";
import { useModalBehavior } from "../hooks/useModalBehavior";
import { getStreamingApiBase } from "../utils/domains";
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

  const rawPref = (savedPref || "").trim().toLowerCase();
  let targetHeight = parseHeight(rawPref);
  if (!targetHeight || rawPref === "auto") {
    targetHeight = 1080;
  }

  if (!availableQualities || availableQualities.length === 0) {
    return `${targetHeight}p`;
  }

  const availableHeights = Array.from(
    new Set(availableQualities.map(parseHeight).filter((h) => h > 0))
  );

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

  return `${targetHeight}p`;
}

export function usePlayerFU(content: PlayerFUContent | null) {
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
    fetch(`${apiBase}/api/stream/check?imdbId=${currentImdbId}`)
      .then((res) => res.json())
      .then((data) => {
        if (!isMounted) return;
        const exists = Boolean(data.exists);
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
      })
      .catch(() => {
        if (!isMounted) return;
        setIsAvailable(false);
        setStreamMeta(null);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [currentImdbId]);

  // Read saved playback position from local storage
  const getSavedPlaybackTime = useCallback((): number => {
    if (!content?.id) return 0;
    try {
      const key = `moviznow_progress_${content.id}`;
      const saved = safeStorage.getItem(key) || localStorage.getItem(key);
      if (saved) {
        const val = parseFloat(saved);
        if (!isNaN(val) && val > 5) return val;
      }
    } catch {
      // Storage access failure fallback
    }
    return 0;
  }, [content?.id]);

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
        "bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white px-6 py-3.5 text-sm sm:text-base rounded-2xl font-bold flex items-center gap-2.5 transition-all duration-300 active:scale-95 border border-white/20 shadow-xl shadow-emerald-500/20 disabled:opacity-50 cursor-pointer"
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
}: PlayerFUProps) {
  const { t } = useLanguage();
  const { streamMeta } = usePlayerFU(content);

  // Snapshot the iframe URL once when opened so it NEVER changes during active playback
  const [activeIframeSrc, setActiveIframeSrc] = useState<string>("");

  useEffect(() => {
    if (!isOpen || !content?.id || !imdbId) {
      setActiveIframeSrc("");
      return;
    }

    // Determine initial resume time once from storage
    let initialResumeTime = 0;
    try {
      const key = `moviznow_progress_${content.id}`;
      const saved = safeStorage.getItem(key) || localStorage.getItem(key);
      if (saved) {
        const parsed = parseFloat(saved);
        if (!isNaN(parsed) && parsed > 5) {
          initialResumeTime = parsed;
        }
      }
    } catch {
      initialResumeTime = 0;
    }

    // Determine remembered quality preference across all movies with fallback logic
    let savedPref = "1080p";
    try {
      const stored = (
        safeStorage.getItem("moviznow_preferred_quality") ||
        localStorage.getItem("moviznow_preferred_quality") ||
        "1080p"
      )
        .trim()
        .toLowerCase();
      if (stored) {
        savedPref = stored;
      }
    } catch {
      savedPref = "1080p";
    }

    const preferredQuality = resolveBestQuality(savedPref, streamMeta?.qualities);

    // Determine remembered playback speed preference
    let savedSpeed = "1";
    try {
      savedSpeed =
        safeStorage.getItem("moviznow_playback_speed") ||
        localStorage.getItem("moviznow_playback_speed") ||
        "1";
    } catch {
      savedSpeed = "1";
    }

    // Construct immutable URL for this session with explicit quality & speed preferences
    const apiBase = getStreamingApiBase();
    const stableUrl = `${apiBase}/api/stream/player/${content.id}?imdb=${encodeURIComponent(
      imdbId,
    )}&t=${initialResumeTime}&quality=${encodeURIComponent(preferredQuality)}&speed=${encodeURIComponent(savedSpeed)}&autoplay=1`;
    setActiveIframeSrc(stableUrl);
  }, [isOpen, content?.id, imdbId, streamMeta?.qualities]);

  // Listen to playback & status messages from the player iframe to save progress & remember quality & speed
  useEffect(() => {
    if (!isOpen || !content?.id) return;

    const handleMessage = (event: MessageEvent) => {
      if (!event.data || event.data.contentId !== content.id) return;

      if (event.data.type === "MOVIZNOW_PLAYBACK_PROGRESS") {
        const { currentTime } = event.data;
        if (typeof currentTime === "number" && currentTime > 2) {
          try {
            const key = `moviznow_progress_${content.id}`;
            safeStorage.setItem(key, String(Math.floor(currentTime)));
            localStorage.setItem(key, String(Math.floor(currentTime)));
          } catch {
            // Storage quota or restriction fallback
          }
        }
      } else if (event.data.type === "MOVIZNOW_PLAYER_STATUS") {
        const rawQuality = event.data.quality;
        if (typeof rawQuality === "string" && rawQuality.trim()) {
          // Extract resolution like 1080p, 720p, 480p, 360p
          const match = rawQuality.match(/(\d{3,4}p)/i);
          if (match) {
            const detectedQ = match[1].toLowerCase();
            try {
              safeStorage.setItem("moviznow_preferred_quality", detectedQ);
              localStorage.setItem("moviznow_preferred_quality", detectedQ);
            } catch {
              // Storage fallback
            }
          }
        }

        const speed = event.data.speed;
        if (typeof speed === "number" && speed >= 0.25 && speed <= 4) {
          try {
            safeStorage.setItem("moviznow_playback_speed", String(speed));
            localStorage.setItem("moviznow_playback_speed", String(speed));
          } catch {
            // Storage fallback
          }
        }
      }
    };

    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [isOpen, content?.id]);

  // Handle ESC key to close modal
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    const handleFullscreenChange = () => {
      const isFs = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
      );

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

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
      document.removeEventListener("mozfullscreenchange", handleFullscreenChange);
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
            onClick={(e) => e.stopPropagation()}
          >
            {/* Floating Minimalist Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="absolute top-3 right-3 z-50 p-2 rounded-full bg-black/60 hover:bg-black/90 text-white/80 hover:text-white transition-all backdrop-blur-md border border-white/20 shadow-xl group cursor-pointer"
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
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default PlayerFU;
