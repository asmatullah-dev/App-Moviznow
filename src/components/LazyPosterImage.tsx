import React, { useState, useEffect, useRef } from "react";
import { getOptimizedImageUrl } from "../utils/imageUtils";
import { Film } from "lucide-react";
import { clsx } from "clsx";

// High-performance shared IntersectionObserver pool for low-end hardware devices
type ObserverCallback = (entry: IntersectionObserverEntry) => void;
const listeners = new Map<Element, ObserverCallback>();

let sharedObserver: IntersectionObserver | null = null;

function getSharedObserver(): IntersectionObserver | null {
  if (typeof window === "undefined" || !("IntersectionObserver" in window)) {
    return null;
  }
  if (!sharedObserver) {
    sharedObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const callback = listeners.get(entry.target);
          if (callback && entry.isIntersecting) {
            callback(entry);
          }
        });
      },
      {
        rootMargin: "150px 0px 150px 0px", // Loads smoothly just before entering viewport
        threshold: 0.01,
      }
    );
  }
  return sharedObserver;
}

function observeElement(el: Element, callback: ObserverCallback) {
  const observer = getSharedObserver();
  if (!observer) return () => {};

  listeners.set(el, callback);
  observer.observe(el);

  return () => {
    listeners.delete(el);
    observer.unobserve(el);
  };
}

interface LazyPosterImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src?: string;
  fallbackSrc?: string;
  alt: string;
  targetWidth?: number;
  containerClassName?: string;
  className?: string;
  placeholderIcon?: React.ReactNode;
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
    ...props
  }) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [isVisible, setIsVisible] = useState(false);
    const [isLoaded, setIsLoaded] = useState(false);
    const [hasError, setHasError] = useState(false);

    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;

      // If IntersectionObserver is not supported, load immediately
      if (typeof window !== "undefined" && !("IntersectionObserver" in window)) {
        setIsVisible(true);
        return;
      }

      // Check if already in viewport or observe
      const unobserve = observeElement(el, () => {
        setIsVisible(true);
        unobserve();
      });

      return () => {
        unobserve();
      };
    }, []);

    const rawUrl = hasError ? fallbackSrc : (src?.trim() || fallbackSrc);
    const optimizedUrl = isVisible ? (getOptimizedImageUrl(rawUrl, targetWidth) || rawUrl) : "";

    return (
      <div
        ref={containerRef}
        className={clsx("relative w-full h-full bg-zinc-900 overflow-hidden", containerClassName)}
        style={{ contentVisibility: "auto", containIntrinsicSize: "200px 300px" }}
      >
        {/* Placeholder skeleton before entering viewport or before image loads */}
        {(!isVisible || !isLoaded) && (
          <div className="absolute inset-0 bg-zinc-800/80 dark:bg-zinc-900/90 flex items-center justify-center animate-pulse">
            {placeholderIcon || <Film className="w-6 h-6 text-zinc-600 dark:text-zinc-700 opacity-40" />}
          </div>
        )}

        {/* Only render and attach image src when visible in screen / viewport */}
        {isVisible && optimizedUrl && (
          <img
            src={optimizedUrl}
            alt={alt}
            decoding="async"
            referrerPolicy="no-referrer"
            onLoad={() => setIsLoaded(true)}
            onError={() => {
              if (!hasError) {
                setHasError(true);
              }
            }}
            className={clsx(
              "w-full h-full object-cover transition-opacity duration-300",
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
