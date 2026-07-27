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
  Info,
  Siren,
  Plus,
  X,
  Server,
  Search,
  Download,
  ExternalLink,
  Film,
  Loader2 as LoaderIcon
} from "lucide-react";
import { QualityLinks, Language, Quality, LinkDef } from '../types';
import { 
  LinkCheckResult, 
  StatusLabel, 
  normalizeUrl, 
  splitLinks, 
  guessLinkType, 
  detectMetadataForLink, 
  buildMismatchWarnings,
  performFullLinkScan
} from '../utils/linkScanner';
import { useModalBehavior } from '../hooks/useModalBehavior';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  initialInput?: string;
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

export const LinkCheckerModal: React.FC<Props> = ({
  isOpen,
  onClose,
  title = "Link Checker",
  initialInput = "",
  autoStart = false,
  isBatchMode = false,
  onAddLinks,
  onBatchAddLinks,
  onResults,
  languages = [],
  qualities = [],
  disableAutoClipboard = false,
}) => {
  const [input, setInput] = useState(initialInput);
  const inputRef = React.useRef(input);
  useEffect(() => {
    inputRef.current = input;
  }, [input]);

  const [autoClipboard, setAutoClipboard] = useState(false);
  const [clipboardStatus, setClipboardStatus] = useState<"active" | "unfocused" | "denied" | "idle">("idle");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<LinkCheckResult[]>([]);
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set());
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
  const [mdriveResults, setMdriveResults] = useState<any[]>([]);
  const [mdriveLoading, setMdriveLoading] = useState(false);
  const [mdriveError, setMdriveError] = useState<string | null>(null);
  const [mdriveSelectedIndices, setMdriveSelectedIndices] = useState<Set<number>>(new Set());
  const [mdriveExtractingDirect, setMdriveExtractingDirect] = useState<Record<number, boolean>>({});
  const processedExtractionsRef = React.useRef<Set<string>>(new Set());

  // MoviesDrive Search Results & Pagination State
  const [moviesdriveSearchUrl, setMoviesdriveSearchUrl] = useState<string | null>(null);
  const [moviesdriveSearchPosts, setMoviesdriveSearchPosts] = useState<{ title: string; url: string; image?: string }[]>([]);
  const [moviesdriveSelectedIndices, setMoviesdriveSelectedIndices] = useState<Set<number>>(new Set());
  const [moviesdriveSearchQuery, setMoviesdriveSearchQuery] = useState<string>("");
  const [moviesdrivePageLoading, setMoviesdrivePageLoading] = useState<boolean>(false);
  const [customPageInput, setCustomPageInput] = useState<string>("");

  // Direct MoviesDrive Search Input State
  const [showMoviesdriveSearchInput, setShowMoviesdriveSearchInput] = useState<boolean>(false);
  const [moviesdriveSearchTerm, setMoviesdriveSearchTerm] = useState<string>("");

  // Direct SkyMoviesHD Search Input State & Pagination Limit
  const [showSkymoviesSearchInput, setShowSkymoviesSearchInput] = useState<boolean>(false);
  const [skymoviesSearchTerm, setSkymoviesSearchTerm] = useState<string>("");
  const [skymoviesVisibleLimit, setSkymoviesVisibleLimit] = useState<number>(50);

  // Direct FilmyGo Search Input State
  const [showFilmygoSearchInput, setShowFilmygoSearchInput] = useState<boolean>(false);
  const [filmygoSearchTerm, setFilmygoSearchTerm] = useState<string>("");

  React.useEffect(() => {
    setSkymoviesVisibleLimit(50);
  }, [moviesdriveSearchPosts, moviesdriveSearchUrl]);

  const moviesdrivePageInfo = useMemo(() => {
    if (!moviesdriveSearchUrl) return { query: "", page: 1, origin: "https://new6.moviesdrives.my", isSkyMovies: false, isFilmygo: false };
    try {
      const u = new URL(moviesdriveSearchUrl);
      const isSky = u.hostname.includes("skymovies");
      const isFilmy = u.hostname.includes("filmygo");
      const q = u.searchParams.get("to-search") || u.searchParams.get("search") || u.searchParams.get("q") || u.searchParams.get("s") || "";
      const p = parseInt(u.searchParams.get("to-page") || u.searchParams.get("page") || u.searchParams.get("p") || u.searchParams.get("pg") || "1", 10) || 1;
      return { query: q, page: p, origin: u.origin || (isFilmy ? "https://filmygo.online" : "https://new6.moviesdrives.my"), isSkyMovies: isSky, isFilmygo: isFilmy };
    } catch {
      return { query: "", page: 1, origin: "https://new6.moviesdrives.my", isSkyMovies: false, isFilmygo: false };
    }
  }, [moviesdriveSearchUrl]);

  const handleMoviesdrivePageChange = async (targetPage: number) => {
    if (targetPage < 1 || !moviesdriveSearchUrl) return;
    const { query, origin, isSkyMovies, isFilmygo } = moviesdrivePageInfo;
    let newUrl = "";
    let endpoint = "";
    if (isSkyMovies) {
      newUrl = `${origin}/search.php?search=${encodeURIComponent(query)}&cat=All&page=${targetPage}`;
      endpoint = `/api/skymovieshd?url=${encodeURIComponent(newUrl)}`;
    } else if (isFilmygo) {
      newUrl = `${origin}/site-search.html?to-search=${encodeURIComponent(query)}&to-page=${targetPage}`;
      endpoint = `/api/filmygo?url=${encodeURIComponent(newUrl)}`;
    } else {
      newUrl = `${origin}/search.html?q=${encodeURIComponent(query)}&page=${targetPage}`;
      endpoint = `/api/moviesdrive?url=${encodeURIComponent(newUrl)}`;
    }
    setMoviesdriveSearchUrl(newUrl);
    setMoviesdrivePageLoading(true);
    try {
      const res = await fetch(endpoint);
      if (!res.ok) throw new Error('Catalog page fetch failed');
      const data = await res.json();
      if (data.is_search && Array.isArray(data.posts)) {
        setMoviesdriveSearchPosts(data.posts);
        const limit = isSkyMovies ? 50 : data.posts.length;
        setMoviesdriveSelectedIndices(new Set(data.posts.slice(0, limit).map((_: any, idx: number) => idx)));
        setMoviesdriveSearchQuery("");
      }
    } catch (e) {
      console.error("Error fetching catalog page:", e);
    } finally {
      setMoviesdrivePageLoading(false);
    }
  };

  const executeMoviesdriveSearch = (query: string) => {
    const trimmed = query.trim();
    let targetUrl = "";
    if (!trimmed) {
      targetUrl = "https://new6.moviesdrives.my/";
    } else if (!trimmed.startsWith("http")) {
      targetUrl = `https://new6.moviesdrives.my/search.html?q=${encodeURIComponent(trimmed)}&page=1`;
    } else {
      targetUrl = trimmed;
    }
    const currentVal = inputRef.current.trim();
    let newInput = "";
    if (!currentVal) {
      newInput = targetUrl;
    } else if (currentVal.includes(targetUrl)) {
      newInput = currentVal;
    } else {
      newInput = `${currentVal}\n${targetUrl}`;
    }
    setInput(newInput);
    setShowMoviesdriveSearchInput(false);
    setShowSkymoviesSearchInput(false);
    setShowFilmygoSearchInput(false);
    setMoviesdriveSearchTerm("");
    setTimeout(() => {
      handleCheck(undefined, newInput);
    }, 100);
  };

  const executeSkymoviesSearch = (query: string) => {
    const trimmed = query.trim();
    let targetUrl = "";
    if (!trimmed) {
      targetUrl = "https://skymovieshd.ceo/";
    } else if (!trimmed.startsWith("http")) {
      targetUrl = `https://skymovieshd.ceo/search.php?search=${encodeURIComponent(trimmed)}&cat=All`;
    } else {
      targetUrl = trimmed;
    }
    const currentVal = inputRef.current.trim();
    let newInput = "";
    if (!currentVal) {
      newInput = targetUrl;
    } else if (currentVal.includes(targetUrl)) {
      newInput = currentVal;
    } else {
      newInput = `${currentVal}\n${targetUrl}`;
    }
    setInput(newInput);
    setShowSkymoviesSearchInput(false);
    setShowMoviesdriveSearchInput(false);
    setShowFilmygoSearchInput(false);
    setSkymoviesSearchTerm("");
    setTimeout(() => {
      handleCheck(undefined, newInput);
    }, 100);
  };

  const executeFilmygoSearch = (query: string) => {
    const trimmed = query.trim();
    let targetUrl = "";
    if (!trimmed) {
      targetUrl = "https://filmygo.online/";
    } else if (!trimmed.startsWith("http")) {
      targetUrl = `https://filmygo.online/site-search.html?to-search=${encodeURIComponent(trimmed)}&to-page=1`;
    } else {
      targetUrl = trimmed;
    }
    const currentVal = inputRef.current.trim();
    let newInput = "";
    if (!currentVal) {
      newInput = targetUrl;
    } else if (currentVal.includes(targetUrl)) {
      newInput = currentVal;
    } else {
      newInput = `${currentVal}\n${targetUrl}`;
    }
    setInput(newInput);
    setShowFilmygoSearchInput(false);
    setShowMoviesdriveSearchInput(false);
    setShowSkymoviesSearchInput(false);
    setFilmygoSearchTerm("");
    setTimeout(() => {
      handleCheck(undefined, newInput);
    }, 100);
  };

  const handleClose = useCallback(() => {
    if (moviesdriveSearchUrl) {
      setMoviesdriveSearchUrl(null);
      setMoviesdriveSearchPosts([]);
      setMoviesdriveSelectedIndices(new Set());
      setMoviesdriveSearchQuery("");
      setMoviesdrivePageLoading(false);
      setCustomPageInput("");
    } else if (mdriveUrl) {
      setMdriveUrl(null);
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
    if (selectedUrls.size === results.length) {
      setSelectedUrls(new Set());
    } else {
      setSelectedUrls(new Set(results.map((r) => r.url)));
    }
  };

  const updateBatchReviewItem = (key: string, field: 'title' | 'year', value: string) => {
    setBatchReviewItems(prev => prev.map(item => 
      item.key === key ? { ...item, [field]: value } : item
    ));
  };

  const confirmBatchReview = () => {
    if (!onBatchAddLinks) return;
    
    onBatchAddLinks(batchReviewItems.map(item => ({
      title: item.title,
      year: item.year ? parseInt(item.year) : undefined,
      links: item.links,
      metadata: item.metadata
    })));
    reset();
    onClose();
  };

  const handleMdriveSearch = async (targetUrl: string) => {
    setMdriveLoading(true);
    setMdriveError(null);
    setMdriveResults([]);
    setMdriveSelectedIndices(new Set());

    try {
      const res = await fetch(`/api/mdrive?url=${encodeURIComponent(targetUrl)}`);
      if (!res.ok) throw new Error('Failed to fetch from MDrive');
      const data = await res.json();
      const hits = data.hits || [];
      setMdriveResults(hits);

      if (hits.length === 1) {
        // Auto-select and proceed without UI if only one result
        const singleLink = hits[0].url;
        processedExtractionsRef.current.add(targetUrl);
        
        const baseLink = targetUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
        const escapedBase = baseLink.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(https?://)?(www\\.)?${escapedBase}/?`, 'g');
        
        const currentInput = inputRef.current;
        const nextInput = currentInput.replace(regex, singleLink);
        
        console.log("MDrive auto-replacement:", { from: targetUrl, to: singleLink });
        setInput(nextInput);
        setMdriveUrl(null);
        setMdriveResults([]);
        
        setTimeout(() => {
          handleCheck(undefined, nextInput);
        }, 400);
        return;
      }

      if (hits.length > 1) {
        // Multiple links found, show selection popup
        setMdriveUrl(targetUrl);
      } else if (hits.length === 0) {
        // No links found, mark as processed and continue
        processedExtractionsRef.current.add(targetUrl);
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
      
      if (data.size || data.url) {
        setMdriveResults(prev => {
          const next = [...prev];
          // We DO NOT update the url to data.url per user request, just grab the size
          next[index] = { ...next[index], size: data.size || item.size };
          return next;
        });
      }
    } catch (err) {
      console.error('Failed to extract size:', err);
    } finally {
      setMdriveExtractingDirect(prev => ({ ...prev, [index]: false }));
    }
  };

  const confirmMdriveSelection = () => {
    if (mdriveUrl && mdriveSelectedIndices.size > 0) {
      const selectedLinks = mdriveResults.filter((_, i) => mdriveSelectedIndices.has(i));
      const newLinksText = selectedLinks.map(l => l.url).join('\n');
      
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
      
      console.log("MDrive replacement:", { from: mdriveUrl, to: newLinksText, success: nextInput !== currentInput });
      setInput(nextInput);
      
      setMdriveUrl(null);
      setMdriveResults([]);
      
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
    if (moviesdriveSearchUrl && moviesdriveSelectedIndices.size > 0) {
      const selectedPosts = moviesdriveSearchPosts.filter((_, i) => moviesdriveSelectedIndices.has(i));
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
      setMoviesdriveSelectedIndices(new Set());
      setMoviesdriveSearchQuery("");
      
      setTimeout(() => {
        handleCheck(undefined, nextInput);
      }, 400);
    } else if (moviesdriveSearchUrl) {
      processedExtractionsRef.current.add(moviesdriveSearchUrl);
      setMoviesdriveSearchUrl(null);
      setMoviesdriveSearchPosts([]);
      setMoviesdriveSelectedIndices(new Set());
      setMoviesdriveSearchQuery("");
    }
  };

  const handleCheck = async (onlyUrls?: string[], initialInputOverride?: string, depth = 0, force = false) => {
    setError(null);
    if (depth === 0 && !initialInputOverride) {
      processedExtractionsRef.current.clear();
    }
    if (depth > 5) {
      console.warn("Max check depth reached, stopping recursion.");
      setLoading(false);
      return;
    }

    // Derive links directly from input or use provided override
    const currentInputSnapshot = initialInputOverride || inputRef.current;
    
    // We no longer normalize domains to hubcloud.cx to allow dynamic domains
    let normalizedInput = currentInputSnapshot;
    
    let currentLinks = onlyUrls || splitLinks(normalizedInput).map(normalizeUrl).filter(Boolean);
    
    if (!currentLinks.length) {
      setError("Please paste at least one valid link first.");
      setLoading(false);
      return;
    }

    // 1. Identify all extractable links
    const extractableLinks = currentLinks.filter(u => 
      (u.includes('howblogs.xyz') || u.includes('filesdl.in') || u.includes('filesdl.top') || u.includes('mdrive.lol') || u.includes('mdrvie.lol') || u.includes('moviesdrives.') || u.includes('moviesdrive.') || u.includes('filmygo.') || u.includes('skymovies')) && 
      !processedExtractionsRef.current.has(u)
    );

    if (extractableLinks.length > 0) {
      setLoading(true);
      let pausedForUI = false;
      try {
        // Take up to 5 links at once
        const batch = extractableLinks.slice(0, 5);
        const results = await Promise.all(batch.map(async (targetUrl) => {
          try {
            const normUrl = normalizeUrl(targetUrl);
            if (normUrl.includes('mdrive.lol') || normUrl.includes('mdrvie.lol')) {
              const res = await fetch(`/api/mdrive?url=${encodeURIComponent(normUrl)}`);
              if (!res.ok) throw new Error('MDrive fetch failed');
              const data = await res.json();
              return { type: 'mdrive', original: targetUrl, data };
            } else if (normUrl.includes('moviesdrives.') || normUrl.includes('moviesdrive.')) {
              const res = await fetch(`/api/moviesdrive?url=${encodeURIComponent(normUrl)}`);
              if (!res.ok) throw new Error('MoviesDrive fetch failed');
              const data = await res.json();
              return { type: 'moviesdrive', original: targetUrl, data };
            } else if (normUrl.includes('filmygo.')) {
              const res = await fetch(`/api/filmygo?url=${encodeURIComponent(normUrl)}`);
              if (!res.ok) throw new Error('FilmyGo fetch failed');
              const data = await res.json();
              return { type: 'filmygo', original: targetUrl, data };
            } else if (normUrl.includes('skymovies')) {
              const res = await fetch(`/api/skymovieshd?url=${encodeURIComponent(normUrl)}`);
              if (!res.ok) throw new Error('SkymoviesHD fetch failed');
              const data = await res.json();
              return { type: 'skymovieshd', original: targetUrl, data };
            } else {
              const endpoint = normUrl.includes('howblogs.xyz') ? '/api/howblogs' : '/api/filesdl';
              const res = await fetch(`${endpoint}?url=${encodeURIComponent(normUrl)}`);
              if (!res.ok) throw new Error('Extraction failed');
              const data = await res.json();
              return { type: 'auto', original: targetUrl, extracted: data.url };
            }
          } catch (e) {
            console.error(`Failed to extract ${targetUrl}:`, e);
            return { type: 'error', original: targetUrl };
          }
        }));

        let nextInput = currentInputSnapshot;
        for (const res of results) {
          if (res.type === 'auto') {
            processedExtractionsRef.current.add(res.original);
            if (res.extracted && res.extracted !== res.original) {
              const baseLink = res.original.replace(/^https?:\/\//, '').replace(/\/$/, '');
              const escapedBase = baseLink.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              const regex = new RegExp(`(https?://)?(www\\.)?${escapedBase}/?`, 'g');
              nextInput = nextInput.replace(regex, res.extracted);
              console.log("Auto-replacement successful:", { from: res.original, to: res.extracted });
            }
          } else if (res.type === 'mdrive' || res.type === 'moviesdrive' || res.type === 'filmygo' || res.type === 'skymovieshd') {
            if ((res.type === 'moviesdrive' || res.type === 'skymovieshd' || res.type === 'filmygo') && res.data?.is_search && Array.isArray(res.data?.posts) && res.data.posts.length > 0) {
              setMoviesdriveSearchUrl(res.original);
              setMoviesdriveSearchPosts(res.data.posts);
              const isSky = res.type === 'skymovieshd' || res.original.includes('skymovies');
              const initialLimit = isSky ? 50 : res.data.posts.length;
              setMoviesdriveSelectedIndices(new Set(res.data.posts.slice(0, initialLimit).map((_: any, idx: number) => idx)));
              setMoviesdriveSearchQuery("");
              pausedForUI = true;
              break;
            }

            const hits = res.data?.hits || [];
            if (hits.length > 0) {
              if (res.type === 'mdrive') {
                if (hits.length === 1) {
                  processedExtractionsRef.current.add(res.original);
                  // Auto-extract the single link
                  const baseLink = res.original.replace(/^https?:\/\//, '').replace(/\/$/, '');
                  const escapedBase = baseLink.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                  const regex = new RegExp(`(https?://)?(www\\.)?${escapedBase}/?`, 'g');
                  nextInput = nextInput.replace(regex, hits[0].url);
                  console.log("MDrive auto-extraction successful (1 link).");
                } else {
                  // Show the selection modal if more than 1 hubcloud link is found
                  setMdriveUrl(res.original);
                  setMdriveResults(hits);
                  setMdriveSelectedIndices(new Set());
                  pausedForUI = true;
                  break;
                }
              } else if (hits.length === 1) {
                processedExtractionsRef.current.add(res.original);
                const singleLink = hits[0].url;
                const baseLink = res.original.replace(/^https?:\/\//, '').replace(/\/$/, '');
                const escapedBase = baseLink.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regex = new RegExp(`(https?://)?(www\\.)?${escapedBase}/?`, 'g');
                nextInput = nextInput.replace(regex, singleLink);
                console.log(`${res.type === 'moviesdrive' ? 'MoviesDrive' : res.type === 'filmygo' ? 'FilmyGo' : 'SkymoviesHD'} auto-replacement successful:`, { from: res.original, to: singleLink });
              } else {
                // Show UI for this specific link (MoviesDrive, FilmyGo, SkyMoviesHD with more than 1 hit)
                setMdriveUrl(res.original);
                setMdriveResults(hits);
                setMdriveSelectedIndices(new Set());
                pausedForUI = true;
                break; 
              }
            } else {
              // 0 hits
              processedExtractionsRef.current.add(res.original);
            }
          } else if (res.type === 'error') {
            console.log("Extraction error for", res.original, "- skipping from this session");
            processedExtractionsRef.current.add(res.original);
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
        // We set loading false even if paused, because the UI popup is a separate modal state.
        // Keeping "Checking..." on the main button while the popup is open looks like it's stuck.
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

            if (result.statusLabel === "WORKING" || result.statusLabel === "SMALL_FILE" || result.statusLabel === "MISSING_FILENAME" || result.statusLabel === "MISSING_METADATA" || result.statusLabel === "SIZE_MISMATCH") {
              setSelectedUrls((prev) => new Set(prev).add(result.url));
            }
          } catch (e: any) {
            console.error(`Error checking link ${u}:`, e);
            const errorResult: LinkCheckResult = {
              url: u,
              ok: false,
              statusLabel: "UNKNOWN",
              message: e?.message || "Check failed due to a network or fetch error."
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

      setResults(prev => {
        if (onlyUrls?.length) {
          const keep = prev.filter((r) => !onlyUrls.includes(r.url));
          const merged = [...keep, ...finalResults];
          return merged.map(r => ({
            ...r,
            mismatchWarnings: buildMismatchWarnings(r, merged, languages, qualities),
            confidenceScore: Math.max(0, 100 - (buildMismatchWarnings(r, merged, languages, qualities).length * 18)),
          }));
        }
        return finalResults;
      });

      if (onResults) {
        onResults(finalResults);
      }
    } catch (e: any) {
      setError(e?.message || "Unknown error while checking links.");
    } finally {
      setLoading(false);
    }
  };

  const extractTitleAndYear = (text: string) => {
    let year: number | undefined;
    let title: string | undefined;

    // Detect year - look for 4 digits that start with 19 or 20
    const yearPattern = /(?:\D|^)(19\d{2}|20\d{2})(?:\D|$)/;
    const yearMatch = text.match(yearPattern);

    if (yearMatch) {
      year = parseInt(yearMatch[1], 10);
      const yearIndex = text.indexOf(yearMatch[1]);
      title = text.substring(0, yearIndex).trim();
    } else {
      // No year, look for quality/print/language markers
      const noiseMarkers = [
        '\\d{3,4}p', '[0-9]k', 'web[-.\\s_]?(dl|rip)', 
        'hd[-.\\s_]?rip', 'blu[-.\\s_]?ray', 'bd[-.\\s_]?rip', 
        'br[-.\\s_]?rip', 'hdtc', 'hdcam', 'dvdrip', 'webrip',
        'hq', 'proper', 'repack', 'internal', 'hevc', 'x264', 'x265', 'aac', 'ac3',
        'dual[-.\\s_]?audio', 'multi[-.\\s_]?audio',
        'hindi', 'english', 'tamil', 'telugu', 'malayalam', 'kannada', 'urdu', 'punjabi',
        's\\d+e\\d+', 's\\d+', 'season', 'episode'
      ];
      
      const markerRegex = new RegExp(`\\b(${noiseMarkers.join('|')})\\b`, 'i');
      const markerMatch = text.match(markerRegex);
      
      if (markerMatch) {
        title = text.substring(0, markerMatch.index).trim();
      } else {
        title = text.trim();
      }
    }

    if (title) {
      // Strip extensions and noise
      title = title
        .replace(/\.(mkv|mp4|zip|rar|avi|mov|wmv|flv|ts)$/i, '')
        .replace(/[\[\]\(\)\{\}\.\-_/]/g, ' ') 
        .replace(/\s+/g, ' ')
        .trim();

      // Clean up common prefix noise like "🎬", "*", etc
      title = title.replace(/^[🎬\s\*]+/, '');

      // Capitalize
      title = title.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
      return { title: title || undefined, year };
    }

    return { title: undefined, year };
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

      // Build a descriptive name
      let finalName = quality;
      
      const source = `${r.fileName || ""} ${r.finalUrl || ""}`.toLowerCase();
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

      if (r.codecLabel === "HEVC") finalName += ` HEVC`;
      if (r.audioLabel && r.audioLabel.includes('Dual') && r.codecLabel !== "HEVC") finalName += ' Dual';

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

      if (detectedS !== undefined) linkItem.season = detectedS;
      if (detectedE !== undefined) linkItem.episode = detectedE;
      if (source.includes('.zip')) linkItem.isFullSeasonZIP = true;
      else if (/full season|all episodes|complete/i.test(source) && !detectedE) linkItem.isFullSeasonMKV = true;
      if (source.toLowerCase().includes('sample')) linkItem.isSample = true;

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
           episode?: number;
         }
       }>();
       
       qualityLinks.forEach((ql, idx) => {
         const r = validResults[idx];
         const sourceText = `${r.fileName || ""} ${r.url || ""}`;
         const { title: extractedTitle, year: extractedYear } = extractTitleAndYear(sourceText);
         const year = extractedYear || r.year;
         const title = extractedTitle;
         const derivedTitle = title || `Untitled ${new Date().getFullYear()}`;
         const isSeries = !!(ql.season || ql.episode);
         const key = isSeries ? derivedTitle : `${derivedTitle}|${year || ''}`;
 
         if (!batchesMap.has(key)) {
            batchesMap.set(key, { 
              title: derivedTitle, 
              year, 
              links: [],
              detectMetadata: {
                languages: new Set<string>(),
                subtitles: false,
                type: "movie"
              }
            });
         }
         
         const batch = batchesMap.get(key)!;
         if (!batch.links.some(l => l.url === ql.url)) {
           batch.links.push(ql);
         }
 
         // Update detection per batch (if movie, keep movie, if any link is series, whole batch is series)
         if (ql.season || ql.episode || ql.isFullSeasonMKV || ql.isFullSeasonZIP || /full season|all episodes|complete/i.test(sourceText)) {
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
 
         // Apply detected S/E to batch metadata if not already set (fallback for creation)
         if (ql.season && !batch.detectMetadata.season) batch.detectMetadata.season = ql.season;
         if (ql.episode && !batch.detectMetadata.episode) batch.detectMetadata.episode = ql.episode;
       });

       const itemsToReview = Array.from(batchesMap.entries()).map(([key, b]) => ({
         key,
         title: b.title,
         year: b.year ? String(b.year) : '',
         links: b.links,
         metadata: {
           ...b.detectMetadata,
           languages: Array.from(b.detectMetadata.languages)
         }
       }));

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
      if (r.isFullSeasonMKV || r.isFullSeasonZIP || /full season|all episodes|complete/i.test(source)) {
        isSeriesLink = true;
      }

      // Detect Series vs Movie
      const combinedMatch = source.match(/\bs(\d+)e(\d+)(?![a-z0-9])/i);
      if (combinedMatch) {
         isSeriesLink = true;
        detectedSeason = parseInt(combinedMatch[1]);
        detectedEpisode = parseInt(combinedMatch[2]);
      } else {
        const seriesMatch = source.match(/\b(s(\d+)|season\s*(\d+))(?![a-z0-9])/i);
        if (seriesMatch) {
           isSeriesLink = true;
          detectedSeason = parseInt(seriesMatch[2] || seriesMatch[3]);
          
          const episodeMatch = source.match(/(?:e(\d+)|episode\s*(\d+))(?![a-z0-9])/i);
          if (episodeMatch) {
            detectedEpisode = parseInt(episodeMatch[1] || episodeMatch[2]);
          }
        } else {
           const episodeMatch = source.match(/(?:e(\d+)|episode\s*(\d+))(?![a-z0-9])/i);
           if (episodeMatch && !source.match(/\b(movie|film)\b/i)) {
               isSeriesLink = true;
               detectedEpisode = parseInt(episodeMatch[1] || episodeMatch[2]);
           }
        }
      }
      if (isSeriesLink) seriesCount++;
    });

    if (seriesCount >= 3 || validResults.some(r => r.isFullSeasonMKV || r.isFullSeasonZIP || (r.season === 1 && r.episode === 1) || /full season|all episodes|complete/i.test(`${r.fileName || ""} ${r.finalUrl || ""}`))) {
       detectedType = "series";
    }

    const combinedNames = validResults.map(r => r.fileName || '').join(' ') + ' ' + input;
    const { title: extractedTitle, year: extractedYear } = extractTitleAndYear(combinedNames);
    
    // Fallback to first working result's year if available
    const fallbackYear = validResults.find(r => r.year)?.year;
    const year = extractedYear || fallbackYear;
    const title = extractedTitle;

    if (onAddLinks) {
      onAddLinks(qualityLinks, {
        languages: Array.from(detectedLangs),
        printQuality: detectedPrintQuality,
        subtitles: detectedSubtitles,
        type: detectedType,
        season: detectedSeason,
        episode: detectedEpisode,
        // @ts-ignore
        title,
        // @ts-ignore
        year
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
      if (initialInput) {
        setInput(initialInput);
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
      setMdriveUrl(null);
      setMdriveResults([]);
      setMdriveSelectedIndices(new Set());
      setMoviesdriveSearchUrl(null);
      setMoviesdriveSearchPosts([]);
      setMoviesdriveSelectedIndices(new Set());
      setMoviesdriveSearchQuery("");
      processedExtractionsRef.current = new Set();

      if (autoStart && initialInput && autoStartedInputRef.current !== initialInput) {
        const initialLinks = splitLinks(initialInput).map(normalizeUrl).filter(Boolean);
        if (initialLinks.length > 0) {
          autoStartedInputRef.current = initialInput;
          handleCheck(initialLinks, initialInput);
        }
      }
    } else {
      autoStartedInputRef.current = null;
    }
  }, [isOpen, initialInput, autoStart, disableAutoClipboard]);

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
    setMdriveUrl(null);
    setMdriveResults([]);
    setMdriveSelectedIndices(new Set());
    setMoviesdriveSearchUrl(null);
    setMoviesdriveSearchPosts([]);
    setMoviesdriveSelectedIndices(new Set());
    setMoviesdriveSearchQuery("");
    processedExtractionsRef.current = new Set();
  };

  const retryFailed = () => {
    const failed = results
      .filter((r) => !r.ok || r.statusLabel === "UNKNOWN" || r.statusLabel === "MISSING_FILENAME" || r.statusLabel === "BROKEN" || r.statusLabel === "UNAVAILABLE")
      .map((r) => r.url);
    if (failed.length) handleCheck(failed);
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
    return [...results].sort((a, b) => {
      // Group by type: ZIP, MKV, Episode, Movie
      const typeA = a.isFullSeasonZIP ? 1 : a.isFullSeasonMKV ? 2 : (a.season || a.episode) ? 3 : 4;
      const typeB = b.isFullSeasonZIP ? 1 : b.isFullSeasonMKV ? 2 : (b.season || b.episode) ? 3 : 4;

      if (typeA !== typeB) return typeA - typeB;

      if (typeA === 3) { // Episodes
        if (a.season !== b.season) return (a.season || 0) - (b.season || 0);
        if (a.episode !== b.episode) return (a.episode || 0) - (b.episode || 0);
      }

      // If same type (and same season/episode if applicable), sort by size ascending (smallest to largest)
      return (a.fileSize || 0) - (b.fileSize || 0);
    });
  }, [results]);

  return (
    <AnimatePresence>
      {isOpen ? (
        <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div initial={{ opacity: 0, y: 20, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.98 }} transition={{ duration: 0.18 }} className="w-full max-w-5xl max-h-[95vh] overflow-y-auto custom-scrollbar">
            <div className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 shadow-2xl overflow-hidden transition-colors duration-300">
              <div className="p-5 md:p-6 space-y-5">
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

                {moviesdriveSearchUrl ? (
                  <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-1">
                      <div>
                        <h3 className="text-lg font-bold flex items-center gap-2 text-zinc-900 dark:text-white">
                          <Search className={`w-5 h-5 ${moviesdrivePageInfo.isSkyMovies ? "text-purple-500" : moviesdrivePageInfo.isFilmygo ? "text-emerald-500" : "text-indigo-500"}`} />
                          {moviesdrivePageInfo.isSkyMovies ? "SkyMoviesHD Search Page Contents" : moviesdrivePageInfo.isFilmygo ? "FilmyGo Search Page Contents" : "MoviesDrive Search Page Contents"}
                        </h3>
                        <p className="text-xs text-zinc-500 mt-0.5">
                          Found {moviesdriveSearchPosts.length} contents on this search page. Select the items you want to scrape.
                        </p>
                      </div>
                      <div className="flex gap-2 items-center shrink-0">
                        <button 
                          onClick={() => {
                            if (moviesdrivePageInfo.isSkyMovies) {
                              const visibleIndices = moviesdriveSearchPosts
                                .map((post, originalIndex) => ({ post, originalIndex }))
                                .filter(({ post }) => !moviesdriveSearchQuery || post.title.toLowerCase().includes(moviesdriveSearchQuery.toLowerCase()))
                                .slice(0, skymoviesVisibleLimit)
                                .map(x => x.originalIndex);

                              const allVisibleSelected = visibleIndices.length > 0 && visibleIndices.every(i => moviesdriveSelectedIndices.has(i));
                              if (allVisibleSelected) {
                                setMoviesdriveSelectedIndices(prev => {
                                  const next = new Set(prev);
                                  visibleIndices.forEach(i => next.delete(i));
                                  return next;
                                });
                              } else {
                                setMoviesdriveSelectedIndices(prev => {
                                  const next = new Set(prev);
                                  visibleIndices.forEach(i => next.add(i));
                                  return next;
                                });
                              }
                            } else {
                              if (moviesdriveSelectedIndices.size === moviesdriveSearchPosts.length) {
                                setMoviesdriveSelectedIndices(new Set());
                              } else {
                                setMoviesdriveSelectedIndices(new Set(moviesdriveSearchPosts.map((_, i) => i)));
                              }
                            }
                          }}
                          className={`text-xs font-bold px-3 py-1.5 rounded-xl transition-colors ${
                            moviesdriveSelectedIndices.size > 0
                              ? "text-red-500 hover:text-red-400 bg-red-500/10 border border-red-500/20"
                              : "text-indigo-500 hover:text-indigo-400 bg-indigo-500/10 border border-indigo-500/20"
                          }`}
                        >
                          {moviesdriveSelectedIndices.size > 0 ? "Deselect All" : "Select All"}
                        </button>
                        <button 
                          onClick={() => {
                            processedExtractionsRef.current.add(moviesdriveSearchUrl);
                            setMoviesdriveSearchUrl(null);
                            setMoviesdriveSearchPosts([]);
                            setMoviesdriveSelectedIndices(new Set());
                            setMoviesdriveSearchQuery("");
                          }}
                          className="text-xs font-bold text-zinc-500 hover:text-zinc-400 px-3 py-1.5 bg-zinc-500/10 rounded-xl"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>

                    <div className="relative">
                      <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                      <input
                        type="text"
                        placeholder="Filter contents by name..."
                        value={moviesdriveSearchQuery}
                        onChange={(e) => setMoviesdriveSearchQuery(e.target.value)}
                        className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-10 pr-4 py-2 text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:border-indigo-500 transition"
                      />
                    </div>

                    {/* Pagination Controls - Only for MoviesDrive */}
                    {!moviesdrivePageInfo.isSkyMovies && (
                      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-zinc-50 dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleMoviesdrivePageChange(1)}
                            disabled={moviesdrivePageInfo.page <= 1 || moviesdrivePageLoading}
                            className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 transition flex items-center gap-1"
                            title="First Page"
                          >
                            <ChevronsLeft className="w-3.5 h-3.5" />
                            First
                          </button>
                          <button
                            onClick={() => handleMoviesdrivePageChange(moviesdrivePageInfo.page - 1)}
                            disabled={moviesdrivePageInfo.page <= 1 || moviesdrivePageLoading}
                            className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 transition flex items-center gap-1"
                            title="Previous Page"
                          >
                            <ChevronLeft className="w-3.5 h-3.5" />
                            Prev
                          </button>
                          <span className={`text-xs font-bold px-3 py-1.5 rounded-xl border ${moviesdrivePageInfo.isFilmygo ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-indigo-500/10 text-indigo-500 border-indigo-500/20"}`}>
                            Page {moviesdrivePageInfo.page}
                          </span>
                          <button
                            onClick={() => handleMoviesdrivePageChange(moviesdrivePageInfo.page + 1)}
                            disabled={moviesdrivePageLoading}
                            className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 transition flex items-center gap-1"
                            title="Next Page"
                          >
                            Next
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <form 
                          onSubmit={(e) => {
                            e.preventDefault();
                            const num = parseInt(customPageInput, 10);
                            if (!isNaN(num) && num >= 1) {
                              handleMoviesdrivePageChange(num);
                              setCustomPageInput("");
                            }
                          }}
                          className="flex items-center gap-2"
                        >
                          <span className="text-xs text-zinc-500 font-medium">Custom Page:</span>
                          <input
                            type="number"
                            min={1}
                            placeholder="#"
                            value={customPageInput}
                            onChange={(e) => setCustomPageInput(e.target.value)}
                            className="w-16 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-2 py-1 text-xs text-center font-bold text-zinc-900 dark:text-zinc-100 outline-none focus:border-indigo-500"
                          />
                          <button
                            type="submit"
                            disabled={!customPageInput || moviesdrivePageLoading}
                            className="px-3 py-1 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40 transition"
                          >
                            Go
                          </button>
                        </form>
                      </div>
                    )}

                    {moviesdrivePageLoading ? (
                      <div className="py-16 flex flex-col items-center justify-center gap-3">
                        <LoaderIcon className="w-8 h-8 text-indigo-500 animate-spin" />
                        <p className="text-sm font-medium text-zinc-500">Loading Page {moviesdrivePageInfo.page}...</p>
                      </div>
                    ) : (
                      (() => {
                        const filteredPosts = moviesdriveSearchPosts
                          .map((post, originalIndex) => ({ post, originalIndex }))
                          .filter(({ post }) => 
                            !moviesdriveSearchQuery || 
                            post.title.toLowerCase().includes(moviesdriveSearchQuery.toLowerCase())
                          );

                        const displayedPosts = moviesdrivePageInfo.isSkyMovies
                          ? filteredPosts.slice(0, skymoviesVisibleLimit)
                          : filteredPosts;

                        return (
                          <div className="flex flex-col gap-3">
                            <div className="grid gap-2 max-h-[50vh] overflow-y-auto custom-scrollbar pr-2">
                              {displayedPosts.map(({ post, originalIndex }) => {
                                const isSelected = moviesdriveSelectedIndices.has(originalIndex);
                                return (
                                  <div 
                                    key={originalIndex}
                                    onClick={() => {
                                      setMoviesdriveSelectedIndices(prev => {
                                        const next = new Set(prev);
                                        if (next.has(originalIndex)) next.delete(originalIndex);
                                        else next.add(originalIndex);
                                        return next;
                                      });
                                    }}
                                    className={`group p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-4 ${
                                      isSelected 
                                        ? 'bg-indigo-500/10 border-indigo-500/40 shadow-sm' 
                                        : 'bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'
                                    }`}
                                  >
                                    <div className="flex items-center gap-3 min-w-0">
                                      <input 
                                        type="checkbox" 
                                        checked={isSelected}
                                        onChange={() => {}}
                                        className="w-4 h-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500 shrink-0 pointer-events-none"
                                      />
                                      {post.image ? (
                                        <img 
                                          src={post.image} 
                                          alt="" 
                                          className="w-10 h-14 object-cover rounded-lg shrink-0 border border-zinc-200 dark:border-zinc-800 bg-zinc-800 shadow-sm"
                                          onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }}
                                        />
                                      ) : (
                                        <div className="w-10 h-14 bg-zinc-200 dark:bg-zinc-800 rounded-lg shrink-0 flex items-center justify-center border border-zinc-300 dark:border-zinc-700">
                                          <Film className="w-5 h-5 text-zinc-400" />
                                        </div>
                                      )}
                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-1.5 mb-1">
                                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                                            #{originalIndex + 1}
                                          </span>
                                        </div>
                                        <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 leading-snug break-words">
                                          {post.title}
                                        </h4>
                                      </div>
                                    </div>

                                    <div className="shrink-0 flex items-center gap-2">
                                      <a 
                                        href={post.url} 
                                        target="_blank" 
                                        rel="noreferrer" 
                                        onClick={(e) => e.stopPropagation()}
                                        className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition"
                                        title="Open post in new tab"
                                      >
                                        <ExternalLink className="w-4 h-4" />
                                      </a>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>

                            {moviesdrivePageInfo.isSkyMovies && skymoviesVisibleLimit < filteredPosts.length && (
                              <div className="pt-2 flex justify-center">
                                <button
                                  type="button"
                                  onClick={() => setSkymoviesVisibleLimit(prev => prev + 50)}
                                  className="px-6 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-md shadow-purple-600/20 transition flex items-center gap-2"
                                >
                                  <ChevronDown className="w-4 h-4" />
                                  Load More (50) — Showing {displayedPosts.length} of {filteredPosts.length}
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })()
                    )}

                    <div className="flex items-center justify-between pt-4 border-t border-zinc-200 dark:border-zinc-800">
                      <span className="text-xs text-zinc-500 font-medium">
                        {moviesdriveSelectedIndices.size} of {moviesdriveSearchPosts.length} selected
                      </span>
                      <div className="flex gap-2.5">
                        <button 
                          onClick={() => {
                            setMoviesdriveSearchUrl(null);
                            setMoviesdriveSearchPosts([]);
                            setMoviesdriveSelectedIndices(new Set());
                            setMoviesdriveSearchQuery("");
                          }}
                          className="px-4 py-2 rounded-xl text-xs font-bold text-zinc-500 hover:text-zinc-700 dark:hover:text-white transition-colors bg-zinc-100 dark:bg-zinc-800"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={confirmMoviesdriveSearchSelection}
                          disabled={moviesdriveSelectedIndices.size === 0}
                          className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-md shadow-indigo-600/20"
                        >
                          <Download className="w-4 h-4" />
                          Scrape Selected ({moviesdriveSelectedIndices.size})
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
                      <div className="grid gap-2 max-h-[50vh] overflow-y-auto custom-scrollbar pr-2">
                        {mdriveResults.map((item, i) => (
                          <div 
                            key={i}
                            className={`group p-4 rounded-2xl border transition-all cursor-pointer flex items-center gap-4 ${
                              mdriveSelectedIndices.has(i) 
                                ? 'bg-cyan-500/5 border-cyan-500/30' 
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
                            <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 transition-all ${
                              mdriveSelectedIndices.has(i)
                                ? 'bg-cyan-500 border-cyan-500'
                                : 'border-zinc-300 dark:border-zinc-700'
                            }`}>
                              {mdriveSelectedIndices.has(i) && <CheckCircle2 className="w-4 h-4 text-white" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <h4 className="text-sm font-bold truncate text-zinc-900 dark:text-white flex-1">
                                  {item.file_name || 'HubCloud Link'}
                                </h4>
                              </div>
                              <p className="text-[10px] text-zinc-500 flex items-center gap-2 mt-1 truncate">
                                <LinkIcon className="w-3 h-3" />
                                {item.url}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              {(item.size || item.file_size) ? (
                                <span className="text-[10px] font-mono bg-cyan-500/20 px-2 py-1 rounded text-cyan-500 uppercase border border-cyan-500/20">
                                  {item.size || item.file_size}
                                </span>
                              ) : (
                                <span className="text-[10px] font-mono bg-zinc-200 dark:bg-zinc-800 px-2 py-1 rounded text-zinc-400 uppercase italic">
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
                                  className="p-2 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 rounded-xl text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-all disabled:opacity-50"
                                  title="Extract Direct Drive Link"
                                >
                                  {mdriveExtractingDirect[i] ? <LoaderIcon className="w-4 h-4 animate-spin text-cyan-500" /> : <ExternalLink className="w-4 h-4" />}
                                </button>
                              )}
                              {item.is_direct && (
                                <div className="p-2 bg-cyan-500/20 rounded-xl text-cyan-500" title="Direct Drive Link Extracted">
                                  <CheckCircle2 className="w-4 h-4" />
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
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
                        disabled={mdriveSelectedIndices.size === 0}
                        className="bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 text-white px-8 py-2.5 rounded-2xl font-bold flex items-center gap-2 transition-all shadow-lg shadow-cyan-500/20"
                      >
                        Add {mdriveSelectedIndices.size} Extracted Links
                      </button>
                    </div>
                  </div>
                ) : isReviewingBatch ? (
                  <div className="space-y-6">
                    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-4 space-y-4 max-h-[60vh] overflow-y-auto custom-scrollbar">
                      {batchReviewItems.map((item) => (
                        <div key={item.key} className="flex flex-col md:flex-row gap-6 p-5 rounded-2xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 shadow-sm transition-all hover:bg-zinc-100/50 dark:hover:bg-zinc-900/80">
                          <div className="flex-1 space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                              <div className="md:col-span-9">
                                <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400 mb-1.5 block">Content Title</label>
                                <input 
                                  type="text" 
                                  value={item.title} 
                                  onChange={(e) => updateBatchReviewItem(item.key, 'title', e.target.value)}
                                  className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm font-medium outline-none focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-500 shadow-sm transition-all"
                                  placeholder="Enter title..."
                                />
                              </div>
                              <div className="md:col-span-3">
                                <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400 mb-1.5 block">Release Year</label>
                                <div className="relative">
                                  <input 
                                    type="text" 
                                    value={item.year} 
                                    onChange={(e) => updateBatchReviewItem(item.key, 'year', e.target.value.replace(/\D/g, ''))}
                                    className={`w-full bg-white dark:bg-zinc-950 border ${!item.year ? 'border-red-500/50 focus:ring-red-500/20' : 'border-zinc-200 dark:border-zinc-800 focus:ring-cyan-500/20'} rounded-xl px-4 py-2.5 text-sm font-mono outline-none focus:ring-2 transition-all`}
                                    placeholder="YYYY"
                                    maxLength={4}
                                  />
                                  {!item.year && (
                                    <div className="absolute -bottom-5 left-0">
                                      <p className="text-[10px] font-medium text-red-500 flex items-center gap-1">
                                        <AlertTriangle className="h-2.5 w-2.5" /> Year required
                                      </p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center justify-between mb-2">
                              <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400 block">Detected Metadata & Flags</label>
                              <button 
                                onClick={() => setBatchReviewItems(prev => prev.filter(i => i.key !== item.key))}
                                className="p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all group"
                                title="Remove Item"
                              >
                                <Trash2 className="h-4 w-4 group-hover:scale-110 transition-transform" />
                              </button>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${item.metadata.type === 'series' ? 'bg-indigo-500/15 text-indigo-500 border-indigo-500/30' : 'bg-blue-500/15 text-blue-500 border-blue-500/30'}`}>
                                {item.metadata.type}
                              </span>
                              {item.metadata.languages.map((l) => (
                                <span key={l} className="inline-flex items-center rounded-full border bg-emerald-500/15 text-emerald-500 border-emerald-500/30 px-2.5 py-1 text-[10px] font-semibold">
                                  {l}
                                </span>
                              ))}
                              {item.metadata.printQuality && (
                                <span className="inline-flex items-center rounded-full border bg-fuchsia-500/15 text-fuchsia-500 border-fuchsia-500/30 px-2.5 py-1 text-[10px] font-semibold">
                                  {item.metadata.printQuality}
                                </span>
                              )}
                              {item.metadata.subtitles && (
                                <span className="inline-flex items-center rounded-full border bg-amber-500/15 text-amber-500 border-amber-500/30 px-2.5 py-1 text-[10px] font-semibold uppercase">
                                  Subs
                                </span>
                              )}
                              <span className="inline-flex items-center rounded-full border bg-zinc-500/10 text-zinc-500 border-zinc-500/20 px-2.5 py-1 text-[10px] font-medium">
                                {item.links.length} Source{item.links.length > 1 ? 's' : ''}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                      {batchReviewItems.length === 0 && (
                        <div className="py-12 text-center text-zinc-500">No items to save.</div>
                      )}
                    </div>
                    
                    <div className="flex gap-3 justify-end pt-2">
                      <button 
                        onClick={() => setIsReviewingBatch(false)}
                        className="px-6 py-2.5 rounded-2xl border border-zinc-200 dark:border-zinc-800 text-sm font-bold hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all"
                      >
                        Back to Results
                      </button>
                      <button 
                        onClick={confirmBatchReview}
                        disabled={batchReviewItems.length === 0}
                        className="px-8 py-2.5 rounded-2xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 disabled:opacity-50 transition-all shadow-lg shadow-emerald-500/20"
                      >
                        Save Drafts ({batchReviewItems.length})
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/60 p-4 space-y-3 transition-colors duration-300">
                  <label className="text-sm font-medium text-zinc-700 dark:text-zinc-200">Paste one or multiple links / full movie post</label>
                  <textarea ref={textareaRef} value={input} onChange={(e) => setInput(e.target.value)} placeholder="Paste links or a full movie post here..." rows={6} className="w-full rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-4 py-3 text-sm text-zinc-900 dark:text-white placeholder:text-zinc-500 outline-none focus:ring-2 focus:ring-cyan-500 transition-colors duration-300" />

                  {!disableAutoClipboard && (
                    <div className="flex flex-col gap-2">
                      <label className="inline-flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={autoClipboard}
                          onChange={(e) => setAutoClipboard(e.target.checked)}
                          className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-cyan-500 focus:ring-cyan-500"
                        />
                        Auto-detect and paste links from clipboard (Every 3s)
                      </label>
                      {autoClipboard && (
                        <div className="text-xs pl-6 transition-all duration-300">
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
                      placeholder="Search title or leave empty for Home page (new6.moviesdrives.my)..."
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
                      placeholder="Search title or leave empty for Home page (skymovieshd.ceo)..."
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
                      placeholder="Search title or leave empty for Home page (filmygo.online)..."
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
                      }
                    }} 
                    className="inline-flex items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 px-3.5 py-1.5 text-xs font-bold text-emerald-500 dark:text-emerald-400 gap-1.5 transition-colors shadow-sm"
                    title="Toggle FilmyGo search bar or search text"
                  >
                    <Search className="h-3.5 w-3.5" /> Search FilmyGo
                  </button>
                  <button onClick={retryFailed} className="inline-flex items-center justify-center rounded-xl border border-zinc-200 dark:border-zinc-800 bg-transparent px-3.5 py-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 gap-1.5 disabled:opacity-50 transition-colors" disabled={loading || !results.some((r) => !r.ok || r.statusLabel === "UNKNOWN" || r.statusLabel === "MISSING_FILENAME" || r.statusLabel === "BROKEN" || r.statusLabel === "UNAVAILABLE")}><RefreshCw className="h-3.5 w-3.5" /> Retry Failed</button>
                  <button onClick={copyResults} className="inline-flex items-center justify-center rounded-xl border border-zinc-200 dark:border-zinc-800 bg-transparent px-3.5 py-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 gap-1.5 disabled:opacity-50 transition-colors" disabled={!results.length}><Copy className="h-3.5 w-3.5" /> Copy Results</button>
                  <button onClick={reset} className="inline-flex items-center justify-center rounded-xl border border-zinc-200 dark:border-zinc-800 bg-transparent px-3.5 py-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 gap-1.5 transition-colors"><Trash2 className="h-3.5 w-3.5" /> Reset</button>
                  
                  {!!results.length && (
                    <button onClick={toggleSelectAll} className="inline-flex items-center justify-center rounded-xl border border-zinc-200 dark:border-zinc-800 bg-transparent px-3.5 py-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 gap-1.5 transition-colors">
                      {selectedUrls.size === results.length ? "Deselect All" : "Select All"}
                    </button>
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

                <div className="space-y-3 max-h-[500px] overflow-auto pr-1">
                  {sortedResults.map((result) => {
                    const statusLabel = result.statusLabel || (result.ok ? "WORKING" : "UNKNOWN");
                    const openRow = !!expanded[result.url];
                    
                    // Calculate final name for display
                    let finalName = result.qualityLabel || '720p';
                    if (result.codecLabel === "HEVC") finalName += " HEVC";
                    if (result.audioLabel && result.audioLabel.includes("Dual") && result.codecLabel !== "HEVC") finalName += " Dual";

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
                                  {result.ok && (
                                    <div className="inline-flex rounded-full border border-cyan-200 dark:border-cyan-800 bg-cyan-500/10 px-3 py-1 text-xs font-bold text-cyan-600 dark:text-cyan-400">
                                      Name: {finalName}
                                    </div>
                                  )}
                                  {result.isDirectDownload ? <div className="inline-flex rounded-full border border-blue-200 dark:border-blue-800 bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-600 dark:text-blue-400"><FileDown className="h-3.5 w-3.5 mr-1" /> Direct Download</div> : null}
                                  {(result.mismatchWarnings?.length || 0) > 0 ? <div className="inline-flex rounded-full border border-pink-200 dark:border-pink-800 bg-pink-500/10 px-3 py-1 text-xs font-medium text-pink-600 dark:text-pink-400"><Siren className="h-3.5 w-3.5 mr-1" /> Mismatch</div> : null}
                                </div>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {result.qualityLabel ? <span className="rounded-full border border-fuchsia-200 dark:border-fuchsia-800 bg-fuchsia-500/10 px-2.5 py-1 text-[11px] font-medium text-fuchsia-600 dark:text-fuchsia-300">{result.qualityLabel}</span> : null}
                                  {result.printQualityLabel ? <span className="rounded-full border border-rose-200 dark:border-rose-800 bg-rose-500/10 px-2.5 py-1 text-[11px] font-medium text-rose-600 dark:text-rose-300">{result.printQualityLabel}</span> : null}
                                  {result.codecLabel ? <span className="rounded-full border border-indigo-200 dark:border-indigo-800 bg-indigo-500/10 px-2.5 py-1 text-[11px] font-medium text-indigo-600 dark:text-indigo-300">{result.codecLabel}</span> : null}
                                  {result.audioLabel ? <span className="rounded-full border border-emerald-200 dark:border-emerald-800 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-300">{result.audioLabel}</span> : null}
                                  {result.subtitleLabel ? <span className="rounded-full border border-amber-200 dark:border-amber-800 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-600 dark:text-amber-300">{result.subtitleLabel}</span> : null}
                                  {result.season ? <span className="rounded-full border border-blue-200 dark:border-blue-800 bg-blue-500/10 px-2.5 py-1 text-[11px] font-bold text-blue-600 dark:text-blue-300">Season {result.season}</span> : null}
                                  {result.episode ? <span className="rounded-full border border-indigo-200 dark:border-indigo-800 bg-indigo-500/10 px-2.5 py-1 text-[11px] font-bold text-indigo-600 dark:text-indigo-300">Episode {result.episode}</span> : null}
                                  {result.isFullSeasonMKV ? <span className="rounded-full border border-purple-200 dark:border-purple-800 bg-purple-500/10 px-2.5 py-1 text-[11px] font-bold text-purple-600 dark:text-purple-300">Full Season MKV</span> : null}
                                  {result.isFullSeasonZIP ? <span className="rounded-full border border-purple-200 dark:border-purple-800 bg-purple-500/10 px-2.5 py-1 text-[11px] font-bold text-purple-600 dark:text-purple-300">Full Season ZIP</span> : null}
                                </div>
                                {result.candidates && result.candidates.length > 0 && (
                                  <div className="mt-2 flex flex-wrap gap-2 items-center">
                                    <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 mr-1 flex items-center gap-1.5"><Server className="h-3.5 w-3.5" /> Downloads:</span>
                                    {result.candidates.map((cand, idx) => {
                                      // Improve text (e.g. from "[fslv2 server]" or "download [fsl server]")
                                      let name = cand.text.replace(/download/i, '').replace(/\[|\]/g, '').trim();
                                      if (!name) return null;
                                      return (
                                        <span key={idx} className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-200/50 dark:bg-zinc-800/50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-300">
                                          {name}
                                        </span>
                                      );
                                    })}
                                  </div>
                                )}
                                <div className="mt-2 break-all text-sm text-zinc-700 dark:text-zinc-200">{result.url}</div>
                                {result.finalUrl && result.finalUrl !== result.url && (
                                  <div className="mt-1 break-all text-xs text-zinc-500 dark:text-zinc-400">Redirects to: {result.finalUrl}</div>
                                )}
                                <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">{result.message || (result.ok ? "The link is reachable." : "The link could not be verified.")}</p>
                              </div>
                            </div>
                            <div className="flex gap-2 self-start">
                              {(!result.ok || result.statusLabel === "UNKNOWN" || result.statusLabel === "MISSING_FILENAME" || result.statusLabel === "BROKEN" || result.statusLabel === "UNAVAILABLE") && (
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
                  })}
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
};

