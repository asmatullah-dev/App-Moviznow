import React, { useState, useEffect, useRef } from "react";
import { getOptimizedImageUrl } from "../utils/imageUtils";
import { Film } from "lucide-react";
import { clsx } from "clsx";

// Global cache of already-loaded image URLs in this session for instant 0ms display
const loadedPostersCache = new Set<string>();

interface LazyPosterImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src?: string;
  fallbackSrc?: string;
  alt: string;
  targetWidth?: number;
  containerClassName?: string;
  className?: string;
  placeholderIcon?: React.ReactNode;
  priority?: boolean;
}

export const LazyPosterImage: React.FC<LazyPosterImageProps> = React.memo(
  ({
    src,
    fallbackSrc = "https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=400&auto=format&fit=crop&q=80",
    alt,
    targetWidth = 342,
    containerClassName,
    className,
    placeholderIcon,
    priority = false,
    ...props
  }) => {
    const imgRef = useRef<HTMLImageElement | null>(null);
    const [hasError, setHasError] = useState(false);

    const rawUrl = hasError ? fallbackSrc : (src?.trim() || fallbackSrc);
    const optimizedUrl = getOptimizedImageUrl(rawUrl, targetWidth) || rawUrl;

    const isAlreadyCached = loadedPostersCache.has(optimizedUrl);
    const [isLoaded, setIsLoaded] = useState<boolean>(isAlreadyCached);

    useEffect(() => {
      if (isAlreadyCached) {
        setIsLoaded(true);
        return;
      }

      // Check if image is already cached by browser
      if (imgRef.current && imgRef.current.complete && imgRef.current.naturalWidth > 0) {
        loadedPostersCache.add(optimizedUrl);
        setIsLoaded(true);
      }
    }, [optimizedUrl, isAlreadyCached]);

    const handleLoad = () => {
      if (optimizedUrl) {
        loadedPostersCache.add(optimizedUrl);
      }
      setIsLoaded(true);
    };

    const handleError = () => {
      if (!hasError) {
        setHasError(true);
        setIsLoaded(false);
      }
    };

    return (
      <div
        className={clsx("relative w-full h-full bg-zinc-900 overflow-hidden", containerClassName)}
      >
        {/* Placeholder skeleton before image is loaded */}
        {!isLoaded && (
          <div className="absolute inset-0 bg-zinc-800/80 dark:bg-zinc-900/90 flex items-center justify-center animate-pulse z-0">
            {placeholderIcon || <Film className="w-6 h-6 text-zinc-600 dark:text-zinc-700 opacity-40" />}
          </div>
        )}

        {/* High-speed native browser image loading */}
        {optimizedUrl && (
          <img
            ref={imgRef}
            src={optimizedUrl}
            alt={alt}
            loading={priority ? "eager" : "lazy"}
            decoding="async"
            fetchPriority={priority ? "high" : "auto"}
            referrerPolicy="no-referrer"
            onLoad={handleLoad}
            onError={handleError}
            className={clsx(
              "w-full h-full object-cover relative z-10 transition-opacity duration-200",
              isLoaded ? "opacity-100" : "opacity-0",
              className
            )}
            {...props}
          />
        )}
      </div>
    );
  }
);

LazyPosterImage.displayName = "LazyPosterImage";
