import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, CheckCircle2, XCircle, Search, RefreshCw } from 'lucide-react';
import { useModalBehavior } from '../hooks/useModalBehavior';
import { LinkCheckResult, performFullLinkScan, guessLinkType } from '../utils/linkScanner';
import { searchTMDBByTitle, fetchTMDBDetails, fetchSeriesSeasons, fetchIMDbRating } from './MediaModal';
import { db } from '../firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  selectedContentIds: string[];
  mode: 'media' | 'links'; // 'media' = fetch missing OMDB/TMDB data, 'links' = fetch missing links
  genres?: { id: string; name: string }[];
}

export const BatchFetchModal: React.FC<Props> = ({
  isOpen,
  onClose,
  selectedContentIds,
  mode,
  genres,
}) => {
  const [progress, setProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<{ id: string; title: string; status: 'success' | 'error' | 'pending'; message?: string }[]>([]);
  
  const [fetchFields, setFetchFields] = useState<Record<string, boolean>>(() => {
    const saved = localStorage.getItem('batchFetchModal_fetchFields');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Error parsing saved batchFetch fields:", e);
      }
    }
    return {
      title: true,
      description: true,
      type: true,
      year: true,
      releaseDate: true,
      country: true,
      runtime: true,
      imdbRating: true,
      imdbLink: true,
      trailerUrl: true,
      cast: true,
      genres: true,
      seasons: true,
      episodes: false,
      posterUrl: true,
      backdropUrl: true,
    };
  });

  useEffect(() => {
    localStorage.setItem('batchFetchModal_fetchFields', JSON.stringify(fetchFields));
  }, [fetchFields]);

  useModalBehavior(isOpen, onClose);

  useEffect(() => {
    if (isOpen) {
      setResults(selectedContentIds.map(id => ({ id, title: 'Item ' + id.substring(0, 5), status: 'pending' })));
      setProgress(0);
      setIsProcessing(false);
    }
  }, [isOpen, selectedContentIds]);

  const processMediaData = async () => {
    setIsProcessing(true);
    let successCount = 0;

    for (let i = 0; i < selectedContentIds.length; i++) {
       const id = selectedContentIds[i];
       if (!isOpen) break;

       try {
         const d = await getDoc(doc(db, 'content', id));
         if (!d.exists()) {
           updateResult(id, 'error', 'Not found');
           continue;
         }
         const data = d.data();
         updateTitle(id, data.title || 'Unknown');

         let searchTitle = data.title;
         let searchYear = data.year?.toString();
         
         const tmdbResults = await searchTMDBByTitle(searchTitle, searchYear, data.type);
         
         if (tmdbResults && tmdbResults.length > 0) {
            const bestMatch = tmdbResults[0];
            const details = await fetchTMDBDetails(bestMatch.item.id, bestMatch.type);
            
            // Validate Match
            const normalizeStr = (str: string) => (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            const targetTitle = normalizeStr(searchTitle);
            const matchTitle = normalizeStr(details.title || details.name);
            const targetYearStr = searchYear ? searchYear.toString() : '';
            const bestMatchYear = (details.release_date || details.first_air_date || '').split('-')[0];
            
            const resemblesTitle = matchTitle && targetTitle && (targetTitle.includes(matchTitle) || matchTitle.includes(targetTitle));
            const isSameYear = targetYearStr && bestMatchYear && targetYearStr === bestMatchYear;
            
            if (!resemblesTitle && !isSameYear) {
                updateResult(id, 'error', `Unconfident match: "${details.title || details.name}"`);
                continue;
            }

            const updates: any = {};
            
            if (fetchFields.title) updates.title = details.title || details.name || data.title;
            if (fetchFields.description) updates.description = details.overview || data.description;
            if (fetchFields.type) {
                // Ensure 'tv' is mapped to 'Series' regardless of source
                const type = details.media_type || bestMatch.type;
                updates.type = type === 'tv' ? 'series' : (type === 'movie' ? 'movie' : type);
            }
            if (fetchFields.year) {
               const parsedYear = parseInt((details.release_date || details.first_air_date || '').split('-')[0]);
               if (!isNaN(parsedYear)) updates.year = parsedYear;
            }
            if (fetchFields.releaseDate) updates.releaseDate = details.release_date || details.first_air_date || data.releaseDate;
            if (fetchFields.country) updates.country = (details.production_countries && details.production_countries[0]?.name) || data.country;
            if (fetchFields.runtime) {
                const rt = details.runtime ? `${details.runtime} min` : (details.episode_run_time?.[0] ? `${details.episode_run_time[0]} min` : '');
                const finalRuntime = rt || data.runtime;
                if (finalRuntime) updates.runtime = finalRuntime;
            }
            if (fetchFields.imdbLink && details.external_ids?.imdb_id) updates.imdbLink = `https://www.imdb.com/title/${details.external_ids.imdb_id}`;
            if (fetchFields.trailerUrl) {
               const trailer = details.videos?.results?.find((v: any) => v.type === 'Trailer' && v.site === 'YouTube') ||
                               details.videos?.results?.find((v: any) => (v.type === 'Teaser' || v.type === 'Clip') && v.site === 'YouTube') ||
                               details.videos?.results?.find((v: any) => v.site === 'YouTube');
               if (trailer) updates.trailerUrl = `https://www.youtube.com/watch?v=${trailer.key}`;
            }
            if (fetchFields.cast) updates.cast = details.credits?.cast?.slice(0, 10).map((c: any) => c.name).join(', ') || data.cast;
            if (fetchFields.posterUrl && details.poster_path) updates.posterUrl = `https://image.tmdb.org/t/p/w500${details.poster_path}`;
            if (fetchFields.backdropUrl && details.backdrop_path) updates.backdropUrl = `https://image.tmdb.org/t/p/original${details.backdrop_path}`;
            
            if (fetchFields.imdbRating && details.external_ids?.imdb_id) {
               const imdbRatingInfo = await fetchIMDbRating(details.external_ids.imdb_id);
               if (imdbRatingInfo) updates.imdbRating = imdbRatingInfo.rating;
            }

            if (bestMatch.type === 'tv' && fetchFields.seasons) {
                const seasonsData = await fetchSeriesSeasons(bestMatch.item.id);
                updates.seasons = seasonsData.map((s: any) => ({
                    seasonNumber: s.season,
                    title: s.name,
                    year: s.year,
                    episodes: fetchFields.episodes ? s.episodes.map((e: any) => ({
                        episodeNumber: e.episode_number,
                        title: e.name,
                        duration: e.runtime ? `${e.runtime}m` : undefined,
                        description: fetchFields.description ? (e.overview || undefined) : undefined
                    })) : []
                }));
            }

            if (fetchFields.genres && Array.isArray(details.genres) && genres) {
              const fetchedGenreNames = details.genres.map((g: any) => g.name.trim().toLowerCase());
              const matchedGenreIds = genres.filter(g => {
                const gName = g.name.toLowerCase();
                return fetchedGenreNames.some((fetched: string) => 
                  fetched === gName || 
                  fetched.includes(gName) || 
                  gName.includes(fetched) ||
                  (fetched === 'history' && gName === 'historical') ||
                  (fetched === 'historical' && gName === 'history') ||
                  (fetched === 'sci-fi' && gName.includes('sci')) ||
                  (fetched === 'science fiction' && gName.includes('sci')) ||
                  (fetched === 'romance' && gName === 'romantic') ||
                  (fetched === 'romantic' && gName === 'romance') ||
                  (fetched === 'comedy' && gName === 'comic') ||
                  (fetched === 'comic' && gName === 'comedy')
                );
              }).map(g => g.id);
              
              if (matchedGenreIds.length > 0) {
                const existingGenreIds = Array.isArray(data.genreIds) ? data.genreIds : [];
                updates.genreIds = [...new Set([...existingGenreIds, ...matchedGenreIds])];
              }
            }

            if (Object.keys(updates).length > 0) {
              try {
                await updateDoc(doc(db, 'content', id), updates);
                updateResult(id, 'success', 'Updated');
                successCount++;
              } catch (e: any) {
                console.error(`Update Error for doc ${id}:`, updates, e);
                updateResult(id, 'error', `Update Error: ${e.message}`);
              }
            } else {
              updateResult(id, 'success', 'No changes');
            }
         } else {
            updateResult(id, 'error', 'No TMDB match');
         }
       } catch (err: any) {
         updateResult(id, 'error', err.message || 'Error fetching');
       }
       setProgress(((i + 1) / selectedContentIds.length) * 100);
    }
    
    setIsProcessing(false);
  };

  const updateResult = (id: string, status: 'success'|'error', message: string) => {
    setResults(prev => prev.map(r => r.id === id ? { ...r, status, message } : r));
  };
  
  const updateTitle = (id: string, title: string) => {
    setResults(prev => prev.map(r => r.id === id ? { ...r, title } : r));
  };

  const handleStart = () => {
    if (mode === 'media') {
      processMediaData();
    } else {
      setIsProcessing(true);
      setTimeout(() => {
        setResults(prev => prev.map(r => ({ ...r, status: 'error', message: 'Batch link fetch requires a source. Please use the individual Link Checker.' })));
        setIsProcessing(false);
      }, 1000);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[70] flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ scale: 0.95 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0.95 }}
            className="bg-zinc-950 border border-zinc-800 rounded-xl w-full max-w-xl shadow-2xl flex flex-col max-h-[80vh]"
          >
            <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-900 rounded-t-xl z-20 sticky top-0">
              <div>
                <h2 className="text-xl font-bold flex items-center gap-2">
                  {mode === 'media' ? <Search className="w-5 h-5 text-cyan-500" /> : <RefreshCw className="w-5 h-5 text-emerald-500" />}
                  {mode === 'media' ? 'Batch Fetch Media Data' : 'Batch Fetch Links'}
                </h2>
                <p className="text-xs text-zinc-400 mt-1">Processing {selectedContentIds.length} items</p>
              </div>
              <button 
                onClick={onClose} 
                disabled={isProcessing}
                className="text-zinc-500 hover:text-white p-2 transition-colors disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {!isProcessing && progress === 0 && mode === 'media' && (
               <div className="p-4 border-b border-zinc-800 bg-zinc-900/50">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-medium text-zinc-300">Select data to fetch:</h3>
                    <div className="flex gap-2">
                       <button onClick={() => setFetchFields({title:true, description:true, type:true, year:true, releaseDate:true, country:true, runtime:true, imdbRating:true, imdbLink:true, trailerUrl:true, cast:true, genres:true, posterUrl:true, backdropUrl:true})} className="text-xs px-2 py-1 bg-zinc-800 hover:bg-zinc-700 rounded text-zinc-300">Select All</button>
                       <button onClick={() => setFetchFields({title:false, description:false, type:false, year:false, releaseDate:false, country:false, runtime:false, imdbRating:false, imdbLink:false, trailerUrl:false, cast:false, genres:false, posterUrl:false, backdropUrl:false})} className="text-xs px-2 py-1 bg-zinc-800 hover:bg-zinc-700 rounded text-zinc-300">Deselect All</button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto custom-scrollbar">
                    {Object.entries(fetchFields).map(([key, val]) => (
                      <label key={key} className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={val} onChange={e => setFetchFields(f => ({ ...f, [key]: e.target.checked }))} className="w-4 h-4 rounded border-zinc-700 text-emerald-500 focus:ring-emerald-500/20 bg-zinc-900" />
                        <span className="text-xs text-zinc-400 font-medium uppercase">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                      </label>
                    ))}
                  </div>
               </div>
            )}

            <div className="p-4 flex-1 overflow-y-auto">
               <div className="space-y-2 mb-4">
                 {results.map(r => (
                   <div key={r.id} className="flex items-center justify-between p-3 bg-zinc-900 rounded-lg border border-zinc-800">
                     <span className="text-sm truncate w-2/3">{r.title}</span>
                     <div className="flex items-center gap-2">
                       {r.status === 'pending' && <span className="text-xs text-zinc-500">Wait</span>}
                       {r.status === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                       {r.status === 'error' && <XCircle className="w-4 h-4 text-red-500" />}
                       <span className={`text-xs ${
                          r.status === 'success' ? 'text-emerald-500' :
                          r.status === 'error' ? 'text-red-500' : 'text-zinc-500'
                       } truncate max-w-[100px]`}>
                         {r.message}
                       </span>
                     </div>
                   </div>
                 ))}
               </div>
            </div>

            <div className="p-4 border-t border-zinc-800 bg-zinc-900 rounded-b-xl">
               <div className="w-full bg-zinc-800 h-2 rounded-full overflow-hidden mb-4">
                 <div className="bg-emerald-500 h-full transition-all duration-300" style={{ width: `${progress}%` }} />
               </div>
               <button
                 onClick={handleStart}
                 disabled={isProcessing || progress === 100}
                 className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white py-3 rounded-lg font-bold flex items-center justify-center gap-2"
               >
                 {isProcessing ? (
                   <><Loader2 className="w-5 h-5 animate-spin" /> Processing...</>
                 ) : progress === 100 ? (
                   'Completed'
                 ) : (
                   'Start Batch Fetch'
                 )}
               </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
