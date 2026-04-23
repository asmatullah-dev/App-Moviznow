import React, { useState, useEffect, memo, useCallback } from 'react';
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

const ContentItem = memo(({ 
  item, 
  index, 
  isSelected, 
  isDragDisabled, 
  onClick 
}: { 
  item: Content; 
  index: number; 
  isSelected: boolean; 
  isDragDisabled: boolean;
  onClick: (id: string, e: React.MouseEvent) => void;
}) => {
  return (
    <Draggable 
      draggableId={item.id} 
      index={index}
      isDragDisabled={isDragDisabled}
    >
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          onClick={(e) => onClick(item.id, e)}
          className={clsx(
            "flex items-center gap-4 p-3 rounded-xl border transition-colors duration-200 cursor-pointer",
            snapshot.isDragging 
              ? 'bg-zinc-100 dark:bg-zinc-800 border-emerald-500 shadow-xl shadow-emerald-500/10 z-50' 
              : isSelected
                ? 'bg-emerald-500/10 border-emerald-500/50 dark:bg-emerald-500/5'
                : 'bg-zinc-50/50 dark:bg-zinc-900/50 border-zinc-100 dark:border-zinc-800 hover:bg-zinc-100/80 dark:hover:bg-zinc-800/80'
          )}
        >
          <div
            {...provided.dragHandleProps}
            className={clsx(
              "p-2 rounded-lg transition-colors",
              isDragDisabled 
                ? 'opacity-30 cursor-not-allowed' 
                : 'hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white cursor-grab active:cursor-grabbing'
            )}
          >
            <GripVertical className="w-5 h-5" />
          </div>
          
          <div className="w-12 h-16 flex-shrink-0 rounded-lg overflow-hidden bg-zinc-200 dark:bg-zinc-800 transition-colors duration-300">
            {item.posterUrl ? (
              <img src={item.posterUrl} alt={item.title} className="w-full h-full object-cover" loading="lazy" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-zinc-500 dark:text-zinc-400 text-[10px]">
                No Img
              </div>
            )}
          </div>
          
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-medium text-zinc-900 dark:text-white line-clamp-2 leading-tight transition-colors duration-300">{item.title}</h3>
          </div>
          
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            {item.status === 'draft' && (
              <span className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider bg-orange-500 text-white shadow-sm">
                Draft
              </span>
            )}
            <span className={clsx(
              "px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider text-white",
              item.type === 'movie' ? 'bg-blue-500/90' : 'bg-purple-500/90'
            )}>
              {item.type}
            </span>
            <span className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 text-[8px] font-bold transition-colors duration-300">
              {item.year}
            </span>
          </div>
        </div>
      )}
    </Draggable>
  );
});

ContentItem.displayName = 'ContentItem';

