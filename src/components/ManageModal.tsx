import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Trash2, GripVertical, Save, Loader2, Search, Edit2, Check } from 'lucide-react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { smartSearch } from '../utils/searchUtils';
import { useModalBehavior } from '../hooks/useModalBehavior';

interface Item {
  id: string;
  name: string;
  color?: string;
  order?: number;
}

interface Props {
  isOpen: boolean;
  title: string;
  onClose: () => void;
  type: 'genre' | 'language' | 'quality';
  items: Item[];
  onSave: (items: Item[]) => Promise<void>;
}

const ManageModal: React.FC<Props> = ({ isOpen, title, onClose, type, items: initialItems, onSave }) => {
  const [items, setItems] = useState<Item[]>([]);
  const [newItemName, setNewItemName] = useState('');
  const [newItemColor, setNewItemColor] = useState('#10b981'); // Default emerald-500
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [saving, setSaving] = useState(false);

  useModalBehavior(isOpen, onClose);

  useEffect(() => {
    if (isOpen) {
      setItems([...initialItems].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
      setNewItemName('');
      setSearchTerm('');
      setEditingId(null);
    }
  }, [isOpen, initialItems]);

  const filteredItems = useMemo(() => {
    if (!searchTerm) return items;
    return smartSearch(items, searchTerm, ['name']);
  }, [items, searchTerm]);

  const handleAddItem = () => {
    if (!newItemName.trim()) return;
    const newItem: Item = {
      id: Math.random().toString(36).substr(2, 9),
      name: newItemName.trim(),
      order: items.length
    };
    if (type === 'quality') {
      newItem.color = newItemColor;
    }
    setItems([...items, newItem]);
    setNewItemName('');
  };

  const handleDeleteItem = (id: string) => {
    setItems(items.filter(item => item.id !== id));
  };

  const handleStartEdit = (item: Item) => {
    setEditingId(item.id);
    setEditName(item.name);
    setEditColor(item.color || '');
  };

  const handleSaveEdit = () => {
    if (!editName.trim() || !editingId) return;
    setItems(items.map(item => 
      item.id === editingId 
        ? { ...item, name: editName.trim(), color: type === 'quality' ? editColor : item.color } 
        : item
    ));
    setEditingId(null);
  };

  const onDragEnd = (result: DropResult) => {
    if (!result.destination || searchTerm) return;
    const newItems = Array.from(items);
    const [reorderedItem] = newItems.splice(result.source.index, 1);
    newItems.splice(result.destination.index, 0, reorderedItem);
    setItems(newItems.map((item, idx) => ({ ...item, order: idx })));
  };

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      await onSave(items);
      onClose();
    } catch (error) {
      console.error("Error saving items:", error);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="w-full max-w-2xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50">
            <h2 className="text-xl font-bold text-zinc-900 dark:text-white">{title}</h2>
            <button onClick={onClose} className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-full transition-colors text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:text-white">
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Add New Item */}
          <div className="p-5 bg-white/50 dark:bg-zinc-950/50 border-b border-zinc-200 dark:border-zinc-800">
            <div className="flex flex-wrap gap-3">
              <div className="flex-1 min-w-[200px]">
                <input
                  type="text"
                  placeholder={`New ${type} name...`}
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddItem()}
                  className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-zinc-900 dark:text-white focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>
              {type === 'quality' && (
                <input
                  type="color"
                  value={newItemColor}
                  onChange={(e) => setNewItemColor(e.target.value)}
                  className="w-12 h-11 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-1 cursor-pointer"
                />
              )}
              <button
                onClick={handleAddItem}
                disabled={!newItemName.trim()}
                className="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded-xl font-bold transition-colors flex items-center gap-2"
              >
                <Plus className="w-5 h-5" />
                Add
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="px-5 py-3 border-b border-zinc-200 dark:border-zinc-800">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="text"
                placeholder="Search items..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-zinc-50/50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-lg pl-10 pr-4 py-2 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-emerald-500 transition-colors"
              />
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
            <DragDropContext onDragEnd={onDragEnd}>
              <Droppable droppableId="manage-items">
                {(provided) => (
                  <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2">
                    {filteredItems.map((item, index) => (
                      <Draggable key={item.id} draggableId={item.id} index={index} isDragDisabled={!!searchTerm}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                              snapshot.isDragging 
                                ? 'bg-zinc-100 dark:bg-zinc-800 border-emerald-500 shadow-xl z-50' 
                                : 'bg-zinc-50/50 dark:bg-zinc-900/50 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:border-zinc-700'
                            }`}
                          >
                            <div {...provided.dragHandleProps} className={`text-zinc-600 hover:text-zinc-500 dark:text-zinc-400 p-1 ${searchTerm ? 'cursor-not-allowed opacity-30' : 'cursor-grab active:cursor-grabbing'}`}>
                              <GripVertical className="w-5 h-5" />
                            </div>

                            {editingId === item.id ? (
                              <div className="flex-1 flex gap-2">
                                <input
                                  type="text"
                                  value={editName}
                                  onChange={(e) => setEditName(e.target.value)}
                                  autoFocus
                                  className="flex-1 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-1 text-sm text-zinc-900 dark:text-white focus:outline-none focus:border-emerald-500"
                                />
                                {type === 'quality' && (
                                  <input
                                    type="color"
                                    value={editColor}
                                    onChange={(e) => setEditColor(e.target.value)}
                                    className="w-8 h-8 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg p-0.5 cursor-pointer"
                                  />
                                )}
                                <button onClick={handleSaveEdit} className="p-1.5 text-emerald-500 hover:bg-emerald-500/10 rounded-lg transition-colors">
                                  <Check className="w-4 h-4" />
                                </button>
                                <button onClick={() => setEditingId(null)} className="p-1.5 text-zinc-500 hover:bg-zinc-500/10 rounded-lg transition-colors">
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            ) : (
                              <>
                                <div className="flex-1 flex items-center gap-3">
                                  {type === 'quality' && item.color && (
                                    <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: item.color }} />
                                  )}
                                  <span className="text-zinc-900 dark:text-white font-medium">{item.name}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => handleStartEdit(item)}
                                    className="p-2 text-zinc-500 dark:text-zinc-400 hover:text-blue-500 hover:bg-blue-500/10 rounded-lg transition-colors"
                                  >
                                    <Edit2 className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteItem(item.id)}
                                    className="p-2 text-zinc-500 dark:text-zinc-400 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
            {filteredItems.length === 0 && (
              <div className="text-center py-12">
                <p className="text-zinc-500">No items found.</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-5 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-6 py-2.5 rounded-xl font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:text-white hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveAll}
              disabled={saving}
              className="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white px-8 py-2.5 rounded-xl font-bold transition-colors flex items-center gap-2 min-w-[120px] justify-center"
            >
              {saving ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  Save Changes
                </>
              )}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default ManageModal;
