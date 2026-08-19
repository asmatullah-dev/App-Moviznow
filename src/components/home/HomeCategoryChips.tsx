import React from "react";
import { Compass, Film, Tv, SlidersHorizontal } from "lucide-react";
import { clsx } from "clsx";
import { useHaptics } from "../../hooks/useHaptics";
import { useLanguage } from "../../contexts/LanguageContext";

interface HomeCategoryChipsProps {
  selectedType: string;
  setSelectedType: (type: string) => void;
  hasActiveFilters: boolean;
  showCatalogFilters: boolean;
  setShowCatalogFilters: (show: boolean | ((prev: boolean) => boolean)) => void;
  onClearFilters: () => void;
  onSelectCategory: (type: string) => void;
}

export const HomeCategoryChips: React.FC<HomeCategoryChipsProps> = React.memo(({
  selectedType,
  hasActiveFilters,
  showCatalogFilters,
  setShowCatalogFilters,
  onClearFilters,
  onSelectCategory,
}) => {
  const { vibrate } = useHaptics();
  const { t } = useLanguage();

  return (
    <div className="flex items-center gap-2 overflow-x-auto p-1.5 mb-8 bg-white/90 dark:bg-zinc-950/90 backdrop-blur-xl border border-zinc-200/80 dark:border-zinc-800/80 rounded-2xl shadow-lg hide-scrollbar">
      <button
        onClick={() => {
          vibrate(30);
          onClearFilters();
        }}
        className={clsx(
          "px-4 py-2 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all active:scale-95 flex items-center gap-2 border",
          selectedType === "" && !hasActiveFilters
            ? "bg-gradient-to-r from-emerald-500 to-teal-500 text-white border-transparent shadow-lg shadow-emerald-500/20"
            : "bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700"
        )}
      >
        <Compass className="w-4 h-4" />
        <span>{t("All Catalog")}</span>
      </button>

      <button
        onClick={() => {
          vibrate(30);
          onSelectCategory("movie");
        }}
        className={clsx(
          "px-4 py-2 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all active:scale-95 flex items-center gap-2 border",
          selectedType === "movie"
            ? "bg-gradient-to-r from-emerald-500 to-teal-500 text-white border-transparent shadow-lg shadow-emerald-500/20"
            : "bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700"
        )}
      >
        <Film className="w-4 h-4" />
        <span>{t("Movies")}</span>
      </button>

      <button
        onClick={() => {
          vibrate(30);
          onSelectCategory("series");
        }}
        className={clsx(
          "px-4 py-2 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all active:scale-95 flex items-center gap-2 border",
          selectedType === "series"
            ? "bg-gradient-to-r from-emerald-500 to-teal-500 text-white border-transparent shadow-lg shadow-emerald-500/20"
            : "bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700"
        )}
      >
        <Tv className="w-4 h-4" />
        <span>{t("Series")}</span>
      </button>

      <button
        onClick={() => setShowCatalogFilters((prev) => !prev)}
        className={clsx(
          "px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all active:scale-95 flex items-center gap-2 border ml-auto",
          hasActiveFilters || showCatalogFilters
            ? "bg-amber-500/10 text-amber-500 border-amber-500/30"
            : "bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800"
        )}
      >
        <SlidersHorizontal className="w-4 h-4" />
        <span>{t("Filters")}</span>
        {hasActiveFilters && (
          <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
        )}
      </button>
    </div>
  );
});

HomeCategoryChips.displayName = "HomeCategoryChips";
