import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';
import { Plus, Edit2, Trash2, Share2, Film, Tv, X, Save, Upload, Search, Eye, EyeOff, ArrowUp, ArrowDown, Copy, ClipboardPaste, GripVertical, Bell, RefreshCw, ChevronDown, ChevronUp, User, Lock, Loader2, MessageCircle, MoreVertical, Link2, AlertCircle, Check, TrendingUp, Clock } from 'lucide-react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Content, Genre, Language, Quality, QualityLinks, Season, Episode, LinkDef, Role, Trailer } from '../types';

interface QualityInputsProps {
  links: QualityLinks;
  onChange: (updater: QualityLinks | ((prev: QualityLinks) => QualityLinks)) => void;
  droppableId: string;
}

const QualityInputs: React.FC<QualityInputsProps> = ({ links, onChange, droppableId }) => {
  const safeLinks = links || [];
  const handleUrlBlur = async (url: string, idx: number) => {
    if (!url) return;
    try {
      const res = await fetch("/api/check-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.fileSize) {
          let sizeInBytes = data.fileSize;
          let size = 0;
          let unit: 'MB' | 'GB' = 'MB';
          
          if (sizeInBytes >= 1000 * 1000 * 1000) {
            size = sizeInBytes / (1000 * 1000 * 1000);
            unit = 'GB';
          } else {
            size = sizeInBytes / (1000 * 1000);
            unit = 'MB';
          }
          
          onChange(prevLinks => {
            const currentLinks = Array.isArray(prevLinks) ? prevLinks : [];
            const newLinks = [...currentLinks];
            if (newLinks[idx]) {
              newLinks[idx] = {
                ...newLinks[idx],
                size: size.toFixed(2).replace(/\.00$/, ''),
                unit: unit
              };
            }
            return newLinks;
          });
        }
      }
    } catch (e) {
      console.error("Failed to check link info", e);
    }
  };

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const items = Array.from(links);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    onChange(items);
  };

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <Droppable droppableId={droppableId}>
        {(provided) => (
          <div 
            {...provided.droppableProps}
            ref={provided.innerRef}
            className="space-y-3"
          >
            {safeLinks.map((link, idx) => (
              <Draggable key={link.id} draggableId={link.id} index={idx}>
                {(provided, snapshot) => (
                  <div 
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    className={`flex flex-col gap-2 bg-zinc-50 dark:bg-zinc-900 p-3 rounded-xl border ${snapshot.isDragging ? 'border-emerald-500 shadow-lg shadow-emerald-500/20 z-50' : 'border-zinc-200 dark:border-zinc-800'} transition-all`}
                  >
                      {/* 1st line: Name field */}
                      <div className="flex gap-2 items-center">
                        <input
                          type="text"
                          placeholder="Name (e.g. 1080p, WEB-DL)"
                          value={link.name}
                          onChange={(e) => {
                            onChange(prev => {
                              const currentLinks = Array.isArray(prev) ? prev : [];
                              const newLinks = [...currentLinks];
                              newLinks[idx] = { ...newLinks[idx], name: e.target.value };
                              return newLinks;
                            });
                          }}
                          className={`${droppableId.startsWith('episode-links') ? 'w-45' : 'w-55'} bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-emerald-500`}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            onChange(prev => {
                              const currentLinks = Array.isArray(prev) ? prev : [];
                              return [...currentLinks, { id: Math.random().toString(36).substr(2, 9), name: '', url: '', size: '', unit: 'MB' }];
                            });
                          }}
                          className="p-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 rounded-lg hover:bg-emerald-500/20 transition-colors"
                          title="Add Link"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      {/* 2nd line: Size, Unit, Delete, Drag and drop */}
                      <div className="flex gap-2 items-center">
                        <div className="flex gap-2 items-center shrink-0">
                          <input
                            type="number"
                            placeholder="Size"
                            value={link.size}
                            onChange={(e) => {
                              onChange(prev => {
                                const currentLinks = Array.isArray(prev) ? prev : [];
                                const newLinks = [...currentLinks];
                                newLinks[idx] = { ...newLinks[idx], size: e.target.value };
                                return newLinks;
                              });
                            }}
                            className="w-20 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:border-emerald-500"
                          />
                          <div className="flex bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg p-0.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                onChange(prev => {
                                  const currentLinks = Array.isArray(prev) ? prev : [];
                                  const newLinks = [...currentLinks];
                                  newLinks[idx] = { ...newLinks[idx], unit: 'MB' };
                                  return newLinks;
                                });
                              }}
                              className={`px-2 py-1 rounded-md text-xs font-bold transition-all ${link.unit === 'MB' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'text-zinc-500 hover:text-zinc-600 dark:text-zinc-300'}`}
                            >
                              MB
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                onChange(prev => {
                                  const currentLinks = Array.isArray(prev) ? prev : [];
                                  const newLinks = [...currentLinks];
                                  newLinks[idx] = { ...newLinks[idx], unit: 'GB' };
                                  return newLinks;
                                });
                              }}
                              className={`px-2 py-1 rounded-md text-xs font-bold transition-all ${link.unit === 'GB' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'text-zinc-500 hover:text-zinc-600 dark:text-zinc-300'}`}
                            >
                              GB
                            </button>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            onChange(prev => {
                              const currentLinks = Array.isArray(prev) ? prev : [];
                              return currentLinks.filter((_, i) => i !== idx);
                            });
                          }}
                          className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors shrink-0 ml-auto"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                        <div {...provided.dragHandleProps} className="text-zinc-600 hover:text-zinc-500 dark:text-zinc-400 cursor-grab active:cursor-grabbing p-2 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-lg transition-colors">
                          <GripVertical className="w-4 h-4" />
                        </div>
                      </div>
                    <div className="flex gap-2 items-center">
                      <input
                        type="text"
                        placeholder="URL"
                        value={link.url}
                        onChange={(e) => {
                          onChange(prev => {
                            const currentLinks = Array.isArray(prev) ? prev : [];
                            const newLinks = [...currentLinks];
                            newLinks[idx] = { ...newLinks[idx], url: e.target.value };
                            return newLinks;
                          });
                        }}
                        onBlur={(e) => handleUrlBlur(e.target.value, idx)}
                        className="flex-1 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
            {safeLinks.length === 0 && (
              <button
                type="button"
                onClick={() => {
                  onChange([{ id: Math.random().toString(36).substr(2, 9), name: '', url: '', size: '', unit: 'MB' }]);
                }}
                className="w-full py-3 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-500 hover:text-emerald-500 hover:border-emerald-500 transition-all flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                <span className="text-sm font-medium">
                  Add {droppableId.startsWith('movie-links') ? 'Movie' : 
                        droppableId.includes('zip') ? 'ZIP' : 
                        droppableId.includes('mkv') ? 'MKV' : 
                        droppableId.includes('episode') ? 'Episode' : ''} Link
                </span>
              </button>
            )}
          </div>
        )}
      </Droppable>
    </DragDropContext>
  );
};


