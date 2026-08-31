import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Timer, ChevronRight, ShieldCheck, RefreshCw, Loader2, AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { isUserExemptFromAds } from '../utils/adUtils';

interface VideoAdInterstitialProps {
  isOpen: boolean;
  onClose: () => void;
  onAdComplete: () => void;
  adUrl?: string;
}

export const VideoAdInterstitial: React.FC<VideoAdInterstitialProps> = ({
  isOpen,
  onClose,
  onAdComplete,
  adUrl = 'https://commercialhalftime.com/htqpa4mty?key=53a3c0b6e7edfce96cd08f0cabe01b54'
}) => {
  const { profile } = useAuth();
  const isExempt = isUserExemptFromAds(profile);

  const [timeLeft, setTimeLeft] = useState(30);
  const [canSkip, setCanSkip] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [isLoadingAd, setIsLoadingAd] = useState(true);
  const [hasAdError, setHasAdError] = useState(false);
  const [currentIframeUrl, setCurrentIframeUrl] = useState('');
  
  const onAdCompleteRef = useRef(onAdComplete);
  const onCloseRef = useRef(onClose);
  const iframeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Auto bypass video ad immediately if user is VIP / exempt
  useEffect(() => {
    if (isOpen && isExempt) {
      onAdCompleteRef.current?.();
      onCloseRef.current?.();
    }
  }, [isOpen, isExempt]);

  // Helper to generate a fresh ad URL with cache-busting / rotation query
  const generateAdUrl = useCallback((baseUrl: string, attempt: number) => {
    try {
      const url = new URL(baseUrl);
      url.searchParams.set('_ts', `${Date.now()}`);
      url.searchParams.set('_attempt', `${attempt}`);
      return url.toString();
    } catch {
      const separator = baseUrl.includes('?') ? '&' : '?';
      return `${baseUrl}${separator}_ts=${Date.now()}&_attempt=${attempt}`;
    }
  }, []);

  // Update refs
  useEffect(() => {
    onAdCompleteRef.current = onAdComplete;
    onCloseRef.current = onClose;
  }, [onAdComplete, onClose]);

  // Handle retry / reload another ad
  const handleRetryAd = useCallback((forceAttempt?: number) => {
    const nextAttempt = typeof forceAttempt === 'number' ? forceAttempt : retryCount + 1;
    setRetryCount(nextAttempt);
    setIsLoadingAd(true);
    setHasAdError(false);
    
    // Clear any existing load timeout
    if (iframeTimeoutRef.current) {
      clearTimeout(iframeTimeoutRef.current);
    }

    const freshUrl = generateAdUrl(adUrl, nextAttempt);
    setCurrentIframeUrl(freshUrl);

    // Auto-detect if ad iframe takes too long to load (e.g. 8 seconds)
    iframeTimeoutRef.current = setTimeout(() => {
      setIsLoadingAd(false);
      // If we haven't succeeded and attempt is low, mark error or let user retry
      if (nextAttempt < 2) {
        // Auto-attempt 1 retry after 8s delay
        handleRetryAd(nextAttempt + 1);
      } else {
        setHasAdError(true);
      }
    }, 8000);
  }, [adUrl, generateAdUrl, retryCount]);

  // Initial modal open effect
  useEffect(() => {
    if (!isOpen) {
      setTimeLeft(30);
      setCanSkip(false);
      setRetryCount(0);
      setIsLoadingAd(true);
      setHasAdError(false);
      setCurrentIframeUrl('');
      if (iframeTimeoutRef.current) {
        clearTimeout(iframeTimeoutRef.current);
      }
      return;
    }

    setTimeLeft(30);
    setCanSkip(false);
    setRetryCount(0);
    setIsLoadingAd(true);
    setHasAdError(false);
    
    const freshUrl = generateAdUrl(adUrl, 0);
    setCurrentIframeUrl(freshUrl);

    // Set auto-retry timer on initial load if ad gets stuck
    if (iframeTimeoutRef.current) {
      clearTimeout(iframeTimeoutRef.current);
    }
    iframeTimeoutRef.current = setTimeout(() => {
      setIsLoadingAd(false);
      // retryCount is 0 here from the initial load
      handleRetryAd(1);
    }, 8000);

    return () => {
      if (iframeTimeoutRef.current) {
        clearTimeout(iframeTimeoutRef.current);
      }
    };
  }, [isOpen, adUrl, generateAdUrl]);

  // Timer effect: Only start countdown when ad has finished loading and is actually visible
  useEffect(() => {
    if (!isOpen || isLoadingAd || hasAdError) {
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          // Auto close & unlock at max 30 seconds
          setTimeout(() => {
            onAdCompleteRef.current?.();
            onCloseRef.current?.();
          }, 0);
          return 0;
        }

        // Enable skip after 15 seconds (when 15 or less seconds remain)
        if (prev <= 16) {
          setCanSkip(true);
        }

        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen, isLoadingAd, hasAdError]);

  const handleIframeLoad = () => {
    if (iframeTimeoutRef.current) {
      clearTimeout(iframeTimeoutRef.current);
    }
    setIsLoadingAd(false);
    setHasAdError(false);
  };

  const handleIframeError = () => {
    if (iframeTimeoutRef.current) {
      clearTimeout(iframeTimeoutRef.current);
    }
    setIsLoadingAd(false);
    setHasAdError(true);
    // Auto-retry if attempt < 3
    if (retryCount < 3) {
      handleRetryAd(retryCount + 1);
    }
  };

  const handleSkip = () => {
    if (canSkip || hasAdError || retryCount >= 3) {
      onAdCompleteRef.current?.();
      onCloseRef.current?.();
    }
  };

  if (!isOpen || isExempt) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[10000] bg-black flex flex-col items-center justify-center overflow-hidden select-none"
      >
        {/* Ad Container */}
        <div className="relative w-full h-full bg-zinc-950">
          {currentIframeUrl && (
            <iframe
              key={`ad-frame-${currentIframeUrl}-${retryCount}`}
              src={currentIframeUrl}
              className="w-full h-full border-none"
              title="Advertisement"
              allow="autoplay; fullscreen"
              sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
              onLoad={handleIframeLoad}
              onError={handleIframeError}
            />
          )}

          {/* Loading / Retry Overlay when fetching ad */}
          {isLoadingAd && (
            <div className="absolute inset-0 bg-black/85 flex flex-col items-center justify-center gap-3 z-10 pointer-events-none">
              <Loader2 className="w-10 h-10 text-amber-400 animate-spin" />
              <div className="text-center px-4">
                <p className="text-white font-extrabold text-sm sm:text-base">
                  {retryCount > 0 
                    ? `Loading Another Ad Video (Attempt ${retryCount + 1})...` 
                    : "Connecting to High-Speed Stream Ad..."}
                </p>
                <p className="text-xs text-zinc-400 mt-1 max-w-xs">
                  Extracting sponsor video offer. Please wait a moment.
                </p>
              </div>
            </div>
          )}

          {/* Fallback alert if ad repeatedly fails */}
          {hasAdError && !isLoadingAd && (
            <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center gap-4 z-15 p-6 text-center">
              <div className="w-14 h-14 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <AlertCircle className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-bold text-white mb-1">
                  Ad Video Did Not Load
                </h3>
                <p className="text-xs sm:text-sm text-zinc-400 max-w-sm mx-auto">
                  The ad server didn't respond in time. You can fetch another ad or continue directly to stream.
                </p>
              </div>
              <div className="flex flex-wrap gap-3 justify-center mt-2">
                <button
                  onClick={() => handleRetryAd()}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-semibold text-xs sm:text-sm transition-colors border border-zinc-700"
                >
                  <RefreshCw className="w-4 h-4 text-amber-400" />
                  <span>Retry Another Ad</span>
                </button>
                <button
                  onClick={handleSkip}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-bold text-xs sm:text-sm hover:from-emerald-400 hover:to-teal-400 transition-colors shadow-lg"
                >
                  <span>Continue to Video</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
          
          {/* Top Bar - Timer, Retry Button & Skip Controls */}
          <div className="absolute top-0 left-0 right-0 p-3 sm:p-4 bg-gradient-to-b from-black/90 via-black/60 to-transparent flex justify-between items-center z-20 pointer-events-auto gap-2">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-900/90 backdrop-blur-md border border-white/20 shadow-lg">
                <Timer className="w-4 h-4 text-amber-400 animate-pulse" />
                <span className="text-xs sm:text-sm font-bold text-white tracking-wide">
                  {timeLeft > 15 ? (
                    `Skip in ${timeLeft - 15}s`
                  ) : timeLeft > 0 ? (
                    `Auto-closing in ${timeLeft}s`
                  ) : (
                    "Content Unlocked!"
                  )}
                </span>
              </div>

              {/* Manual "Retry Another Ad" button */}
              <button
                onClick={() => handleRetryAd()}
                title="Ad video not playing? Click to fetch another ad video"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-900/90 hover:bg-zinc-800 backdrop-blur-md border border-amber-500/30 text-amber-300 hover:text-amber-200 text-xs font-semibold shadow-lg transition-all active:scale-95 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingAd ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Retry Ad</span>
              </button>
            </div>

            {canSkip || hasAdError || retryCount >= 3 ? (
              <button
                onClick={handleSkip}
                className="group flex items-center gap-1.5 sm:gap-2 px-4 sm:px-5 py-2 sm:py-2.5 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-extrabold text-xs sm:text-sm hover:from-emerald-400 hover:to-teal-400 transition-all shadow-xl active:scale-95 border border-white/30 cursor-pointer animate-bounce"
              >
                <span>Skip Ad & Continue</span>
                <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 group-hover:translate-x-1 transition-transform" />
              </button>
            ) : (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-sm border border-white/10 text-[11px] font-semibold text-zinc-300">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden xs:inline">Preparing Stream</span>
              </div>
            )}
          </div>

          {/* Bottom Banner Status */}
          <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6 bg-gradient-to-t from-black/95 via-black/70 to-transparent text-center z-20 pointer-events-none">
            <h2 className="text-base sm:text-lg font-extrabold text-white mb-1">
              Extracting High-Speed Stream
            </h2>
            <p className="text-xs sm:text-sm text-zinc-300 max-w-md mx-auto">
              Your video link is being extracted in the background. Video ad will auto-close in max 30s or skip after 15s.
            </p>
            {/* Progress dots */}
            <div className="mt-3 flex justify-center gap-1">
              {[...Array(30)].map((_, i) => (
                <div 
                  key={i} 
                  className={`h-1 w-1.5 sm:w-2 rounded-full transition-colors duration-300 ${
                    30 - timeLeft > i ? 'bg-emerald-500' : 'bg-white/20'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Click trap prevention during non-skippable window */}
        {!canSkip && !hasAdError && (
          <div className="absolute inset-0 z-[10001] bg-transparent cursor-wait pointer-events-none" />
        )}
      </motion.div>
    </AnimatePresence>
  );
};

