import React from 'react';
import { motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';

import { Heart, Clock, ShoppingCart, Play, X, Lock, Star } from 'lucide-react';
import { Content, Quality, Language, Genre } from '../types';
import { formatContentTitle, getContrastColor, getOttBadgeConfig } from '../utils/contentUtils';
import { OttBadge } from './OttBadge';
import { getOptimizedImageUrl, getImageSrcSet } from '../utils/imageUtils';
import { clsx } from 'clsx';
import { useCart } from '../contexts/CartContext';
import { useSettings } from '../contexts/SettingsContext';
import { useAuth } from '../contexts/AuthContext';
import { useHaptics } from '../hooks/useHaptics';
import { useLanguage } from '../contexts/LanguageContext';
import { useImdbRating } from '../hooks/useImdbRating';
import { Translate } from './Translate';

interface ContentCardProps {
  content: Content;
  profile: any;
  qualities: Quality[];
  languages: Language[];
  genres: Genre[];
  onToggleFavorite: (id: string) => void;
  onToggleWatchLater: (id: string) => void;
  selectedYear?: string;
  isSmall?: boolean;
  skipLiveRatingFetch?: boolean;
}

const ContentCard = React.memo(({ 
  content, 
  profile, 
  qualities, 
  languages, 
  genres, 
  onToggleFavorite, 
  onToggleWatchLater,
  selectedYear,
  isSmall,
  skipLiveRatingFetch = false
}: ContentCardProps) => {
  const { addToCart, cart } = useCart();
  const { profile: sysProfile } = useAuth();
  const { settings } = useSettings();
  const { vibrate } = useHaptics();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { rating: imdbRating, ottPlatform: cachedOtt, refreshRating } = useImdbRating(
    content,
    { enableLiveFetch: false, skipLiveFetch: true }
  );
  const ottBadge = getOttBadgeConfig(content.ottPlatform || (content as any).ott_platform || cachedOtt);
  const [isTrailerSelectionOpen, setIsTrailerSelectionOpen] = React.useState(false);
  const [selectedTrailerUrl, setSelectedTrailerUrl] = React.useState<string | null>(null);
  const [isClicked, setIsClicked] = React.useState(false);

  React.useEffect(() => {
    let timer: any;
    if (isClicked) {
      // Automatically reset the click state after a short delay so it doesn't get stuck
      timer = setTimeout(() => {
        setIsClicked(false);
      }, 500);
    }
    return () => clearTimeout(timer);
  }, [isClicked]);

  const isInCart = cart.some(item => item.contentId === content.id);

  const hasTrailer = Boolean(
    content.trailerUrl || 
    content.trailers || 
    (content.type === 'series' && content.seasons)
  );

  const getAllTrailers = React.useCallback(() => {
    const list: any[] = [];
    if (content.trailerUrl) {
      list.push({ id: 'main', url: content.trailerUrl, title: 'Main Trailer' });
    }
    if (content.trailers) {
      try {
        const additional = Array.isArray(content.trailers) ? content.trailers : JSON.parse(content.trailers || '[]');
        list.push(...additional);
      } catch (e) {}
    }
    if (content.type === 'series' && content.seasons) {
      try {
        const parsedSeasons = Array.isArray(content.seasons) ? content.seasons : JSON.parse(content.seasons || '[]');
        parsedSeasons.forEach((s: any) => {
          if (s.trailerUrl && !list.some(t => t.url === s.trailerUrl)) {
            list.push({ id: `season-${s.seasonNumber}`, url: s.trailerUrl, title: `Season ${s.seasonNumber} Trailer`, seasonNumber: s.seasonNumber });
          }
        });
      } catch (e) {}
    }
    return list;
  }, [content]);

  const getCanPlay = (c: any) => {
    const isContentAssigned = profile?.assignedContent?.some((id: string) => id === c.id || id.startsWith(`${c.id}:`));
    return profile?.role === 'admin' ||
      profile?.role === 'owner' ||
      profile?.role === 'manager' ||
      profile?.role === 'content_manager' ||
      isContentAssigned ||
      (profile?.status === 'active' &&
        !(profile?.role === "selected_content" || c.status === "selected_content"));
  };

  const isAssigned = profile?.role === 'selected_content' && profile.assignedContent?.some((id: string) => id === content.id || id.startsWith(`${content.id}:`));
  const isLocked = !getCanPlay(content);
  const isPending = profile?.status === 'pending';
  
  const qualityObj = React.useMemo(() => qualities.find(q => q.id === content.qualityId), [qualities, content.qualityId]);
  const contentLangs = React.useMemo(() => languages.filter(l => content.languageIds?.includes(l.id)).map(l => l.name).join(', '), [languages, content.languageIds]);
  const contentGenres = React.useMemo(() => genres.filter(g => content.genreIds?.includes(g.id)).map(g => g.name).join(', '), [genres, content.genreIds]);

  const isFavorite = profile?.favorites?.includes(content.id);
  const isWatchLater = profile?.watchLater?.includes(content.id);

  const canSeeDraft = ['owner', 'admin', 'manager', 'content_manager'].includes(profile?.role);
  
  const matchingSeason = React.useMemo(() => {
    if (!selectedYear || content.type !== 'series' || !content.seasons) return null;
    try {
      const parsedSeasons = Array.isArray(content.seasons) ? content.seasons : JSON.parse(content.seasons || '[]');
      return parsedSeasons.find((s: any) => s.year?.toString() === selectedYear);
    } catch (e) {
      return null;
    }
  }, [content.seasons, selectedYear, content.type]);

  const handleWatchTrailer = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const trailers = getAllTrailers();
    if (trailers.length > 1) {
      setIsTrailerSelectionOpen(true);
    } else if (trailers.length === 1) {
      const embedUrl = getYouTubeEmbedUrl(trailers[0].url);
      if (embedUrl) {
        setSelectedTrailerUrl(embedUrl);
      } else {
        window.open(trailers[0].url, '_blank');
      }
    }
  };

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (content.type === 'movie') {
      const basePrice = settings?.movieFee || 50;
      const finalPrice = content.status === 'selected_content' ? basePrice * 2 : basePrice;
      addToCart({
        contentId: content.id,
        title: content.title,
        type: 'movie',
        price: finalPrice
      });
    } else {
      let firstSeason = matchingSeason ? matchingSeason.seasonNumber : 1;
      let firstSeasonId = matchingSeason ? matchingSeason.id : undefined;
      if (!matchingSeason && content.seasons) {
        try {
          const parsed = Array.isArray(content.seasons) ? content.seasons : JSON.parse(content.seasons || '[]');
          if (parsed.length > 0) {
            firstSeason = parsed[0].seasonNumber || 1;
            firstSeasonId = parsed[0].id;
          }
        } catch (e) {}
      }
      
      const basePrice = settings?.seasonFee || 100;
      const finalPrice = content.status === 'selected_content' ? basePrice * 2 : basePrice;
      addToCart({
        contentId: content.id,
        title: `${content.title} - Season ${firstSeason}`,
        type: 'season',
        seasonNumber: firstSeason,
        seasonId: firstSeasonId || `s${firstSeason}`,
        price: finalPrice
      });
    }
  };

  const getYouTubeEmbedUrl = (url?: string) => {
    if (!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? `https://www.youtube.com/embed/${match[2]}` : null;
  };

  const defaultFallbackImage = settings?.defaultAppImage || 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=400&auto=format&fit=crop&q=80';
  const rawPoster = content.posterUrl?.trim() || defaultFallbackImage;
  const optimizedPoster = getOptimizedImageUrl(rawPoster, isSmall ? 185 : 342) || rawPoster;

  return (
    <div 
      className={clsx("group relative flex flex-col transition-transform duration-200 hover:-translate-y-1 active:scale-[0.98]", {
        "scale-105 z-30": isClicked
      })}
    >
      {/* Modern Sleek Card Container */}
      <div className="relative flex flex-col bg-white dark:bg-zinc-900/90 rounded-2xl overflow-hidden border border-zinc-200/80 dark:border-zinc-800/80 hover:border-emerald-500/50 dark:hover:border-emerald-500/50 shadow-md hover:shadow-xl hover:shadow-emerald-500/10 transition-shadow duration-200 transform-gpu backface-hidden">
        <Link 
          to={`/${content.type === 'series' ? 'series' : 'movie'}/${content.id}`} 
          onClick={() => {
            setIsClicked(true);
            refreshRating();
          }}
          className="absolute inset-0 z-10" aria-label={`View details for ${content.title}`} />
        
        <div className="relative aspect-[2/3] w-full bg-zinc-100 dark:bg-zinc-800 block overflow-hidden">
          <img
            src={optimizedPoster}
            alt={content.title}
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover transition-transform duration-200 ease-out group-hover:scale-105"
            referrerPolicy="no-referrer"
            onError={(e) => {
              const target = e.currentTarget as HTMLImageElement;
              if (target.src !== defaultFallbackImage) {
                target.src = defaultFallbackImage;
              }
            }}
          />
          
          {/* Subtle Dark Vignette & Play Indicator on hover */}
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/90 via-zinc-950/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-gradient-to-tr from-emerald-500 to-teal-400 text-white flex items-center justify-center shadow-lg shadow-emerald-500/40 transform scale-75 group-hover:scale-100 transition-transform duration-200">
              <Play className="w-5 h-5 sm:w-6 sm:h-6 fill-current translate-x-0.5" />
            </div>
          </div>

          {/* Top Right Badges */}
          <div className="absolute top-2 right-2 flex flex-col items-end gap-1 z-10">
            <div className={clsx(
              "px-1.5 py-0.5 rounded-md font-extrabold uppercase tracking-wider text-white shadow-md border border-white/20",
              content.type === 'movie' ? 'bg-blue-600' : 'bg-purple-600',
              isSmall ? 'text-[6px]' : 'text-[9px]'
            )}>
              {content.type}
            </div>

            <OttBadge platform={content.ottPlatform || (content as any).ott_platform || cachedOtt} isSmall={isSmall} />
            
            {qualityObj && (
              <div 
                className={clsx(
                  "px-1.5 py-0.5 rounded-md font-black uppercase tracking-wider shadow-sm select-none",
                  isSmall ? 'text-[6px]' : 'text-[9px]'
                )}
                style={{ 
                  backgroundColor: qualityObj.color || '#10b981',
                  color: getContrastColor(qualityObj.color || '#10b981')
                }}
              >
                {qualityObj.name}
              </div>
            )}

            {matchingSeason && (
              <div className={clsx(
                "px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wider bg-emerald-500 text-white shadow-sm",
                isSmall ? 'text-[6px]' : 'text-[9px]'
              )}>
                S{matchingSeason.seasonNumber}
              </div>
            )}
          </div>

          {/* Top Left Badges */}
          <div className="absolute top-2 left-2 flex flex-col items-start gap-1 z-10 pointer-events-none">
            {imdbRating && (
              <div
                className={clsx(
                  "font-black tracking-tight bg-black/85 text-yellow-400 border border-yellow-500/40 backdrop-blur-md flex items-center shadow-lg select-none rounded-lg",
                  isSmall 
                    ? "px-1.5 py-0.5 text-[9px] gap-0.5" 
                    : "px-2 py-0.5 sm:px-2.5 sm:py-1 text-xs sm:text-sm gap-1"
                )}
                title={`Rating: ${imdbRating}/10`}
              >
                <Star className={clsx("fill-yellow-400 text-yellow-400 shrink-0", isSmall ? "w-2.5 h-2.5" : "w-3.5 h-3.5 sm:w-4 sm:h-4")} />
                <span className={clsx("font-black text-amber-300 dark:text-yellow-400 leading-none", isSmall ? "text-[9px]" : "text-xs sm:text-sm")}>
                  {imdbRating}
                </span>
              </div>
            )}
            {content.status === 'draft' && canSeeDraft && (
              <div className={clsx(
                "px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wider bg-amber-500 text-white shadow-sm",
                isSmall ? 'text-[6px]' : 'text-[9px]'
              )}>
                Draft
              </div>
            )}
            {content.status === 'selected_content' && canSeeDraft && (
              <div className={clsx(
                "px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wider bg-pink-500 text-white shadow-sm flex items-center gap-0.5",
                isSmall ? 'text-[6px]' : 'text-[9px]'
              )}>
                <Star className={isSmall ? "w-2 h-2" : "w-2.5 h-2.5"} /> SCO
              </div>
            )}
            {isLocked && (
              <div className={clsx(
                "px-1.5 py-0.5 rounded-md font-extrabold uppercase tracking-wider flex items-center gap-1 shadow-sm",
                isPending ? "bg-amber-500 text-black" : "bg-rose-600 text-white",
                isSmall ? 'text-[6px]' : 'text-[9px]'
              )}>
                <Lock className={isSmall ? "w-2 h-2" : "w-2.5 h-2.5"} />
                <span>{isPending ? 'Pending' : 'Restricted'}</span>
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons - High Z-index to be clickable over the Link overlay */}
        <div className="absolute bottom-[88px] right-2 flex flex-col gap-2 z-20 opacity-0 lg:group-hover:opacity-100 transition-opacity pointer-events-none lg:group-hover:pointer-events-auto hidden lg:flex">
          {hasTrailer && (
            <button
              onClick={handleWatchTrailer}
              className="p-2 rounded-full transition-transform hover:scale-110 shadow-lg bg-red-600 text-white pointer-events-auto cursor-pointer"
              title="Watch Trailer"
            >
              <Play className="w-4 h-4 fill-current" />
            </button>
          )}
          {isLocked && (profile?.status === 'pending' || profile?.status === 'expired' || profile?.status !== 'active') && (
            isInCart ? (
              <Link
                to="/cart"
                onClick={(e) => e.stopPropagation()}
                className="p-2 rounded-full transition-transform hover:scale-110 shadow-lg bg-emerald-500 text-white pointer-events-auto cursor-pointer"
                title="View Cart"
              >
                <ShoppingCart className="w-4 h-4 fill-current" />
              </Link>
            ) : (
              <button
                onClick={handleAddToCart}
                className="p-2 rounded-full transition-transform hover:scale-110 shadow-lg bg-zinc-900/90 text-white hover:bg-emerald-500 pointer-events-auto cursor-pointer"
                title="Add to Cart"
              >
                <ShoppingCart className="w-4 h-4" />
              </button>
            )
          )}
          {isLocked && (profile?.role === 'trial' || profile?.role === 'user') && (
            <Link
              to="/top-up"
              onClick={(e) => e.stopPropagation()}
              className="p-2 rounded-full transition-transform hover:scale-110 shadow-lg bg-zinc-900/90 text-white hover:bg-emerald-500 pointer-events-auto cursor-pointer"
              title="Top Up Membership"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
            </Link>
          )}
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              vibrate(50);
              onToggleFavorite(content.id);
            }}
            className={clsx(
              "p-2 rounded-full transition-transform hover:scale-110 shadow-lg pointer-events-auto cursor-pointer",
              isFavorite ? "bg-emerald-500 text-white" : "bg-zinc-900/90 text-white hover:bg-emerald-500"
            )}
            title={isFavorite ? "Remove from Favorites" : "Add to Favorites"}
          >
            <Heart className={clsx("w-4 h-4", isFavorite && "fill-current")} />
          </button>
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              vibrate(50);
              onToggleWatchLater(content.id);
            }}
            className={clsx(
              "p-2 rounded-full transition-transform hover:scale-110 shadow-lg pointer-events-auto cursor-pointer",
              isWatchLater ? "bg-emerald-500 text-white" : "bg-zinc-900/90 text-white hover:bg-emerald-500"
            )}
            title={isWatchLater ? "Remove from Watch Later" : "Add to Watch Later"}
          >
            <Clock className={clsx("w-4 h-4", isWatchLater && "fill-current")} />
          </button>
        </div>

          <div className={clsx(
            "flex flex-col bg-white dark:bg-zinc-900/90",
            isSmall ? 'p-2' : 'flex-1 p-3 sm:p-3.5'
          )}>
            <h3 className={clsx(
              "font-extrabold leading-snug mb-1 text-zinc-900 dark:text-white group-hover:text-emerald-500 transition-colors",
              isSmall ? 'text-[11px] line-clamp-2' : 'text-sm sm:text-base line-clamp-3'
            )}>{formatContentTitle(content)}</h3>
            <div className={clsx(
              "flex items-center gap-2 text-zinc-500 dark:text-zinc-400 font-medium",
              isSmall ? 'text-[9px]' : 'text-xs mb-1.5'
            )}>
              {content.year && <span>{content.year}</span>}
              {content.runtime && (
                <>
                  <span className="w-1 h-1 bg-zinc-400 dark:bg-zinc-600 rounded-full"></span>
                  <span>{content.runtime}</span>
                </>
              )}
            </div>
            {!isSmall && (contentGenres || contentLangs) && (
              <div className="flex flex-col gap-0.5 mt-auto select-none pt-1.5 border-t border-zinc-100 dark:border-zinc-800/80">
                {contentGenres && (
                  <p className="text-zinc-500 dark:text-zinc-400 text-[11px] line-clamp-1 font-medium">
                    {contentGenres}
                  </p>
                )}
                {contentLangs && (
                  <p className="text-emerald-600 dark:text-emerald-400 text-xs font-bold line-clamp-1">
                    {contentLangs}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

      {/* Trailer Selection Modal */}
      {isTrailerSelectionOpen && (
        <div 
          className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[100] p-4"
          onClick={() => setIsTrailerSelectionOpen(false)}
        >
          <div 
            className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 max-w-md w-full relative shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setIsTrailerSelectionOpen(false)}
              className="absolute top-4 right-4 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:text-white transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
            <h3 className="text-xl font-bold mb-4">{t('Select Trailer')}</h3>
            <div className="flex flex-col gap-3">
              {getAllTrailers().map((trailer) => (
                <button
                  key={trailer.id}
                  onClick={() => {
                    const embedUrl = getYouTubeEmbedUrl(trailer.url);
                    if (embedUrl) {
                      setSelectedTrailerUrl(embedUrl);
                    } else {
                      window.open(trailer.url, '_blank');
                    }
                    setIsTrailerSelectionOpen(false);
                  }}
                  className={`w-full font-bold py-3 px-4 rounded-xl transition-colors flex items-center justify-between border ${
                    trailer.id === 'main' 
                      ? 'bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white border-transparent' 
                      : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 border-emerald-500/20'
                  }`}
                >
                  <span>{trailer.title}</span>
                  <Play className="w-4 h-4" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* YouTube Trailer Modal */}
      {selectedTrailerUrl && (
        <div 
          className="fixed inset-0 bg-black/95 backdrop-blur-md flex items-center justify-center z-[110] p-4"
          onClick={() => setSelectedTrailerUrl(null)}
        >
          <div 
            className="relative w-full max-w-5xl aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <iframe
              src={`${selectedTrailerUrl}?autoplay=1`}
              title="Trailer"
              className="w-full h-full border-0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            ></iframe>
          </div>
        </div>
      )}
    </div>
  );
});

ContentCard.displayName = 'ContentCard';

export default ContentCard;
