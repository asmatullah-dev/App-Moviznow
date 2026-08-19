import React from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
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
        <button
          onClick={onToggleVisibility}
          className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 transition-colors"
          title={isVisible ? `Collapse ${title}` : `Expand ${title}`}
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
                scrollKey={scrollKey}
                className="flex overflow-x-auto gap-4 pb-4 snap-x snap-mandatory flex-nowrap hide-scrollbar"
                style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
              >
                {items.map((content) => (
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
              </ScrollableRow>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

CollectionRow.displayName = "CollectionRow";
