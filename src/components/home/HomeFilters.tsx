import React from "react";
import { Search, X } from "lucide-react";
import { ScrollableRow } from "../ScrollableRow";
import { Genre, Language, Quality } from "../../types";
import { useHaptics } from "../../hooks/useHaptics";
import { useLanguage } from "../../contexts/LanguageContext";

interface HomeFiltersProps {
  search: string;
  setSearch: (value: string) => void;
  searchInputRef: React.RefObject<HTMLInputElement>;
  sort: "default" | "newest" | "year" | "az";
  setSort: (val: "default" | "newest" | "year" | "az") => void;
  selectedType: string;
  setSelectedType: (val: string) => void;
  selectedGenre: string;
  setSelectedGenre: (val: string) => void;
  selectedLanguage: string;
  setSelectedLanguage: (val: string) => void;
  selectedQuality: string;
  setSelectedQuality: (val: string) => void;
  selectedYear: string;
  setSelectedYear: (val: string) => void;
  genres: Genre[];
  languages: Language[];
  qualities: Quality[];
  uniqueYears: number[];
  hasActiveFilters: boolean;
  clearFilters: () => void;
}

export const HomeFilters: React.FC<HomeFiltersProps> = React.memo(({
  search,
  setSearch,
  searchInputRef,
  sort,
  setSort,
  selectedType,
  setSelectedType,
  selectedGenre,
  setSelectedGenre,
  selectedLanguage,
  setSelectedLanguage,
  selectedQuality,
  setSelectedQuality,
  selectedYear,
  setSelectedYear,
  genres,
  languages,
  qualities,
  uniqueYears,
  hasActiveFilters,
  clearFilters,
}) => {
  const { vibrate } = useHaptics();
  const { t } = useLanguage();

  return (
    <div className="flex flex-col gap-4 mb-6">
      <div className="relative w-full">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
        <input
          ref={searchInputRef}
          type="text"
          placeholder={t("Search movies & series...")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-12 pr-12 py-3 focus:outline-none focus:border-emerald-500 text-zinc-900 dark:text-white placeholder-zinc-500 dark:placeholder-zinc-400 transition-colors duration-300"
        />
        {search && (
          <button
            onClick={() => {
              vibrate(50);
              setSearch("");
              searchInputRef.current?.focus();
            }}
            className="absolute right-4 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center border border-red-500/20 hover:bg-red-500/20 transition-colors"
            title="Clear search"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <ScrollableRow
        scrollKey="scroll_filters_container"
        className="flex gap-3 overflow-x-auto pb-2 md:pb-0 flex-nowrap relative"
      >
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="sticky left-0 z-10 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white rounded-lg px-2 py-1 text-xs flex items-center gap-1 shadow-[4px_0_8px_-4px_rgba(0,0,0,0.1)] dark:shadow-[4px_0_8px_-4px_rgba(0,0,0,0.5)]"
          >
            <X className="w-3 h-3" />
          </button>
        )}
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as any)}
          className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs font-bold text-zinc-800 dark:text-zinc-200 focus:border-emerald-500 shadow-sm cursor-pointer hover:border-emerald-500/50 transition-colors"
        >
          <option value="default">{t("Default Order")}</option>
          <option value="newest">{t("Recently Added")}</option>
          <option value="year">{t("Release Year")}</option>
          <option value="az">{t("A-Z")}</option>
        </select>

        <select
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value)}
          className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs font-bold text-zinc-800 dark:text-zinc-200 focus:border-emerald-500 shadow-sm cursor-pointer hover:border-emerald-500/50 transition-colors"
        >
          <option value="">{t("Types")}</option>
          <option value="movie">{t("Movies")}</option>
          <option value="series">{t("Series")}</option>
        </select>

        <select
          value={selectedGenre}
          onChange={(e) => setSelectedGenre(e.target.value)}
          className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs font-bold text-zinc-800 dark:text-zinc-200 focus:border-emerald-500 shadow-sm cursor-pointer hover:border-emerald-500/50 transition-colors"
        >
          <option value="">{t("Genres")}</option>
          {genres.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>

        <select
          value={selectedLanguage}
          onChange={(e) => setSelectedLanguage(e.target.value)}
          className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs font-bold text-zinc-800 dark:text-zinc-200 focus:border-emerald-500 shadow-sm cursor-pointer hover:border-emerald-500/50 transition-colors"
        >
          <option value="">{t("Langs")}</option>
          {languages.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>

        <select
          value={selectedQuality}
          onChange={(e) => setSelectedQuality(e.target.value)}
          className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs font-bold text-zinc-800 dark:text-zinc-200 focus:border-emerald-500 shadow-sm cursor-pointer hover:border-emerald-500/50 transition-colors"
        >
          <option value="">{t("Quals")}</option>
          {qualities.map((q) => (
            <option key={q.id} value={q.id}>
              {q.name}
            </option>
          ))}
        </select>

        <select
          value={selectedYear}
          onChange={(e) => setSelectedYear(e.target.value)}
          className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs font-bold text-zinc-800 dark:text-zinc-200 focus:border-emerald-500 shadow-sm cursor-pointer hover:border-emerald-500/50 transition-colors"
        >
          <option value="">{t("Years")}</option>
          {uniqueYears.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </ScrollableRow>
    </div>
  );
});

HomeFilters.displayName = "HomeFilters";
