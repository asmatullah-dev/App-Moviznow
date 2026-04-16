import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, GripVertical, Save, Loader2, Search } from 'lucide-react';
import { clsx } from 'clsx';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Content } from '../types';
import { db } from '../firebase';
import { writeBatch, doc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrorHandler';
import { useModalBehavior } from '../hooks/useModalBehavior';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  contentList: Content[];
}

export const AdjustContentsModal: React.FC<Props> = ({ isOpen, onClose, contentList }) => {
  const [items, setItems] = useState<Content[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [saving, setSaving] = useState(false);

  useModalBehavior(isOpen, onClose);

  useEffect(() => {
    if (isOpen) {
      // Sort by order first, then by createdAt descending
      const sorted = [...contentList].sort((a, b) => {
        if (a.order !== undefined && b.order !== undefined) return a.order - b.order;
        if (a.order === undefined && b.order !== undefined) return -1;
        if (a.order !== undefined && b.order === undefined) return 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
      setItems(sorted);
      setSearchTerm('');
      setSelectedIds([]);
      setMultiSelectMode(false);
    }
  }, [isOpen, contentList]);

  const filteredItems = items.filter(item => 
    item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.year.toString().includes(searchTerm)
  );

  const toggleSelection = (id: string, event: React.MouseEvent) => {
    if (searchTerm) return;

    if (multiSelectMode || event.ctrlKey || event.metaKey) {
      setSelectedIds(prev => 
        prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
      );
    } else if (event.shiftKey && selectedIds.length > 0) {
      const lastSelectedId = selectedIds[selectedIds.length - 1];
      const lastIndex = items.findIndex(item => item.id === lastSelectedId);
      const currentIndex = items.findIndex(item => item.id === id);
      
      if (lastIndex !== -1 && currentIndex !== -1) {
        const start = Math.min(lastIndex, currentIndex);
        const end = Math.max(lastIndex, currentIndex);
        const rangeIds = items.slice(start, end + 1).map(item => item.id);
        setSelectedIds(prev => Array.from(new Set([...prev, ...rangeIds])));
      }
    } else {
      setSelectedIds([id]);
    }
  };

  const handleSelectAll = () => {
    if (selectedIds.length === filteredItems.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredItems.map(item => item.id));
    }
  };

  const onDragEnd = (result: DropResult) => {
    const { source, destination, draggableId } = result;
    if (!destination) return;
    if (searchTerm) return;
    if (source.index === destination.index) return;

    const newItems = Array.from(items);
    
    if (selectedIds.includes(draggableId)) {
      // Multi-select move
      const movedIds = selectedIds;
      const itemsToMove = items.filter(item => movedIds.includes(item.id));
      const otherItems = items.filter(item => !movedIds.includes(item.id));
      
      // Calculate insertion index accounting for removed items
      const itemsRemovedBeforeDest = items.slice(0, destination.index).filter(item => movedIds.includes(item.id)).length;
      const finalInsertIndex = destination.index - itemsRemovedBeforeDest;
      
      otherItems.splice(finalInsertIndex, 0, ...itemsToMove);
      setItems(otherItems);
    } else {
      // Single item move
      const [reorderedItem] = newItems.splice(source.index, 1);
      newItems.splice(destination.index, 0, reorderedItem);
      setItems(newItems);
      setSelectedIds([draggableId]);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const chunkSize = 500;
      for (let i = 0; i < items.length; i += chunkSize) {
        const batch = writeBatch(db);
        const chunk = items.slice(i, i + chunkSize);
        
        chunk.forEach((item, index) => {
          const contentRef = doc(db, 'content', item.id);
          batch.update(contentRef, { order: i + index });
        });
        
        await batch.commit();
      }
      onClose();
    } catch (error) {
      console.error("Error saving content order:", error);
      handleFirestoreError(error, OperationType.UPDATE, 'content');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="w-full h-full flex flex-col bg-white dark:bg-zinc-950 text-zinc-900 dark:text-white transition-colors duration-300"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-3 md:p-4 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 transition-colors duration-300">
              <div className="flex items-center gap-2 sm:gap-3">
                <h2 className="text-sm md:text-lg font-bold whitespace-nowrap hidden xs:block">Adjust Order</h2>
                
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setMultiSelectMode(!multiSelectMode)}
                    className={clsx(
                      "px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border",
                      multiSelectMode 
                        ? "bg-emerald-500 text-white border-emerald-400 shadow-sm" 
                        : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                    )}
                    title="Toggle Multi-select mode"
                  >
                    Multi
                  </button>

                  {multiSelectMode && (
                    <button
                      onClick={handleSelectAll}
                      className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all"
                    >
                      {selectedIds.length === filteredItems.length ? 'None' : 'All'}
                    </button>
                  )}
                </div>

                <div className="relative w-32 sm:w-48 hidden sm:block">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
                  <input
                    type="text"
                    placeholder="Search..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-zinc-900 dark:text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500 transition-colors duration-300"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={onClose}
                  className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-full text-zinc-500 transition-all active:scale-95"
                  disabled={saving}
                >
                  <X className="w-5 h-5" />
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !!searchTerm}
                  className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3 sm:px-4 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all active:scale-95 disabled:opacity-50 border border-white/20 shadow-lg whitespace-nowrap"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  <span className="hidden xs:inline">Save Order</span>
                  <span className="xs:hidden">Save</span>
                </button>
              </div>
            </div>

            {/* Content List */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar">
              {searchTerm && (
                <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl text-yellow-600 dark:text-yellow-400 text-sm transition-colors duration-300">
                  Drag and drop is disabled while searching. Clear the search to reorder items.
                </div>
              )}
              
              <DragDropContext onDragEnd={onDragEnd}>
                <Droppable droppableId="content-list" isDropDisabled={!!searchTerm}>
                  {(provided) => (
                    <div
                      {...provided.droppableProps}
                      ref={provided.innerRef}
                      className="space-y-2 max-w-5xl mx-auto"
                    >
                      {filteredItems.map((item, index) => (
                        <Draggable 
                          key={item.id} 
                          draggableId={item.id} 
                          index={index}
                          isDragDisabled={!!searchTerm}
                        >
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              onClick={(e) => toggleSelection(item.id, e)}
                              className={`flex items-center gap-4 p-3 rounded-xl border transition-colors duration-300 cursor-pointer ${
                                snapshot.isDragging 
                                  ? 'bg-zinc-100 dark:bg-zinc-800 border-emerald-500 shadow-xl shadow-emerald-500/10 z-50' 
                                  : selectedIds.includes(item.id)
                                    ? 'bg-emerald-500/10 border-emerald-500/50 dark:bg-emerald-500/5'
                                    : 'bg-zinc-50/50 dark:bg-zinc-900/50 border-zinc-100 dark:border-zinc-800 hover:bg-zinc-100/80 dark:hover:bg-zinc-800/80'
                              }`}
                            >
                              <div
                                {...provided.dragHandleProps}
                                className={`p-2 rounded-lg transition-colors ${searchTerm ? 'opacity-30 cursor-not-allowed' : 'hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white cursor-grab active:cursor-grabbing'}`}
                              >
                                <GripVertical className="w-5 h-5" />
                              </div>
                              
                              <div className="w-12 h-16 flex-shrink-0 rounded-lg overflow-hidden bg-zinc-200 dark:bg-zinc-800 transition-colors duration-300">
                                {item.posterUrl ? (
                                  <img src={item.posterUrl} alt={item.title} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-zinc-500 dark:text-zinc-400">
                                    No Img
                                  </div>
                                )}
                              </div>
                              
                              <div className="flex-1 min-w-0">
                                <h3 className="text-base font-medium text-zinc-900 dark:text-white line-clamp-2 leading-tight transition-colors duration-300">{item.title}</h3>
                              </div>
                              
                              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                                {item.status === 'draft' && (
                                  <span className="px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider bg-orange-500 text-white shadow-sm">
                                    Draft
                                  </span>
                                )}
                                <span className={clsx(
                                  "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider text-white",
                                  item.type === 'movie' ? 'bg-blue-500/90' : 'bg-purple-500/90'
                                )}>
                                  {item.type}
                                </span>
                                <span className="px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 text-[10px] font-bold transition-colors duration-300">
                                  {item.year}
                                </span>
                              </div>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
