import React from "react";
import { X, FolderOpen } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Collection as AppCollection, Content } from "../../types";
import { useLanguage } from "../../contexts/LanguageContext";
import { getOptimizedImageUrl } from "../../utils/imageUtils";

interface CollectionsGridModalProps {
  isOpen: boolean;
  onClose: () => void;
  collections: AppCollection[];
  contentMap: Map<string, Content>;
  defaultAppImage?: string;
  onSelectCollection: (col: AppCollection) => void;
}

export const CollectionsGridModal: React.FC<CollectionsGridModalProps> = ({
  isOpen,
  onClose,
  collections,
  contentMap,
  defaultAppImage,
  onSelectCollection,
}) => {
  const { t } = useLanguage();

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-3xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl"
          >
            <div className="flex items-center justify-between p-6 border-b border-zinc-100 dark:border-zinc-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                  <FolderOpen className="w-5 h-5 text-purple-500" />
                </div>
                <div>
                  <h2 className="text-xl font-black text-zinc-900 dark:text-white uppercase tracking-tight">
                    {t("All Collections")}
                  </h2>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 font-bold uppercase tracking-wider">
                    {collections.length} {t("Collections Found")}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-full bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 transition-colors cursor-pointer"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 pb-6">
                {collections.map((collection) => {
                  const firstContentId = collection.contentIds[0];
                  const firstContent = contentMap.get(firstContentId);
                  const posterUrl = firstContent?.posterUrl || defaultAppImage;
                  return (
                    <button
                      key={collection.id}
                      onClick={() => {
                        onSelectCollection(collection);
                        onClose();
                      }}
                      className="group relative aspect-[16/9] rounded-2xl overflow-hidden bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-purple-500/50 transition-all active:scale-[0.98] shadow-sm hover:shadow-xl hover:shadow-purple-500/10"
                    >
                      {posterUrl ? (
                        <div className="absolute inset-0">
                          <img
                            src={getOptimizedImageUrl(posterUrl, 500)}
                            alt={collection.title}
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/40 to-transparent opacity-80 group-hover:opacity-90 transition-opacity" />
                        </div>
                      ) : (
                        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/40 to-zinc-900" />
                      )}

                      <div className="relative z-10 p-5 h-full flex flex-col justify-end">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-purple-500/20 text-purple-300 border border-purple-500/30 w-fit mb-2 backdrop-blur-md">
                          Collection
                        </span>
                        <h3 className="text-white font-extrabold text-left text-lg line-clamp-1 drop-shadow-md">
                          {collection.title}
                        </h3>
                        {collection.description && (
                          <p className="text-xs text-zinc-300 mt-1 text-left line-clamp-2 font-medium opacity-80">
                            {collection.description}
                          </p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
