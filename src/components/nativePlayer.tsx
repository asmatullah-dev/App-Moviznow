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
  Sliders,
  Check,
  Layers,
  Subtitles,
  Mic,
  RefreshCw,
} from "lucide-react";
import { useLanguage } from "../contexts/LanguageContext";
import { safeStorage } from "../utils/safeStorage";
import { useModalBehavior } from "../hooks/useModalBehavior";
import {
  modalBackdropAnimation,
  modalContainerAnimation,
  fullScreenModalAnimation,
  modalGpuStyle,
} from "../utils/modalAnimations";

export interface NativeStreamData {
  hasWatchOnline: boolean;
  watchUrl?: string;
  streamUrl?: string;
  title?: string;
  mime?: string;
  size?: string;
  quality?: string;
  candidates?: Array<{ text: string; href: string }>;
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

    const decodeBase64 = (s: string) => {
      let clean = s.replace(/-/g, "+").replace(/_/g, "/").replace(/\s/g, "");
      while (clean.length % 4 !== 0) clean += "=";
      return atob(clean);
    };

    const streamUrl = uParam ? decodeBase64(uParam) : undefined;
    const mime = mParam ? decodeBase64(mParam) : undefined;
    const title = tParam ? decodeBase64(tParam) : undefined;

    return {
      streamUrl: streamUrl && streamUrl.startsWith("http") ? streamUrl : undefined,
      mime,
      title,
    };
  } catch {
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
      h.includes("cloudflarestorage") ||
      h.includes(".r2.")
    );
  });
  if (match) {
    return { text: match.text || "FSL Server", href: match.href };
  }
  return null;
}

/**
 * Helper to find the Pixeldrain candidate from a list of candidates
 */
