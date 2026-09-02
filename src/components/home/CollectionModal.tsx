import React, { useMemo, useState } from "react";
import { X, Film, Share2, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Collection as AppCollection, Content, Genre, Language, Quality } from "../../types";
import ContentCard from "../ContentCard";
import { useLanguage } from "../../contexts/LanguageContext";

interface CollectionModalProps {
  collection: AppCollection | null;
  onClose: () => void;
  collectionSort: "default" | "newest" | "az";
  setCollectionSort: (sort: "default" | "newest" | "az") => void;
  scrollRef: React.RefObject<HTMLDivElement>;
  contentMap: Map<string, Content>;
  canPlayMap: Map<string, boolean>;
  profile: any;
  qualities: Quality[];
  languages: Language[];
  genres: Genre[];
  toggleFavorite: (id: string) => void;
  toggleWatchLater: (id: string) => void;
}

export const CollectionModal: React.FC<CollectionModalProps> = React.memo(({
  collection,
  onClose,
  collectionSort,
  setCollectionSort,
  scrollRef,
  contentMap,
  canPlayMap,
  profile,
  qualities,
  languages,
  genres,
  toggleFavorite,
  toggleWatchLater,
}) => {
  const { t } = useLanguage();
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    if (!collection) return;
    const url = `https://MovizNow.com?c=${collection.id}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy collection link: ", err);
    }
  };

  const sortedItems = useMemo(() => {
    if (!collection) return [];

    let items = collection.contentIds
      .map((id) => contentMap.get(id))
      .filter((c): c is Content => Boolean(c && c.status !== "draft"));

    if (collectionSort === "newest") {
      items.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    } else if (collectionSort === "az") {
      items.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
    }

    // Always show accessible content first
    items.sort((a, b) => {
      const aCanPlay = canPlayMap.get(a.id) ? 1 : 0;
      const bCanPlay = canPlayMap.get(b.id) ? 1 : 0;
      return bCanPlay - aCanPlay;
    });

    return items;
  }, [collection, contentMap, collectionSort, canPlayMap]);

  return (
    <AnimatePresence>
      {collection && (
        <motion.div
          key="collection-modal"
          initial={{ opacity: 0, y: "100%" }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: "100%" }}
          transition={{ type: "spring", damping: 28, stiffness: 250 }}
          className="fixed inset-0 z-[100] bg-white dark:bg-zinc-950 flex flex-col overflow-hidden"
        >
          <div className="shrink-0 z-50 flex items-center justify-between gap-3 p-3.5 sm:p-5 bg-white dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 shadow-md">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <span className="w-1.5 h-6 bg-emerald-500 rounded-full shrink-0" />
              <div className="min-w-0 flex-1">
                <h2 className="text-base sm:text-xl font-bold text-zinc-900 dark:text-white truncate">
                  {collection.title}
                </h2>
                {collection.description && (
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 truncate italic">
                    {collection.description}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <select
                value={collectionSort}
                onChange={(e) => setCollectionSort(e.target.value as any)}
                className="bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs font-semibold focus:border-emerald-500 outline-none cursor-pointer"
              >
                <option value="default">{t("Default Order")}</option>
                <option value="newest">{t("Newest First")}</option>
                <option value="az">{t("A-Z")}</option>
              </select>
              <button
                onClick={handleShare}
                className="p-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg text-zinc-600 dark:text-zinc-300 transition-all flex items-center justify-center gap-1.5 active:scale-95 border border-zinc-200 dark:border-zinc-700 text-xs font-semibold cursor-pointer h-[32px]"
                title={t("Share Collection")}
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                    <span className="text-emerald-500 hidden sm:inline">{t("Copied!")}</span>
                  </>
                ) : (
                  <>
                    <Share2 className="w-3.5 h-3.5 text-zinc-400" />
                    <span className="hidden sm:inline">{t("Share")}</span>
                  </>
                )}
              </button>
              <button
                onClick={onClose}
                className="p-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-full text-zinc-500 dark:text-zinc-300 transition-colors cursor-pointer"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
          <div ref={scrollRef} className="flex-1 overflow-y-auto max-w-7xl w-full mx-auto p-4 md:p-8">
            {sortedItems.length === 0 ? (
              <div className="text-center py-20 text-zinc-500">
                <Film className="w-16 h-16 mx-auto mb-4 opacity-20" />
                <p className="text-xl">{t("No content in this collection")}</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-6">
                {sortedItems.map((content) => (
                  <ContentCard
                    key={`modal-${content.id}`}
                    content={content}
                    profile={profile}
                    qualities={qualities}
                    languages={languages}
                    genres={genres}
                    onToggleFavorite={toggleFavorite}
                    onToggleWatchLater={toggleWatchLater}
                    skipLiveRatingFetch={true}
                  />
                ))}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});

CollectionModal.displayName = "CollectionModal";
