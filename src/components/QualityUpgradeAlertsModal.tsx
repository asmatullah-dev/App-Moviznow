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
  Layers
} from 'lucide-react';
import { useModalBehavior } from '../hooks/useModalBehavior';
import { useHaptics } from '../hooks/useHaptics';
import { useAdminContent } from '../contexts/AdminContentContext';
import { Content, Language, Quality, QualityLinks } from '../types';
import { checkContentViaLinkChecker, ScrapedLinkItem } from './LinkCheckerModal';

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
}

export const QualityUpgradeAlertsModal: React.FC<Props> = ({
  isOpen,
  onClose,
  qualities,
  languages,
}) => {
  const { contentList, updateContentFields } = useAdminContent();
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
      // Execute multi-source LinkChecker engine in background
      const res = await checkContentViaLinkChecker({
        title: content.title,
        year: yearNum,
        type: content.type === 'series' ? 'series' : 'movie',
        content,
        languages,
        qualities,
        signal,
      });

      if (signal.aborted) return;

      // Check if any HD/Digital/4K links are present
      const hdLinks = res.links.filter((l) => {
        const txt = `${l.label} ${l.rawQuality || ''} ${l.fileName || ''} ${l.url}`.toLowerCase();
        return isHdPrintMarker(txt) || l.quality === '1080p' || l.quality === '720p' || l.quality === '2160p';
      });

      if (hdLinks.length > 0) {
        let suggestedQuality = res.metadata.printQuality || '1080p / 720p WEB-DL (Digital HD)';
        setCandidates((prev) =>
          prev.map((c) =>
            c.content.id === content.id
              ? {
                  ...c,
                  status: 'upgradable',
                  source: 'LinkChecker Background Engine',
                  upgradedQualityName: suggestedQuality,
                  upgradedLinks: res.qualityLinks,
                  discoveredItems: res.links,
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

  const handleScanAll = async () => {
    if (candidates.length === 0 || isScanningAll) return;
    setIsScanningAll(true);
    vibrate(50);

    const ctrl = new AbortController();
    abortControllerRef.current = ctrl;

    for (const cand of candidates) {
      if (cand.status === 'upgradable' || upgradedIds.has(cand.content.id)) continue;
      if (ctrl.signal.aborted) break;
      await checkUpgradeForItem(cand, ctrl.signal);
    }

    setIsScanningAll(false);
  };

  const handleUpgradeItem = async (candidate: UpgradeCandidate) => {
    const { content, upgradedLinks, upgradedQualityName } = candidate;
    if (!upgradedLinks || upgradedLinks.length === 0) return;

    try {
      // Find matching HD quality ID in qualities list or fallback to 1080p
      let hdQuality = qualities.find((q) => isHdPrintMarker(q.name) || q.name.includes('1080p') || q.name.includes('720p'))?.id;
      if (!hdQuality && qualities.length > 0) hdQuality = qualities[0].id;

      // Update in DB
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

  const handleUpgradeAll = async () => {
    const upgradableList = candidates.filter(
      (c) => c.status === 'upgradable' && !upgradedIds.has(c.content.id)
    );
    if (upgradableList.length === 0) return;

    for (const cand of upgradableList) {
      await handleUpgradeItem(cand);
    }
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
                  onClick={handleUpgradeAll}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-colors shadow-md flex-1 sm:flex-initial justify-center"
                >
                  <ArrowUpRight className="w-4 h-4" /> Upgrade All ({upgradableCount})
                </button>
              )}

              <button
                onClick={handleScanAll}
                disabled={isScanningAll || candidates.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-colors border border-zinc-700 flex-1 sm:flex-initial justify-center"
              >
                {isScanningAll ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-cyan-400" /> Scanning...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4" /> Scan for HD Upgrades
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
                            <Check className="w-4 h-4" /> Upgraded
                          </span>
                        ) : cand.status === 'upgradable' ? (
                          <button
                            onClick={() => handleUpgradeItem(cand)}
                            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-all shadow-md"
                          >
                            <ArrowUpRight className="w-4 h-4" /> Upgrade to HD
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
