import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Sparkles,
  ArrowUpRight,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Film,
  Tv,
  Check,
  ExternalLink,
  Layers,
  PlusCircle,
} from 'lucide-react';
import { useModalBehavior } from '../hooks/useModalBehavior';
import { useHaptics } from '../hooks/useHaptics';
import { useAdminContent } from '../contexts/AdminContentContext';
import { Content, Language, Quality, QualityLinks, Season, Episode, LinkDef } from '../types';
import { ScrapedLinkItem } from './LinkCheckerModal';
import { runWaterfallLinkSearch } from '../utils/bulkImporterWaterfall';
import {
  applyPreferencesToContent,
  getBatchMediaPreferences,
  VerifiedTmdbMetadata,
} from '../services/tmdbEnricher';
import { isEpisodeRange } from '../utils/linkScanner';
import { extractTitleAndYear } from '../utils/titleMatcher';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  qualities: Quality[];
  languages: Language[];
}

interface UpgradeCandidate {
  content: Content;
  currentQualityText: string;
  isLowPrint: boolean;
  status: 'pending' | 'checking' | 'upgradable' | 'up_to_date' | 'error';
  upgradedLinks?: QualityLinks;
  upgradedQualityName?: string;
  discoveredItems?: ScrapedLinkItem[];
  source?: string;
  tmdbData?: VerifiedTmdbMetadata;
  sampleUrl?: string;
  cleanTitle?: string;
}

