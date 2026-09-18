import React, { useMemo, useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Link as LinkIcon,
  ClipboardPaste,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  Copy,
  Trash2,
  FileDown,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Info,
  Siren,
  Plus,
  X,
  Server,
  Search,
  Download,
  ExternalLink,
  Film,
  Globe,
  Loader2 as LoaderIcon,
  CheckSquare,
  Check,
  LayoutList,
  LayoutGrid,
  SlidersHorizontal,
  Tv,
  Package,
  Layers
} from "lucide-react";
import { QualityLinks, Language, Quality, LinkDef, Content } from '../types';
export type { QualityLinks };
import { useAdminContent } from '../contexts/AdminContentContext';
import {
  runWaterfallLinkSearch,
  WaterfallSearchResult,
} from '../utils/bulkImporterWaterfall';
import { getImportCache, saveImportCache } from '../utils/importCache';
import { 
  LinkCheckResult, 
  StatusLabel, 
  normalizeUrl, 
  splitLinks, 
  guessLinkType, 
  detectMetadataForLink, 
  buildMismatchWarnings,
  performFullLinkScan,
  isEpisodeRange
} from '../utils/linkScanner';
import { useModalBehavior } from '../hooks/useModalBehavior';
import {
  getMoviesdriveDomain,
  setMoviesdriveDomain,
  getSkymoviesDomain,
  setSkymoviesDomain,
  getFilmygoDomain,
  setFilmygoDomain,
  getHdhub4uDomain,
  setHdhub4uDomain,
  getFilmyflyDomain,
  setFilmyflyDomain,
  DEFAULT_FILMYFLY_DOMAIN
} from '../utils/domains';

import {
  getItemEpisodeInfo,
  QualityCategory,
  QUALITY_ORDER,
  QUALITY_LABELS,
  QUALITY_COLORS,
  getItemQualityCategory,
  sortHitsByEpisodeAndQuality,
  sortResultsByEpisodeAndQuality,
  getLocationTag,
  hasSeriesOrZipIndicator,
  isMissingPixeldrain,
} from '../utils/episodeAndQuality';

import {
  extractTitleAndYear,
  normalizeTitle,
  normalizeNumerals,
  extractSequelTag,
  normalizeCleanForMatch,
  tokenizeCleanForMatch,
  levenshteinDistance,
  isPreciseTitleMatch,
  isFlexibleTitleMatch,
} from '../utils/titleMatcher';

import {
  getMediaLinksFromContent,
  getAllUrlsFromContent,
  checkGalleryAvailability,
} from '../utils/galleryChecker';

import {
  filterFilmygoHits,
  filterMoviesdriveHits,
  filterHdhub4uHits,
  filterSkymoviesHits,
  filterFilmyflyHits,
  rankAndVerifyPosts,
  deduplicateQualityLinks,
  pickLowerSizeQualityItem,
  resolveConfirmedQuality,
  parseSizeToBytes,
  selectMoviesdriveOrHdhub4uSeriesLinks,
  isSeriesPostOrHits,
} from '../utils/linkSelector';
import type { ScrapedLinkItem } from '../utils/linkSelector';
import { checkContentViaLinkChecker } from '../utils/scraper';
import type {
  CheckContentViaLinkCheckerOptions,
  CheckContentViaLinkCheckerResult,
} from '../utils/scraper';

import { PostPoster } from './link-checker/PostPoster';
import { DomainSettingsModal } from './link-checker/DomainSettingsModal';
import { BatchReviewModal, BatchReviewItem } from './link-checker/BatchReviewModal';

export {
  getItemEpisodeInfo,
  QUALITY_ORDER,
  QUALITY_LABELS,
  QUALITY_COLORS,
  getItemQualityCategory,
  sortHitsByEpisodeAndQuality,
  sortResultsByEpisodeAndQuality,
  getLocationTag,
  hasSeriesOrZipIndicator,
  isMissingPixeldrain,
  extractTitleAndYear,
  normalizeTitle,
  normalizeNumerals,
  extractSequelTag,
  normalizeCleanForMatch,
  tokenizeCleanForMatch,
  levenshteinDistance,
  isPreciseTitleMatch,
  isFlexibleTitleMatch,
  getMediaLinksFromContent,
  getAllUrlsFromContent,
  checkGalleryAvailability,
  filterFilmygoHits,
  rankAndVerifyPosts,
  deduplicateQualityLinks,
  pickLowerSizeQualityItem,
  resolveConfirmedQuality,
  parseSizeToBytes,
  checkContentViaLinkChecker,
};

export type {
  QualityCategory,
  ScrapedLinkItem,
  CheckContentViaLinkCheckerOptions,
  CheckContentViaLinkCheckerResult,
  BatchReviewItem,
};


type Props = {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  initialInput?: string;
  initialTitle?: string;
  initialYear?: number | string;
  contentType?: "movie" | "series";
  autoStart?: boolean;
  isBatchMode?: boolean;
  onAddLinks?: (
    links: QualityLinks,
    metadata?: {
      languages: string[];
      printQuality?: string;
      subtitles?: boolean;
      type?: "movie" | "series";
      season?: number;
      episode?: number;
      title?: string;
      year?: number;
      sampleUrl?: string;
    }
  ) => void;
  onBatchAddLinks?: (
    batches: {
      title: string;
      year?: number;
      links: QualityLinks;
      metadata: any;
    }[]
  ) => void;
  onResults?: (results: LinkCheckResult[]) => void;
  content?: Content | null;
  languages?: Language[];
  qualities?: Quality[];
  disableAutoClipboard?: boolean;
};

const badgeMap: Record<StatusLabel, string> = {
  WORKING: "bg-emerald-500/15 text-emerald-400 border-emerald-800/80",
  REDIRECT: "bg-cyan-500/15 text-cyan-400 border-cyan-800/80",
  PROTECTED: "bg-yellow-500/15 text-yellow-400 border-yellow-800/80",
  BROKEN: "bg-red-500/15 text-red-400 border-red-800/80",
  UNAVAILABLE: "bg-orange-500/15 text-orange-400 border-orange-800/80",
  UNKNOWN: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-300 border-zinc-300 dark:border-zinc-700",
  MISSING_FILENAME: "bg-pink-500/15 text-pink-400 border-pink-800/80",
  MISSING_METADATA: "bg-pink-500/15 text-pink-400 border-pink-800/80",
  SMALL_FILE: "bg-orange-500/15 text-orange-400 border-orange-800/80",
  SIZE_MISMATCH: "bg-red-500/15 text-red-400 border-red-800/80",
};

function extractEpisodeNumber(fileName: string, index: number): string {
  const match = fileName.match(/\b(?:ep|episode|e)\s*0*(\d+)\b/i);
  if (match) {
    const num = parseInt(match[1], 10);
    return `EP ${num < 10 ? '0' + num : num}`;
  }
  const match2 = fileName.match(/\bE(\d+)\b/i);
  if (match2) {
    const num = parseInt(match2[1], 10);
    return `EP ${num < 10 ? '0' + num : num}`;
  }
  const num = index + 1;
  return `EP ${num < 10 ? '0' + num : num}`;
}

function extractDisplayHeading(headingText: string): string {
  const qMatch = headingText.match(/\b(?:480p|720p|1080p|2160p|4k|2k)[\s\S]*$/i);
  if (!qMatch) return headingText;
  return qMatch[0].trim();
}

