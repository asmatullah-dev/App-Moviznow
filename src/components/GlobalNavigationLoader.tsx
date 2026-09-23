import React, { useEffect, useState, useRef } from "react";
import { useLocation } from "react-router-dom";

export function GlobalNavigationLoader() {
  const location = useLocation();
  const [progress, setProgress] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const completeTimerRef = useRef<NodeJS.Timeout | null>(null);
  const prevPathRef = useRef(location.pathname + location.search);

  const finishProgress = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setProgress(100);

    completeTimerRef.current = setTimeout(() => {
      setIsVisible(false);
      setProgress(0);
    }, 150);
  };

  const startProgress = () => {
    if (completeTimerRef.current) clearTimeout(completeTimerRef.current);
    if (timerRef.current) clearInterval(timerRef.current);

    setIsVisible(true);
    setProgress(30);

    let current = 30;
    timerRef.current = setInterval(() => {
      current += (90 - current) * 0.2;
      if (current >= 88) {
        if (timerRef.current) clearInterval(timerRef.current);
      }
      setProgress(Math.min(current, 88));
    }, 80);

    completeTimerRef.current = setTimeout(() => {
      finishProgress();
    }, 800);
  };

  // Only trigger loader if a route change is slow (not instant SPA route transitions)
  useEffect(() => {
    const currentPath = location.pathname + location.search;
    if (prevPathRef.current !== currentPath) {
      prevPathRef.current = currentPath;
      // For immediate client routes, do nothing to prevent visual flash or lag.
      // If there's an active loader, finish it immediately.
      if (isVisible) {
        finishProgress();
      }
    }
  }, [location.pathname, location.search, isVisible]);

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
