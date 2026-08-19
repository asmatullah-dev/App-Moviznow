import React from "react";
import { Clock, ChevronUp, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Content, Genre, Language, Quality } from "../../types";
import ContentCard from "../ContentCard";
import { ScrollableRow } from "../ScrollableRow";
import { useLanguage } from "../../contexts/LanguageContext";

interface RecentlyViewedSectionProps {
  recentlyViewed: Content[];
  isVisible: boolean;
  onToggleVisibility: () => void;
  limit?: number;
  profile: any;
  qualities: Quality[];
  languages: Language[];
  genres: Genre[];
  toggleFavorite: (id: string) => void;
  toggleWatchLater: (id: string) => void;
}

export const RecentlyViewedSection: React.FC<RecentlyViewedSectionProps> = React.memo(({
  recentlyViewed,
  isVisible,
  onToggleVisibility,
  limit = 10,
  profile,
  qualities,
  languages,
  genres,
  toggleFavorite,
  toggleWatchLater,
}) => {
  const { t } = useLanguage();

  if (!recentlyViewed || recentlyViewed.length === 0) return null;

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-4 pb-2 border-b border-zinc-200/80 dark:border-zinc-800/80">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-500 shadow-sm">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-extrabold tracking-tight text-zinc-900 dark:text-white">
              {t("Recently Viewed")}
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">
              {t("Continue where you left off")}
            </p>
          </div>
        </div>
        <button
          onClick={onToggleVisibility}
          className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 transition-colors"
          title={isVisible ? t("Collapse Recently Viewed") : t("Expand Recently Viewed")}
        >
          {isVisible ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </button>
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
                scrollKey="scroll_recently_viewed"
                className="flex overflow-x-auto gap-4 pb-4 snap-x snap-mandatory flex-nowrap hide-scrollbar"
                style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
              >
                {recentlyViewed.slice(0, limit).map((content) => (
                  <div
                    key={content.id}
                    className="w-[110px] sm:w-[140px] shrink-0 snap-start"
                  >
                    <ContentCard
                      content={content}
                      profile={profile}
                      qualities={qualities}
                      languages={languages}
                      genres={genres}
                      onToggleFavorite={toggleFavorite}
                      onToggleWatchLater={toggleWatchLater}
                      isSmall={true}
                      skipLiveRatingFetch={true}
                    />
                  </div>
                ))}
              </ScrollableRow>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

RecentlyViewedSection.displayName = "RecentlyViewedSection";