export const ContentFormModal = ({ state, actions }: { state: any, actions: any }) => {
  const {
      isModalOpen, editingId, contentList, profile, type, status, initialStatus, addToTrending, addToNewlyAdded,
      title, showTitleSuggestions, disableSuggestions, description, posterUrl, trailerUrl, trailerTitle, trailerYoutubeTitle,
      trailerSeasonNumber, trailers, sampleUrl, imdbLink, imdbRating, year, releaseDate, runtime, selectedGenres, genres,
      selectedLanguages, languages, selectedQuality, qualities, subtitles, cast, country, isDescriptionExpanded, isCastExpanded,
      isCountryExpanded, movieLinks, seasons, expandedEpisodes, isSaving, titleSuggestions
  } = state;

  const {
      setIsModalOpen, setIsAutoFillModalOpen, setType, setStatus, setTitle, setShowTitleSuggestions, setDisableSuggestions,
      setDescription, setPosterUrl, handleImageUpload, setTrailerUrl, setTrailerTitle, setTrailerYoutubeTitle, setTrailerSeasonNumber,
      setTrailers, setSampleUrl, setImdbLink, setImdbRating, setYear, setReleaseDate, setRuntime, setSelectedGenres, setManageModal,
      setSelectedLanguages, setSelectedQuality, setSubtitles, setCast, setCountry, setIsDescriptionExpanded, setIsCastExpanded,
      setIsCountryExpanded, setMovieLinks, setSeasons, setExpandedEpisodes, handleSave, setIsLinkCheckerOpen, setIsMasterFetchModalOpen
  } = actions;

  return (
    <AnimatePresence>
        {isModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50"
          >
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2 }}
              className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-4xl my-8 flex flex-col max-h-[90vh] shadow-2xl"
            >
              <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between sticky top-0 bg-zinc-50 dark:bg-zinc-900 z-10 rounded-t-2xl">
                <div className="flex items-center gap-2 sm:gap-4">
                  <div className="flex flex-col">
                    <h2 className="text-lg sm:text-xl font-bold whitespace-nowrap">{editingId ? 'Edit Content' : 'Add Content'}</h2>
                    {(() => {
                      const editingContent = editingId ? contentList.find(c => c.id === editingId) : null;
                      if (!editingContent) return null;
                      const shouldShow = ['owner', 'admin'].includes(profile?.role) && 
                        editingContent.addedByRole && 
                        !['owner', 'admin'].includes(editingContent.addedByRole) && 
                        editingContent.addedByName;
                      
                      if (shouldShow) {
                        return <span className="text-xs text-zinc-400 dark:text-zinc-500 italic flex -mt-1">By {editingContent.addedByName}</span>;
                      }
                      return null;
                    })()}
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsAutoFillModalOpen(true)}
                    className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 px-2 sm:px-3 py-1.5 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 sm:gap-2 transition-colors border border-emerald-500/20 whitespace-nowrap"
                  >
                    <ClipboardPaste className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> Auto-Fill from Text
                  </button>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:text-white p-1 sm:p-2 ml-2 shrink-0 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-4">
                <form id="content-form" onSubmit={handleSave} className="space-y-4">
                <div className="grid grid-cols-1 gap-4">
                  
                  {/* 1. Type+Status */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex gap-4">
                      <div className="flex-1">
                        <label className="block text-xs font-medium text-zinc-500 mb-1">Type</label>
                        <div className="flex gap-2">
                          <label className={clsx(
                            "flex-1 flex items-center justify-center gap-1 p-1.5 rounded-lg border cursor-pointer transition-colors text-xs",
                            type === 'movie' 
                              ? 'bg-blue-500/10 border-blue-500 text-blue-500' 
                              : 'bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400'
                          )}>
                            <input type="radio" name="type" value="movie" checked={type === 'movie'} onChange={() => setType('movie')} className="hidden" />
                            <Film className="w-3.5 h-3.5" /> Movie
                          </label>
                          <label className={clsx(
                            "flex-1 flex items-center justify-center gap-1 p-1.5 rounded-lg border cursor-pointer transition-colors text-xs",
                            type === 'series' 
                              ? 'bg-purple-500/10 border-purple-500 text-purple-500' 
                              : 'bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400'
                          )}>
                            <input type="radio" name="type" value="series" checked={type === 'series'} onChange={() => setType('series')} className="hidden" />
                            <Tv className="w-3.5 h-3.5" /> Series
                          </label>
                        </div>
                      </div>
                      <div className="flex-1">
                        <label className="block text-xs font-medium text-zinc-500 mb-1">Status</label>
                        <div className="flex gap-2">
                          {(profile?.role === 'admin' || profile?.role === 'owner') && (
                            <>
                              <label className={`flex-1 flex items-center justify-center gap-1 p-1.5 rounded-lg border cursor-pointer transition-colors text-xs ${status === 'published' ? 'bg-emerald-500/10 border-emerald-500 text-emerald-500' : 'bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400'}`}>
                                <input type="radio" name="status" value="published" checked={status === 'published'} onChange={() => setStatus('published')} className="hidden" />
                                <Eye className="w-3.5 h-3.5" /> Pub
                              </label>
                              <label className={`flex-1 flex items-center justify-center gap-1 p-1.5 rounded-lg border cursor-pointer transition-colors text-xs ${status === 'draft' ? 'bg-yellow-500/10 border-yellow-500 text-yellow-500' : 'bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400'}`}>
                                <input type="radio" name="status" value="draft" checked={status === 'draft'} onChange={() => setStatus('draft')} className="hidden" />
                                <EyeOff className="w-3.5 h-3.5" /> Draft
                              </label>
                            </>
                          )}
                          {(profile?.role === 'content_manager' || profile?.role === 'manager') && (
                            <label className={`flex-1 flex items-center justify-center gap-1 p-1.5 rounded-lg border cursor-pointer transition-colors text-xs bg-yellow-500/10 border-yellow-500 text-yellow-500`}>
                              <EyeOff className="w-3.5 h-3.5" /> Draft
                            </label>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* 2. Title */}
                  <div className="relative">
                    <div className="flex justify-between items-center mb-1">
                      <label className="block text-xs font-medium text-zinc-500">Title</label>
                      {titleSuggestions.length > 0 && (
                        <button 
                          type="button"
                          onClick={() => setDisableSuggestions(!disableSuggestions)}
                          className="text-[10px] bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 px-2 py-0.5 rounded-md text-zinc-400 dark:text-zinc-500 hover:text-emerald-500 flex items-center gap-1 transition-colors border border-zinc-200 dark:border-zinc-800"
                          title={disableSuggestions ? "Show similar titles" : "Hide similar titles"}
                        >
                          {disableSuggestions ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
                          {disableSuggestions ? 'Show Similar' : 'Hide Similar'}
                        </button>
                      )}
                    </div>
                    <input 
                      type="text" 
                      value={title} 
                      onChange={(e) => {
                        setTitle(e.target.value);
                        setShowTitleSuggestions(true);
                      }} 
                      onFocus={() => {
                        setShowTitleSuggestions(true);
                        setDisableSuggestions(false);
                      }}
                      onBlur={() => setTimeout(() => setShowTitleSuggestions(false), 200)}
                      className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-emerald-500" 
                    />
                    {showTitleSuggestions && !disableSuggestions && titleSuggestions.length > 0 && (
                      <div className="absolute z-50 w-full mt-1 bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                        <div className="p-2 text-xs text-zinc-500 dark:text-zinc-400 border-b border-zinc-200 dark:border-zinc-800">Similar content found:</div>
                        {titleSuggestions.map(suggestion => (
                          <div 
                            key={suggestion.id} 
                            className="px-3 py-2 hover:bg-zinc-200 dark:hover:bg-zinc-800 cursor-pointer text-sm flex justify-between items-center"
                            onClick={() => {
                              setTitle(suggestion.title);
                              setShowTitleSuggestions(false);
                            }}
                          >
                            <span className="text-zinc-900 dark:text-zinc-200">{suggestion.title}</span>
                            <span className="text-xs text-zinc-500 capitalize">{suggestion.type} • {suggestion.year}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  
                  {/* 3. Release Year+ Fetch +Master Fetch */}
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 mb-1">Release Year</label>
                    <div className="flex gap-2">
                      <input type="number" value={year || ''} onChange={(e) => setYear(parseInt(e.target.value) || new Date().getFullYear())} className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-emerald-500" />
                      <button type="button" onClick={() => setIsLinkCheckerOpen(true)} className="bg-emerald-500 hover:bg-emerald-600 text-white px-2 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-2 whitespace-nowrap" title="Add Links via Link Checker">
                        <RefreshCw className="w-3.5 h-3.5" />
                        Add Links
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsMasterFetchModalOpen(true)}
                        className="px-3 py-1.5 bg-black border border-cyan-500 text-white rounded-lg text-xs font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <Search className="w-3 h-3" />
                        Master Fetch
                      </button>
                    </div>
                  </div>

                  {/* 4. Release date+Runtime */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-zinc-500 mb-1">Release Date</label>
                      <input type="text" placeholder="DD-MM-YYYY" value={releaseDate} onChange={(e) => setReleaseDate(e.target.value)} className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-emerald-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-500 mb-1">Runtime</label>
                      <input type="text" placeholder="e.g. 120 min" value={runtime} onChange={(e) => setRuntime(e.target.value)} className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-emerald-500" />
                    </div>
                  </div>

                  {/* 5. Trailer Links */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-medium text-zinc-500">
                        Trailers (YouTube)
                      </label>
                      <button
                        type="button"
                        onClick={() => setTrailers(prev => [...prev, { id: Math.random().toString(36).substr(2, 9), url: '', title: '' }])}
                        className="p-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 rounded-lg hover:bg-emerald-500/20 transition-colors"
                        title="Add Trailer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    
                    {/* Trailer 1 (Main Trailer) */}
                    <div className="space-y-2">
                      <div className="flex flex-col">
                        <label className="block text-[10px] font-medium text-zinc-400 uppercase tracking-wider">
                          Trailer 1
                        </label>
                        {trailerYoutubeTitle && (
                          <span className="text-[10px] text-emerald-600 break-words leading-tight">{trailerYoutubeTitle}</span>
                        )}
                      </div>
                      <div className="flex flex-col gap-2 bg-zinc-50 dark:bg-zinc-900/50 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800">
                        <input 
                          type="text" 
                          placeholder="Trailer Title (e.g. Official Trailer, Teaser)"
                          value={trailerTitle}
                          onChange={(e) => setTrailerTitle(e.target.value)}
                          className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-emerald-500" 
                        />
                        <input 
                          type="url" 
                          value={trailerUrl} 
                          onChange={(e) => setTrailerUrl(e.target.value)} 
                          placeholder="YouTube URL"
                          className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-emerald-500" 
                        />
                        {type === 'series' && (
                          <div className="flex items-center gap-2">
                            <label className="text-[10px] text-zinc-500">Season (Optional):</label>
                            <input 
                              type="number" 
                              placeholder="Season #"
                              value={trailerSeasonNumber || ''}
                              onChange={(e) => setTrailerSeasonNumber(parseInt(e.target.value) || undefined)}
                              className="w-16 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-emerald-500" 
                            />
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Additional Trailers */}
                    {trailers.map((trailer, idx) => (
                      <div key={trailer.id} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex flex-col">
                            <label className="block text-[10px] font-medium text-zinc-400 uppercase tracking-wider">
                              Trailer {idx + 2}
                            </label>
                            {trailer.youtubeTitle && (
                              <span className="text-[10px] text-emerald-600 break-words leading-tight">{trailer.youtubeTitle}</span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => setTrailers(prev => prev.filter((_, i) => i !== idx))}
                            className="p-1 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="flex flex-col gap-2 bg-zinc-50 dark:bg-zinc-900/50 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800">
                          <input 
                            type="text" 
                            placeholder="Trailer Title (e.g. Official Trailer, Teaser)"
                            value={trailer.title}
                            onChange={(e) => {
                              const newTrailers = [...trailers];
                              newTrailers[idx] = { ...newTrailers[idx], title: e.target.value };
                              setTrailers(newTrailers);
                            }}
                            className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-emerald-500" 
                          />
                          <input 
                            type="url" 
                            placeholder="YouTube URL"
                            value={trailer.url}
                            onChange={(e) => {
                              const newTrailers = [...trailers];
                              newTrailers[idx] = { ...newTrailers[idx], url: e.target.value };
                              setTrailers(newTrailers);
                            }}
                            className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-emerald-500" 
                          />
                          {type === 'series' && (
                            <div className="flex items-center gap-2">
                              <label className="text-[10px] text-zinc-500">Season (Optional):</label>
                              <input 
                                type="number" 
                                placeholder="Season #"
                                value={trailer.seasonNumber || ''}
                                onChange={(e) => {
                                  const newTrailers = [...trailers];
                                  newTrailers[idx] = { ...newTrailers[idx], seasonNumber: parseInt(e.target.value) || undefined };
                                  setTrailers(newTrailers);
                                }}
                                className="w-16 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-emerald-500" 
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* 6. IMDb Link + Rating */}
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 mb-1">IMDb Link & Rating (Optional)</label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <input 
                          type="url" 
                          value={imdbLink} 
                          onChange={(e) => setImdbLink(e.target.value)} 
                          className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-emerald-500" 
                          placeholder="https://www.imdb.com/title/..." 
                        />
                      </div>
                      <div className="w-24">
                        <input 
                          type="text" 
                          value={imdbRating} 
                          onChange={(e) => setImdbRating(e.target.value)} 
                          className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-emerald-500" 
                          placeholder="Rating" 
                        />
                      </div>
                    </div>
                  </div>

                  {/* 7. Poster link+Upload from gallery (remove auto fetch button) */}
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-zinc-500 mb-1">Poster (URL or Upload)</label>
                      <div className="flex gap-2">
                        <input type="text" placeholder="https://..." value={posterUrl} onChange={(e) => setPosterUrl(e.target.value)} className="flex-1 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-emerald-500" />
                        <label className="flex items-center justify-center bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white px-3 py-1.5 rounded-lg cursor-pointer transition-colors">
                          <Upload className="w-4 h-4" />
                          <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                        </label>
                      </div>
                      {posterUrl && (
                        <div className="mt-1 text-[10px] text-emerald-500 truncate">
                          {posterUrl.startsWith('data:image') ? 'Image uploaded successfully' : 'Using image URL'}
                        </div>
                      )}
                    </div>
                    {posterUrl && (
                      <div className="w-12 aspect-[2/3] rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shrink-0">
                        <img 
                          src={posterUrl} 
                          alt="Mini Poster" 
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = 'https://picsum.photos/seed/error/200/300';
                          }}
                        />
                      </div>
                    )}
                  </div>

                  {/* 8. Description+Cast+Country (with Arrows) */}
                  <div className="grid grid-cols-3 gap-4">
                    <div className="relative">
                      <div 
                        className="flex items-center justify-between bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-1 cursor-pointer"
                        onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                      >
                        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Description</span>
                        {isDescriptionExpanded ? <ChevronUp className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" /> : <ChevronDown className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" />}
                      </div>
                      {isDescriptionExpanded && (
                        <div className="mt-1">
                          <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-emerald-500" placeholder="Enter description..." />
                        </div>
                      )}
                    </div>
                    <div className="relative">
                      <div 
                        className="flex items-center justify-between bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-1 cursor-pointer"
                        onClick={() => setIsCastExpanded(!isCastExpanded)}
                      >
                        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Cast</span>
                        {isCastExpanded ? <ChevronUp className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" /> : <ChevronDown className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" />}
                      </div>
                      {isCastExpanded && (
                        <div className="mt-1">
                          <textarea rows={3} value={cast} onChange={(e) => setCast(e.target.value)} className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-emerald-500" placeholder="Enter cast (comma separated)..." />
                        </div>
                      )}
                    </div>
                    <div className="relative">
                      <div 
                        className="flex items-center justify-between bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-1 cursor-pointer"
                        onClick={() => setIsCountryExpanded(!isCountryExpanded)}
                      >
                        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Country</span>
                        {isCountryExpanded ? <ChevronUp className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" /> : <ChevronDown className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400" />}
                      </div>
                      {isCountryExpanded && (
                        <div className="mt-1">
                          <textarea rows={3} value={country} onChange={(e) => setCountry(e.target.value)} className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-emerald-500" placeholder="Enter country (comma separated)..." />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 9. Genres */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-xs font-medium text-zinc-500">Genres</label>
                      <button type="button" onClick={() => setManageModal({ isOpen: true, type: 'genre' })} className="text-[10px] bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 px-2 py-0.5 rounded hover:bg-zinc-300 dark:hover:bg-zinc-700">Manage</button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {genres.map(g => {
                        const isSelected = selectedGenres.includes(g.id);
                        return (
                          <button
                            key={g.id}
                            type="button"
                            onClick={() => {
                              if (isSelected) {
                                setSelectedGenres(selectedGenres.filter(id => id !== g.id));
                              } else {
                                setSelectedGenres([...selectedGenres, g.id]);
                              }
                            }}
                            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors border ${
                              isSelected 
                                ? 'bg-emerald-500/20 border-emerald-500 text-emerald-500'
                                : 'bg-zinc-50 dark:bg-zinc-900 border-zinc-300 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:text-white'
                            }`}
                          >
                            {g.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 10. Languages */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-xs font-medium text-zinc-500">Languages</label>
                      <button type="button" onClick={() => setManageModal({ isOpen: true, type: 'language' })} className="text-[10px] bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 px-2 py-0.5 rounded hover:bg-zinc-300 dark:hover:bg-zinc-700">Manage</button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {languages.map(l => {
                        const isSelected = selectedLanguages.includes(l.id);
                        return (
                          <button
                            key={l.id}
                            type="button"
                            onClick={() => {
                              if (isSelected) {
                                setSelectedLanguages(selectedLanguages.filter(id => id !== l.id));
                              } else {
                                setSelectedLanguages([...selectedLanguages, l.id]);
                              }
                            }}
                            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors border ${
                              isSelected 
                                ? 'bg-emerald-500/20 border-emerald-500 text-emerald-500'
                                : 'bg-zinc-50 dark:bg-zinc-900 border-zinc-300 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:text-white'
                            }`}
                          >
                            {l.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 11. Print Quality */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-xs font-medium text-zinc-500">Print Quality</label>
                      <button type="button" onClick={() => setManageModal({ isOpen: true, type: 'quality' })} className="text-[10px] bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 px-2 py-0.5 rounded hover:bg-zinc-300 dark:hover:bg-zinc-700">Manage</button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {qualities.map(q => (
                        <button
                          key={q.id}
                          type="button"
                          onClick={() => setSelectedQuality(q.id)}
                          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors border ${
                            selectedQuality === q.id
                              ? 'bg-emerald-500/20 border-emerald-500 text-emerald-500'
                              : 'bg-zinc-50 dark:bg-zinc-900 border-zinc-300 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:text-white'
                          }`}
                        >
                          {q.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 11.5 Subtitles */}
                  <div className="flex items-center gap-4">
                    <label className="text-xs font-medium text-zinc-500 whitespace-nowrap">Subtitles</label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setSubtitles(true)}
                        className={`px-4 py-1 rounded-full text-xs font-medium transition-colors border ${
                          subtitles
                            ? 'bg-emerald-500/20 border-emerald-500 text-emerald-500'
                            : 'bg-zinc-50 dark:bg-zinc-900 border-zinc-300 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:text-white'
                        }`}
                      >
                        Yes
                      </button>
                      <button
                        type="button"
                        onClick={() => setSubtitles(false)}
                        className={`px-4 py-1 rounded-full text-xs font-medium transition-colors border ${
                          !subtitles
                            ? 'bg-emerald-500/20 border-emerald-500 text-emerald-500'
                            : 'bg-zinc-50 dark:bg-zinc-900 border-zinc-300 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:text-white'
                        }`}
                      >
                        No
                      </button>
                    </div>
                  </div>

                  {/* 12. Sample link */}
                  <div>
                    <input type="url" value={sampleUrl} onChange={(e) => setSampleUrl(e.target.value)} className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-emerald-500" placeholder="Sample Video file" />
                  </div>

                </div>

                <hr className="border-zinc-200 dark:border-zinc-800 my-4" />

                {type === 'movie' ? (
                  <div>
                    <h3 className="text-lg font-bold mb-4">Movie Links</h3>
                    <QualityInputs links={movieLinks} onChange={setMovieLinks} droppableId="movie-links" />
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-bold">Seasons</h3>
                      <button
                        type="button"
                        onClick={() => setSeasons([...seasons, { 
                          id: Date.now().toString(), 
                          seasonNumber: seasons.length + 1, 
                          zipLinks: [
                            { id: Math.random().toString(36).substr(2, 9), name: '480p', url: '', size: '', unit: 'GB' },
                            { id: Math.random().toString(36).substr(2, 9), name: '720p', url: '', size: '', unit: 'GB' },
                            { id: Math.random().toString(36).substr(2, 9), name: '1080p', url: '', size: '', unit: 'GB' }
                          ], 
                          mkvLinks: [
                            { id: Math.random().toString(36).substr(2, 9), name: '480p', url: '', size: '', unit: 'GB' },
                            { id: Math.random().toString(36).substr(2, 9), name: '720p', url: '', size: '', unit: 'GB' },
                            { id: Math.random().toString(36).substr(2, 9), name: '1080p', url: '', size: '', unit: 'GB' }
                          ],
                          episodes: [] 
                        }])}
                        className="text-emerald-500 hover:text-emerald-400 text-sm font-medium flex items-center gap-1"
                      >
                        <Plus className="w-4 h-4" /> Add Season
                      </button>
                    </div>
                    
                    <div className="space-y-6">
                      {seasons.map((season, sIdx) => (
                        <div key={season.id} className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4">
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex flex-col gap-4">
                              <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2">
                                  <h4 className="font-bold">Season</h4>
                                  <input
                                    type="number"
                                    step="0.1"
                                    value={season.seasonNumber}
                                    onChange={(e) => {
                                      const newSeasons = [...seasons];
                                      newSeasons[sIdx].seasonNumber = parseFloat(e.target.value) || 0;
                                      setSeasons(newSeasons);
                                    }}
                                    className="w-20 bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded px-2 py-1 text-sm text-center"
                                  />
                                </div>
                                <div className="flex items-center gap-2">
                                  <h4 className="font-bold text-sm text-zinc-500 dark:text-zinc-400">Year</h4>
                                  <input
                                    type="number"
                                    value={season.year || ''}
                                    onChange={(e) => {
                                      const newSeasons = [...seasons];
                                      newSeasons[sIdx].year = parseInt(e.target.value) || undefined;
                                      setSeasons(newSeasons);
                                    }}
                                    placeholder="YYYY"
                                    className="w-20 bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded px-2 py-1 text-sm text-center"
                                  />
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <h4 className="font-bold text-sm text-zinc-500 dark:text-zinc-400">Title</h4>
                                <input
                                  type="text"
                                  value={season.title || ''}
                                  onChange={(e) => {
                                    const newSeasons = [...seasons];
                                    newSeasons[sIdx].title = e.target.value;
                                    setSeasons(newSeasons);
                                  }}
                                  placeholder="Season Title"
                                  className="flex-1 bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded px-2 py-1 text-sm"
                                />
                              </div>
                            </div>
                            <button type="button" onClick={() => setSeasons(seasons.filter((_, i) => i !== sIdx))} className="text-red-500 hover:text-red-400 p-1">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                          
                          <div className="mb-6">
                            <h5 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-2">Season ZIP Links</h5>
                            <QualityInputs 
                              links={season.zipLinks} 
                              onChange={(updater) => {
                                setSeasons(prev => {
                                  const newSeasons = [...prev];
                                  const currentLinks = newSeasons[sIdx].zipLinks;
                                  newSeasons[sIdx].zipLinks = typeof updater === 'function' ? updater(currentLinks) : updater;
                                  return newSeasons;
                                });
                              }}
                              droppableId={`season-zip-${sIdx}`}
                            />
                          </div>

                          <div className="mb-6">
                            <h5 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-2">Season MKV Links</h5>
                            <QualityInputs 
                              links={season.mkvLinks || []} 
                              onChange={(updater) => {
                                setSeasons(prev => {
                                  const newSeasons = [...prev];
                                  const currentLinks = newSeasons[sIdx].mkvLinks || [];
                                  newSeasons[sIdx].mkvLinks = typeof updater === 'function' ? updater(currentLinks) : updater;
                                  return newSeasons;
                                });
                              }}
                              droppableId={`season-mkv-${sIdx}`}
                            />
                          </div>

                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <h5 className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Episodes</h5>
                              <button
                                type="button"
                                onClick={() => {
                                  const newSeasons = [...seasons];
                                  newSeasons[sIdx].episodes.push({
                                    id: Date.now().toString(),
                                    episodeNumber: newSeasons[sIdx].episodes.length + 1,
                                    title: `Episode ${newSeasons[sIdx].episodes.length + 1}`,
                                    links: [
                                      { id: Math.random().toString(36).substr(2, 9), name: '720p', url: '', size: '', unit: 'MB' }
                                    ]
                                  });
                                  setSeasons(newSeasons);
                                }}
                                className="text-emerald-500 hover:text-emerald-400 text-xs font-medium flex items-center gap-1"
                              >
                                <Plus className="w-3 h-3" /> Add Episode
                              </button>
                            </div>
                            
                            <div className="space-y-4">
                              {season.episodes.map((ep, eIdx) => (
                                <div key={ep.id} className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4">
                                  <div className="flex gap-1 mb-4">
                                    <input
                                      type="number"
                                      value={ep.episodeNumber}
                                      onChange={(e) => {
                                        const newSeasons = [...seasons];
                                        newSeasons[sIdx].episodes[eIdx].episodeNumber = parseInt(e.target.value) || 0;
                                        setSeasons(newSeasons);
                                      }}
                                      className="w-10 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-1 py-1 text-sm text-center"
                                      placeholder="Ep #"
                                    />
                                    <input
                                      type="text"
                                      value={ep.duration || ''}
                                      onChange={(e) => {
                                        const newSeasons = [...seasons];
                                        newSeasons[sIdx].episodes[eIdx].duration = e.target.value;
                                        setSeasons(newSeasons);
                                      }}
                                      className="w-14 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-1 py-1 text-sm text-center"
                                      placeholder="Dur"
                                    />
                                    <input
                                      type="text"
                                      value={ep.title}
                                      onChange={(e) => {
                                        const newSeasons = [...seasons];
                                        newSeasons[sIdx].episodes[eIdx].title = e.target.value;
                                        setSeasons(newSeasons);
                                      }}
                                      className="flex-1 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm"
                                      placeholder="Episode Title"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => setExpandedEpisodes(prev => ({ ...prev, [ep.id]: !prev[ep.id] }))}
                                      className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:text-white p-2 transition-colors"
                                      title="Toggle Description"
                                    >
                                      {expandedEpisodes[ep.id] ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                    </button>
                                    <button type="button" onClick={() => {
                                      const newSeasons = [...seasons];
                                      newSeasons[sIdx].episodes = newSeasons[sIdx].episodes.filter((_, i) => i !== eIdx);
                                      setSeasons(newSeasons);
                                    }} className="text-red-500 hover:text-red-400 p-2">
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                  
                                  {expandedEpisodes[ep.id] && (
                                    <div className="mb-4">
                                      <textarea
                                        value={ep.description || ''}
                                        onChange={(e) => {
                                          const newSeasons = [...seasons];
                                          newSeasons[sIdx].episodes[eIdx].description = e.target.value;
                                          setSeasons(newSeasons);
                                        }}
                                        className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm min-h-[80px]"
                                        placeholder="Episode Description..."
                                      />
                                    </div>
                                  )}

                                  <div className="mb-4">
                                    <h6 className="text-xs font-medium text-zinc-500 mb-2 uppercase tracking-wider">Episode Links</h6>
                                    <QualityInputs 
                                      links={ep.links} 
                                      onChange={(updater) => {
                                        setSeasons(prev => {
                                          const newSeasons = [...prev];
                                          const currentLinks = newSeasons[sIdx].episodes[eIdx].links;
                                          newSeasons[sIdx].episodes[eIdx].links = typeof updater === 'function' ? updater(currentLinks) : updater;
                                          return newSeasons;
                                        });
                                      }}
                                      droppableId={`episode-links-${sIdx}-${eIdx}`}
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </form>
            </div>

            <div className="p-4 sm:p-6 border-t border-zinc-200 dark:border-zinc-800 flex justify-between gap-2 sticky bottom-0 bg-zinc-50 dark:bg-zinc-900 z-10 rounded-b-2xl">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-5 py-2.5 text-sm rounded-xl font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:text-white hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="content-form"
                disabled={isSaving}
                className="bg-emerald-500 hover:bg-emerald-600 text-white px-5 py-2.5 text-sm rounded-xl font-medium flex items-center gap-2 transition-colors disabled:opacity-50"
              >
                {isSaving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                {isSaving ? 'Saving...' : 'Save Content'}
              </button>
            </div>
          </motion.div>
        </motion.div>
        )}
      </AnimatePresence>
  );
};