export const LinkCheckerModal: React.FC<Props> = ({
  isOpen,
  onClose,
  title = "Link Checker",
  initialInput = "",
  initialTitle = "",
  initialYear,
  contentType,
  autoStart = false,
  isBatchMode = false,
  onAddLinks,
  onBatchAddLinks,
  onResults,
  content,
  languages = [],
  qualities = [],
  disableAutoClipboard = false,
}) => {
  const { contentList = [] } = useAdminContent();
  const [availabilityFilter, setAvailabilityFilter] = useState<'all' | 'missing' | 'available'>('all');
  const [showDomainSettings, setShowDomainSettings] = useState(false);
  const [moviesdriveDomainInput, setMoviesdriveDomainInput] = useState(() => getMoviesdriveDomain());
  const [skymoviesDomainInput, setSkymoviesDomainInput] = useState(() => getSkymoviesDomain());
  const [filmygoDomainInput, setFilmygoDomainInput] = useState(() => getFilmygoDomain());
  const [hdhubDomainInput, setHdhubDomainInput] = useState(() => getHdhub4uDomain());
  const [filmyflyDomainInput, setFilmyflyDomainInput] = useState(() => getFilmyflyDomain());

  const handleSaveDomains = () => {
    if (moviesdriveDomainInput) setMoviesdriveDomain(moviesdriveDomainInput);
    if (skymoviesDomainInput) setSkymoviesDomain(skymoviesDomainInput);
    if (filmygoDomainInput) setFilmygoDomain(filmygoDomainInput);
    if (hdhubDomainInput) setHdhub4uDomain(hdhubDomainInput);
    if (filmyflyDomainInput) setFilmyflyDomain(filmyflyDomainInput);
    setShowDomainSettings(false);
  };
  const [input, setInput] = useState(initialInput);
  const inputRef = React.useRef(input);
  useEffect(() => {
    inputRef.current = input;
  }, [input]);

  const [autoClipboard, setAutoClipboard] = useState(false);
  const [clipboardStatus, setClipboardStatus] = useState<"active" | "unfocused" | "denied" | "idle">("idle");

  const getDefaultWaterfallEnabled = useCallback(() => {
    // Disabled by default when open by batch fetch
    if (isBatchMode || Boolean(title && /batch/i.test(title))) {
      return false;
    }
    // Enabled by default when open by any existing content
    if (content || (initialTitle && initialTitle.trim())) {
      return true;
    }
    return false;
  }, [isBatchMode, title, content, initialTitle]);

  const [titleImportWaterfall, setTitleImportWaterfall] = useState<boolean>(getDefaultWaterfallEnabled);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<LinkCheckResult[]>([]);
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set());
  const [detectedSampleUrl, setDetectedSampleUrl] = useState<string | null>(null);
  const [detectedMetadata, setDetectedMetadata] = useState<any>(null);
  const isHubcloudVariant = (u: string) => /(hubcloud|vcloud|hubdrive|drivehub|gdflix|hubcdn|hblinks)/i.test(u);

  const eligibleUrlsForSelect = useMemo(() => {
    return results.filter(r => {
      const isHubcloud = isHubcloudVariant(r.url);
      if (!isHubcloud) return true;
      const hasPixeldrain = !!r.candidates?.some(c => c.text.toLowerCase().includes("pixeldrain") || c.href.toLowerCase().includes("pixeldrain"));
      return hasPixeldrain;
    }).map(r => r.url);
  }, [results]);

  const areAllEligibleSelected = useMemo(() => {
    if (eligibleUrlsForSelect.length === 0) return false;
    return eligibleUrlsForSelect.every(url => selectedUrls.has(url));
  }, [eligibleUrlsForSelect, selectedUrls]);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [isReviewingBatch, setIsReviewingBatch] = useState(false);
  const [batchReviewItems, setBatchReviewItems] = useState<{
    key: string;
    title: string;
    year: string;
    links: QualityLinks;
    metadata: any;
  }[]>([]);

  // MDrive Scraper State
  const [mdriveUrl, setMdriveUrl] = useState<string | null>(null);
  const [mdriveResults, setMdriveResultsState] = useState<any[]>([]);
  const setMdriveResults = (hits: any[]) => {
    setMdriveResultsState(sortHitsByEpisodeAndQuality(hits));
  };
  const [mdriveLoading, setMdriveLoading] = useState(false);
  const [mdriveError, setMdriveError] = useState<string | null>(null);
  const [mdriveSelectedIndices, setMdriveSelectedIndices] = useState<Set<number>>(new Set());
  const [mdriveExtractingDirect, setMdriveExtractingDirect] = useState<Record<number, boolean>>({});
  const [preloadedEpisodes, setPreloadedEpisodes] = useState<Record<string, { file_name: string; url: string; size?: string | null }[]>>({});
  const [loadingEpisodes, setLoadingEpisodes] = useState<Record<string, boolean>>({});
  const [expandedEpisodes, setExpandedEpisodes] = useState<Record<string, boolean>>({});
  const [selectedSubEpisodes, setSelectedSubEpisodes] = useState<Record<string, Set<string>>>({});
  const processedExtractionsRef = React.useRef<Set<string>>(new Set());

  // Preload all mdrive.lol single episodes automatically when mdriveResults is populated
  React.useEffect(() => {
    if (mdriveResults.length === 0) return;

    mdriveResults.forEach(item => {
      const url = item.url;
      const isMdrive = /(?:mdrive|mdrvie)\.lol\/archive\//i.test(url);
      const isSingleEpisode = (item.file_name || '').toLowerCase().includes('single episode') || (item.file_name || '').toLowerCase().includes('single ep');
      
      if (isMdrive && isSingleEpisode && !preloadedEpisodes[url] && !loadingEpisodes[url]) {
        setLoadingEpisodes(prev => ({ ...prev, [url]: true }));
        // Don't show episodes expanded by default - keep collapsed
        setExpandedEpisodes(prev => ({ ...prev, [url]: false }));
        
        fetch(`/api/mdrive?url=${encodeURIComponent(url)}`)
          .then(res => {
            if (res.ok) return res.json();
            throw new Error('Preload failed');
          })
          .then(data => {
            if (data.hits) {
              setPreloadedEpisodes(prev => ({ ...prev, [url]: data.hits }));
              // Auto-select all sub-episodes by default
              setSelectedSubEpisodes(prev => ({ ...prev, [url]: new Set(data.hits.map((h: any) => h.url)) }));
            }
          })
          .catch(err => console.error('Failed to preload sub-episodes automatically:', err))
          .finally(() => {
            setLoadingEpisodes(prev => ({ ...prev, [url]: false }));
          });
      }
    });
  }, [mdriveResults]);

  // Quality Filtering & Quick Selection State
  const [showQuickSelect, setShowQuickSelect] = useState(false);
  const [qualityFilter, setQualityFilter] = useState<'all' | '480p' | '720p' | '1080p' | '2160p'>('all');

  const qualityCounts = useMemo(() => {
    const counts = { '480p': 0, '720p': 0, '1080p': 0, '2160p': 0, 'other': 0 };
    mdriveResults.forEach(item => {
      const q = getItemQualityCategory(item);
      if (q === '480p') counts['480p']++;
      else if (q === '720p') counts['720p']++;
      else if (q === '1080p') counts['1080p']++;
      else if (q === '2160p') counts['2160p']++;
      else counts['other']++;
    });
    return counts;
  }, [mdriveResults]);

  const selectAllOfQuality = (quality?: '480p' | '720p' | '1080p' | '2160p') => {
    if (!quality) {
      setMdriveSelectedIndices(new Set(mdriveResults.keys()));
      return;
    }
    const next = new Set(mdriveSelectedIndices);
    mdriveResults.forEach((item, idx) => {
      const q = getItemQualityCategory(item);
      if (q === quality) {
        next.add(idx);
      }
    });
    setMdriveSelectedIndices(next);
  };

  const filteredMdriveResults = useMemo(() => {
    if (qualityFilter === 'all') return mdriveResults.map((item, originalIndex) => ({ item, originalIndex }));
    return mdriveResults
      .map((item, originalIndex) => ({ item, originalIndex }))
      .filter(({ item }) => {
        const q = getItemQualityCategory(item);
        if (qualityFilter === '480p') return q === '480p';
        if (qualityFilter === '720p') return q === '720p';
        if (qualityFilter === '1080p') return q === '1080p';
        if (qualityFilter === '2160p') return q === '2160p';
        return true;
      });
  }, [mdriveResults, qualityFilter]);

  // Episode & Pack Grouping State
  const [contentTypeFilter, setContentTypeFilter] = useState<'all' | 'episodes' | 'packs'>('all');
  const [episodeGroupingMode, setEpisodeGroupingMode] = useState<'quality' | 'episode'>('quality');

  const parsedMdriveGroups = useMemo(() => {
    const packs: { item: any; originalIndex: number; info: ReturnType<typeof getItemEpisodeInfo>; qualityCat: QualityCategory }[] = [];
    const episodesMap = new Map<number, { item: any; originalIndex: number; info: ReturnType<typeof getItemEpisodeInfo>; qualityCat: QualityCategory }[]>();
    const episodesByQuality = new Map<QualityCategory, { item: any; originalIndex: number; info: ReturnType<typeof getItemEpisodeInfo>; qualityCat: QualityCategory }[]>();
    const others: { item: any; originalIndex: number; info: ReturnType<typeof getItemEpisodeInfo>; qualityCat: QualityCategory }[] = [];

    QUALITY_ORDER.forEach(q => episodesByQuality.set(q, []));

    mdriveResults.forEach((item, originalIndex) => {
      const info = getItemEpisodeInfo(item);
      const qualityCat = getItemQualityCategory(item);
      const entry = { item, originalIndex, info, qualityCat };

      if (info.isPack) {
        packs.push(entry);
      } else if (info.isEpisode && info.epNumber !== undefined) {
        const epList = episodesMap.get(info.epNumber) || [];
        epList.push(entry);
        episodesMap.set(info.epNumber, epList);

        const qList = episodesByQuality.get(qualityCat) || [];
        qList.push(entry);
        episodesByQuality.set(qualityCat, qList);
      } else {
        others.push(entry);
      }
    });

    // Sort episodes inside each quality group by episode number ascending, then season
    episodesByQuality.forEach(list => {
      list.sort((a, b) => {
        if (a.info.seasonNumber !== undefined && b.info.seasonNumber !== undefined && a.info.seasonNumber !== b.info.seasonNumber) {
          return a.info.seasonNumber - b.info.seasonNumber;
        }
        if (a.info.epNumber !== undefined && b.info.epNumber !== undefined && a.info.epNumber !== b.info.epNumber) {
          return a.info.epNumber - b.info.epNumber;
        }
        return (a.item.file_name || '').localeCompare(b.item.file_name || '', undefined, { numeric: true });
      });
    });

    const sortedEpKeys = Array.from(episodesMap.keys()).sort((a, b) => a - b);
    const totalEpisodesCount = sortedEpKeys.reduce((acc, k) => acc + (episodesMap.get(k)?.length || 0), 0);
    const activeQualityCategories = QUALITY_ORDER.filter(q => (episodesByQuality.get(q)?.length || 0) > 0);

    return {
      packs,
      episodesMap,
      episodesByQuality,
      activeQualityCategories,
      sortedEpKeys,
      others,
      totalPacksCount: packs.length,
      totalEpisodesCount,
      hasEpisodes: totalEpisodesCount > 0
    };
  }, [mdriveResults]);

  const moviesdriveSeriesGroups = useMemo(() => {
    const isSeries = mdriveResults.some(item => {
      const name = `${item.file_name || ''} ${item.quality || ''} ${item.url || ''}`.toLowerCase();
      return (
        name.includes('season') ||
        name.includes('episode') ||
        name.includes('ep ') ||
        name.includes('single ep') ||
        /\bs\d+\b/i.test(name) ||
        /\be\d+\b/i.test(name) ||
        /\bpack\b/i.test(name) ||
        /\bzip\b/i.test(name) ||
        /\bbatch\b/i.test(name) ||
        /\bcomplete\b/i.test(name)
      );
    });

    if (!isSeries) return null;

    const seasonsMap = new Map<string, Map<string, {
      headingText: string;
      qualityCat: QualityCategory;
      singleEpisodeItem?: { item: any; originalIndex: number };
      zipItem?: { item: any; originalIndex: number };
      directEpisodes: { item: any; originalIndex: number; epNumber?: number }[];
      others: { item: any; originalIndex: number }[];
    }>>();

    // Pass 1: Identify and create groups for "Single Episode" items first since they have the most complete headings
    mdriveResults.forEach((item, originalIndex) => {
      const label = item.file_name || '';
      
      const seasonMatch = label.match(/\b(?:season|s)\s*0*(\d+)\b/i);
      const seasonName = seasonMatch ? `Season ${seasonMatch[1]}` : "Season 1";

      let headingText = label;
      let optionText = label;
      if (label.includes('|')) {
        const parts = label.split('|');
        headingText = parts[0].trim();
        optionText = parts[1].trim();
      }

      const qCat = getItemQualityCategory(item);
      const optLower = optionText.toLowerCase();
      const isSingleEpisode = optLower.includes('single episode') || optLower.includes('single ep');

      if (isSingleEpisode) {
        const cleanHeading = headingText
          .replace(/\/\s*E\b/gi, '')
          .replace(/\/\s*ep(?:isodes?)?\b/gi, '')
          .replace(/\bSingle\b/gi, '')
          .replace(/\s+/g, ' ')
          .trim();

        const qMatch = cleanHeading.match(/\b(?:480p|720p|1080p|2160p|4k|2k)[\s\S]*$/i);
        const qualityText = qMatch ? qMatch[0] : (qCat !== 'Other' ? qCat : "Other Quality");
        const groupKey = qualityText.replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim().toLowerCase() || 'other';

        if (!seasonsMap.has(seasonName)) {
          seasonsMap.set(seasonName, new Map());
        }
        const qualitiesMap = seasonsMap.get(seasonName)!;

        if (!qualitiesMap.has(groupKey)) {
          qualitiesMap.set(groupKey, {
            headingText: headingText,
            qualityCat: qCat,
            directEpisodes: [],
            others: []
          });
        }
        
        const group = qualitiesMap.get(groupKey)!;
        group.singleEpisodeItem = { item, originalIndex };
        group.headingText = headingText;
      }
    });

    // Pass 2: Map Zip, Direct Episodes, and Other items to the correct group
    mdriveResults.forEach((item, originalIndex) => {
      const label = item.file_name || '';
      
      const seasonMatch = label.match(/\b(?:season|s)\s*0*(\d+)\b/i);
      const seasonName = seasonMatch ? `Season ${seasonMatch[1]}` : "Season 1";

      let headingText = label;
      let optionText = label;
      if (label.includes('|')) {
        const parts = label.split('|');
        headingText = parts[0].trim();
        optionText = parts[1].trim();
      }

      const optLower = optionText.toLowerCase();
      const isZip = optLower.includes('zip') || optLower.includes('pack') || optLower.includes('batch');
      const isSingleEpisode = optLower.includes('single episode') || optLower.includes('single ep');

      if (isSingleEpisode) {
        return; // Already handled in Pass 1
      }

      const qCat = getItemQualityCategory(item);

      if (!seasonsMap.has(seasonName)) {
        seasonsMap.set(seasonName, new Map());
      }
      const qualitiesMap = seasonsMap.get(seasonName)!;

      let bestGroupKey = "";

      // Smart Matching: find group in the same season that matches our quality/resolution
      const itemLabelLower = label.toLowerCase();
      let matchedResolution = "";
      if (itemLabelLower.includes("2160p") || itemLabelLower.includes("4k")) matchedResolution = "2160p";
      else if (itemLabelLower.includes("1080p")) matchedResolution = "1080p";
      else if (itemLabelLower.includes("720p")) matchedResolution = "720p";
      else if (itemLabelLower.includes("480p")) matchedResolution = "480p";
      else if (qCat !== "Other") matchedResolution = qCat.toLowerCase();

      if (matchedResolution) {
        const candidates = Array.from(qualitiesMap.entries()).filter(([key]) => key.includes(matchedResolution));
        if (candidates.length === 1) {
          bestGroupKey = candidates[0][0];
        } else if (candidates.length > 1) {
          let codec = "";
          if (itemLabelLower.includes("hevc") || itemLabelLower.includes("x265")) codec = "hevc";
          else if (itemLabelLower.includes("x264") || itemLabelLower.includes("h264")) codec = "x264";
          else if (itemLabelLower.includes("web-dl") || itemLabelLower.includes("webdl")) codec = "web-dl";

          if (codec) {
            const exactCodecMatch = candidates.find(([key]) => key.includes(codec));
            if (exactCodecMatch) {
              bestGroupKey = exactCodecMatch[0];
            }
          }
          if (!bestGroupKey) {
            let minDiff = Infinity;
            candidates.forEach(([key, group]) => {
              const refIdx = group.singleEpisodeItem?.originalIndex ?? -1;
              if (refIdx !== -1) {
                const diff = Math.abs(originalIndex - refIdx);
                if (diff < minDiff) {
                  minDiff = diff;
                  bestGroupKey = key;
                }
              }
            });
          }
        }
      }

      // Proximity-based fallback if matching is still not found
      if (!bestGroupKey) {
        const cleanHeading = headingText
          .replace(/\/\s*E\b/gi, '')
          .replace(/\/\s*ep(?:isodes?)?\b/gi, '')
          .replace(/\bSingle\b/gi, '')
          .replace(/\s+/g, ' ')
          .trim();

        const qMatch = cleanHeading.match(/\b(?:480p|720p|1080p|2160p|4k|2k)[\s\S]*$/i);
        const qualityText = qMatch ? qMatch[0] : (qCat !== 'Other' ? qCat : "Other Quality");
        bestGroupKey = qualityText.replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim().toLowerCase() || 'other';
      }

      if (!qualitiesMap.has(bestGroupKey)) {
        qualitiesMap.set(bestGroupKey, {
          headingText: headingText,
          qualityCat: qCat,
          directEpisodes: [],
          others: []
        });
      }

      const group = qualitiesMap.get(bestGroupKey)!;
      const entry = { item, originalIndex };
      const info = getItemEpisodeInfo(item);
      const isDirectEpisode = info.isEpisode && !isSingleEpisode && !isZip;

      if (isZip) {
        if (!item.size) {
          const sm = (item.file_name || item.label || '').match(/\[?\s*(\d+(?:\.\d+)?\s*(?:GB|MB|KB))\s*\]?/i);
          if (sm) item.size = sm[1].toUpperCase();
        }
        group.zipItem = entry;
      } else if (isDirectEpisode) {
        group.directEpisodes.push({ item, originalIndex, epNumber: info.epNumber });
      } else {
        group.others.push(entry);
      }
    });

    const getQualityPriority = (key: string): number => {
      const k = key.toLowerCase();
      if (k.includes('480p')) return 0;
      if (k.includes('720p')) return 1;
      if (k.includes('1080p')) return 2;
      if (k.includes('2160p') || k.includes('4k')) return 3;
      return 4;
    };

    const sortedSeasons = new Map<string, Map<string, any>>();

    Array.from(seasonsMap.entries()).sort((a, b) => {
      const numA = parseInt(a[0].match(/\d+/)?.at(0) || "0", 10);
      const numB = parseInt(b[0].match(/\d+/)?.at(0) || "0", 10);
      return numA - numB;
    }).forEach(([seasonName, qualitiesMap]) => {
      qualitiesMap.forEach(group => {
        group.directEpisodes.sort((a: any, b: any) => {
          if (a.epNumber !== undefined && b.epNumber !== undefined) return a.epNumber - b.epNumber;
          return a.originalIndex - b.originalIndex;
        });
      });

      const sortedQualities = new Map(
        Array.from(qualitiesMap.entries()).sort((a, b) => {
          const priA = getQualityPriority(a[0]);
          const priB = getQualityPriority(b[0]);
          if (priA !== priB) return priA - priB;
          return a[0].localeCompare(b[0]);
        })
      );
      sortedSeasons.set(seasonName, sortedQualities);
    });

    return sortedSeasons;
  }, [mdriveResults]);

  const toggleSubEpisodeCollapse = async (url: string) => {
    const isExpanded = !expandedEpisodes[url];
    setExpandedEpisodes(prev => ({ ...prev, [url]: isExpanded }));

    if (isExpanded && !preloadedEpisodes[url] && !loadingEpisodes[url]) {
      setLoadingEpisodes(prev => ({ ...prev, [url]: true }));
      try {
        const res = await fetch(`/api/mdrive?url=${encodeURIComponent(url)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.hits) {
            setPreloadedEpisodes(prev => ({ ...prev, [url]: data.hits }));
          }
        }
      } catch (err) {
        console.error('Failed to preload sub-episodes:', err);
      } finally {
        setLoadingEpisodes(prev => ({ ...prev, [url]: false }));
      }
    }
  };

  const toggleSubEpisodeSelection = (parentUrl: string, subUrl: string) => {
    setSelectedSubEpisodes(prev => {
      const current = prev[parentUrl] ? new Set(prev[parentUrl]) : new Set<string>();
      if (current.has(subUrl)) {
        current.delete(subUrl);
      } else {
        current.add(subUrl);
      }
      return { ...prev, [parentUrl]: current };
    });
  };

  const toggleParentEpisodesSelection = async (item: any, originalIndex?: number) => {
    const url = item.url;
    const isLoaded = Boolean(preloadedEpisodes[url]);
    
    if (!isLoaded) {
      if (originalIndex !== undefined) {
        setMdriveSelectedIndices(prev => {
          const next = new Set(prev);
          if (next.has(originalIndex)) {
            next.delete(originalIndex);
          } else {
            next.add(originalIndex);
          }
          return next;
        });
      }
      setLoadingEpisodes(prev => ({ ...prev, [url]: true }));
      setExpandedEpisodes(prev => ({ ...prev, [url]: true }));
      try {
        const res = await fetch(`/api/mdrive?url=${encodeURIComponent(url)}`);
        if (res.ok) {
          const data = await res.json();
          if (data.hits && data.hits.length > 0) {
            setPreloadedEpisodes(prev => ({ ...prev, [url]: data.hits }));
            setSelectedSubEpisodes(prev => ({
              ...prev,
              [url]: new Set(data.hits.map((h: any) => h.url))
            }));
            if (originalIndex !== undefined) {
              setMdriveSelectedIndices(prev => {
                const next = new Set(prev);
                next.delete(originalIndex);
                return next;
              });
            }
          }
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingEpisodes(prev => ({ ...prev, [url]: false }));
      }
    } else {
      const subs = preloadedEpisodes[url] || [];
      const selectedSet = selectedSubEpisodes[url] || new Set();
      const allSelected = subs.length > 0 && subs.every(sub => selectedSet.has(sub.url));
      
      setSelectedSubEpisodes(prev => {
        const nextSet = new Set<string>();
        if (!allSelected) {
          subs.forEach(sub => nextSet.add(sub.url));
        }
        return { ...prev, [url]: nextSet };
      });
      if (originalIndex !== undefined) {
        setMdriveSelectedIndices(prev => {
          const next = new Set(prev);
          next.delete(originalIndex);
          return next;
        });
      }
    }
  };

  const toggleQualityEpisodesSelection = (qCat: QualityCategory) => {
    const qList = (parsedMdriveGroups.episodesByQuality.get(qCat) || []).filter(({ item }) => {
      if (qualityFilter === 'all') return true;
      const text = `${item.file_name || ''} ${item.quality || ''} ${item.url || ''}`.toLowerCase();
      if (qualityFilter === '480p') return text.includes('480p');
      if (qualityFilter === '720p') return text.includes('720p');
      if (qualityFilter === '1080p') return text.includes('1080p');
      if (qualityFilter === '2160p') return text.includes('2160p') || text.includes('4k');
      return true;
    });

    const allQSelected = qList.length > 0 && qList.every(({ originalIndex }) => mdriveSelectedIndices.has(originalIndex));
    setMdriveSelectedIndices(prev => {
      const next = new Set(prev);
      if (allQSelected) {
        qList.forEach(({ originalIndex }) => next.delete(originalIndex));
      } else {
        qList.forEach(({ originalIndex }) => next.add(originalIndex));
      }
      return next;
    });
  };

  const selectAllEpisodes = () => {
    const next = new Set(mdriveSelectedIndices);
    const epIndices: number[] = [];
    parsedMdriveGroups.sortedEpKeys.forEach(k => {
      const list = parsedMdriveGroups.episodesMap.get(k) || [];
      list.forEach(({ originalIndex, item }) => {
        const text = `${item.file_name || ''} ${item.quality || ''} ${item.url || ''}`.toLowerCase();
        let matches = true;
        if (qualityFilter === '480p') matches = text.includes('480p');
        if (qualityFilter === '720p') matches = text.includes('720p');
        if (qualityFilter === '1080p') matches = text.includes('1080p');
        if (qualityFilter === '2160p') matches = text.includes('2160p') || text.includes('4k');
        if (matches) epIndices.push(originalIndex);
      });
    });

    const allSelected = epIndices.length > 0 && epIndices.every(idx => next.has(idx));
    if (allSelected) {
      epIndices.forEach(idx => next.delete(idx));
    } else {
      epIndices.forEach(idx => next.add(idx));
    }
    setMdriveSelectedIndices(next);
  };

  const selectAllPacks = () => {
    const next = new Set(mdriveSelectedIndices);
    const packIndices: number[] = [];
    parsedMdriveGroups.packs.forEach(({ originalIndex, item }) => {
      const text = `${item.file_name || ''} ${item.quality || ''} ${item.url || ''}`.toLowerCase();
      let matches = true;
      if (qualityFilter === '480p') matches = text.includes('480p');
      if (qualityFilter === '720p') matches = text.includes('720p');
      if (qualityFilter === '1080p') matches = text.includes('1080p');
      if (qualityFilter === '2160p') matches = text.includes('2160p') || text.includes('4k');
      if (matches) packIndices.push(originalIndex);
    });

    const allSelected = packIndices.length > 0 && packIndices.every(idx => next.has(idx));
    if (allSelected) {
      packIndices.forEach(idx => next.delete(idx));
    } else {
      packIndices.forEach(idx => next.add(idx));
    }
    setMdriveSelectedIndices(next);
  };

  const toggleEpisodeSelection = (epNum: number) => {
    const epLinks = (parsedMdriveGroups.episodesMap.get(epNum) || []).filter(({ item }) => {
      if (qualityFilter === 'all') return true;
      const text = `${item.file_name || ''} ${item.quality || ''} ${item.url || ''}`.toLowerCase();
      if (qualityFilter === '480p') return text.includes('480p');
      if (qualityFilter === '720p') return text.includes('720p');
      if (qualityFilter === '1080p') return text.includes('1080p');
      if (qualityFilter === '2160p') return text.includes('2160p') || text.includes('4k');
      return true;
    });

    const allEpSelected = epLinks.length > 0 && epLinks.every(({ originalIndex }) => mdriveSelectedIndices.has(originalIndex));
    setMdriveSelectedIndices(prev => {
      const next = new Set(prev);
      if (allEpSelected) {
        epLinks.forEach(({ originalIndex }) => next.delete(originalIndex));
      } else {
        epLinks.forEach(({ originalIndex }) => next.add(originalIndex));
      }
      return next;
    });
  };

  // MoviesDrive Search Results & Pagination State
  const [moviesdriveSearchUrl, setMoviesdriveSearchUrl] = useState<string | null>(null);
  const [moviesdriveSearchPosts, setMoviesdriveSearchPosts] = useState<{ title: string; url: string; image?: string }[]>([]);
  const [moviesdriveSelectedUrls, setMoviesdriveSelectedUrls] = useState<Set<string>>(new Set());
  const [allAccumulatedPosts, setAllAccumulatedPosts] = useState<Map<string, { title: string; url: string; image?: string }>>(new Map());
  const [hasUserInteractedSelection, setHasUserInteractedSelection] = useState<boolean>(false);
  const [moviesdriveSearchQuery, setMoviesdriveSearchQuery] = useState<string>("");
  const [moviesdrivePageLoading, setMoviesdrivePageLoading] = useState<boolean>(false);
  const [customPageInput, setCustomPageInput] = useState<string>("");

  // Direct MoviesDrive Search Input State
  const [showMoviesdriveSearchInput, setShowMoviesdriveSearchInput] = useState<boolean>(false);
  const [moviesdriveSearchTerm, setMoviesdriveSearchTerm] = useState<string>("");

  // Direct SkyMoviesHD Search Input State & Pagination Limit
  const [showSkymoviesSearchInput, setShowSkymoviesSearchInput] = useState<boolean>(false);
  const [skymoviesSearchTerm, setSkymoviesSearchTerm] = useState<string>("");
  const [skymoviesVisibleLimit, setSkymoviesVisibleLimit] = useState<number>(500);
  // Catalog Pagination & Scroll State
  const catalogScrollRef = React.useRef<HTMLDivElement>(null);
  const [catalogTotalFound, setCatalogTotalFound] = useState<number>(0);
  const [catalogHasMore, setCatalogHasMore] = useState<boolean>(false);
  const [catalogExplicitTotalPages, setCatalogExplicitTotalPages] = useState<number>(1);
  // Aliases for SkyMoviesHD backward compatibility
  const skymoviesTotalFound = catalogTotalFound;
  const setSkymoviesTotalFound = setCatalogTotalFound;
  const skymoviesHasMore = catalogHasMore;
  const setSkymoviesHasMore = setCatalogHasMore;
  const [skymoviesLoadingMore, setSkymoviesLoadingMore] = useState<boolean>(false);
  const [catalogViewMode, setCatalogViewMode] = useState<'compact' | 'detailed'>('compact');

  // Direct FilmyGo Search Input State
  const [showFilmygoSearchInput, setShowFilmygoSearchInput] = useState<boolean>(false);
  const [filmygoSearchTerm, setFilmygoSearchTerm] = useState<string>("");

  // Direct HDHub4U Search Input State
  const [showHdhubSearchInput, setShowHdhubSearchInput] = useState<boolean>(false);
  const [hdhubSearchTerm, setHdhubSearchTerm] = useState<string>("");

  // Direct FilmyFly Search Input State
  const [showFilmyflySearchInput, setShowFilmyflySearchInput] = useState<boolean>(false);
  const [filmyflySearchTerm, setFilmyflySearchTerm] = useState<string>("");

  React.useEffect(() => {
    setSkymoviesVisibleLimit(500);
  }, [moviesdriveSearchUrl]);

  const moviesdrivePageInfo = useMemo(() => {
    const mdDomain = getMoviesdriveDomain();
    const skyDomain = getSkymoviesDomain();
    const filmyDomain = getFilmygoDomain();
    const hdhubDomain = getHdhub4uDomain();
    const filmyflyDomain = getFilmyflyDomain();
    if (!moviesdriveSearchUrl) return { query: "", page: 1, origin: mdDomain, isSkyMovies: false, isFilmygo: false, isHdhub4u: false, isFilmyfly: false };
    try {
      const u = new URL(moviesdriveSearchUrl);
      const isSky = u.hostname.includes("skymovies") || u.origin === skyDomain;
      const isFilmy = u.hostname.includes("filmygo") || u.origin === filmyDomain;
      const isHdhub = u.hostname.includes("hdhub4u") || u.origin === hdhubDomain;
      const isFilmyfly = u.hostname.includes("filmyfly") || u.origin === filmyflyDomain;
      
      let q = u.searchParams.get("to-search") || u.searchParams.get("search") || u.searchParams.get("q") || u.searchParams.get("s") || "";
      if (!q) {
        const searchPathMatch = u.pathname.match(/\/search\/([^/]+)/i);
        if (searchPathMatch && searchPathMatch[1] && !searchPathMatch[1].endsWith('.html') && !searchPathMatch[1].endsWith('.php')) {
          q = decodeURIComponent(searchPathMatch[1]);
        }
      }

      let p = parseInt(u.searchParams.get("to-page") || u.searchParams.get("page") || u.searchParams.get("p") || u.searchParams.get("pg") || "1", 10) || 1;
      if (!u.searchParams.get("page") && !u.searchParams.get("p") && !u.searchParams.get("to-page") && !u.searchParams.get("pg")) {
        const pageMatch = u.pathname.match(/\/page\/(\d+)/i);
        if (pageMatch) p = parseInt(pageMatch[1], 10);
      }
      return { query: q, page: p, origin: u.origin || (isFilmyfly ? filmyflyDomain : isHdhub ? hdhubDomain : isFilmy ? filmyDomain : isSky ? skyDomain : mdDomain), isSkyMovies: isSky, isFilmygo: isFilmy, isHdhub4u: isHdhub, isFilmyfly: isFilmyfly };
    } catch {
      return { query: "", page: 1, origin: mdDomain, isSkyMovies: false, isFilmygo: false, isHdhub4u: false, isFilmyfly: false };
    }
  }, [moviesdriveSearchUrl]);

  const catalogTotalPages = useMemo(() => {
    const cp = moviesdrivePageInfo.page;
    let maxP = Math.max(1, cp);
    if (catalogExplicitTotalPages && catalogExplicitTotalPages > 1) {
      maxP = Math.max(maxP, catalogExplicitTotalPages);
    } else if (catalogTotalFound && catalogTotalFound > 0) {
      const perPage = moviesdriveSearchPosts.length > 0 ? moviesdriveSearchPosts.length : 20;
      if (catalogTotalFound > perPage) {
        maxP = Math.max(maxP, Math.ceil(catalogTotalFound / perPage));
      }
    }
    if (catalogHasMore && maxP <= cp) {
      maxP = cp + 1;
    }
    return maxP;
  }, [catalogExplicitTotalPages, catalogTotalFound, catalogHasMore, moviesdrivePageInfo.page, moviesdriveSearchPosts.length]);

  const getPaginationPages = (current: number, total: number): (number | '...')[] => {
    if (total <= 7) {
      return Array.from({ length: total }, (_, i) => i + 1);
    }
    if (current <= 4) {
      return [1, 2, 3, 4, 5, '...', total];
    }
    if (current >= total - 3) {
      return [1, '...', total - 4, total - 3, total - 2, total - 1, total];
    }
    return [1, '...', current - 1, current, current + 1, '...', total];
  };

  const contentTitleIndex = useMemo(() => {
    const map = new Map<string, Content[]>();
    if (!contentList) return map;
    contentList.forEach(c => {
      if (c.title) {
        const norm = normalizeTitle(c.title);
        if (norm) {
          if (!map.has(norm)) map.set(norm, []);
          map.get(norm)!.push(c);
        }
      }
      if (c.secondTitle) {
        const norm = normalizeTitle(c.secondTitle);
        if (norm) {
          if (!map.has(norm)) map.set(norm, []);
          map.get(norm)!.push(c);
        }
      }
    });
    return map;
  }, [contentList]);

  const moviesdrivePostsWithAvailability = useMemo(() => {
    return moviesdriveSearchPosts.map((post, originalIndex) => {
      const avail = checkGalleryAvailability(post.title, contentList, qualities, languages, contentTitleIndex);
      return { post, originalIndex, avail };
    });
  }, [moviesdriveSearchPosts, contentList, qualities, languages, contentTitleIndex]);

  const moviesdriveFilteredPosts = useMemo(() => {
    return moviesdrivePostsWithAvailability.filter(({ post, avail }) => {
      const matchesQuery = !moviesdriveSearchQuery || post.title.toLowerCase().includes(moviesdriveSearchQuery.toLowerCase());
      if (!matchesQuery) return false;
      if (availabilityFilter === 'missing') return !avail.isAvailable;
      if (availabilityFilter === 'available') return avail.isAvailable;
      return true;
    });
  }, [moviesdrivePostsWithAvailability, moviesdriveSearchQuery, availabilityFilter]);

  const moviesdriveDisplayedPosts = useMemo(() => {
    return moviesdrivePageInfo.isSkyMovies
      ? moviesdriveFilteredPosts.slice(0, skymoviesVisibleLimit)
      : moviesdriveFilteredPosts;
  }, [moviesdriveFilteredPosts, moviesdrivePageInfo.isSkyMovies, skymoviesVisibleLimit]);

  const { moviesdriveAvailCount, moviesdriveMissingCount } = useMemo(() => {
    let availCount = 0;
    let missingCount = 0;
    moviesdrivePostsWithAvailability.forEach(({ avail }) => {
      if (avail.isAvailable) availCount++;
      else missingCount++;
    });
    return { moviesdriveAvailCount: availCount, moviesdriveMissingCount: missingCount };
  }, [moviesdrivePostsWithAvailability]);

  const searchLocationInContent = React.useCallback((contentObj: any, url: string, finalUrl?: string) => {
    if (!contentObj) return null;

    const normUrl = normalizeUrl(url);
    const normFinal = finalUrl ? normalizeUrl(finalUrl) : undefined;
    const targetUrls = [url, finalUrl, normUrl, normFinal].filter(Boolean) as string[];

    const extractId = (u: string) => {
      if (!u) return null;
      const m = u.match(/\/(?:u|l|file|d|get|drive|link)\/([a-zA-Z0-9_-]+)/i);
      if (m) return m[1];
      return null;
    };

    const targetIds = [extractId(url), finalUrl ? extractId(finalUrl) : null].filter((id): id is string => !!id && id.length >= 4);

    const isMatch = (candUrl?: string) => {
      if (!candUrl) return false;
      if (targetUrls.some(tu => tu && (candUrl.includes(tu) || tu.includes(candUrl)))) return true;
      const candNorm = normalizeUrl(candUrl);
      if (targetUrls.some(tu => tu && (candNorm.includes(tu) || tu.includes(candNorm)))) return true;
      const candId = extractId(candUrl);
      if (candId && targetIds.some(tid => tid === candId || candUrl.includes(tid))) return true;
      return false;
    };

    const safeParse = (data: any) => {
      if (!data) return [];
      if (typeof data === 'string') {
        try { return JSON.parse(data); } catch { return []; }
      }
      return data;
    };

    // Check movieLinks
    const movieLinks = safeParse(contentObj.movieLinks);
    if (Array.isArray(movieLinks)) {
      for (const ml of movieLinks) {
        if (isMatch(ml.url)) {
          const lName = ml.name || ml.quality || 'Movie Link';
          return {
            season: undefined,
            episode: undefined,
            isFullSeasonMKV: ml.isFullSeasonMKV,
            isFullSeasonZIP: ml.isFullSeasonZIP,
            qualityLabel: ml.quality || ml.name,
            linkName: lName,
            locationName: lName
          };
        }
      }
    }

    // Check seasons
    const seasonsData = safeParse(contentObj.seasons);
    if (Array.isArray(seasonsData)) {
      for (const s of seasonsData) {
        const sNum = s.seasonNumber ?? s.season ?? s.number;
        const parsedSNum = sNum !== undefined ? parseInt(String(sNum), 10) : undefined;

        // Check zipLinks
        const zipLinks = safeParse(s.zipLinks);
        if (Array.isArray(zipLinks)) {
          for (const zl of zipLinks) {
            if (isMatch(zl.url)) {
              const zS = zl.season !== undefined ? parseInt(String(zl.season), 10) : parsedSNum;
              const zE = zl.episode !== undefined ? parseInt(String(zl.episode), 10) : undefined;
              const rawQual = zl.name || zl.quality || '';
              let lName = rawQual;
              if (lName && !/\bZIP\b/i.test(lName)) {
                lName = `${lName} ZIP`;
              } else if (!lName) {
                lName = zS !== undefined ? `S${zS} ZIP` : 'ZIP';
              }

              let locTag = rawQual;
              if (zS !== undefined && locTag && !locTag.toLowerCase().includes(`s${zS}`)) {
                locTag = `S${zS} ${locTag}`.trim();
              }
              if (!locTag) locTag = zS !== undefined ? `S${zS} ZIP` : 'ZIP';
              if (!/\bZIP\b/i.test(locTag)) {
                locTag = `${locTag} ZIP`;
              }

              return {
                season: zS,
                episode: zE,
                isFullSeasonZIP: zl.isFullSeasonZIP ?? true,
                isFullSeasonMKV: zl.isFullSeasonMKV,
                qualityLabel: zl.name || zl.quality,
                linkName: lName,
                locationName: locTag
              };
            }
          }
        }

        // Check mkvLinks
        const mkvLinks = safeParse(s.mkvLinks);
        if (Array.isArray(mkvLinks)) {
          for (const ml of mkvLinks) {
            if (isMatch(ml.url)) {
              const mS = ml.season !== undefined ? parseInt(String(ml.season), 10) : parsedSNum;
              const mE = ml.episode !== undefined ? parseInt(String(ml.episode), 10) : undefined;
              const rawQual = ml.name || ml.quality || '';
              let lName = rawQual;
              if (lName && !/\bMKV\b/i.test(lName)) {
                lName = `${lName} MKV`;
              } else if (!lName) {
                lName = mS !== undefined ? `S${mS} MKV` : 'MKV';
              }

              let locTag = rawQual;
              if (mS !== undefined && locTag && !locTag.toLowerCase().includes(`s${mS}`)) {
                locTag = `S${mS} ${locTag}`.trim();
              }
              if (!locTag) locTag = mS !== undefined ? `S${mS} MKV` : 'MKV';
              if (!/\bMKV\b/i.test(locTag)) {
                locTag = `${locTag} MKV`;
              }

              return {
                season: mS,
                episode: mE,
                isFullSeasonMKV: ml.isFullSeasonMKV ?? true,
                isFullSeasonZIP: ml.isFullSeasonZIP,
                qualityLabel: ml.name || ml.quality,
                linkName: lName,
                locationName: locTag
              };
            }
          }
        }

        // Check episodes
        const episodes = safeParse(s.episodes);
        if (Array.isArray(episodes)) {
          for (const ep of episodes) {
            const epNum = ep.episodeNumber ?? ep.episode ?? ep.number ?? ep.ep;
            const parsedEpNum = epNum !== undefined ? parseInt(String(epNum), 10) : undefined;

            const links = safeParse(ep.links);
            if (Array.isArray(links)) {
              for (const l of links) {
                if (isMatch(l.url)) {
                  const lS = l.season !== undefined ? parseInt(String(l.season), 10) : parsedSNum;
                  const lE = l.episode !== undefined ? parseInt(String(l.episode), 10) : parsedEpNum;
                  const lName = l.name || l.quality || (lS !== undefined && lE !== undefined ? `S${lS}E${lE}` : `E${lE}`);
                  let locTag = '';
                  if (lS !== undefined && lE !== undefined) {
                    locTag = `S${lS}E${lE}`;
                    if (l.name || l.quality) locTag += ` ${l.name || l.quality}`;
                  } else if (lE !== undefined) {
                    locTag = `E${lE}`;
                    if (l.name || l.quality) locTag += ` ${l.name || l.quality}`;
                  } else {
                    locTag = l.name || l.quality || '';
                  }
                  return {
                    season: lS,
                    episode: lE,
                    isFullSeasonMKV: l.isFullSeasonMKV,
                    isFullSeasonZIP: l.isFullSeasonZIP,
                    qualityLabel: l.name || l.quality,
                    linkName: lName,
                    locationName: locTag
                  };
                }
              }
            }
          }
        }
      }
    }

    // Check top-level content fields
    const topZip = safeParse(contentObj.fullSeasonZip || contentObj.zipLinks);
    if (Array.isArray(topZip)) {
      for (const zl of topZip) {
        if (isMatch(zl.url)) {
          const zS = zl.season !== undefined ? parseInt(String(zl.season), 10) : undefined;
          const rawQual = zl.name || zl.quality || '';
          let lName = rawQual;
          if (lName && !/\bZIP\b/i.test(lName)) {
            lName = `${lName} ZIP`;
          } else if (!lName) {
            lName = zS !== undefined ? `S${zS} ZIP` : 'ZIP';
          }

          let locTag = rawQual;
          if (zS !== undefined && locTag && !locTag.toLowerCase().includes(`s${zS}`)) {
            locTag = `S${zS} ${locTag}`.trim();
          }
          if (!locTag) locTag = zS !== undefined ? `S${zS} ZIP` : 'ZIP';
          if (!/\bZIP\b/i.test(locTag)) {
            locTag = `${locTag} ZIP`;
          }

          return {
            season: zS,
            episode: zl.episode !== undefined ? parseInt(String(zl.episode), 10) : undefined,
            isFullSeasonZIP: zl.isFullSeasonZIP ?? true,
            qualityLabel: zl.name || zl.quality,
            linkName: lName,
            locationName: locTag
          };
        }
      }
    }

    const topMkv = safeParse(contentObj.fullSeasonMkv || contentObj.mkvLinks);
    if (Array.isArray(topMkv)) {
      for (const ml of topMkv) {
        if (isMatch(ml.url)) {
          const mS = ml.season !== undefined ? parseInt(String(ml.season), 10) : undefined;
          const rawQual = ml.name || ml.quality || '';
          let lName = rawQual;
          if (lName && !/\bMKV\b/i.test(lName)) {
            lName = `${lName} MKV`;
          } else if (!lName) {
            lName = mS !== undefined ? `S${mS} MKV` : 'MKV';
          }

          let locTag = rawQual;
          if (mS !== undefined && locTag && !locTag.toLowerCase().includes(`s${mS}`)) {
            locTag = `S${mS} ${locTag}`.trim();
          }
          if (!locTag) locTag = mS !== undefined ? `S${mS} MKV` : 'MKV';
          if (!/\bMKV\b/i.test(locTag)) {
            locTag = `${locTag} MKV`;
          }

          return {
            season: mS,
            episode: ml.episode !== undefined ? parseInt(String(ml.episode), 10) : undefined,
            isFullSeasonMKV: ml.isFullSeasonMKV ?? true,
            qualityLabel: ml.name || ml.quality,
            linkName: lName,
            locationName: locTag
          };
        }
      }
    }

    return null;
  }, []);

  const resolveLocationAndMetadata = React.useCallback((res: LinkCheckResult) => {
    // Remove location fetching or retrieving for working links; retrieve only for non-working links.
    const isWorking = res.ok || res.statusLabel === "WORKING" || res.statusLabel === "REDIRECT" || res.statusLabel === "PROTECTED";

    let season = res.season;
    let episode = res.episode;
    let isFullSeasonMKV = res.isFullSeasonMKV;
    let isFullSeasonZIP = res.isFullSeasonZIP;
    let qualityLabel = res.qualityLabel;
    let linkName = res.linkName;
    let locationName = isWorking ? undefined : res.locationName;

    const url = res.url || '';
    const finalUrl = res.finalUrl || '';

    // 1. Try search in passed `content` prop or items in `contentList` (only for non-working links to retrieve location)
    if (!isWorking) {
      const searchTargets = [content, ...(contentList || [])].filter(Boolean);

      for (const cItem of searchTargets) {
        const loc = searchLocationInContent(cItem, url, finalUrl);
        if (loc) {
          if (season === undefined) season = loc.season;
          if (episode === undefined) episode = loc.episode;
          if (isFullSeasonMKV === undefined || !isFullSeasonMKV) isFullSeasonMKV = loc.isFullSeasonMKV;
          if (isFullSeasonZIP === undefined || !isFullSeasonZIP) isFullSeasonZIP = loc.isFullSeasonZIP;
          if (!qualityLabel) qualityLabel = loc.qualityLabel;
          if (!linkName) linkName = loc.linkName;
          if (!locationName) locationName = loc.locationName;
          if (season !== undefined || episode !== undefined || isFullSeasonMKV || isFullSeasonZIP || linkName || locationName) {
            break;
          }
        }
      }
    }

    // 2. Try extractedMetaRef.current by direct URL, normalized URL, or file ID
    if (season === undefined && episode === undefined && !isFullSeasonMKV && !isFullSeasonZIP) {
      const normUrl = normalizeUrl(url);
      const normFinal = finalUrl ? normalizeUrl(finalUrl) : undefined;

      let meta = extractedMetaRef.current[url] || 
                 extractedMetaRef.current[normUrl] || 
                 (normFinal ? extractedMetaRef.current[normFinal] : undefined);

      if (!meta || (meta.season === undefined && meta.episode === undefined)) {
        try {
          const extractId = (u: string) => {
            const m = u.match(/\/(?:u|l|file|d|get|drive|link)\/([a-zA-Z0-9_-]+)/i) || u.match(/([a-zA-Z0-9_-]{8,})/);
            return m ? m[1] : null;
          };
          const id = extractId(url) || (finalUrl ? extractId(finalUrl) : null);
          if (id && id.length >= 4) {
            for (const [mUrl, mData] of Object.entries(extractedMetaRef.current)) {
              if (mUrl.includes(id)) {
                meta = mData;
                break;
              }
            }
          }
        } catch (e) {}
      }

      if (meta) {
        if (season === undefined) season = meta.season;
        if (episode === undefined) episode = meta.episode;
        if (isFullSeasonMKV === undefined) isFullSeasonMKV = meta.isFullSeasonMKV;
        if (isFullSeasonZIP === undefined) isFullSeasonZIP = meta.isFullSeasonZIP;
        if (!qualityLabel) qualityLabel = meta.qualityLabel;
        if (!linkName) linkName = (meta as any).linkName;
        if (!locationName) locationName = (meta as any).locationName;
      }
    }

    // 3. Try parsing from inputRef.current text with upwards scanning
    if (season === undefined && episode === undefined && !isFullSeasonMKV && !isFullSeasonZIP) {
      const textMeta = detectMetadataForLink(inputRef.current, url, languages, qualities);
      if (season === undefined) season = textMeta.season;
      if (episode === undefined) episode = textMeta.episode;
      if (isFullSeasonMKV === undefined) isFullSeasonMKV = textMeta.isFullSeasonMKV;
      if (isFullSeasonZIP === undefined) isFullSeasonZIP = textMeta.isFullSeasonZIP;
      if (!qualityLabel) qualityLabel = textMeta.qualityLabel;
    }

    // 4. Try parsing from url / finalUrl string itself as last resort
    if (season === undefined && episode === undefined && !isFullSeasonMKV && !isFullSeasonZIP) {
      const urlText = `${finalUrl} ${url}`;
      const sMatch = urlText.match(/(?<=^|[^a-zA-Z0-9])(?:s(\d+)|season\s*(\d+))(?![a-z0-9])/i);
      const eMatch = urlText.match(/(?<=^|[^a-zA-Z0-9])(?:e(\d+)|episode\s*(\d+))(?![a-z0-9])/i);
      if (sMatch) season = parseInt(sMatch[1] || sMatch[2], 10);
      if (eMatch) episode = parseInt(eMatch[1] || eMatch[2], 10);
      if (episode === undefined) {
        if (urlText.toLowerCase().includes(".zip")) isFullSeasonZIP = true;
        if (urlText.toLowerCase().includes(".mkv")) isFullSeasonMKV = true;
      }
    }

    if (episode !== undefined) {
      isFullSeasonMKV = false;
      isFullSeasonZIP = false;
    }

    const mergedResult: LinkCheckResult = {
      ...res,
      season,
      episode,
      isFullSeasonMKV,
      isFullSeasonZIP,
      qualityLabel: res.qualityLabel || qualityLabel,
      linkName,
      locationName: isWorking ? undefined : locationName
    };

    const tag = isWorking ? null : getLocationTag(mergedResult);

    return { mergedResult, tag };
  }, [content, contentList, languages, qualities, searchLocationInContent]);

  const areAllFilteredSelected = useMemo(() => {
    if (moviesdriveFilteredPosts.length === 0) return false;
    return moviesdriveFilteredPosts.every(({ post }) => moviesdriveSelectedUrls.has(post.url));
  }, [moviesdriveFilteredPosts, moviesdriveSelectedUrls]);

  const handleSelectAllFiltered = () => {
    setHasUserInteractedSelection(true);
    setMoviesdriveSelectedUrls(prev => {
      const next = new Set(prev);
      if (areAllFilteredSelected) {
        moviesdriveFilteredPosts.forEach(({ post }) => {
          next.delete(post.url);
        });
      } else {
        moviesdriveFilteredPosts.forEach(({ post }) => {
          if (post.url) next.add(post.url);
        });
      }
      return next;
    });
  };

  const handleMoviesdrivePageChange = async (targetPage: number) => {
    if (targetPage < 1 || !moviesdriveSearchUrl) return;
    const { query, origin, isSkyMovies, isFilmygo, isHdhub4u, isFilmyfly } = moviesdrivePageInfo;
    let newUrl = "";
    let endpoint = "";
    if (isSkyMovies) {
      newUrl = `${origin}/search.php?search=${encodeURIComponent(query)}&cat=All&page=${targetPage}`;
      endpoint = `/api/skymovieshd?url=${encodeURIComponent(newUrl)}`;
    } else if (isFilmygo) {
      if (query) {
        newUrl = `${origin}/site-search.html?to-search=${encodeURIComponent(query)}&to-page=${targetPage}`;
      } else {
        newUrl = `${origin}/?to-page=${targetPage}`;
      }
      endpoint = `/api/filmygo?url=${encodeURIComponent(newUrl)}`;
    } else if (isHdhub4u) {
      if (query) {
        newUrl = targetPage === 1 
          ? `${origin}/search.html?q=${encodeURIComponent(query)}` 
          : `${origin}/search.html?q=${encodeURIComponent(query)}&page=${targetPage}`;
      } else {
        newUrl = targetPage === 1 ? `${origin}/` : `${origin}/page/${targetPage}/`;
      }
      endpoint = `/api/hdhub4u?url=${encodeURIComponent(newUrl)}`;
    } else if (isFilmyfly) {
      if (query) {
        newUrl = `${origin}/search.html?search=${encodeURIComponent(query)}&page=${targetPage}`;
      } else {
        newUrl = targetPage === 1 ? `${origin}/` : `${origin}/?page=${targetPage}`;
      }
      endpoint = `/api/filmyfly?url=${encodeURIComponent(newUrl)}`;
    } else {
      if (query) {
        newUrl = targetPage === 1 
          ? `${origin}/search.html?q=${encodeURIComponent(query)}` 
          : `${origin}/search.html?q=${encodeURIComponent(query)}&page=${targetPage}`;
      } else {
        newUrl = targetPage === 1 ? `${origin}/` : `${origin}/page/${targetPage}/`;
      }
      endpoint = `/api/moviesdrive?url=${encodeURIComponent(newUrl)}`;
    }
    setMoviesdrivePageLoading(true);
    try {
      const res = await fetch(endpoint);
      if (!res.ok) throw new Error('Catalog page fetch failed');
      const data = await res.json();
      if (data.is_search && Array.isArray(data.posts)) {
        setMoviesdriveSearchUrl(newUrl);
        setMoviesdriveSearchPosts(data.posts);
        
        const postsCount = data.posts.length;
        const total = typeof data.total_found === 'number' ? data.total_found : (typeof data.found === 'number' ? data.found : postsCount);
        if (total) {
          setCatalogTotalFound(total);
        }

        const explicitPages = typeof data.total_pages === 'number' && data.total_pages > 0
          ? data.total_pages
          : (total > targetPage * (postsCount || 20) ? Math.ceil(total / Math.max(1, postsCount || 20)) : targetPage);

        setCatalogExplicitTotalPages(Math.max(explicitPages, targetPage));

        const hasMore = Boolean(data.has_more) || (explicitPages > targetPage) || (total > targetPage * (postsCount || 20));
        setCatalogHasMore(hasMore);

        setAllAccumulatedPosts(prev => {
          const nextMap = new Map(prev);
          data.posts.forEach((p: any) => {
            if (p.url) nextMap.set(p.url, p);
          });
          return nextMap;
        });

        if (!hasUserInteractedSelection) {
          const limit = isSkyMovies ? 50 : data.posts.length;
          setMoviesdriveSelectedUrls(prev => {
            const next = new Set(prev);
            data.posts.slice(0, limit).forEach((p: any) => {
              if (p.url) next.add(p.url);
            });
            return next;
          });
        }

        // Smooth scroll back to top of posts container on page change
        catalogScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } catch (e) {
      console.error("Error fetching catalog page:", e);
    } finally {
      setMoviesdrivePageLoading(false);
    }
  };

  const handleSkymoviesLoadMore = async () => {
    if (!moviesdriveSearchUrl || skymoviesLoadingMore) return;

    // If there are already loaded filtered posts that haven't been displayed yet:
    if (skymoviesVisibleLimit < moviesdriveFilteredPosts.length) {
      const nextIdx = skymoviesVisibleLimit;
      setSkymoviesVisibleLimit(prev => prev + 500);
      setTimeout(() => {
        const el = document.getElementById(`skymovies-post-item-${nextIdx}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 80);
      return;
    }

    // Otherwise fetch the next 500 results from the backend
    setSkymoviesLoadingMore(true);
    try {
      const currentCount = moviesdriveSearchPosts.length;
      let cleanUrl = moviesdriveSearchUrl;
      try {
        const u = new URL(moviesdriveSearchUrl);
        u.searchParams.delete('offset');
        u.searchParams.delete('limit');
        u.searchParams.delete('page');
        cleanUrl = u.toString();
      } catch (e) {}

      const endpoint = `/api/skymovieshd?url=${encodeURIComponent(cleanUrl)}&offset=${currentCount}&limit=500`;
      const res = await fetch(endpoint);
      if (!res.ok) throw new Error('Catalog load more failed');
      const data = await res.json();

      if (data.is_search && Array.isArray(data.posts) && data.posts.length > 0) {
        const newPosts: { title: string; url: string; image?: string }[] = data.posts;
        setMoviesdriveSearchPosts(prev => [...prev, ...newPosts]);

        setAllAccumulatedPosts(prev => {
          const nextMap = new Map(prev);
          newPosts.forEach(p => {
            if (p.url) nextMap.set(p.url, p);
          });
          return nextMap;
        });

        const total = data.total_found || data.found || (currentCount + newPosts.length);
        setSkymoviesTotalFound(total);
        setSkymoviesHasMore(Boolean(data.has_more) || (total > currentCount + newPosts.length));
        setSkymoviesVisibleLimit(prev => prev + 500);

        setTimeout(() => {
          const el = document.getElementById(`skymovies-post-item-${currentCount}`);
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 80);
      } else {
        setSkymoviesHasMore(false);
      }
    } catch (e) {
      console.error('Error loading more SkymoviesHD posts:', e);
    } finally {
      setSkymoviesLoadingMore(false);
    }
  };

  const executeMoviesdriveSearch = (query: string) => {
    const trimmed = query.trim();
    const domain = getMoviesdriveDomain();
    let targetUrl = "";
    if (!trimmed) {
      targetUrl = `${domain}/`;
    } else if (!trimmed.startsWith("http")) {
      targetUrl = `${domain}/search.html?q=${encodeURIComponent(trimmed)}&page=1`;
    } else {
      targetUrl = trimmed;
    }
    
    // Clear cache & active search overlays for fresh search
    processedExtractionsRef.current.delete(normalizeUrl(targetUrl));
    processedExtractionsRef.current.delete(targetUrl);
    setMoviesdriveSearchUrl(null);
    setMoviesdriveSearchPosts([]);
    setCatalogTotalFound(0);
    setCatalogExplicitTotalPages(1);
    setCatalogHasMore(false);
    setAllAccumulatedPosts(new Map());
    setMoviesdriveSelectedUrls(new Set());

    setInput(targetUrl);
    setShowMoviesdriveSearchInput(false);
    setShowSkymoviesSearchInput(false);
    setShowFilmygoSearchInput(false);
    setShowHdhubSearchInput(false);
    setMoviesdriveSearchTerm("");
    setTimeout(() => {
      handleCheck(undefined, targetUrl, 0, true);
    }, 100);
  };

  const executeSkymoviesSearch = (query: string) => {
    const trimmed = query.trim();
    const domain = getSkymoviesDomain();
    let targetUrl = "";
    if (!trimmed) {
      targetUrl = `${domain}/`;
    } else if (!trimmed.startsWith("http")) {
      targetUrl = `${domain}/search.php?search=${encodeURIComponent(trimmed)}&cat=All`;
    } else {
      targetUrl = trimmed;
    }

    // Sanitize any accidental whitespace around query parameters
    targetUrl = targetUrl
      .replace(/(https?:\/\/[^\s"'?#]+)\s+(\?[^\s"']+)/gi, '$1$2')
      .replace(/([?&][^=&\s]+)\s*=\s*/g, '$1=')
      .replace(/([?&][^&\s]+)\s+&/g, '$1&');

    // Clear cache & active search overlays for fresh search
    processedExtractionsRef.current.delete(normalizeUrl(targetUrl));
    processedExtractionsRef.current.delete(targetUrl);
    setMoviesdriveSearchUrl(null);
    setMoviesdriveSearchPosts([]);
    setCatalogTotalFound(0);
    setCatalogExplicitTotalPages(1);
    setCatalogHasMore(false);
    setAllAccumulatedPosts(new Map());
    setMoviesdriveSelectedUrls(new Set());

    setInput(targetUrl);
    setShowSkymoviesSearchInput(false);
    setShowMoviesdriveSearchInput(false);
    setShowFilmygoSearchInput(false);
    setShowHdhubSearchInput(false);
    setSkymoviesSearchTerm("");
    setTimeout(() => {
      handleCheck(undefined, targetUrl, 0, true);
    }, 100);
  };

  const executeFilmygoSearch = (query: string) => {
    const trimmed = query.trim();
    const domain = getFilmygoDomain();
    let targetUrl = "";
    if (!trimmed) {
      targetUrl = `${domain}/?to-page=1`;
    } else if (!trimmed.startsWith("http")) {
      targetUrl = `${domain}/site-search.html?to-search=${encodeURIComponent(trimmed)}&to-page=1`;
    } else {
      targetUrl = trimmed;
    }

    // Clear cache & active search overlays for fresh search
    processedExtractionsRef.current.delete(normalizeUrl(targetUrl));
    processedExtractionsRef.current.delete(targetUrl);
    setMoviesdriveSearchUrl(null);
    setMoviesdriveSearchPosts([]);
    setCatalogTotalFound(0);
    setCatalogExplicitTotalPages(1);
    setCatalogHasMore(false);
    setAllAccumulatedPosts(new Map());
    setMoviesdriveSelectedUrls(new Set());

    setInput(targetUrl);
    setShowFilmygoSearchInput(false);
    setShowMoviesdriveSearchInput(false);
    setShowSkymoviesSearchInput(false);
    setShowHdhubSearchInput(false);
    setFilmygoSearchTerm("");
    setTimeout(() => {
      handleCheck(undefined, targetUrl, 0, true);
    }, 100);
  };

  const executeHdhubSearch = (query: string) => {
    const trimmed = query.trim();
    const domain = getHdhub4uDomain();
    let targetUrl = "";
    if (!trimmed) {
      targetUrl = `${domain}/`;
    } else if (!trimmed.startsWith("http")) {
      targetUrl = `${domain}/search.html?q=${encodeURIComponent(trimmed)}`;
    } else {
      targetUrl = trimmed;
    }

    // Clear cache & active search overlays for fresh search
    processedExtractionsRef.current.delete(normalizeUrl(targetUrl));
    processedExtractionsRef.current.delete(targetUrl);
    setMoviesdriveSearchUrl(null);
    setMoviesdriveSearchPosts([]);
    setCatalogTotalFound(0);
    setCatalogExplicitTotalPages(1);
    setCatalogHasMore(false);
    setAllAccumulatedPosts(new Map());
    setMoviesdriveSelectedUrls(new Set());

    setInput(targetUrl);
    setShowHdhubSearchInput(false);
    setShowMoviesdriveSearchInput(false);
    setShowSkymoviesSearchInput(false);
    setShowFilmygoSearchInput(false);
    setShowFilmyflySearchInput(false);
    setHdhubSearchTerm("");
    setTimeout(() => {
      handleCheck(undefined, targetUrl, 0, true);
    }, 100);
  };

  const executeFilmyflySearch = (query: string) => {
    const trimmed = query.trim();
    const domain = getFilmyflyDomain();
    let targetUrl = "";
    if (!trimmed) {
      targetUrl = `${domain}/`;
    } else if (!trimmed.startsWith("http")) {
      targetUrl = `${domain}/search.html?search=${encodeURIComponent(trimmed)}&page=1`;
    } else {
      targetUrl = trimmed;
    }

    // Clear cache & active search overlays for fresh search
    processedExtractionsRef.current.delete(normalizeUrl(targetUrl));
    processedExtractionsRef.current.delete(targetUrl);
    setMoviesdriveSearchUrl(null);
    setMoviesdriveSearchPosts([]);
    setCatalogTotalFound(0);
    setCatalogExplicitTotalPages(1);
    setCatalogHasMore(false);
    setAllAccumulatedPosts(new Map());
    setMoviesdriveSelectedUrls(new Set());

    setInput(targetUrl);
    setShowFilmyflySearchInput(false);
    setShowHdhubSearchInput(false);
    setShowMoviesdriveSearchInput(false);
    setShowSkymoviesSearchInput(false);
    setShowFilmygoSearchInput(false);
    setFilmyflySearchTerm("");
    setTimeout(() => {
      handleCheck(undefined, targetUrl, 0, true);
    }, 100);
  };

  const handleClose = useCallback(() => {
    if (moviesdriveSearchUrl) {
      setMoviesdriveSearchUrl(null);
      setMoviesdriveSearchPosts([]);
      setAllAccumulatedPosts(new Map());
      setMoviesdriveSelectedUrls(new Set());
      setHasUserInteractedSelection(false);
      setMoviesdriveSearchQuery("");
      setMoviesdrivePageLoading(false);
      setCustomPageInput("");
    } else if (mdriveUrl) {
      setMdriveUrl(null);
      setMdriveResults([]);
      setMdriveSelectedIndices(new Set());
      setPreloadedEpisodes({});
      setLoadingEpisodes({});
      setExpandedEpisodes({});
      setSelectedSubEpisodes({});
    } else {
      onClose();
    }
  }, [moviesdriveSearchUrl, mdriveUrl, onClose]);

  useModalBehavior(isOpen, handleClose);

  const links = useMemo(() => {
    return splitLinks(input).map(normalizeUrl).filter(Boolean);
  }, [input]);

  // Auto-start check tracker
  const autoStartedInputRef = React.useRef<string | null>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  const extractedMeta = useMemo(() => {
    const map: Record<string, {
      qualityLabel?: string;
      codecLabel?: string;
      audioLabel?: string;
      subtitleLabel?: string;
      printQualityLabel?: string;
      season?: number;
      episode?: number;
      isFullSeasonMKV?: boolean;
      isFullSeasonZIP?: boolean;
    }> = {};
    for (const link of links) {
      map[link] = detectMetadataForLink(input, link, languages, qualities);
    }
    return map;
  }, [input, links, languages, qualities]);

  const extractedMetaRef = React.useRef(extractedMeta);
  React.useEffect(() => {
    extractedMetaRef.current = extractedMeta;
  }, [extractedMeta]);

  const firstType = useMemo(() => (links[0] ? guessLinkType(links[0]) : "General link"), [links]);

  const toggleExpand = (url: string) => {
    setExpanded((prev) => ({ ...prev, [url]: !prev[url] }));
  };

  const toggleSelect = (url: string) => {
    setSelectedUrls((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (areAllEligibleSelected) {
      setSelectedUrls((prev) => {
        const next = new Set(prev);
        eligibleUrlsForSelect.forEach(url => next.delete(url));
        return next;
      });
    } else {
      setSelectedUrls((prev) => {
        const next = new Set(prev);
        eligibleUrlsForSelect.forEach(url => next.add(url));
        return next;
      });
    }
  };

  const updateBatchReviewItem = (key: string, field: 'title' | 'year' | 'type', value: string) => {
    setBatchReviewItems(prev => prev.map(item => {
      if (item.key !== key) return item;
      if (field === 'type') {
        return {
          ...item,
          metadata: {
            ...item.metadata,
            type: value as 'movie' | 'series',
          }
        };
      }
      return { ...item, [field]: value };
    }));
  };

  const confirmBatchReview = () => {
    if (!onBatchAddLinks) return;
    
    onBatchAddLinks(batchReviewItems.map(item => {
      const parsedYear = item.year ? parseInt(item.year) : undefined;
      const isTitleSearch = Boolean(item.metadata?.isTitleSearch);
      const cached = isTitleSearch ? getImportCache(item.title, parsedYear) : null;
      return {
        title: item.title,
        year: parsedYear,
        links: item.links,
        metadata: {
          ...item.metadata,
          tmdbData: isTitleSearch ? (item.metadata?.tmdbData || cached?.tmdbData) : undefined,
          isTitleSearch,
        }
      };
    }));
    reset();
    onClose();
  };

  const handleMdriveSearch = async (targetUrl: string) => {
    setMdriveLoading(true);
    setMdriveError(null);
    setMdriveResults([]);
    setMdriveSelectedIndices(new Set());

    try {
      const mdDomain = getMoviesdriveDomain();
      const isMd = targetUrl.includes('moviesdrive') || targetUrl.includes('moviesdrives') || (mdDomain && normalizeUrl(targetUrl).includes(normalizeUrl(mdDomain)));
      const endpoint = isMd ? `/api/moviesdrive?url=${encodeURIComponent(targetUrl)}` : `/api/mdrive?url=${encodeURIComponent(targetUrl)}`;
      const res = await fetch(endpoint);
      if (!res.ok) throw new Error('Failed to fetch from MDrive');
      const data = await res.json();
      const hits = (data.hits || []).filter((h: any) => {
        const u = (h.url || '').toLowerCase();
        const name = (h.file_name || '').toLowerCase();
        return !u.includes('gdflix') && !name.includes('gdflix');
      }).map((h: any) => {
        if (h.size) return h;
        const sm = (h.file_name || h.label || '').match(/\[?\s*(\d+(?:\.\d+)?\s*(?:GB|MB|KB))\s*\]?/i);
        return sm ? { ...h, size: sm[1].toUpperCase() } : h;
      });
      setMdriveResults(hits);

      const hubcloudHits = hits.filter((h: any) => /(hubcloud|vcloud|hubdrive|drivehub|hubcdn|hblinks)/i.test(h.url || ''));

      // If MDrive page only has 1 option to select (1 hit in total or 1 hubcloud hit):
      // Automatically select and proceed without opening any popup!
      if (hits.length === 1 || hubcloudHits.length === 1) {
        const singleLink = hits.length === 1 ? hits[0].url : hubcloudHits[0].url;
        processedExtractionsRef.current.add(targetUrl);
        processedExtractionsRef.current.add(normalizeUrl(targetUrl));
        
        const baseLink = targetUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
        const escapedBase = baseLink.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(https?://)?(www\\.)?${escapedBase}/?`, 'g');
        
        const currentInput = inputRef.current;
        let nextInput = currentInput.replace(regex, singleLink);
        if (nextInput === currentInput) {
          nextInput = currentInput.split('\n').map(line => {
            const trimmed = line.trim();
            if (!trimmed) return line;
            if (trimmed === targetUrl.trim() || normalizeUrl(trimmed) === normalizeUrl(targetUrl)) {
              return singleLink;
            }
            return line;
          }).join('\n');
        }
        
        console.log("MDrive auto-replacement (single option):", { from: targetUrl, to: singleLink });
        setInput(nextInput);
        setMdriveUrl(null);
        setMdriveResults([]);
        
        setTimeout(() => {
          handleCheck(undefined, nextInput);
        }, 400);
        return;
      }

      if (hits.length > 1) {
        const isFilmygo = targetUrl.includes('filmygo.') || targetUrl.includes('filmycab.') || targetUrl.includes('filesdl.');
        
        if (isFilmygo) {
          // For FilmyGo: always select links no matter series or movie according to selection
          const autoHits = filterFilmygoHits(hits, targetUrl);
          if (autoHits.length > 0) {
            const selectedUrls = autoHits.map(h => h.url).join('\n');
            processedExtractionsRef.current.add(targetUrl);
            processedExtractionsRef.current.add(normalizeUrl(targetUrl));
            const currentInput = inputRef.current;
            let nextInput = currentInput.replace(targetUrl, selectedUrls);
            if (nextInput === currentInput) {
              nextInput = currentInput.split('\n').map(line => {
                const trimmed = line.trim();
                if (!trimmed) return line;
                if (trimmed === targetUrl.trim() || normalizeUrl(trimmed) === normalizeUrl(targetUrl)) {
                  return selectedUrls;
                }
                return line;
              }).join('\n');
            }
            console.log("FilmyGo link auto-selection:", { from: targetUrl, count: autoHits.length });
            setInput(nextInput);
            setMdriveUrl(null);
            setMdriveResults([]);
            setTimeout(() => {
              handleCheck(undefined, nextInput);
            }, 400);
            return;
          }
        }

        const autoHits = filterMoviesdriveHits(hits, targetUrl);
        const autoIndices = new Set<number>();
        hits.forEach((h: any, idx: number) => {
          if (autoHits.some((ah: any) => ah.url === h.url)) {
            autoIndices.add(idx);
          }
        });

        // Determine if verified as movie vs series
        const isExplicitMovie = 
          Boolean(data?.is_movie) ||
          /\b(movie|film)\b/i.test(targetUrl) ||
          /\b(movie|film)\b/i.test(data?.post_title || '') ||
          (hits.length > 0 && hits.every((h: any) => !/\b(season|episode|ep\s*\d+|pack|zip|batch|complete|all\s*episodes)\b/i.test(h.file_name || '')));

        const isSeries = !isExplicitMovie && (
          Boolean(data?.is_series) ||
          isSeriesPostOrHits(hits, targetUrl, data)
        );

        // Automatically select links for moviesdrive if it is not detected as series and verified as a movie
        if (!isSeries && autoHits.length > 0) {
          const selectedUrls = autoHits.map(h => h.url).join('\n');
          processedExtractionsRef.current.add(targetUrl);
          processedExtractionsRef.current.add(normalizeUrl(targetUrl));
          const currentInput = inputRef.current;
          let nextInput = currentInput.replace(targetUrl, selectedUrls);
          if (nextInput === currentInput) {
            nextInput = currentInput.split('\n').map(line => {
              const trimmed = line.trim();
              if (!trimmed) return line;
              if (trimmed === targetUrl.trim() || normalizeUrl(trimmed) === normalizeUrl(targetUrl)) {
                return selectedUrls;
              }
              return line;
            }).join('\n');
          }
          console.log("MoviesDrive movie auto-selection:", { from: targetUrl, count: autoHits.length });
          setInput(nextInput);
          setMdriveUrl(null);
          setMdriveResults([]);
          setTimeout(() => {
            handleCheck(undefined, nextInput);
          }, 400);
          return;
        }

        const isMoviesdriveOrHdhub = 
          targetUrl.includes('moviesdrive') ||
          targetUrl.includes('moviesdrives') ||
          targetUrl.includes('mdrive') ||
          targetUrl.includes('hdhub4u');

        if (isSeries) {
          if (isMoviesdriveOrHdhub) {
            const seriesResult = selectMoviesdriveOrHdhub4uSeriesLinks(hits, targetUrl);
            if (seriesResult.canAutoSelect && seriesResult.selectedHits.length > 0) {
              const selectedUrls = seriesResult.selectedHits.map(h => h.url).join('\n');
              processedExtractionsRef.current.add(targetUrl);
              processedExtractionsRef.current.add(normalizeUrl(targetUrl));
              const currentInput = inputRef.current;
              let nextInput = currentInput.replace(targetUrl, selectedUrls);
              if (nextInput === currentInput) {
                nextInput = currentInput.split('\n').map(line => {
                  const trimmed = line.trim();
                  if (!trimmed) return line;
                  if (trimmed === targetUrl.trim() || normalizeUrl(trimmed) === normalizeUrl(targetUrl)) {
                    return selectedUrls;
                  }
                  return line;
                }).join('\n');
              }
              console.log("MoviesDrive/HDHub4U series auto-selection without popup:", { from: targetUrl, count: seriesResult.selectedHits.length });
              setInput(nextInput);
              setMdriveUrl(null);
              setMdriveResults([]);
              setTimeout(() => {
                handleCheck(undefined, nextInput);
              }, 400);
              return;
            } else {
              console.log("MoviesDrive/HDHub4U series fallback to manual selection popup:", { from: targetUrl, reason: seriesResult.reason });
              setMdriveSelectedIndices(new Set());
            }
          } else {
            setMdriveSelectedIndices(new Set());
          }
        } else {
          setMdriveSelectedIndices(autoIndices);
        }
        setMdriveUrl(targetUrl);
        return;
      } else if (hits.length === 0) {
        // No links found, mark as processed and continue
        processedExtractionsRef.current.add(targetUrl);
        processedExtractionsRef.current.add(normalizeUrl(targetUrl));
        setMdriveUrl(null); // Ensure popup stays closed
        setTimeout(() => {
          handleCheck();
        }, 400);
      }
    } catch (err: any) {
      // On error, show the popup so the user can see the error
      setMdriveUrl(targetUrl);
      setMdriveError(err.message);
    } finally {
      setMdriveLoading(false);
      setLoading(false); // Also reset main loading just in case
    }
  };

  const handleExtractDirectMdrive = async (index: number) => {
    const item = mdriveResults[index];
    if (!item || mdriveExtractingDirect[index]) return;

    setMdriveExtractingDirect(prev => ({ ...prev, [index]: true }));
    try {
      const res = await fetch('/api/hubcloud/direct-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: item.url })
      });
      const data = await res.json();
      
      if (data.size || data.url || data.title || data.original_title) {
        setMdriveResultsState(prev => {
          const next = [...prev];
          const currentItem = next[index];
          let hubcloudName = data.original_title || data.title || currentItem.file_name;

          if (hubcloudName && typeof hubcloudName === 'string') {
            const lowerTitle = hubcloudName.toLowerCase();
            if (!lowerTitle.includes('cloudflare') && !lowerTitle.includes('unknown') && !lowerTitle.includes('timeout') && !lowerTitle.includes('just a moment')) {
              let cleanTitle = hubcloudName.replace(/&#8211;/g, '-').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
              cleanTitle = cleanTitle.replace(/\[?\s*\d+(?:\.\d+)?\s*(?:GB|MB|KB)\s*\]?/gi, '').trim();

              const qualityLabel = data.quality || currentItem.quality || '';
              if (qualityLabel && !cleanTitle.toUpperCase().includes(qualityLabel.toUpperCase())) {
                cleanTitle = `${cleanTitle} [${qualityLabel}]`;
              }
              hubcloudName = cleanTitle;
            }
          }

          next[index] = { 
            ...currentItem, 
            size: data.size || currentItem.size,
            file_name: hubcloudName || currentItem.file_name,
            quality: data.quality || currentItem.quality,
            season: data.season || currentItem.season,
            episode: data.episode || currentItem.episode,
            seasonEpLabel: data.seasonEpLabel || currentItem.seasonEpLabel
          };
          return next;
        });
      }
    } catch (err) {
      console.error('Failed to extract direct hubcloud info:', err);
    } finally {
      setMdriveExtractingDirect(prev => ({ ...prev, [index]: false }));
    }
  };

  const confirmMdriveSelection = () => {
    if (mdriveUrl) {
      const finalUrls: string[] = [];

      mdriveResults.forEach((item, index) => {
        const optionName = (item.file_name || '').toLowerCase();
        const isSingleEpisode = optionName.includes('single episode') || optionName.includes('single ep');
        
        if (isSingleEpisode) {
          const subsSet = selectedSubEpisodes[item.url];
          if (subsSet && subsSet.size > 0) {
            finalUrls.push(...Array.from(subsSet));
          } else if (mdriveSelectedIndices.has(index)) {
            finalUrls.push(item.url);
          }
        } else {
          if (mdriveSelectedIndices.has(index)) {
            finalUrls.push(item.url);
          }
        }
      });

      if (finalUrls.length === 0) return;

      const newLinksText = finalUrls.join('\n');
      
      // Mark as processed BEFORE replacement to prevent it from being found again
      processedExtractionsRef.current.add(mdriveUrl);

      // Replace the MDrive link with the extracted links
      const baseLink = mdriveUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
      const escapedBase = baseLink.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(https?://)?(www\\.)?${escapedBase}/?`, 'g');
      
      // Use inputRef to ensure we have the absolute latest input
      const currentInput = inputRef.current;
      let nextInput = currentInput.replace(regex, newLinksText);
      if (nextInput === currentInput) {
        nextInput = currentInput.trim() ? `${currentInput.trim()}\n${newLinksText}` : newLinksText;
      }
      
      console.log("MDrive replacement with sub-episodes:", { from: mdriveUrl, to: newLinksText, success: nextInput !== currentInput });
      setInput(nextInput);
      
      setMdriveUrl(null);
      setMdriveResults([]);
      setMdriveSelectedIndices(new Set());
      setPreloadedEpisodes({});
      setLoadingEpisodes({});
      setExpandedEpisodes({});
      setSelectedSubEpisodes({});
      
      // Trigger check for everything - this will automatically pick up the next extractions if any exist
      setTimeout(() => {
        handleCheck(undefined, nextInput);
      }, 400);
    } else if (mdriveUrl) {
      // Just remove the mdriveUrl to go back if nothing selected
      setMdriveUrl(null);
    }
  };

  const confirmMoviesdriveSearchSelection = () => {
    if (moviesdriveSearchUrl && moviesdriveSelectedUrls.size > 0) {
      const selectedPosts: { title: string; url: string; image?: string }[] = [];
      
      for (const [url, post] of allAccumulatedPosts.entries()) {
        if (moviesdriveSelectedUrls.has(url)) {
          selectedPosts.push(post);
        }
      }
      for (const post of moviesdriveSearchPosts) {
        if (moviesdriveSelectedUrls.has(post.url) && !selectedPosts.some(p => p.url === post.url)) {
          selectedPosts.push(post);
        }
      }

      const newLinksText = selectedPosts.map(p => p.url).join('\n');
      
      processedExtractionsRef.current.add(moviesdriveSearchUrl);

      const currentInput = inputRef.current;
      const targetSearchNorm = normalizeUrl(moviesdriveSearchUrl);

      let replaced = false;
      const lines = currentInput.split('\n');
      const newLines = lines.map(line => {
        const trimmed = line.trim();
        if (!trimmed) return line;
        if (trimmed === moviesdriveSearchUrl || normalizeUrl(trimmed) === targetSearchNorm || normalizeUrl(trimmed).includes(targetSearchNorm)) {
          replaced = true;
          return newLinksText;
        }
        return line;
      });

      let nextInput = newLines.join('\n');
      if (!replaced) {
        const baseLink = moviesdriveSearchUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
        const escapedBase = baseLink.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(https?://)?(www\\.)?${escapedBase}/?`, 'gi');
        nextInput = currentInput.replace(regex, newLinksText);
      }

      if (nextInput === currentInput) {
        if (currentInput.includes(moviesdriveSearchUrl)) {
          nextInput = currentInput.replace(moviesdriveSearchUrl, newLinksText);
        } else {
          nextInput = currentInput.trim() ? `${currentInput.trim()}\n${newLinksText}` : newLinksText;
        }
      }
      
      console.log("Catalog Search Page Replacement:", { from: moviesdriveSearchUrl, count: selectedPosts.length, replaced: nextInput !== currentInput });
      setInput(nextInput);
      
      setMoviesdriveSearchUrl(null);
      setMoviesdriveSearchPosts([]);
      setAllAccumulatedPosts(new Map());
      setMoviesdriveSelectedUrls(new Set());
      setHasUserInteractedSelection(false);
      setMoviesdriveSearchQuery("");
      
      setTimeout(() => {
        handleCheck(undefined, nextInput);
      }, 400);
    } else if (moviesdriveSearchUrl) {
      processedExtractionsRef.current.add(moviesdriveSearchUrl);
      setMoviesdriveSearchUrl(null);
      setMoviesdriveSearchPosts([]);
      setAllAccumulatedPosts(new Map());
      setMoviesdriveSelectedUrls(new Set());
      setHasUserInteractedSelection(false);
      setMoviesdriveSearchQuery("");
    }
  };

  const handleCheck = async (onlyUrls?: string[], initialInputOverride?: string, depth = 0, force = false) => {
    setError(null);
    if (depth === 0 && !initialInputOverride) {
      processedExtractionsRef.current.clear();
    }
    if (depth > 10) {
      console.warn("Max check depth reached, stopping recursion.");
      setLoading(false);
      return;
    }

    // Derive links directly from input or use provided override
    const currentInputSnapshot = initialInputOverride || inputRef.current;
    
    const seenLinks = new Set<string>();
    let currentLinks = (onlyUrls || splitLinks(currentInputSnapshot).map(normalizeUrl).filter(Boolean)).filter(u => {
      const norm = normalizeUrl(u);
      if (!norm || seenLinks.has(norm)) return false;
      seenLinks.add(norm);
      return true;
    });
    
    const lines = currentInputSnapshot.split('\n').map(l => l.trim()).filter(Boolean);
    const isUrlLine = (l: string) => {
      const norm = l.toLowerCase();
      return (
        norm.startsWith('http://') ||
        norm.startsWith('https://') ||
        norm.startsWith('ftp://') ||
        (!norm.includes(' ') && (norm.includes('.lol') || norm.includes('.com') || norm.includes('.net') || norm.includes('.org') || norm.includes('.in') || norm.includes('.top') || norm.includes('.xyz') || norm.includes('.cab') || norm.includes('.club') || norm.includes('.co') || norm.includes('.app') || norm.includes('.cc') || norm.includes('.dev') || norm.includes('.ph')))
      );
    };

    const titleLines = lines.filter(l => !isUrlLine(l));

    if (!currentLinks.length && titleLines.length === 0) {
      setError("Please paste at least one valid link or enter a title first.");
      setLoading(false);
      return;
    }

    // If input is purely titles (Single title or Bulk titles), execute 5-tier waterfall search
    if (currentLinks.length === 0 && titleLines.length > 0) {
      if (!titleImportWaterfall) {
        setError("Title Import Waterfall is disabled. Please paste direct download links or check 'Title Import Waterfall' to search.");
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        if (titleLines.length === 1) {
          const rawLine = titleLines[0];
          const { title: extractedTitle, year: extractedYear } = extractTitleAndYear(rawLine);
          const searchTitle = extractedTitle || rawLine;
          const searchYear = extractedYear || (typeof initialYear === 'number' ? initialYear : initialYear ? parseInt(String(initialYear), 10) : undefined);
          const searchType = contentType || (/\b(s\d+|season\s*\d+|series|tv|episode|ep\d+)\b/i.test(rawLine) ? 'series' : 'movie');

          const waterfallResult = await runWaterfallLinkSearch({
            title: searchTitle,
            year: searchYear,
            type: searchType,
            languages,
            qualities,
          });

          if (waterfallResult.results.length > 0) {
            setResults(waterfallResult.results);
            setSelectedUrls(new Set(waterfallResult.results.map(r => r.url)));
            if (waterfallResult.metadata) {
              setDetectedMetadata({
                ...waterfallResult.metadata,
                tmdbData: waterfallResult.tmdbData,
                isTitleSearch: true,
              });
            }
            if (waterfallResult.sample?.url || waterfallResult.metadata?.sampleUrl) {
              setDetectedSampleUrl(waterfallResult.sample?.url || waterfallResult.metadata?.sampleUrl);
            }
            if (onResults) {
              onResults(waterfallResult.results);
            }
          } else {
            setError(`No links found for "${searchTitle}" across waterfall sources.`);
          }
        } else {
          // Bulk titles search
          const batchItems: {
            key: string;
            title: string;
            year: string;
            links: QualityLinks;
            metadata: any;
          }[] = [];
          const allFoundCheckResults: LinkCheckResult[] = [];

          for (let i = 0; i < titleLines.length; i++) {
            const rawLine = titleLines[i];
            const { title: extractedTitle, year: extractedYear } = extractTitleAndYear(rawLine);
            const searchTitle = extractedTitle || rawLine;
            const searchYear = extractedYear;
            const searchType = /\b(s\d+|season\s*\d+|series|tv|episode|ep\d+)\b/i.test(rawLine) ? 'series' : 'movie';

            try {
              const res = await runWaterfallLinkSearch({
                title: searchTitle,
                year: searchYear,
                type: searchType,
                languages,
                qualities,
              });

              if (res.links.length > 0) {
                allFoundCheckResults.push(...res.results);
                batchItems.push({
                  key: `bulk-${i}-${searchTitle}-${Date.now()}`,
                  title: res.metadata?.title || searchTitle,
                  year: res.metadata?.year ? String(res.metadata.year) : (searchYear ? String(searchYear) : ''),
                  links: res.qualityLinks,
                  metadata: {
                    ...res.metadata,
                    languages: res.metadata?.languages || [],
                    sampleUrl: res.sample?.url || res.metadata?.sampleUrl,
                    type: res.metadata?.type || searchType,
                    tmdbData: res.tmdbData,
                    isTitleSearch: true,
                  }
                });
              }
            } catch (err) {
              console.error(`Error searching bulk title "${searchTitle}":`, err);
            }
          }

          if (batchItems.length > 0) {
            setResults(allFoundCheckResults);
            setSelectedUrls(new Set(allFoundCheckResults.map(r => r.url)));
            setBatchReviewItems(batchItems);
            setIsReviewingBatch(true);
            if (onResults) {
              onResults(allFoundCheckResults);
            }
          } else {
            setError("No links found for any of the titles in the list.");
          }
        }
      } catch (e: any) {
        setError(e.message || "Failed to search title across sources.");
      } finally {
        setLoading(false);
      }
      return;
    }

    const mdDomain = getMoviesdriveDomain();
    const skyDomain = getSkymoviesDomain();
    const filmyDomain = getFilmygoDomain();
    const hdhubDomain = getHdhub4uDomain();
    const filmyflyDomain = getFilmyflyDomain();

    // 1. Identify all extractable links
    const extractableLinks = currentLinks.filter(u => {
      const normU = normalizeUrl(u);
      const isExtractableHost = 
        normU.includes('howblogs.xyz') || normU.includes('sky-blogs.xyz') ||
        normU.includes('filesdl.in') || normU.includes('filesdl.top') || normU.includes('filesdl.') || normU.includes('linkmake.') ||
        normU.includes('mdrive.lol') || normU.includes('mdrvie.lol') ||
        normU.includes('moviesdrives.') || normU.includes('moviesdrive.') ||
        normU.includes('workers.dev') || normU.includes('telegra.ph') ||
        normU.includes('filmygo.') || normU.includes('filmycab.') || normU.includes('skymovies') || normU.includes('hdhub4u') || normU.includes('filmyfly') ||
        (mdDomain && normU.includes(normalizeUrl(mdDomain))) ||
        (skyDomain && normU.includes(normalizeUrl(skyDomain))) ||
        (filmyDomain && normU.includes(normalizeUrl(filmyDomain))) ||
        (hdhubDomain && normU.includes(normalizeUrl(hdhubDomain))) ||
        (filmyflyDomain && normU.includes(normalizeUrl(filmyflyDomain)));

      return isExtractableHost && 
        !processedExtractionsRef.current.has(u) && 
        !processedExtractionsRef.current.has(normU);
    });

    if (extractableLinks.length > 0) {
      setLoading(true);
      let pausedForUI = false;
      try {
        // Take up to 5 links at once
        const batch = extractableLinks.slice(0, 5);
        const results = await Promise.all(batch.map(async (targetUrl, batchIdx) => {
          if (batchIdx > 0) {
            await new Promise((r) => setTimeout(r, batchIdx * 100));
          }
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 35000);
          try {
            const normUrl = normalizeUrl(targetUrl);
            if (normUrl.includes('mdrive.lol') || normUrl.includes('mdrvie.lol')) {
              const res = await fetch(`/api/mdrive?url=${encodeURIComponent(normUrl)}`, { signal: controller.signal });
              clearTimeout(timer);
              if (!res.ok) throw new Error('MDrive fetch failed');
              const data = await res.json();
              return { type: 'mdrive', original: targetUrl, data };
            } else if (normUrl.includes('moviesdrives.') || normUrl.includes('moviesdrive.') || normUrl.includes('workers.dev') || normUrl.includes('telegra.ph') || (mdDomain && normUrl.includes(normalizeUrl(mdDomain)))) {
              const res = await fetch(`/api/moviesdrive?url=${encodeURIComponent(normUrl)}`, { signal: controller.signal });
              clearTimeout(timer);
              if (!res.ok) throw new Error('MoviesDrive fetch failed');
              const data = await res.json();
              return { type: 'moviesdrive', original: targetUrl, data };
            } else if (normUrl.includes('filmygo.') || normUrl.includes('filmycab.') || (filmyDomain && normUrl.includes(normalizeUrl(filmyDomain)))) {
              const res = await fetch(`/api/filmygo?url=${encodeURIComponent(normUrl)}`, { signal: controller.signal });
              clearTimeout(timer);
              if (!res.ok) throw new Error('FilmyGo fetch failed');
              const data = await res.json();
              return { type: 'filmygo', original: targetUrl, data };
            } else if (normUrl.includes('hdhub4u') || (hdhubDomain && normUrl.includes(normalizeUrl(hdhubDomain)))) {
              const res = await fetch(`/api/hdhub4u?url=${encodeURIComponent(normUrl)}`, { signal: controller.signal });
              clearTimeout(timer);
              if (!res.ok) throw new Error('HDHub4U fetch failed');
              const data = await res.json();
              return { type: 'hdhub4u', original: targetUrl, data };
            } else if (normUrl.includes('filmyfly') || (filmyflyDomain && normUrl.includes(normalizeUrl(filmyflyDomain)))) {
              const res = await fetch(`/api/filmyfly?url=${encodeURIComponent(normUrl)}`, { signal: controller.signal });
              clearTimeout(timer);
              if (!res.ok) throw new Error('FilmyFly fetch failed');
              const data = await res.json();
              return { type: 'filmyfly', original: targetUrl, data };
            } else if (normUrl.includes('skymovies') || (skyDomain && normUrl.includes(normalizeUrl(skyDomain)))) {
              const res = await fetch(`/api/skymovieshd?url=${encodeURIComponent(normUrl)}`, { signal: controller.signal });
              clearTimeout(timer);
              if (!res.ok) throw new Error('SkymoviesHD fetch failed');
              const data = await res.json();
              return { type: 'skymovieshd', original: targetUrl, data };
            } else {
              const endpoint = normUrl.includes('howblogs.xyz') ? '/api/howblogs' : '/api/filesdl';
              const res = await fetch(`${endpoint}?url=${encodeURIComponent(normUrl)}`, { signal: controller.signal });
              clearTimeout(timer);
              if (!res.ok) throw new Error('Extraction failed');
              const data = await res.json();
              return { type: 'auto', original: targetUrl, extracted: data.url };
            }
          } catch (e) {
            clearTimeout(timer);
            console.error(`Failed to extract ${targetUrl}:`, e);
            return { type: 'error', original: targetUrl };
          }
        }));

        let nextInput = currentInputSnapshot;

        const markProcessed = (origUrl: string) => {
          processedExtractionsRef.current.add(origUrl);
          processedExtractionsRef.current.add(normalizeUrl(origUrl));
        };

        const replaceOriginalUrl = (origUrl: string, replacement: string) => {
          markProcessed(origUrl);
          const baseLink = origUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
          const escapedBase = baseLink.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(`(https?://)?(www\\.)?${escapedBase}/?`, 'g');
          let updated = nextInput.replace(regex, replacement);
          if (updated === nextInput) {
            updated = nextInput.split('\n').map(line => {
              const trimmed = line.trim();
              if (!trimmed) return line;
              if (trimmed === origUrl.trim() || normalizeUrl(trimmed) === normalizeUrl(origUrl)) {
                return replacement;
              }
              return line;
            }).join('\n');
          }
          nextInput = updated;
        };

        for (const res of results) {
          if (res.type === 'auto') {
            markProcessed(res.original);
            if (res.extracted && res.extracted !== res.original) {
              replaceOriginalUrl(res.original, res.extracted);
              console.log("Auto-replacement successful:", { from: res.original, to: res.extracted });
            }
          } else if (res.type === 'mdrive' || res.type === 'moviesdrive' || res.type === 'filmygo' || res.type === 'skymovieshd' || res.type === 'hdhub4u' || res.type === 'filmyfly') {
            if ((res.type === 'moviesdrive' || res.type === 'skymovieshd' || res.type === 'filmygo' || res.type === 'hdhub4u' || res.type === 'filmyfly') && res.data?.is_search) {
              markProcessed(res.original);
              if (Array.isArray(res.data?.posts) && res.data.posts.length > 0) {
                setMoviesdriveSearchUrl(res.original);
                setMoviesdriveSearchPosts(res.data.posts);
                const postsCount = res.data.posts.length;
                const total = typeof res.data.total_found === 'number' ? res.data.total_found : (typeof res.data.found === 'number' ? res.data.found : postsCount);
                setCatalogTotalFound(total);
                const explicitPages = typeof res.data.total_pages === 'number' && res.data.total_pages > 0
                  ? res.data.total_pages
                  : (total > postsCount ? Math.ceil(total / Math.max(1, postsCount)) : 1);
                setCatalogExplicitTotalPages(explicitPages);
                setCatalogHasMore(Boolean(res.data.has_more) || (explicitPages > 1) || (total > postsCount));
                const isSky = res.type === 'skymovieshd' || res.original.includes('skymovies');
                if (isSky) {
                  setSkymoviesVisibleLimit(500);
                }
                const initialLimit = isSky ? 10 : Math.min(res.data.posts.length, 25);

                const accMap = new Map<string, { title: string; url: string; image?: string }>();
                res.data.posts.forEach((p: any) => {
                  if (p.url) accMap.set(p.url, p);
                });
                setAllAccumulatedPosts(accMap);

                const initialSelected = new Set<string>();
                res.data.posts.slice(0, initialLimit).forEach((p: any) => {
                  if (p.url) initialSelected.add(p.url);
                });
                setMoviesdriveSelectedUrls(initialSelected);
                setHasUserInteractedSelection(false);
                setMoviesdriveSearchQuery("");
                pausedForUI = true;
                break;
              } else {
                setError(`No matching contents found on ${res.type === 'skymovieshd' ? 'SkyMoviesHD' : res.type === 'filmygo' ? 'FilmyGo' : res.type === 'hdhub4u' ? 'HDHub4U' : res.type === 'filmyfly' ? 'FilmyFly' : 'MoviesDrive'}.`);
                pausedForUI = true;
                break;
              }
            }

            const rawHits = res.data?.hits || [];
            const hits = rawHits.filter((h: any) => {
              const u = (h.url || '').toLowerCase();
              const name = (h.file_name || '').toLowerCase();
              return !u.includes('gdflix') && !name.includes('gdflix');
            }).map((h: any) => {
              if (h.size) return h;
              const sm = (h.file_name || h.label || '').match(/\[?\s*(\d+(?:\.\d+)?\s*(?:GB|MB|KB))\s*\]?/i);
              return sm ? { ...h, size: sm[1].toUpperCase() } : h;
            });
            if (hits.length > 0) {
              const hubcloudHits = hits.filter((h: any) => /(hubcloud|vcloud|hubdrive|drivehub|hubcdn|hblinks)/i.test(h.url || ''));

              // If MDrive page has only 1 option to select (1 hit or 1 Hubcloud link), auto-select immediately without modal popup!
              if (res.type === 'mdrive') {
                if (hits.length === 1) {
                  replaceOriginalUrl(res.original, hits[0].url);
                  console.log("MDrive auto-extraction successful (1 link):", hits[0].url);
                  continue;
                }
                if (hubcloudHits.length === 1) {
                  replaceOriginalUrl(res.original, hubcloudHits[0].url);
                  console.log("MDrive single Hubcloud auto-extraction successful:", hubcloudHits[0].url);
                  continue;
                }
              } else if (hits.length === 1) {
                replaceOriginalUrl(res.original, hits[0].url);
                console.log(`${res.type} auto-extraction successful (1 link):`, { from: res.original, to: hits[0].url });
                continue;
              }

              // ==========================================================
              // DOMAIN 1: FilmyGo (Strictly isolated domain logic)
              // Always select links no matter series or movie according to selection rules!
              // ==========================================================
              if (res.type === 'filmygo' || res.original.includes('filmygo.') || res.original.includes('filmycab.') || res.original.includes('filesdl.')) {
                const autoHits = filterFilmygoHits(hits, res.original);
                if (autoHits.length > 0) {
                  const selectedUrls = autoHits.map(h => h.url).join('\n');
                  replaceOriginalUrl(res.original, selectedUrls);
                  console.log(`FilmyGo auto-selected ${autoHits.length} hits without modal popup:`, { from: res.original, count: autoHits.length });
                  continue;
                } else if (hits.length === 1) {
                  replaceOriginalUrl(res.original, hits[0].url);
                  console.log("FilmyGo single link auto-replacement:", hits[0].url);
                  continue;
                } else {
                  setMdriveUrl(res.original);
                  setMdriveResults(hits);
                  setMdriveSelectedIndices(new Set());
                  pausedForUI = true;
                  break;
                }
              }

              // ==========================================================
              // DOMAIN 2: MoviesDrive (Strictly isolated domain logic)
              // ==========================================================
              if (res.type === 'mdrive' || res.type === 'moviesdrive' || res.original.includes('moviesdrive.') || res.original.includes('moviesdrives.')) {
                if (hits.length === 1) {
                  replaceOriginalUrl(res.original, hits[0].url);
                  console.log("MDrive single link auto-replacement successful:", hits[0].url);
                  continue;
                }

                const autoHits = filterMoviesdriveHits(hits, res.original);
                const autoIndices = new Set<number>();
                hits.forEach((h: any, idx: number) => {
                  if (autoHits.some((ah: any) => ah.url === h.url)) {
                    autoIndices.add(idx);
                  }
                });

                // Verify if it is verified as a movie by MoviesDrive and not series
                const isExplicitMovie = 
                  Boolean((res as any).data?.is_movie) ||
                  /\b(movie|film)\b/i.test(res.original) ||
                  /\b(movie|film)\b/i.test((res as any).data?.post_title || '') ||
                  (hits.length > 0 && hits.every((h: any) => !/\b(season|episode|ep\s*\d+|pack|zip|batch|complete|all\s*episodes)\b/i.test(h.file_name || '')));

                const isSeries = !isExplicitMovie && (
                  Boolean((res as any).data?.is_series) ||
                  isSeriesPostOrHits(hits, res.original, (res as any).data)
                );

                // Automatically select links for moviesdrive if it is not detected as series and verified as a movie
                if (!isSeries && autoHits.length > 0) {
                  const selectedUrls = autoHits.map((h: any) => h.url).join('\n');
                  replaceOriginalUrl(res.original, selectedUrls);
                  console.log(`MoviesDrive auto-selected ${autoHits.length} movie hits without modal popup:`, { from: res.original, count: autoHits.length });
                  continue;
                } else {
                  if (isSeries) {
                    const seriesResult = selectMoviesdriveOrHdhub4uSeriesLinks(hits, res.original);
                    if (seriesResult.canAutoSelect && seriesResult.selectedHits.length > 0) {
                      const selectedUrls = seriesResult.selectedHits.map((h: any) => h.url).join('\n');
                      replaceOriginalUrl(res.original, selectedUrls);
                      console.log(`MoviesDrive series auto-selected ${seriesResult.selectedHits.length} hits without modal popup:`, { from: res.original });
                      continue;
                    } else {
                      console.log(`MoviesDrive series fallback to manual selection:`, { from: res.original, reason: seriesResult.reason });
                      setMdriveSelectedIndices(new Set());
                    }
                  } else {
                    setMdriveSelectedIndices(autoIndices);
                  }
                  setMdriveUrl(res.original);
                  setMdriveResults(hits);
                  pausedForUI = true;
                  break;
                }
              }

              // ==========================================================
              // DOMAIN 3: HDHub4U (Strictly isolated domain logic)
              // ==========================================================
              if (res.type === 'hdhub4u' || res.original.includes('hdhub4u')) {
                const isExplicitMovie = 
                  Boolean((res as any).data?.is_movie) ||
                  /\b(movie|film)\b/i.test(res.original) ||
                  /\b(movie|film)\b/i.test((res as any).data?.post_title || '') ||
                  (hits.length > 0 && hits.every((h: any) => !/\b(season|episode|ep\s*\d+|pack|zip|batch|complete|all\s*episodes)\b/i.test(h.file_name || '')));

                const isSeries = !isExplicitMovie && (
                  Boolean((res as any).data?.is_series) ||
                  isSeriesPostOrHits(hits, res.original, (res as any).data)
                );

                if (isSeries && hits.length > 1) {
                  const seriesResult = selectMoviesdriveOrHdhub4uSeriesLinks(hits, res.original);
                  if (seriesResult.canAutoSelect && seriesResult.selectedHits.length > 0) {
                    const selectedUrls = seriesResult.selectedHits.map((h: any) => h.url).join('\n');
                    replaceOriginalUrl(res.original, selectedUrls);
                    console.log(`HDHub4U series auto-selected ${seriesResult.selectedHits.length} hits without modal popup:`, { from: res.original });
                    continue;
                  } else {
                    console.log(`HDHub4U series fallback to manual selection:`, { from: res.original, reason: seriesResult.reason });
                    setMdriveSelectedIndices(new Set());
                    setMdriveUrl(res.original);
                    setMdriveResults(hits);
                    pausedForUI = true;
                    break;
                  }
                }

                const autoHits = filterHdhub4uHits(hits, res.original);
                if (autoHits.length > 0) {
                  const selectedUrls = autoHits.map(h => h.url).join('\n');
                  replaceOriginalUrl(res.original, selectedUrls);
                  console.log(`HDHub4U auto-selected ${autoHits.length} movie hits without modal popup:`, { from: res.original, count: autoHits.length });
                  continue;
                } else if (hits.length === 1) {
                  replaceOriginalUrl(res.original, hits[0].url);
                  console.log("HDHub4U single link auto-replacement:", hits[0].url);
                  continue;
                } else {
                  setMdriveUrl(res.original);
                  setMdriveResults(hits);
                  setMdriveSelectedIndices(new Set());
                  pausedForUI = true;
                  break;
                }
              }

              // ==========================================================
              // DOMAIN 4: SkyMoviesHD (Strictly isolated domain logic)
              // ==========================================================
              if (res.type === 'skymovieshd' || res.original.includes('skymovies')) {
                const autoHits = filterSkymoviesHits(hits, res.original);
                const hasSeries = hasSeriesOrZipIndicator(hits);

                if (hasSeries && hits.length > 1) {
                  setMdriveUrl(res.original);
                  setMdriveResults(hits);
                  setMdriveSelectedIndices(new Set());
                  pausedForUI = true;
                  break;
                }

                if (autoHits.length > 0) {
                  const selectedUrls = autoHits.map(h => h.url).join('\n');
                  replaceOriginalUrl(res.original, selectedUrls);
                  console.log(`SkyMoviesHD auto-selected ${autoHits.length} hits without modal popup:`, { from: res.original, count: autoHits.length });
                  continue;
                } else if (hits.length === 1) {
                  replaceOriginalUrl(res.original, hits[0].url);
                  console.log("SkyMoviesHD single link auto-replacement:", hits[0].url);
                  continue;
                } else {
                  setMdriveUrl(res.original);
                  setMdriveResults(hits);
                  setMdriveSelectedIndices(new Set());
                  pausedForUI = true;
                  break;
                }
              }

              // ==========================================================
              // DOMAIN 5: FilmyFly (Strictly isolated domain logic)
              // ==========================================================
              if (res.type === 'filmyfly' || res.original.includes('filmyfly')) {
                const autoHits = filterFilmyflyHits(hits, res.original);
                const hasSeries = hasSeriesOrZipIndicator(hits);

                if (hasSeries && hits.length > 1) {
                  setMdriveUrl(res.original);
                  setMdriveResults(hits);
                  setMdriveSelectedIndices(new Set());
                  pausedForUI = true;
                  break;
                }

                if (autoHits.length > 0) {
                  const selectedUrls = autoHits.map(h => h.url).join('\n');
                  replaceOriginalUrl(res.original, selectedUrls);
                  console.log(`FilmyFly auto-selected ${autoHits.length} hits without modal popup:`, { from: res.original, count: autoHits.length });
                  continue;
                } else if (hits.length === 1) {
                  replaceOriginalUrl(res.original, hits[0].url);
                  console.log("FilmyFly single link auto-replacement:", hits[0].url);
                  continue;
                } else {
                  setMdriveUrl(res.original);
                  setMdriveResults(hits);
                  setMdriveSelectedIndices(new Set());
                  pausedForUI = true;
                  break;
                }
              }

              // Fallback for any other generic provider
              const autoHits = filterMoviesdriveHits(hits, res.original);
              if (autoHits.length > 0) {
                const selectedUrls = autoHits.map(h => h.url).join('\n');
                replaceOriginalUrl(res.original, selectedUrls);
                console.log(`${res.type} auto-selected ${autoHits.length} hits without modal popup:`, { from: res.original, count: autoHits.length });
                continue;
              } else if (hits.length === 1) {
                replaceOriginalUrl(res.original, hits[0].url);
                continue;
              } else {
                setMdriveUrl(res.original);
                setMdriveResults(hits);
                setMdriveSelectedIndices(new Set());
                pausedForUI = true;
                break;
              }
            } else {
              // 0 hits
              markProcessed(res.original);
            }
          } else if (res.type === 'error') {
            console.log("Extraction error for", res.original, "- skipping from this session");
            markProcessed(res.original);
          }
        }

        setInput(nextInput);
        
        if (!pausedForUI) {
          setTimeout(() => {
            handleCheck(undefined, nextInput, depth + 1, force);
          }, 400);
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
      return;
    }

    // 2. Original MDrive detection logic is now integrated into batch above, 
    // but just in case something slipped through or direct call:
    // (Actually the batch handles it all now)

    // 3. Final Scan Loop - FILTER OUT host links that should be extracted
    const urls = currentLinks.filter(u => 
      !u.includes('mdrive.lol') && !u.includes('mdrvie.lol') && 
      !u.includes('howblogs.xyz') && 
      !u.includes('filesdl.in') &&
      !u.includes('filesdl.top') &&
      !u.includes('moviesdrives.') &&
      !u.includes('moviesdrive.') &&
      !u.includes('filmygo.') &&
      !u.includes('skymovies')
    );
    
    if (urls.length === 0 && currentLinks.length > 0) {
      // If we filtered everything out but had links, it means we are waiting for extractions or extractions failed
      setLoading(false);
      return;
    }
    
    for (const u of urls) {
      try {
        new URL(u);
      } catch {
        setError(`Invalid URL: ${u}`);
        return;
      }
    }

    if (!onlyUrls?.length) {
      setSelectedUrls(new Set());
    }

    setLoading(true);
    try {
      const concurrency = 20;
      const allResults: LinkCheckResult[] = [];
      const queue = [...urls];
      let activeCount = 0;
      let completedCount = 0;

      const processNext = async (): Promise<void> => {
        while (queue.length > 0) {
          const u = queue.shift();
          if (!u) break;

          try {
            const result = await performFullLinkScan(u, extractedMetaRef.current, languages, qualities, undefined, undefined, undefined, force);
            allResults.push(result);
            completedCount++;

            const isHubcloud = isHubcloudVariant(result.url);
            const hasPixeldrain = isHubcloud && !!result.candidates?.some(c => c.text.toLowerCase().includes("pixeldrain") || c.href.toLowerCase().includes("pixeldrain"));
            const isSelectable = result.statusLabel === "WORKING" || result.statusLabel === "SMALL_FILE" || result.statusLabel === "MISSING_FILENAME" || result.statusLabel === "MISSING_METADATA" || result.statusLabel === "SIZE_MISMATCH";

            if (isSelectable) {
              if (!isHubcloud || hasPixeldrain) {
                setSelectedUrls((prev) => new Set(prev).add(result.url));
              }
            }
          } catch (e: any) {
            console.error(`Error checking link ${u}:`, e);
            const meta = extractedMetaRef.current[u] || extractedMetaRef.current[normalizeUrl(u)] || {};
            const errorResult: LinkCheckResult = {
              url: u,
              ok: false,
              statusLabel: "UNKNOWN",
              message: e?.message || "Check failed due to a network or fetch error.",
              season: meta.season,
              episode: meta.episode,
              isFullSeasonMKV: meta.isFullSeasonMKV,
              isFullSeasonZIP: meta.isFullSeasonZIP,
              qualityLabel: meta.qualityLabel,
              codecLabel: meta.codecLabel,
              audioLabel: meta.audioLabel,
              subtitleLabel: meta.subtitleLabel,
              printQualityLabel: meta.printQualityLabel,
            };
            allResults.push(errorResult);
            completedCount++;
          } finally {
            // Update results incrementally for better UX
            setResults((prev) => {
              let merged: LinkCheckResult[];
              if (onlyUrls?.length) {
                const keep = prev.filter((r) => !onlyUrls.includes(r.url));
                merged = [...keep, ...allResults];
              } else {
                merged = [...allResults];
              }
              return merged;
            });
          }
        }
      };

      const workers = Array.from({ length: Math.min(concurrency, urls.length) }, () => processNext());
      await Promise.all(workers);
      
      // Calculate mismatchWarnings at the end to avoid O(N^3) complexity during incremental updates
      const finalResults = allResults.map(r => ({
        ...r,
        mismatchWarnings: buildMismatchWarnings(r, allResults, languages, qualities),
        confidenceScore: Math.max(0, 100 - (buildMismatchWarnings(r, allResults, languages, qualities).length * 18)),
      }));

      const sortedFinal = sortResultsByEpisodeAndQuality(finalResults);

      const seenFinalUrls = new Set<string>();
      const dedupedSortedFinal = sortedFinal.filter(r => {
        const norm = normalizeUrl(r.url);
        if (!norm || seenFinalUrls.has(norm)) return false;
        seenFinalUrls.add(norm);
        return true;
      });

      setResults(prev => {
        if (onlyUrls?.length) {
          const keep = prev.filter((r) => !onlyUrls.includes(r.url));
          const merged = sortResultsByEpisodeAndQuality([...keep, ...dedupedSortedFinal]);
          const seenMerged = new Set<string>();
          const dedupedMerged = merged.filter(r => {
            const norm = normalizeUrl(r.url);
            if (!norm || seenMerged.has(norm)) return false;
            seenMerged.add(norm);
            return true;
          });
          return dedupedMerged.map(r => ({
            ...r,
            mismatchWarnings: buildMismatchWarnings(r, dedupedMerged, languages, qualities),
            confidenceScore: Math.max(0, 100 - (buildMismatchWarnings(r, dedupedMerged, languages, qualities).length * 18)),
          }));
        }
        return dedupedSortedFinal;
      });

      if (onResults) {
        onResults(dedupedSortedFinal);
      }
    } catch (e: any) {
      setError(e?.message || "Unknown error while checking links.");
    } finally {
      setLoading(false);
    }
  };

  const handleAddLinks = () => {
    if ((!onAddLinks && !onBatchAddLinks) || results.length === 0) return;
    
    const validResultsRaw = results.filter(r => selectedUrls.has(r.url));
    if (validResultsRaw.length === 0) return;

    // Deduplicate by URL
    const seenUrls = new Set<string>();
    const validResults: LinkCheckResult[] = [];
    for (const r of validResultsRaw) {
      if (!seenUrls.has(r.url)) {
        seenUrls.add(r.url);
        validResults.push(r);
      }
    }

    const qualityLinks: QualityLinks = validResults.map(r => {
      // Use detected quality or fallback
      const quality = r.qualityLabel || '720p';

      const source = `${r.fileName || ""} ${r.finalUrl || ""}`.toLowerCase();
      const isSampleLink = r.isSample || (r as any).is_sample || source.includes('sample');

      // Build a descriptive name
      let finalName = isSampleLink ? 'Sample' : quality;
      
      let detectedS: number | undefined;
      let detectedE: number | undefined;

      const combinedMatch = source.match(/\bs(\d+)e(\d+)(?![a-z0-9])/i) || 
                           source.match(/season\s*(\d+).*?episode\s*(\d+)/i) ||
                           source.match(/\bs(\d+)\s*e(\d+)\b/i) ||
                           source.match(/\bdl\s*(\d+)\s*(\d+)\b/i);

      if (combinedMatch) {
        detectedS = parseInt(combinedMatch[1]);
        detectedE = parseInt(combinedMatch[2]);
      } else {
        const sMatch = source.match(/\bs(\d+)\b/i) || source.match(/season\s*(\d+)/i) || source.match(/ss\s*(\d+)/i);
        const eMatch = source.match(/\be(\d+)\b/i) || source.match(/episode\s*(\d+)\b/i) || source.match(/ep\s*(\d+)\b/i);
        if (sMatch) detectedS = parseInt(sMatch[1]);
        if (eMatch) detectedE = parseInt(eMatch[1]);
      }

      const isHevcDetected = r.codecLabel === "HEVC" || /\b(hevc|x265|h[\.\-_]?265|10bit|10-bit)\b/i.test(source);
      if (isHevcDetected && !finalName.toUpperCase().includes("HEVC")) finalName += ` HEVC`;
      if (r.audioLabel && r.audioLabel.includes('Dual') && !finalName.toUpperCase().includes("DUAL")) finalName += ' Dual';

      // Determine size and unit
      let sizeStr = '';
      let unit: 'MB' | 'GB' = 'MB';
      
      if (r.fileSizeText) {
        const parts = r.fileSizeText.split(' ');
        if (parts.length === 2 && (parts[1].toUpperCase() === 'MB' || parts[1].toUpperCase() === 'GB')) {
          sizeStr = parts[0];
          unit = parts[1].toUpperCase() as 'MB' | 'GB';
        } else {
          sizeStr = r.fileSizeText.replace(/MB|GB/i, '').trim();
          unit = r.fileSizeText.toLowerCase().includes('gb') ? 'GB' : 'MB';
        }
      } else if (r.fileSize) {
        const sizeMB = r.fileSize / (1000 * 1000);
        if (sizeMB >= 1000) {
          sizeStr = (sizeMB / 1000).toFixed(2);
          unit = 'GB';
        } else {
          sizeStr = sizeMB.toFixed(1).replace(/\.0$/, '');
          unit = 'MB';
        }
      }

      const linkItem: LinkDef = {
        id: Math.random().toString(36).substr(2, 9),
        name: finalName,
        url: normalizeUrl(r.finalUrl || r.url),
        size: sizeStr,
        unit: unit,
      };

      const hasEpisodeRange = isEpisodeRange(source);

      const finalS = detectedS !== undefined ? detectedS : r.season;
      const finalE = (detectedE !== undefined && !hasEpisodeRange) ? detectedE : r.episode;

      if (finalS !== undefined) linkItem.season = finalS;
      if (finalE !== undefined) {
        linkItem.episode = finalE;
        linkItem.isFullSeasonMKV = false;
        linkItem.isFullSeasonZIP = false;
      } else {
        if (source.includes('.zip')) {
          linkItem.isFullSeasonZIP = true;
        } else if (hasEpisodeRange || /full season|all episodes|complete/i.test(source)) {
          linkItem.isFullSeasonMKV = true;
        }
      }
      if (isSampleLink) linkItem.isSample = true;

      return linkItem;
    });
    
     if (isBatchMode && onBatchAddLinks) {
       const batchesMap = new Map<string, { 
         title: string; 
         year: number | undefined; 
         links: QualityLinks;
         detectMetadata: {
           languages: Set<string>;
           printQuality?: string;
           subtitles: boolean;
           type: "movie" | "series";
           season?: number;
         }
       }>();
       
       qualityLinks.forEach((ql, idx) => {
         const r = validResults[idx];
         const isSampleLink = ql.isSample || r.isSample || (r as any).is_sample || /\bsample\b/i.test(r.fileName || '');
         const cleanFileName = (r.fileName || "").replace(/^SAMPLE[-_.\s]*/i, "").trim();
         const hubcloudTitle = cleanFileName || (r as any).sourceTitle || r.fileName || "";
         const sourceText = hubcloudTitle ? hubcloudTitle : `${(r as any).rawQuality || ""} ${r.url || ""}`;
         const { title: extractedTitle, year: extractedYear, season: parsedS, episode: parsedE } = extractTitleAndYear(sourceText);
         const rawYear = extractedYear || r.year || initialYear;
        const year = typeof rawYear === 'string' ? (parseInt(rawYear, 10) || undefined) : rawYear;
         const title = (contentType && contentType === 'series' && initialTitle) ? initialTitle : (extractedTitle || initialTitle);
         const derivedTitle = title || `Untitled ${new Date().getFullYear()}`;

         const isExplicitMovie = /\b(movie|film)\b/i.test(sourceText) && !/\bs\d+\s*e\d+\b/i.test(sourceText);
         const isSeries = contentType ? (contentType === 'series') : (
           !isExplicitMovie && !!(
             ql.season ||
             ql.episode ||
             ql.isFullSeasonMKV ||
             ql.isFullSeasonZIP ||
             parsedS !== undefined ||
             parsedE !== undefined ||
             /(?:(?<=^|[^a-zA-Z0-9])(?:s\d+\s*e\d+|season\s*[-_.]?\s*\d+|s\d+)(?![a-zA-Z0-9])|full\s*season|all\s*episodes|complete\s*season)/i.test(sourceText)
           )
         );

         const normTitle = normalizeTitle(derivedTitle) || 'untitled';
         const key = isSeries ? `series:${normTitle}` : `movie:${normTitle}|${year || ''}`;

         if (!batchesMap.has(key)) {
            batchesMap.set(key, { 
              title: derivedTitle, 
              year, 
              links: [],
              detectMetadata: {
                languages: new Set<string>(),
                subtitles: false,
                type: isSeries ? "series" : "movie"
              }
            });
         }
         
         const batch = batchesMap.get(key)!;

         // Ensure better clean title if generic
         if (derivedTitle && (!batch.title || batch.title.startsWith("Untitled"))) {
           batch.title = derivedTitle;
         }
         if (year && !batch.year) {
           batch.year = year;
         }

         if (!batch.links.some(l => l.url === ql.url)) {
           batch.links.push(ql);
         }

         if (isSampleLink && ql.url) {
           (batch.detectMetadata as any).sampleUrl = ql.url;
         }

         // Update detection per batch (if movie, keep movie, if any link is series, whole batch is series)
         if (isSeries) {
           batch.detectMetadata.type = "series";
         }
         
         if (r.audioLabel) {
           r.audioLabel.split(" / ").forEach(l => batch.detectMetadata.languages.add(l));
         }
         if (r.printQualityLabel && !batch.detectMetadata.printQuality) {
           batch.detectMetadata.printQuality = r.printQualityLabel;
         }
         const source = (`${r.fileName || ""} ${r.finalUrl || ""}`).toLowerCase();
         if (r.subtitleLabel || /subtitles|subs|softsub|hardsub|esub|esubs|msub|msubs/i.test(source)) {
           batch.detectMetadata.subtitles = true;
         }

         // Apply detected Season to batch metadata if not already set
         const detectedSeason = ql.season || parsedS;
         if (detectedSeason && !batch.detectMetadata.season) {
           batch.detectMetadata.season = detectedSeason;
         }
       });

       const itemsToReview = Array.from(batchesMap.entries()).map(([key, b]) => {
         const isTitleSearch = Boolean((detectedMetadata as any)?.isTitleSearch);
         const cached = isTitleSearch ? getImportCache(b.title, b.year) : null;
         return {
           key,
           title: b.title,
           year: b.year ? String(b.year) : '',
           links: b.links,
           metadata: {
             ...b.detectMetadata,
             languages: Array.from(b.detectMetadata.languages),
             sampleUrl: (b.detectMetadata as any).sampleUrl,
             tmdbData: isTitleSearch ? ((b.detectMetadata as any).tmdbData || (detectedMetadata as any)?.tmdbData || cached?.tmdbData) : undefined,
             isTitleSearch,
           }
         };
       });

       setBatchReviewItems(itemsToReview);
       setIsReviewingBatch(true);
       return;
    }

    // Collect metadata to pass back (Single mode)
    const detectedLangs = new Set<string>();
    let detectedPrintQuality: string | undefined;
    let detectedSubtitles = false;
    let detectedType: "movie" | "series" | undefined;
    let detectedSeason: number | undefined;
    let detectedEpisode: number | undefined;

    let seriesCount = 0;

    validResults.forEach(r => {
      const source = `${r.fileName || ""} ${r.finalUrl || ""}`.toLowerCase();
      
      if (r.audioLabel) {
        r.audioLabel.split(" / ").forEach(l => detectedLangs.add(l));
      }
      if (r.printQualityLabel && !detectedPrintQuality) {
        detectedPrintQuality = r.printQualityLabel;
      }
      if (r.subtitleLabel || /subtitles|subs|softsub|hardsub|esub|esubs|msub|msubs/i.test(source)) {
        detectedSubtitles = true;
      }

      let isSeriesLink = false;
      const hasEpisodeRange = isEpisodeRange(source);
      if (r.isFullSeasonMKV || r.isFullSeasonZIP || /full season|all episodes|complete/i.test(source) || hasEpisodeRange) {
        isSeriesLink = true;
      }

      // Detect Series vs Movie
      const combinedMatch = hasEpisodeRange ? null : source.match(/\bs(\d+)e(\d+)(?![a-z0-9])/i);
      if (combinedMatch) {
         isSeriesLink = true;
        detectedSeason = parseInt(combinedMatch[1]);
        detectedEpisode = parseInt(combinedMatch[2]);
      } else {
        const seriesMatch = source.match(/\b(s(\d+)|season\s*(\d+))(?![a-z0-9])/i);
        if (seriesMatch) {
           isSeriesLink = true;
          detectedSeason = parseInt(seriesMatch[2] || seriesMatch[3]);
          
          const episodeMatch = hasEpisodeRange ? null : source.match(/(?:e(\d+)|episode\s*(\d+))(?![a-z0-9])/i);
          if (episodeMatch) {
            detectedEpisode = parseInt(episodeMatch[1] || episodeMatch[2]);
          }
        } else {
           const episodeMatch = hasEpisodeRange ? null : source.match(/(?:e(\d+)|episode\s*(\d+))(?![a-z0-9])/i);
           if (episodeMatch && !source.match(/\b(movie|film)\b/i)) {
               isSeriesLink = true;
               detectedEpisode = parseInt(episodeMatch[1] || episodeMatch[2]);
           }
        }
      }
      if (isSeriesLink) seriesCount++;
    });

    if (contentType) {
       detectedType = contentType;
    } else if (seriesCount >= 3 || validResults.some(r => r.isFullSeasonMKV || r.isFullSeasonZIP || (r.season === 1 && r.episode === 1) || /full season|all episodes|complete/i.test(`${r.fileName || ""} ${r.finalUrl || ""}`))) {
       detectedType = "series";
    }

    const sampleResult = validResults.find(r => r.isSample || (r as any).is_sample || /\bsample\b/i.test(r.fileName || '') || /\bsample\b/i.test(r.url || ''));
    let cleanSampleName = "";
    if (sampleResult && sampleResult.fileName) {
      cleanSampleName = sampleResult.fileName.replace(/^SAMPLE[-_.\s]*/i, "").trim();
    }
    const nonSampleResults = validResults.filter(r => !r.isSample && !(r as any).is_sample && !/\bsample\b/i.test(r.fileName || ''));
    const firstHubcloudFileName = nonSampleResults.find(r => r.fileName)?.fileName || validResults.find(r => r.fileName)?.fileName;
    const hubcloudSourceText = cleanSampleName || firstHubcloudFileName || validResults.map(r => r.fileName || '').filter(Boolean).join(' ');
    const { title: extractedTitle, year: extractedYear } = extractTitleAndYear(hubcloudSourceText || input);
    
    // Fallback to first working result's year if available
    const fallbackYear = validResults.find(r => r.year)?.year;
    const year = (contentType && initialYear) ? (typeof initialYear === 'number' ? initialYear : parseInt(String(initialYear), 10)) : (detectedMetadata?.year || extractedYear || fallbackYear || (typeof initialYear === 'number' ? initialYear : initialYear ? parseInt(String(initialYear), 10) : undefined));
    const title = (contentType && initialTitle) ? initialTitle : (detectedMetadata?.title || extractedTitle || initialTitle);
    const sampleUrl = detectedSampleUrl || (sampleResult ? normalizeUrl(sampleResult.finalUrl || sampleResult.url) : undefined) || detectedMetadata?.sampleUrl;

    if (onAddLinks) {
      onAddLinks(qualityLinks, {
        languages: detectedMetadata?.languages?.length ? detectedMetadata.languages : Array.from(detectedLangs),
        printQuality: detectedMetadata?.printQuality || detectedPrintQuality,
        subtitles: detectedMetadata?.subtitles !== undefined ? detectedMetadata.subtitles : detectedSubtitles,
        type: detectedMetadata?.type || contentType || detectedType,
        season: detectedMetadata?.season !== undefined ? detectedMetadata.season : detectedSeason,
        episode: detectedMetadata?.episode !== undefined ? detectedMetadata.episode : detectedEpisode,
        // @ts-ignore
        title,
        // @ts-ignore
        year,
        // @ts-ignore
        sampleUrl,
        // @ts-ignore
        tmdbData: (detectedMetadata as any)?.isTitleSearch ? ((detectedMetadata as any)?.tmdbData || getImportCache(title, year)?.tmdbData) : undefined,
        // @ts-ignore
        isTitleSearch: Boolean((detectedMetadata as any)?.isTitleSearch),
      });
    }
    reset();
    onClose();
  };

  const pasteFromClipboard = async (isAuto = false, suppliedText?: string) => {
    try {
      const text = suppliedText !== undefined ? suppliedText : await navigator.clipboard.readText();
      if (!text) return;

      const newLinks = splitLinks(text).map(normalizeUrl).filter(Boolean);

      let addedAny = false;
      const newlyAddedUrls: string[] = [];

      setInput((prev) => {
        if (prev.includes(text)) return prev;
        addedAny = true;
        if (newLinks.length > 0) {
          newlyAddedUrls.push(...newLinks);
        }
        // Instead of conditionally doing text, insert the entire pasted payload
        // This is safe because splitLinks will extract the URLs anyway
        return prev.trim() ? prev + '\n' + text : text;
      });

      if (addedAny && newLinks.length > 0 && isAuto && results.length > 0 && !loading) {
        // Automatically check the newly added links if we already have results
        handleCheck(newlyAddedUrls);
      }
      
      if (!isAuto) setError(null);
    } catch (e) {
      if (!isAuto) setError("Clipboard access denied. Please paste manually.");
    }
  };

  const lastClipboardTextRef = React.useRef<string>("");

  useEffect(() => {
    if (isOpen) {
      setTitleImportWaterfall(getDefaultWaterfallEnabled());
      if (initialInput) {
        setInput(initialInput);
      } else if (initialTitle) {
        const formattedTitle = initialYear ? `${initialTitle} (${initialYear})` : initialTitle;
        setInput(formattedTitle);
      } else {
        setInput('');
      }
      setResults([]);
      setSelectedUrls(new Set());
      setError(null);
      setExpanded({});
      setIsReviewingBatch(false);
      setBatchReviewItems([]);
      setAutoClipboard(false);
      setDetectedSampleUrl(null);
      setDetectedMetadata(null);
      setMdriveUrl(null);
      setMdriveResults([]);
      setMdriveSelectedIndices(new Set());
      setMoviesdriveSearchUrl(null);
      setMoviesdriveSearchPosts([]);
      setAllAccumulatedPosts(new Map());
      setMoviesdriveSelectedUrls(new Set());
      setHasUserInteractedSelection(false);
      setMoviesdriveSearchQuery("");
      processedExtractionsRef.current = new Set();

      const autoTarget = initialInput || (initialTitle ? (initialYear ? `${initialTitle} (${initialYear})` : initialTitle) : '');
      if (autoStart && autoTarget && autoStartedInputRef.current !== autoTarget) {
        const initialLinks = splitLinks(autoTarget).map(normalizeUrl).filter(Boolean);
        autoStartedInputRef.current = autoTarget;
        if (initialLinks.length > 0) {
          handleCheck(initialLinks, autoTarget);
        } else if (initialTitle) {
          handleCheck(undefined, autoTarget);
        }
      }
    } else {
      autoStartedInputRef.current = null;
    }
  }, [isOpen, initialInput, initialTitle, initialYear, autoStart, disableAutoClipboard]);

  useEffect(() => {
    if (!isOpen || disableAutoClipboard || !autoClipboard) {
      setClipboardStatus("idle");
      return;
    }

    const checkClipboardText = async () => {
      try {
        const text = await navigator.clipboard.readText();
        setClipboardStatus("active");
        if (!text || !text.trim()) return;

        const trimmedText = text.trim();
        if (trimmedText === lastClipboardTextRef.current) return;

        const extracted = splitLinks(trimmedText);
        if (extracted.length === 0) return;

        lastClipboardTextRef.current = trimmedText;
        await pasteFromClipboard(true, trimmedText);
      } catch (err: any) {
        // Keep status active to prevent confusing "Standing By" or broken warnings.
        // We'll rely on hover and interaction events to automatically gain focus
        // so that the browser successfully satisfies the clipboard reading requirement.
        if (err?.name === "SecurityError") {
          setClipboardStatus("denied");
        } else {
          setClipboardStatus("active");
        }
      }
    };

    const forceWindowFocusAndCheck = () => {
      try {
        window.focus();
      } catch (e) {}
      checkClipboardText();
    };

    // Check clipboard at regular intervals (every 3 seconds)
    const interval = setInterval(checkClipboardText, 3000);

    // Bind event listeners to grab focus when user engages with this floating window/area
    window.addEventListener("focus", checkClipboardText);
    window.addEventListener("mouseenter", forceWindowFocusAndCheck);
    window.addEventListener("pointerenter", forceWindowFocusAndCheck);
    window.addEventListener("click", forceWindowFocusAndCheck);
    document.addEventListener("visibilitychange", checkClipboardText);

    // On setup, actively try to focus and inspect
    forceWindowFocusAndCheck();

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", checkClipboardText);
      window.removeEventListener("mouseenter", forceWindowFocusAndCheck);
      window.removeEventListener("pointerenter", forceWindowFocusAndCheck);
      window.removeEventListener("click", forceWindowFocusAndCheck);
      document.removeEventListener("visibilitychange", checkClipboardText);
    };
  }, [isOpen, disableAutoClipboard, autoClipboard]);

  const reset = () => {
    setInput("");
    setResults([]);
    setSelectedUrls(new Set());
    setError(null);
    setExpanded({});
    setIsReviewingBatch(false);
    setBatchReviewItems([]);
    setDetectedSampleUrl(null);
    setDetectedMetadata(null);
    setMdriveUrl(null);
    setMdriveResults([]);
    setMdriveSelectedIndices(new Set());
    setPreloadedEpisodes({});
    setLoadingEpisodes({});
    setExpandedEpisodes({});
    setSelectedSubEpisodes({});
    setMoviesdriveSearchUrl(null);
    setMoviesdriveSearchPosts([]);
    setAllAccumulatedPosts(new Map());
    setMoviesdriveSelectedUrls(new Set());
    setHasUserInteractedSelection(false);
    setMoviesdriveSearchQuery("");
    processedExtractionsRef.current = new Set();
  };

  const retryFailed = () => {
    const failed = results
      .filter((r) => !r.ok || r.statusLabel === "UNKNOWN" || r.statusLabel === "MISSING_FILENAME" || r.statusLabel === "BROKEN" || r.statusLabel === "UNAVAILABLE" || isMissingPixeldrain(r))
      .map((r) => r.url);
    if (failed.length) handleCheck(failed, undefined, 0, true);
  };

  const copyResults = async () => {
    const text = JSON.stringify(results, null, 2);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      setError("Could not copy results.");
    }
  };

  const summary = useMemo(() => {
    const working = results.filter((r) => r.statusLabel === "WORKING").length;
    const broken = results.filter((r) => r.statusLabel === "BROKEN").length;
    const protectedCount = results.filter((r) => r.statusLabel === "PROTECTED").length;
    const redirect = results.filter((r) => r.statusLabel === "REDIRECT").length;
    const unavailable = results.filter((r) => r.statusLabel === "UNAVAILABLE").length;
    const unknown = results.filter((r) => r.statusLabel === "UNKNOWN").length;
    const mismatches = results.filter((r) => (r.mismatchWarnings?.length || 0) > 0).length;
    const missingFilename = results.filter((r) => r.statusLabel === "MISSING_FILENAME").length;
    const missingQuality = results.filter((r) => r.statusLabel === "MISSING_METADATA" && r.message?.includes("Quality")).length;
    const missingLanguage = results.filter((r) => r.statusLabel === "MISSING_METADATA" && r.message?.includes("Language")).length;
    const smallFile = results.filter((r) => r.statusLabel === "SMALL_FILE").length;
    const sizeMismatch = results.filter((r) => r.statusLabel === "SIZE_MISMATCH").length;
    return { working, broken, protectedCount, redirect, unavailable, unknown, mismatches, missingFilename, missingQuality, missingLanguage, smallFile, sizeMismatch };
  }, [results]);

  const sortedResults = useMemo(() => {
    const items = results.map((rawResult) => {
      const { mergedResult: result, tag: locationTag } = resolveLocationAndMetadata(rawResult);
      const isWorking = Boolean(
        result.ok ||
        result.statusLabel === "WORKING" ||
        result.statusLabel === "REDIRECT" ||
        result.statusLabel === "PROTECTED"
      );
      return { rawResult, result, locationTag, isWorking };
    });

    items.sort((itemA, itemB) => {
      // 1. Working links first, non-working links at the end
      if (itemA.isWorking && !itemB.isWorking) return -1;
      if (!itemA.isWorking && itemB.isWorking) return 1;

      const a = itemA.result;
      const b = itemB.result;

      // 2. Hubcloud / Pixeldrain prioritization
      const isHubcloudA = isHubcloudVariant(a.url || "");
      const isHubcloudB = isHubcloudVariant(b.url || "");

      const hasPixeldrainA = isHubcloudA && !!a.candidates?.some(c => c.text.toLowerCase().includes("pixeldrain") || c.href.toLowerCase().includes("pixeldrain"));
      const hasPixeldrainB = isHubcloudB && !!b.candidates?.some(c => c.text.toLowerCase().includes("pixeldrain") || c.href.toLowerCase().includes("pixeldrain"));

      if (hasPixeldrainA && !hasPixeldrainB) return 1;
      if (!hasPixeldrainA && hasPixeldrainB) return -1;

      if (isHubcloudA && !isHubcloudB) return 1;
      if (!isHubcloudA && isHubcloudB) return -1;

      // 3. Group by location / metadata type: ZIP (1), MKV (2), Episodes (3), Movie/Other (4)
      const typeA = a.isFullSeasonZIP ? 1 : a.isFullSeasonMKV ? 2 : (a.season !== undefined || a.episode !== undefined) ? 3 : 4;
      const typeB = b.isFullSeasonZIP ? 1 : b.isFullSeasonMKV ? 2 : (b.season !== undefined || b.episode !== undefined) ? 3 : 4;

      if (typeA !== typeB) return typeA - typeB;

      // Type 1 (ZIP) or Type 2 (MKV): sort by season if available
      if (typeA === 1 || typeA === 2) {
        if (a.season !== undefined && b.season !== undefined && a.season !== b.season) {
          return (a.season || 0) - (b.season || 0);
        }
      }

      // Type 3 (Episodes): sort by season ascending, then episode ascending
      if (typeA === 3) {
        if (a.season !== b.season) return (a.season || 0) - (b.season || 0);
        if (a.episode !== b.episode) return (a.episode || 0) - (b.episode || 0);
      }

      // Sort by location tag / name naturally if present (e.g. for non-working links)
      const locA = itemA.locationTag || a.locationName || "";
      const locB = itemB.locationTag || b.locationName || "";
      if (locA && locB && locA !== locB) {
        const comp = locA.localeCompare(locB, undefined, { numeric: true, sensitivity: 'base' });
        if (comp !== 0) return comp;
      } else if (locA && !locB) {
        return -1;
      } else if (!locA && locB) {
        return 1;
      }

      // 4. Sort by size ascending (smallest to largest)
      return (a.fileSize || 0) - (b.fileSize || 0);
    });

    return items;
  }, [results, resolveLocationAndMetadata]);

  const [checkedEpisodeGroupingMode, setCheckedEpisodeGroupingMode] = useState<'quality' | 'episode'>('quality');

  const parsedSortedGroups = useMemo(() => {
    type EnrichedEntry = (typeof sortedResults)[0] & {
      info: ReturnType<typeof getItemEpisodeInfo>;
      qualityCat: QualityCategory;
    };

    const packs: EnrichedEntry[] = [];
    const episodesMap = new Map<number, EnrichedEntry[]>();
    const episodesByQuality = new Map<QualityCategory, EnrichedEntry[]>();
    const others: EnrichedEntry[] = [];

    QUALITY_ORDER.forEach(q => episodesByQuality.set(q, []));

    sortedResults.forEach((entry) => {
      const info = getItemEpisodeInfo({ ...entry.result, locationTag: entry.locationTag });
      const qualityCat = getItemQualityCategory({ ...entry.result, locationTag: entry.locationTag });
      const enrichedEntry: EnrichedEntry = { ...entry, info, qualityCat };

      if (info.isPack) {
        packs.push(enrichedEntry);
      } else if (info.isEpisode && info.epNumber !== undefined) {
        const epList = episodesMap.get(info.epNumber) || [];
        epList.push(enrichedEntry);
        episodesMap.set(info.epNumber, epList);

        const qList = episodesByQuality.get(qualityCat) || [];
        qList.push(enrichedEntry);
        episodesByQuality.set(qualityCat, qList);
      } else {
        others.push(enrichedEntry);
      }
    });

    // Sort items inside each quality group by episode number ascending, then season
    episodesByQuality.forEach(list => {
      list.sort((a, b) => {
        if (a.info.seasonNumber !== undefined && b.info.seasonNumber !== undefined && a.info.seasonNumber !== b.info.seasonNumber) {
          return a.info.seasonNumber - b.info.seasonNumber;
        }
        if (a.info.epNumber !== undefined && b.info.epNumber !== undefined && a.info.epNumber !== b.info.epNumber) {
          return a.info.epNumber - b.info.epNumber;
        }
        return (a.result.fileName || a.result.url || '').localeCompare(b.result.fileName || b.result.url || '', undefined, { numeric: true });
      });
    });

    const sortedEpKeys = Array.from(episodesMap.keys()).sort((a, b) => a - b);
    const hasEpisodes = sortedEpKeys.length > 0;
    const activeQualityCategories = QUALITY_ORDER.filter(q => (episodesByQuality.get(q)?.length || 0) > 0);

    return {
      packs,
      episodesMap,
      episodesByQuality,
      activeQualityCategories,
      sortedEpKeys,
      others,
      hasEpisodes,
      totalEpisodesCount: sortedEpKeys.reduce((acc, k) => acc + (episodesMap.get(k)?.length || 0), 0)
    };
  }, [sortedResults]);

  const toggleCheckedEpisodeSelection = (epNum: number) => {
    const epUrls = (parsedSortedGroups.episodesMap.get(epNum) || []).map(e => e.result.url);
    const allSel = epUrls.length > 0 && epUrls.every(u => selectedUrls.has(u));
    setSelectedUrls(prev => {
      const next = new Set(prev);
      if (allSel) {
        epUrls.forEach(u => next.delete(u));
      } else {
        epUrls.forEach(u => next.add(u));
      }
      return next;
    });
  };

  const toggleCheckedQualitySelection = (qCat: QualityCategory) => {
    const qUrls = (parsedSortedGroups.episodesByQuality.get(qCat) || []).map(e => e.result.url);
    const allSel = qUrls.length > 0 && qUrls.every(u => selectedUrls.has(u));
    setSelectedUrls(prev => {
      const next = new Set(prev);
      if (allSel) {
        qUrls.forEach(u => next.delete(u));
      } else {
        qUrls.forEach(u => next.add(u));
      }
      return next;
    });
  };

  const selectAllCheckedEpisodes = () => {
    const epUrls: string[] = [];
    parsedSortedGroups.sortedEpKeys.forEach(k => {
      const list = parsedSortedGroups.episodesMap.get(k) || [];
      list.forEach(e => epUrls.push(e.result.url));
    });
    const allSel = epUrls.length > 0 && epUrls.every(u => selectedUrls.has(u));
    setSelectedUrls(prev => {
      const next = new Set(prev);
      if (allSel) {
        epUrls.forEach(u => next.delete(u));
      } else {
        epUrls.forEach(u => next.add(u));
      }
      return next;
    });
  };

  const toggleCheckedPacksSelection = () => {
    const packUrls = parsedSortedGroups.packs.map(e => e.result.url);
    const allSel = packUrls.length > 0 && packUrls.every(u => selectedUrls.has(u));
    setSelectedUrls(prev => {
      const next = new Set(prev);
      if (allSel) {
        packUrls.forEach(u => next.delete(u));
      } else {
        packUrls.forEach(u => next.add(u));
      }
      return next;
    });
  };

  const renderPaginationControls = (position: 'top' | 'bottom' = 'top') => {
    const currentPage = moviesdrivePageInfo.page;
    const totalPages = catalogTotalPages;
    if (totalPages <= 1 && !catalogHasMore && currentPage <= 1) return null;
    const pageNumbers = getPaginationPages(currentPage, totalPages);

    const activePageClasses = moviesdrivePageInfo.isHdhub4u
      ? 'bg-sky-600 text-white shadow-xs'
      : moviesdrivePageInfo.isFilmygo
      ? 'bg-emerald-600 text-white shadow-xs'
      : moviesdrivePageInfo.isFilmyfly
      ? 'bg-teal-600 text-white shadow-xs'
      : moviesdrivePageInfo.isSkyMovies
      ? 'bg-amber-600 text-white shadow-xs'
      : 'bg-indigo-600 text-white shadow-xs';

    const badgeBorderClasses = moviesdrivePageInfo.isHdhub4u
      ? 'bg-sky-500/10 text-sky-500 border-sky-500/20'
      : moviesdrivePageInfo.isFilmygo
      ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
      : moviesdrivePageInfo.isFilmyfly
      ? 'bg-teal-500/10 text-teal-500 border-teal-500/20'
      : moviesdrivePageInfo.isSkyMovies
      ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
      : 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20';

    return (
      <div 
        id={`catalog-pagination-${position}`}
        className="flex flex-wrap items-center justify-between gap-2.5 p-2.5 bg-zinc-50 dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800"
      >
        <div className="flex flex-wrap items-center gap-1">
          {/* First Page Button */}
          <button
            type="button"
            onClick={() => handleMoviesdrivePageChange(1)}
            disabled={currentPage <= 1 || moviesdrivePageLoading}
            className="px-2 py-1 rounded-lg text-xs font-bold bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 transition flex items-center gap-1 cursor-pointer"
            title="First Page"
          >
            <ChevronsLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">First</span>
          </button>

          {/* Previous Page Button */}
          <button
            type="button"
            onClick={() => handleMoviesdrivePageChange(currentPage - 1)}
            disabled={currentPage <= 1 || moviesdrivePageLoading}
            className="px-2.5 py-1 rounded-lg text-xs font-bold bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 transition flex items-center gap-1 cursor-pointer"
            title="Previous Page"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>Prev</span>
          </button>

          {/* Numbered Page Buttons: 1, 2, 3, 4, ... */}
          <div className="flex items-center gap-1 mx-0.5">
            {pageNumbers.map((p, idx) => {
              if (p === '...') {
                return (
                  <span key={`dots-${idx}`} className="px-1 text-xs text-zinc-400 font-bold select-none">
                    ...
                  </span>
                );
              }
              const isCurrent = p === currentPage;
              return (
                <button
                  key={`page-${p}`}
                  type="button"
                  onClick={() => handleMoviesdrivePageChange(p)}
                  disabled={moviesdrivePageLoading}
                  className={`min-w-7 h-7 px-1.5 rounded-lg text-xs font-bold transition flex items-center justify-center cursor-pointer ${
                    isCurrent
                      ? activePageClasses
                      : 'bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                  }`}
                  title={`Page ${p}`}
                >
                  {p}
                </button>
              );
            })}
          </div>

          {/* Next Page Button */}
          <button
            type="button"
            onClick={() => handleMoviesdrivePageChange(currentPage + 1)}
            disabled={(!catalogHasMore && currentPage >= totalPages) || moviesdrivePageLoading}
            className="px-2.5 py-1 rounded-lg text-xs font-bold bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 transition flex items-center gap-1 cursor-pointer"
            title="Next Page"
          >
            <span>Next</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>

          {/* Last Page Button */}
          {totalPages > 1 && (
            <button
              type="button"
              onClick={() => handleMoviesdrivePageChange(totalPages)}
              disabled={currentPage >= totalPages || moviesdrivePageLoading}
              className="px-2 py-1 rounded-lg text-xs font-bold bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 transition flex items-center gap-1 cursor-pointer"
              title={`Last Page (${totalPages})`}
            >
              <span className="hidden sm:inline">Last</span>
              <ChevronsRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Page status and custom page jumper */}
        <div className="flex items-center gap-2 ml-auto">
          <span className={`text-[11px] font-bold px-2 py-1 rounded-lg border ${badgeBorderClasses}`}>
            Page {currentPage} of {totalPages}
          </span>

          <form 
            onSubmit={(e) => {
              e.preventDefault();
              const num = parseInt(customPageInput, 10);
              if (!isNaN(num) && num >= 1) {
                handleMoviesdrivePageChange(num);
                setCustomPageInput("");
              }
            }}
            className="flex items-center gap-1.5"
          >
            <span className="text-xs text-zinc-500 font-medium hidden sm:inline">Go:</span>
            <input
              type="number"
              min={1}
              max={totalPages > 1 ? totalPages : undefined}
              placeholder="#"
              value={customPageInput}
              onChange={(e) => setCustomPageInput(e.target.value)}
              className="w-12 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-1.5 py-1 text-xs text-center font-bold text-zinc-900 dark:text-zinc-100 outline-none focus:border-indigo-500"
            />
            <button
              type="submit"
              disabled={!customPageInput || moviesdrivePageLoading}
              className={`px-2 py-1 rounded-lg text-xs font-bold text-white disabled:opacity-40 transition cursor-pointer ${
                moviesdrivePageInfo.isHdhub4u
                  ? 'bg-sky-600 hover:bg-sky-500'
                  : moviesdrivePageInfo.isFilmygo
                  ? 'bg-emerald-600 hover:bg-emerald-500'
                  : moviesdrivePageInfo.isFilmyfly
                  ? 'bg-teal-600 hover:bg-teal-500'
                  : 'bg-indigo-600 hover:bg-indigo-500'
              }`}
            >
              Go
            </button>
          </form>
        </div>
      </div>
    );
  };

  return (
    <AnimatePresence>
      {isOpen ? (
        <motion.div className={`fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm ${moviesdriveSearchUrl ? 'p-2 sm:p-4' : 'p-4'}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div initial={{ opacity: 0, y: 20, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.98 }} transition={{ duration: 0.18 }} className={`w-full ${moviesdriveSearchUrl ? 'max-w-6xl max-h-[98vh]' : 'max-w-5xl max-h-[95vh]'} overflow-y-auto custom-scrollbar`}>
            <div className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 shadow-2xl overflow-hidden transition-colors duration-300">
              <div className={moviesdriveSearchUrl ? "p-3 sm:p-5 space-y-3" : "p-5 md:p-6 space-y-5"}>
                {!moviesdriveSearchUrl && (
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="rounded-2xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-2.5 transition-colors duration-300">
                        <LinkIcon className="h-5 w-5 text-cyan-500 dark:text-cyan-400" />
                      </div>
                      <div>
                        <h2 className="text-xl font-semibold leading-none text-zinc-900 dark:text-white">
                          {isReviewingBatch ? 'Review Batch Items' : (isBatchMode ? 'Batch Link Checker (Missing Details)' : title)}
                        </h2>
                        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                          {isReviewingBatch ? 'Please verify and enter missing years for each item before saving.' : 'Check Pixeldrain, direct file links, protected download gateways, and missing movie posts.'}
                        </p>
                      </div>
                    </div>
                    <button onClick={handleClose} className="rounded-full px-3 py-1.5 text-sm text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-white transition">Close</button>
                  </div>
                )}

                {moviesdriveSearchUrl ? (
                  <div className="space-y-3 animate-in fade-in slide-in-from-bottom-3 duration-200">
                    {/* Catalog Header Bar */}
                    <div className="flex flex-wrap items-center justify-between gap-2.5 px-0.5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className={`p-2 rounded-xl shrink-0 ${moviesdrivePageInfo.isSkyMovies ? "bg-purple-500/10 text-purple-500 border border-purple-500/20" : moviesdrivePageInfo.isFilmygo ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20" : moviesdrivePageInfo.isHdhub4u ? "bg-sky-500/10 text-sky-500 border border-sky-500/20" : moviesdrivePageInfo.isFilmyfly ? "bg-teal-500/10 text-teal-500 border border-teal-500/20" : "bg-indigo-500/10 text-indigo-500 border border-indigo-500/20"}`}>
                          <Search className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-base sm:text-lg font-bold text-zinc-900 dark:text-white truncate leading-tight">
                              {moviesdrivePageInfo.isSkyMovies ? "SkyMoviesHD Catalog" : moviesdrivePageInfo.isFilmygo ? "FilmyGo Catalog" : moviesdrivePageInfo.isHdhub4u ? "HDHub4U Catalog" : moviesdrivePageInfo.isFilmyfly ? "FilmyFly Catalog" : "MoviesDrive Catalog"}
                            </h3>
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700/60 shrink-0">
                              {skymoviesTotalFound ? `${skymoviesTotalFound.toLocaleString()} items found` : `${moviesdriveSearchPosts.length} items`}
                            </span>
                          </div>
                          <p className="text-xs text-zinc-500 truncate hidden sm:block">
                            Select catalog items below to scrape links and download sources
                          </p>
                        </div>
                      </div>

                      {/* Header Controls: View mode switcher + Cancel */}
                      <div className="flex items-center gap-1.5 ml-auto">
                        {/* View Switcher: Compact vs Cards */}
                        <div className="flex items-center bg-zinc-100 dark:bg-zinc-800/80 p-0.5 rounded-xl border border-zinc-200 dark:border-zinc-700/60">
                          <button
                            type="button"
                            onClick={() => setCatalogViewMode('compact')}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                              catalogViewMode === 'compact'
                                ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-xs'
                                : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                            }`}
                            title="Compact view - see maximum items at once"
                          >
                            <LayoutList className="w-3.5 h-3.5" />
                            <span>Compact</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setCatalogViewMode('detailed')}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                              catalogViewMode === 'detailed'
                                ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-xs'
                                : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                            }`}
                            title="Cards view - 2 column cards grid"
                          >
                            <LayoutGrid className="w-3.5 h-3.5" />
                            <span>Cards</span>
                          </button>
                        </div>

                        {/* Close / Cancel Catalog */}
                        <button 
                          type="button"
                          onClick={() => {
                            processedExtractionsRef.current.add(moviesdriveSearchUrl);
                            setMoviesdriveSearchUrl(null);
                            setMoviesdriveSearchPosts([]);
                            setAllAccumulatedPosts(new Map());
                            setMoviesdriveSelectedUrls(new Set());
                            setHasUserInteractedSelection(false);
                            setMoviesdriveSearchQuery("");
                            setSkymoviesTotalFound(0);
                            setSkymoviesHasMore(false);
                            setSkymoviesLoadingMore(false);
                            setSkymoviesVisibleLimit(500);
                          }}
                          className="text-xs font-bold text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-xl hover:bg-zinc-200 dark:hover:bg-zinc-700 transition cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>

                    {/* Search Bar & Action Buttons Toolbar */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                      <div className="relative flex-1">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                        <input
                          type="text"
                          placeholder="Filter catalog items by title, year..."
                          value={moviesdriveSearchQuery}
                          onChange={(e) => setMoviesdriveSearchQuery(e.target.value)}
                          className="w-full bg-zinc-50 dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-9 pr-8 py-2 text-xs sm:text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:border-indigo-500 transition"
                        />
                        {moviesdriveSearchQuery && (
                          <button 
                            type="button"
                            onClick={() => setMoviesdriveSearchQuery("")}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 p-0.5 cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {/* Bulk Selection Actions */}
                      <div className="flex items-center gap-1.5 shrink-0 overflow-x-auto pb-1 sm:pb-0">
                        <button 
                          type="button"
                          onClick={() => {
                            setHasUserInteractedSelection(true);
                            if (moviesdriveSelectedUrls.size > 0) {
                              setMoviesdriveSelectedUrls(new Set());
                            } else {
                              const allUrls = new Set<string>();
                              moviesdriveSearchPosts.forEach(p => { if (p.url) allUrls.add(p.url); });
                              for (const url of allAccumulatedPosts.keys()) {
                                allUrls.add(url);
                              }
                              setMoviesdriveSelectedUrls(allUrls);
                            }
                          }}
                          className={`text-xs font-bold px-3 py-1.5 rounded-xl transition-all whitespace-nowrap cursor-pointer ${
                            moviesdriveSelectedUrls.size > 0
                              ? "text-red-500 hover:text-red-400 bg-red-500/10 border border-red-500/20"
                              : "text-indigo-500 hover:text-indigo-400 bg-indigo-500/10 border border-indigo-500/20"
                          }`}
                        >
                          {moviesdriveSelectedUrls.size > 0 ? "Deselect All" : "Select All"}
                        </button>
                        <button 
                          type="button"
                          onClick={handleSelectAllFiltered}
                          disabled={moviesdriveFilteredPosts.length === 0}
                          className={`text-xs font-bold px-3 py-1.5 rounded-xl transition-all disabled:opacity-40 whitespace-nowrap cursor-pointer ${
                            areAllFilteredSelected
                              ? "text-rose-500 hover:text-rose-400 bg-rose-500/10 border border-rose-500/20"
                              : "text-emerald-500 hover:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20"
                          }`}
                        >
                          {areAllFilteredSelected ? "Deselect Filtered" : `Select Filtered (${moviesdriveFilteredPosts.length})`}
                        </button>

                        {/* Availability Filter Tabs */}
                        <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-900 p-0.5 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs font-bold shrink-0">
                          <button
                            type="button"
                            onClick={() => setAvailabilityFilter('all')}
                            className={`px-2.5 py-1 rounded-lg transition whitespace-nowrap cursor-pointer ${availabilityFilter === 'all' ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-xs' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
                          >
                            All ({moviesdriveSearchPosts.length})
                          </button>
                          <button
                            type="button"
                            onClick={() => setAvailabilityFilter('missing')}
                            className={`px-2.5 py-1 rounded-lg transition flex items-center gap-1 whitespace-nowrap cursor-pointer ${availabilityFilter === 'missing' ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30' : 'text-zinc-500 hover:text-amber-500'}`}
                          >
                            <AlertTriangle className="w-3 h-3" />
                            Missing ({moviesdriveMissingCount})
                          </button>
                          <button
                            type="button"
                            onClick={() => setAvailabilityFilter('available')}
                            className={`px-2.5 py-1 rounded-lg transition flex items-center gap-1 whitespace-nowrap cursor-pointer ${availabilityFilter === 'available' ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30' : 'text-zinc-500 hover:text-emerald-500'}`}
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            Available ({moviesdriveAvailCount})
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Pagination Controls - Top */}
                    {renderPaginationControls('top')}

                    {moviesdrivePageLoading ? (
                      <div className="py-16 flex flex-col items-center justify-center gap-3">
                        <LoaderIcon className="w-8 h-8 text-indigo-500 animate-spin" />
                        <p className="text-sm font-medium text-zinc-500">Loading Page {moviesdrivePageInfo.page}...</p>
                      </div>
                    ) : (
                      (() => {
                        if (moviesdriveDisplayedPosts.length === 0) {
                          return (
                            <div className="py-12 text-center text-zinc-500 text-sm font-medium bg-zinc-50 dark:bg-zinc-900/50 rounded-2xl border border-zinc-200 dark:border-zinc-800">
                              No contents match the current filter criteria.
                            </div>
                          );
                        }

                        return (
                          <div className="flex flex-col">
                            {/* The scrollable catalog list container with ample vertical space */}
                            <div ref={catalogScrollRef} className="h-[60vh] sm:h-[65vh] max-h-[72vh] overflow-y-auto custom-scrollbar pr-1 pb-2">
                              {catalogViewMode === 'compact' ? (
                                /* Compact High-Density View: 10-12+ items visible at once */
                                <div className="space-y-1.5">
                                  {moviesdriveDisplayedPosts.map(({ post, originalIndex, avail }, idx) => {
                                    const isSelected = moviesdriveSelectedUrls.has(post.url);
                                    return (
                                      <div 
                                        key={post.url || originalIndex}
                                        id={`skymovies-post-item-${idx}`}
                                        onClick={() => {
                                          setHasUserInteractedSelection(true);
                                          setMoviesdriveSelectedUrls(prev => {
                                            const next = new Set(prev);
                                            if (next.has(post.url)) next.delete(post.url);
                                            else next.add(post.url);
                                            return next;
                                          });
                                        }}
                                        className={`group px-2.5 py-1.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2.5 ${
                                          isSelected 
                                            ? 'bg-indigo-500/10 dark:bg-indigo-950/30 border-indigo-500/40 shadow-xs ring-1 ring-indigo-500/20' 
                                            : 'bg-zinc-50 dark:bg-zinc-900/90 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'
                                        }`}
                                      >
                                        <div className="flex items-center gap-2 min-w-0 flex-1">
                                          {/* Checkbox */}
                                          <div className={`w-4 h-4 rounded flex items-center justify-center transition-all shrink-0 ${
                                            isSelected 
                                              ? 'bg-indigo-600 text-white shadow-xs' 
                                              : 'border border-zinc-300 dark:border-zinc-600 group-hover:border-zinc-400 bg-white dark:bg-zinc-800'
                                          }`}>
                                            {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                                          </div>

                                          {/* Mini Thumbnail */}
                                          <PostPoster image={post.image} title={post.title} compact={true} />

                                          {/* Details */}
                                          <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-1.5 leading-none">
                                              <span className="text-[9px] font-mono font-bold px-1 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 shrink-0">
                                                #{originalIndex + 1}
                                              </span>

                                              {avail.isAvailable ? (
                                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-0.5 shrink-0">
                                                  <CheckCircle2 className="w-2.5 h-2.5 shrink-0" />
                                                  Available
                                                </span>
                                              ) : (
                                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center gap-0.5 shrink-0">
                                                  <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                                                  Missing
                                                </span>
                                              )}

                                              {avail.reason && !avail.isAvailable && avail.reason !== 'Not in Gallery' && (
                                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 shrink-0">
                                                  {avail.reason}
                                                </span>
                                              )}

                                              {avail.parsed.formatted && (
                                                <span className="text-[9px] font-medium text-indigo-600 dark:text-indigo-400 truncate max-w-[150px] hidden sm:inline-block">
                                                  {avail.parsed.formatted}
                                                </span>
                                              )}
                                            </div>

                                            <h4 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate mt-1 leading-tight" title={post.title}>
                                              {post.title}
                                            </h4>
                                          </div>
                                        </div>

                                        <div className="shrink-0 flex items-center">
                                          <a 
                                            href={post.url} 
                                            target="_blank" 
                                            rel="noreferrer" 
                                            onClick={(e) => e.stopPropagation()}
                                            className="p-1 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition"
                                            title="Open post in new tab"
                                          >
                                            <ExternalLink className="w-3.5 h-3.5" />
                                          </a>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                /* Detailed Cards View: 2-column grid */
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  {moviesdriveDisplayedPosts.map(({ post, originalIndex, avail }, idx) => {
                                    const isSelected = moviesdriveSelectedUrls.has(post.url);
                                    return (
                                      <div 
                                        key={post.url || originalIndex}
                                        id={`skymovies-post-item-${idx}`}
                                        onClick={() => {
                                          setHasUserInteractedSelection(true);
                                          setMoviesdriveSelectedUrls(prev => {
                                            const next = new Set(prev);
                                            if (next.has(post.url)) next.delete(post.url);
                                            else next.add(post.url);
                                            return next;
                                          });
                                        }}
                                        className={`group p-2 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2.5 ${
                                          isSelected 
                                            ? 'bg-indigo-500/10 border-indigo-500/40 shadow-xs ring-1 ring-indigo-500/20' 
                                            : 'bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'
                                        }`}
                                      >
                                        <div className="flex items-center gap-2 min-w-0 flex-1">
                                          {/* Poster with overlaid checkbox */}
                                          <div className="relative shrink-0 select-none">
                                            <PostPoster image={post.image} title={post.title} />
                                            <div className={`absolute top-1 left-1 p-0.5 rounded-md flex items-center justify-center transition-all shadow-xs ${
                                              isSelected 
                                                ? 'bg-indigo-600 text-white ring-1 ring-white/30' 
                                                : 'bg-black/60 backdrop-blur-xs ring-1 ring-white/20 hover:bg-black/80'
                                            }`}>
                                              <input 
                                                type="checkbox" 
                                                checked={isSelected}
                                                onChange={() => {}}
                                                className="w-3.5 h-3.5 rounded border-0 text-indigo-600 focus:ring-0 shrink-0 pointer-events-none cursor-pointer accent-indigo-600"
                                              />
                                            </div>
                                          </div>
                                          
                                          <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-1 mb-0.5 flex-wrap">
                                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                                                #{originalIndex + 1}
                                              </span>

                                              {/* Availability Badge */}
                                              {avail.isAvailable ? (
                                                <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-0.5 shadow-xs">
                                                  <CheckCircle2 className="w-2.5 h-2.5 text-emerald-500 shrink-0" />
                                                  Available
                                                </span>
                                              ) : (
                                                <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center gap-0.5 shadow-xs">
                                                  <AlertTriangle className="w-2.5 h-2.5 text-amber-500 shrink-0" />
                                                  Missing
                                                </span>
                                              )}

                                              {/* Upgrade / Reason Tag */}
                                              {avail.reason && !avail.isAvailable && avail.reason !== 'Not in Gallery' && (
                                                <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-md bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 shrink-0">
                                                  {avail.reason}
                                                </span>
                                              )}
                                            </div>
                                            <h4 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 leading-snug break-words" title={post.title}>
                                              {post.title}
                                            </h4>
                                          </div>
                                        </div>

                                        <div className="shrink-0 flex items-center">
                                          <a 
                                            href={post.url} 
                                            target="_blank" 
                                            rel="noreferrer" 
                                            onClick={(e) => e.stopPropagation()}
                                            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition"
                                            title="Open post in new tab"
                                          >
                                            <ExternalLink className="w-3.5 h-3.5" />
                                          </a>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}

                              {moviesdrivePageInfo.isSkyMovies && (skymoviesVisibleLimit < moviesdriveFilteredPosts.length || skymoviesHasMore || (skymoviesTotalFound > moviesdriveSearchPosts.length)) && (
                                <div className="pt-3 pb-1 flex justify-center">
                                  <button
                                    type="button"
                                    id="skymovies-load-more-btn"
                                    disabled={skymoviesLoadingMore}
                                    onClick={handleSkymoviesLoadMore}
                                    className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 active:scale-98 text-white font-bold text-xs shadow-md shadow-purple-600/20 transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
                                  >
                                    {skymoviesLoadingMore ? (
                                      <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Loading Next 500 Results...
                                      </>
                                    ) : (
                                      <>
                                        <ChevronDown className="w-4 h-4" />
                                        Load More (Next 500) — Showing {moviesdriveDisplayedPosts.length} of {skymoviesTotalFound ? skymoviesTotalFound.toLocaleString() : moviesdriveFilteredPosts.length}
                                      </>
                                    )}
                                  </button>
                                </div>
                              )}

                              <div className="pt-3 pb-1">
                                {renderPaginationControls('bottom')}
                              </div>
                            </div>
                          </div>
                        );
                      })()
                    )}

                    {/* Anchored Bottom Action Bar */}
                    <div className="sticky bottom-0 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-md py-2.5 px-3 -mx-1 -mb-1 rounded-b-2xl border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between z-10 shadow-lg">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 px-2.5 py-1 rounded-lg">
                          {moviesdriveSelectedUrls.size} selected
                        </span>
                        {moviesdriveSelectedUrls.size > 0 && (
                          <button
                            type="button"
                            onClick={() => setMoviesdriveSelectedUrls(new Set())}
                            className="text-[11px] font-semibold text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition cursor-pointer"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button 
                          type="button"
                          onClick={() => {
                            setMoviesdriveSearchUrl(null);
                            setMoviesdriveSearchPosts([]);
                            setAllAccumulatedPosts(new Map());
                            setMoviesdriveSelectedUrls(new Set());
                            setHasUserInteractedSelection(false);
                            setMoviesdriveSearchQuery("");
                            setSkymoviesTotalFound(0);
                            setSkymoviesHasMore(false);
                            setSkymoviesLoadingMore(false);
                            setSkymoviesVisibleLimit(500);
                          }}
                          className="px-3.5 py-2 rounded-xl text-xs font-bold text-zinc-500 hover:text-zinc-700 dark:hover:text-white transition-colors bg-zinc-100 dark:bg-zinc-800 cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={confirmMoviesdriveSearchSelection}
                          disabled={moviesdriveSelectedUrls.size === 0}
                          className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-md shadow-indigo-600/20 active:scale-98 cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" />
                          Scrape Selected ({moviesdriveSelectedUrls.size})
                        </button>
                      </div>
                    </div>
                  </div>
                ) : mdriveUrl ? (
                  <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                    <div className="flex items-center justify-between px-1">
                      <div>
                        <h3 className="text-lg font-bold">
                          {(mdriveUrl.includes('mdrive.lol') || mdriveUrl.includes('mdrvie.lol')) ? 'MDrive Selection' : 
                          mdriveUrl.includes('filmygo.') ? 'FilmyGo FilesDL Selection' : 
                          mdriveUrl.includes('skymovies') ? 'SkymoviesHD HowBlogs Selection' :
                          'MoviesDrive MDrive Selection'}
                        </h3>
                        <p className="text-xs text-zinc-500">
                          {(mdriveUrl.includes('mdrive.lol') || mdriveUrl.includes('mdrvie.lol')) ? 'Pick the Hubcloud links you want to extract' : 
                          mdriveUrl.includes('filmygo.') ? 'Pick the FilesDL links you want to process' :
                          mdriveUrl.includes('skymovies') ? 'Pick the HowBlogs links you want to process' :
                          'Pick the MDrive links you want to process'}
                        </p>
                      </div>
                      <div className="flex gap-2 items-center">
                        <button 
                          onClick={async () => {
                            const indicesToFetch = mdriveResults
                              .map((item, index) => (!item.size ? index : -1))
                              .filter(index => index !== -1);
                            
                            // Process in batches of 3 to avoid overwhelming
                            for (let i = 0; i < indicesToFetch.length; i++) {
                              handleExtractDirectMdrive(indicesToFetch[i]);
                              if ((i + 1) % 3 === 0) await new Promise(r => setTimeout(r, 800));
                            }
                          }}
                          className="text-xs font-bold text-cyan-500 hover:text-cyan-400 px-3 py-1 bg-cyan-500/10 rounded-lg flex items-center gap-1.5"
                        >
                          <Info className="w-3.5 h-3.5" />
                          Fetch Sizes
                        </button>
                        <button 
                          type="button"
                          onClick={() => setShowQuickSelect(prev => !prev)}
                          className={`text-xs font-bold px-3 py-1 rounded-lg transition-all flex items-center gap-1.5 ${
                            showQuickSelect 
                              ? "text-cyan-500 bg-cyan-500/15 border border-cyan-500/30" 
                              : "text-zinc-600 dark:text-zinc-400 bg-zinc-200/80 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700"
                          }`}
                        >
                          <SlidersHorizontal className="w-3.5 h-3.5" />
                          {showQuickSelect ? "Hide Quick Select" : "Quick Select"}
                        </button>
                        <button 
                          onClick={() => {
                            if (mdriveResults.length > 0 && mdriveSelectedIndices.size === mdriveResults.length) {
                              setMdriveSelectedIndices(new Set());
                            } else {
                              setMdriveSelectedIndices(new Set(mdriveResults.keys()));
                            }
                          }}
                          className={`text-xs font-bold px-3 py-1 rounded-lg transition-colors ${
                            mdriveResults.length > 0 && mdriveSelectedIndices.size === mdriveResults.length
                              ? "text-red-500 hover:text-red-400 bg-red-500/10"
                              : "text-cyan-500 hover:text-cyan-400 bg-cyan-500/10"
                          }`}
                        >
                          {mdriveResults.length > 0 && mdriveSelectedIndices.size === mdriveResults.length ? "Deselect All" : "Select All"}
                        </button>
                        <button 
                          onClick={handleClose}
                          className="text-xs font-bold text-zinc-500 hover:text-zinc-400 px-3 py-1 bg-zinc-500/10 rounded-lg"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>

                    {/* Quality Quick Selection & Filter Bar */}
                    {showQuickSelect && (
                      <div className="flex flex-col gap-3 p-3 bg-zinc-100 dark:bg-zinc-900/80 rounded-2xl border border-zinc-200 dark:border-zinc-800 animate-in fade-in duration-200">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-700 dark:text-zinc-300">
                            <CheckSquare className="w-4 h-4 text-cyan-500" />
                            <span>Quick Select:</span>
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <button
                              type="button"
                              onClick={() => selectAllOfQuality()}
                              className="px-2.5 py-1 text-xs font-bold rounded-lg bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white transition"
                            >
                              Select All ({mdriveResults.length})
                            </button>

                            {parsedMdriveGroups.hasEpisodes && (
                              <button
                                type="button"
                                onClick={selectAllEpisodes}
                                className="px-2.5 py-1 text-xs font-bold rounded-lg bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30 transition flex items-center gap-1.5"
                              >
                                <Tv className="w-3.5 h-3.5" />
                                Select All Episodes ({parsedMdriveGroups.totalEpisodesCount})
                              </button>
                            )}

                            {parsedMdriveGroups.totalPacksCount > 0 && (
                              <button
                                type="button"
                                onClick={selectAllPacks}
                                className="px-2.5 py-1 text-xs font-bold rounded-lg bg-purple-500/15 hover:bg-purple-500/25 text-purple-600 dark:text-purple-400 border border-purple-500/30 transition flex items-center gap-1.5"
                              >
                                <Package className="w-3.5 h-3.5" />
                                Select All Packs ({parsedMdriveGroups.totalPacksCount})
                              </button>
                            )}

                            {qualityCounts['480p'] > 0 && (
                              <button
                                type="button"
                                onClick={() => selectAllOfQuality('480p')}
                                className="px-2.5 py-1 text-xs font-bold rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-600 dark:text-amber-400 border border-amber-500/30 transition flex items-center gap-1"
                              >
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                                480p ({qualityCounts['480p']})
                              </button>
                            )}

                            {qualityCounts['720p'] > 0 && (
                              <button
                                type="button"
                                onClick={() => selectAllOfQuality('720p')}
                                className="px-2.5 py-1 text-xs font-bold rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30 transition flex items-center gap-1"
                              >
                                <span className="w-1.5 h-1.5 rounded-full bg-cyan-500"></span>
                                720p ({qualityCounts['720p']})
                              </button>
                            )}

                            {qualityCounts['1080p'] > 0 && (
                              <button
                                type="button"
                                onClick={() => selectAllOfQuality('1080p')}
                                className="px-2.5 py-1 text-xs font-bold rounded-lg bg-purple-500/15 hover:bg-purple-500/25 text-purple-600 dark:text-purple-400 border border-purple-500/30 transition flex items-center gap-1"
                              >
                                <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
                                1080p ({qualityCounts['1080p']})
                              </button>
                            )}

                            {qualityCounts['2160p'] > 0 && (
                              <button
                                type="button"
                                onClick={() => selectAllOfQuality('2160p')}
                                className="px-2.5 py-1 text-xs font-bold rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 transition flex items-center gap-1"
                              >
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                4K ({qualityCounts['2160p']})
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => setMdriveSelectedIndices(new Set())}
                              className="px-2.5 py-1 text-xs font-bold rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 border border-rose-500/20 transition"
                            >
                              Deselect All
                            </button>
                          </div>
                        </div>

                        {/* View Mode and Quality Group Filter Tabs */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-800 text-xs font-bold">
                          {parsedMdriveGroups.hasEpisodes && (
                            <div className="flex items-center gap-1 overflow-x-auto custom-scrollbar">
                              <span className="text-zinc-400 text-[11px] mr-1 uppercase tracking-wider shrink-0 flex items-center gap-1">
                                <Layers className="w-3 h-3" />
                                View:
                              </span>
                              <button
                                type="button"
                                onClick={() => setContentTypeFilter('all')}
                                className={`px-2.5 py-1 rounded-lg transition shrink-0 ${contentTypeFilter === 'all' ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm border border-zinc-200 dark:border-zinc-700' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
                              >
                                All ({mdriveResults.length})
                              </button>
                              <button
                                type="button"
                                onClick={() => setContentTypeFilter('episodes')}
                                className={`px-2.5 py-1 rounded-lg transition shrink-0 flex items-center gap-1 ${contentTypeFilter === 'episodes' ? 'bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30 font-bold' : 'text-zinc-500 hover:text-indigo-500'}`}
                              >
                                <Tv className="w-3 h-3" />
                                Episodes ({parsedMdriveGroups.totalEpisodesCount})
                              </button>
                              {parsedMdriveGroups.totalPacksCount > 0 && (
                                <button
                                  type="button"
                                  onClick={() => setContentTypeFilter('packs')}
                                  className={`px-2.5 py-1 rounded-lg transition shrink-0 flex items-center gap-1 ${contentTypeFilter === 'packs' ? 'bg-purple-500/20 text-purple-600 dark:text-purple-400 border border-purple-500/30 font-bold' : 'text-zinc-500 hover:text-purple-500'}`}
                                >
                                  <Package className="w-3 h-3" />
                                  Packs ({parsedMdriveGroups.totalPacksCount})
                                </button>
                              )}
                            </div>
                          )}

                          {(qualityCounts['480p'] > 0 || qualityCounts['720p'] > 0 || qualityCounts['1080p'] > 0 || qualityCounts['2160p'] > 0) && (
                            <div className="flex items-center gap-1 overflow-x-auto custom-scrollbar">
                              <span className="text-zinc-400 text-[11px] mr-1 uppercase tracking-wider shrink-0 flex items-center gap-1">
                                <SlidersHorizontal className="w-3 h-3" />
                                Quality:
                              </span>
                              <button
                                type="button"
                                onClick={() => setQualityFilter('all')}
                                className={`px-2.5 py-1 rounded-lg transition shrink-0 ${qualityFilter === 'all' ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm border border-zinc-200 dark:border-zinc-700' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
                              >
                                All
                              </button>
                              {qualityCounts['480p'] > 0 && (
                                <button
                                  type="button"
                                  onClick={() => setQualityFilter('480p')}
                                  className={`px-2.5 py-1 rounded-lg transition shrink-0 ${qualityFilter === '480p' ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 font-bold' : 'text-zinc-500 hover:text-amber-500'}`}
                                >
                                  480p
                                </button>
                              )}
                              {qualityCounts['720p'] > 0 && (
                                <button
                                  type="button"
                                  onClick={() => setQualityFilter('720p')}
                                  className={`px-2.5 py-1 rounded-lg transition shrink-0 ${qualityFilter === '720p' ? 'bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30 font-bold' : 'text-zinc-500 hover:text-cyan-500'}`}
                                >
                                  720p
                                </button>
                              )}
                              {qualityCounts['1080p'] > 0 && (
                                <button
                                  type="button"
                                  onClick={() => setQualityFilter('1080p')}
                                  className={`px-2.5 py-1 rounded-lg transition shrink-0 ${qualityFilter === '1080p' ? 'bg-purple-500/20 text-purple-600 dark:text-purple-400 border border-purple-500/30 font-bold' : 'text-zinc-500 hover:text-purple-500'}`}
                                >
                                  1080p
                                </button>
                              )}
                              {qualityCounts['2160p'] > 0 && (
                                <button
                                  type="button"
                                  onClick={() => setQualityFilter('2160p')}
                                  className={`px-2.5 py-1 rounded-lg transition shrink-0 ${qualityFilter === '2160p' ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 font-bold' : 'text-zinc-500 hover:text-emerald-500'}`}
                                >
                                  4K
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {mdriveLoading ? (
                      <div className="py-20 flex flex-col items-center justify-center gap-4">
                        <LoaderIcon className="w-10 h-10 text-cyan-500 animate-spin" />
                        <p className="text-zinc-500 text-sm animate-pulse">Scraping MDrive page...</p>
                      </div>
                    ) : mdriveError ? (
                      <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-3 text-red-500 text-sm">
                        <AlertTriangle className="w-5 h-5 shrink-0" />
                        {mdriveError}
                      </div>
                    ) : (
                      <div className="space-y-4 max-h-[50vh] overflow-y-auto custom-scrollbar pr-2">
                        {(() => {
                          const matchesQuality = (item: any) => {
                            if (qualityFilter === 'all') return true;
                            const q = getItemQualityCategory(item);
                            if (qualityFilter === '480p') return q === '480p';
                            if (qualityFilter === '720p') return q === '720p';
                            if (qualityFilter === '1080p') return q === '1080p';
                            if (qualityFilter === '2160p') return q === '2160p';
                            return true;
                          };

                          const renderItemCard = (item: any, i: number, info?: ReturnType<typeof getItemEpisodeInfo>, showEpBadge: boolean = true) => {
                            const itemInfo = info || getItemEpisodeInfo(item);
                            const locTag = getLocationTag({ fileName: item.file_name, url: item.url });
                            const text = `${item.file_name || ''} ${item.quality || ''} ${item.url || ''}`.toLowerCase();
                            const isSampleItem = !!(item.is_sample || item.isSample || text.includes('sample'));
                            
                            let qBadge = null;
                            const qCat = getItemQualityCategory(item);
                            if (qCat === '480p') qBadge = <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 shrink-0">480p</span>;
                            else if (qCat === '720p') qBadge = <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30 shrink-0">720p</span>;
                            else if (qCat === '1080p') qBadge = <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-600 dark:text-purple-400 border border-purple-500/30 shrink-0">1080p</span>;
                            else if (qCat === '2160p') qBadge = <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 shrink-0">4K</span>;

                            const hasHevc = text.includes('hevc') || text.includes('x265') || text.includes('h265') || text.includes('h.265') || text.includes('10bit') || text.includes('10-bit');
                            const sizeVal = item.size || item.file_size;
                            const isSelected = mdriveSelectedIndices.has(i);

                            return (
                              <div 
                                key={i}
                                className={`group p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center gap-3.5 ${
                                  isSelected 
                                    ? 'bg-cyan-500/5 border-cyan-500/40 shadow-xs' 
                                    : 'bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'
                                }`}
                                onClick={() => {
                                  setMdriveSelectedIndices(prev => {
                                    const next = new Set(prev);
                                    if (next.has(i)) next.delete(i);
                                    else next.add(i);
                                    return next;
                                  });
                                }}
                              >
                                <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${
                                  isSelected
                                    ? 'bg-cyan-500 border-cyan-500'
                                    : 'border-zinc-300 dark:border-zinc-700 group-hover:border-zinc-400'
                                }`}>
                                  {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-white stroke-[3]" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    {isSampleItem && (
                                      <span className="px-2 py-0.5 rounded text-[10px] font-black bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30 shrink-0 flex items-center gap-1">
                                        SAMPLE
                                      </span>
                                    )}
                                    {showEpBadge && itemInfo.isEpisode && (
                                      <span className="px-2 py-0.5 rounded text-[10px] font-black bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30 shrink-0">
                                        {itemInfo.label}
                                      </span>
                                    )}
                                    {itemInfo.isPack && (
                                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-600 dark:text-purple-400 border border-purple-500/30 shrink-0 flex items-center gap-1">
                                        <Package className="w-3 h-3" />
                                        Pack
                                      </span>
                                    )}
                                    {qBadge}
                                    {hasHevc && (
                                      <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30 shrink-0">
                                        HEVC
                                      </span>
                                    )}
                                    {sizeVal && (
                                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-teal-500/20 text-teal-600 dark:text-teal-400 border border-teal-500/30 shrink-0">
                                        {sizeVal}
                                      </span>
                                    )}
                                    {locTag && (
                                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-extrabold bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 border border-indigo-500/30 shrink-0">
                                        {locTag}
                                      </span>
                                    )}
                                    <h4 className="text-xs sm:text-sm font-semibold truncate text-zinc-900 dark:text-white flex-1" title={item.file_name || item.url}>
                                      {item.file_name || 'HubCloud Link'}
                                    </h4>
                                  </div>
                                  <p className="text-[10px] text-zinc-500 flex items-center gap-1.5 mt-1 truncate">
                                    <LinkIcon className="w-3 h-3 shrink-0" />
                                    <span className="truncate">{item.url}</span>
                                  </p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  {!(item.size || item.file_size) && (
                                    <span className="text-[9px] font-mono bg-zinc-200/70 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-400 uppercase italic">
                                      No Size
                                    </span>
                                  )}
                                  {!item.is_direct && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleExtractDirectMdrive(i);
                                      }}
                                      disabled={mdriveExtractingDirect[i]}
                                      className="p-1.5 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 rounded-lg text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-all disabled:opacity-50"
                                      title="Extract Direct Drive Link"
                                    >
                                      {mdriveExtractingDirect[i] ? <LoaderIcon className="w-3.5 h-3.5 animate-spin text-cyan-500" /> : <ExternalLink className="w-3.5 h-3.5" />}
                                    </button>
                                  )}
                                  {item.is_direct && (
                                    <div className="p-1.5 bg-cyan-500/20 rounded-lg text-cyan-500" title="Direct Drive Link Extracted">
                                      <CheckCircle2 className="w-3.5 h-3.5" />
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          };

                          if (moviesdriveSeriesGroups) {
                            return (
                              <div className="space-y-6">
                                {Array.from(moviesdriveSeriesGroups.entries()).map(([seasonName, qualitiesMap]) => (
                                  <div key={seasonName} className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30 p-5 space-y-4">
                                    <div className="flex items-center gap-2 border-b border-zinc-200/60 dark:border-zinc-800/60 pb-3">
                                      <Tv className="w-5 h-5 text-indigo-500" />
                                      <span className="text-sm font-black text-zinc-900 dark:text-white uppercase tracking-wider">
                                        {seasonName}
                                      </span>
                                    </div>

                                    <div className="space-y-6">
                                      {Array.from(qualitiesMap.entries()).map(([qualityText, group]) => {
                                        const qConfig = QUALITY_COLORS[group.qualityCat] || QUALITY_COLORS['Other'];
                                        
                                        const singleEpisodeUrl = group.singleEpisodeItem?.item.url;
                                        const isPreloaded = singleEpisodeUrl ? Boolean(preloadedEpisodes[singleEpisodeUrl]) : false;
                                        const isLoading = singleEpisodeUrl ? Boolean(loadingEpisodes[singleEpisodeUrl]) : false;
                                        const isExpanded = singleEpisodeUrl ? Boolean(expandedEpisodes[singleEpisodeUrl]) : false;
                                        
                                        const subList = singleEpisodeUrl ? (preloadedEpisodes[singleEpisodeUrl] || []) : [];
                                        const selectedSubs = singleEpisodeUrl ? (selectedSubEpisodes[singleEpisodeUrl] || new Set<string>()) : new Set<string>();
                                        const allSubsSelected = subList.length > 0 && subList.every(sub => selectedSubs.has(sub.url));
                                        const someSubsSelected = subList.length > 0 && subList.some(sub => selectedSubs.has(sub.url)) && !allSubsSelected;

                                        const isZipSelected = group.zipItem ? mdriveSelectedIndices.has(group.zipItem.originalIndex) : false;

                                        return (
                                          <div key={qualityText} className="space-y-2.5">
                                            {/* Quality Sub-header */}
                                            <div className="flex items-center gap-2 px-1">
                                              <span className={`px-2.5 py-0.5 rounded text-[10px] font-black border ${qConfig.badge}`}>
                                                {group.qualityCat === '2160p' ? '4K' : group.qualityCat}
                                              </span>
                                              <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                                                {extractDisplayHeading(group.headingText)}
                                              </span>
                                            </div>

                                            {/* Non-nested list of options */}
                                            <div className="border border-zinc-200 dark:border-zinc-800/80 rounded-xl overflow-hidden bg-white dark:bg-zinc-950 divide-y divide-zinc-100 dark:divide-zinc-800/60">
                                              
                                              {/* Zip Row (First) */}
                                              {group.zipItem && (
                                                <div 
                                                  onClick={() => {
                                                    setMdriveSelectedIndices(prev => {
                                                      const next = new Set(prev);
                                                      if (isZipSelected) {
                                                        next.delete(group.zipItem!.originalIndex);
                                                      } else {
                                                        next.add(group.zipItem!.originalIndex);
                                                      }
                                                      return next;
                                                    });
                                                  }}
                                                  className="p-3.5 flex items-center justify-between gap-3 hover:bg-zinc-50 dark:hover:bg-zinc-900/40 cursor-pointer transition select-none"
                                                >
                                                  <div className="flex items-start gap-3 min-w-0">
                                                    <input
                                                      type="checkbox"
                                                      checked={isZipSelected}
                                                      onChange={() => {}} // toggled by row click
                                                      className="mt-0.5 h-4 w-4 rounded border-zinc-300 dark:border-zinc-700 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                                    />
                                                    <div className="min-w-0">
                                                      <span className="text-xs font-bold text-zinc-900 dark:text-white block truncate">
                                                        Zip [{group.zipItem.item.size || group.zipItem.item.file_name?.match(/\[?\s*(\d+(?:\.\d+)?\s*(?:GB|MB|KB))\s*\]?/i)?.[1]?.toUpperCase() || group.zipItem.item.label?.match(/\[?\s*(\d+(?:\.\d+)?\s*(?:GB|MB|KB))\s*\]?/i)?.[1]?.toUpperCase() || "Full Pack"}]
                                                      </span>
                                                      <span className="text-[10px] text-zinc-500 block truncate">
                                                        Single zip file download
                                                      </span>
                                                    </div>
                                                  </div>
                                                </div>
                                              )}

                                              {/* Single Episode Row (Second) */}
                                              {group.singleEpisodeItem && (
                                                <div>
                                                  <div 
                                                    onClick={() => toggleParentEpisodesSelection(group.singleEpisodeItem!.item, group.singleEpisodeItem!.originalIndex)}
                                                    className="p-3.5 flex items-center justify-between gap-3 hover:bg-zinc-50 dark:hover:bg-zinc-900/40 cursor-pointer transition select-none"
                                                  >
                                                    <div className="flex items-center gap-3 min-w-0">
                                                      <input
                                                        type="checkbox"
                                                        checked={allSubsSelected || (group.singleEpisodeItem ? mdriveSelectedIndices.has(group.singleEpisodeItem.originalIndex) : false)}
                                                        ref={el => {
                                                          if (el) {
                                                            el.indeterminate = someSubsSelected;
                                                          }
                                                        }}
                                                        onChange={() => {}} // toggled by row click
                                                        className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-700 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                                      />
                                                      <div className="min-w-0">
                                                        <span className="text-xs font-bold text-zinc-900 dark:text-white block truncate">
                                                          {group.qualityCat === 'Other' ? 'Other' : group.qualityCat} Single Episode
                                                        </span>
                                                        <span className="text-[10px] text-zinc-500 block truncate">
                                                          Click expand to show and choose individual episodes
                                                        </span>
                                                      </div>
                                                    </div>
                                                    
                                                    <button
                                                      type="button"
                                                      onClick={(e) => {
                                                        e.stopPropagation(); // prevent parent checkbox toggle
                                                        toggleSubEpisodeCollapse(singleEpisodeUrl!);
                                                      }}
                                                      className="text-[11px] font-bold text-indigo-500 hover:text-indigo-400 flex items-center gap-1.5 shrink-0 px-2.5 py-1.5 bg-indigo-50 dark:bg-indigo-950/40 rounded-lg hover:scale-102 active:scale-98 transition-all"
                                                    >
                                                      {isLoading ? (
                                                        <LoaderIcon className="w-3.5 h-3.5 animate-spin text-indigo-500" />
                                                      ) : isExpanded ? (
                                                        <>
                                                          <span>Hide Episodes</span>
                                                          <ChevronUp className="w-3.5 h-3.5" />
                                                        </>
                                                      ) : (
                                                        <>
                                                          <span>Show Episodes ({subList.length || '...' })</span>
                                                          <ChevronDown className="w-3.5 h-3.5" />
                                                        </>
                                                      )}
                                                    </button>
                                                  </div>

                                                  {/* Expandable Sub-Episodes list */}
                                                  {isExpanded && (
                                                    <div className="border-t border-zinc-100 dark:border-zinc-800/60 bg-zinc-50/40 dark:bg-zinc-900/20 p-2.5 space-y-1.5 max-h-60 overflow-y-auto custom-scrollbar">
                                                      {isLoading ? (
                                                        <div className="flex items-center justify-center py-6 gap-2 text-zinc-500 text-xs font-semibold">
                                                          <LoaderIcon className="w-4 h-4 animate-spin text-indigo-500" />
                                                          Loading episodes...
                                                        </div>
                                                      ) : subList.length === 0 ? (
                                                        <div className="text-zinc-500 text-[11px] py-3 text-center italic">
                                                          No episodes found
                                                        </div>
                                                      ) : (
                                                        <div className="space-y-1">
                                                          {subList.map((sub, sIdx) => {
                                                            const isSubSel = selectedSubs.has(sub.url);
                                                            return (
                                                              <div 
                                                                onClick={() => toggleSubEpisodeSelection(singleEpisodeUrl!, sub.url)}
                                                                key={sIdx} 
                                                                className={`flex items-center justify-between gap-3 p-2.5 rounded-lg border text-xs transition-all cursor-pointer select-none ${
                                                                  isSubSel 
                                                                    ? 'border-indigo-500/20 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-semibold shadow-xs' 
                                                                    : 'border-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800/60 text-zinc-700 dark:text-zinc-300'
                                                                }`}
                                                              >
                                                                <div className="flex items-center gap-2.5 min-w-0">
                                                                  <input
                                                                    type="checkbox"
                                                                    checked={isSubSel}
                                                                    readOnly
                                                                    className="h-3.5 w-3.5 rounded border-zinc-300 dark:border-zinc-700 text-indigo-600 focus:ring-indigo-500 cursor-pointer pointer-events-none"
                                                                  />
                                                                  <span className={`text-[10px] font-black px-1.5 py-0.5 rounded border shrink-0 select-none font-mono ${qConfig.badge}`}>
                                                                    {extractEpisodeNumber(sub.file_name, sIdx)}
                                                                  </span>
                                                                  <span className="truncate" title={sub.file_name}>
                                                                    {sub.file_name}
                                                                  </span>
                                                                </div>
                                                                {sub.size && (
                                                                  <span className="text-[10px] font-mono bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-500 dark:text-zinc-400 shrink-0 font-bold border border-zinc-200/40 dark:border-zinc-700/40">
                                                                    {sub.size}
                                                                  </span>
                                                                )}
                                                              </div>
                                                            );
                                                          })}
                                                        </div>
                                                      )}
                                                    </div>
                                                  )}
                                                </div>
                                              )}

                                              {/* Direct Episodes Row */}
                                              {group.directEpisodes.length > 0 && (() => {
                                                const directKey = `${seasonName}-${qualityText}-direct`;
                                                const isDirectExpanded = Boolean(expandedEpisodes[directKey]);
                                                const directIndices = group.directEpisodes.map(d => d.originalIndex);
                                                const allDirectSelected = directIndices.length > 0 && directIndices.every(idx => mdriveSelectedIndices.has(idx));
                                                const someDirectSelected = directIndices.length > 0 && directIndices.some(idx => mdriveSelectedIndices.has(idx)) && !allDirectSelected;

                                                return (
                                                  <div>
                                                    <div 
                                                      onClick={() => toggleSubEpisodeCollapse(directKey)}
                                                      className="p-3.5 flex items-center justify-between gap-3 hover:bg-zinc-50 dark:hover:bg-zinc-900/40 cursor-pointer transition select-none"
                                                    >
                                                      <div className="flex items-center gap-3 min-w-0">
                                                        <input
                                                          type="checkbox"
                                                          checked={allDirectSelected}
                                                          ref={el => {
                                                            if (el) el.indeterminate = someDirectSelected;
                                                          }}
                                                          onClick={(e) => {
                                                            e.stopPropagation();
                                                            setMdriveSelectedIndices(prev => {
                                                              const next = new Set(prev);
                                                              if (allDirectSelected) {
                                                                directIndices.forEach(idx => next.delete(idx));
                                                              } else {
                                                                directIndices.forEach(idx => next.add(idx));
                                                              }
                                                              return next;
                                                            });
                                                          }}
                                                          onChange={() => {}}
                                                          className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-700 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                                        />
                                                        <div className="min-w-0">
                                                          <span className="text-xs font-bold text-zinc-900 dark:text-white block truncate">
                                                            {group.qualityCat === '2160p' ? '4K' : group.qualityCat} Episodes ({group.directEpisodes.length} Episodes)
                                                          </span>
                                                          <span className="text-[10px] text-zinc-500 block truncate">
                                                            Click expand to view and select individual episodes
                                                          </span>
                                                        </div>
                                                      </div>

                                                      <div className="flex items-center gap-2">
                                                        <span className="text-[11px] font-bold text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full border border-zinc-200 dark:border-zinc-700">
                                                          {group.directEpisodes.filter(d => mdriveSelectedIndices.has(d.originalIndex)).length} / {group.directEpisodes.length} selected
                                                        </span>
                                                        <button 
                                                          type="button" 
                                                          className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                                                        >
                                                          {isDirectExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                                        </button>
                                                      </div>
                                                    </div>

                                                    {/* Expanded Direct Episodes List */}
                                                    {isDirectExpanded && (
                                                      <div className="p-3 bg-zinc-50/50 dark:bg-zinc-900/20 space-y-1">
                                                        {group.directEpisodes.map((d, dIdx) => {
                                                          const isEpSel = mdriveSelectedIndices.has(d.originalIndex);
                                                          const epNum = d.epNumber !== undefined ? d.epNumber : (dIdx + 1);
                                                          return (
                                                            <div 
                                                              key={d.originalIndex}
                                                              onClick={() => {
                                                                setMdriveSelectedIndices(prev => {
                                                                  const next = new Set(prev);
                                                                  if (next.has(d.originalIndex)) next.delete(d.originalIndex);
                                                                  else next.add(d.originalIndex);
                                                                  return next;
                                                                });
                                                              }}
                                                              className={`flex items-center justify-between gap-3 p-2.5 rounded-lg border text-xs transition-all cursor-pointer select-none ${
                                                                isEpSel 
                                                                  ? 'border-indigo-500/20 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-semibold shadow-xs' 
                                                                  : 'border-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800/60 text-zinc-700 dark:text-zinc-300'
                                                              }`}
                                                            >
                                                              <div className="flex items-center gap-2.5 min-w-0">
                                                                <input
                                                                  type="checkbox"
                                                                  checked={isEpSel}
                                                                  readOnly
                                                                  className="h-3.5 w-3.5 rounded border-zinc-300 dark:border-zinc-700 text-indigo-600 focus:ring-indigo-500 cursor-pointer pointer-events-none"
                                                                />
                                                                <span className={`text-[10px] font-black px-1.5 py-0.5 rounded border shrink-0 select-none font-mono ${qConfig.badge}`}>
                                                                  {extractEpisodeNumber(d.item.file_name, dIdx) || `E${epNum < 10 ? '0' : ''}${epNum}`}
                                                                </span>
                                                                <span className="truncate" title={d.item.file_name}>
                                                                  {d.item.file_name}
                                                                </span>
                                                              </div>
                                                              {d.item.size && (
                                                                <span className="text-[10px] font-mono bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-500 dark:text-zinc-400 shrink-0 font-bold border border-zinc-200/40 dark:border-zinc-700/40">
                                                                  {d.item.size}
                                                                </span>
                                                              )}
                                                            </div>
                                                          );
                                                        })}
                                                      </div>
                                                    )}
                                                  </div>
                                                );
                                              })()}
                                            </div>

                                            {/* Others inside quality */}
                                            {group.others.length > 0 && (
                                              <div className="space-y-1.5 pt-2 px-1">
                                                {group.others.map(({ item, originalIndex }) => (
                                                  <div 
                                                    key={originalIndex} 
                                                    onClick={() => {
                                                      setMdriveSelectedIndices(prev => {
                                                        const next = new Set(prev);
                                                        if (next.has(originalIndex)) next.delete(originalIndex);
                                                        else next.add(originalIndex);
                                                        return next;
                                                      });
                                                    }}
                                                    className="flex items-center gap-2.5 p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-900/60 rounded-lg cursor-pointer transition select-none"
                                                  >
                                                    <input
                                                      type="checkbox"
                                                      checked={mdriveSelectedIndices.has(originalIndex)}
                                                      onChange={() => {}} // toggled by row click
                                                      className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-700 text-orange-600 focus:ring-orange-500 cursor-pointer"
                                                    />
                                                    <span className="text-xs text-zinc-600 dark:text-zinc-400 truncate">
                                                      {item.file_name}
                                                    </span>
                                                  </div>
                                                ))}
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            );
                          }

                          return (
                            <div className="grid gap-2">
                              {filteredMdriveResults.map(({ item, originalIndex: i }) => 
                                renderItemCard(item, i, undefined, false)
                              )}
                            </div>
                          );

                        })()}
                      </div>
                    )}

                    <div className="flex justify-end gap-3 pt-4 border-t border-zinc-200 dark:border-zinc-800">
                      <button 
                        onClick={() => setMdriveUrl(null)}
                        className="px-6 py-2.5 rounded-2xl text-sm font-bold text-zinc-500 hover:text-zinc-700 dark:hover:text-white transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={confirmMdriveSelection}
                        disabled={mdriveSelectedIndices.size === 0 && !Object.values(selectedSubEpisodes).some(s => s.size > 0)}
                        className="bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 text-white px-8 py-2.5 rounded-2xl font-bold flex items-center gap-2 transition-all shadow-lg shadow-cyan-500/20"
                      >
                        Add {mdriveSelectedIndices.size + Object.values(selectedSubEpisodes).reduce((acc, s) => acc + s.size, 0)} Extracted Links
                      </button>
                    </div>
                  </div>
                ) : isReviewingBatch ? (
                  <BatchReviewModal
                    batchReviewItems={batchReviewItems}
                    updateBatchReviewItem={updateBatchReviewItem}
                    removeBatchReviewItem={(key) => setBatchReviewItems(prev => prev.filter(i => i.key !== key))}
                    onCancel={() => setIsReviewingBatch(false)}
                    onConfirm={confirmBatchReview}
                  />
                ) : (
                  <>
                    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/60 p-4 space-y-3 transition-colors duration-300">
                  <label className="text-sm font-medium text-zinc-700 dark:text-zinc-200">Paste one or multiple links / full movie post</label>
                  <textarea ref={textareaRef} value={input} onChange={(e) => setInput(e.target.value)} placeholder="Paste links or a full movie post here..." rows={6} className="w-full rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-4 py-3 text-sm text-zinc-900 dark:text-white placeholder:text-zinc-500 outline-none focus:ring-2 focus:ring-cyan-500 transition-colors duration-300" />

                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-1">
                    <label 
                      htmlFor="title-import-waterfall-checkbox" 
                      className="inline-flex items-center gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 cursor-pointer select-none"
                    >
                      <input
                        id="title-import-waterfall-checkbox"
                        type="checkbox"
                        checked={titleImportWaterfall}
                        onChange={(e) => setTitleImportWaterfall(e.target.checked)}
                        className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      />
                      <span className="flex items-center gap-1.5">
                        Title Import Waterfall
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${titleImportWaterfall ? 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 border border-zinc-200/40 dark:border-zinc-700/40'}`}>
                          {titleImportWaterfall ? 'Enabled' : 'Disabled'}
                        </span>
                      </span>
                    </label>

                    {!disableAutoClipboard && (
                      <label className="inline-flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={autoClipboard}
                          onChange={(e) => setAutoClipboard(e.target.checked)}
                          className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-cyan-500 focus:ring-cyan-500 cursor-pointer"
                        />
                        Auto-detect and paste links from clipboard (Every 3s)
                      </label>
                    )}
                  </div>

                  {!disableAutoClipboard && autoClipboard && (
                    <div className="text-xs pl-6 transition-all duration-300 -mt-1">
                      {clipboardStatus === "denied" ? (
                        <span className="text-rose-600 dark:text-rose-400 font-medium flex items-center gap-1.5 animate-fade-in">
                          <span className="inline-block w-2 h-2 rounded-full bg-rose-500" />
                          Access restricted (Please grant clipboard permission)
                        </span>
                      ) : (
                        <span className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1.5 animate-fade-in">
                          <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                          Active (Monitoring clipboard)
                        </span>
                      )}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => pasteFromClipboard(false)} className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-8 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 gap-2 transition-colors w-32"><ClipboardPaste className="h-4 w-4" />Paste</button>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-zinc-500 dark:text-zinc-400">
                    <span>Detected type: <strong className="text-zinc-900 dark:text-zinc-200">{firstType}</strong> • <strong className="text-zinc-900 dark:text-zinc-200">{links.length}</strong> link(s) found</span>
                    <span className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400"><ShieldCheck className="h-4 w-4" />Checks only when manually used</span>
                  </div>
                </div>

                {/* MoviesDrive Direct Search Input Bar */}
                {showMoviesdriveSearchInput && (
                  <form 
                    onSubmit={(e) => {
                      e.preventDefault();
                      executeMoviesdriveSearch(moviesdriveSearchTerm);
                    }}
                    className="flex items-center gap-2 p-3 bg-indigo-500/10 border border-indigo-500/30 rounded-2xl animate-in fade-in slide-in-from-top-2 duration-200"
                  >
                    <Search className="w-4 h-4 text-indigo-500 shrink-0 ml-1" />
                    <input
                      type="text"
                      placeholder={`Search title or leave empty for Home page (${getMoviesdriveDomain()})...`}
                      value={moviesdriveSearchTerm}
                      onChange={(e) => setMoviesdriveSearchTerm(e.target.value)}
                      className="flex-1 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3.5 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:border-indigo-500 font-medium"
                      autoFocus
                    />
                    <button
                      type="submit"
                      className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition shadow-sm flex items-center gap-1.5 shrink-0"
                    >
                      <Search className="w-3.5 h-3.5" />
                      Search MoviesDrive
                    </button>
                  </form>
                )}

                {/* SkyMoviesHD Direct Search Input Bar */}
                {showSkymoviesSearchInput && (
                  <form 
                    onSubmit={(e) => {
                      e.preventDefault();
                      executeSkymoviesSearch(skymoviesSearchTerm);
                    }}
                    className="flex items-center gap-2 p-3 bg-purple-500/10 border border-purple-500/30 rounded-2xl animate-in fade-in slide-in-from-top-2 duration-200"
                  >
                    <Search className="w-4 h-4 text-purple-500 shrink-0 ml-1" />
                    <input
                      type="text"
                      placeholder={`Search title or leave empty for Home page (${getSkymoviesDomain()})...`}
                      value={skymoviesSearchTerm}
                      onChange={(e) => setSkymoviesSearchTerm(e.target.value)}
                      className="flex-1 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3.5 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:border-purple-500 font-medium"
                      autoFocus
                    />
                    <button
                      type="submit"
                      className="px-4 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs transition shadow-sm flex items-center gap-1.5 shrink-0"
                    >
                      <Search className="w-3.5 h-3.5" />
                      Search SkyMoviesHD
                    </button>
                  </form>
                )}

                {/* FilmyGo Direct Search Input Bar */}
                {showFilmygoSearchInput && (
                  <form 
                    onSubmit={(e) => {
                      e.preventDefault();
                      executeFilmygoSearch(filmygoSearchTerm);
                    }}
                    className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl animate-in fade-in slide-in-from-top-2 duration-200"
                  >
                    <Search className="w-4 h-4 text-emerald-500 shrink-0 ml-1" />
                    <input
                      type="text"
                      placeholder={`Search title or leave empty for Home page (${getFilmygoDomain()})...`}
                      value={filmygoSearchTerm}
                      onChange={(e) => setFilmygoSearchTerm(e.target.value)}
                      className="flex-1 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3.5 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:border-emerald-500 font-medium"
                      autoFocus
                    />
                    <button
                      type="submit"
                      className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition shadow-sm flex items-center gap-1.5 shrink-0"
                    >
                      <Search className="w-3.5 h-3.5" />
                      Search FilmyGo
                    </button>
                  </form>
                )}

                {/* HDHub4U Direct Search Input Bar */}
                {showHdhubSearchInput && (
                  <form 
                    onSubmit={(e) => {
                      e.preventDefault();
                      executeHdhubSearch(hdhubSearchTerm);
                    }}
                    className="flex items-center gap-2 p-3 bg-orange-500/10 border border-orange-500/30 rounded-2xl animate-in fade-in slide-in-from-top-2 duration-200"
                  >
                    <Search className="w-4 h-4 text-orange-500 shrink-0 ml-1" />
                    <input
                      type="text"
                      placeholder={`Search title or leave empty for Home page (${getHdhub4uDomain()})...`}
                      value={hdhubSearchTerm}
                      onChange={(e) => setHdhubSearchTerm(e.target.value)}
                      className="flex-1 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3.5 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:border-orange-500 font-medium"
                      autoFocus
                    />
                    <button
                      type="submit"
                      className="px-4 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs transition shadow-sm flex items-center gap-1.5 shrink-0"
                    >
                      <Search className="w-3.5 h-3.5" />
                      Search HDHub4U
                    </button>
                  </form>
                )}

                {/* FilmyFly Direct Search Input Bar */}
                {showFilmyflySearchInput && (
                  <form 
                    onSubmit={(e) => {
                      e.preventDefault();
                      executeFilmyflySearch(filmyflySearchTerm);
                    }}
                    className="flex items-center gap-2 p-3 bg-teal-500/10 border border-teal-500/30 rounded-2xl animate-in fade-in slide-in-from-top-2 duration-200"
                  >
                    <Search className="w-4 h-4 text-teal-500 shrink-0 ml-1" />
                    <input
                      type="text"
                      placeholder={`Search title or leave empty for Home page (${getFilmyflyDomain()})...`}
                      value={filmyflySearchTerm}
                      onChange={(e) => setFilmyflySearchTerm(e.target.value)}
                      className="flex-1 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3.5 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:border-teal-500 font-medium"
                      autoFocus
                    />
                    <button
                      type="submit"
                      className="px-4 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs transition shadow-sm flex items-center gap-1.5 shrink-0"
                    >
                      <Search className="w-3.5 h-3.5" />
                      Search FilmyFly
                    </button>
                  </form>
                )}

                {/* Domain Configuration Panel */}
                <DomainSettingsModal
                  isOpen={showDomainSettings}
                  onClose={() => setShowDomainSettings(false)}
                  moviesdriveDomainInput={moviesdriveDomainInput}
                  setMoviesdriveDomainInput={setMoviesdriveDomainInput}
                  skymoviesDomainInput={skymoviesDomainInput}
                  setSkymoviesDomainInput={setSkymoviesDomainInput}
                  filmygoDomainInput={filmygoDomainInput}
                  setFilmygoDomainInput={setFilmygoDomainInput}
                  hdhubDomainInput={hdhubDomainInput}
                  setHdhubDomainInput={setHdhubDomainInput}
                  filmyflyDomainInput={filmyflyDomainInput}
                  setFilmyflyDomainInput={setFilmyflyDomainInput}
                  onSave={handleSaveDomains}
                />

                <div className="flex flex-wrap items-center gap-2">
                  <button onClick={() => handleCheck()} disabled={loading} className="inline-flex items-center justify-center rounded-xl gap-1.5 bg-cyan-500 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-cyan-600 dark:hover:bg-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm">{loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}{loading ? "Checking..." : `Check ${links.length || ""} Link${links.length > 1 ? "s" : ""}`}</button>
                  <button 
                    onClick={() => {
                      const trimmedInput = input.trim();
                      if (trimmedInput && !trimmedInput.startsWith("http")) {
                        executeMoviesdriveSearch(trimmedInput);
                      } else {
                        setShowMoviesdriveSearchInput(prev => !prev);
                        setShowSkymoviesSearchInput(false);
                        setShowFilmygoSearchInput(false);
                        setShowHdhubSearchInput(false);
                        setShowFilmyflySearchInput(false);
                      }
                    }} 
                    className="inline-flex items-center justify-center rounded-xl border border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 px-3.5 py-1.5 text-xs font-bold text-indigo-500 dark:text-indigo-400 gap-1.5 transition-colors shadow-sm"
                    title="Toggle MoviesDrive search bar or search text"
                  >
                    <Search className="h-3.5 w-3.5" /> Search MoviesDrive
                  </button>
                  <button 
                    onClick={() => {
                      const trimmedInput = input.trim();
                      if (trimmedInput && !trimmedInput.startsWith("http")) {
                        executeSkymoviesSearch(trimmedInput);
                      } else {
                        setShowSkymoviesSearchInput(prev => !prev);
                        setShowMoviesdriveSearchInput(false);
                        setShowFilmygoSearchInput(false);
                        setShowHdhubSearchInput(false);
                        setShowFilmyflySearchInput(false);
                      }
                    }} 
                    className="inline-flex items-center justify-center rounded-xl border border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20 px-3.5 py-1.5 text-xs font-bold text-purple-500 dark:text-purple-400 gap-1.5 transition-colors shadow-sm"
                    title="Toggle SkyMoviesHD search bar or search text"
                  >
                    <Search className="h-3.5 w-3.5" /> Search SkyMoviesHD
                  </button>
                  <button 
                    onClick={() => {
                      const trimmedInput = input.trim();
                      if (trimmedInput && !trimmedInput.startsWith("http")) {
                        executeFilmygoSearch(trimmedInput);
                      } else {
                        setShowFilmygoSearchInput(prev => !prev);
                        setShowMoviesdriveSearchInput(false);
                        setShowSkymoviesSearchInput(false);
                        setShowHdhubSearchInput(false);
                        setShowFilmyflySearchInput(false);
                      }
                    }} 
                    className="inline-flex items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 px-3.5 py-1.5 text-xs font-bold text-emerald-500 dark:text-emerald-400 gap-1.5 transition-colors shadow-sm"
                    title="Toggle FilmyGo search bar or search text"
                  >
                    <Search className="h-3.5 w-3.5" /> Search FilmyGo
                  </button>
                  <button 
                    onClick={() => {
                      const trimmedInput = input.trim();
                      if (trimmedInput && !trimmedInput.startsWith("http")) {
                        executeHdhubSearch(trimmedInput);
                      } else {
                        setShowHdhubSearchInput(prev => !prev);
                        setShowMoviesdriveSearchInput(false);
                        setShowSkymoviesSearchInput(false);
                        setShowFilmygoSearchInput(false);
                        setShowFilmyflySearchInput(false);
                      }
                    }} 
                    className="inline-flex items-center justify-center rounded-xl border border-orange-500/30 bg-orange-500/10 hover:bg-orange-500/20 px-3.5 py-1.5 text-xs font-bold text-orange-500 dark:text-orange-400 gap-1.5 transition-colors shadow-sm"
                    title="Toggle HDHub4U search bar or search text"
                  >
                    <Search className="h-3.5 w-3.5" /> Search HDHub4U
                  </button>
                  <button 
                    onClick={() => {
                      const trimmedInput = input.trim();
                      if (trimmedInput && !trimmedInput.startsWith("http")) {
                        executeFilmyflySearch(trimmedInput);
                      } else {
                        setShowFilmyflySearchInput(prev => !prev);
                        setShowMoviesdriveSearchInput(false);
                        setShowSkymoviesSearchInput(false);
                        setShowFilmygoSearchInput(false);
                        setShowHdhubSearchInput(false);
                      }
                    }} 
                    className="inline-flex items-center justify-center rounded-xl border border-teal-500/30 bg-teal-500/10 hover:bg-teal-500/20 px-3.5 py-1.5 text-xs font-bold text-teal-500 dark:text-teal-400 gap-1.5 transition-colors shadow-sm"
                    title="Toggle FilmyFly search bar or search text"
                  >
                    <Search className="h-3.5 w-3.5" /> Search FilmyFly
                  </button>
                  <button
                    onClick={() => {
                      setMoviesdriveDomainInput(getMoviesdriveDomain());
                      setSkymoviesDomainInput(getSkymoviesDomain());
                      setFilmygoDomainInput(getFilmygoDomain());
                      setHdhubDomainInput(getHdhub4uDomain());
                      setFilmyflyDomainInput(getFilmyflyDomain());
                      setShowDomainSettings(prev => !prev);
                    }}
                    className="inline-flex items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 px-3.5 py-1.5 text-xs font-bold text-amber-600 dark:text-amber-400 gap-1.5 transition-colors shadow-sm"
                    title="Configure custom search domains saved in local storage"
                  >
                    <Globe className="h-3.5 w-3.5" /> Site Domains
                  </button>
                  <button onClick={retryFailed} className="inline-flex items-center justify-center rounded-xl border border-zinc-200 dark:border-zinc-800 bg-transparent px-3.5 py-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 gap-1.5 disabled:opacity-50 transition-colors" disabled={loading || !results.some((r) => !r.ok || r.statusLabel === "UNKNOWN" || r.statusLabel === "MISSING_FILENAME" || r.statusLabel === "BROKEN" || r.statusLabel === "UNAVAILABLE" || isMissingPixeldrain(r))}><RefreshCw className="h-3.5 w-3.5" /> Retry Failed</button>
                  <button onClick={copyResults} className="inline-flex items-center justify-center rounded-xl border border-zinc-200 dark:border-zinc-800 bg-transparent px-3.5 py-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 gap-1.5 disabled:opacity-50 transition-colors" disabled={!results.length}><Copy className="h-3.5 w-3.5" /> Copy Results</button>
                  <button onClick={reset} className="inline-flex items-center justify-center rounded-xl border border-zinc-200 dark:border-zinc-800 bg-transparent px-3.5 py-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 gap-1.5 transition-colors"><Trash2 className="h-3.5 w-3.5" /> Reset</button>
                  
                  {!!results.length && (
                    <>
                      <button onClick={toggleSelectAll} className="inline-flex items-center justify-center rounded-xl border border-zinc-200 dark:border-zinc-800 bg-transparent px-3.5 py-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 gap-1.5 transition-colors">
                        {areAllEligibleSelected ? "Deselect All" : "Select All"}
                      </button>

                      {parsedSortedGroups.hasEpisodes && (
                        <>
                          <button 
                            onClick={selectAllCheckedEpisodes} 
                            className="inline-flex items-center justify-center rounded-xl border border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 px-3.5 py-1.5 text-xs font-bold text-indigo-600 dark:text-indigo-400 gap-1.5 transition-colors shadow-sm"
                          >
                            <Tv className="h-3.5 w-3.5" />
                            Select All Episodes ({parsedSortedGroups.totalEpisodesCount})
                          </button>
                          {parsedSortedGroups.activeQualityCategories.map(qCat => {
                            const qList = parsedSortedGroups.episodesByQuality.get(qCat) || [];
                            if (qList.length === 0) return null;
                            const allQSel = qList.every(e => selectedUrls.has(e.result.url));
                            const qConfig = QUALITY_COLORS[qCat] || QUALITY_COLORS['Other'];
                            return (
                              <button
                                key={qCat}
                                type="button"
                                onClick={() => toggleCheckedQualitySelection(qCat)}
                                className={`inline-flex items-center justify-center rounded-xl border px-3 py-1.5 text-xs font-bold gap-1.5 transition-colors shadow-sm ${
                                  allQSel
                                    ? 'bg-rose-500/15 hover:bg-rose-500/25 text-rose-600 dark:text-rose-400 border-rose-500/30'
                                    : `${qConfig.buttonBg} ${qConfig.buttonText}`
                                }`}
                                title={`Select or deselect all ${qCat} episodes`}
                              >
                                {allQSel ? `Deselect ${qCat}` : `Select All ${qCat} (${qList.length})`}
                              </button>
                            );
                          })}
                        </>
                      )}

                      {parsedSortedGroups.packs.length > 0 && (
                        <button 
                          onClick={toggleCheckedPacksSelection} 
                          className="inline-flex items-center justify-center rounded-xl border border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20 px-3.5 py-1.5 text-xs font-bold text-purple-600 dark:text-purple-400 gap-1.5 transition-colors shadow-sm"
                        >
                          <Package className="h-3.5 w-3.5" />
                          Select All Packs ({parsedSortedGroups.packs.length})
                        </button>
                      )}
                    </>
                  )}

                  {(onAddLinks || onBatchAddLinks) && selectedUrls.size > 0 && !loading && (
                    <button onClick={handleAddLinks} className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 gap-1.5 ml-auto transition-colors shadow-sm">
                      <LinkIcon className="h-3.5 w-3.5" />
                      {isBatchMode ? `Add ${selectedUrls.size} Links Missing` : `Add ${selectedUrls.size} Link(s)`}
                    </button>
                  )}
                </div>
              </>
            )}

                {error ? <div className="rounded-2xl border border-red-200 dark:border-red-900/70 bg-red-50 dark:bg-red-950/40 p-4 text-red-600 dark:text-red-300 text-sm flex items-start gap-2 transition-colors duration-300"><AlertTriangle className="h-4 w-4 mt-0.5" /><span>{error}</span></div> : null}

                {!!results.length && (
                  <div className="grid grid-cols-2 md:grid-cols-9 gap-3">
                    {[
                      ["Working", summary.working, "text-emerald-600 dark:text-emerald-400"],
                      ["Broken", summary.broken, "text-red-600 dark:text-red-400"],
                      ["Size Mismatch", summary.sizeMismatch, "text-red-600 dark:text-red-400"],
                      ["Protected", summary.protectedCount, "text-yellow-600 dark:text-yellow-400"],
                      ["Redirect", summary.redirect, "text-cyan-600 dark:text-cyan-400"],
                      ["Unavailable", summary.unavailable, "text-orange-600 dark:text-orange-400"],
                      ["Unknown", summary.unknown, "text-zinc-500 dark:text-zinc-300"],
                      ["Mismatches", summary.mismatches, "text-pink-600 dark:text-pink-400"],
                      ["Missing Filename", summary.missingFilename, "text-pink-600 dark:text-pink-400"],
                      ["Missing Quality", summary.missingQuality, "text-pink-600 dark:text-pink-400"],
                      ["Missing Language", summary.missingLanguage, "text-pink-600 dark:text-pink-400"],
                      ["Small File", summary.smallFile, "text-orange-600 dark:text-orange-400"]
                    ].map(([label, count, color]) => (
                      <div key={String(label)} className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/60 p-4 transition-colors duration-300">
                        <div className={`text-sm ${color}`}>{label}</div>
                        <div className="text-2xl font-semibold text-zinc-900 dark:text-white mt-1">{count}</div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="space-y-4 max-h-[500px] overflow-auto pr-1">
                  {(() => {
                    const renderCheckedResultCard = ({ result, locationTag }: (typeof sortedResults)[0], showEpBadge: boolean = true) => {
                      const statusLabel = result.statusLabel || (result.ok ? "WORKING" : "UNKNOWN");
                      const openRow = !!expanded[result.url];
                      const itemInfo = getItemEpisodeInfo({ ...result, locationTag });

                      return (
                        <div key={`${result.url}-${result.qualityLabel || "na"}`} className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 overflow-hidden transition-colors duration-300">
                          <div className="p-4 space-y-3">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                              <div className="min-w-0 flex-1 flex items-start gap-3">
                                <div className="mt-1">
                                  <input type="checkbox" checked={selectedUrls.has(result.url)} onChange={() => toggleSelect(result.url)} className="h-5 w-5 rounded border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    {result.ok ? <CheckCircle2 className="h-5 w-5 text-emerald-500 dark:text-emerald-400" /> : <XCircle className="h-5 w-5 text-red-500 dark:text-red-400" />}
                                    <div className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${badgeMap[statusLabel]}`}>{statusLabel}</div>
                                    {showEpBadge && itemInfo.isEpisode && (
                                      <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30">
                                        {itemInfo.label}
                                      </span>
                                    )}
                                    {result.isDirectDownload ? <div className="inline-flex rounded-full border border-blue-200 dark:border-blue-800 bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-600 dark:text-blue-400"><FileDown className="h-3.5 w-3.5 mr-1" /> Direct Download</div> : null}
                                    {(result.isSample || (result.fileName && /\bsample\b/i.test(result.fileName)) || (result.url && /\bsample\b/i.test(result.url))) ? (
                                      <div className="inline-flex rounded-full border border-rose-200 dark:border-rose-800 bg-rose-500/10 px-3 py-1 text-xs font-black text-rose-600 dark:text-rose-400">SAMPLE</div>
                                    ) : null}
                                    {(result.mismatchWarnings?.length || 0) > 0 ? <div className="inline-flex rounded-full border border-pink-200 dark:border-pink-800 bg-pink-500/10 px-3 py-1 text-xs font-medium text-pink-600 dark:text-pink-400"><Siren className="h-3.5 w-3.5 mr-1" /> Mismatch</div> : null}
                                  </div>
                                  <div className="mt-2 flex flex-wrap gap-2 items-center">
                                    {result.fileSizeText ? <span className="rounded-full border border-teal-200 dark:border-teal-800 bg-teal-500/10 px-2.5 py-1 text-[11px] font-bold text-teal-600 dark:text-teal-300">{result.fileSizeText}</span> : null}
                                    {result.qualityLabel ? <span className="rounded-full border border-fuchsia-200 dark:border-fuchsia-800 bg-fuchsia-500/10 px-2.5 py-1 text-[11px] font-medium text-fuchsia-600 dark:text-fuchsia-300">{result.qualityLabel}</span> : null}
                                    {result.printQualityLabel ? <span className="rounded-full border border-rose-200 dark:border-rose-800 bg-rose-500/10 px-2.5 py-1 text-[11px] font-medium text-rose-600 dark:text-rose-300">{result.printQualityLabel}</span> : null}
                                    {((result.codecLabel === "HEVC") || (result.fileName && /\b(hevc|x265|h[\.\-_]?265|10bit|10-bit)\b/i.test(result.fileName)) || (result.url && /\b(hevc|x265|h[\.\-_]?265|10bit|10-bit)\b/i.test(result.url))) ? (
                                      <span className="rounded-full border border-indigo-200 dark:border-indigo-800 bg-indigo-500/10 px-2.5 py-1 text-[11px] font-bold text-indigo-600 dark:text-indigo-300">HEVC</span>
                                    ) : result.codecLabel ? (
                                      <span className="rounded-full border border-indigo-200 dark:border-indigo-800 bg-indigo-500/10 px-2.5 py-1 text-[11px] font-medium text-indigo-600 dark:text-indigo-300">{result.codecLabel}</span>
                                    ) : null}
                                    {result.audioLabel ? <span className="rounded-full border border-emerald-200 dark:border-emerald-800 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-300">{result.audioLabel}</span> : null}
                                    {result.subtitleLabel ? <span className="rounded-full border border-amber-200 dark:border-amber-800 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-600 dark:text-amber-300">{result.subtitleLabel}</span> : null}
                                    {locationTag ? (
                                      <span className="rounded-full border border-indigo-300 dark:border-indigo-700 bg-indigo-500/20 px-2.5 py-1 text-[11px] font-extrabold text-indigo-600 dark:text-indigo-300 shadow-xs">
                                        Location: {locationTag}
                                      </span>
                                    ) : (
                                      <>
                                        {result.season ? <span className="rounded-full border border-blue-200 dark:border-blue-800 bg-blue-500/10 px-2.5 py-1 text-[11px] font-bold text-blue-600 dark:text-blue-300">Season {result.season}</span> : null}
                                        {result.episode ? <span className="rounded-full border border-indigo-200 dark:border-indigo-800 bg-indigo-500/10 px-2.5 py-1 text-[11px] font-bold text-indigo-600 dark:text-indigo-300">Episode {result.episode}</span> : null}
                                        {result.isFullSeasonMKV ? <span className="rounded-full border border-purple-200 dark:border-purple-800 bg-purple-500/10 px-2.5 py-1 text-[11px] font-bold text-purple-600 dark:text-purple-300">Full Season MKV</span> : null}
                                        {result.isFullSeasonZIP ? <span className="rounded-full border border-purple-200 dark:border-purple-800 bg-purple-500/10 px-2.5 py-1 text-[11px] font-bold text-purple-600 dark:text-purple-300">Full Season ZIP</span> : null}
                                      </>
                                    )}
                                  </div>
                                  {(isHubcloudVariant(result.url) || (result.candidates && result.candidates.length > 0)) && (
                                    <div className="mt-2 flex flex-wrap gap-2 items-center">
                                      <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 mr-1 flex items-center gap-1.5"><Server className="h-3.5 w-3.5" /> Downloads:</span>
                                      {result.candidates && result.candidates.length > 0 ? (
                                        <>
                                          {result.candidates.filter((cand) => {
                                            const lowerT = (cand.text || '').toLowerCase();
                                            const lowerH = (cand.href || '').toLowerCase();
                                            return !lowerT.includes('login') && !lowerH.includes('login') &&
                                                   !lowerT.includes('moviesdrive') && !lowerH.includes('moviesdrive') &&
                                                   !lowerT.includes('mdrive') && !lowerH.includes('mdrive') &&
                                                   !lowerT.includes('telegram') && !lowerH.includes('telegram');
                                          }).map((cand, idx) => {
                                            let name = cand.text.replace(/download/i, '').replace(/\[|\]/g, '').trim();
                                            if (!name) return null;
                                            const isPixeldrain = name.toLowerCase().includes("pixeldrain") || cand.href.toLowerCase().includes("pixeldrain");
                                            return (
                                              <span key={idx} className={`rounded-lg border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
                                                isPixeldrain 
                                                  ? "border-emerald-200 dark:border-emerald-800 bg-emerald-500/10 text-emerald-600 dark:text-cyan-400" 
                                                  : "border-zinc-200 dark:border-zinc-700 bg-zinc-200/50 dark:bg-zinc-800/50 text-zinc-600 dark:text-zinc-300"
                                              }`}>
                                                {name}
                                              </span>
                                            );
                                          })}
                                          {isMissingPixeldrain(result) && (
                                            <button
                                              onClick={() => handleCheck([result.url], undefined, 0, true)}
                                              disabled={loading}
                                              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 dark:border-red-800 bg-red-500/10 hover:bg-red-500/20 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-red-600 dark:text-red-400 animate-pulse cursor-pointer transition-colors"
                                              title="Retry fetching Pixeldrain download link for this item"
                                            >
                                              <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
                                              Missing Pixeldrain (Retry)
                                            </button>
                                          )}
                                        </>
                                      ) : (
                                        <button
                                          onClick={() => handleCheck([result.url], undefined, 0, true)}
                                          disabled={loading}
                                          className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 dark:border-red-800 bg-red-500/10 hover:bg-red-500/20 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-red-600 dark:text-red-400 animate-pulse cursor-pointer transition-colors"
                                          title="Retry fetching Pixeldrain download link for this item"
                                        >
                                          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
                                          Missing Pixeldrain (Retry)
                                        </button>
                                      )}
                                    </div>
                                  )}
                                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                                    <span className="break-all text-sm font-medium text-zinc-700 dark:text-zinc-200 select-all">{result.url}</span>
                                  </div>
                                  {result.finalUrl && result.finalUrl !== result.url && (
                                    <div className="mt-1 break-all text-xs text-zinc-500 dark:text-zinc-400">Redirects to: {result.finalUrl}</div>
                                  )}
                                  <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">{result.message || (result.ok ? "The link is reachable." : "The link could not be verified.")}</p>
                                </div>
                              </div>
                              <div className="flex gap-2 self-start">
                                {(!result.ok || result.statusLabel === "UNKNOWN" || result.statusLabel === "MISSING_FILENAME" || result.statusLabel === "BROKEN" || result.statusLabel === "UNAVAILABLE" || isMissingPixeldrain(result)) && (
                                  <button
                                    onClick={() => handleCheck([result.url], undefined, 0, true)}
                                    disabled={loading}
                                    className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-transparent px-3 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50 gap-1.5 transition-colors"
                                    title="Retry checking this link"
                                  >
                                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                                    Retry
                                  </button>
                                )}
                                <button onClick={() => toggleExpand(result.url)} className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-transparent px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 gap-2 transition-colors">Details {openRow ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button>
                              </div>
                            </div>
                            {openRow ? (
                              <div className="grid gap-2 text-xs text-zinc-500 dark:text-zinc-400 sm:grid-cols-2 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/70 p-4 transition-colors duration-300">
                                {typeof result.status !== "undefined" ? <div>Status: {result.status}</div> : null}
                                {result.host ? <div>Host: {result.host}</div> : null}
                                {result.contentType ? <div>Content-Type: {result.contentType}</div> : null}
                                {result.source ? <div>Method: {result.source}</div> : null}
                                {result.fileName ? <div>File Name: {result.fileName}</div> : null}
                                {result.fileSizeText ? <div>File Size: {result.fileSizeText}</div> : null}
                                {result.qualityLabel ? <div>Quality: {result.qualityLabel}</div> : null}
                                {result.printQualityLabel ? <div>Print Quality: {result.printQualityLabel}</div> : null}
                                {result.codecLabel ? <div>Codec: {result.codecLabel}</div> : null}
                                {result.audioLabel ? <div>Audio: {result.audioLabel}</div> : null}
                                {result.subtitleLabel ? <div>Subtitles: {result.subtitleLabel}</div> : null}
                                {locationTag ? <div>Location: <span className="font-mono font-bold text-indigo-500 dark:text-indigo-400">{locationTag}</span></div> : null}
                                {result.season ? <div>Season: {result.season}</div> : null}
                                {result.episode ? <div>Episode: {result.episode}</div> : null}
                                {result.isFullSeasonMKV ? <div>Full Season MKV: Yes</div> : null}
                                {result.isFullSeasonZIP ? <div>Full Season ZIP: Yes</div> : null}
                                {typeof result.confidenceScore === "number" ? <div>Confidence: {result.confidenceScore}%</div> : null}
                                {result.finalUrl ? <div className="sm:col-span-2 break-all text-zinc-600 dark:text-zinc-300">Final URL: {result.finalUrl}</div> : null}
                                {(result.mismatchWarnings?.length || 0) > 0 ? (
                                  <div className="sm:col-span-2 rounded-xl border border-pink-200 dark:border-pink-900/70 bg-pink-50 dark:bg-pink-950/30 p-3 text-pink-600 dark:text-pink-300 transition-colors duration-300">
                                    <div className="font-semibold mb-2">Mismatch Warnings</div>
                                    <ul className="list-disc pl-5 space-y-1">{result.mismatchWarnings?.map((w, i) => <li key={i}>{w}</li>)}</ul>
                                  </div>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      );
                    };

                    if (!parsedSortedGroups.hasEpisodes) {
                      return sortedResults.map((entry) => renderCheckedResultCard(entry, false));
                    }

                    return (
                      <div className="space-y-4">
                        {/* 1. Complete Season Packs */}
                        {parsedSortedGroups.packs.length > 0 && (
                          <div className="rounded-2xl border border-purple-500/30 bg-purple-500/5 p-3.5 space-y-3">
                            <div className="flex items-center justify-between px-1">
                              <div className="flex items-center gap-2">
                                <Package className="w-4 h-4 text-purple-500" />
                                <span className="text-xs font-bold text-zinc-900 dark:text-white uppercase tracking-wider">
                                  Complete Season Packs
                                </span>
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-600 dark:text-purple-400">
                                  {parsedSortedGroups.packs.length} {parsedSortedGroups.packs.length === 1 ? 'pack' : 'packs'}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={toggleCheckedPacksSelection}
                                className="text-[11px] font-bold text-purple-600 dark:text-purple-400 hover:underline px-2 py-0.5"
                              >
                                {parsedSortedGroups.packs.every(e => selectedUrls.has(e.result.url)) ? 'Deselect Packs' : 'Select All Packs'}
                              </button>
                            </div>
                            <div className="grid gap-2">
                              {parsedSortedGroups.packs.map(entry => renderCheckedResultCard(entry, false))}
                            </div>
                          </div>
                        )}

                        {/* 2. Individual Episodes */}
                        <div className="space-y-3 pt-1">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between px-1 border-b border-zinc-200 dark:border-zinc-800 pb-2.5 gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Tv className="w-4 h-4 text-indigo-500" />
                              <span className="text-xs font-bold text-zinc-900 dark:text-white uppercase tracking-wider">
                                Episodes ({parsedSortedGroups.sortedEpKeys.length} Episodes)
                              </span>
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-600 dark:text-indigo-400">
                                {parsedSortedGroups.totalEpisodesCount} Links
                              </span>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap self-end sm:self-auto">
                              {/* Grouping switcher */}
                              <div className="flex items-center bg-zinc-200/60 dark:bg-zinc-800/60 p-0.5 rounded-lg text-[11px] font-bold">
                                <button
                                  type="button"
                                  onClick={() => setCheckedEpisodeGroupingMode('quality')}
                                  className={`px-2.5 py-1 rounded-md transition ${
                                    checkedEpisodeGroupingMode === 'quality'
                                      ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-xs'
                                      : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                                  }`}
                                >
                                  By Quality (720p...)
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setCheckedEpisodeGroupingMode('episode')}
                                  className={`px-2.5 py-1 rounded-md transition ${
                                    checkedEpisodeGroupingMode === 'episode'
                                      ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-xs'
                                      : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                                  }`}
                                >
                                  By Episode
                                </button>
                              </div>

                              <button
                                type="button"
                                onClick={selectAllCheckedEpisodes}
                                className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline px-2 py-0.5"
                              >
                                Select All Episodes
                              </button>
                            </div>
                          </div>

                          {/* Quality Grouping Mode for Checked Results */}
                          {checkedEpisodeGroupingMode === 'quality' ? (
                            <div className="space-y-4">
                              {parsedSortedGroups.activeQualityCategories.map((qCat) => {
                                const qEntries = parsedSortedGroups.episodesByQuality.get(qCat) || [];
                                if (qEntries.length === 0) return null;
                                const allQSelected = qEntries.length > 0 && qEntries.every(e => selectedUrls.has(e.result.url));
                                const qConfig = QUALITY_COLORS[qCat] || QUALITY_COLORS['Other'];
                                const qLabel = QUALITY_LABELS[qCat] || qCat;

                                return (
                                  <div
                                    key={qCat}
                                    className={`rounded-2xl border ${qConfig.border} ${qConfig.bg} p-3.5 space-y-3 transition-colors duration-200`}
                                  >
                                    <div className="flex items-center justify-between px-1 flex-wrap gap-2">
                                      <div className="flex items-center gap-2">
                                        <span className={`px-2.5 py-1 rounded-lg text-xs font-black border ${qConfig.badge}`}>
                                          {qLabel}
                                        </span>
                                        <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                                          {qEntries.length} {qEntries.length === 1 ? 'episode link' : 'episodes'}
                                        </span>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => toggleCheckedQualitySelection(qCat)}
                                        className={`text-xs font-bold px-3 py-1 rounded-lg border transition shadow-xs ${
                                          allQSelected
                                            ? 'bg-rose-500/15 hover:bg-rose-500/25 text-rose-600 dark:text-rose-400 border-rose-500/30'
                                            : `${qConfig.buttonBg} ${qConfig.buttonText}`
                                        }`}
                                      >
                                        {allQSelected ? `Deselect All ${qCat}` : `Select All ${qCat} (${qEntries.length})`}
                                      </button>
                                    </div>
                                    <div className="grid gap-2">
                                      {qEntries.map(entry => renderCheckedResultCard(entry, true))}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            /* Episode-first Grouping Mode */
                            <div className="space-y-3">
                              {parsedSortedGroups.sortedEpKeys.map((epNum) => {
                                const epEntries = parsedSortedGroups.episodesMap.get(epNum) || [];
                                if (epEntries.length === 0) return null;
                                const allEpSelected = epEntries.every(e => selectedUrls.has(e.result.url));
                                const firstInfo = getItemEpisodeInfo({ ...epEntries[0].result, locationTag: epEntries[0].locationTag });
                                const label = firstInfo.label || `Episode ${epNum}`;

                                return (
                                  <div key={epNum} className="rounded-2xl border border-zinc-200/90 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/40 p-3 space-y-2.5">
                                    <div className="flex items-center justify-between px-1">
                                      <div className="flex items-center gap-2">
                                        <span className="px-2.5 py-0.5 rounded-md text-xs font-black bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30">
                                          {label}
                                        </span>
                                        <span className="text-[11px] font-medium text-zinc-500">
                                          {epEntries.length} {epEntries.length === 1 ? 'quality' : 'qualities'} available
                                        </span>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => toggleCheckedEpisodeSelection(epNum)}
                                        className={`text-[11px] font-bold px-2 py-0.5 rounded-md transition ${
                                          allEpSelected 
                                            ? 'bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30'
                                            : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-200/50 dark:hover:bg-zinc-800'
                                        }`}
                                      >
                                        {allEpSelected ? 'Deselect Ep' : 'Select Ep'}
                                      </button>
                                    </div>
                                    <div className="grid gap-2">
                                      {epEntries.map(entry => renderCheckedResultCard(entry, false))}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {/* 3. Other Links */}
                        {parsedSortedGroups.others.length > 0 && (
                          <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30 p-3 space-y-2">
                            <div className="flex items-center justify-between px-1">
                              <div className="flex items-center gap-2">
                                <Film className="w-4 h-4 text-zinc-500" />
                                <span className="text-xs font-bold text-zinc-900 dark:text-white uppercase tracking-wider">
                                  Other Links
                                </span>
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                                  {parsedSortedGroups.others.length}
                                </span>
                              </div>
                            </div>
                            <div className="grid gap-2">
                              {parsedSortedGroups.others.map(entry => renderCheckedResultCard(entry, true))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
};

