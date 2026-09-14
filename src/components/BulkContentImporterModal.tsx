import React, { useState, useRef, useEffect } from 'react';
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
import { Content, Genre, Language, Quality } from '../types';
import {
  getFilmygoDomain,
  getHdhub4uDomain,
  getSkymoviesDomain,
  getMoviesdriveDomain,
  getFilmyflyDomain,
} from '../utils/domains';
import { normalizeUrl, performFullLinkScan } from '../utils/linkScanner';
import { searchTMDBByTitle, fetchTMDBDetails, fetchSeriesSeasons } from './MediaModal';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  genres: Genre[];
  languages: Language[];
  qualities: Quality[];
}

export interface ScrapedLinkItem {
  name: string;
  url: string;
  quality?: string;
  size?: string;
  bytes?: number;
  audio?: string;
  isSample?: boolean;
  source: 'FilmyGo' | 'HDHub4U' | 'SkyMoviesHD' | 'MoviesDrive' | 'FilmyFly';
}

export interface BatchItem {
  id: string;
  rawInput: string;
  cleanTitle: string;
  year?: number;
  type: 'movie' | 'series';
  status: 'idle' | 'searching_tmdb' | 'scraping' | 'completed' | 'partial' | 'failed';
  currentProvider?: string;
  logs: string[];
  tmdbData?: any;
  discoveredLinks: ScrapedLinkItem[];
  sampleLink?: ScrapedLinkItem;
  has480p: boolean;
  has720p: boolean;
  has720pHevc: boolean;
  has1080p: boolean;
  isComplete: boolean;
  imported: boolean;
}

