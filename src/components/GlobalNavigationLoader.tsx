import React, { useEffect, useState, useRef } from "react";
import { useLocation } from "react-router-dom";

export function GlobalNavigationLoader() {
  const location = useLocation();
  const [progress, setProgress] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const prevPathRef = useRef(location.pathname + location.search);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const fadeTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const currentPath = location.pathname + location.search;
    if (prevPathRef.current !== currentPath) {
      prevPathRef.current = currentPath;

      if (timerRef.current) clearTimeout(timerRef.current);
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);

      setIsVisible(true);
      setProgress(40);

      timerRef.current = setTimeout(() => {
        setProgress(100);
        fadeTimerRef.current = setTimeout(() => {
          setIsVisible(false);
          setTimeout(() => setProgress(0), 200);
        }, 200);
      }, 80);
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current);
    };
  }, [location.pathname, location.search]);

  if (!isVisible && progress === 0) return null;

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-[99999] pointer-events-none transition-opacity duration-300 ${
        isVisible ? "opacity-100" : "opacity-0"
      }`}
      aria-hidden="true"
    >
      <div
        className="h-1 bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.8)] transition-all duration-200 ease-out"
        style={{
          width: `${progress}%`,
        }}
      />
    </div>
  );
}
