import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ExternalLink, Loader2, Download } from "lucide-react";
import { Content } from "../types";
import { useModalBehavior } from "../hooks/useModalBehavior";
import { useLanguage } from "../contexts/LanguageContext";
import { VideoAdInterstitial } from "./VideoAdInterstitial";
import { useAuth } from "../contexts/AuthContext";
import { isUserExemptFromAds } from "../utils/adUtils";

interface TelegramDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  content: Content | null;
}

export function TelegramDownloadModal({
  isOpen,
  onClose,
  content,
}: TelegramDownloadModalProps) {
  useModalBehavior(isOpen, onClose);
  const { t } = useLanguage();
  const { profile } = useAuth();
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);
  const [adPendingLink, setAdPendingLink] = useState<{ id: string, url: string } | null>(null);

  if (!isOpen || !content) return null;

  const executeResolve = async (id: string, url: string) => {
    setResolvingId(id);
    setErrorId(null);
    try {
      const res = await fetch(`/api/resolve-tg?url=${encodeURIComponent(url)}`);
      const data = await res.json();
      if (res.ok && data.url) {
        if (data.url.startsWith("tg://")) {
          window.location.href = data.url;
        } else {
          window.open(data.url, "_blank") || (window.location.href = data.url);
        }
      } else {
        setErrorId(id);
        alert(data.error || t("Failed to resolve Telegram link"));
      }
    } catch (e) {
      console.error(e);
      setErrorId(id);
      alert(t("An error occurred predicting Telegram link"));
    } finally {
      setResolvingId(null);
    }
  };

  const handleResolve = (id: string, url: string) => {
    const isExempt = isUserExemptFromAds(profile, content);
    
    if (!isExempt) {
      setAdPendingLink({ id, url });
    } else {
      executeResolve(id, url);
    }
  };

  const isHubcloudLink = (url: string) => {
    const l = url.toLowerCase();
    return l.includes('hubcloud') || l.includes('hubcould') || l.includes('hubdrive') || l.includes('moviesdrive') || l.includes('skymovies') || l.includes('mdrive') || l.includes('filmygo');
  };

  const renderQualityLinks = (linksRaw: any, prefix: string) => {
    let parsedLinks: any[] = [];
    if (typeof linksRaw === "string") {
      try {
        parsedLinks = JSON.parse(linksRaw);
      } catch (e) {}
    } else if (Array.isArray(linksRaw)) {
      parsedLinks = linksRaw;
    }
    
    const validLinks = parsedLinks.filter(l => l && l.url && isHubcloudLink(l.url));
    if (validLinks.length === 0) return null;

    return (
      <div className="space-y-2 relative">
         {validLinks.map((l: any, lIdx: number) => {
           const id = `${prefix}_${lIdx}`;
           const sizeStr = (l.size && l.unit) ? `${l.size} ${l.unit}` : "";
           return (
             <div key={id} className="flex flex-col gap-2 p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-200 dark:border-zinc-800">
               <div className="text-sm font-medium text-zinc-900 dark:text-zinc-200 truncate flex justify-between items-center">
                 <span>{l.name || "Link"}</span>
                 {sizeStr && <span className="text-xs text-zinc-500">{sizeStr}</span>}
               </div>
               <button
                 onClick={() => handleResolve(id, l.url)}
                 disabled={resolvingId === id}
                 className="w-full flex justify-center items-center gap-2 px-3 py-2 bg-[rgb(36,161,222)] hover:bg-[rgb(32,144,199)] disabled:opacity-50 text-white rounded-lg text-sm font-medium transition"
               >
                 {resolvingId === id ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
                 {resolvingId === id ? t("Resolving...") : t("Download via Telegram")}
               </button>
             </div>
           );
         })}
      </div>
    );
  };

  const getSeasons = () => {
    if (!content?.seasons) return [];
    if (typeof content.seasons === 'string') {
      try { return JSON.parse(content.seasons); } catch(e) { return [];}
    }
    return Array.isArray(content.seasons) ? content.seasons : [];
  };

  const seasons = getSeasons();

  return (
    <>
      <VideoAdInterstitial
        isOpen={!!adPendingLink}
        onClose={() => setAdPendingLink(null)}
        adUrl="https://commercialhalftime.com/htqpa4mty?key=53a3c0b6e7edfce96cd08f0cabe01b54"
        onAdComplete={() => {
          if (adPendingLink) {
            executeResolve(adPendingLink.id, adPendingLink.url);
            setAdPendingLink(null);
          }
        }}
      />
      <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 transition-opacity"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 pointer-events-none"
          >
            <div className="bg-white dark:bg-zinc-900 w-full max-w-lg rounded-2xl shadow-2xl relative flex flex-col pointer-events-auto max-h-[85vh]">
              {/* Header */}
              <div className="flex items-center justify-between p-4 sm:p-6 border-b border-zinc-100 dark:border-zinc-800 shrink-0">
                <div className="flex items-center gap-3">
                   <div className="w-10 h-10 rounded-xl bg-[rgb(36,161,222)]/10 flex items-center justify-center">
                     <Download className="w-5 h-5 text-[rgb(36,161,222)]" />
                   </div>
                   <div>
                     <h2 className="text-lg font-bold text-zinc-900 dark:text-white">
                        {t("Telegram Download")}
                     </h2>
                     <p className="text-xs text-zinc-500">
                        {content.title}
                     </p>
                   </div>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <div className="p-4 sm:p-6 overflow-y-auto custom-scrollbar flex-1 space-y-6">
                 {content.type === "movie" && content.movieLinks && (
                   <div className="space-y-4">
                     <h3 className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">{t("Movie Links")}</h3>
                     {renderQualityLinks(content.movieLinks, "movie")}
                   </div>
                 )}

                 {content.type === "series" && (
                   <div className="space-y-6">
                     {content.fullSeasonZip && renderQualityLinks(content.fullSeasonZip, "full_zip") && (
                       <div className="space-y-4">
                          <h3 className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">{t("Full Series ZIP")}</h3>
                          {renderQualityLinks(content.fullSeasonZip, "full_zip")}
                       </div>
                     )}
                     {content.fullSeasonMkv && renderQualityLinks(content.fullSeasonMkv, "full_mkv") && (
                       <div className="space-y-4">
                          <h3 className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">{t("Full Series MKV")}</h3>
                          {renderQualityLinks(content.fullSeasonMkv, "full_mkv")}
                       </div>
                     )}
                     {seasons.map((season: any, sIdx: number) => (
                       <div key={season.id || `season_${sIdx}`} className="space-y-4">
                         <h3 className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">{t("Season")} {season.seasonNumber || (sIdx + 1)}</h3>
                         
                         {season.zipLinks && (
                           <div className="mb-4">
                              <h4 className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-2">ZIP Links</h4>
                              {renderQualityLinks(season.zipLinks, `sz_${season.id}`)}
                           </div>
                         )}

                         {season.mkvLinks && (
                           <div className="mb-4">
                              <h4 className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-2">MKV Links</h4>
                              {renderQualityLinks(season.mkvLinks, `smk_${season.id}`)}
                           </div>
                         )}

                         {season.episodes && season.episodes.length > 0 && (
                           <div>
                              <h4 className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-2">{t("Episodes")}</h4>
                              <div className="space-y-3">
                                {season.episodes.map((ep: any, epIdx: number) => (
                                  <div key={ep.id || `ep_${epIdx}`} className="p-3 border border-zinc-200 dark:border-zinc-800 rounded-xl bg-zinc-50/50 dark:bg-zinc-800/30">
                                    <div className="text-xs font-bold text-zinc-800 dark:text-zinc-200 mb-2">Ep {ep.episodeNumber || (epIdx + 1)} - {ep.title || "Episode"}</div>
                                    <div className="space-y-2">
                                      {ep.links ? renderQualityLinks(ep.links, `se_${season.id}_${ep.id}`) : <span className="text-xs text-zinc-500">{t("No links")}</span>}
                                    </div>
                                  </div>
                                ))}
                              </div>
                           </div>
                         )}
                       </div>
                     ))}
                   </div>
                 )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  </>
);
}