export const generateSearchVariations = (title: string, year?: number, tmdbTitle?: string): string[] => {
  const variations: string[] = [];
  const add = (str?: string) => {
    if (!str) return;
    const clean = str
      .replace(/[()\[\]{}:;_\/\\|]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (clean && clean.length >= 2 && !variations.includes(clean)) {
      variations.push(clean);
    }
  };

  // 1. Title as parsed
  add(title);

  // 2. Title with year if provided
  if (year) {
    add(`${title} ${year}`);
  }

  // 3. Short title prefix before colon, dash, or slash (e.g. "Pushpa 2" from "Pushpa 2: The Rule")
  const splitPart = title.split(/[:\-\–\—]/)[0]?.trim();
  if (splitPart && splitPart.length >= 3 && splitPart.toLowerCase() !== title.toLowerCase()) {
    add(splitPart);
    if (year) add(`${splitPart} ${year}`);
  }

  // 4. Handle '&' and 'and'
  if (title.includes('&')) {
    add(title.replace(/&/g, 'and'));
  } else if (/\band\b/i.test(title)) {
    add(title.replace(/\band\b/gi, '&'));
  }

  // 5. TMDB official title variations if available
  if (tmdbTitle && tmdbTitle.toLowerCase() !== title.toLowerCase()) {
    add(tmdbTitle);
    const tmdbSplit = tmdbTitle.split(/[:\-\–\—]/)[0]?.trim();
    if (tmdbSplit && tmdbSplit.length >= 3 && tmdbSplit.toLowerCase() !== tmdbTitle.toLowerCase()) {
      add(tmdbSplit);
      if (year) add(`${tmdbSplit} ${year}`);
    } else if (year) {
      add(`${tmdbTitle} ${year}`);
    }
  }

  return variations.length > 0 ? variations : [title];
};

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
      const txt = `${l.name} ${l.quality || ''} ${l.url}`.toLowerCase();
      const isHevc = txt.includes('hevc') || txt.includes('x265') || txt.includes('10bit') || txt.includes('h.265');
      const bytes = l.bytes || 0;

      if (txt.includes('480p') || txt.includes('360p')) {
        has480p = true;
      }
      if (txt.includes('720p')) {
        has720p = true;
        if (isHevc) has720pHevc = true;
        if (bytes > 1.45 * 1024 * 1024 * 1024 || (l.size && parseFloat(l.size) > 1.45 && l.size.toLowerCase().includes('gb'))) {
          is720pLarge = true;
        }
      }
      if (txt.includes('1080p') || txt.includes('2160p') || txt.includes('4k')) {
        has1080p = true;
      }
    }

    const hevcSatisfied = is720pLarge ? has720pHevc : true;
    const isComplete = has480p && has720p && has1080p && hevcSatisfied;

    return { has480p, has720p, has720pHevc, has1080p, isComplete };
  };

  const scrapeFilmyGo = async (queries: string[] | string, signal: AbortSignal): Promise<{ links: ScrapedLinkItem[]; sample?: ScrapedLinkItem }> => {
    const domain = getFilmygoDomain();
    const qList = Array.isArray(queries) ? queries : [queries];

    for (const q of qList) {
      if (signal.aborted) break;
      try {
        const searchUrl = `${domain}/site-search.html?to-search=${encodeURIComponent(q)}&to-page=1`;
        const res = await fetch(`/api/filmygo?url=${encodeURIComponent(searchUrl)}`, { signal }).catch(() => null);
        if (!res || !res.ok) continue;
        const data = await res.json().catch(() => ({}));
        const posts = data.posts || [];
        if (!posts.length) continue;

        for (const post of posts.slice(0, 3)) {
          if (signal.aborted) break;
          const postRes = await fetch(`/api/filmygo?url=${encodeURIComponent(post.url)}`, { signal }).catch(() => null);
          if (!postRes || !postRes.ok) continue;
          const postData = await postRes.json().catch(() => ({}));
          const directLinks = postData.links || [];
          if (!directLinks.length) continue;

          const resultLinks: ScrapedLinkItem[] = [];
          for (const dl of directLinks) {
            if (!dl.url) continue;
            const scan = await performFullLinkScan(dl.url, {}, languages, qualities, signal).catch(() => null);
            resultLinks.push({
              name: dl.name || scan?.fileName || post.title || 'FilmyGo Link',
              url: scan?.finalUrl || dl.url,
              quality: scan?.qualityLabel || dl.quality,
              size: scan?.fileSizeText || dl.size,
              bytes: scan?.fileSize,
              audio: scan?.audioLabel || dl.audio,
              source: 'FilmyGo',
            });
          }

          if (resultLinks.length > 0) {
            return { links: resultLinks };
          }
        }
      } catch (e) {}
    }
    return { links: [] };
  };

  const scrapeHDHub4U = async (queries: string[] | string, signal: AbortSignal, needSample: boolean): Promise<{ links: ScrapedLinkItem[]; sample?: ScrapedLinkItem }> => {
    const domain = getHdhub4uDomain();
    const qList = Array.isArray(queries) ? queries : [queries];

    for (const q of qList) {
      if (signal.aborted) break;
      try {
        const searchUrl = `${domain}/search.html?q=${encodeURIComponent(q)}`;
        const res = await fetch(`/api/hdhub4u?url=${encodeURIComponent(searchUrl)}`, { signal }).catch(() => null);
        if (!res || !res.ok) continue;
        const data = await res.json().catch(() => ({}));
        const posts = data.posts || [];
        if (!posts.length) continue;

        for (const post of posts.slice(0, 3)) {
          if (signal.aborted) break;
          const postRes = await fetch(`/api/hdhub4u?url=${encodeURIComponent(post.url)}`, { signal }).catch(() => null);
          if (!postRes || !postRes.ok) continue;
          const postData = await postRes.json().catch(() => ({}));
          const rawCandidates = postData.candidates || postData.links || [];
          if (!rawCandidates.length) continue;

          const resultLinks: ScrapedLinkItem[] = [];
          let sampleLink: ScrapedLinkItem | undefined = undefined;

          for (const cand of rawCandidates) {
            const href = cand.href || cand.url;
            if (!href) continue;
            const scan = await performFullLinkScan(href, {}, languages, qualities, signal).catch(() => null);
            const isSamp = scan?.isSample || cand.isSample || /sample/i.test(cand.text || '') || /sample/i.test(scan?.fileName || '');
            
            const item: ScrapedLinkItem = {
              name: cand.text || scan?.fileName || post.title || 'HDHub4U Link',
              url: scan?.finalUrl || href,
              quality: scan?.qualityLabel,
              size: scan?.fileSizeText,
              bytes: scan?.fileSize,
              audio: scan?.audioLabel,
              isSample: isSamp,
              source: 'HDHub4U',
            };

            if (isSamp && needSample && !sampleLink) {
              sampleLink = item;
            } else {
              resultLinks.push(item);
            }
          }

          if (resultLinks.length > 0 || sampleLink) {
            return { links: resultLinks, sample: sampleLink };
          }
        }
      } catch (e) {}
    }
    return { links: [] };
  };

  const scrapeSkyMoviesHD = async (queries: string[] | string, signal: AbortSignal): Promise<{ links: ScrapedLinkItem[]; sample?: ScrapedLinkItem }> => {
    const domain = getSkymoviesDomain();
    const qList = Array.isArray(queries) ? queries : [queries];

    for (const q of qList) {
      if (signal.aborted) break;
      try {
        const searchUrl = `${domain}/search.php?search=${encodeURIComponent(q)}&cat=All`;
        const res = await fetch(`/api/skymovieshd?url=${encodeURIComponent(searchUrl)}`, { signal }).catch(() => null);
        if (!res || !res.ok) continue;
        const data = await res.json().catch(() => ({}));
        const posts = data.posts || [];
        if (!posts.length) continue;

        for (const post of posts.slice(0, 3)) {
          if (signal.aborted) break;
          const postRes = await fetch(`/api/skymovieshd?url=${encodeURIComponent(post.url)}`, { signal }).catch(() => null);
          if (!postRes || !postRes.ok) continue;
          const postData = await postRes.json().catch(() => ({}));
          const directLinks = postData.links || [];
          if (!directLinks.length) continue;

          const resultLinks: ScrapedLinkItem[] = [];
          for (const dl of directLinks) {
            if (!dl.url) continue;
            const scan = await performFullLinkScan(dl.url, {}, languages, qualities, signal).catch(() => null);
            resultLinks.push({
              name: dl.name || scan?.fileName || post.title || 'SkyMoviesHD Link',
              url: scan?.finalUrl || dl.url,
              quality: scan?.qualityLabel || dl.quality,
              size: scan?.fileSizeText || dl.size,
              bytes: scan?.fileSize,
              audio: scan?.audioLabel || dl.audio,
              source: 'SkyMoviesHD',
            });
          }

          if (resultLinks.length > 0) {
            return { links: resultLinks };
          }
        }
      } catch (e) {}
    }
    return { links: [] };
  };

  const scrapeMoviesDrive = async (queries: string[] | string, signal: AbortSignal): Promise<{ links: ScrapedLinkItem[]; sample?: ScrapedLinkItem }> => {
    const domain = getMoviesdriveDomain();
    const qList = Array.isArray(queries) ? queries : [queries];

    for (const q of qList) {
      if (signal.aborted) break;
      try {
        const searchUrl = `${domain}/search.html?q=${encodeURIComponent(q)}&page=1`;
        const res = await fetch(`/api/moviesdrive?url=${encodeURIComponent(searchUrl)}`, { signal }).catch(() => null);
        if (!res || !res.ok) continue;
        const data = await res.json().catch(() => ({}));
        const posts = data.posts || [];
        if (!posts.length) continue;

        for (const post of posts.slice(0, 3)) {
          if (signal.aborted) break;
          const postRes = await fetch(`/api/moviesdrive?url=${encodeURIComponent(post.url)}`, { signal }).catch(() => null);
          if (!postRes || !postRes.ok) continue;
          const postData = await postRes.json().catch(() => ({}));
          const directLinks = postData.links || [];
          if (!directLinks.length) continue;

          const resultLinks: ScrapedLinkItem[] = [];
          for (const dl of directLinks) {
            if (!dl.url) continue;
            const scan = await performFullLinkScan(dl.url, {}, languages, qualities, signal).catch(() => null);
            resultLinks.push({
              name: dl.name || scan?.fileName || post.title || 'MoviesDrive Link',
              url: scan?.finalUrl || dl.url,
              quality: scan?.qualityLabel || dl.quality,
              size: scan?.fileSizeText || dl.size,
              bytes: scan?.fileSize,
              audio: scan?.audioLabel || dl.audio,
              source: 'MoviesDrive',
            });
          }

          if (resultLinks.length > 0) {
            return { links: resultLinks };
          }
        }
      } catch (e) {}
    }
    return { links: [] };
  };

  const scrapeFilmyFly = async (queries: string[] | string, signal: AbortSignal): Promise<{ links: ScrapedLinkItem[]; sample?: ScrapedLinkItem }> => {
    const domain = getFilmyflyDomain();
    const qList = Array.isArray(queries) ? queries : [queries];

    for (const q of qList) {
      if (signal.aborted) break;
      try {
        const searchUrl = `${domain}/search.html?search=${encodeURIComponent(q)}&page=1`;
        const res = await fetch(`/api/filmyfly?url=${encodeURIComponent(searchUrl)}`, { signal }).catch(() => null);
        if (!res || !res.ok) continue;
        const data = await res.json().catch(() => ({}));
        const posts = data.posts || [];
        if (!posts.length) continue;

        for (const post of posts.slice(0, 3)) {
          if (signal.aborted) break;
          const postRes = await fetch(`/api/filmyfly?url=${encodeURIComponent(post.url)}`, { signal }).catch(() => null);
          if (!postRes || !postRes.ok) continue;
          const postData = await postRes.json().catch(() => ({}));
          const directLinks = postData.links || [];
          if (!directLinks.length) continue;

          const resultLinks: ScrapedLinkItem[] = [];
          for (const dl of directLinks) {
            if (!dl.url) continue;
            const scan = await performFullLinkScan(dl.url, {}, languages, qualities, signal).catch(() => null);
            resultLinks.push({
              name: dl.name || scan?.fileName || post.title || 'FilmyFly Link',
              url: scan?.finalUrl || dl.url,
              quality: scan?.qualityLabel || dl.quality,
              size: scan?.fileSizeText || dl.size,
              bytes: scan?.fileSize,
              audio: scan?.audioLabel || dl.audio,
              source: 'FilmyFly',
            });
          }

          if (resultLinks.length > 0) {
            return { links: resultLinks };
          }
        }
      } catch (e) {}
    }
    return { links: [] };
  };

  const processSingleItem = async (item: BatchItem, signal: AbortSignal) => {
    const updateItem = (updates: Partial<BatchItem>) => {
      setQueue((prev) => prev.map((it) => (it.id === item.id ? { ...it, ...updates } : it)));
    };

    updateItem({ status: 'searching_tmdb', logs: ['Searching TMDB for metadata...'] });

    let tmdb: any = null;
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
        updateItem({
          tmdbData: tmdb,
          type: (top.media_type === 'tv' || tmdb.number_of_seasons) ? 'series' : 'movie',
          logs: [`Found TMDB: ${tmdb.title || tmdb.name} (${(tmdb.release_date || tmdb.first_air_date || '').split('-')[0]})`],
        });
      } else {
        updateItem({ logs: ['TMDB: No match, using title as-is'] });
      }
    } catch (e) {
      updateItem({ logs: ['TMDB search skipped/failed'] });
    }

    updateItem({ status: 'scraping' });

    let accumulatedLinks: ScrapedLinkItem[] = [];
    let discoveredSample: ScrapedLinkItem | undefined = undefined;

    // Generate comprehensive search query variations
    const queries = generateSearchVariations(item.cleanTitle, item.year, tmdb?.title || tmdb?.name);
    updateItem({
      logs: [`Generated search variations: ${queries.slice(0, 3).map((q) => `"${q}"`).join(', ')}`],
    });

    // Site Priority List: 1. FilmyGo, 2. HDHub4U, 3. SkyMoviesHD, 4. MoviesDrive, 5. FilmyFly
    const providers = [
      { name: 'FilmyGo' as const, fn: (q: string[], sig: AbortSignal) => scrapeFilmyGo(q, sig) },
      { name: 'HDHub4U' as const, fn: (q: string[], sig: AbortSignal) => scrapeHDHub4U(q, sig, true) },
      { name: 'SkyMoviesHD' as const, fn: (q: string[], sig: AbortSignal) => scrapeSkyMoviesHD(q, sig) },
      { name: 'MoviesDrive' as const, fn: (q: string[], sig: AbortSignal) => scrapeMoviesDrive(q, sig) },
      { name: 'FilmyFly' as const, fn: (q: string[], sig: AbortSignal) => scrapeFilmyFly(q, sig) },
    ];

    for (const provider of providers) {
      if (signal.aborted) break;

      updateItem({
        currentProvider: provider.name,
        logs: [`Scanning ${provider.name}...`],
      });

      try {
        const res = await provider.fn(queries, signal);
        if (res.sample && !discoveredSample) {
          discoveredSample = res.sample;
        }

        if (res.links && res.links.length > 0) {
          accumulatedLinks = [...accumulatedLinks, ...res.links];
          const check = checkQualitiesSatisfaction(accumulatedLinks);
          updateItem({
            discoveredLinks: accumulatedLinks,
            sampleLink: discoveredSample,
            has480p: check.has480p,
            has720p: check.has720p,
            has720pHevc: check.has720pHevc,
            has1080p: check.has1080p,
            isComplete: check.isComplete,
            logs: [
              `Scraped ${res.links.length} links from ${provider.name}`,
              `Qualities: [480p: ${check.has480p ? '✓' : '✗'}, 720p: ${check.has720p ? '✓' : '✗'}, 720p HEVC: ${check.has720pHevc ? '✓' : '✗'}, 1080p: ${check.has1080p ? '✓' : '✗'}]`,
            ],
          });

          // If all required qualities found, skip remaining providers!
          if (check.isComplete) {
            updateItem({
              logs: [`All resolutions satisfied (480p, 720p, HEVC, 1080p). Skipping remaining providers.`],
            });
            break;
          }
        }
      } catch (err: any) {
        updateItem({
          logs: [`${provider.name} search failed: ${err.message || 'Error'}`],
        });
      }
    }

    const finalCheck = checkQualitiesSatisfaction(accumulatedLinks);
    const finalStatus = accumulatedLinks.length === 0 ? 'failed' : finalCheck.isComplete ? 'completed' : 'partial';

    updateItem({
      status: finalStatus,
      currentProvider: undefined,
      isComplete: finalCheck.isComplete,
      logs: [
        finalStatus === 'completed'
          ? 'Complete: All qualities found!'
          : finalStatus === 'partial'
          ? `Partial: Discovered ${accumulatedLinks.length} links.`
          : 'Failed: No links found across 5 providers.',
      ],
    });

    if (autoImportWhenComplete && accumulatedLinks.length > 0) {
      await importSingleItem({
        ...item,
        tmdbData: tmdb,
        discoveredLinks: accumulatedLinks,
        sampleLink: discoveredSample,
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
    abortControllerRef.current = null;
    vibrate(40);
  };

  const handleStopBatch = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsProcessing(false);
    vibrate(50);
  };

  const importSingleItem = async (item: BatchItem) => {
    if (item.discoveredLinks.length === 0) return;

    const newId = Math.random().toString(36).substr(2, 9);
    const maxOrder = contentList.length > 0 ? Math.max(...contentList.map((c) => c.order || 0)) : 0;

    // Match genres properly
    const matchedGenres: string[] = [];
    if (item.tmdbData?.genres && Array.isArray(item.tmdbData.genres)) {
      item.tmdbData.genres.forEach((tg: any) => {
        const tName = (tg.name || '').toLowerCase();
        const found = genres.find((g) => g.name.toLowerCase() === tName);
        if (found && !matchedGenres.includes(found.id)) {
          matchedGenres.push(found.id);
        }
      });
    }
    if (matchedGenres.length === 0 && genres.length > 0) {
      matchedGenres.push(genres[0].id);
    }

    // Match language
    let matchedLang = languages[0]?.id || '';
    if (item.tmdbData?.original_language) {
      const orig = (item.tmdbData.original_language || '').toLowerCase();
      const foundLang = languages.find((l) => 
        l.name.toLowerCase().includes(orig) ||
        (orig === 'hi' && l.name.toLowerCase().includes('hindi')) ||
        (orig === 'en' && l.name.toLowerCase().includes('english')) ||
        (orig === 'pa' && l.name.toLowerCase().includes('punjabi')) ||
        (orig === 'ta' && l.name.toLowerCase().includes('tamil')) ||
        (orig === 'te' && l.name.toLowerCase().includes('telugu')) ||
        (orig === 'ko' && l.name.toLowerCase().includes('korean')) ||
        (orig === 'ja' && l.name.toLowerCase().includes('japanese'))
      );
      if (foundLang) matchedLang = foundLang.id;
    }

    // Match quality
    let matchedQuality = qualities[0]?.id || '';
    if (item.has1080p) {
      const q1080 = qualities.find((q) => /1080/i.test(q.name));
      if (q1080) matchedQuality = q1080.id;
    } else if (item.has720p || item.has720pHevc) {
      const q720 = qualities.find((q) => /720/i.test(q.name));
      if (q720) matchedQuality = q720.id;
    } else if (item.has480p) {
      const q480 = qualities.find((q) => /480/i.test(q.name));
      if (q480) matchedQuality = q480.id;
    }

    const movieLinksData = item.type === 'movie'
      ? item.discoveredLinks.map((l) => ({
          name: l.name,
          url: l.url,
          quality: l.quality || '1080p',
          size: l.size || '',
          audio: l.audio || 'Hindi',
        }))
      : [];

    const contentData: any = {
      id: newId,
      order: maxOrder + 1,
      title: item.tmdbData?.title || item.tmdbData?.name || item.cleanTitle,
      secondTitle: item.tmdbData?.original_title || item.tmdbData?.original_name || '',
      description: item.tmdbData?.overview || '',
      type: item.type,
      year: item.year || (item.tmdbData?.release_date || item.tmdbData?.first_air_date ? parseInt((item.tmdbData.release_date || item.tmdbData.first_air_date).split('-')[0], 10) : new Date().getFullYear()),
      posterUrl: item.tmdbData?.poster_path ? `https://image.tmdb.org/t/p/w500${item.tmdbData.poster_path}` : '',
      backdropUrl: item.tmdbData?.backdrop_path ? `https://image.tmdb.org/t/p/original${item.tmdbData.backdrop_path}` : '',
      runtime: item.tmdbData?.runtime || (item.tmdbData?.episode_run_time ? item.tmdbData.episode_run_time[0] : 120),
      imdbRating: item.tmdbData?.vote_average ? item.tmdbData.vote_average.toFixed(1) : '7.0',
      status: 'published',
      qualityId: matchedQuality,
      languageId: matchedLang,
      movieLinks: item.type === 'movie' ? JSON.stringify(movieLinksData) : '[]',
      seasons: '[]',
      fullSeasonZip: '[]',
      fullSeasonMkv: '[]',
      genres: matchedGenres,
      updatedAt: new Date().toISOString(),
    };

    try {
      await saveContent(contentData as any);
      setQueue((prev) => prev.map((it) => (it.id === item.id ? { ...it, imported: true } : it)));
      vibrate(20);
    } catch (e) {
      console.error('Import error:', e);
    }
  };

  const handleImportAllReady = async () => {
    const readyItems = queue.filter((i) => !i.imported && i.discoveredLinks.length > 0);
    for (const it of readyItems) {
      await importSingleItem(it);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative w-full max-w-4xl max-h-[90vh] bg-zinc-900 border border-zinc-800 rounded-2xl flex flex-col shadow-2xl overflow-hidden text-zinc-100"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Bulk Content Importer & Auto-Scraper
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Priority Queue
                </span>
              </h2>
              <p className="text-xs text-zinc-400">
                Auto-scrapes FilmyGo ➔ HDHub4U ➔ SkyMoviesHD ➔ MoviesDrive ➔ FilmyFly
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

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Multi-line input */}
          <div className="bg-zinc-950/40 p-4 rounded-xl border border-zinc-800/80 space-y-3">
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Enter Titles to Search (One per line)
            </label>
            <textarea
              value={inputLines}
              onChange={(e) => setInputLines(e.target.value)}
              placeholder={`Kalki 2898 AD 2024\nDeadpool & Wolverine 2024\nStree 2\nMirzapur Season 3`}
              rows={4}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500 font-mono transition-colors"
            />
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-zinc-500">
                {inputLines.split('\n').filter((l) => l.trim().length > 0).length} titles detected
              </span>
              <button
                onClick={handleCreateQueue}
                disabled={!inputLines.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-md"
              >
                <Plus className="w-4 h-4" /> Add to Scraping Queue
              </button>
            </div>
          </div>

          {/* Queue Actions Bar */}
          {queue.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-4 bg-zinc-950/80 p-4 rounded-xl border border-zinc-800">
              <div className="flex items-center gap-4">
                <span className="text-sm font-semibold text-white">
                  Queue: {queue.length} items
                </span>
                <span className="text-xs text-zinc-400">
                  Completed: {queue.filter((i) => i.status === 'completed').length} / Imported: {queue.filter((i) => i.imported).length}
                </span>
              </div>

              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoImportWhenComplete}
                    onChange={(e) => setAutoImportWhenComplete(e.target.checked)}
                    className="rounded border-zinc-700 bg-zinc-900 text-emerald-500 focus:ring-0"
                  />
                  Auto-Import to Library
                </label>

                {isProcessing ? (
                  <button
                    onClick={handleStopBatch}
                    className="flex items-center gap-2 px-4 py-2 bg-red-600/20 text-red-400 border border-red-500/30 hover:bg-red-600/30 rounded-xl text-xs font-bold transition-colors"
                  >
                    <X className="w-4 h-4" /> Stop Scraping
                  </button>
                ) : (
                  <button
                    onClick={handleStartBatch}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-colors shadow-md"
                  >
                    <Play className="w-4 h-4" /> Start Auto-Scraping
                  </button>
                )}

                <button
                  onClick={handleImportAllReady}
                  disabled={queue.filter((i) => !i.imported && i.discoveredLinks.length > 0).length === 0}
                  className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-colors"
                >
                  <Database className="w-4 h-4" /> Import All Scraped
                </button>
              </div>
            </div>
          )}

          {/* Queue List */}
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
                          {item.status === 'scraping' && (
                            <span className="flex items-center gap-1 text-[11px] text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded-full border border-cyan-500/20 animate-pulse">
                              <Loader2 className="w-3 h-3 animate-spin" /> Scraping {item.currentProvider}...
                            </span>
                          )}
                          {item.status === 'completed' && (
                            <span className="flex items-center gap-1 text-[11px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                              <CheckCircle2 className="w-3 h-3" /> All Qualities Found
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
                            Discovered Media Links ({item.discoveredLinks.length})
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
                                      {link.quality || 'HD'}
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
                                    {link.name}
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
        </div>
      </motion.div>
    </div>
  );
};
