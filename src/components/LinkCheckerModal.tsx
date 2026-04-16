import React, { useMemo, useState, useEffect } from "react";
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
  Siren,
  Plus,
  X
} from "lucide-react";
import { QualityLinks, Language, Quality } from '../types';
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
  onAddLinks?: (
    links: QualityLinks,
    metadata?: {
      languages: string[];
      printQuality?: string;
      subtitles?: boolean;
      type?: "movie" | "series";
      season?: number;
      episode?: number;
    }
  ) => void;
  onResults?: (results: LinkCheckResult[]) => void;
  languages?: Language[];
  qualities?: Quality[];
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
  onAddLinks,
  onResults,
  languages = [],
  qualities = [],
}) => {
  const [input, setInput] = useState(initialInput);
  const [autoExtract, setAutoExtract] = useState(true);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<LinkCheckResult[]>([]);
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useModalBehavior(isOpen, onClose);

  // Update input when initialInput changes
  React.useEffect(() => {
    if (initialInput) {
      setInput(initialInput);
    }
  }, [initialInput]);

  // Auto-start check if requested
  React.useEffect(() => {
    if (isOpen && autoStart && initialInput && results.length === 0 && !loading) {
      handleCheck();
    }
  }, [isOpen, autoStart, initialInput]);

  // Auto-paste from clipboard when modal opens
  // Removed automatic paste
  
  // Auto-paste from clipboard when window gains focus
  // Removed automatic paste
  
  // Periodic clipboard check while modal is open
  // Removed periodic check

  const links = useMemo(() => {
    if (!autoExtract) {
      return input.split(/\r?\n/).map((s) => normalizeUrl(s)).filter(Boolean);
    }
    return splitLinks(input).map(normalizeUrl).filter(Boolean);
  }, [input, autoExtract]);

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

  const handleCheck = async (onlyUrls?: string[]) => {
    const urls = (onlyUrls || links).filter(Boolean);
    setError(null);

    if (!urls.length) {
      setError("Please paste at least one valid link first.");
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
        if (queue.length === 0) return;
        
        activeCount++;
        const u = queue.shift()!;
        
        try {
          const result = await performFullLinkScan(u, extractedMeta, languages, qualities);

          allResults.push(result);
          completedCount++;

          if (result.statusLabel === "WORKING" || result.statusLabel === "SMALL_FILE" || result.statusLabel === "MISSING_FILENAME" || result.statusLabel === "MISSING_METADATA" || result.statusLabel === "SIZE_MISMATCH") {
            setSelectedUrls((prev) => new Set(prev).add(result.url));
          }

          // Update results incrementally for better UX
          setResults((prev) => {
            let merged: LinkCheckResult[];
            if (onlyUrls?.length) {
              const keep = prev.filter((r) => !onlyUrls.includes(r.url));
              merged = [...keep, ...allResults];
            } else {
              merged = [...allResults];
            }
            // Skip mismatchWarnings calculation during incremental updates to improve performance
            return merged;
          });
        } catch (e) {
          console.error(`Error checking link ${u}:`, e);
        } finally {
          activeCount--;
          await processNext();
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

  const handleAddLinks = () => {
    if (!onAddLinks || results.length === 0) return;
    
    const validResults = results.filter(r => selectedUrls.has(r.url));
    if (validResults.length === 0) return;

    // Collect metadata to pass back
    const detectedLangs = new Set<string>();
    let detectedPrintQuality: string | undefined;
    let detectedSubtitles = false;
    let detectedType: "movie" | "series" = "movie";
    let detectedSeason: number | undefined;
    let detectedEpisode: number | undefined;

    validResults.forEach(r => {
      const source = `${r.fileName || ""} ${r.finalUrl || ""} ${input}`.toLowerCase();
      
      if (r.audioLabel) {
        r.audioLabel.split(" / ").forEach(l => detectedLangs.add(l));
      }
      if (r.printQualityLabel && !detectedPrintQuality) {
        detectedPrintQuality = r.printQualityLabel;
      }
      if (r.subtitleLabel || /subtitles|subs|softsub|hardsub|esub|esubs|msub|msubs/i.test(source)) {
        detectedSubtitles = true;
      }

      // Detect Series vs Movie
      const combinedMatch = source.match(/\bs(\d+)e(\d+)(?![a-z0-9])/i);
      if (combinedMatch) {
        detectedType = "series";
        detectedSeason = parseInt(combinedMatch[1]);
        detectedEpisode = parseInt(combinedMatch[2]);
      } else {
        const seriesMatch = source.match(/\b(s(\d+)|season\s*(\d+))(?![a-z0-9])/i);
        if (seriesMatch) {
          detectedType = "series";
          detectedSeason = parseInt(seriesMatch[2] || seriesMatch[3]);
          
          const episodeMatch = source.match(/(?:e(\d+)|episode\s*(\d+))(?![a-z0-9])/i);
          if (episodeMatch) {
            detectedEpisode = parseInt(episodeMatch[1] || episodeMatch[2]);
          }
        }
      }
    });

    const qualityLinks: QualityLinks = validResults.map(r => {
      // Use detected quality or fallback
      const quality = r.qualityLabel || '720p';

      // Build a descriptive name
      let finalName = quality;
      
      if (r.codecLabel === "HEVC") finalName += ` HEVC`;
      if (r.audioLabel && r.audioLabel.includes('Dual') && r.codecLabel !== "HEVC") finalName += ' Dual';

      // Determine size and unit
      let sizeStr = '';
      let unit: 'MB' | 'GB' = 'MB';
      
      if (r.fileSize) {
        const sizeMB = r.fileSize / (1000 * 1000);
        if (sizeMB >= 1000) {
          sizeStr = (sizeMB / 1000).toFixed(2);
          unit = 'GB';
        } else {
          sizeStr = sizeMB.toFixed(2).replace(/\.00$/, '');
          unit = 'MB';
        }
      }

      return {
        id: Math.random().toString(36).substr(2, 9),
        name: finalName,
        url: normalizeUrl(r.finalUrl || r.url),
        size: sizeStr,
        unit: unit,
        season: r.season,
        episode: r.episode,
        isFullSeasonMKV: r.isFullSeasonMKV,
        isFullSeasonZIP: r.isFullSeasonZIP,
      };
    });
    
    onAddLinks(qualityLinks, {
      languages: Array.from(detectedLangs),
      printQuality: detectedPrintQuality,
      subtitles: detectedSubtitles,
      type: detectedType,
      season: detectedSeason,
      episode: detectedEpisode,
    });
    reset();
    onClose();
  };

  const pasteFromClipboard = async (isAuto = false) => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) return;

      const newLinks = splitLinks(text).map(normalizeUrl).filter(Boolean);
      if (newLinks.length === 0) return;

      let addedAny = false;
      const newlyAddedUrls: string[] = [];

      setInput((prev) => {
        const existingLinks = splitLinks(prev).map(normalizeUrl).filter(Boolean);
        const uniqueNewLinks = newLinks.filter(l => !existingLinks.includes(l));
        
        if (uniqueNewLinks.length === 0) return prev;
        
        addedAny = true;
        newlyAddedUrls.push(...uniqueNewLinks);
        const separator = prev.trim() ? '\n' : '';
        return prev + separator + uniqueNewLinks.join('\n');
      });

      if (addedAny && isAuto && results.length > 0 && !loading) {
        // Automatically check the newly added links if we already have results
        handleCheck(newlyAddedUrls);
      }
      
      if (!isAuto) setError(null);
    } catch (e) {
      if (!isAuto) setError("Clipboard access denied. Please paste manually.");
    }
  };

  useEffect(() => {
    if (isOpen) {
      pasteFromClipboard(true);
    }
  }, [isOpen]);

  const reset = () => {
    setInput("");
    setResults([]);
    setSelectedUrls(new Set());
    setError(null);
    setExpanded({});
  };

  const retryFailed = () => {
    const failed = results.filter((r) => !r.ok).map((r) => r.url);
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
                      <h2 className="text-xl font-semibold leading-none text-zinc-900 dark:text-white">{title}</h2>
                      <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Check Pixeldrain, direct file links, protected download gateways, and movie post mismatches.</p>
                    </div>
                  </div>
                  <button onClick={onClose} className="rounded-full px-3 py-1.5 text-sm text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-white transition">Close</button>
                </div>

                <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/60 p-4 space-y-3 transition-colors duration-300">
                  <label className="text-sm font-medium text-zinc-700 dark:text-zinc-200">Paste one or multiple links / full movie post</label>
                  <textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder="Paste links or a full movie post here..." rows={6} className="w-full rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-4 py-3 text-sm text-zinc-900 dark:text-white placeholder:text-zinc-500 outline-none focus:ring-2 focus:ring-cyan-500 transition-colors duration-300" />

                  <div className="flex flex-wrap items-center gap-3">
                    <label className="inline-flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
                      <input type="checkbox" checked={autoExtract} onChange={(e) => setAutoExtract(e.target.checked)} className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950" />
                      Auto extract links from full post/message
                    </label>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => pasteFromClipboard(false)} className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-8 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 gap-2 transition-colors w-32"><ClipboardPaste className="h-4 w-4" />Paste</button>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-zinc-500 dark:text-zinc-400">
                    <span>Detected type: <strong className="text-zinc-900 dark:text-zinc-200">{firstType}</strong> • <strong className="text-zinc-900 dark:text-zinc-200">{links.length}</strong> link(s) found</span>
                    <span className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400"><ShieldCheck className="h-4 w-4" />Checks only when manually used</span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button onClick={() => handleCheck()} disabled={loading} className="inline-flex items-center justify-center rounded-2xl gap-2 bg-cyan-500 px-4 py-2 text-sm font-bold text-white hover:bg-cyan-600 dark:hover:bg-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}{loading ? "Checking..." : `Check ${links.length || ""} Link${links.length > 1 ? "s" : ""}`}</button>
                  <button onClick={retryFailed} className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-transparent px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 gap-2 disabled:opacity-50 transition-colors" disabled={loading || !results.some((r) => !r.ok)}><RefreshCw className="h-4 w-4" /> Retry Failed</button>
                  <button onClick={copyResults} className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-transparent px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 gap-2 disabled:opacity-50 transition-colors" disabled={!results.length}><Copy className="h-4 w-4" /> Copy Results</button>
                  <button onClick={reset} className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-transparent px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 gap-2 transition-colors"><Trash2 className="h-4 w-4" /> Reset</button>
                  
                  {!!results.length && (
                    <button onClick={toggleSelectAll} className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-transparent px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 gap-2 transition-colors">
                      {selectedUrls.size === results.length ? "Deselect All" : "Select All"}
                    </button>
                  )}

                  {onAddLinks && selectedUrls.size > 0 && !loading && (
                    <button onClick={handleAddLinks} className="inline-flex items-center justify-center rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white dark:text-black hover:bg-emerald-700 gap-2 ml-auto transition-colors">
                      <Plus className="h-4 w-4" />
                      Add {selectedUrls.size} Link(s)
                    </button>
                  )}
                </div>

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
                                <div className="mt-2 break-all text-sm text-zinc-700 dark:text-zinc-200">{result.url}</div>
                                {result.finalUrl && result.finalUrl !== result.url && (
                                  <div className="mt-1 break-all text-xs text-zinc-500 dark:text-zinc-400">Redirects to: {result.finalUrl}</div>
                                )}
                                <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">{result.message || (result.ok ? "The link is reachable." : "The link could not be verified.")}</p>
                              </div>
                            </div>
                            <button onClick={() => toggleExpand(result.url)} className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-transparent px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 gap-2 self-start transition-colors">Details {openRow ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button>
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

