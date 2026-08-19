import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useScrollRestoration } from '../hooks/useScrollRestoration';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { clsx } from 'clsx';

interface ScrollableRowProps extends React.HTMLAttributes<HTMLDivElement> {
  scrollKey: string;
  children: React.ReactNode;
  ready?: boolean;
  showArrows?: boolean;
  arrowClassName?: string;
}

export const ScrollableRow = React.forwardRef<HTMLDivElement, ScrollableRowProps>(
  ({ scrollKey, children, className, style, ready = true, showArrows = true, arrowClassName, ...props }, forwardedRef) => {
    const internalRef = useScrollRestoration<HTMLDivElement>(scrollKey, false, ready);
    const containerRef = useRef<HTMLDivElement | null>(null);

    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [startX, setStartX] = useState(0);
    const [scrollLeftPos, setScrollLeftPos] = useState(0);

    const setRefs = useCallback(
      (node: HTMLDivElement | null) => {
        containerRef.current = node;
        // @ts-ignore
        internalRef.current = node;
        if (typeof forwardedRef === 'function') {
          forwardedRef(node);
        } else if (forwardedRef) {
          forwardedRef.current = node;
        }
      },
      [forwardedRef, internalRef]
    );

    const checkScrollButtons = useCallback(() => {
      const el = containerRef.current;
      if (!el) return;
      const left = el.scrollLeft > 10;
      const right = el.scrollLeft < el.scrollWidth - el.clientWidth - 10;
      setCanScrollLeft(prev => prev !== left ? left : prev);
      setCanScrollRight(prev => prev !== right ? right : prev);
    }, []);

    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;

      checkScrollButtons();
      el.addEventListener('scroll', checkScrollButtons, { passive: true });
      window.addEventListener('resize', checkScrollButtons);

      return () => {
        el.removeEventListener('scroll', checkScrollButtons);
        window.removeEventListener('resize', checkScrollButtons);
      };
    }, [checkScrollButtons]);

    const scroll = (direction: 'left' | 'right') => {
      const el = containerRef.current;
      if (!el) return;
      const scrollAmount = el.clientWidth * 0.75;
      el.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    };

    // Drag to scroll handlers
    const handleMouseDown = (e: React.MouseEvent) => {
      const el = containerRef.current;
      if (!el) return;
      setIsDragging(true);
      setStartX(e.pageX - el.offsetLeft);
      setScrollLeftPos(el.scrollLeft);
    };

    const handleMouseLeaveOrUp = () => {
      setIsDragging(false);
    };

    const handleMouseMove = (e: React.MouseEvent) => {
      if (!isDragging) return;
      const el = containerRef.current;
      if (!el) return;
      e.preventDefault();
      const x = e.pageX - el.offsetLeft;
      const walk = (x - startX) * 1.8; // Scroll multiplier
      el.scrollLeft = scrollLeftPos - walk;
    };

    return (
      <div className="relative group/row w-full">
        {/* Left Fast Scroll Arrow */}
        {showArrows && canScrollLeft && (
          <button
            onClick={(e) => {
              e.preventDefault();
              scroll('left');
            }}
            aria-label="Scroll left"
            className={clsx(
              "absolute left-0 top-1/2 -translate-y-1/2 z-30 w-10 h-10 sm:w-12 sm:h-12 rounded-r-2xl bg-zinc-950/80 hover:bg-emerald-500 text-white border border-l-0 border-zinc-700/80 hover:border-emerald-400 shadow-xl backdrop-blur-md flex items-center justify-center opacity-0 group-hover/row:opacity-100 transition-all duration-300 transform -translate-x-1 group-hover/row:translate-x-0 active:scale-90 cursor-pointer",
              arrowClassName
            )}
          >
            <ChevronLeft className="w-6 h-6 stroke-[2.5]" />
          </button>
        )}

        {/* Scrollable Container */}
        <div
          ref={setRefs}
          onMouseDown={handleMouseDown}
          onMouseLeave={handleMouseLeaveOrUp}
          onMouseUp={handleMouseLeaveOrUp}
          onMouseMove={handleMouseMove}
          className={clsx(
            className,
            isDragging ? "cursor-grabbing select-none" : "cursor-pointer"
          )}
          style={{
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            scrollBehavior: 'smooth',
            ...style
          }}
          {...props}
        >
          {children}
        </div>

        {/* Right Fast Scroll Arrow */}
        {showArrows && canScrollRight && (
          <button
            onClick={(e) => {
              e.preventDefault();
              scroll('right');
            }}
            aria-label="Scroll right"
            className={clsx(
              "absolute right-0 top-1/2 -translate-y-1/2 z-30 w-10 h-10 sm:w-12 sm:h-12 rounded-l-2xl bg-zinc-950/80 hover:bg-emerald-500 text-white border border-r-0 border-zinc-700/80 hover:border-emerald-400 shadow-xl backdrop-blur-md flex items-center justify-center opacity-0 group-hover/row:opacity-100 transition-all duration-300 transform translate-x-1 group-hover/row:translate-x-0 active:scale-90 cursor-pointer",
              arrowClassName
            )}
          >
            <ChevronRight className="w-6 h-6 stroke-[2.5]" />
          </button>
        )}
      </div>
    );
  }
);

ScrollableRow.displayName = 'ScrollableRow';

