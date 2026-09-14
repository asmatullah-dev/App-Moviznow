import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Play,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Film,
  Tv,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Trash2,
  Plus,
  RefreshCw,
  Sparkles,
  Layers,
  ArrowRight,
  Database,
  Check
} from 'lucide-react';
import { useModalBehavior } from '../hooks/useModalBehavior';
import { useHaptics } from '../hooks/useHaptics';
import { useAdminContent } from '../contexts/AdminContentContext';
import { Content, Genre, Language, Quality, QualityLinks } from '../types';
import { searchTMDBByTitle, fetchTMDBDetails, fetchSeriesSeasons } from './MediaModal';
import { checkContentViaLinkChecker, ScrapedLinkItem } from './LinkCheckerModal';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  genres: Genre[];
  languages: Language[];
  qualities: Quality[];
}

export interface BatchItem {
  id: string;
  rawInput: string;
  cleanTitle: string;
  year?: number;
  type: 'movie' | 'series';
  status: 'idle' | 'searching_tmdb' | 'checking' | 'completed' | 'partial' | 'failed';
  currentProvider?: string;
  logs: string[];
  tmdbData?: any;
  discoveredLinks: ScrapedLinkItem[];
  qualityLinks?: QualityLinks;
  sampleLink?: ScrapedLinkItem;
  has480p: boolean;
  has720p: boolean;
  has720pHevc: boolean;
  has1080p: boolean;
  isComplete: boolean;
  imported: boolean;
}

