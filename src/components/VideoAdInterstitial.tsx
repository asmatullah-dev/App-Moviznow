import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Timer, ChevronRight, ShieldCheck } from 'lucide-react';

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
  const [timeLeft, setTimeLeft] = useState(30);
  const [canSkip, setCanSkip] = useState(false);
  const onAdCompleteRef = useRef(onAdComplete);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onAdCompleteRef.current = onAdComplete;
    onCloseRef.current = onClose;
  }, [onAdComplete, onClose]);

  useEffect(() => {
    if (!isOpen) {
      setTimeLeft(30);
      setCanSkip(false);
      return;
    }

    setTimeLeft(30);
    setCanSkip(false);

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
  }, [isOpen]);

  const handleSkip = () => {
    if (canSkip) {
      onAdComplete();
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[10000] bg-black flex flex-col items-center justify-center overflow-hidden"
      >
        {/* Ad Container */}
        <div className="relative w-full h-full">
          <iframe
            src={adUrl}
            className="w-full h-full border-none"
            title="Advertisement"
            allow="autoplay; fullscreen"
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
          />
          
          {/* Top Bar - Timer & Skip Controls */}
          <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/90 via-black/50 to-transparent flex justify-between items-center z-20 pointer-events-auto">
            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-zinc-900/90 backdrop-blur-md border border-white/20 shadow-lg">
              <Timer className="w-4 h-4 text-amber-400 animate-pulse" />
              <span className="text-xs sm:text-sm font-bold text-white tracking-wide">
                {timeLeft > 15 ? (
                  `Skip available in ${timeLeft - 15}s`
                ) : timeLeft > 0 ? (
                  `Auto-closing in ${timeLeft}s`
                ) : (
                  "Content Unlocked!"
                )}
              </span>
            </div>

            {canSkip ? (
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
                <span>Preparing Stream</span>
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
        {!canSkip && (
          <div className="absolute inset-0 z-[10001] bg-transparent cursor-wait pointer-events-none" />
        )}
      </motion.div>
    </AnimatePresence>
  );
};
