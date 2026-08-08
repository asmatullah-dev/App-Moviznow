import React, { memo } from "react";

interface ScrollingBannerProps {
  text: string;
  speedSeconds?: number;
  className?: string;
}

/**
 * High-performance, hardware-accelerated continuous scrolling banner.
 * Uses pure CSS transforms, isolated GPU layers, and React.memo to prevent main-thread jank / stuttering
 * during parent state updates (such as hero poster carousel changes).
 */
export const ScrollingBanner = memo(function ScrollingBanner({
  text,
  speedSeconds,
  className = "",
}: ScrollingBannerProps) {
  if (!text || !text.trim()) return null;

  const trimmedText = text.trim();

  // Ensure each scrolling block is wide enough to cover any display width without gaps or jumps.
  // We repeat the text at least 4 times (or enough to total ~80+ chars per block).
  const repeatCount = Math.max(4, Math.ceil(80 / trimmedText.length));
  const items = Array.from({ length: repeatCount }, () => trimmedText);

  // Total characters in one block (one -50% translation distance)
  const blockLength = trimmedText.length * repeatCount;

  // Smooth, comfortable reading speed (~0.25s per character)
  const duration =
    speedSeconds ?? Math.max(10, Number((blockLength * 0.25).toFixed(1)));

  return (
    <div
      className={`sticky top-16 z-40 w-full overflow-hidden bg-emerald-500/10 dark:bg-emerald-950/80 border-b border-emerald-500/20 py-2 flex items-center shrink-0 shadow-sm select-none transform-gpu group ${className}`}
      style={{
        isolation: "isolate",
        contain: "paint layout",
        transform: "translate3d(0, 0, 0)",
        WebkitTransform: "translate3d(0, 0, 0)",
        backfaceVisibility: "hidden",
        WebkitBackfaceVisibility: "hidden",
      }}
    >
      <div
        className="flex shrink-0 items-center whitespace-nowrap group-hover:[animation-play-state:paused]"
        style={{
          display: "flex",
          width: "max-content",
          animation: `smoothMarqueeScroll ${duration}s linear infinite`,
          willChange: "transform",
          transform: "translate3d(0, 0, 0)",
          WebkitTransform: "translate3d(0, 0, 0)",
          backfaceVisibility: "hidden",
          WebkitBackfaceVisibility: "hidden",
          WebkitFontSmoothing: "antialiased",
          MozOsxFontSmoothing: "grayscale",
        }}
      >
        {/* First block copy */}
        <div className="flex items-center shrink-0">
          {items.map((item, idx) => (
            <span
              key={`a-${idx}`}
              className="inline-flex items-center text-sm sm:text-base font-bold text-emerald-700 dark:text-emerald-300 pr-10 tracking-wide antialiased"
              style={{
                transform: "translate3d(0, 0, 0)",
                backfaceVisibility: "hidden",
              }}
            >
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 dark:bg-emerald-400 mr-3 shrink-0" />
              {item}
            </span>
          ))}
        </div>

        {/* Duplicate block copy for seamless infinite loop */}
        <div className="flex items-center shrink-0" aria-hidden="true">
          {items.map((item, idx) => (
            <span
              key={`b-${idx}`}
              className="inline-flex items-center text-sm sm:text-base font-bold text-emerald-700 dark:text-emerald-300 pr-10 tracking-wide antialiased"
              style={{
                transform: "translate3d(0, 0, 0)",
                backfaceVisibility: "hidden",
              }}
            >
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 dark:bg-emerald-400 mr-3 shrink-0" />
              {item}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
});