export function findPixeldrainCandidate(
  candidates?: Array<{ text?: string; href?: string }>
): { text: string; href: string } | null {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  const match = candidates.find((c) => {
    if (!c || !c.href) return false;
    const t = (c.text || "").toLowerCase();
    const h = (c.href || "").toLowerCase();
    return (
      t.includes("pixel") ||
      h.includes("pixeldrain") ||
      h.includes("pixelserver")
    );
  });
  if (match) {
    return { text: match.text || "Pixel Server", href: match.href };
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
  // Always prioritize FSL Server
  const fsl = findFslCandidate(candidates);
  if (fsl) {
    return fsl;
  }
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
  if (match) {
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

    const controller = new AbortController();
    fetch("/api/native-player/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: trimmedUrl }),
      signal: controller.signal,
    })
      .then((res) => res.json())
      .then((resData: NativeStreamData) => {
        if (isMounted) {
          watchCheckCache.set(trimmedUrl, { data: resData, timestamp: Date.now() });
          setData(resData);
          setIsLoading(false);
        }
      })
      .catch((err) => {
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
    isAvailable: Boolean(data?.hasWatchOnline),
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

  // Parse direct stream URL (prioritizing FSL candidate)
  const fslCandidate = useMemo(() => findFslCandidate(candidates), [candidates]);
  const decodedMeta = useMemo(() => decodeWatchUrl(watchUrl), [watchUrl]);
  const directStreamUrl = fslCandidate?.href || propStreamUrl || decodedMeta.streamUrl || "";
  const displayTitle = decodedMeta.title || title;

  // Engine: "native" (Universal Codec Transcode Engine) or "web" (HubCloud Web Player)
  const [engine, setEngine] = useState<"native" | "web">("native");

  const [mediaInfo, setMediaInfo] = useState<MediaProbeInfo | null>(null);
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
  const [showResumeBanner, setShowResumeBanner] = useState<boolean>(false);
  const [savedResumeTime, setSavedResumeTime] = useState<number>(0);
  const [doubleTapFeedback, setDoubleTapFeedback] = useState<"left" | "right" | null>(null);

  // Storage key for resume
  const storageKey = `moviznow_progress_${contentId}`;

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 2200);
  }, []);

  // Fetch probe media info (exact duration, audio streams, subtitles)
  useEffect(() => {
    if (!isOpen || !directStreamUrl) return;

    let isMounted = true;
    fetch(`/api/native-player/info?url=${encodeURIComponent(directStreamUrl)}`)
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

  // Initial resume detection
  useEffect(() => {
    if (!isOpen) return;
    try {
      const saved = safeStorage.getItem(storageKey) || localStorage.getItem(storageKey);
      if (saved) {
        const time = parseFloat(saved);
        if (!isNaN(time) && time > 15) {
          setSavedResumeTime(time);
          setShowResumeBanner(true);
        }
      }
    } catch {}
  }, [isOpen, storageKey]);

  // Construct stream URL with seek offset and audio track
  const currentStreamSrc = useMemo(() => {
    if (!directStreamUrl) return "";
    const params = new URLSearchParams();
    params.set("url", directStreamUrl);
    params.set("mode", "transcode");

    if (seekOffset > 0) {
      params.set("ss", String(seekOffset));
    }
    if (selectedAudioTrack > 0) {
      params.set("audio", String(selectedAudioTrack));
    }

    return `/api/native-player/stream?${params.toString()}`;
  }, [directStreamUrl, seekOffset, selectedAudioTrack]);

  // Handle Controls Auto-Hide
  const resetControlsTimeout = useCallback(() => {
    setIsControlsVisible(true);
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
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    }
    return () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, [isPlaying, resetControlsTimeout]);

  // Save progress periodically
  useEffect(() => {
    if (!isOpen) return;
    progressSaveIntervalRef.current = setInterval(() => {
      if (videoRef.current && !videoRef.current.paused) {
        const time = Math.floor(seekOffset + (videoRef.current.currentTime || 0));
        if (time > 5) {
          try {
            safeStorage.setItem(storageKey, String(time));
            localStorage.setItem(storageKey, String(time));
          } catch {}
        }
      }
    }, 3000);

    return () => {
      if (progressSaveIntervalRef.current) clearInterval(progressSaveIntervalRef.current);
    };
  }, [isOpen, storageKey, seekOffset]);

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
    const current = seekOffset + videoRef.current.currentTime;
    setCurrentPosition(current);

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
        setBufferedPercent(((seekOffset + bufferedEnd) / effectiveDuration) * 100);
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

    videoRef.current.playbackRate = playbackSpeed;
    videoRef.current.play().catch(() => {
      setIsPlaying(false);
    });
  };

  const handleVideoError = () => {
    setIsBuffering(false);
    setHasPlaybackError(true);
  };

  // Play/Pause ONLY triggered by button or space/k shortcut
  const togglePlay = () => {
    if (engine === "web") return;
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play().catch(() => {});
      setIsPlaying(true);
    } else {
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
    setSeekOffset(clampedTarget);
    setCurrentPosition(clampedTarget);
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
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
    const val = parseFloat(e.target.value);
    executeSeek(val);
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

    fetch(`/api/native-player/subtitles?url=${encodeURIComponent(directStreamUrl)}&sub=${subId}`)
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
                }}
                onPause={() => setIsPlaying(false)}
                onError={handleVideoError}
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

            {/* Resume Toast Banner */}
            <AnimatePresence>
              {showResumeBanner && engine === "native" && (
                <motion.div
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="absolute top-20 left-1/2 -translate-x-1/2 z-40 bg-zinc-900/95 border border-emerald-500/40 rounded-2xl p-4 shadow-2xl flex items-center gap-4 text-white text-xs sm:text-sm backdrop-blur-lg"
                >
                  <div>
                    <span className="font-bold text-emerald-400">
                      {t("Resume Playback")}
                    </span>
                    <p className="text-zinc-300 text-[11px] sm:text-xs">
                      {t("Continue from")} {formatTime(savedResumeTime)}?
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        executeSeek(savedResumeTime);
                        setShowResumeBanner(false);
                      }}
                      className="bg-emerald-500 hover:bg-emerald-400 text-white font-bold px-3 py-1.5 rounded-xl transition-all"
                    >
                      {t("Resume")}
                    </button>
                    <button
                      onClick={() => setShowResumeBanner(false)}
                      className="bg-zinc-800 hover:bg-zinc-700 text-zinc-400 font-medium px-3 py-1.5 rounded-xl transition-all"
                    >
                      {t("Dismiss")}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Playback Error Fallback Card */}
            {hasPlaybackError && engine === "native" && (
              <div className="absolute inset-0 bg-black/85 flex flex-col items-center justify-center p-6 text-center z-30">
                <div className="w-16 h-16 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-500 mb-4">
                  <Tv className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-black text-white mb-2">
                  {t("Playback Notice")}
                </h3>
                <p className="text-zinc-400 text-xs sm:text-sm max-w-md mb-6 leading-relaxed">
                  {t(
                    "Video playback encountered a temporary network delay. You can retry playback or switch to Web Player."
                  )}
                </p>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <button
                    onClick={() => {
                      setHasPlaybackError(false);
                      executeSeek(currentPosition);
                    }}
                    className="bg-emerald-500 hover:bg-emerald-400 text-white font-bold py-2.5 px-5 rounded-xl text-sm flex items-center gap-2 shadow-lg shadow-emerald-500/20 transition-all"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>{t("Retry Playback")}</span>
                  </button>
                  <button
                    onClick={() => {
                      setEngine("web");
                      setHasPlaybackError(false);
                    }}
                    className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold py-2.5 px-4 rounded-xl text-sm transition-all"
                  >
                    <span>{t("Web Player")}</span>
                  </button>
                  {directStreamUrl && (
                    <a
                      href={`vlc://${directStreamUrl}`}
                      className="bg-orange-600 hover:bg-orange-500 text-white font-bold py-2.5 px-4 rounded-xl text-sm flex items-center gap-2 transition-all"
                    >
                      <span>VLC Player</span>
                    </a>
                  )}
                  {directStreamUrl && (
                    <a
                      href={`intent:${directStreamUrl}#Intent;package=com.mxtech.videoplayer.ad;type=video/*;end`}
                      className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-2.5 px-4 rounded-xl text-sm flex items-center gap-2 transition-all"
                    >
                      <span>MX Player</span>
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
                <div className="relative flex-1 flex items-center h-4 cursor-pointer group">
                  {/* Buffer Bar */}
                  <div
                    className="absolute h-1.5 bg-zinc-700/70 rounded-full pointer-events-none transition-all"
                    style={{ width: `${Math.min(100, bufferedPercent)}%` }}
                  />
                  {/* Played Progress Bar */}
                  <div
                    className="absolute h-1.5 bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full pointer-events-none transition-all group-hover:h-2"
                    style={{
                      width: `${totalDuration > 0 ? (currentPosition / totalDuration) * 100 : 0}%`,
                    }}
                  />
                  {/* Styled Range input */}
                  <input
                    type="range"
                    min={0}
                    max={totalDuration || 100}
                    step={1}
                    value={currentPosition}
                    onChange={handleScrubberChange}
                    className="w-full h-1.5 opacity-0 cursor-pointer z-10"
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

                  {/* Fit Mode Toggle */}
                  <button
                    type="button"
                    onClick={() => {
                      setFitMode((prev) =>
                        prev === "contain" ? "cover" : prev === "cover" ? "fill" : "contain"
                      );
                    }}
                    className="p-2 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 text-zinc-200 transition-all hidden sm:flex"
                    title={`Fit Mode: ${fitMode}`}
                  >
                    <Sliders className="w-4 h-4" />
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
