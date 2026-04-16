import React from 'react';
import { Link } from 'react-router-dom';
import { LazyLoadImage } from 'react-lazy-load-image-component';
import { Heart, Clock, ShoppingCart, Play, X } from 'lucide-react';
import { Content, Quality, Language, Genre } from '../types';
import { formatContentTitle, getContrastColor } from '../utils/contentUtils';
import { clsx } from 'clsx';
import { useCart } from '../contexts/CartContext';
import { useSettings } from '../contexts/SettingsContext';

interface ContentCardProps {
  content: Content;
  profile: any;
  qualities: Quality[];
  languages: Language[];
  genres: Genre[];
  onToggleFavorite: (id: string) => void;
  onToggleWatchLater: (id: string) => void;
  selectedYear?: string;
}

const ContentCard = React.memo(({ 
  content, 
  profile, 
  qualities, 
  languages, 
  genres, 
  onToggleFavorite, 
  onToggleWatchLater,
  selectedYear
}: ContentCardProps) => {
  const { addToCart, cart } = useCart();
  const { settings } = useSettings();
  const [isTrailerSelectionOpen, setIsTrailerSelectionOpen] = React.useState(false);
  const [selectedTrailerUrl, setSelectedTrailerUrl] = React.useState<string | null>(null);

  const isInCart = cart.some(item => item.contentId === content.id);

  const seasons = React.useMemo(() => {
    if (content.type === 'series' && content.seasons) {
      try {
        return Array.isArray(content.seasons) ? content.seasons : JSON.parse(content.seasons || '[]');
      } catch (e) {
        return [];
      }
    }
    return [];
  }, [content.seasons, content.type]);

  const allTrailers = React.useMemo(() => {
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
    seasons.forEach((s: any) => {
      if (s.trailerUrl && !list.some(t => t.url === s.trailerUrl)) {
        list.push({ id: `season-${s.seasonNumber}`, url: s.trailerUrl, title: `Season ${s.seasonNumber} Trailer`, seasonNumber: s.seasonNumber });
      }
    });
    return list;
  }, [content, seasons]);

  const isAssigned = profile?.role === 'selected_content' && profile.assignedContent?.some((id: string) => id === content.id || id.startsWith(`${content.id}:`));
  const isLocked = profile?.status !== 'active' || (profile?.role === 'selected_content' && !isAssigned);
  const isPending = profile?.status === 'pending';
  
  const qualityObj = qualities.find(q => q.id === content.qualityId);
  const contentLangs = languages.filter(l => content.languageIds?.includes(l.id)).map(l => l.name).join(', ');
  const contentGenres = genres.filter(g => content.genreIds?.includes(g.id)).map(g => g.name).join(', ');

  const isFavorite = profile?.favorites?.includes(content.id);
  const isWatchLater = profile?.watchLater?.includes(content.id);

  const canSeeDraft = ['owner', 'admin', 'manager', 'content_manager'].includes(profile?.role);

  const matchingSeason = React.useMemo(() => {
    if (!selectedYear || content.type !== 'series') return null;
    return seasons.find((s: any) => s.year?.toString() === selectedYear);
  }, [seasons, selectedYear, content.type]);

  const handleWatchTrailer = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (allTrailers.length > 1) {
      setIsTrailerSelectionOpen(true);
    } else if (allTrailers.length === 1) {
      const embedUrl = getYouTubeEmbedUrl(allTrailers[0].url);
      if (embedUrl) {
        setSelectedTrailerUrl(embedUrl);
      } else {
        window.open(allTrailers[0].url, '_blank');
      }
    }
  };

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (content.type === 'movie') {
      addToCart({
        contentId: content.id,
        title: content.title,
        type: 'movie',
        price: settings?.movieFee || 50
      });
    } else {
      let firstSeason = matchingSeason ? matchingSeason.seasonNumber : 1;
      if (!matchingSeason && seasons.length > 0) {
        firstSeason = seasons[0].seasonNumber;
      }
      
      addToCart({
        contentId: content.id,
        title: `${content.title} - Season ${firstSeason}`,
        type: 'season',
        seasonNumber: firstSeason,
        seasonId: matchingSeason ? matchingSeason.id : (seasons[0]?.id || `s${firstSeason}`),
        price: settings?.seasonFee || 100
      });
    }
  };

  const getYouTubeEmbedUrl = (url?: string) => {
    if (!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? `https://www.youtube.com/embed/${match[2]}` : null;
  };

  return (
    <div className="group relative rounded-2xl p-[0.5px] transition-all hover:scale-[1.02] bg-gradient-to-br from-black to-white/20 dark:bg-black flex flex-col h-full transform-gpu">
      {/* Blur black to white gradient background outside of content */}
      <div className="absolute -inset-[1px] bg-gradient-to-br from-black to-white/20 dark:from-black dark:to-black rounded-2xl z-0 transition-all duration-300 group-hover:blur-sm"></div>

      {/* Color Gradient Layer (1px) */}
      <div className="relative rounded-[15.5px] p-[1px] bg-[linear-gradient(to_bottom_right,#ff0000,#ef4444,#f97316,#facc15,#4ade80,#06b6d4,#3b82f6,#a855f7)] z-10 flex flex-col h-full">
        {/* Gap Layer (0.5px gap) */}
        <div className="relative flex flex-col h-full bg-black rounded-[14.5px] p-[0.5px] transition-colors">
          {/* Inner Content */}
          <div className="relative flex flex-col h-full bg-zinc-50 dark:bg-zinc-900 rounded-[14px] overflow-hidden">
          <Link to={`/movie/${content.id}`} className="absolute inset-0 z-20" aria-label={`View details for ${content.title}`} />
          
          <div className="relative aspect-[2/3] w-full bg-zinc-100 dark:bg-zinc-800 block z-10">
            <LazyLoadImage
            src={content.posterUrl || settings?.defaultAppImage || 'https://picsum.photos/seed/movie/400/600'}
            alt={content.title}
            effect="blur"
            threshold={300}
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
            wrapperClassName="w-full h-full bg-zinc-100 dark:bg-zinc-800"
          />
          
          {/* Overlay on hover */}
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <div className="bg-emerald-500 rounded-full p-3 transform translate-y-4 group-hover:translate-y-0 transition-transform">
              <Heart className="w-6 h-6 text-zinc-900 dark:text-white fill-current" />
            </div>
          </div>

            <div className={clsx(
              "absolute top-2 right-2 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider text-white z-20",
              content.type === 'movie' ? 'bg-blue-500/90' : 'bg-purple-500/90'
            )}>
              {content.type}
            </div>
            
            {qualityObj && (
              <div 
                className="absolute top-9 right-2 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider shadow-lg z-20"
                style={{ 
                  backgroundColor: qualityObj.color || '#10b981',
                  color: getContrastColor(qualityObj.color || '#10b981')
                }}
              >
                {qualityObj.name}
              </div>
            )}

            {matchingSeason && (
              <div className="absolute top-16 right-2 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-500 text-white shadow-lg z-20">
                Season {matchingSeason.seasonNumber}
              </div>
            )}

          <div className="absolute top-2 left-2 flex flex-col gap-1 z-20">
            {content.status === 'draft' && canSeeDraft && (
              <div className="px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider bg-orange-500 text-white shadow-lg">
                Draft
              </div>
            )}
            {isLocked && (
              <div className={clsx(
                "px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 shadow-lg",
                isPending ? "bg-yellow-500 text-white dark:text-black" : "bg-red-500 text-white"
              )}>
                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                {isPending ? 'Pending' : 'Restricted'}
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons - High Z-index to be clickable over the Link overlay */}
        <div className="absolute bottom-[88px] right-2 flex flex-col gap-2 z-30 opacity-0 lg:group-hover:opacity-100 transition-opacity pointer-events-none lg:group-hover:pointer-events-auto hidden lg:flex">
          {(allTrailers.length > 0) && (
            <button
              onClick={handleWatchTrailer}
              className="p-2 rounded-full backdrop-blur-md transition-all hover:scale-110 shadow-lg bg-red-600 text-white pointer-events-auto"
              title="Watch Trailer"
            >
              <Play className="w-4 h-4 fill-current" />
            </button>
          )}
          {isLocked && (profile?.role === 'selected_content' || profile?.role === 'user') && profile?.status !== 'expired' && (
            isInCart ? (
              <Link
                to="/cart"
                onClick={(e) => e.stopPropagation()}
                className="p-2 rounded-full backdrop-blur-md transition-all hover:scale-110 shadow-lg bg-emerald-500 text-white pointer-events-auto"
                title="View Cart"
              >
                <ShoppingCart className="w-4 h-4 fill-current" />
              </Link>
            ) : (
              <button
                onClick={handleAddToCart}
                className="p-2 rounded-full backdrop-blur-md transition-all hover:scale-110 shadow-lg bg-black/50 text-zinc-900 dark:text-white hover:bg-emerald-500 pointer-events-auto"
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
              className="p-2 rounded-full backdrop-blur-md transition-all hover:scale-110 shadow-lg bg-black/50 text-zinc-900 dark:text-white hover:bg-emerald-500 pointer-events-auto"
              title="Top Up Membership"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
            </Link>
          )}
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggleFavorite(content.id);
            }}
            className={clsx(
              "p-2 rounded-full backdrop-blur-md transition-all hover:scale-110 shadow-lg pointer-events-auto",
              isFavorite ? "bg-emerald-500 text-white" : "bg-black/50 text-zinc-900 dark:text-white hover:bg-emerald-500"
            )}
            title={isFavorite ? "Remove from Favorites" : "Add to Favorites"}
          >
            <Heart className={clsx("w-4 h-4", isFavorite && "fill-current")} />
          </button>
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggleWatchLater(content.id);
            }}
            className={clsx(
              "p-2 rounded-full backdrop-blur-md transition-all hover:scale-110 shadow-lg pointer-events-auto",
              isWatchLater ? "bg-emerald-500 text-white" : "bg-black/50 text-zinc-900 dark:text-white hover:bg-emerald-500"
            )}
            title={isWatchLater ? "Remove from Watch Later" : "Add to Watch Later"}
          >
            <Clock className={clsx("w-4 h-4", isWatchLater && "fill-current")} />
          </button>
        </div>

          <div className="p-3 flex flex-col flex-1 bg-zinc-50 dark:bg-zinc-900">
            <h3 className="font-bold text-sm md:text-base leading-tight mb-1 group-hover:text-emerald-500 transition-colors">{formatContentTitle(content)}</h3>
            <div className="flex items-center gap-2 text-zinc-500 text-sm mb-2">
              <span>{content.year}</span>
              {content.runtime && (
                <>
                  <span className="w-1 h-1 bg-zinc-700 rounded-full"></span>
                  <span>{content.runtime}</span>
                </>
              )}
            </div>
            <div className="flex flex-col gap-0.5 mt-auto">
              {contentGenres && (
                <p className="text-zinc-500 text-[10px] line-clamp-1 italic">
                  {contentGenres}
                </p>
              )}
              {contentLangs && (
                <p className="text-zinc-500 dark:text-zinc-400 text-sm font-medium line-clamp-1">
                  {contentLangs}
                </p>
              )}
            </div>
          </div>
        </div>
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
            <h3 className="text-xl font-bold mb-4">Select Trailer</h3>
            <div className="flex flex-col gap-3">
              {allTrailers.map((trailer) => (
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
