import React, { useState, useRef, useMemo } from 'react';
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
  Check,
  Filter,
  CheckSquare,
  Square,
  Search,
  SlidersHorizontal,
  Info,
  Flame,
  Clock,
  Ban,
  ArrowUpRight,
  HelpCircle,
  ListOrdered
} from 'lucide-react';
import { useModalBehavior } from '../hooks/useModalBehavior';
import { useHaptics } from '../hooks/useHaptics';
import { useAdminContent } from '../contexts/AdminContentContext';
import { Content, Genre, Language, Quality, QualityLinks } from '../types';
import { searchTMDBByTitle, fetchTMDBDetails } from './MediaModal';
import {
  extractTitleAndYear,
  ScrapedLinkItem,
  QUALITY_ORDER,
  QUALITY_LABELS,
  QUALITY_COLORS,
} from './LinkCheckerModal';
import {
  runWaterfallLinkSearch,
  WaterfallSearchResult,
  deduplicateQualityLinks,
} from '../utils/bulkImporterWaterfall';

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
  season?: number;
  episode?: number;
  type: 'movie' | 'series';
  status: 'idle' | 'searching_tmdb' | 'checking' | 'completed' | 'partial' | 'no_hd' | 'failed';
  currentProvider?: string;
  logs: string[];
  tmdbData?: any;
  discoveredLinks: ScrapedLinkItem[];
  qualityLinks?: QualityLinks;
  sampleLink?: ScrapedLinkItem;
  sampleUrl?: string;
  has480p: boolean;
  has720p: boolean;
  has1080p: boolean;
  has2160p: boolean;
  hasHdVersion: boolean;
  isComplete: boolean;
  imported: boolean;
  assignedOrder?: number;
  stoppedReason?: string;
}

type FilterTab = 'all' | 'ready' | 'completed' | 'partial' | 'no_hd' | 'imported' | 'failed';
type MobileViewMode = 'input' | 'queue';

