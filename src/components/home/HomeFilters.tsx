import React, { useState } from "react";
import { Search, X, SlidersHorizontal, Sparkles, Film, Tv } from "lucide-react";
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
  selectedOttPlatform?: string;
  setSelectedOttPlatform?: (val: string) => void;
  selectedResolution?: string;
  setSelectedResolution?: (val: string) => void;
  genres: Genre[];
  languages: Language[];
  qualities: Quality[];
  uniqueYears: number[];
  hasActiveFilters: boolean;
  clearFilters: () => void;
}

const POPULAR_OTTS = [
  "Netflix",
  "Prime Video",
  "Disney+ Hotstar",
  "JioCinema",
  "SonyLIV",
  "Zee5",
  "Apple TV+",
  "HBO Max",
  "Hulu",
  "Paramount+",
  "Peacock",
];

const RESOLUTION_TAGS = ["4K UHD", "1080p", "720p", "480p"];

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
  selectedOttPlatform = "",
  setSelectedOttPlatform,
  selectedResolution = "",
  setSelectedResolution,
  genres,
  languages,
  qualities,
  uniqueYears,
  hasActiveFilters,
  clearFilters,
}) => {
  const { vibrate } = useHaptics();
  const { t } = useLanguage();
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);

  return (
    <div className="flex flex-col gap-3 mb-6">
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
        className="flex gap-2.5 overflow-x-auto pb-1 md:pb-0 flex-nowrap relative items-center"
      >
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="sticky left-0 z-10 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 rounded-xl px-2.5 py-2 text-xs font-bold flex items-center gap-1 shadow-sm transition-colors whitespace-nowrap"
            title="Clear All Filters"
          >
            <X className="w-3.5 h-3.5" />
            <span>Clear</span>
          </button>
        )}

        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-colors shadow-sm whitespace-nowrap ${
            showAdvanced || selectedOttPlatform || selectedResolution
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-500"
              : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:border-emerald-500/50"
          }`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <span>Advanced Filters</span>
          {(selectedOttPlatform || selectedResolution) && (
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          )}
        </button>

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

        {setSelectedOttPlatform && (
          <select
            value={selectedOttPlatform}
            onChange={(e) => {
              vibrate(20);
              setSelectedOttPlatform(e.target.value);
            }}
            className={`border rounded-xl px-3 py-2 text-xs font-bold shadow-sm cursor-pointer transition-colors ${
              selectedOttPlatform
                ? "bg-emerald-500/10 border-emerald-500 text-emerald-600 dark:text-emerald-400"
                : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200 focus:border-emerald-500 hover:border-emerald-500/50"
            }`}
          >
            <option value="">{t("OTT (All)")}</option>
            {POPULAR_OTTS.map((ott) => (
              <option key={ott} value={ott}>
                {ott}
              </option>
            ))}
          </select>
        )}

        {setSelectedResolution && (
          <select
            value={selectedResolution}
            onChange={(e) => {
              vibrate(20);
              setSelectedResolution(e.target.value);
            }}
            className={`border rounded-xl px-3 py-2 text-xs font-bold shadow-sm cursor-pointer transition-colors ${
              selectedResolution
                ? "bg-cyan-500/10 border-cyan-500 text-cyan-600 dark:text-cyan-400"
                : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200 focus:border-cyan-500 hover:border-cyan-500/50"
            }`}
          >
            <option value="">{t("Resolution (Any)")}</option>
            {RESOLUTION_TAGS.map((res) => (
              <option key={res} value={res}>
                {res}
              </option>
            ))}
          </select>
        )}
      </ScrollableRow>

      {/* Advanced Filter Expansion (OTT Platforms & Resolutions) */}
      {showAdvanced && (
        <div className="bg-zinc-100 dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-800/80 rounded-xl p-3 space-y-3 shadow-inner">
          {/* OTT Platforms */}
          {setSelectedOttPlatform && (
            <div>
              <span className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider block mb-1.5">
                OTT Platforms
              </span>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => {
                    vibrate(20);
                    setSelectedOttPlatform("");
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all shadow-sm ${
                    !selectedOttPlatform
                      ? "bg-emerald-500 text-white shadow-emerald-500/20"
                      : "bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700/60 hover:border-emerald-500/40"
                  }`}
                >
                  All
                </button>
                {POPULAR_OTTS.map((ott) => {
                  const isSelected = selectedOttPlatform.toLowerCase() === ott.toLowerCase();
                  return (
                    <button
                      key={ott}
                      onClick={() => {
                        vibrate(20);
                        setSelectedOttPlatform(isSelected ? "" : ott);
                      }}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all shadow-sm ${
                        isSelected
                          ? "bg-emerald-500 text-white shadow-emerald-500/20"
                          : "bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700/60 hover:border-emerald-500/40"
                      }`}
                    >
                      {ott}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Resolutions */}
          {setSelectedResolution && (
            <div>
              <span className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider block mb-1.5">
                Print Resolution
              </span>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => {
                    vibrate(20);
                    setSelectedResolution("");
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all shadow-sm ${
                    !selectedResolution
                      ? "bg-cyan-500 text-white shadow-cyan-500/20"
                      : "bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700/60 hover:border-cyan-500/40"
                  }`}
                >
                  Any
                </button>
                {RESOLUTION_TAGS.map((res) => {
                  const isSelected = selectedResolution.toLowerCase() === res.toLowerCase();
                  return (
                    <button
                      key={res}
                      onClick={() => {
                        vibrate(20);
                        setSelectedResolution(isSelected ? "" : res);
                      }}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all shadow-sm ${
                        isSelected
                          ? "bg-cyan-500 text-white shadow-cyan-500/20"
                          : "bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700/60 hover:border-cyan-500/40"
                      }`}
                    >
                      {res}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

HomeFilters.displayName = "HomeFilters";