export const QualityUpgradeAlertsModal: React.FC<Props> = ({
  isOpen,
  onClose,
  qualities,
  languages,
}) => {
  const { contentList, updateContentFields, saveContent, genres } = useAdminContent();
  const { vibrate } = useHaptics();

  const [filterMode, setFilterMode] = useState<'low' | 'all'>('low');
  const [candidates, setCandidates] = useState<UpgradeCandidate[]>([]);
  const [isScanningAll, setIsScanningAll] = useState<boolean>(false);
  const [upgradedIds, setUpgradedIds] = useState<Set<string>>(new Set());
  const abortControllerRef = useRef<AbortController | null>(null);

  useModalBehavior(isOpen, () => {
    if (!isScanningAll) onClose();
  });

  const isLowPrintMarker = (text: string): boolean => {
    if (!text || typeof text !== 'string') return false;
    const s = text.toLowerCase();
    return (
      /\b(hd-?cam|cam-?rip|cam|predvd|pre-dvd|telesync|hdts|ts|hdtc|tc|line\s*audio|hall\s*audio)\b/i.test(s) ||
      s.includes('telesync') ||
      s.includes('predvd') ||
      s.includes('pre-dvd') ||
      s.includes('hdcam') ||
      s.includes('hdts') ||
      s.includes('line audio') ||
      s.includes('hall audio')
    );
  };

  const isHdPrintMarker = (text: string): boolean => {
    if (!text || typeof text !== 'string') return false;
    const s = text.toLowerCase();
    const isHd =
      s.includes('web-dl') ||
      s.includes('webdl') ||
      s.includes('hdrip') ||
      s.includes('bluray') ||
      s.includes('blu-ray') ||
      s.includes('webrip') ||
      s.includes('brrip') ||
      s.includes('1080p') ||
      s.includes('2160p') ||
      s.includes('4k') ||
      s.includes('720p') ||
      s.includes('hd');
    return isHd && !isLowPrintMarker(s);
  };

  // Detect low quality or all items in library on open / filter change
  useEffect(() => {
    if (isOpen) {
      const items: UpgradeCandidate[] = [];
      contentList.forEach((c) => {
        const qualityObj = qualities.find((q) => q.id === c.qualityId);
        const qName = qualityObj?.name || '';
        let low = isLowPrintMarker(qName) || isLowPrintMarker(c.title || '') || isLowPrintMarker(c.secondTitle || '');

        if (!low && c.movieLinks) {
          try {
            let parsed: any[] = [];
            if (Array.isArray(c.movieLinks)) {
              parsed = c.movieLinks;
            } else if (typeof c.movieLinks === 'string' && c.movieLinks.trim().startsWith('[')) {
              parsed = JSON.parse(c.movieLinks);
            }
            if (Array.isArray(parsed) && parsed.some((l: any) => isLowPrintMarker(l.name || l.quality || l.url || ''))) {
              low = true;
            }
          } catch (e) {}
        }

        if (filterMode === 'all' || low) {
          items.push({
            content: c,
            currentQualityText: qName || (low ? 'CAM/PreDVD Print' : 'Standard'),
            isLowPrint: low,
            status: 'pending',
          });
        }
      });

      setCandidates(items);
    }
  }, [isOpen, contentList, qualities, filterMode]);

  const checkUpgradeForItem = async (candidate: UpgradeCandidate, signal: AbortSignal) => {
    const { content } = candidate;
    setCandidates((prev) =>
      prev.map((c) => (c.content.id === content.id ? { ...c, status: 'checking' } : c))
    );

    const yearNum = content.year ? parseInt(content.year.toString(), 10) : undefined;

    try {
      // Execute 5-tier waterfall scanner from LinkChecker / Bulk Importer engine
      const searchRes = await runWaterfallLinkSearch({
        title: content.title,
        year: yearNum,
        type: content.type === 'series' ? 'series' : 'movie',
        languages,
        qualities,
        signal,
      });

      if (signal.aborted) return;

      if (searchRes.qualityLinks && searchRes.qualityLinks.length > 0) {
        let suggestedQuality = searchRes.metadata?.printQuality || '1080p / 720p WEB-DL (Digital HD)';
        const cleanTitleResolved =
          searchRes.tmdbData?.title ||
          searchRes.metadata?.title ||
          extractTitleAndYear(content.title).title;

        setCandidates((prev) =>
          prev.map((c) =>
            c.content.id === content.id
              ? {
                  ...c,
                  status: 'upgradable',
                  source: searchRes.providerUsed || 'LinkChecker Engine',
                  upgradedQualityName: suggestedQuality,
                  upgradedLinks: searchRes.qualityLinks,
                  discoveredItems: searchRes.links,
                  tmdbData: searchRes.tmdbData,
                  sampleUrl: searchRes.sample?.url,
                  cleanTitle: cleanTitleResolved,
                }
              : c
          )
        );
      } else {
        setCandidates((prev) =>
          prev.map((c) => (c.content.id === content.id ? { ...c, status: 'up_to_date' } : c))
        );
      }
    } catch (err) {
      setCandidates((prev) =>
        prev.map((c) => (c.content.id === content.id ? { ...c, status: 'error' } : c))
      );
    }
  };

  const CONCURRENCY = 6;

  const handleScanAll = async () => {
    if (candidates.length === 0 || isScanningAll) return;
    setIsScanningAll(true);
    vibrate(50);

    const ctrl = new AbortController();
    abortControllerRef.current = ctrl;

    const pending = candidates.filter(
      (c) => c.status !== 'upgradable' && !upgradedIds.has(c.content.id)
    );

    let currentIndex = 0;

    const worker = async () => {
      while (currentIndex < pending.length && !ctrl.signal.aborted) {
        const candidate = pending[currentIndex++];
        if (!candidate) break;
        await checkUpgradeForItem(candidate, ctrl.signal);
      }
    };

    const workers = Array.from({ length: Math.min(CONCURRENCY, pending.length) }).map(() => worker());
    await Promise.all(workers);

    setIsScanningAll(false);
  };

  const handleCreateSeparateContent = async (candidate: UpgradeCandidate) => {
    const { content, upgradedLinks, tmdbData, sampleUrl } = candidate;
    if (!upgradedLinks || upgradedLinks.length === 0) return;

    try {
      const preferences = getBatchMediaPreferences();

      // Format links payload ensuring clean 9-character base36 random IDs
      const finalLinksPayload: QualityLinks = upgradedLinks.map((d) => ({
        id: d.id || Math.random().toString(36).substr(2, 9),
        name: d.name || (d as any).label || '',
        url: d.url,
        size: d.size ? d.size.replace(/MB|GB/i, '').trim() : '',
        unit: d.size && d.size.toLowerCase().includes('gb') ? 'GB' : 'MB',
        season: d.season,
        episode: d.episode,
        isFullSeasonMKV: d.isFullSeasonMKV,
        isFullSeasonZIP: d.isFullSeasonZIP,
        isSample: d.isSample,
      }));

      // Calculate sequential order
      const currentMaxOrder = Math.max(0, ...contentList.map((c) => c.order || 0));
      const nextOrderNumber = currentMaxOrder + 1;

      // New separate content ID
      const newId = Math.random().toString(36).substr(2, 9);

      let movieLinksPayload = JSON.stringify([]);
      let seasonsPayload = JSON.stringify([]);

      if (content.type === 'series') {
        const seasonMap = new Map<number, Season>();
        finalLinksPayload.forEach((l) => {
          let sNum = l.season || 1;
          let epNum = l.episode;

          if (!seasonMap.has(sNum)) {
            seasonMap.set(sNum, {
              id: Math.random().toString(36).substr(2, 9),
              seasonNumber: sNum,
              zipLinks: [],
              mkvLinks: [],
              episodes: [],
            });
          }
          const s = seasonMap.get(sNum)!;

          if (epNum !== undefined && !l.isFullSeasonZIP && !l.isFullSeasonMKV) {
            let ep = s.episodes.find((e) => e.episodeNumber === epNum);
            if (!ep) {
              ep = {
                id: Math.random().toString(36).substr(2, 9),
                episodeNumber: epNum,
                title: `Episode ${epNum}`,
                links: [],
              };
              s.episodes.push(ep);
              s.episodes.sort((a, b) => a.episodeNumber - b.episodeNumber);
            }
            if (!ep.links.some((x) => x.url === l.url)) {
              ep.links.push(l);
            }
          } else {
            const isZip = l.isFullSeasonZIP || (!l.isFullSeasonMKV && l.url && l.url.toLowerCase().includes('.zip'));
            if (isZip) {
              if (!s.zipLinks.some((x) => x.url === l.url)) {
                s.zipLinks.push(l);
              }
            } else {
              if (!s.mkvLinks) s.mkvLinks = [];
              if (!s.mkvLinks.some((x) => x.url === l.url)) {
                s.mkvLinks.push(l);
              }
            }
          }
        });

        seasonsPayload = JSON.stringify(
          Array.from(seasonMap.values()).sort((a, b) => a.seasonNumber - b.seasonNumber)
        );
      } else {
        movieLinksPayload = JSON.stringify(finalLinksPayload);
      }

      const targetTitle =
        tmdbData?.title ||
        candidate.cleanTitle ||
        extractTitleAndYear(content.title).title;

      const newContent: Content = applyPreferencesToContent(
        {
          id: newId,
          cleanTitle: targetTitle,
          title: targetTitle,
          type: content.type || 'movie',
          year: tmdbData?.year || content.year,
          order: nextOrderNumber,
          movieLinks: movieLinksPayload,
          seasons: seasonsPayload,
          sampleUrl: sampleUrl || content.sampleUrl || undefined,
          status: 'published',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        tmdbData,
        preferences,
        genres,
        languages,
        qualities
      );

      await saveContent(newContent);

      setUpgradedIds((prev) => new Set([...prev, content.id]));
      vibrate(50);
    } catch (e) {
      console.error('Failed to create separate content:', e);
    }
  };

  const handleUpgradeItem = async (candidate: UpgradeCandidate) => {
    const { content, upgradedLinks } = candidate;
    if (!upgradedLinks || upgradedLinks.length === 0) return;

    try {
      let hdQuality = qualities.find((q) => isHdPrintMarker(q.name) || q.name.includes('1080p') || q.name.includes('720p'))?.id;
      if (!hdQuality && qualities.length > 0) hdQuality = qualities[0].id;

      await updateContentFields([
        {
          id: content.id,
          fields: {
            qualityId: hdQuality,
            movieLinks: JSON.stringify(upgradedLinks),
            updatedAt: new Date().toISOString(),
          },
        },
      ]);

      setUpgradedIds((prev) => new Set([...prev, content.id]));
      vibrate(50);
    } catch (e) {
      console.error('Failed to upgrade content:', e);
    }
  };

  const handleCreateSeparateContentAll = async () => {
    const upgradableList = candidates.filter(
      (c) => c.status === 'upgradable' && !upgradedIds.has(c.content.id)
    );
    if (upgradableList.length === 0) return;

    await Promise.all(upgradableList.map((cand) => handleCreateSeparateContent(cand)));
    vibrate([50, 50, 50]);
  };

  if (!isOpen) return null;

  const upgradableCount = candidates.filter((c) => c.status === 'upgradable' && !upgradedIds.has(c.content.id)).length;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative w-full max-w-3xl max-h-[90vh] bg-zinc-900 border border-zinc-800 rounded-2xl flex flex-col shadow-2xl overflow-hidden text-zinc-100"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Smart Quality Upgrade Alerts
                {upgradableCount > 0 && (
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    {upgradableCount} Available
                  </span>
                )}
              </h2>
              <p className="text-xs text-zinc-400">
                Scans library for CAM/PreDVD prints and verifies Digital HD upgrades via background Link Checker
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

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Action Header with Filter Toggle */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-zinc-950/40 p-4 rounded-xl border border-zinc-800">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setFilterMode('low')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                  filterMode === 'low'
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm'
                    : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200'
                }`}
              >
                Low Quality Prints ({candidates.filter((c) => c.isLowPrint).length})
              </button>
              <button
                onClick={() => setFilterMode('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                  filterMode === 'all'
                    ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40 shadow-sm'
                    : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200'
                }`}
              >
                All Content ({contentList.length})
              </button>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              {upgradableCount > 0 && (
                <button
                  onClick={handleCreateSeparateContentAll}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-colors shadow-md flex-1 sm:flex-initial justify-center"
                >
                  <PlusCircle className="w-4 h-4" /> Add All as New Content ({upgradableCount})
                </button>
              )}

              <button
                onClick={handleScanAll}
                disabled={isScanningAll || candidates.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-colors border border-zinc-700 flex-1 sm:flex-initial justify-center"
              >
                {isScanningAll ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-cyan-400" /> Scanning (6 at once)...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4" /> Fast Parallel Scan
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Candidates List */}
          {candidates.length === 0 ? (
            <div className="text-center py-12 space-y-3">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
              <h3 className="text-base font-bold text-white">All Library Content is HD!</h3>
              <p className="text-xs text-zinc-400 max-w-sm mx-auto">
                No low quality (CAM or PreDVD) prints detected in your current library collection.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {candidates.map((cand) => {
                const isUpgraded = upgradedIds.has(cand.content.id);
                return (
                  <div
                    key={cand.content.id}
                    className={`p-4 rounded-xl border transition-all ${
                      isUpgraded
                        ? 'bg-emerald-950/10 border-emerald-500/30'
                        : cand.status === 'upgradable'
                        ? 'bg-zinc-950/80 border-emerald-500/40'
                        : 'bg-zinc-950/40 border-zinc-800'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {cand.content.posterUrl ? (
                          <img
                            src={cand.content.posterUrl}
                            alt=""
                            className="w-10 h-14 object-cover rounded-lg border border-zinc-800 flex-shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-14 bg-zinc-800 rounded-lg flex items-center justify-center flex-shrink-0 text-zinc-500">
                            <Film className="w-5 h-5" />
                          </div>
                        )}

                        <div className="min-w-0 flex-1">
                          <h4 className="text-sm font-bold text-white truncate">
                            {cand.content.title}
                          </h4>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">
                              Current: {cand.currentQualityText}
                            </span>
                            {cand.status === 'checking' && (
                              <span className="flex items-center gap-1 text-xs text-cyan-400 animate-pulse">
                                <Loader2 className="w-3 h-3 animate-spin" /> LinkChecker scanning in background...
                              </span>
                            )}
                            {cand.status === 'up_to_date' && (
                              <span className="text-xs text-zinc-500">No HD release verified yet</span>
                            )}
                            {cand.status === 'error' && (
                              <span className="text-xs text-red-400">Scan error</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Upgrade Details & Button */}
                      <div className="flex items-center gap-2">
                        {cand.status === 'upgradable' && !isUpgraded && (
                          <div className="text-right hidden sm:block">
                            <span className="text-xs font-bold text-emerald-400 block">
                              {cand.upgradedQualityName}
                            </span>
                            <span className="text-[10px] text-zinc-400">
                              {cand.upgradedLinks?.length} verified links
                            </span>
                          </div>
                        )}

                        {isUpgraded ? (
                          <span className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-bold">
                            <Check className="w-4 h-4" /> Added as New Content
                          </span>
                        ) : cand.status === 'upgradable' ? (
                          <button
                            onClick={() => handleCreateSeparateContent(cand)}
                            className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-all shadow-md"
                            title="Add brand new content entry in library"
                          >
                            <PlusCircle className="w-4 h-4" /> Add as New Content
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              const ctrl = new AbortController();
                              checkUpgradeForItem(cand, ctrl.signal);
                            }}
                            disabled={cand.status === 'checking'}
                            className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800"
                            title="Scan with LinkChecker"
                          >
                            <RefreshCw className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};