export const BulkContentImporterModal: React.FC<Props> = ({
  isOpen,
  onClose,
  genres,
  languages,
  qualities,
}) => {
  const { saveContent, contentList } = useAdminContent();
  const { vibrate } = useHaptics();

  const [inputLines, setInputLines] = useState<string>('');
  const [queue, setQueue] = useState<BatchItem[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [autoImportWhenComplete, setAutoImportWhenComplete] = useState<boolean>(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  useModalBehavior(isOpen, () => {
    if (!isProcessing) onClose();
  });

  const parseRawTitleAndYear = (text: string): { title: string; year?: number } => {
    let t = text.trim();
    if (!t) return { title: '' };

    // Strip out common release junk tags
    t = t.replace(/\b(480p|720p|1080p|2160p|4k|uhd|hdrip|webrip|web-dl|bluray|brrip|dvdrip|x264|x265|hevc|10bit|aac|esub|cam|predvd|pre-dvd|hdcam|telesync|dual audio|hindi|english|telugu|tamil|malayalam|kannada)\b/gi, ' ');

    let year: number | undefined = undefined;
    // 1. Check for year in parentheses or brackets e.g. (2024) or [2024]
    const bracketMatch = t.match(/[\(\[]\s*(19\d\d|20[0-2]\d)\s*[\)\]]/);
    if (bracketMatch) {
      year = parseInt(bracketMatch[1], 10);
      t = t.replace(bracketMatch[0], ' ');
    } else {
      // 2. Check for trailing year at the very end e.g. "Deadpool 2024"
      const trailingMatch = t.match(/\b(19\d\d|20[0-2]\d)\b$/);
      if (trailingMatch) {
        year = parseInt(trailingMatch[1], 10);
        t = t.substring(0, trailingMatch.index).trim();
      } else {
        // 3. Any 4-digit year inside that isn't the whole title
        const anyYear = t.match(/\b(19\d\d|20[0-2]\d)\b/);
        if (anyYear && t.trim() !== anyYear[1]) {
          year = parseInt(anyYear[1], 10);
          t = t.replace(anyYear[0], ' ');
        }
      }
    }

    t = t.replace(/[()\[\]{}_.-]+/g, ' ').replace(/\s+/g, ' ').trim();
    return { title: t || text.trim(), year };
  };

  const handleCreateQueue = () => {
    const lines = inputLines
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length === 0) return;

    const newItems: BatchItem[] = lines.map((line, idx) => {
      const { title, year } = parseRawTitleAndYear(line);
      return {
        id: `batch-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 5)}`,
        rawInput: line,
        cleanTitle: title,
        year,
        type: 'movie',
        status: 'idle',
        logs: [],
        discoveredLinks: [],
        has480p: false,
        has720p: false,
        has720pHevc: false,
        has1080p: false,
        isComplete: false,
        imported: false,
      };
    });

    setQueue((prev) => [...prev, ...newItems]);
    setInputLines('');
    vibrate(30);
  };

  const checkQualitiesSatisfaction = (links: ScrapedLinkItem[]) => {
    let has480p = false;
    let has720p = false;
    let has720pHevc = false;
    let has1080p = false;
    let is720pLarge = false;

    for (const l of links) {
      const txt = `${l.label} ${l.rawQuality || ''} ${l.url}`.toLowerCase();
      const isHevc = l.isHevc || txt.includes('hevc') || txt.includes('x265') || txt.includes('10bit') || txt.includes('h.265');
      const bytes = l.bytes || 0;

      if (l.quality === '480p' || txt.includes('480p') || txt.includes('360p')) {
        has480p = true;
      }
      if (l.quality === '720p' || txt.includes('720p')) {
        has720p = true;
        if (isHevc) has720pHevc = true;
        if (bytes > 1.45 * 1024 * 1024 * 1024 || (l.size && parseFloat(l.size) > 1.45 && l.size.toLowerCase().includes('gb'))) {
          is720pLarge = true;
        }
      }
      if (l.quality === '1080p' || l.quality === '2160p' || txt.includes('1080p') || txt.includes('2160p') || txt.includes('4k')) {
        has1080p = true;
      }
    }

    const hevcSatisfied = is720pLarge ? has720pHevc : true;
    const isComplete = has480p && has720p && has1080p && hevcSatisfied;

    return { has480p, has720p, has720pHevc, has1080p, isComplete };
  };

  const processSingleItem = async (item: BatchItem, signal: AbortSignal) => {
    const updateItem = (updates: Partial<BatchItem>) => {
      setQueue((prev) => prev.map((it) => (it.id === item.id ? { ...it, ...updates } : it)));
    };

    updateItem({ status: 'searching_tmdb', logs: ['Searching TMDB for metadata...'] });

    let tmdb: any = null;
    let detectedType: 'movie' | 'series' = 'movie';
    try {
      let tmdbResults = await searchTMDBByTitle(item.cleanTitle, item.year ? item.year.toString() : '');
      if (!tmdbResults || tmdbResults.length === 0) {
        tmdbResults = await searchTMDBByTitle(item.cleanTitle, '');
      }
      if ((!tmdbResults || tmdbResults.length === 0) && item.cleanTitle.includes(':')) {
        tmdbResults = await searchTMDBByTitle(item.cleanTitle.split(':')[0].trim(), '');
      }

      if (tmdbResults && tmdbResults.length > 0) {
        const top = tmdbResults[0].item;
        const details = await fetchTMDBDetails(top.id, top.media_type || 'movie');
        tmdb = details || top;
        detectedType = (top.media_type === 'tv' || tmdb.number_of_seasons) ? 'series' : 'movie';
        updateItem({
          tmdbData: tmdb,
          type: detectedType,
          logs: [`Found TMDB: ${tmdb.title || tmdb.name} (${(tmdb.release_date || tmdb.first_air_date || '').split('-')[0]})`],
        });
      } else {
        updateItem({ logs: ['TMDB: No match, using title as-is'] });
      }
    } catch (e) {
      updateItem({ logs: ['TMDB search skipped/failed'] });
    }

    updateItem({ status: 'checking', logs: ['Running LinkChecker background engine...'] });

    try {
      const checkRes = await checkContentViaLinkChecker({
        title: item.cleanTitle,
        year: item.year,
        type: detectedType,
        languages,
        qualities,
        signal,
        onProgress: (msg) => {
          updateItem({ logs: [msg] });
        },
      });

      if (signal.aborted) return;

      const links = checkRes.links;
      const satisfaction = checkQualitiesSatisfaction(links);
      const isComplete = satisfaction.isComplete;
      const finalStatus = links.length === 0 ? 'failed' : isComplete ? 'completed' : 'partial';

      updateItem({
        status: finalStatus,
        discoveredLinks: links,
        qualityLinks: checkRes.qualityLinks,
        sampleLink: checkRes.sample,
        has480p: satisfaction.has480p,
        has720p: satisfaction.has720p,
        has720pHevc: satisfaction.has720pHevc,
        has1080p: satisfaction.has1080p,
        isComplete: isComplete,
        logs: [
          `LinkChecker discovered and verified ${links.length} links.`,
          `Qualities: [480p: ${satisfaction.has480p ? '✓' : '✗'}, 720p: ${satisfaction.has720p ? '✓' : '✗'}, HEVC: ${satisfaction.has720pHevc ? '✓' : '✗'}, 1080p: ${satisfaction.has1080p ? '✓' : '✗'}]`,
          finalStatus === 'completed'
            ? 'Complete: All qualities found and verified!'
            : finalStatus === 'partial'
            ? `Partial: ${links.length} verified links found.`
            : 'Failed: No verified links found.',
        ],
      });

      if (autoImportWhenComplete && links.length > 0) {
        await importSingleItem({
          ...item,
          tmdbData: tmdb,
          type: detectedType,
          discoveredLinks: links,
          qualityLinks: checkRes.qualityLinks,
          sampleLink: checkRes.sample,
        });
      }
    } catch (err: any) {
      updateItem({
        status: 'failed',
        logs: [`LinkChecker background error: ${err.message || 'Error'}`],
      });
    }
  };

  const handleStartBatch = async () => {
    if (queue.length === 0 || isProcessing) return;
    setIsProcessing(true);
    vibrate(50);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    for (const item of queue) {
      if (item.status === 'completed' || item.imported) continue;
      if (controller.signal.aborted) break;
      await processSingleItem(item, controller.signal);
    }

    setIsProcessing(false);
  };

  const handleStopBatch = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsProcessing(false);
    vibrate(30);
  };

  const importSingleItem = async (item: BatchItem) => {
    if (item.imported || item.discoveredLinks.length === 0) return;

    try {
      const tmdb = item.tmdbData;
      const title = tmdb?.title || tmdb?.name || item.cleanTitle;
      const releaseDate = tmdb?.release_date || tmdb?.first_air_date || '';
      const year = releaseDate ? parseInt(releaseDate.split('-')[0], 10) : item.year || new Date().getFullYear();

      // Find primary genre
      let genreId = genres.length > 0 ? genres[0].id : '';
      if (tmdb?.genres && tmdb.genres.length > 0) {
        const found = genres.find((g) => g.name.toLowerCase() === tmdb.genres[0].name.toLowerCase());
        if (found) genreId = found.id;
      }

      // Quality ID
      const qualityId = qualities.length > 0 ? qualities[0].id : '';

      // Format movieLinks JSON from qualityLinks or discoveredLinks
      let finalLinksPayload = item.qualityLinks || item.discoveredLinks.map((d) => ({
        id: d.id,
        name: d.label,
        url: d.url,
        size: d.size ? d.size.replace(/MB|GB/i, '').trim() : '',
        unit: d.size && d.size.toLowerCase().includes('gb') ? 'GB' : 'MB',
        season: d.season,
        episode: d.episode,
        isFullSeasonMKV: d.isFullSeasonMKV,
        isFullSeasonZIP: d.isFullSeasonZIP,
        isSample: d.isSample,
      }));

      const newContent: Content = {
        id: `imported-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        title,
        description: tmdb?.overview || '',
        posterUrl: tmdb?.poster_path ? `https://image.tmdb.org/t/p/w500${tmdb.poster_path}` : '',
        trailerUrl: '',
        genreIds: genreId ? [genreId] : [],
        languageIds: languages.length > 0 ? [languages[0].id] : [],
        qualityId,
        year,
        cast: [],
        type: item.type,
        movieLinks: JSON.stringify(finalLinksPayload),
        sampleUrl: item.sampleLink ? item.sampleLink.url : undefined,
        status: 'published',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await saveContent(newContent);

      setQueue((prev) =>
        prev.map((it) => (it.id === item.id ? { ...it, imported: true } : it))
      );
      vibrate(40);
    } catch (err) {
      console.error('Failed to auto-import content item:', err);
    }
  };

  const handleImportAllReady = async () => {
    const readyItems = queue.filter((it) => !it.imported && it.discoveredLinks.length > 0);
    for (const item of readyItems) {
      await importSingleItem(item);
    }
    vibrate([50, 50, 50]);
  };

  if (!isOpen) return null;

  const totalInQueue = queue.length;
  const completedCount = queue.filter((i) => i.status === 'completed').length;
  const partialCount = queue.filter((i) => i.status === 'partial').length;
  const failedCount = queue.filter((i) => i.status === 'failed').length;
  const importedCount = queue.filter((i) => i.imported).length;
  const readyToImportCount = queue.filter((i) => !i.imported && i.discoveredLinks.length > 0).length;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-md p-3 sm:p-6 overflow-hidden">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="relative w-full max-w-5xl h-[92vh] max-h-[900px] bg-zinc-900 border border-zinc-800 rounded-2xl flex flex-col shadow-2xl overflow-hidden text-zinc-100"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-950/70">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-tr from-cyan-500/20 to-emerald-500/20 border border-cyan-500/30 text-cyan-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Bulk Content Importer
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  Powered by LinkChecker Engine
                </span>
              </h2>
              <p className="text-xs text-zinc-400">
                Paste movie or series titles. Runs multi-provider search & deep link verification in background.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Layout */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
          {/* Left Column: Input Form & Settings */}
          <div className="lg:col-span-4 p-5 border-r border-zinc-800/80 flex flex-col gap-4 bg-zinc-950/40 overflow-y-auto">
            <div>
              <label className="block text-xs font-bold text-zinc-300 mb-1.5 uppercase tracking-wider">
                Paste Titles (One Per Line)
              </label>
              <textarea
                value={inputLines}
                onChange={(e) => setInputLines(e.target.value)}
                placeholder="Deadpool & Wolverine (2024)&#10;Pushpa 2 The Rule (2024)&#10;Stranger Things Season 4&#10;Kalki 2898 AD (2024)"
                rows={7}
                className="w-full bg-zinc-900 border border-zinc-700/80 rounded-xl p-3 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500 transition-all font-mono resize-none shadow-inner"
              />
            </div>

            <button
              onClick={handleCreateQueue}
              disabled={!inputLines.trim()}
              className="flex items-center justify-center gap-2 w-full py-2.5 px-4 bg-gradient-to-r from-cyan-600 to-emerald-600 hover:from-cyan-500 hover:to-emerald-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition-all shadow-md active:scale-98"
            >
              <Plus className="w-4 h-4" /> Add Titles to Queue
            </button>

            {/* Auto-Import Toggle */}
            <div className="p-3.5 rounded-xl bg-zinc-900/90 border border-zinc-800 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-white block">Auto-Import When Complete</span>
                <span className="text-[11px] text-zinc-400 block">
                  Automatically saves items to library when verified
                </span>
              </div>
              <input
                type="checkbox"
                checked={autoImportWhenComplete}
                onChange={(e) => setAutoImportWhenComplete(e.target.checked)}
                className="w-4 h-4 accent-emerald-500 cursor-pointer rounded"
              />
            </div>

            {/* Batch Action Controls */}
            <div className="mt-auto pt-2 space-y-2">
              <div className="flex items-center gap-2">
                {isProcessing ? (
                  <button
                    onClick={handleStopBatch}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 bg-red-600/20 text-red-400 border border-red-500/30 hover:bg-red-600/30 font-bold rounded-xl text-xs transition-all"
                  >
                    <Loader2 className="w-4 h-4 animate-spin" /> Stop Import Process
                  </button>
                ) : (
                  <button
                    onClick={handleStartBatch}
                    disabled={queue.length === 0 || queue.every((i) => i.status === 'completed' || i.imported)}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition-all shadow-md active:scale-98"
                  >
                    <Play className="w-4 h-4 fill-white" /> Start Background Check
                  </button>
                )}
              </div>

              {readyToImportCount > 0 && (
                <button
                  onClick={handleImportAllReady}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-xl text-xs transition-all shadow-md"
                >
                  <Database className="w-4 h-4" /> Import All Verified ({readyToImportCount})
                </button>
              )}

              {queue.length > 0 && (
                <button
                  onClick={() => setQueue([])}
                  disabled={isProcessing}
                  className="w-full py-1.5 text-zinc-500 hover:text-red-400 text-xs font-semibold transition-colors"
                >
                  Clear Queue
                </button>
              )}
            </div>
          </div>

          {/* Right Column: Queue Items List */}
          <div className="lg:col-span-8 p-5 overflow-y-auto space-y-3 bg-zinc-900/60 flex flex-col">
            {/* Stats Header Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-zinc-800 text-xs text-zinc-400">
              <div className="flex items-center gap-3">
                <span>Total: <strong className="text-white">{totalInQueue}</strong></span>
                <span>Complete: <strong className="text-emerald-400">{completedCount}</strong></span>
                <span>Partial: <strong className="text-amber-400">{partialCount}</strong></span>
                <span>Failed: <strong className="text-red-400">{failedCount}</strong></span>
              </div>
              <div>
                <span>Imported to Library: <strong className="text-emerald-400">{importedCount}</strong></span>
              </div>
            </div>

            {queue.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-zinc-500 space-y-3">
                <Layers className="w-12 h-12 stroke-[1.5] text-zinc-600" />
                <h3 className="text-sm font-bold text-zinc-400">Queue is currently empty</h3>
                <p className="text-xs max-w-sm">
                  Paste titles in the left panel to begin background scraping and verification.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {queue.map((item) => {
                  const isExpanded = expandedItemId === item.id;
                  return (
                    <div
                      key={item.id}
                      className={`bg-zinc-950/60 border rounded-xl overflow-hidden transition-all ${
                        item.imported
                          ? 'border-emerald-500/40 bg-emerald-950/10'
                          : item.status === 'completed'
                          ? 'border-emerald-500/30'
                          : item.status === 'failed'
                          ? 'border-red-500/30'
                          : 'border-zinc-800'
                      }`}
                    >
                      {/* Card Header */}
                      <div className="p-4 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          {item.tmdbData?.poster_path ? (
                            <img
                              src={`https://image.tmdb.org/t/p/w92${item.tmdbData.poster_path}`}
                              alt=""
                              className="w-10 h-14 object-cover rounded-lg border border-zinc-800 flex-shrink-0"
                            />
                          ) : (
                            <div className="w-10 h-14 bg-zinc-800 rounded-lg flex items-center justify-center flex-shrink-0 text-zinc-500">
                              {item.type === 'series' ? <Tv className="w-5 h-5" /> : <Film className="w-5 h-5" />}
                            </div>
                          )}

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h4 className="text-sm font-bold text-white truncate">
                                {item.tmdbData?.title || item.tmdbData?.name || item.cleanTitle}
                              </h4>
                              {item.year && (
                                <span className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">
                                  {item.year}
                                </span>
                              )}
                              <span className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 capitalize">
                                {item.type}
                              </span>
                            </div>

                            {/* Status / Quality Chips */}
                            <div className="flex flex-wrap items-center gap-2 mt-1.5">
                              {item.status === 'searching_tmdb' && (
                                <span className="flex items-center gap-1 text-[11px] text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full border border-indigo-500/20">
                                  <Loader2 className="w-3 h-3 animate-spin" /> TMDB Lookup...
                                </span>
                              )}
                              {item.status === 'checking' && (
                                <span className="flex items-center gap-1 text-[11px] text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded-full border border-cyan-500/20 animate-pulse">
                                  <Loader2 className="w-3 h-3 animate-spin" /> LinkChecker scanning in background...
                                </span>
                              )}
                              {item.status === 'completed' && (
                                <span className="flex items-center gap-1 text-[11px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                                  <CheckCircle2 className="w-3 h-3" /> All Qualities Found ({item.discoveredLinks.length})
                                </span>
                              )}
                              {item.status === 'partial' && (
                                <span className="flex items-center gap-1 text-[11px] text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                                  <AlertCircle className="w-3 h-3" /> {item.discoveredLinks.length} Links Found
                                </span>
                              )}
                              {item.status === 'failed' && (
                                <span className="flex items-center gap-1 text-[11px] text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full border border-red-500/20">
                                  <AlertCircle className="w-3 h-3" /> No Links Found
                                </span>
                              )}

                              {/* Quality Badges */}
                              <div className="flex items-center gap-1 text-[10px]">
                                <span className={`px-1.5 py-0.5 rounded font-bold ${item.has480p ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-zinc-800 text-zinc-500'}`}>
                                  480p
                                </span>
                                <span className={`px-1.5 py-0.5 rounded font-bold ${item.has720p ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-zinc-800 text-zinc-500'}`}>
                                  720p
                                </span>
                                <span className={`px-1.5 py-0.5 rounded font-bold ${item.has720pHevc ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-zinc-800 text-zinc-500'}`}>
                                  HEVC
                                </span>
                                <span className={`px-1.5 py-0.5 rounded font-bold ${item.has1080p ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-zinc-800 text-zinc-500'}`}>
                                  1080p
                                </span>
                              </div>

                              {item.imported && (
                                <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-bold bg-emerald-500/20 px-2 py-0.5 rounded-full border border-emerald-500/40">
                                  <Check className="w-3 h-3" /> In Library
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2">
                          {!item.imported && item.discoveredLinks.length > 0 && (
                            <button
                              onClick={() => importSingleItem(item)}
                              className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600/30 rounded-lg text-xs font-bold transition-colors"
                            >
                              <Database className="w-3.5 h-3.5" /> Import
                            </button>
                          )}

                          <button
                            onClick={() => setExpandedItemId(isExpanded ? null : item.id)}
                            className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors"
                          >
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>

                          <button
                            onClick={() => setQueue((prev) => prev.filter((it) => it.id !== item.id))}
                            className="p-1.5 text-zinc-500 hover:text-red-400 rounded-lg hover:bg-zinc-800 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Expanded Details */}
                      {isExpanded && (
                        <div className="border-t border-zinc-800/80 p-4 bg-zinc-950/40 space-y-4">
                          {/* Logs */}
                          {item.logs.length > 0 && (
                            <div className="space-y-1">
                              <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                                Activity Logs
                              </span>
                              <div className="bg-zinc-900 p-2.5 rounded-lg text-xs font-mono text-zinc-300 space-y-0.5">
                                {item.logs.map((log, lidx) => (
                                  <div key={lidx} className="flex items-center gap-2">
                                    <ArrowRight className="w-3 h-3 text-emerald-400" />
                                    <span>{log}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Discovered Links */}
                          {item.discoveredLinks.length > 0 ? (
                            <div className="space-y-2">
                              <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                                Discovered Verified Links ({item.discoveredLinks.length})
                              </span>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                {item.discoveredLinks.map((link, lidx) => (
                                  <div
                                    key={lidx}
                                    className="bg-zinc-900 border border-zinc-800 p-2.5 rounded-lg flex items-center justify-between gap-2"
                                  >
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-xs font-bold text-white truncate">
                                          {link.label}
                                        </span>
                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                                          {link.source}
                                        </span>
                                        {link.size && (
                                          <span className="text-[10px] text-zinc-400 font-mono">
                                            {link.size}
                                          </span>
                                        )}
                                      </div>
                                      <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                                        {link.fileName || link.url}
                                      </p>
                                    </div>
                                    <a
                                      href={link.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="p-1.5 text-zinc-400 hover:text-cyan-400 rounded hover:bg-zinc-800"
                                      title="Test link"
                                    >
                                      <ExternalLink className="w-3.5 h-3.5" />
                                    </a>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <p className="text-xs text-zinc-500 italic">No links extracted yet.</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
};
