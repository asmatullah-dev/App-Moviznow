import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Download,
  Film,
  Sparkles,
  Copy,
  Check,
  X,
  ExternalLink,
  ShieldCheck,
} from 'lucide-react';
import {
  getTrailerDownloadOptions,
  extractYouTubeVideoId,
  getYouTubeWatchUrl,
  DownloadOption,
} from '../utils/youtubeDownloader';

interface TrailerDownloadDropdownProps {
  trailerUrl: string;
  sampleUrl?: string;
  title?: string;
  onDownloadStart?: (label: string) => void;
  className?: string;
}

export const TrailerDownloadDropdown: React.FC<TrailerDownloadDropdownProps> = ({
  trailerUrl,
  sampleUrl,
  title,
  onDownloadStart,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [toastNotice, setToastNotice] = useState<string | null>(null);

  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});

  const videoId = extractYouTubeVideoId(trailerUrl);
  const downloadOptions: DownloadOption[] = videoId
    ? getTrailerDownloadOptions(videoId, sampleUrl)
    : [];
  const youtubeWatchUrl = videoId ? getYouTubeWatchUrl(videoId) : trailerUrl;

  // Reposition portal menu on open, resize, or scroll
  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const menuWidth = 310;
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    const spaceBelow = windowHeight - rect.bottom - 12;
    const spaceAbove = rect.top - 12;

    const shouldOpenUpwards = spaceBelow < 240 && spaceAbove > spaceBelow;
    const calculatedMaxHeight = Math.max(
      200,
      Math.min(380, shouldOpenUpwards ? spaceAbove : spaceBelow)
    );

    // Calculate horizontal right offset to prevent horizontal overflow
    const rightOffset = Math.max(
      12,
      Math.min(windowWidth - rect.right, windowWidth - menuWidth - 12)
    );

    const style: React.CSSProperties = {
      position: 'fixed',
      width: `${menuWidth}px`,
      right: `${rightOffset}px`,
      maxHeight: `${calculatedMaxHeight}px`,
      zIndex: 10005,
    };

    if (shouldOpenUpwards) {
      style.bottom = `${windowHeight - rect.top + 8}px`;
    } else {
      style.top = `${rect.bottom + 8}px`;
    }

    setMenuStyle(style);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    updatePosition();

    const handleScrollOrResize = () => {
      updatePosition();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('scroll', handleScrollOrResize, true);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, updatePosition]);

  if (!videoId && !sampleUrl) {
    return null;
  }

  const showToast = (message: string) => {
    setToastNotice(message);
    setTimeout(() => {
      setToastNotice(null);
    }, 3500);
  };

  const handleCopyLink = async (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(youtubeWatchUrl);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = youtubeWatchUrl;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopied(true);
      showToast('Trailer link copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast('Could not copy link to clipboard');
    }
  };

  const handleOptionClick = async (opt: DownloadOption) => {
    setIsOpen(false);

    if (opt.copyUrlOnOpen) {
      await handleCopyLink();
      showToast('Link copied! Opening Cobalt (No Ads & No Captcha)...');
    } else if (opt.isDirectDownload) {
      showToast('Starting direct file download...');
    } else {
      showToast(`Opening ${opt.label}...`);
    }

    if (onDownloadStart) {
      onDownloadStart(`${opt.label} (${title ? `${title} Trailer` : 'Trailer'})`);
    }
  };

  return (
    <div className={`relative inline-block text-left ${className}`}>
      {/* Trigger Button - Icon Only (clean square icon button) */}
      <button
        ref={buttonRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen((prev) => !prev);
        }}
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-label="Download trailer"
        title="Download trailer"
        className="bg-black/60 hover:bg-black/80 backdrop-blur-md text-white w-8 h-8 rounded-lg text-xs font-medium transition-all duration-200 border border-white/10 hover:border-emerald-500/40 shadow-lg flex items-center justify-center cursor-pointer active:scale-95 group"
      >
        <Download className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition-transform" />
      </button>

      {/* Portal Dropdown Menu - Never clipped by aspect-video overflow-hidden */}
      {isOpen &&
        createPortal(
          <>
            {/* Backdrop click outside detector */}
            <div
              className="fixed inset-0 z-[10004] bg-transparent"
              onClick={(e) => {
                e.stopPropagation();
                setIsOpen(false);
              }}
            />

            {/* Menu Container */}
            <div
              ref={menuRef}
              role="menu"
              aria-orientation="vertical"
              style={menuStyle}
              onClick={(e) => e.stopPropagation()}
              className="rounded-2xl bg-zinc-950/98 backdrop-blur-2xl border border-white/20 shadow-[0_25px_60px_rgba(0,0,0,0.95)] flex flex-col overflow-hidden ring-1 ring-white/10 animate-in fade-in zoom-in-95 duration-150 select-none text-xs"
            >
              {/* Header */}
              <div className="px-3.5 py-2.5 border-b border-white/10 flex items-center justify-between shrink-0 bg-white/[0.02]">
                <div className="flex items-center gap-1.5 min-w-0">
                  <div className="w-5 h-5 rounded-md bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                    <Download className="w-3 h-3" />
                  </div>
                  <span className="font-bold text-white text-[11px] tracking-tight truncate">
                    Download Trailer
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                    <ShieldCheck className="w-2.5 h-2.5" /> No Verification
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="w-5 h-5 rounded-md text-zinc-400 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors cursor-pointer"
                    title="Close"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* Scrollable Options List */}
              <div
                className="p-1.5 space-y-1 overflow-y-auto overscroll-contain flex-1 divide-y divide-white/[0.06] max-h-[260px]"
                style={{
                  scrollbarWidth: 'thin',
                  scrollbarColor: 'rgba(255, 255, 255, 0.25) transparent',
                }}
              >
                {downloadOptions.map((opt) => {
                  const isDirect = opt.type === 'direct';
                  const isClean = opt.type === 'clean';

                  return (
                    <a
                      key={opt.id}
                      href={opt.url}
                      target={isDirect ? '_self' : '_blank'}
                      rel="noopener noreferrer"
                      download={isDirect ? `${title || 'trailer'}.mp4` : undefined}
                      role="menuitem"
                      onClick={() => handleOptionClick(opt)}
                      className="pt-1 first:pt-0 block w-full text-left p-2 rounded-xl text-zinc-200 hover:text-white hover:bg-white/10 transition-colors group cursor-pointer"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 shadow-sm ${
                              isDirect
                                ? 'bg-emerald-500/20 text-emerald-400 group-hover:bg-emerald-500/30'
                                : isClean
                                ? 'bg-blue-500/20 text-blue-400 group-hover:bg-blue-500/30'
                                : 'bg-amber-500/20 text-amber-400 group-hover:bg-amber-500/30'
                            }`}
                          >
                            {isDirect ? (
                              <Download className="w-3.5 h-3.5" />
                            ) : isClean ? (
                              <Sparkles className="w-3.5 h-3.5" />
                            ) : (
                              <ExternalLink className="w-3.5 h-3.5" />
                            )}
                          </div>
                          <div className="truncate">
                            <div className="font-semibold text-zinc-100 group-hover:text-emerald-400 transition-colors truncate text-[11px]">
                              {opt.label}
                            </div>
                            <div className="text-[10px] text-zinc-400 font-normal truncate">
                              {opt.description}
                            </div>
                          </div>
                        </div>

                        <span
                          className={`shrink-0 px-1.5 py-0.5 text-[9px] font-bold rounded uppercase tracking-wider border ${
                            isDirect
                              ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25'
                              : isClean
                              ? 'bg-blue-500/15 text-blue-300 border-blue-500/25'
                              : 'bg-white/10 text-zinc-300 border-white/5'
                          }`}
                        >
                          {opt.badge}
                        </span>
                      </div>
                    </a>
                  );
                })}
              </div>

              {/* Footer with 1-click Copy Trailer Link */}
              <div className="p-1.5 bg-white/[0.03] border-t border-white/10 shrink-0 space-y-1">
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white flex items-center justify-center gap-2 text-[11px] font-medium transition-colors border border-white/5 cursor-pointer active:scale-95"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400 font-semibold">Link Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-zinc-400" />
                      <span>Copy Direct Trailer Link</span>
                    </>
                  )}
                </button>
                <div className="text-[9px] text-zinc-400 text-center tracking-tight">
                  Zero server bandwidth · 0 MB Vercel & Cloud Run usage
                </div>
              </div>
            </div>
          </>,
          document.body
        )}

      {/* Floating Toast Notice */}
      {toastNotice &&
        createPortal(
          <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[10006] bg-zinc-950/95 text-white border border-emerald-500/50 px-4 py-2.5 rounded-xl shadow-[0_15px_40px_rgba(0,0,0,0.85)] flex items-center gap-2.5 text-xs font-semibold backdrop-blur-xl animate-in fade-in slide-in-from-top-4 duration-200 pointer-events-none ring-1 ring-emerald-500/20 max-w-[90vw]">
            <Download className="w-4 h-4 text-emerald-400 animate-pulse shrink-0" />
            <span className="truncate">{toastNotice}</span>
          </div>,
          document.body
        )}
    </div>
  );
};
