import React, { useEffect, useState, useRef } from "react";
import { useLocation } from "react-router-dom";

export function GlobalNavigationLoader() {
  const location = useLocation();
  const [progress, setProgress] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const completeTimerRef = useRef<NodeJS.Timeout | null>(null);
  const prevPathRef = useRef(location.pathname + location.search);

  const startProgress = () => {
    if (completeTimerRef.current) clearTimeout(completeTimerRef.current);
    if (timerRef.current) clearInterval(timerRef.current);

    setIsVisible(true);
    setProgress(15);

    let current = 15;
    timerRef.current = setInterval(() => {
      current += (90 - current) * 0.18;
      if (current >= 88) {
        if (timerRef.current) clearInterval(timerRef.current);
      }
      setProgress(Math.min(current, 88));
    }, 100);
  };

  const finishProgress = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setProgress(100);

    completeTimerRef.current = setTimeout(() => {
      setIsVisible(false);
      setProgress(0);
    }, 280);
  };

  // Trigger progress bar whenever location changes
  useEffect(() => {
    const currentPath = location.pathname + location.search;
    if (prevPathRef.current !== currentPath) {
      prevPathRef.current = currentPath;
      startProgress();
      
      // Complete after small delay to give time for child components to mount
      const t = setTimeout(() => {
        finishProgress();
      }, 200);

      return () => clearTimeout(t);
    }
  }, [location.pathname, location.search]);

  // Intercept global link / button clicks for immediate feedback before route resolution
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement)?.closest("a, button, [role='button'], .cursor-pointer");
      if (!target) return;

      // If it's a link to another page
      if (target instanceof HTMLAnchorElement && target.href) {
        const url = new URL(target.href, window.location.href);
        if (url.origin === window.location.origin && url.pathname !== window.location.pathname) {
          startProgress();
        }
      }
    };

    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, []);

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