const SAMPLE_TITLES = [
  'Deadpool & Wolverine (2024)',
  'Pushpa 2 The Rule (2024)',
  'Stranger Things Season 4',
  'Kalki 2898 AD (2024)',
  'The Boys S04'
].join('\n');

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
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [mobileViewMode, setMobileViewMode] = useState<MobileViewMode>('input');
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [maxPostsPerProvider, setMaxPostsPerProvider] = useState<number>(2);

  const abortControllerRef = useRef<AbortController | null>(null);

  useModalBehavior(isOpen, () => {
    if (!isProcessing) onClose();
  });

  // Calculate current max order in library
  const currentMaxOrder = useMemo(() => {
    return contentList.reduce((max, c) => {
      const ord = typeof c.order === 'number' ? c.order : 0;
      return ord > max ? ord : max;
    }, 0);
  }, [contentList]);

  // Real-time parse preview of text input
  const parsedPreview = useMemo(() => {
    const lines = inputLines
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    return lines.map((line) => {
      const parsed = extractTitleAndYear(line);
      const isSeries =
        parsed.season !== undefined ||
        parsed.episode !== undefined ||
        parsed.isEpisodeRange ||
        /\b(season|seasons|s\d+|episodes?|series)\b/i.test(line);

      return {
        raw: line,
        cleanTitle: parsed.title || line,
        year: parsed.year,
        season: parsed.season,
        episode: parsed.episode,
        type: isSeries ? ('series' as const) : ('movie' as const),
      };
    });
  }, [inputLines]);

  const handleCreateQueue = () => {
    if (parsedPreview.length === 0) return;

    const newItems: BatchItem[] = parsedPreview.map((item, idx) => {
      return {
        id: `batch-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 5)}`,
        rawInput: item.raw,
        cleanTitle: item.cleanTitle,
        year: item.year,
        season: item.season,
        episode: item.episode,
        type: item.type,
        status: 'idle',
        logs: [],
        discoveredLinks: [],
        has480p: false,
        has720p: false,
        has1080p: false,
        has2160p: false,
        hasHdVersion: false,
        isComplete: false,
        imported: false,
      };
    });

    setQueue((prev) => [...prev, ...newItems]);
    setInputLines('');
    setMobileViewMode('queue');
    vibrate(30);
  };

  const processSingleItem = async (item: BatchItem, signal: AbortSignal) => {
    const updateItem = (updates: Partial<BatchItem>) => {
      setQueue((prev) => prev.map((it) => (it.id === item.id ? { ...it, ...updates } : it)));
    };

    updateItem({ status: 'searching_tmdb', logs: ['Searching TMDB for metadata & type confirmation by title...'] });

    let tmdb: any = null;
    let detectedType: 'movie' | 'series' = item.type;
    try {
      // Search TMDB by pure title first (without year filter to get all matching candidates)
      let tmdbResults = await searchTMDBByTitle(item.cleanTitle, '');
      if ((!tmdbResults || tmdbResults.length === 0) && item.cleanTitle.includes(':')) {
        tmdbResults = await searchTMDBByTitle(item.cleanTitle.split(':')[0].trim(), '');
      }

      if (tmdbResults && tmdbResults.length > 0) {
        // Verify candidates by year if year was provided in input
        let matchedEntry = tmdbResults[0];
        if (item.year) {
          const yearMatch = tmdbResults.find((r: any) => {
            const date = r.item?.release_date || r.item?.first_air_date || '';
            const y = parseInt(date.split('-')[0], 10);
            return y === item.year || Math.abs(y - item.year!) <= 1;
          });
          if (yearMatch) {
            matchedEntry = yearMatch;
          }
        }

        const top = matchedEntry.item;
        const details = await fetchTMDBDetails(top.id, top.media_type || 'movie');
        tmdb = details || top;
        detectedType =
          top.media_type === 'tv' || tmdb.number_of_seasons || item.season !== undefined
            ? 'series'
            : 'movie';

        updateItem({
          tmdbData: tmdb,
          type: detectedType,
          cleanTitle: tmdb.title || tmdb.name || item.cleanTitle,
          year: tmdb.release_date
            ? parseInt(tmdb.release_date.split('-')[0], 10)
            : tmdb.first_air_date
            ? parseInt(tmdb.first_air_date.split('-')[0], 10)
            : item.year,
          logs: [
            `TMDB Matched: "${tmdb.title || tmdb.name}" (${(tmdb.release_date || tmdb.first_air_date || '').split('-')[0] || item.year || 'N/A'}) - [${detectedType.toUpperCase()}]`,
          ],
        });
      } else {
        updateItem({ logs: ['TMDB: No direct match, using clean title and local type heuristics'] });
      }
    } catch (e) {
      updateItem({ logs: ['TMDB search skipped/failed, proceeding with waterfall scraping'] });
    }

    if (signal.aborted) return;

    updateItem({
      status: 'checking',
      currentProvider: 'FilmyCab (1st)',
      logs: ['Starting 5-Tier Waterfall Search (FilmyCab → MoviesDrive → HDHub4U → SkyMoviesHD → FilmyFly)...'],
    });

    try {
      const waterfallResult: WaterfallSearchResult = await runWaterfallLinkSearch({
        title: tmdb?.title || tmdb?.name || item.cleanTitle,
        year: item.year,
        type: detectedType,
        languages,
        qualities,
        signal,
        maxPostsPerProvider,
        onProgress: (msg) => {
          updateItem({ logs: [msg] });
        },
      });

      if (signal.aborted) return;

      const links = waterfallResult.links;
      let finalStatus: BatchItem['status'] = 'failed';
      if (waterfallResult.stoppedReason && links.length === 0) {
        finalStatus = 'no_hd';
      } else if (links.length === 0) {
        finalStatus = 'failed';
      } else if (waterfallResult.isComplete) {
        finalStatus = 'completed';
      } else {
        finalStatus = 'partial';
      }

      const sampleUrl = waterfallResult.sample?.url || waterfallResult.metadata?.sampleUrl;

      const updatedItemData: Partial<BatchItem> = {
        status: finalStatus,
        currentProvider: waterfallResult.providerUsed,
        discoveredLinks: links,
        qualityLinks: waterfallResult.qualityLinks,
        sampleLink: waterfallResult.sample,
        sampleUrl: sampleUrl,
        has480p: waterfallResult.has480p,
        has720p: waterfallResult.has720p,
        has1080p: waterfallResult.has1080p,
        has2160p: waterfallResult.has2160p,
        hasHdVersion: waterfallResult.hasHdVersion,
        isComplete: waterfallResult.isComplete,
        stoppedReason: waterfallResult.stoppedReason,
        logs: [
          ...waterfallResult.logs,
          `Waterfall summary: ${links.length} single-per-quality links selected via ${waterfallResult.providerUsed}.`,
          `Qualities: [480p: ${waterfallResult.has480p ? '✓' : '✗'} | 720p: ${waterfallResult.has720p ? '✓' : '✗'} | 1080p: ${waterfallResult.has1080p ? '✓' : '✗'} | 4K: ${waterfallResult.has2160p ? '✓' : '✗'}]`,
          sampleUrl ? `Sample verified & attached: ${sampleUrl}` : '',
          waterfallResult.stoppedReason ? `Note: ${waterfallResult.stoppedReason}` : '',
        ].filter(Boolean),
      };

      updateItem(updatedItemData);

      if (autoImportWhenComplete && links.length > 0) {
        await importSingleItem({
          ...item,
          ...updatedItemData,
          tmdbData: tmdb,
          type: detectedType,
          discoveredLinks: links,
          qualityLinks: waterfallResult.qualityLinks,
          sampleLink: waterfallResult.sample,
          sampleUrl: sampleUrl,
        } as BatchItem);
      }
    } catch (err: any) {
      updateItem({
        status: 'failed',
        logs: [`Waterfall Scanner Error: ${err.message || 'Unknown network error'}`],
      });
    }
  };

  const orderCounterRef = useRef<number>(0);

  const handleStartBatch = async () => {
    if (queue.length === 0 || isProcessing) return;
    setIsProcessing(true);
    setMobileViewMode('queue');
    vibrate(50);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Reset order counter baseline to current library max
    orderCounterRef.current = Math.max(orderCounterRef.current, currentMaxOrder);

    // Queue of items needing processing
    const pendingItems = queue.filter((item) => !item.imported && item.status !== 'completed');
    if (pendingItems.length === 0) {
      setIsProcessing(false);
      return;
    }

    const taskQueue = [...pendingItems];
    const CONCURRENCY = 10;

    const worker = async () => {
      while (taskQueue.length > 0) {
        if (controller.signal.aborted) break;
        const target = taskQueue.shift();
        if (!target) break;
        await processSingleItem(target, controller.signal);
      }
    };

    const workerSlots = Array.from(
      { length: Math.min(CONCURRENCY, taskQueue.length) },
      () => worker()
    );

    await Promise.all(workerSlots);

    setIsProcessing(false);
  };

  const handleStopBatch = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsProcessing(false);
    vibrate(30);
  };

  const importSingleItem = async (item: BatchItem, explicitOrder?: number) => {
    if (item.imported || item.discoveredLinks.length === 0) return;

    try {
      const tmdb = item.tmdbData;
      const title = tmdb?.title || tmdb?.name || item.cleanTitle;
      const releaseDate = tmdb?.release_date || tmdb?.first_air_date || '';
      const year = releaseDate
        ? parseInt(releaseDate.split('-')[0], 10)
        : item.year || new Date().getFullYear();

      // Find primary genre
      let genreId = genres.length > 0 ? genres[0].id : '';
      if (tmdb?.genres && tmdb.genres.length > 0) {
        const found = genres.find((g) => g.name.toLowerCase() === tmdb.genres[0].name.toLowerCase());
        if (found) genreId = found.id;
      }

      // Quality ID
      const qualityId = qualities.length > 0 ? qualities[0].id : '';

      // Format movieLinks JSON with deduplicated confirmed single links (strict filtering)
      const deduplicated = deduplicateQualityLinks(item.discoveredLinks, item.type);
      if (deduplicated.length === 0) {
        return;
      }

      const finalLinksPayload: QualityLinks = deduplicated.map((d) => ({
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

      // Calculate order: max order + 1 sequentially
      orderCounterRef.current = Math.max(orderCounterRef.current, currentMaxOrder) + 1;
      const nextOrderNumber = explicitOrder !== undefined ? explicitOrder : orderCounterRef.current;

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
        order: nextOrderNumber,
        movieLinks: JSON.stringify(finalLinksPayload),
        sampleUrl: item.sampleLink?.url || item.sampleUrl || undefined,
        status: 'published',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await saveContent(newContent);

      setQueue((prev) =>
        prev.map((it) =>
          it.id === item.id ? { ...it, imported: true, assignedOrder: nextOrderNumber, discoveredLinks: deduplicated } : it
        )
      );
      vibrate(40);
    } catch (err) {
      console.error('Failed to auto-import content item:', err);
    }
  };

  const handleImportAllReady = async () => {
    const readyItems = queue.filter((it) => !it.imported && it.discoveredLinks.length > 0);
    let baseOrder = Math.max(orderCounterRef.current, currentMaxOrder);
    for (let i = 0; i < readyItems.length; i++) {
      baseOrder += 1;
      orderCounterRef.current = baseOrder;
      await importSingleItem(readyItems[i], baseOrder);
    }
    vibrate([50, 50, 50]);
  };

  const handleImportSelected = async () => {
    const selectedReady = queue.filter(
      (it) => selectedItemIds.has(it.id) && !it.imported && it.discoveredLinks.length > 0
    );
    let baseOrder = Math.max(orderCounterRef.current, currentMaxOrder);
    for (let i = 0; i < selectedReady.length; i++) {
      baseOrder += 1;
      orderCounterRef.current = baseOrder;
      await importSingleItem(selectedReady[i], baseOrder);
    }
    setSelectedItemIds(new Set());
    vibrate([50, 50, 50]);
  };

  const handleDeleteSelected = () => {
    setQueue((prev) => prev.filter((it) => !selectedItemIds.has(it.id)));
    setSelectedItemIds(new Set());
    vibrate(30);
  };

  const handleRetrySelected = async () => {
    const toRetry = queue.filter(
      (it) => selectedItemIds.has(it.id) && (it.status === 'failed' || it.status === 'no_hd' || it.status === 'partial')
    );
    if (toRetry.length === 0) return;

    setIsProcessing(true);
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const taskQueue = [...toRetry];
    const CONCURRENCY = 10;

    const worker = async () => {
      while (taskQueue.length > 0) {
        if (controller.signal.aborted) break;
        const target = taskQueue.shift();
        if (!target) break;
        await processSingleItem(target, controller.signal);
      }
    };

    const workerSlots = Array.from(
      { length: Math.min(CONCURRENCY, taskQueue.length) },
      () => worker()
    );

    await Promise.all(workerSlots);

    setIsProcessing(false);
  };

  // Filtered Queue
  const filteredQueue = useMemo(() => {
    return queue.filter((item) => {
      // Tab filter
      if (activeTab === 'ready' && (item.imported || item.discoveredLinks.length === 0)) return false;
      if (activeTab === 'completed' && item.status !== 'completed') return false;
      if (activeTab === 'partial' && item.status !== 'partial') return false;
      if (activeTab === 'no_hd' && item.status !== 'no_hd') return false;
      if (activeTab === 'imported' && !item.imported) return false;
      if (activeTab === 'failed' && item.status !== 'failed') return false;

      // Search filter
      if (searchFilter.trim()) {
        const q = searchFilter.toLowerCase();
        const matchTitle = item.cleanTitle.toLowerCase().includes(q);
        const matchRaw = item.rawInput.toLowerCase().includes(q);
        const matchProvider = (item.currentProvider || '').toLowerCase().includes(q);
        if (!matchTitle && !matchRaw && !matchProvider) return false;
      }

      return true;
    });
  }, [queue, activeTab, searchFilter]);

  const toggleSelectAll = () => {
    if (selectedItemIds.size === filteredQueue.length && filteredQueue.length > 0) {
      setSelectedItemIds(new Set());
    } else {
      setSelectedItemIds(new Set(filteredQueue.map((i) => i.id)));
    }
  };

  const toggleSelectItem = (id: string) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (!isOpen) return null;

  const totalInQueue = queue.length;
  const completedCount = queue.filter((i) => i.status === 'completed').length;
  const partialCount = queue.filter((i) => i.status === 'partial').length;
  const noHdCount = queue.filter((i) => i.status === 'no_hd').length;
  const failedCount = queue.filter((i) => i.status === 'failed').length;
  const importedCount = queue.filter((i) => i.imported).length;
  const readyToImportCount = queue.filter((i) => !i.imported && i.discoveredLinks.length > 0).length;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-0 sm:p-3 md:p-6 overflow-hidden">
      <motion.div
        initial={{ opacity: 0, scale: 0.98, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: 10 }}
        transition={{ duration: 0.2 }}
        className="relative w-full max-w-6xl h-full sm:h-[92vh] sm:max-h-[960px] bg-zinc-950 sm:border sm:border-zinc-800 rounded-none sm:rounded-2xl flex flex-col shadow-2xl overflow-hidden text-zinc-100 font-sans"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 sm:px-6 py-2.5 sm:py-3.5 border-b border-zinc-800 bg-zinc-900/90 gap-2 flex-shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-1.5 sm:p-2.5 rounded-xl bg-gradient-to-tr from-cyan-500/20 via-blue-500/20 to-emerald-500/20 border border-cyan-500/30 text-cyan-400 shadow-sm flex-shrink-0">
              <Sparkles className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                <h2 className="text-sm sm:text-base md:text-lg font-bold text-white tracking-tight truncate">
                  Bulk Content Importer
                </h2>
                <span className="text-[10px] sm:text-[11px] px-1.5 sm:px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 font-medium">
                  5-Stage Waterfall
                </span>
                <span className="hidden sm:inline-flex text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-medium">
                  Single Link / Quality
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 mt-0.5 hidden md:flex items-center gap-1.5 flex-wrap">
                <span>Cascade:</span>
                <span className="text-cyan-300 font-medium">1. FilmyCab</span>
                <span className="text-zinc-600">→</span>
                <span className="text-indigo-300 font-medium">2. MoviesDrive</span>
                <span className="text-zinc-600">→</span>
                <span className="text-amber-300 font-medium">3. HDHub4U (HD Check)</span>
                <span className="text-zinc-600">→</span>
                <span className="text-purple-300 font-medium">4. SkyMoviesHD</span>
                <span className="text-zinc-600">→</span>
                <span className="text-emerald-300 font-medium">5. FilmyFly</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="text-right hidden sm:block mr-1">
              <span className="text-[10px] sm:text-[11px] text-zinc-400 block">Next Order</span>
              <span className="text-xs font-mono font-bold text-cyan-400">
                #{currentMaxOrder + 1}
              </span>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 sm:p-2 text-zinc-400 hover:text-white rounded-xl hover:bg-zinc-800 transition-colors border border-transparent hover:border-zinc-700"
              title="Close (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Mobile View Toggle Switcher (Visible on < lg) */}
        <div className="flex lg:hidden items-center border-b border-zinc-800 bg-zinc-900/80 p-1 flex-shrink-0">
          <button
            onClick={() => setMobileViewMode('input')}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              mobileViewMode === 'input'
                ? 'bg-cyan-600 text-white shadow-sm'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
            }`}
          >
            <Flame className="w-3.5 h-3.5" />
            <span>1. Input & Setup</span>
            {parsedPreview.length > 0 && (
              <span className="ml-1 text-[10px] px-1.5 py-0.2 bg-black/40 rounded-full">
                {parsedPreview.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setMobileViewMode('queue')}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              mobileViewMode === 'queue'
                ? 'bg-cyan-600 text-white shadow-sm'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>2. Queue & Results ({totalInQueue})</span>
            {isProcessing && <Loader2 className="w-3 h-3 animate-spin text-cyan-300" />}
          </button>
        </div>

        {/* Main Body: Desktop 2-Column Split / Mobile Tabbed Split */}
        <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden relative">
          {/* Left Column: Input Form & Automation Controls */}
          <div
            className={`flex-1 lg:flex-initial lg:w-[380px] xl:w-[420px] p-3.5 sm:p-5 border-b lg:border-b-0 lg:border-r border-zinc-800/80 flex-col gap-4 bg-zinc-900/40 overflow-y-auto min-h-0 touch-pan-y overscroll-contain pb-12 sm:pb-6 flex-shrink-0 ${
              mobileViewMode === 'input' ? 'flex' : 'hidden lg:flex'
            }`}
          >
            {/* Input Header & Textarea */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Flame className="w-3.5 h-3.5 text-amber-400" />
                  <span>Paste Titles</span>
                </label>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setInputLines(SAMPLE_TITLES)}
                    className="text-[10px] text-cyan-400 hover:text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/20 px-2 py-0.5 rounded border border-cyan-500/20 transition-colors font-medium"
                    title="Load sample movies and series titles"
                  >
                    Sample Titles
                  </button>
                  {parsedPreview.length > 0 && (
                    <span className="text-[10px] font-mono text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
                      {parsedPreview.length} {parsedPreview.length === 1 ? 'title' : 'titles'}
                    </span>
                  )}
                </div>
              </div>

              <textarea
                value={inputLines}
                onChange={(e) => setInputLines(e.target.value)}
                placeholder="Deadpool & Wolverine (2024)&#10;Pushpa 2 The Rule (2024)&#10;Stranger Things Season 4&#10;Kalki 2898 AD (2024)&#10;The Boys S04"
                rows={5}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500 transition-all font-mono resize-none shadow-inner leading-relaxed"
              />
            </div>

            {/* Live Realtime Parse Preview Box */}
            {parsedPreview.length > 0 && (
              <div className="bg-zinc-950/90 border border-zinc-800 rounded-xl p-3 max-h-36 overflow-y-auto space-y-1.5 shadow-inner flex-shrink-0">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                  Live Parse Preview:
                </span>
                {parsedPreview.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between gap-2 text-[11px] bg-zinc-900/90 px-2.5 py-1.5 rounded-lg border border-zinc-800/80"
                  >
                    <span className="text-zinc-200 truncate font-medium flex-1">
                      {item.cleanTitle}
                    </span>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {item.year && (
                        <span className="text-[10px] px-1.5 py-0.2 bg-zinc-800 text-zinc-400 rounded font-mono">
                          {item.year}
                        </span>
                      )}
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded uppercase font-bold ${
                          item.type === 'series'
                            ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                            : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                        }`}
                      >
                        {item.type}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add to Queue Button */}
            <button
              onClick={handleCreateQueue}
              disabled={parsedPreview.length === 0}
              className="flex items-center justify-center gap-2 w-full py-2.5 px-4 bg-gradient-to-r from-cyan-600 via-blue-600 to-emerald-600 hover:from-cyan-500 hover:to-emerald-500 disabled:opacity-40 text-white font-bold rounded-xl text-xs transition-all shadow-md active:scale-98 flex-shrink-0"
            >
              <Plus className="w-4 h-4" /> Add Titles to Queue ({parsedPreview.length})
            </button>

            {/* Automation Options Card */}
            <div className="p-3.5 rounded-xl bg-zinc-950/80 border border-zinc-800 space-y-3 shadow-sm flex-shrink-0">
              <span className="text-xs font-bold text-zinc-300 uppercase tracking-wider block flex items-center gap-1.5">
                <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-400" /> Automation & Waterfall
              </span>

              {/* Auto-Import Switch */}
              <label className="flex items-start justify-between gap-3 cursor-pointer select-none">
                <div>
                  <span className="text-xs font-semibold text-white block">Auto-Import When Verified</span>
                  <span className="text-[11px] text-zinc-400 block leading-tight mt-0.5">
                    Directly saves verified items to library at max order +1
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={autoImportWhenComplete}
                  onChange={(e) => setAutoImportWhenComplete(e.target.checked)}
                  className="w-4 h-4 mt-0.5 accent-emerald-500 cursor-pointer rounded"
                />
              </label>

              {/* Waterfall Priority Summary */}
              <div className="p-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-300 space-y-1.5">
                <div className="flex items-center gap-1.5 font-semibold text-cyan-400">
                  <Info className="w-3.5 h-3.5" /> 5-Tier Waterfall Cascade:
                </div>
                <ul className="list-disc list-inside text-zinc-400 space-y-1 text-[10.5px]">
                  <li><strong>1. FilmyCab</strong>: Final if all HD links found.</li>
                  <li><strong>2. MoviesDrive</strong>: Proceeds if missing HD links.</li>
                  <li><strong>3. HDHub4U</strong>: Halts if no HD found across all sites (HD not released).</li>
                  <li><strong>4. SkyMoviesHD & 5. FilmyFly</strong>: Extended fallback.</li>
                  <li><strong>Single-Link Rule</strong>: Deduplicates to 1 clean link per 480p, 720p, 1080p, 4K.</li>
                </ul>
              </div>
            </div>

            {/* Step 1 Quick Navigation Helper */}
            <div className="p-3 rounded-xl bg-zinc-900/60 border border-zinc-800 text-xs text-zinc-400 flex items-center justify-between gap-2 flex-shrink-0">
              <span className="text-[11px]">
                {queue.length > 0
                  ? `${queue.length} titles currently in queue`
                  : 'Add titles above to begin'}
              </span>
              <button
                onClick={() => setMobileViewMode('queue')}
                className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-cyan-400 font-semibold rounded-lg text-xs transition-colors"
              >
                Go to Stage 2 &rarr;
              </button>
            </div>
          </div>

          {/* Right Column: Queue Items, Filter Tabs, Results */}
          <div
            className={`flex-1 p-3.5 sm:p-5 overflow-y-auto flex flex-col gap-3.5 bg-zinc-950/60 min-w-0 min-h-0 touch-pan-y overscroll-contain pb-16 sm:pb-6 ${
              mobileViewMode === 'queue' ? 'flex' : 'hidden lg:flex'
            }`}
          >
            {/* Stage 2 Primary Action Banner */}
            <div className="bg-zinc-900/95 border border-zinc-800/90 p-3 sm:p-4 rounded-2xl flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shadow-md flex-shrink-0">
              <div className="flex items-center gap-3">
                <div
                  className={`p-2.5 rounded-xl flex items-center justify-center ${
                    isProcessing
                      ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 animate-pulse'
                      : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  }`}
                >
                  {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5 fill-emerald-400" />}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-white">Stage 2: Waterfall Processing</h3>
                    {isProcessing ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 animate-pulse">
                        Scanning 10 Concurrent
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700">
                        {totalInQueue} in Queue
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-400">
                    {isProcessing
                      ? `Deep link verification active on ${queue.filter((i) => i.status === 'checking' || i.status === 'searching_tmdb').length || 1} items`
                      : `${queue.filter((i) => !i.imported && i.status !== 'completed').length} pending scan • ${readyToImportCount} ready for instant library import`}
                  </p>
                </div>
              </div>

              {/* Primary Action Buttons */}
              <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                {isProcessing ? (
                  <button
                    onClick={handleStopBatch}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 py-2.5 px-4 bg-red-600/20 text-red-400 border border-red-500/40 hover:bg-red-600/30 font-bold rounded-xl text-xs transition-all shadow-sm active:scale-98"
                  >
                    <Loader2 className="w-4 h-4 animate-spin" /> Stop Waterfall
                  </button>
                ) : (
                  <button
                    onClick={handleStartBatch}
                    disabled={queue.length === 0 || queue.every((i) => i.status === 'completed' || i.imported)}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 py-2.5 px-5 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 hover:from-emerald-500 hover:to-teal-400 disabled:opacity-40 text-white font-bold rounded-xl text-xs transition-all shadow-md active:scale-98"
                  >
                    <Play className="w-4 h-4 fill-white" /> Start Waterfall Scan
                  </button>
                )}

                {readyToImportCount > 0 && (
                  <button
                    onClick={handleImportAllReady}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 py-2.5 px-4 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-xl text-xs transition-all shadow-md active:scale-98"
                  >
                    <Database className="w-4 h-4" /> Import All Ready ({readyToImportCount})
                  </button>
                )}

                {queue.length > 0 && !isProcessing && (
                  <button
                    onClick={() => {
                      setQueue([]);
                      setSelectedItemIds(new Set());
                    }}
                    className="p-2.5 text-zinc-500 hover:text-red-400 rounded-xl hover:bg-zinc-800 transition-colors"
                    title="Clear Entire Queue"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
            {/* Stats Summary Ribbon */}
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2 text-xs flex-shrink-0">
              <div className="bg-zinc-900 border border-zinc-800 p-2.5 rounded-xl flex flex-col justify-between">
                <span className="text-zinc-400 text-[11px]">Total Queue</span>
                <span className="text-sm font-bold text-white font-mono mt-0.5">{totalInQueue}</span>
              </div>
              <div className="bg-emerald-950/20 border border-emerald-500/20 p-2.5 rounded-xl flex flex-col justify-between">
                <span className="text-emerald-400 text-[11px]">HD Complete</span>
                <span className="text-sm font-bold text-emerald-400 font-mono mt-0.5">{completedCount}</span>
              </div>
              <div className="bg-amber-950/20 border border-amber-500/20 p-2.5 rounded-xl flex flex-col justify-between">
                <span className="text-amber-400 text-[11px]">Partial Links</span>
                <span className="text-sm font-bold text-amber-400 font-mono mt-0.5">{partialCount}</span>
              </div>
              <div className="bg-purple-950/20 border border-purple-500/20 p-2.5 rounded-xl flex flex-col justify-between">
                <span className="text-purple-400 text-[11px]">No HD Yet</span>
                <span className="text-sm font-bold text-purple-400 font-mono mt-0.5">{noHdCount}</span>
              </div>
              <div className="bg-red-950/20 border border-red-500/20 p-2.5 rounded-xl flex flex-col justify-between">
                <span className="text-red-400 text-[11px]">Failed</span>
                <span className="text-sm font-bold text-red-400 font-mono mt-0.5">{failedCount}</span>
              </div>
              <div className="bg-cyan-950/20 border border-cyan-500/20 p-2.5 rounded-xl flex flex-col justify-between">
                <span className="text-cyan-400 text-[11px]">In Library</span>
                <span className="text-sm font-bold text-cyan-400 font-mono mt-0.5">{importedCount}</span>
              </div>
            </div>

            {/* Filter Tabs & Search Bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pb-2 border-b border-zinc-800 flex-shrink-0">
              {/* Horizontal Scrollable Tabs */}
              <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 text-xs scrollbar-none flex-nowrap">
                <button
                  onClick={() => setActiveTab('all')}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap ${
                    activeTab === 'all'
                      ? 'bg-zinc-800 text-white shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                  }`}
                >
                  All ({totalInQueue})
                </button>
                <button
                  onClick={() => setActiveTab('ready')}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap ${
                    activeTab === 'ready'
                      ? 'bg-cyan-600/30 text-cyan-300 border border-cyan-500/40'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                  }`}
                >
                  Ready ({readyToImportCount})
                </button>
                <button
                  onClick={() => setActiveTab('completed')}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap ${
                    activeTab === 'completed'
                      ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/40'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                  }`}
                >
                  Complete ({completedCount})
                </button>
                <button
                  onClick={() => setActiveTab('partial')}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap ${
                    activeTab === 'partial'
                      ? 'bg-amber-600/30 text-amber-300 border border-amber-500/40'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                  }`}
                >
                  Partial ({partialCount})
                </button>
                <button
                  onClick={() => setActiveTab('no_hd')}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap ${
                    activeTab === 'no_hd'
                      ? 'bg-purple-600/30 text-purple-300 border border-purple-500/40'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                  }`}
                >
                  No HD ({noHdCount})
                </button>
                <button
                  onClick={() => setActiveTab('imported')}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap ${
                    activeTab === 'imported'
                      ? 'bg-cyan-600/30 text-cyan-300 border border-cyan-500/40'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                  }`}
                >
                  Imported ({importedCount})
                </button>
              </div>

              {/* Search Filter */}
              <div className="relative w-full sm:w-52 flex-shrink-0">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  type="text"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  placeholder="Filter queue titles..."
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            {/* Bulk Actions Toolbar (when items selected or available) */}
            {filteredQueue.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-zinc-900/80 border border-zinc-800 rounded-xl text-xs flex-shrink-0">
                <div className="flex items-center gap-2">
                  <button
                    onClick={toggleSelectAll}
                    className="flex items-center gap-1.5 text-zinc-300 hover:text-white font-medium"
                  >
                    {selectedItemIds.size === filteredQueue.length && filteredQueue.length > 0 ? (
                      <CheckSquare className="w-4 h-4 text-cyan-400" />
                    ) : (
                      <Square className="w-4 h-4 text-zinc-500" />
                    )}
                    <span>
                      {selectedItemIds.size > 0
                        ? `${selectedItemIds.size} Selected`
                        : 'Select All'}
                    </span>
                  </button>
                </div>

                {selectedItemIds.size > 0 && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={handleImportSelected}
                      className="flex items-center gap-1 px-2.5 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-bold text-[11px] transition-colors"
                    >
                      <Database className="w-3.5 h-3.5" /> Import ({selectedItemIds.size})
                    </button>
                    <button
                      onClick={handleRetrySelected}
                      disabled={isProcessing}
                      className="flex items-center gap-1 px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg font-medium text-[11px] transition-colors"
                    >
                      <RefreshCw className="w-3 h-3" /> Retry Selected
                    </button>
                    <button
                      onClick={handleDeleteSelected}
                      className="flex items-center gap-1 px-2.5 py-1 bg-red-600/20 text-red-400 hover:bg-red-600/30 border border-red-500/30 rounded-lg font-medium text-[11px] transition-colors"
                    >
                      <Trash2 className="w-3 h-3" /> Delete
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Queue List */}
            {filteredQueue.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-zinc-500 space-y-3">
                <Layers className="w-12 h-12 stroke-[1.5] text-zinc-700" />
                <h3 className="text-sm font-bold text-zinc-400">
                  {queue.length === 0 ? 'Queue is currently empty' : 'No items match current filter'}
                </h3>
                <p className="text-xs max-w-sm text-zinc-500">
                  {queue.length === 0
                    ? 'Paste title names on the left panel to begin 5-stage waterfall search and deep link verification.'
                    : 'Try switching tabs or clearing your search filter.'}
                </p>
              </div>
            ) : (
              <div className="space-y-3 pb-4">
                {filteredQueue.map((item, idx) => {
                  const isExpanded = expandedItemId === item.id;
                  const isSelected = selectedItemIds.has(item.id);
                  const nextOrder = currentMaxOrder + 1 + idx;

                  return (
                    <div
                      key={item.id}
                      className={`bg-zinc-900/70 border rounded-xl overflow-hidden transition-all shadow-sm ${
                        item.imported
                          ? 'border-emerald-500/40 bg-emerald-950/10'
                          : item.status === 'completed'
                          ? 'border-emerald-500/30 bg-zinc-900/90'
                          : item.status === 'no_hd'
                          ? 'border-purple-500/30 bg-purple-950/10'
                          : item.status === 'failed'
                          ? 'border-red-500/30 bg-red-950/10'
                          : isSelected
                          ? 'border-cyan-500/40'
                          : 'border-zinc-800'
                      }`}
                    >
                      {/* Card Header */}
                      <div className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          {/* Item Select Checkbox */}
                          <button
                            onClick={() => toggleSelectItem(item.id)}
                            className="text-zinc-500 hover:text-white transition-colors flex-shrink-0"
                          >
                            {isSelected ? (
                              <CheckSquare className="w-4 h-4 text-cyan-400" />
                            ) : (
                              <Square className="w-4 h-4 text-zinc-600" />
                            )}
                          </button>

                          {/* Poster Image / Icon */}
                          {item.tmdbData?.poster_path ? (
                            <img
                              src={`https://image.tmdb.org/t/p/w92${item.tmdbData.poster_path}`}
                              alt=""
                              className="w-11 h-16 object-cover rounded-lg border border-zinc-800 flex-shrink-0 shadow"
                            />
                          ) : (
                            <div className="w-11 h-16 bg-zinc-800/80 rounded-lg flex items-center justify-center flex-shrink-0 text-zinc-500 border border-zinc-700/50">
                              {item.type === 'series' ? <Tv className="w-5 h-5" /> : <Film className="w-5 h-5" />}
                            </div>
                          )}

                          {/* Info Column */}
                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="text-sm font-bold text-white truncate">
                                {item.tmdbData?.title || item.tmdbData?.name || item.cleanTitle}
                              </h4>
                              {item.year && (
                                <span className="text-[11px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono">
                                  {item.year}
                                </span>
                              )}
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-bold ${
                                  item.type === 'series'
                                    ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                                    : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                                }`}
                              >
                                {item.type}
                              </span>
                              {item.currentProvider && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700/60 font-medium">
                                  {item.currentProvider}
                                </span>
                              )}
                            </div>

                            {/* Status and Quality Badges */}
                            <div className="flex flex-wrap items-center gap-2">
                              {/* Status Pill */}
                              {item.status === 'searching_tmdb' && (
                                <span className="flex items-center gap-1 text-[11px] text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full border border-indigo-500/20">
                                  <Loader2 className="w-3 h-3 animate-spin" /> TMDB Lookup...
                                </span>
                              )}
                              {item.status === 'checking' && (
                                <span className="flex items-center gap-1 text-[11px] text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded-full border border-cyan-500/20 animate-pulse font-medium">
                                  <Loader2 className="w-3 h-3 animate-spin" /> Waterfall Scraping...
                                </span>
                              )}
                              {item.status === 'completed' && (
                                <span className="flex items-center gap-1 text-[11px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/30 font-medium">
                                  <CheckCircle2 className="w-3 h-3" /> All HD Found ({item.discoveredLinks.length} single links)
                                </span>
                              )}
                              {item.status === 'partial' && (
                                <span className="flex items-center gap-1 text-[11px] text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/30 font-medium">
                                  <AlertCircle className="w-3 h-3" /> Partial ({item.discoveredLinks.length} links)
                                </span>
                              )}
                              {item.status === 'no_hd' && (
                                <span className="flex items-center gap-1 text-[11px] text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-full border border-purple-500/30 font-medium">
                                  <Ban className="w-3 h-3" /> HD Not Available Yet (Stopped at HDHub4U)
                                </span>
                              )}
                              {item.status === 'failed' && (
                                <span className="flex items-center gap-1 text-[11px] text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full border border-red-500/30 font-medium">
                                  <AlertCircle className="w-3 h-3" /> No Links Found
                                </span>
                              )}

                              {/* Single-Link Resolution Badges */}
                              <div className="flex items-center gap-1 text-[10px]">
                                <span
                                  className={`px-1.5 py-0.5 rounded font-bold transition-colors ${
                                    item.has480p
                                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                      : 'bg-zinc-800/80 text-zinc-600'
                                  }`}
                                >
                                  480p
                                </span>
                                <span
                                  className={`px-1.5 py-0.5 rounded font-bold transition-colors ${
                                    item.has720p
                                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                                      : 'bg-zinc-800/80 text-zinc-600'
                                  }`}
                                >
                                  720p
                                </span>
                                <span
                                  className={`px-1.5 py-0.5 rounded font-bold transition-colors ${
                                    item.has1080p
                                      ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                                      : 'bg-zinc-800/80 text-zinc-600'
                                  }`}
                                >
                                  1080p
                                </span>
                                {item.has2160p && (
                                  <span className="px-1.5 py-0.5 rounded font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                                    4K
                                  </span>
                                )}
                                {(item.sampleLink?.url || item.sampleUrl) && (
                                  <span className="px-1.5 py-0.5 rounded font-bold bg-pink-500/20 text-pink-300 border border-pink-500/40 flex items-center gap-0.5">
                                    <Sparkles className="w-2.5 h-2.5" /> Sample
                                  </span>
                                )}
                              </div>

                              {item.imported && (
                                <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-bold bg-emerald-500/20 px-2 py-0.5 rounded-full border border-emerald-500/40">
                                  <Check className="w-3 h-3" /> In Library (Order #{item.assignedOrder || nextOrder})
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Card Actions */}
                        <div className="flex items-center gap-1.5 self-end sm:self-center flex-shrink-0">
                          {!item.imported && item.discoveredLinks.length > 0 && (
                            <button
                              onClick={() => importSingleItem(item)}
                              className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600/30 rounded-xl text-xs font-bold transition-colors shadow-sm"
                              title={`Import as Order #${nextOrder}`}
                            >
                              <Database className="w-3.5 h-3.5" />
                              <span>Import</span>
                              <span className="text-[10px] opacity-75 font-mono">#{nextOrder}</span>
                            </button>
                          )}

                          <button
                            onClick={() => setExpandedItemId(isExpanded ? null : item.id)}
                            className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors"
                            title={isExpanded ? 'Collapse' : 'Expand Details'}
                          >
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>

                          <button
                            onClick={() => setQueue((prev) => prev.filter((it) => it.id !== item.id))}
                            className="p-1.5 text-zinc-500 hover:text-red-400 rounded-lg hover:bg-zinc-800 transition-colors"
                            title="Remove from Queue"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Expanded Section: Deduplicated Links & Live Logs */}
                      {isExpanded && (
                        <div className="border-t border-zinc-800 p-3 sm:p-4 bg-zinc-950/80 space-y-3">
                          {/* Sample Stream Link Row */}
                          {(item.sampleLink?.url || item.sampleUrl) && (
                            <div className="bg-pink-950/20 border border-pink-500/30 p-2.5 rounded-xl flex items-center justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-pink-500/20 text-pink-300 border border-pink-500/40">
                                    SAMPLE STREAM
                                  </span>
                                  <span className="text-xs font-semibold text-pink-200 truncate">
                                    {item.sampleLink?.fileName || 'Direct Sample Video Stream'}
                                  </span>
                                </div>
                                <p className="text-[11px] text-pink-400/90 truncate font-mono mt-0.5">
                                  {item.sampleLink?.url || item.sampleUrl}
                                </p>
                              </div>
                              <a
                                href={item.sampleLink?.url || item.sampleUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="p-1.5 text-pink-400 hover:text-pink-300 rounded-lg hover:bg-pink-900/40 transition-colors flex-shrink-0"
                                title="Test Sample Stream"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            </div>
                          )}

                          {/* Deduplicated Discovered Links */}
                          {item.discoveredLinks.length > 0 ? (
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                                  <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                                  Single Verified Links ({item.discoveredLinks.length})
                                </span>
                                <span className="text-[10px] text-zinc-500">
                                  Duplicate qualities removed
                                </span>
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                {item.discoveredLinks.map((link, lidx) => {
                                  const colorConfig = QUALITY_COLORS[link.quality] || QUALITY_COLORS.Other;
                                  return (
                                    <div
                                      key={lidx}
                                      className="bg-zinc-900 border border-zinc-800/90 p-2 sm:p-2.5 rounded-xl flex items-center justify-between gap-2 hover:border-zinc-700 transition-colors"
                                    >
                                      <div className="min-w-0 flex-1 space-y-1">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          <span
                                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${colorConfig.badge}`}
                                          >
                                            {link.quality}
                                          </span>
                                          <span className="text-xs font-bold text-white truncate">
                                            {link.label}
                                          </span>
                                          {link.size && (
                                            <span className="text-[10px] text-zinc-400 font-mono bg-zinc-800/80 px-1.5 py-0.5 rounded">
                                              {link.size}
                                            </span>
                                          )}
                                        </div>
                                        <p className="text-[11px] text-zinc-400 truncate font-mono">
                                          {link.fileName || link.url}
                                        </p>
                                      </div>
                                      <a
                                        href={link.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="p-1.5 text-zinc-400 hover:text-cyan-400 rounded-lg hover:bg-zinc-800 transition-colors flex-shrink-0"
                                        title="Open Link"
                                      >
                                        <ExternalLink className="w-3.5 h-3.5" />
                                      </a>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ) : (
                            <p className="text-xs text-zinc-500 italic">No verified links extracted yet.</p>
                          )}

                          {/* Activity Logs */}
                          {item.logs.length > 0 && (
                            <div className="space-y-1.5">
                              <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                                <Clock className="w-3.5 h-3.5" /> Waterfall Activity Logs
                              </span>
                              <div className="bg-zinc-950 p-2.5 sm:p-3 rounded-xl text-xs font-mono text-zinc-300 space-y-1 max-h-48 overflow-y-auto overscroll-contain border border-zinc-800/70">
                                {item.logs.map((log, lidx) => (
                                  <div key={lidx} className="flex items-start gap-2">
                                    <ArrowRight className="w-3 h-3 text-cyan-400 mt-0.5 flex-shrink-0" />
                                    <span className="break-all">{log}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
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

