import React from "react";
import { Sparkles, ChevronUp, ChevronDown, ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Collection as AppCollection, Content } from "../../types";
import { ScrollableRow } from "../ScrollableRow";
import { getOptimizedImageUrl } from "../../utils/imageUtils";
import { useHaptics } from "../../hooks/useHaptics";
import { useLanguage } from "../../contexts/LanguageContext";

interface CuratedCollectionsOverviewProps {
  collections: AppCollection[];
  contentMap: Map<string, Content>;
  defaultAppImage?: string;
  isVisible: boolean;
  onToggleVisibility: () => void;
  onSelectCollection: (col: AppCollection) => void;
  onViewAll?: () => void;
}

export const CuratedCollectionsOverview: React.FC<CuratedCollectionsOverviewProps> = React.memo(({
  collections,
  contentMap,
  defaultAppImage,
  isVisible,
  onToggleVisibility,
  onSelectCollection,
  onViewAll,
}) => {
  const { vibrate } = useHaptics();
  const { t } = useLanguage();

  if (!collections || collections.length === 0) return null;

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-4 pb-2 border-b border-zinc-200/80 dark:border-zinc-800/80">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-500 shadow-sm">
            <Sparkles className="w-5 h-5" />
          </div>
          <h2 className="text-lg sm:text-xl font-extrabold tracking-tight text-zinc-900 dark:text-white">
            {t("Curated Collections")}
          </h2>
        </div>
        <button
          onClick={onToggleVisibility}
          className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 transition-colors"
          title={isVisible ? t("Collapse Collections") : t("Expand Collections")}
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
                scrollKey="scroll_collections_overview"
                className="flex overflow-x-auto gap-4 pb-4 snap-x snap-mandatory flex-nowrap hide-scrollbar"
                style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
              >
                {collections.slice(0, 5).map((collection) => {
                  const firstContentId = collection.contentIds[0];
                  const firstContent = contentMap.get(firstContentId);
                  const posterUrl = firstContent?.posterUrl || defaultAppImage;

                  return (
                    <button
                      key={collection.id}
                      onClick={() => {
                        vibrate(50);
                        onSelectCollection(collection);
                      }}
                      className="w-[150px] h-[220px] sm:w-[190px] sm:h-[280px] shrink-0 snap-start relative transition-all duration-200 hover:-translate-y-1 active:scale-95 group shadow-md hover:shadow-xl hover:shadow-purple-500/10 rounded-2xl overflow-hidden border border-zinc-200/80 dark:border-zinc-800/80 hover:border-purple-500/50 cursor-pointer transform-gpu"
                    >
                      {posterUrl ? (
                        <div className="absolute inset-0">
                          <img
                            src={getOptimizedImageUrl(posterUrl, 342)}
                            alt={collection.title}
                            loading="lazy"
                            decoding="async"
                            className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/60 to-zinc-950/30 group-hover:via-zinc-950/40 transition-colors duration-200" />
                        </div>
                      ) : (
                        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/40 to-zinc-900" />
                      )}

                      <div className="relative z-10 p-4 h-full flex flex-col justify-end">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-purple-500/20 text-purple-300 border border-purple-500/30 w-fit mb-2 backdrop-blur-md">
                          Collection
                        </span>
                        <h3 className="text-white font-extrabold text-left drop-shadow-md line-clamp-2 text-sm sm:text-base leading-snug">
                          {collection.title}
                        </h3>
                        {collection.description && (
                          <p className="text-[10px] sm:text-xs text-zinc-300 mt-1 text-left line-clamp-2">
                            {collection.description}
                          </p>
                        )}
                      </div>
                    </button>
                  );
                })}
                {collections.length > 5 && (
                  <div className="shrink-0 flex items-center justify-center pr-4 snap-start h-full self-center">
                    <button
                      onClick={onViewAll}
                      className="group flex flex-col items-center gap-2 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 hover:border-purple-500/50 hover:bg-purple-500/5 transition-all cursor-pointer active:scale-95"
                    >
                      <div className="w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center group-hover:bg-purple-500/20 transition-colors">
                        <ArrowRight className="w-5 h-5 text-zinc-400 group-hover:text-purple-500 transition-colors" />
                      </div>
                      <span className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 group-hover:text-purple-500 uppercase tracking-wider">
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
    </div>
  );
});

CuratedCollectionsOverview.displayName = "CuratedCollectionsOverview";
