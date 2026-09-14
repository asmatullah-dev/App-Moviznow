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
import { Content, Genre, Language, Quality } from '../types';
import {
  getFilmygoDomain,
  getHdhub4uDomain,
  getSkymoviesDomain,
  getMoviesdriveDomain,
  getFilmyflyDomain,
} from '../utils/domains';
import { performFullLinkScan } from '../utils/linkScanner';
import { generateSearchVariations } from './BulkContentImporterModal';

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
  upgradedLinks?: { name: string; url: string; quality: string; size?: string; audio?: string }[];
  upgradedQualityName?: string;
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
      s.includes('cam') ||
      s.includes('hdcam') ||
      s.includes('predvd') ||
      s.includes('pre-dvd') ||
      s.includes('telesync') ||
      s.includes('hdts') ||
      s.includes('hdtc') ||
      s.includes('line audio') ||
      s.includes('hall audio') ||
      s.includes('sample')
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

  // Detect low quality items in library on open
  useEffect(() => {
    if (isOpen) {
      const lowItems: UpgradeCandidate[] = [];
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

        if (low) {
          lowItems.push({
            content: c,
            currentQualityText: qName || 'CAM/PreDVD Print',
            isLowPrint: true,
            status: 'pending',
          });
        }
      });

      setCandidates(lowItems);
    }
  }, [isOpen, contentList, qualities]);

  const checkUpgradeForItem = async (candidate: UpgradeCandidate, signal: AbortSignal) => {
    const { content } = candidate;
    setCandidates((prev) =>
      prev.map((c) => (c.content.id === content.id ? { ...c, status: 'checking' } : c))
    );

    const yearNum = content.year ? parseInt(content.year.toString(), 10) : undefined;
    const searchQueries = generateSearchVariations(content.title, yearNum);

    try {
      // 1. Try FilmyGo
      const fgDomain = getFilmygoDomain();
      for (const q of searchQueries) {
        if (signal.aborted) break;
        const fgSearchUrl = `${fgDomain}/site-search.html?to-search=${encodeURIComponent(q)}&to-page=1`;
        const fgRes = await fetch(`/api/filmygo?url=${encodeURIComponent(fgSearchUrl)}`, { signal }).catch(() => null);
        if (fgRes && fgRes.ok) {
          const fgData = await fgRes.json().catch(() => ({}));
          const posts = fgData.posts || [];
          for (const post of posts.slice(0, 3)) {
            const postRes = await fetch(`/api/filmygo?url=${encodeURIComponent(post.url)}`, { signal }).catch(() => null);
            if (postRes && postRes.ok) {
              const postData = await postRes.json().catch(() => ({}));
              const links = postData.links || [];
              const hdLinks = links.filter((l: any) => isHdPrintMarker(l.name || l.quality || l.url || ''));
              if (hdLinks.length > 0) {
                setCandidates((prev) =>
                  prev.map((c) =>
                    c.content.id === content.id
                      ? {
                          ...c,
                          status: 'upgradable',
                          source: 'FilmyGo',
                          upgradedQualityName: '1080p / 720p WEB-DL (Digital HD)',
                          upgradedLinks: hdLinks.map((l: any) => ({
                            name: l.name || `${content.title} HD`,
                            url: l.url,
                            quality: l.quality || '1080p',
                            size: l.size,
                            audio: l.audio || 'Hindi',
                          })),
                        }
                      : c
                  )
                );
                return;
              }
            }
          }
        }
      }

      // 2. Try HDHub4U
      const hdDomain = getHdhub4uDomain();
      for (const q of searchQueries) {
        if (signal.aborted) break;
        const hdSearchUrl = `${hdDomain}/search.html?q=${encodeURIComponent(q)}`;
        const hdRes = await fetch(`/api/hdhub4u?url=${encodeURIComponent(hdSearchUrl)}`, { signal }).catch(() => null);
        if (hdRes && hdRes.ok) {
          const hdData = await hdRes.json().catch(() => ({}));
          const posts = hdData.posts || [];
          for (const post of posts.slice(0, 3)) {
            const postRes = await fetch(`/api/hdhub4u?url=${encodeURIComponent(post.url)}`, { signal }).catch(() => null);
            if (postRes && postRes.ok) {
              const postData = await postRes.json().catch(() => ({}));
              const cands = postData.candidates || postData.links || [];
              const hdLinks = cands.filter((l: any) => isHdPrintMarker(l.text || l.name || l.href || l.url || ''));
              if (hdLinks.length > 0) {
                setCandidates((prev) =>
                  prev.map((c) =>
                    c.content.id === content.id
                      ? {
                          ...c,
                          status: 'upgradable',
                          source: 'HDHub4U',
                          upgradedQualityName: 'Digital WEB-DL / BluRay',
                          upgradedLinks: hdLinks.map((l: any) => ({
                            name: l.text || l.name || `${content.title} HD`,
                            url: l.href || l.url,
                            quality: '1080p',
                            audio: 'Hindi Clean',
                          })),
                        }
                      : c
                  )
                );
                return;
              }
            }
          }
        }
      }

      // 3. Try SkyMoviesHD
      const skyDomain = getSkymoviesDomain();
      for (const q of searchQueries) {
        if (signal.aborted) break;
        const skySearchUrl = `${skyDomain}/search.php?search=${encodeURIComponent(q)}&cat=All`;
        const skyRes = await fetch(`/api/skymovieshd?url=${encodeURIComponent(skySearchUrl)}`, { signal }).catch(() => null);
        if (skyRes && skyRes.ok) {
          const skyData = await skyRes.json().catch(() => ({}));
          const posts = skyData.posts || [];
          for (const post of posts.slice(0, 3)) {
            const postRes = await fetch(`/api/skymovieshd?url=${encodeURIComponent(post.url)}`, { signal }).catch(() => null);
            if (postRes && postRes.ok) {
              const postData = await postRes.json().catch(() => ({}));
              const links = postData.links || [];
              const hdLinks = links.filter((l: any) => isHdPrintMarker(l.name || l.quality || l.url || ''));
              if (hdLinks.length > 0) {
                setCandidates((prev) =>
                  prev.map((c) =>
                    c.content.id === content.id
                      ? {
                          ...c,
                          status: 'upgradable',
                          source: 'SkyMoviesHD',
                          upgradedQualityName: 'Digital HD WebRip',
                          upgradedLinks: hdLinks.map((l: any) => ({
                            name: l.name || `${content.title} HD`,
                            url: l.url,
                            quality: l.quality || '720p',
                            size: l.size,
                            audio: l.audio || 'Hindi',
                          })),
                        }
                      : c
                  )
                );
                return;
              }
            }
          }
        }
      }

      // 4. Try MoviesDrive
      const mdDomain = getMoviesdriveDomain();
      for (const q of searchQueries) {
        if (signal.aborted) break;
        const mdSearchUrl = `${mdDomain}/search.html?q=${encodeURIComponent(q)}&page=1`;
        const mdRes = await fetch(`/api/moviesdrive?url=${encodeURIComponent(mdSearchUrl)}`, { signal }).catch(() => null);
        if (mdRes && mdRes.ok) {
          const mdData = await mdRes.json().catch(() => ({}));
          const posts = mdData.posts || [];
          for (const post of posts.slice(0, 3)) {
            const postRes = await fetch(`/api/moviesdrive?url=${encodeURIComponent(post.url)}`, { signal }).catch(() => null);
            if (postRes && postRes.ok) {
              const postData = await postRes.json().catch(() => ({}));
              const links = postData.links || [];
              const hdLinks = links.filter((l: any) => isHdPrintMarker(l.name || l.quality || l.url || ''));
              if (hdLinks.length > 0) {
                setCandidates((prev) =>
                  prev.map((c) =>
                    c.content.id === content.id
                      ? {
                          ...c,
                          status: 'upgradable',
                          source: 'MoviesDrive',
                          upgradedQualityName: 'Digital WEB-DL HD',
                          upgradedLinks: hdLinks.map((l: any) => ({
                            name: l.name || `${content.title} HD`,
                            url: l.url,
                            quality: l.quality || '1080p',
                            size: l.size,
                            audio: l.audio || 'Hindi',
                          })),
                        }
                      : c
                  )
                );
                return;
              }
            }
          }
        }
      }

      // 5. Try FilmyFly
      const ffDomain = getFilmyflyDomain();
      for (const q of searchQueries) {
        if (signal.aborted) break;
        const ffSearchUrl = `${ffDomain}/search.html?search=${encodeURIComponent(q)}&page=1`;
        const ffRes = await fetch(`/api/filmyfly?url=${encodeURIComponent(ffSearchUrl)}`, { signal }).catch(() => null);
        if (ffRes && ffRes.ok) {
          const ffData = await ffRes.json().catch(() => ({}));
          const posts = ffData.posts || [];
          for (const post of posts.slice(0, 3)) {
            const postRes = await fetch(`/api/filmyfly?url=${encodeURIComponent(post.url)}`, { signal }).catch(() => null);
            if (postRes && postRes.ok) {
              const postData = await postRes.json().catch(() => ({}));
              const links = postData.links || [];
              const hdLinks = links.filter((l: any) => isHdPrintMarker(l.name || l.quality || l.url || ''));
              if (hdLinks.length > 0) {
                setCandidates((prev) =>
                  prev.map((c) =>
                    c.content.id === content.id
                      ? {
                          ...c,
                          status: 'upgradable',
                          source: 'FilmyFly',
                          upgradedQualityName: 'Digital WEB-DL HD',
                          upgradedLinks: hdLinks.map((l: any) => ({
                            name: l.name || `${content.title} HD`,
                            url: l.url,
                            quality: l.quality || '1080p',
                            size: l.size,
                            audio: l.audio || 'Hindi',
                          })),
                        }
                      : c
                  )
                );
                return;
              }
            }
          }
        }
      }

      // If no HD print found
      setCandidates((prev) =>
        prev.map((c) => (c.content.id === content.id ? { ...c, status: 'up_to_date' } : c))
      );
    } catch (e) {
      setCandidates((prev) =>
        prev.map((c) => (c.content.id === content.id ? { ...c, status: 'error' } : c))
      );
    }
  };

  const handleScanAll = async () => {
    setIsScanningAll(true);
    vibrate(40);
    const controller = new AbortController();
    abortControllerRef.current = controller;

    for (const cand of candidates) {
      if (controller.signal.aborted) break;
      await checkUpgradeForItem(cand, controller.signal);
    }

    setIsScanningAll(false);
    abortControllerRef.current = null;
    vibrate(30);
  };

  const handleUpgradeItem = async (candidate: UpgradeCandidate) => {
    if (!candidate.upgradedLinks || candidate.upgradedLinks.length === 0) return;

    const hdQuality = qualities.find((q) => isHdPrintMarker(q.name))?.id || qualities[0]?.id || '';

    try {
      await updateContentFields([
        {
          id: candidate.content.id,
          chunkId: candidate.content.chunkId,
          fields: {
            qualityId: hdQuality,
            movieLinks: JSON.stringify(candidate.upgradedLinks),
            updatedAt: new Date().toISOString(),
          },
        },
      ]);

      setUpgradedIds((prev) => new Set([...prev, candidate.content.id]));
      vibrate(50);
    } catch (e) {
      console.error('Failed to apply upgrade:', e);
    }
  };

  if (!isOpen) return null;

  const upgradableCount = candidates.filter((c) => c.status === 'upgradable').length;

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
                Scans library for CAM/PreDVD prints and searches scrapers for Digital HD upgrades
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
          {/* Action Header */}
          <div className="flex items-center justify-between bg-zinc-950/40 p-4 rounded-xl border border-zinc-800">
            <div>
              <span className="text-sm font-semibold text-white">
                Low Quality Content in Library: {candidates.length}
              </span>
              <p className="text-xs text-zinc-400">
                Check online sources for HD WEB-DL / BluRay prints
              </p>
            </div>
            <button
              onClick={handleScanAll}
              disabled={isScanningAll || candidates.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-colors shadow-md"
            >
              {isScanningAll ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Scanning Scrapers...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" /> Scan for HD Upgrades
                </>
              )}
            </button>
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
                                <Loader2 className="w-3 h-3 animate-spin" /> Checking...
                              </span>
                            )}
                            {cand.status === 'up_to_date' && (
                              <span className="text-xs text-zinc-500">No HD release yet</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Upgrade Details & Button */}
                      <div className="flex items-center gap-3">
                        {cand.status === 'upgradable' && !isUpgraded && (
                          <div className="text-right hidden sm:block">
                            <span className="text-xs font-bold text-emerald-400 block">
                              {cand.upgradedQualityName}
                            </span>
                            <span className="text-[10px] text-zinc-400">
                              via {cand.source} ({cand.upgradedLinks?.length} links)
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
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-all shadow-md"
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
                            title="Check this item"
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
