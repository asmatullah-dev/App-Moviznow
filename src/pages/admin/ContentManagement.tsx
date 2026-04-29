import React, { useState, useEffect, useMemo, useRef, memo, useCallback } from 'react';
import { useSearchParams, Link, useLocation, useNavigate } from 'react-router-dom';
import { db } from '../../firebase';
import { collection, addDoc, deleteDoc, doc, updateDoc, onSnapshot, writeBatch, getDocs, query, where, arrayUnion, deleteField } from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { useContent } from '../../contexts/ContentContext';
import { useUsers } from '../../contexts/UsersContext';
import { Content, Genre, Language, Quality, QualityLinks, Season, Episode, LinkDef, Role, Trailer } from '../../types';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';
import { Plus, Edit2, Trash2, Share2, Film, Tv, X, Save, Upload, Search, Eye, EyeOff, ArrowUp, ArrowDown, Copy, ClipboardPaste, GripVertical, Bell, RefreshCw, ChevronDown, ChevronUp, User, Lock, Loader2, MessageCircle, MoreVertical, Link2, AlertCircle, Check, TrendingUp, Clock } from 'lucide-react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import ConfirmModal from '../../components/ConfirmModal';
import { MediaModal, findTMDBByImdb, searchTMDBByTitle, fetchTMDBDetails, fetchSeriesSeasons, fetchIMDbRating } from '../../components/MediaModal';
import { LinkCheckerModal } from '../../components/LinkCheckerModal';
import { AdjustContentsModal } from '../../components/AdjustContentsModal';
import ManageModal from '../../components/ManageModal';
import { formatContentTitle, formatReleaseDate, formatRuntime, formatDateToMonthDDYYYY } from '../../utils/contentUtils';
import { smartSearch } from '../../utils/searchUtils';
import { handleFirestoreError, OperationType } from '../../utils/firestoreErrorHandler';
import { generateTinyUrl } from '../../utils/tinyurl';
import { useModalBehavior } from '../../hooks/useModalBehavior';
import { useSettings } from '../../contexts/SettingsContext';
import { memoryStore } from '../../utils/memoryStore';

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

import { BatchFetchModal } from '../../components/BatchFetchModal';

interface ContentCardProps {
  content: Content;
  profile: any;
  isSelected: boolean;
  anySelected: boolean;
  isActiveDropdown: boolean;
  isDuplicate: boolean;
  isShareLoading: boolean;
  isWhatsappLoading: boolean;
  handleSelectContent: (id: string, e?: React.SyntheticEvent) => void;
  handleShare: (content: Content, mode: 'standard' | 'whatsapp') => void;
  handleEdit: (content: Content) => void;
  handleCopyData: (content: Content) => void;
  setDeleteId: (id: string) => void;
  setNotificationModal: (modal: { isOpen: boolean; content: Content | null; status: 'idle' | 'sending' | 'success' | 'error' }) => void;
  setActiveDropdownId: (id: string | null) => void;
  getMissingLabels: (content: Content, profile: any) => string[];
  handleAddToSpecialCollection: (contentId: string, type: 'trending' | 'newly_added') => void;
}

