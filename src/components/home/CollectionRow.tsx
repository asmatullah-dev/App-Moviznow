import React, { useState, useRef, useEffect } from "react";
import { ChevronUp, ChevronDown, X, Share2, Link, Copy, Check, Sparkles, ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useSearchParams } from "react-router-dom";
import { useLanguage } from "../../contexts/LanguageContext";
import { Content, Genre, Language, Quality } from "../../types";
import ContentCard from "../ContentCard";
import { ScrollableRow } from "../ScrollableRow";

interface CollectionRowProps {
  title: string;
  description?: string;
  icon: React.ReactNode;
  scrollKey: string;
  items: Content[];
  isVisible: boolean;
  onToggleVisibility: () => void;
  profile: any;
  qualities: Quality[];
  languages: Language[];
  genres: Genre[];
  toggleFavorite: (id: string) => void;
  toggleWatchLater: (id: string) => void;
}

export const CollectionRow: React.FC<CollectionRowProps> = React.memo(({
  title,
  description,
  icon,
  scrollKey,
  items,
  isVisible,
  onToggleVisibility,
  profile,
  qualities,
  languages,
  genres,
  toggleFavorite,
  toggleWatchLater,
}) => {
  const { t } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
  const gridScrollRef = useRef<HTMLDivElement>(null);

  const [showShareMenu, setShowShareMenu] = useState(false);
  const [copiedFull, setCopiedFull] = useState(false);
  const [copiedMin, setCopiedMin] = useState(false);
  const [copiedRow, setCopiedRow] = useState(false);

  const isTrending = scrollKey === "scroll_trending" || scrollKey === "trending";
  const isNewlyAdded = scrollKey === "scroll_newly_added" || scrollKey === "newly_added";

  const viewAllParam = searchParams.get("view_all");
  const vParam = searchParams.get("v");
  const cParam = searchParams.get("c");

  const isViewAllOpen =
    viewAllParam === scrollKey ||
    (isTrending && (
      viewAllParam === "trending" ||
      viewAllParam === "scroll_trending" ||
      viewAllParam === "tr" ||
      vParam === "tr" ||
      vParam === "trending" ||
      vParam === "scroll_trending" ||
      cParam === "tr" ||
      cParam === "trending" ||
      cParam === "scroll_trending"
    )) ||
    (isNewlyAdded && (
      viewAllParam === "newly_added" ||
      viewAllParam === "scroll_newly_added" ||
      viewAllParam === "na" ||
      vParam === "na" ||
      vParam === "newly_added" ||
      vParam === "scroll_newly_added" ||
      cParam === "na" ||
      cParam === "newly_added" ||
      cParam === "scroll_newly_added"
    ));

  // Restore scroll position when modal opens
  useEffect(() => {
    if (isViewAllOpen) {
      // Prevent body scrolling while modal is open
      document.body.style.overflow = "hidden";
      
      const timer = setTimeout(() => {
        if (gridScrollRef.current) {
          const savedScroll = sessionStorage.getItem(`view_all_scroll_${scrollKey}`);
          if (savedScroll) {
            gridScrollRef.current.scrollTop = parseInt(savedScroll, 10);
          }
        }
      }, 100);

      return () => {
        document.body.style.overflow = "";
        clearTimeout(timer);
      };
    }
  }, [isViewAllOpen, scrollKey]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    sessionStorage.setItem(`view_all_scroll_${scrollKey}`, e.currentTarget.scrollTop.toString());
  };

  const handleCloseViewAll = () => {
    const updated = new URLSearchParams(searchParams);
    updated.delete("view_all");
    updated.delete("v");
    if (isTrending && (updated.get("c") === "tr" || updated.get("c") === "trending" || updated.get("c") === "scroll_trending")) {
      updated.delete("c");
    }
    if (isNewlyAdded && (updated.get("c") === "na" || updated.get("c") === "newly_added" || updated.get("c") === "scroll_newly_added")) {
      updated.delete("c");
    }
    setSearchParams(updated);
  };

  const getCollectionUrl = (minimize: boolean) => {
    const isTrending = scrollKey === "scroll_trending" || scrollKey === "trending";
    const isNewlyAdded = scrollKey === "scroll_newly_added" || scrollKey === "newly_added";
    if (isTrending) {
      return "https://MovizNow.com?v=tr";
    }
    if (isNewlyAdded) {
      return "https://MovizNow.com?v=na";
    }
    const base = window.location.origin + window.location.pathname;
    if (minimize) {
      const abbr = scrollKey;
      return `${base}?v=${abbr}`;
    }
    return `${base}?view_all=${scrollKey}`;
  };

  const copyToClipboard = async (minimize: boolean) => {
    const url = getCollectionUrl(minimize);
    try {
      await navigator.clipboard.writeText(url);
      if (minimize) {
        setCopiedMin(true);
        setTimeout(() => setCopiedMin(false), 2000);
      } else {
        setCopiedFull(true);
        setTimeout(() => setCopiedFull(false), 2000);
      }
    } catch (err) {
      console.error("Failed to copy url: ", err);
    }
  };

  const handleDirectShare = async () => {
    const url = getCollectionUrl(true);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedRow(true);
      setTimeout(() => setCopiedRow(false), 2000);
    } catch (err) {
      console.error("Failed to copy url: ", err);
    }
  };

  if (!items || items.length === 0) return null;

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-4 pb-2 border-b border-zinc-200/80 dark:border-zinc-800/80">
        <div className="flex items-center gap-3">
          {icon}
          <div>
            <h2 className="text-lg sm:text-xl font-extrabold tracking-tight text-zinc-900 dark:text-white">
              {title}
            </h2>
            {description && (
              <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">
                {description}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 relative">
          <button
            onClick={handleDirectShare}
            className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-900/90 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 transition-all cursor-pointer flex items-center justify-center gap-1.5 active:scale-95"
            title={t("Copy Share Link")}
          >
            {copiedRow ? (
              <>
                <Check className="w-4 h-4 text-emerald-500" />
                <span className="text-[10px] font-bold text-emerald-500 pr-1">{t("Copied!")}</span>
              </>
            ) : (
              <Share2 className="w-4 h-4" />
            )}
          </button>

          <button
            onClick={() => {
              const updated = new URLSearchParams(searchParams);
              updated.set("view_all", scrollKey);
              setSearchParams(updated);
            }}
            className="text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
          >
            {t("View All")}
          </button>
          <button
            onClick={onToggleVisibility}
            className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 transition-colors"
            title={isVisible ? `Collapse ${title}` : `Expand ${title}`}
          >
            {isVisible ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {isVisible && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="relative group pt-1">
              <ScrollableRow
                scrollKey={scrollKey}
                className="flex overflow-x-auto gap-4 pb-4 snap-x snap-mandatory flex-nowrap hide-scrollbar"
                style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
              >
                {items.slice(0, 5).map((content) => (
                  <div
                    key={content.id}
                    className="w-[140px] sm:w-[180px] shrink-0 snap-start"
                  >
                    <ContentCard
                      content={content}
                      profile={profile}
                      qualities={qualities}
                      languages={languages}
                      genres={genres}
                      onToggleFavorite={toggleFavorite}
                      onToggleWatchLater={toggleWatchLater}
                      skipLiveRatingFetch={true}
                    />
                  </div>
                ))}
                {items.length > 5 && (
                  <div className="shrink-0 flex items-center justify-center pr-4 snap-start h-full self-center">
                    <button
                      onClick={() => {
                        const updated = new URLSearchParams(searchParams);
                        updated.set("view_all", scrollKey);
                        setSearchParams(updated);
                      }}
                      className="group flex flex-col items-center gap-2 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all cursor-pointer active:scale-95"
                    >
                      <div className="w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center group-hover:bg-emerald-500/20 transition-colors">
                        <ArrowRight className="w-5 h-5 text-zinc-400 group-hover:text-emerald-500 transition-colors" />
                      </div>
                      <span className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 group-hover:text-emerald-500 uppercase tracking-wider">
                        {t("View All")}
                      </span>
                    </button>
                  </div>
                )}
              </ScrollableRow>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* View All Pop-up Modal Grid */}
      <AnimatePresence>
        {isViewAllOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="relative w-full max-w-7xl h-[90vh] bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-3xl overflow-hidden flex flex-col shadow-2xl"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-5 sm:p-6 border-b border-zinc-200/80 dark:border-zinc-800/80 shrink-0">
                <div className="flex items-center gap-3">
                  {icon}
                  <div>
                    <h2 className="text-xl font-black text-zinc-900 dark:text-white flex items-center gap-2">
                      {title}
                      <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                        {items.length} {t("items")}
                      </span>
                    </h2>
                    {description && (
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">
                        {description}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleCloseViewAll}
                    className="p-2 rounded-full bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 transition-colors cursor-pointer"
                    title={t("Close")}
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Grid content */}
              <div
                ref={gridScrollRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto p-5 sm:p-6 custom-scrollbar"
              >
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-5 pb-6">
                  {items.map((content) => (
                    <div key={content.id} className="w-full">
                      <ContentCard
                        content={content}
                        profile={profile}
                        qualities={qualities}
                        languages={languages}
                        genres={genres}
                        onToggleFavorite={toggleFavorite}
                        onToggleWatchLater={toggleWatchLater}
                        skipLiveRatingFetch={true}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
});

CollectionRow.displayName = "CollectionRow";