export const AdjustContentsModal: React.FC<Props> = ({ isOpen, onClose, contentList }) => {
  const [items, setItems] = useState<Content[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [saving, setSaving] = useState(false);

  useModalBehavior(isOpen, onClose);

  // Initialize only when modal opens to prevent background resets
  useEffect(() => {
    if (isOpen) {
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
  }, [isOpen]); // Only trigger on open, NOT on contentList changes while open

  const filteredItems = searchTerm 
    ? items.filter(item => 
        item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.year.toString().includes(searchTerm)
      )
    : items;

  const toggleSelection = useCallback((id: string, event: React.MouseEvent) => {
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
  }, [items, multiSelectMode, selectedIds, searchTerm]);

  const handleSelectAll = useCallback(() => {
    if (selectedIds.length === filteredItems.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredItems.map(item => item.id));
    }
  }, [filteredItems, selectedIds.length]);

  const onDragEnd = useCallback((result: DropResult) => {
    const { source, destination, draggableId } = result;
    if (!destination) return;
    if (searchTerm) return;
    if (source.index === destination.index) return;

    setItems(prev => {
      const newItems = Array.from(prev);
      
      if (selectedIds.includes(draggableId)) {
        // Multi-select move
        const movedIds = selectedIds;
        const itemsToMove = prev.filter(item => movedIds.includes(item.id));
        const otherItems = prev.filter(item => !movedIds.includes(item.id));
        
        const itemsRemovedBeforeDest = prev.slice(0, destination.index).filter(item => movedIds.includes(item.id)).length;
        const finalInsertIndex = Math.max(0, destination.index - itemsRemovedBeforeDest);
        
        otherItems.splice(finalInsertIndex, 0, ...itemsToMove);
        return otherItems;
      } else {
        // Single item move
        const [reorderedItem] = newItems.splice(source.index, 1);
        newItems.splice(destination.index, 0, reorderedItem);
        setSelectedIds([draggableId]);
        return newItems;
      }
    });
  }, [searchTerm, selectedIds]);

  const handleSave = async () => {
    if (saving) return; // Prevent double clicks
    setSaving(true);
    try {
      // Find only items that have actually changed their position
      // Using an optimized check to avoid updating everything if only a few moved
      const itemsToUpdate = items
        .map((item, index) => ({ id: item.id, currentOrder: item.order, newOrder: index }))
        .filter(change => change.currentOrder !== change.newOrder);
      
      if (itemsToUpdate.length === 0) {
        onClose();
        return;
      }

      const commitPromises = [];
      const chunkSize = 500; // max batch size
      
      for (let i = 0; i < itemsToUpdate.length; i += chunkSize) {
        const batch = writeBatch(db);
        const chunk = itemsToUpdate.slice(i, i + chunkSize);
        
        chunk.forEach(({ id, newOrder }) => {
          const contentRef = doc(db, 'content', id);
          batch.update(contentRef, { 
            order: newOrder,
            updatedAt: new Date().toISOString() // Track when it was last reordered
          });
        });
        
        commitPromises.push(batch.commit());
      }
      
      await Promise.all(commitPromises);
      onClose();
    } catch (error) {
      console.error("Error saving content order:", error);
      handleFirestoreError(error, OperationType.UPDATE, 'content');
      setSaving(false); // Re-enable button on error
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/90 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.98, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.98, opacity: 0, y: 10 }}
            className="w-full h-full flex flex-col bg-white dark:bg-zinc-950 text-zinc-900 dark:text-white transition-colors duration-300"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-3 md:p-4 border-b border-zinc-100 dark:border-zinc-800 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md sticky top-0 z-[60] transition-colors duration-300">
              <div className="flex items-center gap-2 sm:gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                    <GripVertical className="w-4 h-4 text-emerald-500" />
                  </div>
                  <h2 className="text-sm md:text-lg font-bold whitespace-nowrap hidden xs:block">Adjust Order</h2>
                </div>
                
                <div className="flex items-center gap-1.5 border-l border-zinc-200 dark:border-zinc-800 pl-4 ml-2">
                  <button
                    onClick={() => setMultiSelectMode(!multiSelectMode)}
                    disabled={saving}
                    className={clsx(
                      "px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border disabled:opacity-50",
                      multiSelectMode 
                        ? "bg-emerald-500 text-white border-emerald-400 shadow-sm" 
                        : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                    )}
                  >
                    {multiSelectMode ? 'Multi-select: ON' : 'Multi-select'}
                  </button>

                  {multiSelectMode && (
                    <button
                      onClick={handleSelectAll}
                      disabled={saving}
                      className="px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all font-mono disabled:opacity-50"
                    >
                      {selectedIds.length === filteredItems.length ? 'NONE' : `ALL (${filteredItems.length})`}
                    </button>
                  )}
                </div>

                <div className="relative w-32 sm:w-64 hidden sm:block">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
                  <input
                    type="text"
                    placeholder="Quick search to find items..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    disabled={saving}
                    className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-zinc-900 dark:text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500 transition-colors duration-300 disabled:opacity-50"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-full text-zinc-500 transition-all active:scale-90"
                  disabled={saving}
                >
                  <X className="w-5 h-5" />
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !!searchTerm}
                  className={clsx(
                    "group relative flex items-center gap-2 px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all active:scale-95 disabled:opacity-50 border whitespace-nowrap overflow-hidden shadow-lg",
                    saving 
                      ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 border-zinc-200 dark:border-zinc-700" 
                      : "bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-400/30 shadow-emerald-500/20"
                  )}
                >
                  {saving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4 group-hover:scale-110 transition-transform" />
                  )}
                  <span>{saving ? 'UPDATING...' : 'SAVE CHANGES'}</span>
                </button>
              </div>
            </div>

            {/* Content List */}
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-zinc-50/30 dark:bg-zinc-950/30 scroll-smooth">
              {searchTerm ? (
                <div className="mb-4 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-emerald-500 rounded-lg text-white">
                      <Search className="w-4 h-4" />
                    </div>
                    <p className="text-emerald-700 dark:text-emerald-400 text-sm font-medium">
                      Showing results for "{searchTerm}". Dragging is disabled while searching.
                    </p>
                  </div>
                  <button 
                    onClick={() => setSearchTerm('')}
                    className="text-xs font-bold text-emerald-600 dark:text-emerald-500 hover:underline"
                  >
                    CLEAR SEARCH
                  </button>
                </div>
              ) : (
                <div className="mb-4 flex items-center justify-between text-[10px] uppercase tracking-widest text-zinc-400 font-bold px-2">
                  <span>List order</span>
                  {selectedIds.length > 0 && (
                    <span className="text-emerald-500">{selectedIds.length} items selected to move</span>
                  )}
                </div>
              )}
              
              <DragDropContext onDragEnd={onDragEnd}>
                <Droppable droppableId="content-list" isDropDisabled={!!searchTerm}>
                  {(provided) => (
                    <div
                      {...provided.droppableProps}
                      ref={provided.innerRef}
                      className="space-y-2 max-w-5xl mx-auto pb-20"
                    >
                      {filteredItems.map((item, index) => (
                        <ContentItem 
                          key={item.id}
                          item={item}
                          index={index}
                          isSelected={selectedIds.includes(item.id)}
                          isDragDisabled={!!searchTerm}
                          onClick={toggleSelection}
                        />
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