const ContentCard = memo(({ 
  content, profile, isSelected, anySelected, handleSelectContent, handleShare, handleEdit, 
  handleCopyData, setDeleteId, setNotificationModal, isActiveDropdown, 
  setActiveDropdownId, isDuplicate, getMissingLabels, isShareLoading, isWhatsappLoading,
  handleAddToSpecialCollection
}: ContentCardProps) => {
  const missingLabels = useMemo(() => getMissingLabels(content, profile), [content, profile, getMissingLabels]);

  return (
    <div 
      className={clsx(
        "bg-zinc-50 dark:bg-zinc-900 border rounded-xl flex flex-col group relative overflow-hidden transition-all hover:ring-2 cursor-pointer", 
        isSelected ? "ring-2 ring-emerald-500 border-emerald-500" : (isDuplicate ? "border-red-500 hover:ring-red-500/50" : "border-zinc-200 dark:border-zinc-800 hover:ring-emerald-500/50")
      )}
      onClick={(e) => {
        if (anySelected) {
          handleSelectContent(content.id, e);
        }
      }}
    >
      <label className="absolute top-0 left-0 z-30 w-16 h-16 cursor-pointer group/checkbox" onClick={(e) => e.stopPropagation()}>
        <div className="absolute top-3 left-3 w-5 h-5 flex items-center justify-center rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 group-hover/checkbox:border-emerald-500 transition-colors">
          <input 
            type="checkbox" 
            checked={isSelected}
            onChange={(e) => {
              handleSelectContent(content.id, e);
            }}
            className="w-4 h-4 rounded border-none bg-transparent text-emerald-500 focus:ring-emerald-500 focus:ring-offset-zinc-950 cursor-pointer"
          />
        </div>
      </label>
      <div className="relative aspect-[2/3] rounded-t-xl overflow-hidden">
        <Link 
          to={anySelected ? '#' : `/movie/${content.id}`} 
          onClick={(e) => {
            if (anySelected) {
              e.preventDefault();
              handleSelectContent(content.id, e);
            }
          }}
          className="block w-full h-full"
        >
          <img 
            src={content.posterUrl || 'https://picsum.photos/seed/movie/400/600'} 
            alt={content.title} 
            className="w-full h-full object-cover" 
            referrerPolicy="no-referrer"
            loading="lazy" 
          />
        </Link>
        {isDuplicate && (
          <div className="absolute top-3 left-10 z-20 pointer-events-none">
            <div className="bg-red-600 animate-pulse text-white px-2 py-0.5 rounded shadow-lg shadow-red-600/40 text-[11px] font-black uppercase tracking-widest border border-red-400">
              Duplicate
            </div>
          </div>
        )}
        {missingLabels.length > 0 && (
          <div className="absolute bottom-1 left-1 right-1 flex flex-row flex-wrap items-end gap-0.5 pointer-events-none opacity-80 group-hover:opacity-100 transition-opacity max-h-[80%] overflow-hidden">
            {missingLabels.map((lbl, idx) => (
              <div key={idx} className="bg-red-600/90 backdrop-blur-sm text-white px-1.5 py-[1px] rounded text-[9px] font-bold uppercase tracking-wider shadow-sm truncate max-w-full">
                {lbl}
              </div>
            ))}
          </div>
        )}
        <div className="absolute top-1 right-1 flex flex-col gap-1 items-end">
          <div className={clsx(
            "px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider text-white",
            content.type === 'movie' ? 'bg-blue-500/90' : 'bg-purple-500/90'
          )}>
            {content.type}
          </div>
          {content.status === 'draft' && (
            <div className="bg-yellow-500/90 text-black backdrop-blur-md px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
              <EyeOff className="w-3 h-3" />
              Draft
            </div>
          )}
        </div>
      </div>
      <div className="p-2 md:p-3 flex-1 flex flex-col">
        <h3 className="font-bold text-sm md:text-base mb-0.5 line-clamp-1" title={content.title}>{content.title}</h3>
        <p className="text-zinc-500 dark:text-zinc-400 text-xs mb-2">{content.year}</p>
        {['owner', 'admin'].includes(profile?.role) && content.addedByRole && !['owner', 'admin'].includes(content.addedByRole) && content.addedByName && (
          <p className="text-zinc-400 dark:text-zinc-500 text-[10px] italic mb-1 -mt-1">By {content.addedByName}</p>
        )}
        
        <div className="mt-auto flex flex-wrap items-center justify-between gap-1 pt-2 border-t border-zinc-200 dark:border-zinc-800/50">
          <div className="flex flex-wrap gap-1">
            <button 
              onClick={(e) => {
                e.stopPropagation();
                handleShare(content, 'whatsapp');
              }} 
              className="text-emerald-500 hover:text-emerald-400 p-1.5 transition-colors" 
              title="Share to WhatsApp" 
              disabled={isWhatsappLoading}
            >
              {isWhatsappLoading ? <RefreshCw className="w-4 h-4 md:w-5 md:h-5 animate-spin" /> : <MessageCircle className="w-4 h-4 md:w-5 md:h-5" />}
            </button>
            <button 
              onClick={(e) => {
                e.stopPropagation();
                handleShare(content, 'standard');
              }} 
              className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:text-white p-1.5 transition-colors" 
              title="Share Links & Details" 
              disabled={isShareLoading}
            >
              {isShareLoading ? <RefreshCw className="w-4 h-4 md:w-5 md:h-5 animate-spin" /> : <Share2 className="w-4 h-4 md:w-5 md:h-5" />}
            </button>
          </div>
          <div className="flex gap-1 ml-auto">
            {(profile?.role === 'admin' || profile?.role === 'owner' || content.status === 'draft') && (
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  handleEdit(content);
                }} 
                className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:text-white p-1.5 transition-colors"
              >
                <Edit2 className="w-4 h-4 md:w-5 md:h-5" />
              </button>
            )}
            <div className="relative">
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveDropdownId(isActiveDropdown ? null : content.id);
                }}
                className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white p-1.5 transition-colors"
              >
                <MoreVertical className="w-4 h-4 md:w-5 md:h-5" />
              </button>
              {isActiveDropdown && (
                <div 
                  className="absolute bottom-full right-0 mb-2 w-48 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl overflow-hidden z-20 py-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  {(profile?.role === 'admin' || profile?.role === 'owner') && (
                    <button onClick={() => { setNotificationModal({ isOpen: true, content, status: 'idle' }); setActiveDropdownId(null); }} className="w-full flex items-center gap-3 px-4 py-3 border-b border-zinc-100 dark:border-zinc-800 text-sm text-blue-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-left">
                      <Bell className="w-4 h-4" /> Send Notification
                    </button>
                  )}
                  {(profile?.role === 'admin' || profile?.role === 'owner') && (
                    <button onClick={() => { handleAddToSpecialCollection(content.id, 'trending'); setActiveDropdownId(null); }} className="w-full flex items-center gap-3 px-4 py-3 border-b border-zinc-100 dark:border-zinc-800 text-sm text-amber-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-left">
                      <TrendingUp className="w-4 h-4" /> Add to Trending
                    </button>
                  )}
                  {(profile?.role === 'admin' || profile?.role === 'owner') && (
                    <button onClick={() => { handleAddToSpecialCollection(content.id, 'newly_added'); setActiveDropdownId(null); }} className="w-full flex items-center gap-3 px-4 py-3 border-b border-zinc-100 dark:border-zinc-800 text-sm text-emerald-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-left">
                      <Clock className="w-4 h-4" /> Add to Newly Added
                    </button>
                  )}
                  {(profile?.role === 'admin' || profile?.role === 'owner') && (
                    <button onClick={() => { handleCopyData(content); setActiveDropdownId(null); }} className="w-full flex items-center gap-3 px-4 py-3 border-b border-zinc-100 dark:border-zinc-800 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-left">
                      <Copy className="w-4 h-4" /> Copy Data
                    </button>
                  )}
                  {(profile?.role === 'admin' || profile?.role === 'owner') && (
                    <button onClick={() => { setDeleteId(content.id); setActiveDropdownId(null); }} className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-left">
                      <Trash2 className="w-4 h-4" /> Delete
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

export default function ContentManagement() {
  const { profile, user } = useAuth();
  const { users: allUsers } = useUsers();
  const { settings } = useSettings();
  const { contentList, genres, languages, qualities, loading: contextLoading, updateSearchIndex } = useContent();
  const [loading, setLoading] = useState(contextLoading);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isBatchFetchModalOpen, setIsBatchFetchModalOpen] = useState(false);
  const [batchFetchMode, setBatchFetchMode] = useState<'media'|'links'>('media');
  const [alertConfig, setAlertConfig] = useState<{ isOpen: boolean; title: string; message: string }>({ isOpen: false, title: '', message: '' });
  const [toasts, setToasts] = useState<{ id: string; title: string; message: string; type: 'success' | 'error' | 'info' }[]>([]);

  const addToast = (title: string, message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts(prev => [...prev, { id, title, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 5000);
  };

  // Helper to replace setAlertConfig with addToast where appropriate
  const triggerAlert = (title: string, message: string, type: 'success' | 'error' | 'info' = 'info') => {
    addToast(title, message, type);
  };

  useEffect(() => {
    if (alertConfig.isOpen) {
      const type = alertConfig.title.toLowerCase().includes('success') ? 'success' : 
                   alertConfig.title.toLowerCase().includes('error') ? 'error' : 'info';
      addToast(alertConfig.title, alertConfig.message, type);
      setAlertConfig(prev => ({ ...prev, isOpen: false }));
    }
  }, [alertConfig.isOpen]);
  const [managers, setManagers] = useState<Record<string, string>>({});

  // Form State
  const [type, setType] = useState<'movie' | 'series'>('movie');
  const [status, setStatus] = useState<'draft' | 'published' | 'selected_content'>('published');
  const [initialStatus, setInitialStatus] = useState<'draft' | 'published' | 'selected_content' | null>(null);
  const [addToTrending, setAddToTrending] = useState(false);
  const [addToNewlyAdded, setAddToNewlyAdded] = useState(false);
  const [title, setTitle] = useState('');
  const [showTitleSuggestions, setShowTitleSuggestions] = useState(false);
  const [disableSuggestions, setDisableSuggestions] = useState(false);
  const [description, setDescription] = useState('');
  const [posterUrl, setPosterUrl] = useState('');
  const [trailerUrl, setTrailerUrl] = useState('');
  const [trailerTitle, setTrailerTitle] = useState('');
  const [trailerYoutubeTitle, setTrailerYoutubeTitle] = useState('');
  const [trailerSeasonNumber, setTrailerSeasonNumber] = useState<number | undefined>(undefined);
  const [trailers, setTrailers] = useState<Trailer[]>([]);
  const [sampleUrl, setSampleUrl] = useState('');
  const [imdbLink, setImdbLink] = useState('');
  const [imdbRating, setImdbRating] = useState('');
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);
  const [selectedQuality, setSelectedQuality] = useState<string>('');
  const [subtitles, setSubtitles] = useState(false);
  const [cast, setCast] = useState('');
  const [country, setCountry] = useState('');
  const [year, setYear] = useState(new Date().getFullYear());
  const [releaseDate, setReleaseDate] = useState('');
  const [runtime, setRuntime] = useState('');
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const [isCastExpanded, setIsCastExpanded] = useState(false);
  const [isCountryExpanded, setIsCountryExpanded] = useState(false);
  
  // Movie specific
  const [movieLinks, setMovieLinks] = useState<QualityLinks>([]);
  
  // Series specific
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [expandedEpisodes, setExpandedEpisodes] = useState<Record<string, boolean>>({});
 
  // Search States
  const [searchTerm, setSearchTerm] = useState(() => sessionStorage.getItem('content_mgmt_search') || '');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState(searchTerm);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showDuplicates, setShowDuplicates] = useState(() => sessionStorage.getItem('adminShowDuplicates') === 'true');
  const [showMissing, setShowMissing] = useState<'none' | 'missing' | 'complete' | '480p' | '720p' | '1080p' | 'trailer' | 'genre' | 'language' | 'quality' | 'poster' | 'year' | 'imdb' | 'releaseDate' | 'disabled'>(() => {
    const saved = sessionStorage.getItem('adminShowMissingOnly');
    if (saved === 'true') return 'missing';
    if (saved === 'complete') return 'complete';
    if (['480p', '720p', '1080p', 'trailer', 'genre', 'language', 'quality', 'poster', 'year', 'imdb', 'releaseDate', 'disabled'].includes(saved || '')) return saved as any;
    return 'none';
  });
  const [isMissingFilterOpen, setIsMissingFilterOpen] = useState(false);
  
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        suggestionsRef.current && 
        !suggestionsRef.current.contains(event.target as Node) &&
        searchInputRef.current &&
        !searchInputRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const searchSuggestions = useMemo(() => {
    if (!debouncedSearchTerm.trim()) return [];
    return smartSearch(contentList, debouncedSearchTerm, ['title', 'description', 'cast', 'country', 'year']).slice(0, 5);
  }, [debouncedSearchTerm, contentList]);

  const [filterType, setFilterType] = useState<'all' | 'movie' | 'series'>(() => (sessionStorage.getItem('content_mgmt_type') as any) || 'all');
  const [filterGenre, setFilterGenre] = useState<string>(() => sessionStorage.getItem('content_mgmt_genre') || 'all');
  const [filterLanguage, setFilterLanguage] = useState<string>(() => sessionStorage.getItem('content_mgmt_language') || 'all');
  const [filterQuality, setFilterQuality] = useState<string>(() => sessionStorage.getItem('content_mgmt_quality') || 'all');
  const [filterYear, setFilterYear] = useState<string>(() => sessionStorage.getItem('content_mgmt_year') || 'all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'published' | 'draft' | 'selected_content'>(() => (sessionStorage.getItem('content_mgmt_status') as any) || 'all');
  const [filterAddedBy, setFilterAddedBy] = useState<string>(() => sessionStorage.getItem('content_mgmt_added_by') || 'all');
  const [filterSort, setFilterSort] = useState<'default' | 'newest' | 'oldest'>(() => (sessionStorage.getItem('content_mgmt_sort') as any) || 'default');
  const [selectedContent, setSelectedContent] = useState<string[]>([]);

  useEffect(() => {
    const timer = setTimeout(() => {
      sessionStorage.setItem('content_mgmt_search', searchTerm);
      sessionStorage.setItem('content_mgmt_type', filterType);
      sessionStorage.setItem('content_mgmt_genre', filterGenre);
      sessionStorage.setItem('content_mgmt_language', filterLanguage);
      sessionStorage.setItem('content_mgmt_quality', filterQuality);
      sessionStorage.setItem('content_mgmt_year', filterYear);
      sessionStorage.setItem('content_mgmt_status', filterStatus);
      sessionStorage.setItem('content_mgmt_added_by', filterAddedBy);
      sessionStorage.setItem('content_mgmt_sort', filterSort);
      sessionStorage.setItem('adminShowDuplicates', showDuplicates.toString());
      sessionStorage.setItem('adminShowMissingOnly', showMissing.toString());
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm, filterType, filterGenre, filterLanguage, filterQuality, filterYear, filterStatus, filterAddedBy, filterSort, showDuplicates, showMissing]);

  const [genreSearchTerm, setGenreSearchTerm] = useState('');
  const [languageSearchTerm, setLanguageSearchTerm] = useState('');

  const [isGenreDropdownOpen, setIsGenreDropdownOpen] = useState(false);
  const [isLanguageDropdownOpen, setIsLanguageDropdownOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [isMasterFetchModalOpen, setIsMasterFetchModalOpen] = useState(false);
  const [isLinkCheckerOpen, setIsLinkCheckerOpen] = useState(false);
  const [isBatchLinkCheckerOpen, setIsBatchLinkCheckerOpen] = useState(false);
  const [isAdjustContentsModalOpen, setIsAdjustContentsModalOpen] = useState(false);
  const [manageModal, setManageModal] = useState<{ isOpen: boolean; type: 'genre' | 'language' | 'quality' | null }>({ isOpen: false, type: null });
  const [fetchingPoster, setFetchingPoster] = useState(false);
  const [isAutoFillModalOpen, setIsAutoFillModalOpen] = useState(false);
  const [loadingShareId, setLoadingShareId] = useState<string | null>(null);
  const [loadingWhatsappShareId, setLoadingWhatsappShareId] = useState<string | null>(null);
  const [autoFillText, setAutoFillText] = useState('');
  const [imdbSeasonsPopup, setImdbSeasonsPopup] = useState<{ isOpen: boolean; seasons: any[]; show: any; epData: any[] } | null>(null);
  const [selectedImdbSeasons, setSelectedImdbSeasons] = useState<number[]>([]);
  const [shareSeasonModal, setShareSeasonModal] = useState<{ isOpen: boolean; content: Content | null; seasons: Season[], mode: 'standard' | 'whatsapp' }>({ isOpen: false, content: null, seasons: [], mode: 'standard' });
  const [notificationModal, setNotificationModal] = useState<{ isOpen: boolean; content: Content | null; status: 'idle' | 'sending' | 'success' | 'error' }>({ isOpen: false, content: null, status: 'idle' });
  const [shareAnywayConfig, setShareAnywayConfig] = useState<{ isOpen: boolean; content: Content | null, mode: 'standard' | 'whatsapp' }>({ isOpen: false, content: null, mode: 'standard' });
  const [selectedShareSeasons, setSelectedShareSeasons] = useState<number[]>([]);
  const [activeDropdownId, setActiveDropdownId] = useState<string | null>(null);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [showMergeConfirm, setShowMergeConfirm] = useState(false);
  const [mergeData, setMergeData] = useState<{ title: string; year: number | ''; items: Content[] }>({ title: '', year: '', items: [] });
  const location = useLocation();

  useEffect(() => {
    const handleClickOutside = () => {
      setActiveDropdownId(null);
      setIsMissingFilterOpen(false);
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  useModalBehavior(isModalOpen, () => setIsModalOpen(false));
  useModalBehavior(imdbSeasonsPopup?.isOpen || false, () => setImdbSeasonsPopup(null));
  useModalBehavior(shareSeasonModal.isOpen, () => setShareSeasonModal({ ...shareSeasonModal, isOpen: false }));
  useModalBehavior(notificationModal.isOpen, () => setNotificationModal({ isOpen: false, content: null, status: 'idle' }));
  useModalBehavior(shareAnywayConfig.isOpen, () => setShareAnywayConfig({ ...shareAnywayConfig, isOpen: false, content: null }));
  useModalBehavior(isAutoFillModalOpen, () => setIsAutoFillModalOpen(false));
  useModalBehavior(showMergeConfirm, () => setShowMergeConfirm(false));
  // isMasterFetchModalOpen, isLinkCheckerOpen, isAdjustContentsModalOpen, manageModal, alertConfig, deleteId 
  // are handled internally by their respective components (MediaModal, LinkCheckerModal, etc.)

  const prefilledDataApplied = useRef(false);

  const titleSuggestions = useMemo(() => {
    if (!title.trim() || title.length < 2) return [];
    return smartSearch(contentList, title).filter(c => c.id !== editingId).slice(0, 5);
  }, [title, contentList, editingId]);

  useEffect(() => {
    if (location.state?.prefilledData && !prefilledDataApplied.current && genres.length > 0) {
      const data = location.state.prefilledData;
      
      // Reset form first
      setEditingId(null);
      setTitle('');
      setDescription('');
      setPosterUrl('');
      setTrailerUrl('');
      setImdbLink('');
      setImdbRating('');
      setYear(new Date().getFullYear());
      setReleaseDate('');
      setRuntime('');
      setCast('');
      setCountry('');
      setType('movie');
      setSelectedGenres([]);
      setSeasons([]);
      setMovieLinks([]);
      
      // Apply prefilled data using the standard apply function
      applyFetchedData(data);
      
      setIsModalOpen(true);
      prefilledDataApplied.current = true;
      
      // Clear state so it doesn't re-open on refresh, preserving history state for modals
      // We use replaceState directly to preserve the modalId pushed by useModalBehavior
      const currentState = window.history.state || {};
      window.history.replaceState({ ...currentState, usr: {} }, document.title);
    }
  }, [location.state, genres]); // Added genres as dependency to ensure applyAIFetchedData can match genres

  useEffect(() => {
    setLoading(contextLoading);
  }, [contextLoading]);

  useEffect(() => {
    const managersData: Record<string, string> = {};
    allUsers.forEach(data => {
      if (data.role === 'admin' || data.role === 'owner' || data.role === 'content_manager' || data.role === 'manager') {
        managersData[data.uid] = data.displayName || data.email || 'Unknown';
      }
    });
    setManagers(managersData);
  }, [allUsers]);

  useEffect(() => {
    const mainElement = document.querySelector('main');
    let scrollTimeout: any;
    
    const handleScroll = () => {
      if (scrollTimeout) return;
      scrollTimeout = setTimeout(() => {
        if (mainElement) {
          memoryStore.set('content_management_scroll_position', mainElement.scrollTop);
        }
        scrollTimeout = null;
      }, 100);
    };

    if (mainElement) {
      mainElement.addEventListener('scroll', handleScroll, { passive: true });
    }

    return () => {
      if (mainElement) {
        mainElement.removeEventListener('scroll', handleScroll);
      }
      if (scrollTimeout) clearTimeout(scrollTimeout);
    };
  }, []);

  useEffect(() => {
    if (!loading && contentList.length > 0) {
      const mainElement = document.querySelector('main');
      const savedPosition = memoryStore.get('content_management_scroll_position');
      if (savedPosition && mainElement) {
        setTimeout(() => {
          mainElement.scrollTop = savedPosition;
        }, 50);
      }
    }
  }, [loading, contentList.length]);

  const clearFilters = () => {
    setFilterType('all');
    setFilterGenre('all');
    setFilterLanguage('all');
    setFilterQuality('all');
    setFilterYear('all');
    setFilterStatus('all');
    setFilterAddedBy('all');
    setFilterSort('newest');
    setSearchTerm('');
    setShowMissing('none');
    setShowDuplicates(false);
  };

  useEffect(() => {
    const fetchTitle = async (url: string, setter: (title: string) => void) => {
      if (!url) return;
      
      let videoUrl = '';
      if (url.includes('youtube.com/watch')) {
        videoUrl = url;
      } else if (url.includes('youtu.be/')) {
        const videoId = url.split('youtu.be/')[1].split('?')[0];
        videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
      }

      if (videoUrl) {
        try {
          const res = await fetch(`https://www.youtube.com/oembed?url=${videoUrl}&format=json`);
          const data = await res.json();
          if (data && data.title) {
            setter(data.title);
          }
        } catch (err) {
          console.error("Error fetching YouTube title:", err);
        }
      }
    };

    // Main trailer
    fetchTitle(trailerUrl, setTrailerYoutubeTitle);

    // Additional trailers
    trailers.forEach((trailer, idx) => {
      if (trailer.url && !trailer.youtubeTitle) {
        fetchTitle(trailer.url, (newTitle) => {
          setTrailers(prev => {
            const next = [...prev];
            if (next[idx]) {
              next[idx] = { ...next[idx], youtubeTitle: newTitle };
            }
            return next;
          });
        });
      }
    });
  }, [trailerUrl, trailers]);

  useEffect(() => {
    const editId = searchParams.get('edit');
    if (editId && contentList.length > 0) {
      const content = contentList.find(c => c.id === editId);
      if (content) {
        const canEdit = profile?.role === 'admin' || profile?.role === 'owner' || content.status === 'draft';
        if (canEdit) {
          handleEdit(content);
        }
        // Clear the param so it doesn't reopen on refresh if we close it
        setSearchParams({}, { replace: true });
      }
    }
  }, [searchParams, contentList, profile]);

  const resetForm = () => {
    setType('movie');
    setStatus('published');
    setInitialStatus(null);
    setAddToTrending(false);
    setAddToNewlyAdded(false);
    setTitle('');
    setDescription('');
    setPosterUrl('');
    setTrailerUrl('');
    setTrailerTitle('');
    setTrailerYoutubeTitle('');
    setTrailerSeasonNumber(undefined);
    setTrailers([]);
    setSampleUrl('');
    setImdbLink('');
    setImdbRating('');
    setSelectedGenres([]);
    setSelectedLanguages([]);
    setSelectedQuality('');
    setSubtitles(false);
    setCast('');
    setCountry('');
    setYear(new Date().getFullYear());
    setReleaseDate('');
    setRuntime('');
    setMovieLinks([
      { id: Math.random().toString(36).substr(2, 9), name: '480p', url: '', size: '', unit: 'MB' },
      { id: Math.random().toString(36).substr(2, 9), name: '720p', url: '', size: '', unit: 'GB' },
      { id: Math.random().toString(36).substr(2, 9), name: '1080p', url: '', size: '', unit: 'GB' }
    ]);
    setSeasons([]);
    setEditingId(null);
    setDisableSuggestions(false);
  };

  const parseLinks = (linksStr: string | undefined): QualityLinks => {
    if (!linksStr) return [];
    try {
      const parsed = JSON.parse(linksStr);
      if (Array.isArray(parsed)) return parsed;
      // Convert old format
      if (typeof parsed === 'object') {
        return Object.entries(parsed).map(([name, link]: [string, any]) => ({
          id: Math.random().toString(36).substr(2, 9),
          name,
          url: link?.url || '',
          size: link?.size || '',
          unit: 'MB' as 'MB' | 'GB'
        })).filter(l => l.url);
      }
    } catch (e) {
      console.error("Error parsing links", e);
    }
    return [];
  };

  const handleEdit = (content: Content) => {
    const normalizedType = (content.type.toLowerCase() === 'series' || content.type.toLowerCase() === 'tv') ? 'series' : 'movie';
    setType(normalizedType);
    setStatus(content.status || 'published');
    setInitialStatus(content.status || 'published');
    setTitle(content.title || '');
    setDescription(content.description || '');
    setPosterUrl(content.posterUrl || '');
    setTrailerUrl(content.trailerUrl || '');
    setTrailerTitle(content.trailerTitle || '');
    setTrailerYoutubeTitle(content.trailerYoutubeTitle || '');
    setTrailerSeasonNumber(content.trailerSeasonNumber || undefined);
    setTrailers(content.trailers ? (Array.isArray(content.trailers) ? content.trailers : JSON.parse(content.trailers || '[]')) : []);
    setSampleUrl(content.sampleUrl || '');
    setImdbLink(content.imdbLink || '');
    setImdbRating(content.imdbRating || '');
    setSelectedGenres(content.genreIds || []);
    setSelectedLanguages(content.languageIds || []);
    setSelectedQuality(content.qualityId || '');
    setSubtitles(content.subtitles || false);
    setCast((content.cast || []).join(', '));
    setCountry(content.country || '');
    setYear(content.year || new Date().getFullYear());
    setReleaseDate(content.releaseDate || '');
    setRuntime(content.runtime || '');
    
    if (content.type === 'movie') {
      setMovieLinks(parseLinks(content.movieLinks));
    } else {
      setMovieLinks([]);
    }
    
    if (content.type === 'series' && content.seasons) {
      try {
        const parsedSeasons = Array.isArray(content.seasons) ? content.seasons : JSON.parse(content.seasons || '[]');
        const normalizedSeasons = parsedSeasons.map((s: any) => ({
          ...s,
          zipLinks: parseLinks(JSON.stringify(s.zipLinks)),
          episodes: s.episodes.map((ep: any) => ({
            ...ep,
            links: parseLinks(JSON.stringify(ep.links))
          }))
        }));
        setSeasons(normalizedSeasons);
      } catch (e) {
        setSeasons([]);
      }
    } else {
      setSeasons([]);
    }
    
    setEditingId(content.id);
    setIsModalOpen(true);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 600;
        const MAX_HEIGHT = 900;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        setPosterUrl(dataUrl);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      // Sort seasons and episodes before saving
      const sortedSeasons = [...seasons].sort((a, b) => a.seasonNumber - b.seasonNumber).map(s => ({
        ...s,
        episodes: [...s.episodes].sort((a, b) => a.episodeNumber - b.episodeNumber)
      }));

      const currentEditingId = editingId;
      const finalStatus = (profile?.role === 'content_manager' || profile?.role === 'manager') ? 'draft' : status;
      
      const data: Partial<Content> = {
        type,
        status: finalStatus,
        title,
        description: description || '',
        posterUrl,
        trailerUrl,
        trailerTitle: trailerTitle || '',
        // Do not save trailerYoutubeTitle to Firestore
        trailerSeasonNumber: trailerSeasonNumber || null,
        trailers: JSON.stringify(trailers.map(({ youtubeTitle, ...rest }) => rest)),
        sampleUrl: sampleUrl || '',
        imdbLink: imdbLink || '',
        imdbRating: imdbRating || '',
        genreIds: selectedGenres,
        languageIds: selectedLanguages,
        qualityId: selectedQuality,
        subtitles: !!subtitles,
        cast: cast.split(',').map(c => c.trim()).filter(Boolean),
        country: country || '',
        year: Number(year) || new Date().getFullYear(),
        releaseDate: releaseDate || '',
        runtime: runtime || '',
        updatedAt: new Date().toISOString(),
      };

      if (currentEditingId && initialStatus === 'draft' && finalStatus === 'published') {
        data.createdAt = new Date().toISOString();
        data.order = deleteField() as any; // using deleteField to reset order
      }

      if (type === 'movie') {
        data.movieLinks = JSON.stringify(movieLinks);
        data.seasons = JSON.stringify([]);
      } else {
        data.seasons = JSON.stringify(sortedSeasons);
        data.movieLinks = JSON.stringify([]);
      }

      const cleanedData = deepClean(data);
      let newDocId = currentEditingId;

      if (currentEditingId) {
        await updateDoc(doc(db, 'content', currentEditingId), cleanedData);
      } else {
        cleanedData.createdAt = new Date().toISOString();
        cleanedData.addedBy = user?.uid;
        cleanedData.addedByRole = profile?.role;
        cleanedData.addedByName = profile?.displayName || profile?.email || 'Unknown';
        const newRef = await addDoc(collection(db, 'content'), deepClean(cleanedData));
        newDocId = newRef.id;
      }
      
      // Add to special collections if checked
      if (newDocId) {
        if (addToTrending) {
          await handleAddToSpecialCollection(newDocId, 'trending');
        }
        if (addToNewlyAdded) {
          await handleAddToSpecialCollection(newDocId, 'newly_added');
        }
      }
      
      setIsModalOpen(false);
      resetForm();
    } catch (error) {
      console.error('Error saving content:', error);
      setAlertConfig({ isOpen: true, title: 'Error', message: 'Failed to save content' });
    } finally {
      setIsSaving(false);
    }
  };

  const processImdbSeasons = (epData: any[], selectedSeasons?: number[]) => {
    const seasonsMap = new Map<number, any[]>();
    epData.forEach((ep: any) => {
      if (selectedSeasons && !selectedSeasons.includes(ep.season)) return;
      if (!seasonsMap.has(ep.season)) seasonsMap.set(ep.season, []);
      seasonsMap.get(ep.season)!.push(ep);
    });
    
    setSeasons(prevSeasons => {
      const newSeasons = prevSeasons.map(s => ({ ...s, episodes: [...s.episodes] }));
      seasonsMap.forEach((eps, seasonNum) => {
        let seasonIndex = newSeasons.findIndex(s => s.seasonNumber === seasonNum);
        if (seasonIndex === -1) {
          newSeasons.push({
            id: Math.random().toString(36).substr(2, 9),
            seasonNumber: seasonNum,
            year: undefined,
            episodes: [],
            zipLinks: [
              { id: Math.random().toString(36).substr(2, 9), name: '480p', url: '', size: '', unit: 'GB' },
              { id: Math.random().toString(36).substr(2, 9), name: '720p', url: '', size: '', unit: 'GB' },
              { id: Math.random().toString(36).substr(2, 9), name: '1080p', url: '', size: '', unit: 'GB' }
            ],
            mkvLinks: [
              { id: Math.random().toString(36).substr(2, 9), name: '480p', url: '', size: '', unit: 'GB' },
              { id: Math.random().toString(36).substr(2, 9), name: '720p', url: '', size: '', unit: 'GB' },
              { id: Math.random().toString(36).substr(2, 9), name: '1080p', url: '', size: '', unit: 'GB' }
            ]
          });
          seasonIndex = newSeasons.length - 1;
        }
        
        const currentSeason = newSeasons[seasonIndex];
        const newEpisodes = currentSeason.episodes;
        
        eps.forEach(ep => {
          const epIndex = newEpisodes.findIndex(e => e.episodeNumber === ep.number);
          if (epIndex === -1) {
            newEpisodes.push({
              id: Math.random().toString(36).substr(2, 9),
              episodeNumber: ep.number,
              title: ep.name,
              links: [
                { id: Math.random().toString(36).substr(2, 9), name: '720p', url: '', size: '', unit: 'MB' }
              ]
            });
          } else {
            newEpisodes[epIndex].title = ep.name;
          }
          
          if (ep.number === 1 && ep.airdate) {
              currentSeason.year = parseInt(ep.airdate.substring(0, 4));
          } else if (!currentSeason.year && ep.airdate) {
              currentSeason.year = parseInt(ep.airdate.substring(0, 4));
          }
        });
        
        currentSeason.episodes = newEpisodes.sort((a, b) => a.episodeNumber - b.episodeNumber);
      });
      return newSeasons.sort((a, b) => a.seasonNumber - b.seasonNumber);
    });
  };

  const handleAddLinksFromChecker = (
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
  ) => {
    // Auto-select metadata if provided
    let activeType: "movie" | "series" = type;
    if (metadata) {
      if (metadata.title && !title.trim()) {
        setTitle(metadata.title);
      }
      if (metadata.year) {
        setYear(metadata.year);
      }

      if (metadata.languages.length > 0) {
        const matchedLangIds = languages
          .filter(l => metadata.languages.includes(l.name))
          .map(l => l.id);
        
        if (matchedLangIds.length > 0) {
          setSelectedLanguages(prev => {
            const combined = new Set([...prev, ...matchedLangIds]);
            return Array.from(combined);
          });
        }
      }

      if (metadata.printQuality) {
        const matchedQuality = qualities.find(q => q.name === metadata.printQuality);
        if (matchedQuality) {
          setSelectedQuality(matchedQuality.id);
        }
      }

      if (typeof metadata.subtitles === "boolean") {
        setSubtitles(metadata.subtitles);
      }

      if (metadata.type) {
        const normalizedType = (metadata.type.toLowerCase() === 'series' || metadata.type.toLowerCase() === 'tv') ? 'series' : 'movie';
        setType(normalizedType);
        activeType = normalizedType;
      }
    }

    if (activeType === 'movie') {
      setMovieLinks(prev => {
        const currentLinks = [...prev];

        const parseSizeInMB = (size: string, unit: string) => {
          if (!size) return 0;
          const num = parseFloat(size.replace(/,/g, '')) || 0;
          const u = unit.toUpperCase();
          if (u === 'GB') return num * 1000;
          if (u === 'TB') return num * 1000 * 1000;
          return num;
        };

        links.forEach(newLink => {
          if (newLink.isSample && newLink.url) {
            setSampleUrl(newLink.url);
          }

          // SKIP if URL already exists in content
          if (newLink.url && currentLinks.some(l => l.url === newLink.url)) {
            console.log("Skipping duplicate movie link:", newLink.url);
            return;
          }

          // Find an existing link with same name and empty URL
          const emptyIdx = currentLinks.findIndex(l => l.name === newLink.name && (!l.url || !l.url.trim()));
          if (emptyIdx !== -1) {
            currentLinks[emptyIdx] = newLink;
          } else {
            currentLinks.push(newLink);
          }
        });

        currentLinks.sort((a, b) => parseSizeInMB(a.size, a.unit) - parseSizeInMB(b.size, b.unit));
        return currentLinks;
      });
      setAlertConfig({ isOpen: true, title: 'Success', message: `Added/Merged movie links.` });
    } else {
      // Series logic
      const updatedSeasons = [...seasons];
      
      links.forEach(link => {
        if (link.isSample && link.url) {
          setSampleUrl(link.url);
        }

        const targetSeason = link.season || metadata?.season || 1;
        const targetEpisode = link.episode || metadata?.episode; // if undefined, it's a full season
        
        let seasonIdx = updatedSeasons.findIndex(s => s.seasonNumber === targetSeason);
        if (seasonIdx === -1) {
          const newSeason: Season = {
            id: Math.random().toString(36).substr(2, 9),
            seasonNumber: targetSeason,
            zipLinks: [],
            mkvLinks: [],
            episodes: []
          };
          updatedSeasons.push(newSeason);
          updatedSeasons.sort((a, b) => a.seasonNumber - b.seasonNumber);
          seasonIdx = updatedSeasons.findIndex(s => s.seasonNumber === targetSeason);
        }

        if (targetEpisode === undefined || link.isFullSeasonMKV || link.isFullSeasonZIP) {
          // Full season
          const isZip = link.isFullSeasonZIP || link.url.toLowerCase().includes('.zip');
          
          const updatedSeason = { ...updatedSeasons[seasonIdx] };
          const targetLinks = isZip ? [...updatedSeason.zipLinks] : [...(updatedSeason.mkvLinks || [])];
          
          // SKIP if URL already exists in this season
          if (link.url && targetLinks.some(l => l.url === link.url)) {
            console.log("Skipping duplicate season link:", link.url);
            return;
          }

          // Merge logic: replace if name matches and URL is empty, otherwise add
          // Special case for MKV Full Season: match "720p" if new is "720p HEVC"
          const emptyIdx = targetLinks.findIndex(l => {
            const isEmpty = !l.url || !l.url.trim();
            if (!isEmpty) return false;
            if (l.name === link.name) return true;
            if (!isZip && link.name.endsWith(' HEVC') && l.name === link.name.replace(' HEVC', '')) return true;
            return false;
          });
          if (emptyIdx !== -1) {
            targetLinks[emptyIdx] = link;
          } else {
            targetLinks.push(link);
          }

          if (isZip) updatedSeason.zipLinks = targetLinks;
          else updatedSeason.mkvLinks = targetLinks;
          
          updatedSeasons[seasonIdx] = updatedSeason;
        } else {
          // Episode logic
          let epIdx = updatedSeasons[seasonIdx].episodes.findIndex(e => e.episodeNumber === targetEpisode);
          if (epIdx === -1) {
            const newEpisode: Episode = {
              id: Math.random().toString(36).substr(2, 9),
              episodeNumber: targetEpisode,
              title: `Episode ${targetEpisode}`,
              links: []
            };
            const updatedEpisodes = [...updatedSeasons[seasonIdx].episodes, newEpisode];
            updatedEpisodes.sort((a, b) => a.episodeNumber - b.episodeNumber);
            
            const updatedSeason = { ...updatedSeasons[seasonIdx], episodes: updatedEpisodes };
            updatedSeasons[seasonIdx] = updatedSeason;
            epIdx = updatedEpisodes.findIndex(e => e.episodeNumber === targetEpisode);
          }

          const updatedSeason = { ...updatedSeasons[seasonIdx] };
          const updatedEpisodes = [...updatedSeason.episodes];
          const updatedEpisode = { ...updatedEpisodes[epIdx] };
          const targetLinks = [...updatedEpisode.links];
          
          // SKIP if URL already exists in this episode
          if (link.url && targetLinks.some(l => l.url === link.url)) {
            console.log("Skipping duplicate episode link:", link.url);
            return;
          }

          // Merge logic: replace if name matches and URL is empty, otherwise add
          const emptyIdx = targetLinks.findIndex(l => l.name === link.name && (!l.url || !l.url.trim()));
          if (emptyIdx !== -1) {
            targetLinks[emptyIdx] = link;
          } else {
            targetLinks.push(link);
          }

          updatedEpisode.links = targetLinks;
          updatedEpisodes[epIdx] = updatedEpisode;
          updatedSeason.episodes = updatedEpisodes;
          updatedSeasons[seasonIdx] = updatedSeason;
        }
      });

      // Sort all links in all seasons and episodes
      updatedSeasons.forEach(s => {
        if (s.zipLinks) s.zipLinks.sort((a, b) => getSizeInMB(a.size, a.unit) - getSizeInMB(b.size, b.unit));
        if (s.mkvLinks) s.mkvLinks.sort((a, b) => getSizeInMB(a.size, a.unit) - getSizeInMB(b.size, b.unit));
        s.episodes.forEach(e => {
          if (e.links) e.links.sort((a, b) => getSizeInMB(a.size, a.unit) - getSizeInMB(b.size, b.unit));
        });
      });
      
      setSeasons(updatedSeasons);
      setAlertConfig({ isOpen: true, title: 'Success', message: `Added/Merged ${links.length} episode/season links.` });
    }

    // Ensure the main form modal is open so the user sees the newly populated data
    setIsModalOpen(true);
  };

  const deepClean = (obj: any): any => {
    if (obj === undefined) return undefined;
    if (obj === null) return null;
    
    // Check if it's a Firestore FieldValue (they have internal properties like _methodName or are instances we shouldn't touch)
    if (obj && typeof obj === 'object' && (obj._methodName || (obj.constructor && obj.constructor.name.includes('FieldValue')))) {
      return obj;
    }

    if (Array.isArray(obj)) {
      const cleanedArr = obj.map(deepClean).filter(v => v !== undefined);
      return cleanedArr.length > 0 ? cleanedArr : [];
    }
    
    if (typeof obj === 'object') {
      const cleanedObj: any = {};
      let hasProps = false;
      for (const [key, value] of Object.entries(obj)) {
        const cleanedValue = deepClean(value);
        if (cleanedValue !== undefined) {
          cleanedObj[key] = cleanedValue;
          hasProps = true;
        }
      }
      return hasProps ? cleanedObj : {};
    }
    
    return obj;
  };

  const getSizeInMB = (sizeStr: string, unit: string) => {
    if (!sizeStr) return 0;
    const num = parseFloat(sizeStr.replace(/,/g, '')) || 0;
    const u = (unit || '').toUpperCase();
    if (u.includes('GB')) return num * 1000;
    if (u.includes('TB')) return num * 1000 * 1000;
    return num;
  };

  const handleBatchAddLinks = async (
    batches: {
      title: string;
      year?: number;
      links: QualityLinks;
      metadata: any;
    }[]
  ) => {
    setIsSaving(true);
    let newItemsAdded = 0;
    try {
      console.log("Starting batch save for", batches.length, "batches");
      const batchOp = writeBatch(db);
      batches.forEach((b, index) => {
         const newRef = doc(collection(db, 'content'));
         const contentData: any = {
           title: b.title || "Untitled",
           year: b.year || '',
           type: b.metadata.type || 'movie',
           description: '',
           status: 'draft',
           addedBy: user?.uid || null,
           addedByRole: profile?.role,
           addedByName: profile?.displayName || profile?.email || 'Unknown',
           createdAt: Date.now(),
           updatedAt: Date.now(),
         };
         
         if (b.metadata.type === 'movie' || !b.metadata.type) {
           contentData.movieLinks = JSON.stringify([...b.links].sort((a, b) => getSizeInMB(a.size, a.unit) - getSizeInMB(b.size, b.unit)));
           contentData.seasons = JSON.stringify([]);
           contentData.type = 'movie';
         } else {
           contentData.type = 'series';
           const seasonMap = new Map<number, Season>();
           
           b.links.forEach((l: LinkDef) => {
             const sNum = l.season || b.metadata.season || 1;
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
             
             if (l.episode !== undefined) {
               let ep = s.episodes.find(e => e.episodeNumber === l.episode);
               if (!ep) {
                 ep = {
                   id: Math.random().toString(36).substr(2, 9),
                   episodeNumber: l.episode,
                   title: `Episode ${l.episode}`,
                   links: []
                 };
                 s.episodes.push(ep);
                 s.episodes.sort((a, b) => a.episodeNumber - b.episodeNumber);
               }
               ep.links.push(l);
               ep.links.sort((a, b) => getSizeInMB(a.size, a.unit) - getSizeInMB(b.size, b.unit));
             } else {
               if (l.isFullSeasonMKV) {
                 if (!s.mkvLinks) s.mkvLinks = [];
                  s.mkvLinks.push(l);
                  s.mkvLinks.sort((a, b) => getSizeInMB(a.size, a.unit) - getSizeInMB(b.size, b.unit));
               } else {
                  s.zipLinks.push(l);
                  s.zipLinks.sort((a, b) => getSizeInMB(a.size, a.unit) - getSizeInMB(b.size, b.unit));
               }
             }
           });
           
           contentData.seasons = JSON.stringify(Array.from(seasonMap.values()).sort((a, b) => a.seasonNumber - b.seasonNumber));
           contentData.movieLinks = JSON.stringify([]);
         }
         
         const matchedQuality = qualities.find(q => q.name === b.metadata.printQuality);
         if (matchedQuality) contentData.qualityId = matchedQuality.id;
         if (b.metadata.languages?.length) {
            const matchedLangIds = languages.filter(l => b.metadata.languages.includes(l.name)).map(l => l.id);
            if (matchedLangIds.length > 0) contentData.languageIds = matchedLangIds;
         }

         // Clean up all undefined fields recursively to avoid Firestore errors
         const cleanedData = deepClean(contentData);
         console.log(`Cleaned data for batch ${index} (${b.title}):`, cleanedData);

         batchOp.set(newRef, cleanedData);
         newItemsAdded++;
      });

      await batchOp.commit();
      setAlertConfig({ isOpen: true, title: 'Success', message: `Batch created ${newItemsAdded} draft content entries.` });
    } catch (e: any) {
      console.error(e);
      setAlertConfig({ isOpen: true, title: 'Error', message: 'Failed to batch save links: ' + e.message });
    } finally {
      setIsSaving(false);
    }
  };

  const applyFetchedData = (data: any) => {
    if (data.title) setTitle(data.title);
    if (data.year) {
      const parsedYear = parseInt(data.year.toString());
      if (!isNaN(parsedYear)) setYear(parsedYear);
    }
    if (data.type) {
        const normalizedType = (data.type.toLowerCase() === 'series' || data.type.toLowerCase() === 'tv') ? 'series' : 'movie';
        setType(normalizedType);
    }
    if (data.description) setDescription(data.description);
    if (data.cast) setCast(data.cast);
    if (data.country) setCountry(data.country);
    if (data.releaseDate) setReleaseDate(data.releaseDate);
    if (data.runtime) setRuntime(data.runtime);
    if (data.imdbLink) setImdbLink(data.imdbLink);
    if (data.imdbRating) setImdbRating(data.imdbRating);
    if (data.subtitles !== undefined) setSubtitles(data.subtitles);
    if (data.posterUrl) setPosterUrl(data.posterUrl);
    if (data.trailerUrl) {
      setTrailerUrl(data.trailerUrl);
    }
    if (data.trailers && Array.isArray(data.trailers)) {
      setTrailers(prev => {
        const newTrailers = [...prev];
        data.trailers.forEach((newTrailer: any) => {
          if (!newTrailers.some(t => t.url === newTrailer.url)) {
            newTrailers.push(newTrailer);
          }
        });
        return newTrailers;
      });
    }

    if (data.genres && Array.isArray(data.genres)) {
      const fetchedGenreNames = data.genres.map((g: string) => g.trim().toLowerCase());
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
        setSelectedGenres(prev => [...new Set([...prev, ...matchedGenreIds])]);
      }
    }

    if (data.type === 'movie') {
      // If movieLinks is empty, initialize with default links
      setMovieLinks(prev => prev.length > 0 ? prev : [
        { id: Math.random().toString(36).substr(2, 9), name: '480p', url: '', size: '', unit: 'MB' },
        { id: Math.random().toString(36).substr(2, 9), name: '720p', url: '', size: '', unit: 'GB' },
        { id: Math.random().toString(36).substr(2, 9), name: '1080p', url: '', size: '', unit: 'GB' }
      ]);
    } else {
      setMovieLinks([]);
    }
    
    if (data.type === 'series' && data.seasons && Array.isArray(data.seasons)) {
      setSeasons(prevSeasons => {
        const updatedSeasons = [...prevSeasons];
        
        data.seasons.forEach((fetchedSeason: any) => {
          const existingSeasonIndex = updatedSeasons.findIndex(s => s.seasonNumber === fetchedSeason.seasonNumber);
          
          if (existingSeasonIndex !== -1) {
            // Merge episodes
            const existingSeason = updatedSeasons[existingSeasonIndex];
            if (fetchedSeason.seasonYear) existingSeason.year = fetchedSeason.seasonYear;
            if (fetchedSeason.title) existingSeason.title = fetchedSeason.title;
            if (fetchedSeason.trailerUrl) existingSeason.trailerUrl = fetchedSeason.trailerUrl;
            fetchedSeason.episodes.forEach((fetchedEp: any) => {
              const existingEpIndex = existingSeason.episodes.findIndex(ep => ep.episodeNumber === fetchedEp.episodeNumber);
              if (existingEpIndex !== -1) {
                // Update title, description, duration, keep links
                existingSeason.episodes[existingEpIndex] = {
                  ...existingSeason.episodes[existingEpIndex],
                  title: fetchedEp.title || existingSeason.episodes[existingEpIndex].title,
                  description: fetchedEp.description || existingSeason.episodes[existingEpIndex].description,
                  duration: fetchedEp.duration || existingSeason.episodes[existingEpIndex].duration,
                };
              } else {
                // Add new episode with pre-filled 720p link
                existingSeason.episodes.push({
                  id: Math.random().toString(36).substr(2, 9),
                  episodeNumber: fetchedEp.episodeNumber,
                  title: fetchedEp.title || `Episode ${fetchedEp.episodeNumber}`,
                  description: fetchedEp.description || '',
                  duration: fetchedEp.duration || '',
                  links: [{ id: Math.random().toString(36).substr(2, 9), name: '720p', url: '', size: '', unit: 'MB' }],
                });
              }
            });
            // Sort episodes
            existingSeason.episodes.sort((a, b) => a.episodeNumber - b.episodeNumber);
          } else {
            // Add new season with pre-filled links
            updatedSeasons.push({
              id: Math.random().toString(36).substr(2, 9),
              seasonNumber: fetchedSeason.seasonNumber,
              year: fetchedSeason.seasonYear,
              title: fetchedSeason.title,
              trailerUrl: fetchedSeason.trailerUrl || '',
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
              episodes: fetchedSeason.episodes.map((ep: any) => ({
                id: Math.random().toString(36).substr(2, 9),
                episodeNumber: ep.episodeNumber,
                title: ep.title || `Episode ${ep.episodeNumber}`,
                description: ep.description || '',
                duration: ep.duration || '',
                links: [{ id: Math.random().toString(36).substr(2, 9), name: '720p', url: '', size: '', unit: 'MB' }],
              })).sort((a: any, b: any) => a.episodeNumber - b.episodeNumber)
            });
          }
        });
        
        return updatedSeasons.sort((a, b) => a.seasonNumber - b.seasonNumber);
      });
    }
  };

  const handleDelete = () => {
    if (!deleteId) return;
    const currentDeleteId = deleteId;
    setDeleteId(null);
    deleteDoc(doc(db, 'content', currentDeleteId)).catch(error => {
      console.error('Error deleting content:', error);
      setAlertConfig({ isOpen: true, title: 'Error', message: 'Failed to delete content' });
    });
  };

  const getNotificationPreview = (content: Content | null) => {
    if (!content) return { title: '', body: '' };
    
    let languageName = '';
    if (content.languageIds && content.languageIds.length > 0) {
      const langId = content.languageIds.length > 1 ? content.languageIds[1] : content.languageIds[0];
      const lang = languages.find(l => l.id === langId);
      if (lang) languageName = lang.name + ' ';
    }

    let genreNames = '';
    if (content.genreIds && content.genreIds.length > 0) {
      genreNames = content.genreIds
        .map(id => genres.find(g => g.id === id)?.name)
        .filter(Boolean)
        .join(', ');
    }

    let qualityName = '';
    if (content.qualityId) {
      const quality = qualities.find(q => q.id === content.qualityId);
      if (quality) qualityName = quality.name;
    }

    const contentType = content.type === 'movie' ? 'Movie' : 'Series';
    const yearStr = content.year ? ` (${content.year})` : '';
    
    const title = `🎬 New ${languageName}${contentType} Added: ${content.title}${yearStr}`;
    
    let body = '';
    if (genreNames) body += `${genreNames} ${contentType}`;
    if (qualityName) body += `${body ? ' in ' : 'In '}${qualityName}`;
    
    if (!body) {
       body = content.description.substring(0, 100) + (content.description.length > 100 ? '...' : '');
    }

    return { title, body };
  };

  const handleSendNotification = async () => {
    if (!notificationModal.content) return;
    
    setNotificationModal(prev => ({ ...prev, status: 'sending' }));
    
    try {
      const content = notificationModal.content;
      const { title, body } = getNotificationPreview(content);
      
      const notification = {
        title,
        body,
        contentId: content.id,
        posterUrl: content.posterUrl,
        type: content.type,
        createdAt: new Date().toISOString(),
        createdBy: 'admin' // In a real app, this would be the admin's UID
      };

      // Add to Firestore for in-app history
      await addDoc(collection(db, 'notifications'), notification);
      
      // Send push notification via backend
      await fetch('/api/notifications/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title,
          body,
          imageUrl: content.posterUrl,
          url: `/movie/${content.id}`
        })
      });
      
      setNotificationModal(prev => ({ ...prev, status: 'success' }));
      
      // Close modal after 2 seconds on success
      setTimeout(() => {
        setNotificationModal({ isOpen: false, content: null, status: 'idle' });
      }, 2000);
      
    } catch (error) {
      console.error('Error sending notification:', error);
      setNotificationModal(prev => ({ ...prev, status: 'error' }));
    }
  };

  const handleAddToSpecialCollection = async (contentId: string, type: 'trending' | 'newly_added') => {
    try {
      const title = type === 'trending' ? 'Trending' : 'Newly Added';
      const q = query(collection(db, 'collections'), where('title', '==', title));
      const snapshot = await getDocs(q);

      if (!snapshot.empty) {
        // Collection exists, update it
        const docRef = doc(db, 'collections', snapshot.docs[0].id);
        const currentIds = snapshot.docs[0].data().contentIds || [];
        
        // Remove if already exists to move it to the front
        const newIds = [contentId, ...currentIds.filter((id: string) => id !== contentId)];
        
        await updateDoc(docRef, {
          contentIds: newIds
        });
      } else {
        // Create new collection
        const allColls = await getDocs(collection(db, 'collections'));
        await addDoc(collection(db, 'collections'), {
          title,
          contentIds: [contentId],
          createdAt: new Date().toISOString(),
          order: allColls.size // Put new at the end
        });
      }
      triggerAlert('Success', `Added to ${title}`, 'success');
    } catch (error) {
      console.error('Error adding to collection:', error);
      triggerAlert('Error', 'Failed to add to collection', 'error');
    }
  };

  const handleShare = async (content: Content, mode: 'standard' | 'whatsapp' = 'standard') => {
    const isMissingWhatsappData = mode === 'whatsapp' && (!content.country || !content.languageIds || content.languageIds.length === 0);
    const isMissingData = !content.runtime || !content.releaseDate || !content.genreIds || content.genreIds.length === 0 || isMissingWhatsappData;
    
    if (isMissingData) {
      if (mode === 'whatsapp') {
        setLoadingWhatsappShareId(content.id);
      } else {
        setLoadingShareId(content.id);
      }
      try {
        let tmdbItem = null;
        let type = content.type;
        
        if (content.imdbLink) {
            const match = content.imdbLink.match(/tt\d+/);
            if (match) {
                const found = await findTMDBByImdb(match[0], content.type);
                if (found) {
                    tmdbItem = found.item;
                    type = found.type === 'tv' ? 'series' : 'movie';
                }
            }
        }
        
        if (!tmdbItem) {
            const results = await searchTMDBByTitle(content.title, content.year?.toString() || '', content.type);
            if (results && results.length > 0) {
                tmdbItem = results[0].item;
                type = results[0].type === 'tv' ? 'series' : 'movie';
            }
        }
        
        if (tmdbItem) {
            const tmdbType = type === 'series' ? 'tv' : 'movie';
            const details = await fetchTMDBDetails(tmdbItem.id, tmdbType);
            
            const promises: Promise<any>[] = [];
            let imdbPromiseIndex = -1;
            let seasonsPromiseIndex = -1;

            if (details.external_ids && details.external_ids.imdb_id) {
                promises.push(fetchIMDbRating(details.external_ids.imdb_id));
                imdbPromiseIndex = promises.length - 1;
            }

            let parsedSeasons: Season[] = [];
            let needsDuration = false;
            if (type === 'series') {
                try {
                    parsedSeasons = typeof content.seasons === 'string' ? JSON.parse(content.seasons || '[]') : (content.seasons || []);
                    needsDuration = parsedSeasons.some(s => s.episodes?.some(e => !e.duration));
                    if (needsDuration) {
                        promises.push(fetchSeriesSeasons(tmdbItem.id));
                        seasonsPromiseIndex = promises.length - 1;
                    }
                } catch (e) {
                    console.error("Error parsing seasons for share:", e);
                }
            }

            const results = await Promise.all(promises);
            const imdbRatingData = imdbPromiseIndex !== -1 ? results[imdbPromiseIndex] : null;
            const fetchedSeasons = seasonsPromiseIndex !== -1 ? results[seasonsPromiseIndex] : null;
            
            const updatedContent = {
                ...content,
                description: content.description || details.overview || '',
                runtime: content.runtime || (details.runtime ? `${details.runtime} min` : (details.episode_run_time && details.episode_run_time.length > 0 ? `${details.episode_run_time[0]} min/episode` : '')),
                releaseDate: content.releaseDate || details.release_date || details.first_air_date,
                imdbRating: content.imdbRating || (imdbRatingData?.rating ? `${imdbRatingData.rating}/10` : ''),
            };

            if (mode === 'whatsapp' && !updatedContent.country && details.production_countries && details.production_countries.length > 0) {
                updatedContent.country = details.production_countries[0].name || details.production_countries[0].iso_3166_1;
            }

            if (!updatedContent.posterUrl && details.poster_path) {
                updatedContent.posterUrl = `https://image.tmdb.org/t/p/w500${details.poster_path}`;
            }

            if (updatedContent.type === 'series') {
                try {
                    if (needsDuration && fetchedSeasons) {
                        parsedSeasons = parsedSeasons.map(s => {
                            const fetchedSeason = fetchedSeasons.find((fs: any) => fs.season === s.seasonNumber);
                            if (fetchedSeason) {
                                return {
                                    ...s,
                                    episodes: s.episodes?.map(e => {
                                        const fetchedEpisode = fetchedSeason.episodes.find((fe: any) => fe.episode_number === e.episodeNumber);
                                        return {
                                            ...e,
                                            duration: e.duration || (fetchedEpisode?.runtime ? `${fetchedEpisode.runtime}m` : '')
                                        };
                                    })
                                };
                            }
                            return s;
                        });
                        updatedContent.seasons = JSON.stringify(parsedSeasons);
                    }

                    if (parsedSeasons.length > 1) {
                        setShareSeasonModal({ isOpen: true, content: updatedContent, seasons: parsedSeasons, mode });
                        setSelectedShareSeasons(parsedSeasons.map(s => s.seasonNumber));
                        setLoadingShareId(null);
                        setLoadingWhatsappShareId(null);
                        return;
                    }
                } catch (e) {
                    console.error("Error parsing/updating seasons for share:", e);
                }
            }
            if (mode === 'whatsapp') {
                executeWhatsappShare(updatedContent);
            } else {
                executeShare(updatedContent);
            }
        } else {
            // Failed to find TMDB item, show share anyway option
            setShareAnywayConfig({ isOpen: true, content, mode });
        }
      } catch (error) {
        console.error("Share Fetch Error:", error);
        setShareAnywayConfig({ isOpen: true, content, mode });
      } finally {
        setLoadingShareId(null);
        setLoadingWhatsappShareId(null);
      }
      return;
    }

    if (content.type === 'series' && content.seasons) {
      try {
        const parsedSeasons: Season[] = typeof content.seasons === 'string' ? JSON.parse(content.seasons || '[]') : content.seasons;
        if (parsedSeasons.length > 1) {
          setShareSeasonModal({ isOpen: true, content, seasons: parsedSeasons, mode });
          setSelectedShareSeasons(parsedSeasons.map(s => s.seasonNumber));
          return;
        }
      } catch (e) {
        console.error("Error parsing seasons for share:", e);
        setAlertConfig({ isOpen: true, title: 'Error', message: 'Failed to parse content data.' });
        return;
      }
    }
    if (mode === 'whatsapp') {
        executeWhatsappShare(content);
    } else {
        executeShare(content);
    }
  };

  const getCountryDemonym = (countryStr?: string) => {
    const c = String(countryStr || '').toLowerCase();
    if (c.includes('united states') || c === 'us' || c === 'usa') return 'American';
    if (c.includes('korea') || c === 'kr' || c === 'south korea') return 'Korean';
    if (c.includes('united kingdom') || c === 'uk' || c === 'great britain') return 'British';
    if (c.includes('japan') || c === 'jp') return 'Japanese';
    if (c.includes('china') || c === 'cn') return 'Chinese';
    if (c.includes('france') || c === 'fr') return 'French';
    if (c.includes('germany') || c === 'de') return 'German';
    if (c.includes('spain') || c === 'es') return 'Spanish';
    if (c.includes('italy') || c === 'it') return 'Italian';
    if (c.includes('canada') || c === 'ca') return 'Canadian';
    if (c.includes('australia') || c === 'au') return 'Australian';
    if (c.includes('turkey') || c === 'tr') return 'Turkish';
    if (c.includes('thailand') || c === 'th') return 'Thai';
    if (c.includes('mexico') || c === 'mx') return 'Mexican';
    if (c.includes('brazil') || c === 'br') return 'Brazilian';
    
    // Fallback: capitalize each word
    return (countryStr || '').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  };

  const executeWhatsappShare = async (content: Content, selectedSeasonNumbers?: number[]) => {
    setLoadingWhatsappShareId(content.id);
    try {
      let origin = '';
      const countryRaw = (content.country || '').toUpperCase();
      const contentLangs = languages.filter(l => content.languageIds?.includes(l.id)).map(l => l.name);
      
      if (countryRaw.includes('INDIA') || countryRaw === 'IN') {
        if (contentLangs.length >= 2) {
          origin = contentLangs[1];
        } else if (contentLangs.length === 1) {
          origin = contentLangs[0];
        } else {
          origin = 'Indian';
        }
      } else if (countryRaw) {
        origin = getCountryDemonym(content.country);
      }

      const contentGenres = genres.filter(g => content.genreIds?.includes(g.id)).map(g => g.name).join(', ');
      
      if (!origin && (!contentLangs || contentLangs.length === 0)) {
         setAlertConfig({ isOpen: true, title: 'Missing Data', message: 'Country or Language is required for WhatsApp sharing. Please update the content or use Master Fetch.' });
         setLoadingWhatsappShareId(null);
         return;
      }
      
      let typeStr = '';
      if (content.type === 'movie') {
        typeStr = 'Movie';
      } else {
        if (selectedSeasonNumbers && selectedSeasonNumbers.length > 0) {
          const sorted = [...selectedSeasonNumbers].sort((a,b) => a - b);
          if (sorted.length === 1) {
            typeStr = `Season ${sorted[0]}`;
          } else if (sorted.length === 2) {
            typeStr = `Season ${sorted[0]},${sorted[1]}`;
          } else {
            typeStr = `Season ${sorted[0]}-${sorted[sorted.length - 1]}`;
          }
        } else {
          typeStr = 'Series';
        }
      }

      const parts = [origin, contentGenres, typeStr].filter(Boolean);
      const partsStr = parts.join(' ');
      const text = `*${content.title} ${content.year || ''}*\n${partsStr}`;
      
      let files: File[] = [];
      if (content.posterUrl) {
        try {
          const response = await fetch(content.posterUrl);
          const blob = await response.blob();
          const file = new File([blob], 'poster.jpg', { type: blob.type || 'image/jpeg' });
          files = [file];
        } catch (e) {
          console.error("Direct fetch failed, falling back to proxy for WhatsApp sharing", e);
          try {
            const proxyResponse = await fetch(`/api/image-proxy?url=${encodeURIComponent(content.posterUrl)}`);
            if (proxyResponse.ok) {
              const blob = await proxyResponse.blob();
              const file = new File([blob], 'poster.jpg', { type: blob.type || 'image/jpeg' });
              files = [file];
            } else {
              throw new Error("Proxy fetch also failed");
            }
          } catch (proxyError) {
             console.error("Could not fetch poster for WhatsApp sharing via proxy", proxyError);
          }
        }
      }

      const shareData: any = {
        title: content.title,
        text: text,
      };

      if (files.length > 0 && navigator.canShare && navigator.canShare({ files })) {
        shareData.files = files;
      }

      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(text);
        setAlertConfig({ isOpen: true, title: 'Success', message: 'WhatsApp share content copied to clipboard!' });
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
         try {
           const fallbackText = `*${content.title} ${content.year || ''}*\n\n${content.posterUrl ? content.posterUrl + '\n\n' : ''}`;
           await navigator.clipboard.writeText(fallbackText);
           setAlertConfig({ isOpen: true, title: 'Notice', message: 'Sharing failed directly, but content was copied to clipboard.' });
         } catch(e) {
           setAlertConfig({ isOpen: true, title: 'Error', message: 'Failed to share to WhatsApp.' });
         }
      }
    } finally {
      setLoadingWhatsappShareId(null);
    }
  };

  const formatRuntimeForShare = (runtimeStr?: string) => {
    return formatRuntime(runtimeStr);
  };

  const formatReleaseDateForShare = (dateStr?: string) => {
    return formatDateToMonthDDYYYY(dateStr);
  };

  const executeShare = async (content: Content, selectedSeasonNumbers?: number[]) => {
    setLoadingShareId(content.id);
    let text = `🎬 *${content.title}${content.year ? ` (${content.year})` : ''}*\n\n`;
    
    const contentGenres = genres.filter(g => content.genreIds?.includes(g.id)).map(g => g.name).join(', ');
    if (contentGenres) text += `🎭 Genres: ${contentGenres}\n`;
    
    const contentLangs = languages.filter(l => content.languageIds?.includes(l.id)).map(l => l.name).join(', ');
    if (contentLangs) text += `🗣️ Languages: ${contentLangs}\n`;

    const contentQuality = qualities.find(q => q.id === content.qualityId)?.name;
    if (contentQuality) text += `🖨️ Print Quality: ${contentQuality}\n`;
    
    if (content.runtime) text += `⏱️ Runtime: ${formatRuntimeForShare(content.runtime)}\n`;
    if (content.releaseDate) text += `📅 Release: ${formatReleaseDateForShare(content.releaseDate)}\n`;
    if (content.subtitles) text += `📝 Subtitles: Available\n`;
    
    if (content.sampleUrl) text += `📽️ Sample: ${content.sampleUrl}\n`;
    text += `\n`;

    let hasUpdates = false;
    let updatedContent = { ...content };

    const processLink = async (link: LinkDef) => {
      if (!link.url) return link;
      
      // If the original URL is HTML, it's broken
      if (link.url.toLowerCase().includes('<html')) {
        return { ...link, url: '', tinyUrl: '' };
      }

      const isBadTinyUrl = link.tinyUrl && link.tinyUrl.toLowerCase().includes('<html');
      
      if (!link.url.includes('pixeldrain.com') && !link.url.includes('pixeldrain.dev') && !link.url.includes('pixeldrain.net') && (!link.tinyUrl || isBadTinyUrl)) {
        const tinyUrl = await generateTinyUrl(link.url, true, settings?.supportNumber || '3363284466');
        if (tinyUrl && tinyUrl !== link.url && !tinyUrl.toLowerCase().includes('<html')) {
          hasUpdates = true;
          return { ...link, tinyUrl };
        } else if (isBadTinyUrl) {
          // If we had a bad tinyUrl and couldn't generate a new one, clear it
          hasUpdates = true;
          return { ...link, tinyUrl: '' };
        }
      }
      return link;
    };

    if (updatedContent.type === 'movie' && updatedContent.movieLinks) {
      const links: QualityLinks = parseLinks(updatedContent.movieLinks);
      
      const processedLinks = await Promise.all(links.map(processLink));
      for (let i = 0; i < links.length; i++) {
        links[i] = processedLinks[i];
      }

      if (hasUpdates) {
        updatedContent.movieLinks = JSON.stringify(links);
      }

      const sortedLinks = [...links].sort((a, b) => getSizeInMB(a.size, a.unit) - getSizeInMB(b.size, b.unit));
      
      const zipLinks = sortedLinks.filter(l => l.name.toLowerCase().includes('zip'));
      const mkvLinks = sortedLinks.filter(l => l.name.toLowerCase().includes('mkv'));
      const otherLinks = sortedLinks.filter(l => !l.name.toLowerCase().includes('zip') && !l.name.toLowerCase().includes('mkv'));

      if (zipLinks.length > 0 || mkvLinks.length > 0 || otherLinks.length > 0) {
        text += `📥 *Download Links:*\n`;
      }

      if (zipLinks.length > 0) {
        text += `\n📦 *ZIP Files:*\n`;
        zipLinks.forEach(l => { 
          const finalUrl = l.tinyUrl || l.url;
          if (finalUrl && !finalUrl.toLowerCase().includes('<html')) {
            text += `▪️ ${l.name} (${l.size}${l.unit})\n${finalUrl}\n`; 
          }
        });
      }
      if (mkvLinks.length > 0) {
        text += `\n🎞️ *MKV Files:*\n`;
        mkvLinks.forEach(l => { 
          const finalUrl = l.tinyUrl || l.url;
          if (finalUrl && !finalUrl.toLowerCase().includes('<html')) {
            text += `▪️ ${l.name} (${l.size}${l.unit})\n${finalUrl}\n`; 
          }
        });
      }
      if (otherLinks.length > 0) {
        if (zipLinks.length > 0 || mkvLinks.length > 0) text += `\n📄 *Other Files:*\n`;
        otherLinks.forEach(l => { 
          const finalUrl = l.tinyUrl || l.url;
          if (finalUrl && !finalUrl.toLowerCase().includes('<html')) {
            text += `▪️ ${l.name} (${l.size}${l.unit})\n${finalUrl}\n`; 
          }
        });
      }
    } else if (updatedContent.type === 'series' && updatedContent.seasons) {
      const parsedSeasons: Season[] = Array.isArray(updatedContent.seasons) ? updatedContent.seasons : JSON.parse(updatedContent.seasons || '[]');
      const seasonsToShare = selectedSeasonNumbers 
        ? parsedSeasons.filter(s => selectedSeasonNumbers.includes(s.seasonNumber))
        : parsedSeasons;

      const linkPromises: Promise<void>[] = [];

      for (let s = 0; s < parsedSeasons.length; s++) {
        const season = parsedSeasons[s];
        
        if (season.zipLinks) {
          linkPromises.push((async () => {
            const processed = await Promise.all(season.zipLinks!.map(processLink));
            season.zipLinks = processed;
          })());
        }
        if (season.mkvLinks) {
          linkPromises.push((async () => {
            const processed = await Promise.all(season.mkvLinks!.map(processLink));
            season.mkvLinks = processed;
          })());
        }
        if (season.episodes) {
          for (let e = 0; e < season.episodes.length; e++) {
            const ep = season.episodes[e];
            if (ep.links) {
              linkPromises.push((async () => {
                const processed = await Promise.all(ep.links.map(processLink));
                ep.links = processed;
              })());
            }
          }
        }
      }

      await Promise.all(linkPromises);

      if (hasUpdates) {
        updatedContent.seasons = JSON.stringify(parsedSeasons);
      }

      seasonsToShare.forEach(season => {
        text += `\n📺 *Season ${season.seasonNumber}${season.year ? ` (${season.year})` : updatedContent.year ? ` (${updatedContent.year})` : ''}*\n`;
        const zipLinks = parseLinks(JSON.stringify(season.zipLinks)).filter(l => l && l.url).sort((a, b) => getSizeInMB(a.size, a.unit) - getSizeInMB(b.size, b.unit));
        const mkvLinks = parseLinks(JSON.stringify(season.mkvLinks || [])).filter(l => l && l.url).sort((a, b) => getSizeInMB(a.size, a.unit) - getSizeInMB(b.size, b.unit));
        
        if (zipLinks.length > 0) {
          text += `📦 *Full Season ZIP:*\n`;
          zipLinks.forEach((link) => {
            const finalUrl = link.tinyUrl || link.url;
            if (finalUrl && !finalUrl.toLowerCase().includes('<html')) {
              text += `  ▪️ ${link.name} (${link.size}${link.unit})\n  ${finalUrl}\n`;
            }
          });
        }
        if (mkvLinks.length > 0) {
          text += `\n🎞️ *Full Season MKV:*\n`;
          mkvLinks.forEach((link) => {
            const finalUrl = link.tinyUrl || link.url;
            if (finalUrl && !finalUrl.toLowerCase().includes('<html')) {
              text += `  ▪️ ${link.name} (${link.size}${link.unit})\n  ${finalUrl}\n`;
            }
          });
        }
        if (season.episodes && season.episodes.length > 0) {
          const allEpLinks = season.episodes.flatMap(ep => parseLinks(JSON.stringify(ep.links)).filter(l => l && l.url));
          const uniqueQualities = [...new Set(allEpLinks.map(l => l.name))];
          const hasUniformQuality = uniqueQualities.length === 1 && 
                                   allEpLinks.length === season.episodes.length &&
                                   season.episodes.every(ep => parseLinks(JSON.stringify(ep.links)).filter(l => l && l.url).length === 1);

          if (hasUniformQuality) {
            text += `\n🎬 *Episodes (${uniqueQualities[0]}):*\n`;
            season.episodes.forEach(ep => {
              const link = parseLinks(JSON.stringify(ep.links)).find(l => l && l.url);
              if (link) {
                const finalUrl = link.tinyUrl || link.url;
                if (finalUrl && !finalUrl.toLowerCase().includes('<html')) {
                  text += `E${ep.episodeNumber}: ${ep.title}${ep.duration ? ` (${ep.duration})` : ''} (${link.size}${link.unit})\n${finalUrl}\n`;
                }
              }
            });
          } else {
            text += `\n🎬 *Episodes:*\n`;
            season.episodes.forEach(ep => {
              text += `E${ep.episodeNumber}: ${ep.title}${ep.duration ? ` (${ep.duration})` : ''}\n`;
              const epLinks = parseLinks(JSON.stringify(ep.links)).sort((a, b) => getSizeInMB(a.size, a.unit) - getSizeInMB(b.size, b.unit));
              epLinks.forEach((link) => {
                if (link && link.url) {
                  const finalUrl = link.tinyUrl || link.url;
                  if (finalUrl && !finalUrl.toLowerCase().includes('<html')) {
                    text += `- ${link.name} (${link.size}${link.unit})\n${finalUrl}\n`;
                  }
                }
              });
            });
          }
        }
      });
    }

    if (hasUpdates) {
      try {
        await updateDoc(doc(db, 'content', updatedContent.id), {
          movieLinks: JSON.stringify(updatedContent.movieLinks || []),
          seasons: JSON.stringify(updatedContent.seasons || [])
        });
      } catch (error) {
        console.error("Error saving tinyUrls to db:", error);
      }
    }

    text += `\n🍿 Enjoy watching on ${settings?.headerText || 'MovizNow'}!\n`;
    text += `📞 WhatsApp: 0${settings?.supportNumber || '3363284466'}`;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: updatedContent.title,
          text: text,
        });
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          // Fallback to clipboard
          try {
            await navigator.clipboard.writeText(text);
            setAlertConfig({ isOpen: true, title: 'Success', message: 'Share content copied to clipboard! You can now paste it in WhatsApp.' });
          } catch (clipErr) {
            // Last resort: WhatsApp direct link
            const encodedText = encodeURIComponent(text);
            window.open(`https://wa.me/?text=${encodedText}`, '_blank');
          }
        }
      }
    } else {
      // Fallback for browsers without navigator.share
      try {
        await navigator.clipboard.writeText(text);
        setAlertConfig({ isOpen: true, title: 'Success', message: 'Share content copied to clipboard! You can now paste it in WhatsApp.' });
      } catch (clipErr) {
        const encodedText = encodeURIComponent(text);
        window.open(`https://wa.me/?text=${encodedText}`, '_blank');
      }
    }
    setLoadingShareId(null);
  };

  const handleCopyData = async (content: Content) => {
    if (!content.posterUrl) {
      setAlertConfig({ isOpen: true, title: 'Poster Required', message: 'Cannot copy data because poster URL is missing.' });
      return;
    }

    let text = `🎬 *${content.title}${content.year ? ` (${content.year})` : ''}*\n\n`;
    text += `Type: ${content.type.charAt(0).toUpperCase() + content.type.slice(1)}\n`;
    
    const contentGenres = genres.filter(g => content.genreIds?.includes(g.id)).map(g => g.name).join(', ');
    if (contentGenres) text += `🎭 Genres: ${contentGenres}\n`;
    
    const contentLangs = languages.filter(l => content.languageIds?.includes(l.id)).map(l => l.name).join(', ');
    if (contentLangs) text += `🗣️ Languages: ${contentLangs}\n`;

    const contentQuality = qualities.find(q => q.id === content.qualityId)?.name;
    if (contentQuality) text += `🖨️ Print Quality: ${contentQuality}\n`;

    if (content.imdbLink) text += `⭐ IMDb: ${content.imdbLink}\n`;
    if (content.trailerUrl) text += `🎥 Trailer: ${content.trailerUrl}\n`;
    if (content.sampleUrl) text += `📽️ Sample: ${content.sampleUrl}\n`;
    if (content.posterUrl) text += `🖼️ Poster: ${content.posterUrl}\n`;
    if (content.cast && content.cast.length > 0) text += `👥 Cast: ${content.cast.join(', ')}\n`;
    if (content.description) text += `📝 Description: ${content.description}\n\n`;

    if (content.type === 'movie' && content.movieLinks) {
      const links: QualityLinks = parseLinks(content.movieLinks);
      text += `📥 *Download Links:*\n`;
      links.forEach(l => {
        if (l.url) text += `▪️ ${l.name} (${l.size}${l.unit}): ${l.url}\n`;
      });
    } else if (content.type === 'series' && content.seasons) {
      try {
        const parsedSeasons: Season[] = Array.isArray(content.seasons) ? content.seasons : JSON.parse(content.seasons || '[]');
        parsedSeasons.forEach(season => {
          text += `\n📺 *Season ${season.seasonNumber}${season.year ? ` (${season.year})` : content.year ? ` (${content.year})` : ''}*\n`;
          const zipLinks = parseLinks(JSON.stringify(season.zipLinks));
          const mkvLinks = parseLinks(JSON.stringify(season.mkvLinks || []));
          
          if (zipLinks.length > 0) {
            text += `📦 *Full Season ZIP:*\n`;
            zipLinks.forEach((link) => {
              if (link && link.url) text += `  ▪️ ${link.name} (${link.size}${link.unit}): ${link.url}\n`;
            });
          }
          if (mkvLinks.length > 0) {
            text += `\n🎞️ *Full Season MKV:*\n`;
            mkvLinks.forEach((link) => {
              if (link && link.url) text += `  ▪️ ${link.name} (${link.size}${link.unit}): ${link.url}\n`;
            });
          }
          if (season.episodes && season.episodes.length > 0) {
            text += `\n🎬 *Episodes:*\n`;
            season.episodes.forEach(ep => {
              text += `  E${ep.episodeNumber}: ${ep.title}\n`;
              const epLinks = parseLinks(JSON.stringify(ep.links));
              epLinks.forEach((link) => {
                if (link && link.url) text += `    - ${link.name} (${link.size}${link.unit}): ${link.url}\n`;
              });
            });
          }
        });
      } catch (e) {
        console.error("Error parsing seasons for copy:", e);
        text += `\n⚠️ Error parsing season data.\n`;
      }
    }

    try {
      await navigator.clipboard.writeText(text);
      setAlertConfig({ isOpen: true, title: 'Success', message: 'All data copied to clipboard!' });
    } catch (err) {
      console.error('Error copying data:', err);
      setAlertConfig({ isOpen: true, title: 'Error', message: 'Failed to copy data' });
    }
  };

  const handleAutoFill = () => {
    if (!autoFillText) return;

    const lines = autoFillText.split('\n');
    let newTitle = '';
    let newYear = year;
    let newType: 'movie' | 'series' = type;
    let newDescription = '';
    let newCast = '';
    let newImdb = '';
    let newTrailer = '';
    let newSample = '';
    let newPoster = '';
    let newReleaseDate = '';
    let newGenreIds: string[] = [];
    let newLanguageIds: string[] = [];
    let newQualityId = '';
    let newMovieLinks: QualityLinks = [];
    let newSeasons: Season[] = [];

    const findGenreId = (name: string) => {
      const fetched = name.toLowerCase();
      return genres.find(g => {
        const gName = g.name.toLowerCase();
        return fetched === gName || 
          fetched.includes(gName) || 
          gName.includes(fetched) ||
          (fetched === 'history' && gName === 'historical') ||
          (fetched === 'historical' && gName === 'history') ||
          (fetched === 'sci-fi' && gName.includes('sci')) ||
          (fetched === 'science fiction' && gName.includes('sci'));
      })?.id;
    };
    const findLanguageId = (name: string) => languages.find(l => l.name.toLowerCase() === name.toLowerCase())?.id;
    const findQualityId = (name: string) => qualities.find(q => q.name.toLowerCase() === name.toLowerCase())?.id;

    let currentSeason: Season | null = null;
    let currentEpisode: Episode | null = null;
    let linkSection: 'movie' | 'zip' | 'mkv' | 'episode' | null = null;

    lines.forEach(line => {
      const trimmed = line.trim();
      if (!trimmed) return;

      // Title and Year: 🎬 *Title (Year)* or Title (Year) or just Title Year
      const titleYearMatch = trimmed.match(/🎬?\s*\*?([^(]+)\s*\((\d{4})\)\*?/) || 
                            trimmed.match(/🎬?\s*\*?([^(]+)\s*(\d{4})\*?/);
      if (titleYearMatch && !newTitle) { // Only set if not already set by first link
        newTitle = titleYearMatch[1].replace(/[🎬\*]/g, '').trim();
        newYear = parseInt(titleYearMatch[2]);

        // Further clean Title: if it includes markers, take everything before
        const noiseMarkers = ['\\d{3,4}p', '[0-9]k', 'web[-.\\s_]?(dl|rip)', 'hd[-.\\s_]?rip', 'blu[-.\\s_]?ray', 'bd[-.\\s_]?rip', 'br[-.\\s_]?rip', 'hdtc', 'hdcam', 'dvdrip', 'webrip', 'hevc', 'x264', 'x265', 'dual[-.\\s_]?audio', 'hindi', 'english'];
        const markerRegex = new RegExp(`\\b(${noiseMarkers.join('|')})\\b`, 'i');
        const markerMatch = newTitle.match(markerRegex);
        if (markerMatch) {
          newTitle = newTitle.substring(0, markerMatch.index).trim();
        }
        
        // Capitalize
        newTitle = newTitle.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
      }

      // Type
      if (trimmed.toLowerCase().includes('type: movie')) newType = 'movie';
      if (trimmed.toLowerCase().includes('type: series')) newType = 'series';

      // Genres
      if (trimmed.includes('🎭 Genres:')) {
        const genreNames = trimmed.split('🎭 Genres:')[1].split(',').map(s => s.trim());
        newGenreIds = genreNames.map(findGenreId).filter(Boolean) as string[];
      }

      // Languages
      if (trimmed.includes('🗣️ Languages:')) {
        const langNames = trimmed.split('🗣️ Languages:')[1].split(',').map(s => s.trim());
        newLanguageIds = langNames.map(findLanguageId).filter(Boolean) as string[];
      }

      // Quality
      if (trimmed.includes('📺 Quality:')) {
        const qName = trimmed.split('📺 Quality:')[1].trim();
        newQualityId = findQualityId(qName) || '';
      }

      // IMDb
      if (trimmed.includes('IMDb:')) {
        const match = trimmed.match(/https?:\/\/[^\s]+/);
        if (match) newImdb = match[0];
      }

      // Trailer
      if (trimmed.includes('Trailer:')) {
        const match = trimmed.match(/https?:\/\/[^\s]+/);
        if (match) newTrailer = match[0];
      }

      // Sample
      if (trimmed.includes('Sample:')) {
        const match = trimmed.match(/https?:\/\/[^\s]+/);
        if (match) newSample = match[0];
      }

      // Poster
      if (trimmed.includes('Poster:')) {
        const match = trimmed.match(/https?:\/\/[^\s]+/);
        if (match) newPoster = match[0];
      }

      // Release Date
      if (trimmed.includes('📅 Release:')) {
        newReleaseDate = trimmed.split('📅 Release:')[1].trim();
      } else if (trimmed.includes('Release Date:')) {
        newReleaseDate = trimmed.split('Release Date:')[1].trim();
      }

      // Cast
      if (trimmed.includes('👥 Cast:')) {
        newCast = trimmed.split('👥 Cast:')[1].trim();
      }

      // Description
      if (trimmed.includes('📝 Description:')) {
        newDescription = trimmed.split('📝 Description:')[1].trim();
      }

      // Links Detection
      if (trimmed.includes('Download Links:')) {
        linkSection = 'movie';
        newType = 'movie';
      }
      if (trimmed.includes('Full Season ZIP:')) {
        linkSection = 'zip';
        newType = 'series';
        if (!currentSeason) {
          currentSeason = {
            id: Math.random().toString(36).substr(2, 9),
            seasonNumber: 1,
            zipLinks: [],
            mkvLinks: [],
            episodes: []
          };
          newSeasons.push(currentSeason);
        }
      }
      if (trimmed.includes('Full Season MKV:')) {
        linkSection = 'mkv';
        newType = 'series';
        if (!currentSeason) {
          currentSeason = {
            id: Math.random().toString(36).substr(2, 9),
            seasonNumber: 1,
            zipLinks: [],
            mkvLinks: [],
            episodes: []
          };
          newSeasons.push(currentSeason);
        }
      }
      if (trimmed.includes('Episodes:')) {
        linkSection = 'episode';
        newType = 'series';
        if (!currentSeason) {
          currentSeason = {
            id: Math.random().toString(36).substr(2, 9),
            seasonNumber: 1,
            zipLinks: [],
            mkvLinks: [],
            episodes: []
          };
          newSeasons.push(currentSeason);
        }
      }

      // Season Detection: 📺 *Season X (Year)*
      const seasonMatch = trimmed.match(/📺?\s*\*?Season\s*(\d+)/i);
      if (seasonMatch) {
        newType = 'series';
        const sNum = parseInt(seasonMatch[1]);
        currentSeason = {
          id: Math.random().toString(36).substr(2, 9),
          seasonNumber: sNum,
          zipLinks: [],
          mkvLinks: [],
          episodes: []
        };
        newSeasons.push(currentSeason);
      }

      // Episode Detection: E1: Title or - E1: Title
      const epMatch = trimmed.match(/E(\d+):\s*(.*)/i);
      if (epMatch) {
        if (!currentSeason) {
          currentSeason = {
            id: Math.random().toString(36).substr(2, 9),
            seasonNumber: 1,
            zipLinks: [],
            mkvLinks: [],
            episodes: []
          };
          newSeasons.push(currentSeason);
        }
        const epNum = parseInt(epMatch[1]);
        currentEpisode = {
          id: Math.random().toString(36).substr(2, 9),
          episodeNumber: epNum,
          title: epMatch[2].trim(),
          links: []
        };
        currentSeason.episodes.push(currentEpisode);
        linkSection = 'episode';
      }

      // Link Parsing
      // Skip metadata lines that might contain URLs to avoid adding them as download links
      if (trimmed.startsWith('IMDb:') || trimmed.startsWith('Trailer:') || trimmed.startsWith('Sample:') || trimmed.startsWith('Poster:')) {
        return;
      }

      const urlMatch = trimmed.match(/(https?:\/\/[^\s]+)/);
      if (urlMatch && linkSection) {
        let url = urlMatch[1];
        
        // Auto-convert /api/file/ to /u/ and /api/list/ to /l/
        if (url.includes('/api/file/')) {
          url = url.replace('/api/file/', '/u/');
        } else if (url.includes('/api/list/')) {
          url = url.replace('/api/list/', '/l/');
        }
        
        const sizeMatch = trimmed.match(/([\d.]+)\s*(MB|GB)/i);
        const size = sizeMatch ? sizeMatch[1] : '';
        const unit = sizeMatch ? sizeMatch[2].toUpperCase() as 'MB' | 'GB' : 'MB';
        
        let name = '';
        if (sizeMatch) {
          name = trimmed.substring(0, sizeMatch.index)
            .replace(/^[▪️\-*•\s]+/, '')
            .replace(/[\[\]():]/g, '')
            .replace(/[\-*\s]+$/, '')
            .trim();
        } else {
          name = trimmed.substring(0, urlMatch.index)
            .replace(/^[▪️\-*•\s]+/, '')
            .replace(/[\[\]():]/g, '')
            .replace(/[\-*\s]+$/, '')
            .trim();
        }
        
        if (!name || name.toLowerCase() === 'download' || name.toLowerCase() === 'link') {
          let count = 1;
          if (linkSection === 'movie') count = newMovieLinks.length + 1;
          else if (linkSection === 'zip' && currentSeason) count = currentSeason.zipLinks.length + 1;
          else if (linkSection === 'mkv' && currentSeason) count = (currentSeason.mkvLinks?.length || 0) + 1;
          else if (linkSection === 'episode' && currentEpisode) count = currentEpisode.links.length + 1;
          name = `Link ${count}`;
        }

        // Skip if URL is actually HTML
        if (url.toLowerCase().includes('<html')) {
          return;
        }

        const link: LinkDef = {
          id: Math.random().toString(36).substr(2, 9),
          name,
          size,
          unit,
          url
        };

        if (linkSection === 'movie') {
          if (!newMovieLinks.some(l => l.url === url)) {
            newMovieLinks.push(link);
          }
        } else if (linkSection === 'zip' && currentSeason) {
          if (!currentSeason.zipLinks.some(l => l.url === url)) {
            currentSeason.zipLinks.push(link);
          }
        } else if (linkSection === 'mkv' && currentSeason) {
          if (!currentSeason.mkvLinks) currentSeason.mkvLinks = [];
          if (!currentSeason.mkvLinks.some(l => l.url === url)) {
            currentSeason.mkvLinks.push(link);
          }
        } else if (linkSection === 'episode' && currentEpisode) {
          if (!currentEpisode.links.some(l => l.url === url)) {
            currentEpisode.links.push(link);
          }
        }
      }
    });

    if (newTitle) setTitle(newTitle);
    if (newYear) setYear(newYear);
    setType(newType);
    if (newDescription) setDescription(newDescription);
    if (newCast) setCast(newCast);
    if (newImdb) setImdbLink(newImdb);
    if (newTrailer) setTrailerUrl(newTrailer);
    if (newSample) setSampleUrl(newSample);
    if (newPoster) setPosterUrl(newPoster);
    if (newReleaseDate) setReleaseDate(newReleaseDate);
    if (newGenreIds.length > 0) setSelectedGenres(newGenreIds);
    if (newLanguageIds.length > 0) setSelectedLanguages(newLanguageIds);
    if (newQualityId) setSelectedQuality(newQualityId);
    if (newMovieLinks.length > 0) setMovieLinks(newMovieLinks);
    if (newSeasons.length > 0) setSeasons(newSeasons);

    setIsAutoFillModalOpen(false);
    setAutoFillText('');
    setAlertConfig({ isOpen: true, title: 'Success', message: 'Data auto-filled successfully!' });
  };


  const uniqueYears = useMemo(() => {
    const years = new Set(contentList.map(c => Number(c.year)).filter(y => y > 0 && !isNaN(y)));
    return Array.from(years).sort((a, b) => b - a);
  }, [contentList]);

  const getMissingLabels = useCallback((content: Content, profile: any) => {
    const labels: string[] = [];
    const isStaff = profile?.role === 'owner' || profile?.role === 'admin' || profile?.role === 'manager' || profile?.role === 'content_manager';
    if (!isStaff) return [];

    const safeParse = (data: any) => {
        if (!data) return [];
        try {
            const parsed = typeof data === 'string' ? JSON.parse(data) : data;
            if (Array.isArray(parsed)) return parsed;
            if (typeof parsed === 'object') {
                return Object.entries(parsed).map(([name, val]: [string, any]) => ({
                    name,
                    url: typeof val === 'string' ? val : val?.url || '',
                    ... (typeof val === 'object' ? val : {})
                }));
            }
        } catch(e) {}
        return [];
    };

    if (isStaff) {
      if (!content.posterUrl) labels.push('Missing Poster');
      if (!content.year) labels.push('Missing Year');
      if (!content.releaseDate) labels.push('Missing Release Date');
      if (!content.imdbLink) labels.push('Missing IMDb Link');
      if (!content.genreIds || content.genreIds.length === 0) labels.push('Missing Genre');
      if (!content.languageIds || content.languageIds.length === 0) labels.push('Missing Language');
      if (!content.qualityId) labels.push('Missing Print Quality');
      if (!content.trailerUrl && (!content.trailers || content.trailers === '[]' || (Array.isArray(content.trailers) && content.trailers.length === 0))) labels.push('Missing Trailer');
      if (content.type === 'movie') {
          try {
              let has480 = false, has720 = false, has1080 = false;
              const ml = safeParse(content.movieLinks);
              
              const isStandard = (l: any, res: string) => 
                  (l.name?.includes(res) || l.quality === res) && 
                  !l.name?.toUpperCase().includes('HEVC') &&
                  l.url;
                  
              has480 = ml.some((l: any) => isStandard(l, '480p'));
              has720 = ml.some((l: any) => isStandard(l, '720p'));
              has1080 = ml.some((l: any) => isStandard(l, '1080p'));

              // Explicitly catch any empty URL in existing links, but skip standard ones we'll flag anyway
              ml.forEach((l: any) => {
                  const isStd = ['480p', '720p', '1080p'].some(res => 
                      (l.name?.includes(res) || l.quality === res) && !l.name?.toUpperCase().includes('HEVC')
                  );
                  if (!l.url && !isStd) labels.push(`Missing Link URL: ${l.name || 'Link'}`);
              });

              if (!has480) labels.push('Missing 480p');
              if (!has720) labels.push('Missing 720p');
              if (!has1080) labels.push('Missing 1080p');
          } catch(e){
              console.error('Error parsing movieLinks', e);
          }
      } else if (content.type === 'series') {
          try {
              if (content.seasons) {
                  const seasonsList = typeof content.seasons === 'string' ? JSON.parse(content.seasons) : (Array.isArray(content.seasons) ? content.seasons : []);
                  if (seasonsList.length === 0) {
                      labels.push('Missing Seasons Data');
                  } else {
                      seasonsList.forEach((s: any) => {
                          if (!s.year) labels.push(`Missing S${s.seasonNumber} Year`);
                          
                          const zips = safeParse(s.zipLinks);
                          const mkvs = safeParse(s.mkvLinks);

                          if (zips.length === 0) labels.push(`Missing S${s.seasonNumber} Zip`);
                          if (mkvs.length === 0) labels.push(`Missing S${s.seasonNumber} MKV`);
                          
                          if (!s.episodes || !Array.isArray(s.episodes) || s.episodes.length === 0) {
                              labels.push(`Missing S${s.seasonNumber} Episodes`);
                          } else {
                              const seasonHas1080pEpisode = s.episodes.some((ep: any) => {
                                  const epLinks = safeParse(ep.links);
                                  return epLinks.some((l: any) => l.name?.includes('1080p') || l.quality === '1080p');
                              });

                              s.episodes.forEach((ep: any) => {
                                  const epLinks = safeParse(ep.links);
                                  if (epLinks.length === 0) {
                                      labels.push(`Missing S${s.seasonNumber}E${ep.episodeNumber}`);
                                  } else {
                                      const isStd = (l: any, res: string) => (l.name?.includes(res) || l.quality === res) && !l.name?.toUpperCase().includes('HEVC') && l.url;
                                      const has720p = epLinks.some((l: any) => isStd(l, '720p'));
                                      const has1080p = epLinks.some((l: any) => isStd(l, '1080p'));
                                      
                                      epLinks.forEach((l: any) => {
                                          const isStandardRes = ['480p', '720p', '1080p'].some(res => 
                                              (l.name?.includes(res) || l.quality === res) && !l.name?.toUpperCase().includes('HEVC')
                                          );
                                          if (!l.url && !isStandardRes) labels.push(`Missing S${s.seasonNumber}E${ep.episodeNumber} URL: ${l.name || 'Link'}`);
                                      });

                                      if (!has720p) labels.push(`Missing S${s.seasonNumber}E${ep.episodeNumber} 720p`);
                                      if (seasonHas1080pEpisode && !has1080p) labels.push(`Missing S${s.seasonNumber}E${ep.episodeNumber} 1080p`);
                                  }
                              });
                          }
                          
                          if (zips.length > 0) {
                              const isStandardZip = (l: any, res: string) => {
                                  return (l.name?.includes(res) || l.quality === res) && !l.name?.toUpperCase().includes('HEVC') && l.url;
                              };
                              let has480 = zips.some((l: any) => isStandardZip(l, '480p'));
                              let has720 = zips.some((l: any) => isStandardZip(l, '720p'));
                              let has1080 = zips.some((l: any) => isStandardZip(l, '1080p'));
                              
                              zips.forEach((l: any) => {
                                  const isStandardRes = ['480p', '720p', '1080p'].some(res => 
                                      (l.name?.includes(res) || l.quality === res) && !l.name?.toUpperCase().includes('HEVC')
                                  );
                                  if (!l.url && !isStandardRes) labels.push(`Missing S${s.seasonNumber} Zip URL: ${l.name || 'Link'}`);
                              });

                              if (!has480) labels.push(`Missing S${s.seasonNumber} Zip 480p`);
                              if (!has720) labels.push(`Missing S${s.seasonNumber} Zip 720p`);
                              if (!has1080) labels.push(`Missing S${s.seasonNumber} Zip 1080p`);
                          }
                          
                          if (mkvs.length > 0) {
                              const isStandardMkv = (l: any, res: string) => {
                                  return (l.name?.includes(res) || l.quality === res) && l.url;
                              };
                              let has480 = mkvs.some((l: any) => isStandardMkv(l, '480p'));
                              let has720 = mkvs.some((l: any) => isStandardMkv(l, '720p'));
                              let has1080 = mkvs.some((l: any) => isStandardMkv(l, '1080p'));

                              mkvs.forEach((l: any) => {
                                  const isStandardRes = ['480p', '720p', '1080p'].some(res => 
                                      (l.name?.includes(res) || l.quality === res)
                                  );
                                  if (!l.url && !isStandardRes) labels.push(`Missing S${s.seasonNumber} MKV URL: ${l.name || 'Link'}`);
                              });

                              if (!has480) labels.push(`Missing S${s.seasonNumber} MKV 480p`);
                              if (!has720) labels.push(`Missing S${s.seasonNumber} MKV 720p`);
                              if (!has1080) labels.push(`Missing S${s.seasonNumber} MKV 1080p`);
                          }
                      });
                  }
              } else {
                  labels.push('Missing Seasons Data');
              }
          } catch(e) {
              console.error('Error parsing seasons', e);
          }
      }
    }
    return labels;
  }, []);

  const duplicateIds = useMemo(() => {
    const ids = new Set<string>();
    const duplicateGroups = new Map<string, string[]>();
    contentList.forEach(c => {
      const title = (c.title || '').trim().toLowerCase();
      // Normalize series titles for duplicate detection by removing season markers (e.g. "Season 1", "S1")
      // this ensures "Show Season 1" and "Show Season 2" are correctly identified as duplicates
      const baseTitle = c.type === 'series' 
        ? title.replace(/\s+(s(eason)?|part|vol)\s*\d+/gi, '').trim()
        : title;

      let key = '';
      if (c.type === 'movie') {
         key = `movie_${baseTitle}_${c.year || ''}`;
      } else {
         key = `series_${baseTitle}`;
      }
      if (!duplicateGroups.has(key)) {
         duplicateGroups.set(key, []);
      }
      duplicateGroups.get(key)!.push(c.id);
    });

    duplicateGroups.forEach(group => {
      if (group.length > 1) {
        group.forEach(id => ids.add(id));
      }
    });

    return ids;
  }, [contentList]);

  const filteredContent = useMemo(() => {
    let result = contentList;
    
    if (showDuplicates) {
      result = result.filter(c => duplicateIds.has(c.id));
    }

    if (showMissing === 'missing') {
      result = result.filter(c => {
        const labels = getMissingLabels(c, profile);
        return labels.length > 0;
      });
    } else if (showMissing === 'complete') {
      result = result.filter(c => {
        const labels = getMissingLabels(c, profile);
        return labels.length === 0;
      });
    } else if (showMissing === 'disabled') {
      result = result.filter(c => (c.status || 'published') === 'draft');
    } else if (showMissing !== 'none') {
      result = result.filter(c => {
        const labels = getMissingLabels(c, profile);
        if (labels.length === 0) return false;

        let searchTag = '';
        if (showMissing === 'trailer') searchTag = 'Missing Trailer';
        else if (showMissing === 'genre') searchTag = 'Missing Genre';
        else if (showMissing === 'language') searchTag = 'Missing Language';
        else if (showMissing === 'quality') searchTag = 'Missing Print Quality';
        else if (showMissing === 'poster') searchTag = 'Missing Poster';
        else if (showMissing === 'year') searchTag = 'Missing Year';
        else if (showMissing === 'releaseDate') searchTag = 'Missing Release Date';
        else if (showMissing === 'imdb') searchTag = 'Missing IMDb Link';
        else searchTag = showMissing; // e.g. '480p', '720p', '1080p'
        
        // For metadata fields (Poster, Year, Release Date, IMDb), show ANY item missing that field
        if (['poster', 'year', 'releaseDate', 'imdb'].includes(showMissing)) {
          return labels.some(l => l.toLowerCase().includes(searchTag.toLowerCase()));
        }

        // For link qualities and metadata tags, use strict filtering: 
        // Show items missing ONLY that selected category to focus work
        return labels.every(l => l.toLowerCase().includes(searchTag.toLowerCase()));
      });
    }

    // Content Manager restriction: only see their own content
    if (profile?.role === 'content_manager' || profile?.role === 'manager') {
      result = result.filter(c => c.addedBy === user?.uid);
    }

    if (filterType !== 'all') {
      result = result.filter(c => c.type === filterType);
    }
    if (filterGenre !== 'all') {
      result = result.filter(c => c.genreIds?.includes(filterGenre));
    }
    if (filterLanguage !== 'all') {
      result = result.filter(c => c.languageIds?.includes(filterLanguage));
    }
    if (filterQuality !== 'all') {
      result = result.filter(c => c.qualityId === filterQuality);
    }
    if (filterYear !== 'all') {
      result = result.filter(c => String(c.year) === filterYear);
    }
    if (filterStatus !== 'all') {
      result = result.filter(c => (c.status || 'published') === filterStatus);
    }

    if (filterAddedBy !== 'all') {
      result = result.filter(c => c.addedBy === filterAddedBy);
    }
    if (debouncedSearchTerm) {
      result = smartSearch(result, debouncedSearchTerm, ['title', 'description', 'cast', 'country', 'year']);
    }
    
    // Sort according to user preference, just like Home page
    let sortedResult = [...result];
    sortedResult.sort((a, b) => {
        if (filterSort === 'default') {
          if (a.order !== undefined && b.order !== undefined) return a.order - b.order;
          if (a.order === undefined && b.order !== undefined) return -1;
          if (a.order !== undefined && b.order === undefined) return 1;
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }
        const timeA = new Date(a.createdAt).getTime();
        const timeB = new Date(b.createdAt).getTime();
        return filterSort === 'newest' ? timeB - timeA : timeA - timeB;
      });
    return sortedResult;
  }, [contentList, debouncedSearchTerm, filterType, filterGenre, filterLanguage, filterQuality, filterYear, filterStatus, filterSort, filterAddedBy, profile, user, showDuplicates, showMissing, duplicateIds]);

  const filteredGenres = useMemo(() => {
    if (!genreSearchTerm) return genres;
    return smartSearch(genres, genreSearchTerm);
  }, [genres, genreSearchTerm]);

  const filteredLanguages = useMemo(() => {
    if (!languageSearchTerm) return languages;
    return smartSearch(languages, languageSearchTerm);
  }, [languages, languageSearchTerm]);

  const handleSelectAll = () => {
    if (selectedContent.length > 0) {
      setSelectedContent([]);
    } else {
      setSelectedContent(filteredContent.map(c => c.id));
    }
  };

  const handleSelectContent = (id: string, e?: React.SyntheticEvent) => {
    if (e) e.stopPropagation();
    setSelectedContent(prev => 
      prev.includes(id) ? prev.filter(cId => cId !== id) : [...prev, id]
    );
  };

  const handleBulkStatusChange = async (status: 'published' | 'draft' | 'selected_content') => {
    if (!window.confirm(`Are you sure you want to change the status of ${selectedContent.length} items to ${status}?`)) return;
    
    const currentSelected = [...selectedContent];
    setSelectedContent([]);
    
    let batches = [writeBatch(db)];
    let currentBatchIndex = 0;
    let operationCount = 0;

    currentSelected.forEach(id => {
      const content = contentList.find(c => c.id === id);
      if (content) {
        // Prevent managers from modifying published content
        if ((profile?.role === 'content_manager' || profile?.role === 'manager') && content.status === 'published') {
          return;
        }
        const contentRef = doc(db, 'content', id);
        
        if (operationCount === 500) {
          batches.push(writeBatch(db));
          currentBatchIndex++;
          operationCount = 0;
        }

        const updateData: any = { status };
        
        // When moving from draft to published, consider it as new
        if (content.status === 'draft' && status === 'published') {
          updateData.createdAt = new Date().toISOString();
          updateData.order = deleteField();
        }

        batches[currentBatchIndex].update(contentRef, updateData);
        operationCount++;
      }
    });

    try {
      await Promise.all(batches.map(b => b.commit()));
    } catch (error) {
      console.error('Error updating content:', error);
      setAlertConfig({ isOpen: true, title: 'Error', message: 'Failed to update content' });
    }
  };

  const handleBulkDelete = async () => {
    setShowBulkDeleteConfirm(false);
    setIsBulkDeleting(true);
    
    const currentSelected = [...selectedContent];
    
    let batches = [writeBatch(db)];
    let currentBatchIndex = 0;
    let operationCount = 0;

    currentSelected.forEach(id => {
      const contentRef = doc(db, 'content', id);
      
      if (operationCount === 500) {
        batches.push(writeBatch(db));
        currentBatchIndex++;
        operationCount = 0;
      }
      batches[currentBatchIndex].delete(contentRef);
      operationCount++;
    });

    try {
      await Promise.all(batches.map(b => b.commit()));
      setSelectedContent([]);
      setAlertConfig({ isOpen: true, title: 'Success', message: `Successfully deleted ${currentSelected.length} items` });
    } catch (error) {
      console.error('Error deleting content:', error);
      setAlertConfig({ isOpen: true, title: 'Error', message: 'Failed to delete content' });
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const initiateMerge = () => {
    const items = contentList.filter(c => selectedContent.includes(c.id));
    if (items.length < 2) {
      setAlertConfig({ isOpen: true, title: 'Error', message: 'Select at least 2 items to merge' });
      return;
    }
    
    setMergeData({
      title: items[0].title,
      year: items[0].year,
      items
    });
    setShowMergeConfirm(true);
  };

  const handleMerge = async () => {
    setIsMerging(true);
    setShowMergeConfirm(false);
    
    const { items, title: finalTitle, year: finalYear } = mergeData;
    const targetItem = items[0];
    const otherItems = items.slice(1);
    
    try {
      console.log("Merging", items.length, "items into", targetItem.id);
      let combinedMovieLinks: LinkDef[] = [];
      let combinedSeasons: Season[] = [];
      
      // Metadata accumulation
      const combinedGenres = new Set<string>();
      const combinedLanguages = new Set<string>();
      const combinedCast = new Set<string>();
      const combinedTrailers: Trailer[] = [];
      const trailerUrls = new Set<string>();

      let finalPoster = targetItem.posterUrl;
      let finalImdb = targetItem.imdbLink;
      let finalTrailer = targetItem.trailerUrl;
      let finalQuality = targetItem.qualityId;
      let finalDesc = targetItem.description;
      let finalCountry = targetItem.country;
      let finalReleaseDate = targetItem.releaseDate;
      let finalRuntime = targetItem.runtime;
      let finalImdbRating = targetItem.imdbRating;
      let finalTrailerTitle = targetItem.trailerTitle;
      let finalTrailerYoutubeTitle = targetItem.trailerYoutubeTitle;
      let finalTrailerSeasonNumber = targetItem.trailerSeasonNumber;
      let finalSubtitles = targetItem.subtitles;
      
      items.forEach(item => {
        // Collect arrays
        if (item.genreIds && Array.isArray(item.genreIds)) {
          item.genreIds.forEach(g => combinedGenres.add(g));
        }
        if (item.languageIds && Array.isArray(item.languageIds)) {
          item.languageIds.forEach(l => combinedLanguages.add(l));
        }
        if (item.cast && Array.isArray(item.cast)) {
          item.cast.forEach(c => combinedCast.add(c));
        }

        // Collect trailers
        if (item.trailers) {
          try {
            const itemTrailers: Trailer[] = JSON.parse(item.trailers);
            itemTrailers.forEach(t => {
              if (!trailerUrls.has(t.url)) {
                trailerUrls.add(t.url);
                combinedTrailers.push(t);
              }
            });
          } catch (e) {}
        }

        // Collect single values if target is empty
        if (!finalPoster) finalPoster = item.posterUrl;
        if (!finalImdb) finalImdb = item.imdbLink;
        if (!finalTrailer) finalTrailer = item.trailerUrl;
        if (!finalQuality) finalQuality = item.qualityId;
        if (!finalDesc) finalDesc = item.description;
        if (!finalCountry) finalCountry = item.country;
        if (!finalReleaseDate) finalReleaseDate = item.releaseDate;
        if (!finalRuntime) finalRuntime = item.runtime;
        if (!finalImdbRating) finalImdbRating = item.imdbRating;
        if (!finalTrailerTitle) finalTrailerTitle = item.trailerTitle;
        if (!finalTrailerYoutubeTitle) finalTrailerYoutubeTitle = item.trailerYoutubeTitle;
        if (!finalTrailerSeasonNumber) finalTrailerSeasonNumber = item.trailerSeasonNumber;
        if (finalSubtitles === undefined) finalSubtitles = item.subtitles;

        // Merge links logic...
        if (item.type === 'movie' || !item.type) {
          let links: LinkDef[] = [];
          try {
            links = typeof item.movieLinks === 'string' ? JSON.parse(item.movieLinks) : (item.movieLinks || []);
          } catch (e) {
            links = [];
          }
          combinedMovieLinks = [...combinedMovieLinks, ...links];
        } else {
          let seasons: Season[] = [];
          try {
            seasons = typeof item.seasons === 'string' ? JSON.parse(item.seasons) : (item.seasons || []);
          } catch (e) {
            seasons = [];
          }
          
          seasons.forEach(s => {
            const existingSeason = combinedSeasons.find(cs => cs.seasonNumber === s.seasonNumber);
            if (existingSeason) {
              // Merge episodes
              if (s.episodes) {
                s.episodes.forEach(ep => {
                  const existingEp = existingSeason.episodes.find(ce => ce.episodeNumber === ep.episodeNumber);
                  if (existingEp) {
                    existingEp.links = [...(existingEp.links || []), ...(ep.links || [])];
                  } else {
                    existingSeason.episodes.push(ep);
                  }
                });
              }
              // Merge season-level links
              if (s.zipLinks) existingSeason.zipLinks = [...(existingSeason.zipLinks || []), ...s.zipLinks];
              if (s.mkvLinks) existingSeason.mkvLinks = [...(existingSeason.mkvLinks || []), ...s.mkvLinks];
            } else {
              combinedSeasons.push(s);
            }
          });
        }
      });
      
      // Sort and dedupe links
      const dedupeAndSort = (links: LinkDef[] | undefined) => {
        if (!links) return [];
        return links.filter((l, i, self) => i === self.findIndex(t => t.url === l.url)) 
          .sort((a, b) => getSizeInMB(a.size, a.unit) - getSizeInMB(b.size, b.unit));
      };

      combinedMovieLinks = dedupeAndSort(combinedMovieLinks);
      combinedSeasons.forEach(s => {
        if (s.zipLinks) s.zipLinks = dedupeAndSort(s.zipLinks);
        if (s.mkvLinks) s.mkvLinks = dedupeAndSort(s.mkvLinks);
        if (s.episodes) {
          s.episodes.forEach(e => {
            if (e.links) e.links = dedupeAndSort(e.links);
          });
          s.episodes.sort((a, b) => a.episodeNumber - b.episodeNumber);
        }
      });
      combinedSeasons.sort((a, b) => a.seasonNumber - b.seasonNumber);

      const batchOp = writeBatch(db);
      const targetRef = doc(db, 'content', targetItem.id);
      
      batchOp.update(targetRef, {
        title: finalTitle,
        year: finalYear,
        movieLinks: JSON.stringify(combinedMovieLinks),
        seasons: JSON.stringify(combinedSeasons),
        genreIds: Array.from(combinedGenres),
        languageIds: Array.from(combinedLanguages),
        posterUrl: finalPoster || '',
        imdbLink: finalImdb || '',
        trailerUrl: finalTrailer || '',
        trailerTitle: finalTrailerTitle || '',
        trailerYoutubeTitle: finalTrailerYoutubeTitle || '',
        trailerSeasonNumber: finalTrailerSeasonNumber || null,
        trailers: JSON.stringify(combinedTrailers),
        subtitles: !!finalSubtitles,
        qualityId: finalQuality || '',
        description: finalDesc || '',
        cast: Array.from(combinedCast),
        country: finalCountry || '',
        releaseDate: finalReleaseDate || '',
        runtime: finalRuntime || '',
        imdbRating: finalImdbRating || '',
        updatedAt: Date.now()
      });
      
      otherItems.forEach(item => {
        batchOp.delete(doc(db, 'content', item.id));
      });
      
      await batchOp.commit();
      setSelectedContent([]);
      setShowMergeConfirm(false);
      setAlertConfig({ isOpen: true, title: 'Success', message: `Successfully merged ${items.length} items into "${finalTitle}"` });
    } catch (e: any) {
      console.error(e);
      setAlertConfig({ isOpen: true, title: 'Error', message: 'Failed to merge: ' + e.message });
    } finally {
      setIsMerging(false);
    }
  };

  const isFiltered = searchTerm !== '' || 
    filterType !== 'all' || 
    filterGenre !== 'all' || 
    filterLanguage !== 'all' || 
    filterQuality !== 'all' || 
    filterYear !== 'all' || 
    filterStatus !== 'all' || 
    filterAddedBy !== 'all' || 
    filterSort !== 'newest' || 
    showMissing !== 'none' || 
    showDuplicates;

  return (
    <div className="p-4 md:p-8">
      <div className="flex flex-col gap-4 mb-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-xl md:text-2xl font-bold whitespace-nowrap">Movies & Series</h1>
            {profile?.role === 'owner' && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsBatchLinkCheckerOpen(true)}
                  className="flex items-center justify-center bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white p-2 rounded-lg transition-colors"
                  title="Batch Link Checker"
                >
                  <Link2 className="w-5 h-5 md:w-4 md:h-4" />
                </button>
                <button
                  onClick={() => setIsAdjustContentsModalOpen(true)}
                  className="flex items-center justify-center bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white p-2 rounded-lg transition-colors"
                  title="Adjust Contents"
                >
                  <GripVertical className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setShowDuplicates(!showDuplicates)}
                  className={clsx(
                    "flex items-center justify-center p-2 rounded-lg transition-colors",
                    showDuplicates ? "bg-emerald-500 text-white" : "bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white"
                  )}
                  title={showDuplicates ? "Viewing Duplicates" : "Find Duplicates"}
                >
                  <Copy className="w-4 h-4" />
                </button>
                <div className="relative">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsMissingFilterOpen(!isMissingFilterOpen);
                    }}
                    className={clsx(
                      "flex items-center justify-center p-2 rounded-lg transition-colors relative gap-1",
                      showMissing !== 'none' ? (showMissing === 'complete' ? "bg-emerald-500 text-white" : "bg-red-500 text-white") : 
                      "bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white"
                    )}
                    title="Missing Details Filter"
                  >
                    <AlertCircle className="w-4 h-4" />
                    <ChevronDown className={clsx("w-3 h-3 transition-transform", isMissingFilterOpen && "rotate-180")} />
                    {showMissing !== 'none' && (
                      <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-white border-2 border-zinc-900 shadow-sm" />
                    )}
                  </button>
                  
                  <AnimatePresence>
                    {isMissingFilterOpen && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 10 }}
                        className="absolute right-0 mt-2 w-56 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-2xl z-[60] overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="p-2 space-y-0.5">
                          {[
                            { label: 'All Content', value: 'none', icon: <Eye className="w-4 h-4" /> },
                            { label: 'Missing Info (All)', value: 'missing', icon: <AlertCircle className="w-4 h-4" />, color: 'text-red-500' },
                            { label: 'Complete Info', value: 'complete', icon: <Check className="w-4 h-4" />, color: 'text-emerald-500' },
                            { type: 'divider' },
                            { label: 'Missing 480p', value: '480p' },
                            { label: 'Missing 720p', value: '720p' },
                            { label: 'Missing 1080p', value: '1080p' },
                            { label: 'Missing Trailer', value: 'trailer' },
                            { label: 'Missing Genre', value: 'genre' },
                            { label: 'Missing Language', value: 'language' },
                            { label: 'Missing Print Quality', value: 'quality' },
                            { label: 'Missing Poster', value: 'poster' },
                            { label: 'Missing Year', value: 'year' },
                            { label: 'Missing Release Date', value: 'releaseDate' },
                            { label: 'Missing IMDb Link', value: 'imdb' },
                            { type: 'divider' },
                            { label: 'Disabled (Draft)', value: 'disabled', icon: <EyeOff className="w-4 h-4" /> }
                          ].map((item, idx) => {
                            if (item.type === 'divider') return <div key={`div-${idx}`} className="h-px bg-zinc-200 dark:bg-zinc-800 my-1 mx-2" />;
                            
                            return (
                              <button
                                key={item.value}
                                onClick={() => {
                                  setShowMissing(item.value as any);
                                  setIsMissingFilterOpen(false);
                                }}
                                className={clsx(
                                  "w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors",
                                  showMissing === item.value 
                                    ? "bg-emerald-500 text-white" 
                                    : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-800"
                                )}
                              >
                                <div className="flex items-center gap-2">
                                  {item.icon && <span className={clsx(showMissing === item.value ? "text-white" : item.color)}>{item.icon}</span>}
                                  <span className={clsx(!item.icon && "ml-6")}>{item.label}</span>
                                </div>
                                {showMissing === item.value && <Check className="w-4 h-4" />}
                              </button>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            )}
          </div>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search movies & series..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:border-emerald-500"
              />
              {showSuggestions && searchSuggestions.length > 0 && (
                <div 
                  ref={suggestionsRef}
                  className="absolute z-50 w-full mt-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-xl shadow-2xl max-h-60 overflow-y-auto"
                >
                  <div className="p-2 text-xs font-medium text-zinc-500 dark:text-zinc-400 border-b border-zinc-200 dark:border-zinc-800">Suggestions</div>
                  {searchSuggestions.map(suggestion => (
                    <div 
                      key={suggestion.id} 
                      className="px-4 py-3 hover:bg-zinc-200 dark:hover:bg-zinc-800 cursor-pointer flex items-center gap-3 transition-colors"
                      onClick={() => {
                        setSearchTerm(suggestion.title);
                        setShowSuggestions(false);
                      }}
                    >
                      {suggestion.posterUrl ? (
                        <img src={suggestion.posterUrl} alt={suggestion.title} className="w-8 h-12 object-cover rounded" />
                      ) : (
                        <div className="w-8 h-12 bg-zinc-100 dark:bg-zinc-800 rounded flex items-center justify-center">
                          <Film className="w-4 h-4 text-zinc-600" />
                        </div>
                      )}
                      <div>
                        <div className="font-medium text-sm text-zinc-900 dark:text-white line-clamp-1">{formatContentTitle(suggestion)}</div>
                        <div className="text-xs text-zinc-500 dark:text-zinc-400">{suggestion.year} • {suggestion.type}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {selectedContent.length > 0 && (
              <div className="flex items-center gap-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2">
                {isBulkDeleting ? (
                  <div className="flex items-center gap-2 text-sm text-zinc-500">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Deleting {selectedContent.length} items...</span>
                  </div>
                ) : (
                  <>
                    <span className="text-sm text-zinc-500 dark:text-zinc-400">{selectedContent.length} selected</span>
                    <select
                      onChange={(e) => {
                        if (e.target.value === 'delete') {
                          setShowBulkDeleteConfirm(true);
                        } else if (e.target.value === 'merge') {
                          initiateMerge();
                        } else if (e.target.value === 'batch_fetch') {
                          setIsBatchFetchModalOpen(true);
                          setBatchFetchMode('media');
                        } else if (e.target.value === 'batch_links') {
                          setIsBatchFetchModalOpen(true);
                          setBatchFetchMode('links');
                        } else if (e.target.value) {
                          handleBulkStatusChange(e.target.value as any);
                        }
                        e.target.value = '';
                      }}
                      className="bg-transparent border-none text-sm focus:outline-none text-emerald-500 font-medium cursor-pointer"
                    >
                      <option value="">Bulk Actions</option>
                      {(profile?.role === 'admin' || profile?.role === 'owner') && (
                        <>
                          <option value="published">Publish</option>
                          <option value="draft">Draft</option>
                          <option value="selected_content">Selected Content Only</option>
                          <option value="batch_fetch">Batch Fetch Missing Data</option>
                          <option value="batch_links">Batch Fetch Links</option>
                          <option value="merge">Merge Contents</option>
                          <option value="delete">Delete</option>
                        </>
                      )}
                      {(profile?.role === 'content_manager' || profile?.role === 'manager') && (
                        <option value="draft">Draft</option>
                      )}
                    </select>
                  </>
                )}
              </div>
            )}
            <button
              onClick={() => { resetForm(); setIsModalOpen(true); }}
              className="bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-3 rounded-xl font-medium flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
            >
              <Plus className="w-5 h-5" />
              Add Content
            </button>
          </div>
        </div>
        
        <div className="flex flex-col gap-1 bg-zinc-50 dark:bg-zinc-900 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800">
          {/* Line 1 */}
          <div className="flex flex-row flex-nowrap gap-1">
            {isFiltered && (
              <button onClick={clearFilters} className="flex-none bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white rounded-lg px-2 py-1 text-xs flex items-center gap-1">
                <X className="w-3 h-3" />
              </button>
            )}
            <select value={filterType} onChange={(e) => setFilterType(e.target.value as any)} className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-2 py-1 text-xs focus:border-emerald-500">
              <option value="all">Types</option>
              <option value="movie">Movies</option>
              <option value="series">Series</option>
            </select>
            <select value={filterYear} onChange={(e) => setFilterYear(e.target.value)} className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-2 py-1 text-xs focus:border-emerald-500">
              <option value="all">Years</option>
              {uniqueYears.map(y => <option key={y} value={y.toString()}>{y}</option>)}
            </select>
            <select value={filterSort} onChange={(e) => setFilterSort(e.target.value as any)} className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-2 py-1 text-xs focus:border-emerald-500">
              <option value="default">Default Order</option>
              <option value="newest">Newest Added</option>
              <option value="oldest">Oldest Added</option>
            </select>
          </div>
          {/* Line 2 */}
          <div className="flex flex-row flex-nowrap gap-1">
            <select value={filterGenre} onChange={(e) => setFilterGenre(e.target.value)} className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-2 py-1 text-xs focus:border-emerald-500">
              <option value="all">Genres</option>
              {genres.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <select value={filterLanguage} onChange={(e) => setFilterLanguage(e.target.value)} className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-2 py-1 text-xs focus:border-emerald-500">
              <option value="all">Languages</option>
              {languages.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <select value={filterQuality} onChange={(e) => setFilterQuality(e.target.value)} className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-2 py-1 text-xs focus:border-emerald-500">
              <option value="all">Qualities</option>
              {qualities.map(q => <option key={q.id} value={q.id}>{q.name}</option>)}
            </select>
          </div>
          {/* Line 3 */}
          <div className="flex flex-row flex-nowrap gap-1">
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as any)} className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-2 py-1 text-xs focus:border-emerald-500">
              <option value="all">Status</option>
              <option value="published">Published</option>
              <option value="draft">Draft</option>
            </select>
            {(profile?.role === 'admin' || profile?.role === 'owner') && (
              <select value={filterAddedBy} onChange={(e) => setFilterAddedBy(e.target.value)} className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-2 py-1 text-xs focus:border-emerald-500">
                <option value="all">Added By: All</option>
                {Object.entries(managers).map(([id, name]) => (
                  <option key={id} value={id}>{name}</option>
                ))}
              </select>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <input 
            type="checkbox" 
            checked={selectedContent.length === filteredContent.length && filteredContent.length > 0}
            onChange={handleSelectAll}
            ref={(el) => {
              if (el) {
                el.indeterminate = selectedContent.length > 0 && selectedContent.length < filteredContent.length;
              }
            }}
            className="w-4 h-4 rounded border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-zinc-950"
          />
          <span className="text-sm text-zinc-500 dark:text-zinc-400">
            {selectedContent.length === filteredContent.length && filteredContent.length > 0 
              ? "Deselect All" 
              : selectedContent.length > 0 
                ? "Deselect Selected" 
                : "Select All"}
          </span>
        </div>
        <div className="text-sm text-zinc-500 dark:text-zinc-400">
          {filteredContent.length} items found
        </div>
      </div>

      {loading && contentList.length === 0 ? (
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500"></div>
        </div>
      ) : filteredContent.length === 0 ? (
        <div className="text-center py-20 text-zinc-500 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl">
          <Film className="w-16 h-16 mx-auto mb-4 opacity-20" />
          <p className="text-xl">No content found matching your filters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 md:gap-6">
          {filteredContent.map((content) => (
            <ContentCard
              key={content.id}
              content={content}
              profile={profile}
              isSelected={selectedContent.includes(content.id)}
              anySelected={selectedContent.length > 0}
              isActiveDropdown={activeDropdownId === content.id}
              isDuplicate={duplicateIds.has(content.id)}
              isShareLoading={loadingShareId === content.id}
              isWhatsappLoading={loadingWhatsappShareId === content.id}
              handleSelectContent={handleSelectContent}
              handleShare={handleShare}
              handleEdit={handleEdit}
              handleCopyData={handleCopyData}
              setDeleteId={setDeleteId}
              setNotificationModal={setNotificationModal}
              setActiveDropdownId={setActiveDropdownId}
              getMissingLabels={getMissingLabels}
              handleAddToSpecialCollection={handleAddToSpecialCollection}
            />
          ))}
        </div>
      )}

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

      {/* Auto-Fill Modal */}
      <AnimatePresence>
        {isAutoFillModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 z-[60]"
          >
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl"
            >
              <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-900/50">
                <div>
                  <h3 className="text-xl font-bold text-zinc-900 dark:text-white">Auto-Fill from Text</h3>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Paste WhatsApp or copied data to automatically populate fields</p>
                </div>
                <button 
                  onClick={() => setIsAutoFillModalOpen(false)}
                  className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:text-white p-2 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-full transition-all"
                >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-6">
              <textarea
                value={autoFillText}
                onChange={(e) => setAutoFillText(e.target.value)}
                placeholder="Paste your movie/series data here..."
                className="w-full h-64 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 text-zinc-600 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all resize-none font-mono text-sm"
              />
              
              <div className="mt-6 flex gap-3">
                <button
                  onClick={handleAutoFill}
                  disabled={!autoFillText.trim()}
                  className="flex-1 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20"
                >
                  <ClipboardPaste className="w-5 h-5" /> Process & Auto-Fill
                </button>
                <button
                  onClick={() => {
                    setAutoFillText('');
                    setIsAutoFillModalOpen(false);
                  }}
                  className="px-8 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white font-bold py-4 rounded-2xl transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

      <MediaModal
        isOpen={isMasterFetchModalOpen}
        onClose={() => setIsMasterFetchModalOpen(false)}
        initialImdbId={imdbLink}
        initialTitle={title}
        initialYear={year.toString()}
        initialType={type}
        onApply={applyFetchedData}
      />
      <LinkCheckerModal
        isOpen={isLinkCheckerOpen}
        onClose={() => setIsLinkCheckerOpen(false)}
        onAddLinks={handleAddLinksFromChecker}
        languages={languages}
        qualities={qualities}
      />
      <LinkCheckerModal
        isOpen={isBatchLinkCheckerOpen}
        onClose={() => setIsBatchLinkCheckerOpen(false)}
        isBatchMode={true}
        onBatchAddLinks={handleBatchAddLinks}
        languages={languages}
        qualities={qualities}
      />

      <ConfirmModal
        isOpen={!!deleteId}
        title="Delete Content"
        message="Are you sure you want to delete this content? This action cannot be undone."
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
      />

      <ConfirmModal
        isOpen={showBulkDeleteConfirm}
        title="Batch Delete"
        message={`Are you sure you want to delete ${selectedContent.length} items? This action cannot be undone.`}
        onConfirm={handleBulkDelete}
        onCancel={() => setShowBulkDeleteConfirm(false)}
        confirmText="Delete All"
      />

      <AnimatePresence>
        {showMergeConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[80] flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex justify-between items-center bg-zinc-50 dark:bg-zinc-900/50">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <RefreshCw className="w-5 h-5 text-emerald-500" />
                  Confirm Merge
                </h2>
                <button onClick={() => setShowMergeConfirm(false)} className="text-zinc-500 hover:text-zinc-900 dark:hover:text-white"><X className="w-6 h-6" /></button>
              </div>

              <div className="p-6 space-y-4">
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  You are merging <strong>{mergeData.items.length} items</strong>. All links will be combined into one content entry. The other items will be deleted.
                </p>

                <div className="space-y-4 bg-zinc-50 dark:bg-zinc-900/50 p-4 rounded-2xl border border-zinc-100 dark:border-zinc-800">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Final Title</label>
                    <input 
                      type="text" 
                      value={mergeData.title} 
                      onChange={(e) => setMergeData({...mergeData, title: e.target.value})}
                      className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Final Year</label>
                    <input 
                      type="number" 
                      value={mergeData.year} 
                      onChange={(e) => setMergeData({...mergeData, year: e.target.value ? parseInt(e.target.value) : ''})}
                      className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all"
                      placeholder="YYYY"
                    />
                  </div>
                </div>

                <div className="max-h-32 overflow-y-auto custom-scrollbar space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 block mb-1">Items being merged:</label>
                  {mergeData.items.map(item => (
                    <div key={item.id} className="text-xs p-2 bg-zinc-100 dark:bg-zinc-800 rounded-lg flex justify-between">
                      <span className="truncate">{item.title}</span>
                      <span className="text-zinc-500 shrink-0 ml-2">{item.year}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-6 border-t border-zinc-100 dark:border-zinc-800 flex gap-3">
                <button 
                  onClick={() => setShowMergeConfirm(false)}
                  disabled={isMerging}
                  className="flex-1 px-4 py-3 rounded-xl border border-zinc-200 dark:border-zinc-800 text-sm font-bold hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleMerge}
                  disabled={isMerging}
                  className="flex-1 px-4 py-3 rounded-xl bg-emerald-500 text-white text-sm font-bold hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
                >
                  {isMerging ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {isMerging ? 'Merging...' : 'Merge Now'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toasts Container */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[10000] flex flex-col gap-2 items-center pointer-events-none w-full max-w-sm px-4">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
              className={clsx(
                "pointer-events-auto px-6 py-2.5 rounded-full flex items-center gap-3 text-sm font-medium shadow-lg whitespace-nowrap",
                toast.type === 'error' ? "bg-red-500 text-white" :
                toast.type === 'success' ? "bg-emerald-500 text-white" :
                "bg-zinc-950 text-white"
              )}
            >
              <div className="shrink-0">
                {toast.type === 'error' ? <AlertCircle className="w-4 h-4" /> : 
                 toast.type === 'success' ? <Check className="w-4 h-4" /> : 
                 <Bell className="w-4 h-4" />}
              </div>
              <span className="truncate">{toast.message}</span>
              <button 
                onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
                className="ml-2 p-1 hover:bg-black/10 rounded-full transition-colors flex items-center justify-center"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <BatchFetchModal
        isOpen={isBatchFetchModalOpen}
        onClose={() => setIsBatchFetchModalOpen(false)}
        selectedContentIds={selectedContent}
        mode={batchFetchMode}
        genres={genres}
      />

      <AnimatePresence>
        {imdbSeasonsPopup && imdbSeasonsPopup.isOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4"
          >
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 max-w-md w-full relative shadow-2xl"
            >
              <button
                onClick={() => setImdbSeasonsPopup(null)}
                className="absolute top-4 right-4 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:text-white transition-colors"
              >
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-xl font-bold mb-2">Select Seasons</h3>
            <p className="text-zinc-500 dark:text-zinc-400 mb-6">Choose which seasons to fetch for "{imdbSeasonsPopup.show.name}"</p>
            
            <div className="max-h-60 overflow-y-auto space-y-2 mb-6 pr-2 custom-scrollbar">
              {imdbSeasonsPopup.seasons.map(season => (
                <label key={season} className="flex items-center gap-3 p-3 rounded-xl hover:bg-zinc-200 dark:hover:bg-zinc-800/50 cursor-pointer border border-zinc-200 dark:border-zinc-800/50 transition-colors">
                  <input
                    type="checkbox"
                    checked={selectedImdbSeasons.includes(season)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedImdbSeasons(prev => [...prev, season]);
                      } else {
                        setSelectedImdbSeasons(prev => prev.filter(s => s !== season));
                      }
                    }}
                    className="w-5 h-5 rounded border-zinc-300 dark:border-zinc-700 text-emerald-500 focus:ring-emerald-500/20 bg-white dark:bg-zinc-950"
                  />
                  <span className="font-medium">Season {season}</span>
                </label>
              ))}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setSelectedImdbSeasons(imdbSeasonsPopup.seasons);
                }}
                className="flex-1 py-2 px-4 rounded-xl font-medium bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white transition-colors text-sm"
              >
                Select All
              </button>
              <button
                onClick={() => {
                  setSelectedImdbSeasons([]);
                }}
                className="flex-1 py-2 px-4 rounded-xl font-medium bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white transition-colors text-sm"
              >
                Deselect All
              </button>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setImdbSeasonsPopup(null)}
                className="px-6 py-2 rounded-xl font-medium hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  processImdbSeasons(imdbSeasonsPopup.epData, selectedImdbSeasons);
                  setImdbSeasonsPopup(null);
                }}
                disabled={selectedImdbSeasons.length === 0}
                className="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2 rounded-xl font-bold transition-colors"
              >
                Fetch Selected
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>
      {shareSeasonModal.isOpen && shareSeasonModal.content && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 max-w-md w-full relative">
            <button
              onClick={() => setShareSeasonModal({ ...shareSeasonModal, isOpen: false })}
              className="absolute top-4 right-4 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-xl font-bold mb-2">Share Series</h3>
            <p className="text-zinc-500 dark:text-zinc-400 mb-6">Select which seasons of "{shareSeasonModal.content.title}" you want to share on WhatsApp.</p>
            
            <div className="max-h-60 overflow-y-auto space-y-2 mb-6 pr-2 custom-scrollbar">
              <label className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer border transition-colors ${selectedShareSeasons.length === shareSeasonModal.seasons.length ? 'bg-emerald-500/10 border-emerald-500 text-emerald-500' : 'bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-800/50'}`}>
                <input
                  type="checkbox"
                  checked={selectedShareSeasons.length === shareSeasonModal.seasons.length}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedShareSeasons(shareSeasonModal.seasons.map(s => s.seasonNumber));
                    } else {
                      setSelectedShareSeasons([]);
                    }
                  }}
                  className="w-5 h-5 rounded border-zinc-300 dark:border-zinc-700 text-emerald-500 focus:ring-emerald-500/20 bg-white dark:bg-zinc-950"
                />
                <span className="font-medium">All Seasons</span>
              </label>
              <div className="h-px bg-zinc-100 dark:bg-zinc-800 my-2" />
              {shareSeasonModal.seasons.map(season => (
                <label key={season.id} className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer border transition-colors ${selectedShareSeasons.includes(season.seasonNumber) ? 'bg-emerald-500/10 border-emerald-500 text-emerald-500' : 'bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-800/50'}`}>
                  <input
                    type="checkbox"
                    checked={selectedShareSeasons.includes(season.seasonNumber)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedShareSeasons(prev => [...prev, season.seasonNumber]);
                      } else {
                        setSelectedShareSeasons(prev => prev.filter(s => s !== season.seasonNumber));
                      }
                    }}
                    className="w-5 h-5 rounded border-zinc-300 dark:border-zinc-700 text-emerald-500 focus:ring-emerald-500/20 bg-white dark:bg-zinc-950"
                  />
                  <span className="font-medium">Season {season.seasonNumber}</span>
                </label>
              ))}
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShareSeasonModal({ ...shareSeasonModal, isOpen: false })}
                className="px-6 py-2 rounded-xl font-medium hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (shareSeasonModal.content) {
                    if (shareSeasonModal.mode === 'whatsapp') {
                      executeWhatsappShare(shareSeasonModal.content, selectedShareSeasons);
                    } else {
                      executeShare(shareSeasonModal.content, selectedShareSeasons);
                    }
                    setShareSeasonModal({ ...shareSeasonModal, isOpen: false });
                  }
                }}
                disabled={selectedShareSeasons.length === 0}
                className="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2 rounded-xl font-bold transition-colors flex items-center gap-2"
              >
                {shareSeasonModal.mode === 'whatsapp' ? <MessageCircle className="w-4 h-4" /> : <Share2 className="w-4 h-4" />} Share ({selectedShareSeasons.length})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notification Modal */}
      {notificationModal.isOpen && notificationModal.content && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
          <div className="bg-zinc-50 dark:bg-zinc-900 rounded-2xl p-6 max-w-md w-full border border-zinc-200 dark:border-zinc-800 shadow-2xl">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Bell className="w-6 h-6 text-blue-500" />
              Send Notification
            </h2>
            
            <div className="bg-white dark:bg-zinc-950 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 mb-6 flex gap-4">
              {notificationModal.content.posterUrl && (
                <img 
                  src={notificationModal.content.posterUrl} 
                  alt="Poster" 
                  className="w-16 h-24 object-cover rounded-md shrink-0"
                  referrerPolicy="no-referrer"
                />
              )}
              <div>
                <h3 className="font-bold text-zinc-900 dark:text-white mb-1">{getNotificationPreview(notificationModal.content).title}</h3>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 line-clamp-2">{getNotificationPreview(notificationModal.content).body}</p>
              </div>
            </div>

            {notificationModal.status === 'idle' && (
              <p className="text-zinc-500 dark:text-zinc-400 mb-6">
                This will send a push notification to all users about this new content. Do you want to proceed?
              </p>
            )}

            {notificationModal.status === 'sending' && (
              <div className="flex flex-col items-center justify-center py-6">
                <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500 mb-4"></div>
                <p className="text-blue-500 font-medium">Sending notification...</p>
              </div>
            )}

            {notificationModal.status === 'success' && (
              <div className="flex flex-col items-center justify-center py-6">
                <div className="w-12 h-12 bg-emerald-500/20 rounded-full flex items-center justify-center mb-4">
                  <svg className="w-6 h-6 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                </div>
                <p className="text-emerald-500 font-medium">Notification successfully pushed!</p>
              </div>
            )}

            {notificationModal.status === 'error' && (
              <div className="flex flex-col items-center justify-center py-6">
                <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center mb-4">
                  <X className="w-6 h-6 text-red-500" />
                </div>
                <p className="text-red-500 font-medium">Error sending notification.</p>
              </div>
            )}

            {notificationModal.status === 'idle' && (
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setNotificationModal({ isOpen: false, content: null, status: 'idle' })}
                  className="px-6 py-2 rounded-xl font-medium hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSendNotification}
                  className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded-xl font-bold transition-colors flex items-center gap-2"
                >
                  <Bell className="w-4 h-4" /> Send Now
                </button>
              </div>
            )}
            
            {notificationModal.status === 'error' && (
              <div className="flex justify-end gap-3 mt-4">
                <button
                  onClick={() => setNotificationModal({ isOpen: false, content: null, status: 'idle' })}
                  className="bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white px-6 py-2 rounded-xl font-bold transition-colors"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={shareAnywayConfig.isOpen}
        title="Missing Data"
        message="Failed to fetch missing metadata from TMDB. Would you like to share with available data anyway?"
        confirmText="Share Anyway"
        cancelText="Cancel"
        onConfirm={() => {
          if (shareAnywayConfig.content) {
            if (shareAnywayConfig.mode === 'whatsapp') {
              executeWhatsappShare(shareAnywayConfig.content);
            } else {
              executeShare(shareAnywayConfig.content);
            }
            setShareAnywayConfig({ isOpen: false, content: null, mode: 'standard' });
          }
        }}
        onCancel={() => setShareAnywayConfig({ isOpen: false, content: null, mode: 'standard' })}
      />

      <AdjustContentsModal
        isOpen={isAdjustContentsModalOpen}
        onClose={() => setIsAdjustContentsModalOpen(false)}
        contentList={contentList}
      />
      <ManageModal
        isOpen={manageModal.isOpen}
        title={`Manage ${manageModal.type ? manageModal.type.charAt(0).toUpperCase() + manageModal.type.slice(1) : ''}s`}
        onClose={() => setManageModal({ isOpen: false, type: null })}
        type={manageModal.type || 'genre'}
        items={
          manageModal.type === 'genre' ? genres :
          manageModal.type === 'language' ? languages :
          manageModal.type === 'quality' ? qualities : []
        }
        onSave={async (items) => {
          if (!manageModal.type) return;
          const collectionName = manageModal.type === 'quality' ? 'qualities' : `${manageModal.type}s`;
          const batch = writeBatch(db);
          
          // Delete all existing
          const snapshot = await getDocs(collection(db, collectionName));
          snapshot.docs.forEach(doc => batch.delete(doc.ref));
          
          // Add new
          items.forEach((item, idx) => {
            const docRef = doc(collection(db, collectionName), item.id);
            const data: any = { name: item.name, order: idx };
            if (manageModal.type === 'quality') data.color = item.color;
            batch.set(docRef, data);
          });
          
          await batch.commit();
          setManageModal({ isOpen: false, type: null });
        }}
      />
      {loading && contentList.length > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] bg-emerald-500 text-white px-6 py-2.5 rounded-full flex items-center justify-center gap-2 text-sm font-medium shadow-lg whitespace-nowrap">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Syncing changes...</span>
        </div>
      )}
    </div>
  );
}
