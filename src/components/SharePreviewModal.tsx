import React, { useState, useEffect } from 'react';
import { Share2, Copy, Check, X, Loader2, Image as ImageIcon, Images, ImagePlus, ChevronLeft, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useModalBehavior } from '../hooks/useModalBehavior';
import { useLanguage } from '../contexts/LanguageContext';
import { useHaptics } from '../hooks/useHaptics';
import clsx from 'clsx';

const TMDB_API_KEY = import.meta.env.VITE_TMDB_API_KEY || 'f71c2391161526fa9d19bd0b2759efaf';
const TMDB_BASE = 'https://api.themoviedb.org/3';

interface SharePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  contentTitle?: string;
  posterUrl?: string | null;
  shareText: string;
  shareSubject?: string;
  themeColor?: 'amber' | 'cyan';
}

export default function SharePreviewModal({
  isOpen,
  onClose,
  title = 'Share Content',
  contentTitle,
  posterUrl,
  shareText,
  shareSubject,
  themeColor = 'amber',
}: SharePreviewModalProps) {
  const { t, language } = useLanguage();
  const { vibrate } = useHaptics();
  const [copied, setCopied] = useState(false);
  const [isSharingBoth, setIsSharingBoth] = useState(false);
  const [isSharingText, setIsSharingText] = useState(false);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  // Active poster state (can be updated from poster gallery)
  const [activePosterUrl, setActivePosterUrl] = useState<string | null>(posterUrl || null);

  // Poster Gallery state
  const [showTmdbGallery, setShowTmdbGallery] = useState(false);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [tmdbPosters, setTmdbPosters] = useState<string[]>([]);

  const isCyan = themeColor === 'cyan';

  useModalBehavior(isOpen, onClose);

  // Sync active poster if prop changes
  useEffect(() => {
    if (isOpen) {
      setActivePosterUrl(posterUrl || null);
      setShowTmdbGallery(false);
    }
  }, [isOpen, posterUrl]);

  const cleanShareText = (shareText || '').trim();

  // Extract clean search title (strips year in parentheses e.g. "Awarapan 2 (2026)" -> "Awarapan 2")
  const getSearchableTitle = (rawTitle?: string) => {
    if (!rawTitle) return '';
    return rawTitle.replace(/\s*\(\d{4}\).*$/, '').trim();
  };

  const fetchTmdbPosters = async (queryToSearch?: string) => {
    const rawQuery = (queryToSearch !== undefined ? queryToSearch : getSearchableTitle(contentTitle)) || '';
    if (!rawQuery.trim()) return;

    setGalleryLoading(true);
    vibrate(20);
    try {
      const cleanQ = rawQuery.trim();
      const searchUrl = `${TMDB_BASE}/search/multi?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(cleanQ)}&include_adult=false`;
      const res = await fetch(searchUrl);
      const data = await res.json();

      const posterSet = new Set<string>();

      // If existing active poster, keep it in mind
      if (activePosterUrl) {
        posterSet.add(activePosterUrl);
      }

      if (data.results && Array.isArray(data.results)) {
        const topResults = data.results.slice(0, 8);

        // Collect direct poster paths
        topResults.forEach((item: any) => {
          if (item.poster_path) {
            posterSet.add(`https://image.tmdb.org/t/p/w500${item.poster_path}`);
          }
        });

        // Also fetch full image gallery for the top 4 matches
        const imagePromises = topResults.slice(0, 4).map(async (item: any) => {
          const type = item.media_type === 'tv' ? 'tv' : 'movie';
          try {
            const imgRes = await fetch(`${TMDB_BASE}/${type}/${item.id}/images?api_key=${TMDB_API_KEY}&include_image_language=en,hi,null,te,ta,ur,ar,es`);
            if (imgRes.ok) {
              const imgData = await imgRes.json();
              if (imgData.posters && Array.isArray(imgData.posters)) {
                imgData.posters.forEach((p: any) => {
                  if (p.file_path) {
                    posterSet.add(`https://image.tmdb.org/t/p/w500${p.file_path}`);
                  }
                });
              }
            }
          } catch (err) {
            console.warn('Failed fetching item images from TMDB:', err);
          }
        });

        await Promise.all(imagePromises);
      }

      setTmdbPosters(Array.from(posterSet));
    } catch (err) {
      console.error('Error fetching TMDB posters:', err);
    } finally {
      setGalleryLoading(false);
    }
  };

  const handleOpenGallery = () => {
    vibrate(30);
    const initialQuery = getSearchableTitle(contentTitle);
    setShowTmdbGallery(true);
    fetchTmdbPosters(initialQuery);
  };

  const handleSelectPoster = (url: string) => {
    vibrate(35);
    setActivePosterUrl(url);
    setShowTmdbGallery(false);
    setStatusNotice(t('Poster Selected'));
    setTimeout(() => setStatusNotice(null), 2500);
  };

  const handleCopy = async () => {
    vibrate(30);
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(cleanShareText);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = cleanShareText;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopied(true);
      setStatusNotice(t('Text copied to clipboard!'));
      setTimeout(() => {
        setCopied(false);
        setStatusNotice(null);
      }, 2500);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  const handleShareText = async () => {
    vibrate(30);
    setIsSharingText(true);
    const shareTitle = shareSubject || contentTitle || t('MovizNow');

    if (navigator.share) {
      try {
        await navigator.share({
          title: shareTitle,
          text: cleanShareText,
        });
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          await handleCopy();
        }
      } finally {
        setIsSharingText(false);
      }
    } else {
      setIsSharingText(false);
      await handleCopy();
    }
  };

  const getPosterFile = async (url: string): Promise<File | null> => {
    try {
      const response = await fetch(url);
      if (response.ok) {
        const blob = await response.blob();
        return new File([blob], 'poster.jpg', {
          type: blob.type || 'image/jpeg',
        });
      }
    } catch {
      try {
        const proxyResponse = await fetch(`/api/image-proxy?url=${encodeURIComponent(url)}`);
        if (proxyResponse.ok) {
          const blob = await proxyResponse.blob();
          return new File([blob], 'poster.jpg', {
            type: blob.type || 'image/jpeg',
          });
        }
      } catch (e) {
        console.warn('Failed to fetch poster for sharing:', e);
      }
    }
    return null;
  };

  const handleShareBoth = async () => {
    vibrate(40);
    setIsSharingBoth(true);
    setStatusNotice(null);

    const shareTitle = shareSubject || contentTitle || t('MovizNow');

    try {
      let posterFile: File | null = null;
      if (activePosterUrl) {
        posterFile = await getPosterFile(activePosterUrl);
      }

      const files = posterFile ? [posterFile] : [];
      const canShareFiles = files.length > 0 && typeof navigator.canShare === 'function' && navigator.canShare({ files });

      if (navigator.share && canShareFiles) {
        try {
          await navigator.share({
            title: shareTitle,
            text: cleanShareText,
            files: files,
          });
          setIsSharingBoth(false);
          return;
        } catch (shareErr: any) {
          if (shareErr?.name === 'AbortError') {
            setIsSharingBoth(false);
            return;
          }
          console.warn('Native share with files failed, trying fallback:', shareErr);
        }
      }

      // Fallback: Download poster if available and copy text
      if (posterFile) {
        try {
          const blobUrl = URL.createObjectURL(posterFile);
          const a = document.createElement('a');
          a.href = blobUrl;
          a.download = `${(contentTitle || 'poster').replace(/[^a-zA-Z0-9_-]/g, '_')}_poster.jpg`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
        } catch (dlErr) {
          console.warn('Download fallback failed:', dlErr);
        }
      }

      await handleCopy();
      setStatusNotice(
        posterFile
          ? t('Poster downloaded & text copied to clipboard!')
          : t('Text copied to clipboard!')
      );
      setTimeout(() => setStatusNotice(null), 3500);
    } catch (err: any) {
      console.error('Share both failed:', err);
      await handleCopy();
    } finally {
      setIsSharingBoth(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3.5 sm:p-5 overflow-y-auto bg-black/80 backdrop-blur-md">
          {/* Backdrop click close */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
            className="relative w-full max-w-xl sm:max-w-2xl my-auto bg-white dark:bg-zinc-950 border border-zinc-200/90 dark:border-zinc-800/90 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] z-10"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header with gradient accent */}
            <div className={clsx(
              "relative px-5 py-4 sm:px-6 sm:py-5 border-b border-zinc-100 dark:border-zinc-800/80 bg-gradient-to-b to-transparent flex items-center justify-between shrink-0",
              isCyan ? "from-cyan-500/10 dark:from-cyan-950/30" : "from-amber-500/10 dark:from-amber-950/30"
            )}>
              <div className="flex items-center gap-3">
                <div className={clsx(
                  "w-10 h-10 rounded-2xl text-white flex items-center justify-center shadow-lg shrink-0",
                  isCyan
                    ? "bg-gradient-to-tr from-cyan-500 to-blue-600 shadow-cyan-500/25"
                    : "bg-gradient-to-tr from-amber-500 to-orange-500 shadow-amber-500/25"
                )}>
                  <Share2 className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className={clsx(
                    "font-bold text-zinc-900 dark:text-white leading-snug tracking-tight",
                    language === 'ur' ? 'urdu-font text-lg' : 'text-base sm:text-lg'
                  )}>
                    {t(title)}
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate max-w-[220px] sm:max-w-[300px]">
                    {contentTitle || t('Share details and poster')}
                  </p>
                </div>
              </div>

              <button
                onClick={() => {
                  vibrate(20);
                  onClose();
                }}
                className="w-9 h-9 rounded-full bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800/80 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 flex items-center justify-center transition-all active:scale-90 cursor-pointer"
                title={t('Close')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable Modal Content */}
            <div className="p-3.5 sm:p-5 overflow-y-auto space-y-3 text-left">
              {/* Poster Gallery Sub-View */}
              {showTmdbGallery ? (
                <div className="space-y-3.5">
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setShowTmdbGallery(false)}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white cursor-pointer transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      <span>{t('Back to Preview')}</span>
                    </button>
                    <div className="flex items-center gap-2">
                      <span className={clsx("text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-300", language === 'ur' ? 'urdu-font' : '')}>
                        {t('Poster Gallery')}
                      </span>
                      <button
                        type="button"
                        onClick={() => fetchTmdbPosters()}
                        disabled={galleryLoading}
                        className="p-1 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors cursor-pointer"
                        title={t('Refresh')}
                      >
                        <RefreshCw className={clsx("w-3.5 h-3.5", galleryLoading && "animate-spin")} />
                      </button>
                    </div>
                  </div>

                  {/* Gallery Grid */}
                  {galleryLoading ? (
                    <div className="flex flex-col items-center justify-center py-12 gap-3 text-zinc-500 dark:text-zinc-400">
                      <Loader2 className={clsx("w-7 h-7 animate-spin", isCyan ? "text-cyan-500" : "text-amber-500")} />
                      <p className="text-xs">{t('Loading Gallery...')}</p>
                    </div>
                  ) : tmdbPosters.length > 0 ? (
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2.5 max-h-64 sm:max-h-80 overflow-y-auto p-1">
                      {tmdbPosters.map((imgUrl, idx) => {
                        const isSelected = activePosterUrl === imgUrl;
                        return (
                          <div
                            key={idx}
                            onClick={() => handleSelectPoster(imgUrl)}
                            className={clsx(
                              "group relative aspect-[2/3] rounded-xl overflow-hidden cursor-pointer border-2 transition-all active:scale-95 shadow-sm",
                              isSelected
                                ? isCyan
                                  ? "border-cyan-500 ring-2 ring-cyan-500/30 scale-[1.02]"
                                  : "border-amber-500 ring-2 ring-amber-500/30 scale-[1.02]"
                                : "border-transparent hover:border-zinc-300 dark:hover:border-zinc-700"
                            )}
                          >
                            <img
                              src={imgUrl}
                              alt=""
                              className="w-full h-full object-cover"
                              loading="lazy"
                              referrerPolicy="no-referrer"
                            />
                            {isSelected && (
                              <div className={clsx(
                                "absolute top-1.5 right-1.5 w-5 h-5 rounded-full text-white flex items-center justify-center shadow-md",
                                isCyan ? "bg-cyan-500" : "bg-amber-500"
                              )}>
                                <Check className="w-3 h-3 stroke-[3]" />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-10 text-xs text-zinc-500 dark:text-zinc-400">
                      {t('No posters found in gallery.')}
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {/* Message Preview Header across full width */}
                  <div className="flex items-center justify-between px-0.5">
                    <div className="flex items-center gap-2">
                      <span className={clsx(
                        "text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400",
                        language === 'ur' ? 'urdu-font text-sm' : ''
                      )}>
                        {t('Message Preview')}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 font-mono">
                        {cleanShareText.length} {t('chars')}
                      </span>
                    </div>

                    {/* Copy Text Button in the header row */}
                    <button
                      type="button"
                      onClick={handleCopy}
                      className={clsx(
                        "px-3 py-1 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer border shrink-0",
                        copied
                          ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 shadow-sm"
                          : isCyan
                            ? "border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-600 dark:text-cyan-400"
                            : "border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400"
                      )}
                      title={t('Copy Text')}
                    >
                      {copied ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-500" />
                          <span className={language === 'ur' ? 'urdu-font' : ''}>{t('Copied!')}</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span className={language === 'ur' ? 'urdu-font' : ''}>{t('Copy Text')}</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Both Poster and Text placed under the Message Preview header */}
                  <div className="flex flex-row items-center sm:items-stretch gap-3 sm:gap-4">
                    {/* Left Side: Centered Poster with "Change Poster" Button */}
                    {activePosterUrl ? (
                      <div className="w-28 xs:w-32 sm:w-36 md:w-44 shrink-0 flex flex-col items-center justify-center self-center sm:self-auto">
                        <div className="group relative w-full aspect-[2/3] rounded-2xl overflow-hidden shadow-lg shadow-black/25 bg-zinc-800 border border-zinc-700/50">
                          <img
                            src={activePosterUrl}
                            alt={contentTitle || 'Poster'}
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                          <div className="absolute inset-0 ring-1 ring-inset ring-white/10 rounded-2xl pointer-events-none" />

                          {/* "Change Poster" Button overlaid on Poster */}
                          <button
                            type="button"
                            onClick={handleOpenGallery}
                            className={clsx(
                              "absolute bottom-2 inset-x-2 py-1.5 px-2 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-lg backdrop-blur-md border",
                              isCyan
                                ? "bg-cyan-950/85 hover:bg-cyan-900 text-cyan-200 border-cyan-500/40 shadow-cyan-950/50"
                                : "bg-zinc-950/85 hover:bg-zinc-900 text-amber-200 border-amber-500/40 shadow-black/50"
                            )}
                            title={t('Change Poster')}
                          >
                            <ImagePlus className="w-3.5 h-3.5 shrink-0" />
                            <span className={clsx("truncate", language === 'ur' ? 'urdu-font text-xs' : '')}>
                              {t('Change Poster')}
                            </span>
                          </button>
                        </div>
                      </div>
                    ) : null}

                    {/* Right Side: Message Preview Box */}
                    <div
                      onClick={handleCopy}
                      title={t('Tap text to copy')}
                      className={clsx(
                        "group relative flex-1 min-h-[160px] sm:min-h-[210px] max-h-[240px] sm:max-h-[280px] rounded-2xl bg-zinc-50/90 dark:bg-zinc-900/90 border border-zinc-200/90 dark:border-zinc-800/90 p-3 sm:p-4 text-xs sm:text-sm leading-relaxed text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap font-sans overflow-y-auto cursor-pointer transition-all select-all shadow-inner",
                        isCyan
                          ? "hover:border-cyan-500/50 dark:hover:border-cyan-500/50"
                          : "hover:border-amber-500/50 dark:hover:border-amber-500/50"
                      )}
                    >
                      {cleanShareText}
                      <div className="absolute top-2.5 right-2.5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none bg-zinc-900/85 text-white text-[10px] px-2 py-0.5 rounded-md shadow-sm">
                        {t('Tap text to copy')}
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* Status Notice Notification */}
              {statusNotice && (
                <motion.div
                  initial={{ opacity: 0, y: 4, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  className="py-2.5 px-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-600 dark:text-emerald-400 text-xs font-bold text-center flex items-center justify-center gap-2 shadow-sm"
                >
                  <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>{statusNotice}</span>
                </motion.div>
              )}
            </div>

            {/* Footer with only Share Text and Share Both */}
            <div className="p-4 sm:p-5 border-t border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/90 dark:bg-zinc-900/60 shrink-0">
              <div className="grid grid-cols-2 gap-3">
                {/* 1. Share Text Button (Using Share2 / Share Icon) */}
                <button
                  type="button"
                  onClick={handleShareText}
                  disabled={isSharingText || isSharingBoth}
                  className="py-3.5 px-3.5 rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-750 text-zinc-800 dark:text-zinc-200 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  {isSharingText ? (
                    <Loader2 className="w-4 h-4 animate-spin text-zinc-500" />
                  ) : (
                    <Share2 className={clsx("w-4 h-4", isCyan ? "text-cyan-500 dark:text-cyan-400" : "text-amber-500 dark:text-amber-400")} />
                  )}
                  <span className={clsx("truncate", language === 'ur' ? 'urdu-font text-sm' : '')}>
                    {t('Share Text')}
                  </span>
                </button>

                {/* 2. Share Both Button (Using Images Icon) */}
                <button
                  type="button"
                  onClick={handleShareBoth}
                  disabled={isSharingBoth || isSharingText}
                  className={clsx(
                    "py-3.5 px-3.5 rounded-2xl text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-lg disabled:opacity-50 cursor-pointer",
                    isCyan
                      ? "bg-gradient-to-r from-cyan-500 via-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 shadow-cyan-500/25"
                      : "bg-gradient-to-r from-amber-500 via-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 shadow-amber-500/25"
                  )}
                >
                  {isSharingBoth ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className={clsx("truncate", language === 'ur' ? 'urdu-font text-sm' : '')}>
                        {t('Preparing...')}
                      </span>
                    </>
                  ) : (
                    <>
                      <Images className="w-4 h-4" />
                      <span className={clsx("truncate", language === 'ur' ? 'urdu-font text-base' : '')}>
                        {t('Share Both')}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
