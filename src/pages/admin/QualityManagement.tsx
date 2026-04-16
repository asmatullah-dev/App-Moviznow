import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../firebase';
import { collection, addDoc, deleteDoc, doc, updateDoc, writeBatch } from 'firebase/firestore';
import { Quality } from '../../types';
import { Plus, Edit2, Trash2, X, Check, Search, GripVertical, Loader2 } from 'lucide-react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import ConfirmModal from '../../components/ConfirmModal';
import { handleFirestoreError, OperationType } from '../../utils/firestoreErrorHandler';
import { useModalBehavior } from '../../hooks/useModalBehavior';

import { useContent } from '../../contexts/ContentContext';

export default function QualityManagement() {
  const { qualities, updateSearchIndex } = useContent();
  const [newQuality, setNewQuality] = useState('');
  const [newColor, setNewColor] = useState('#10b981');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('#10b981');
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useModalBehavior(!!deleteId, () => setDeleteId(null));

  useEffect(() => {
    setLoading(false);
  }, []);

  const [processing, setProcessing] = useState<Record<string, boolean>>({});

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQuality.trim()) return;
    setProcessing(prev => ({ ...prev, add: true }));
    try {
      const maxOrder = qualities.length > 0 ? Math.max(...qualities.map(q => q.order || 0)) : 0;
      await addDoc(collection(db, 'qualities'), { name: newQuality.trim(), order: maxOrder + 1, color: newColor });
      setNewQuality('');
      setNewColor('#10b981');
    } finally {
      setProcessing(prev => ({ ...prev, add: false }));
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setProcessing(prev => ({ ...prev, delete: true }));
    try {
      await deleteDoc(doc(db, 'qualities', deleteId));
    } finally {
      setProcessing(prev => ({ ...prev, delete: false }));
    }
  };

  const handleEdit = (quality: Quality) => {
    setEditingId(quality.id);
    setEditName(quality.name);
    setEditColor(quality.color || '#10b981');
  };

  const handleSaveEdit = async () => {
    if (!editName.trim() || !editingId) return;
    setProcessing(prev => ({ ...prev, edit: true }));
    try {
      await updateDoc(doc(db, 'qualities', editingId), { name: editName.trim(), color: editColor });
      setEditingId(null);
      setEditName('');
      setEditColor('#10b981');
    } finally {
      setProcessing(prev => ({ ...prev, edit: false }));
    }
  };

  const onDragEnd = async (result: DropResult) => {
    if (!result.destination) return;
    if (searchTerm) return; // Disable drag and drop when searching

    const items = Array.from<Quality>(qualities);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    // Batch update order in Firestore
    const batch = writeBatch(db);
    items.forEach((item, index) => {
      const ref = doc(db, 'qualities', item.id);
      batch.update(ref, { order: index });
    });
    await batch.commit();
  };

  const filteredQualities = useMemo(() => {
    if (!searchTerm) return qualities;
    const lower = searchTerm.toLowerCase();
    return qualities.filter(q => q.name.toLowerCase().includes(lower));
  }, [qualities, searchTerm]);

  return (
    <div className="p-4 md:p-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-zinc-900 dark:text-white transition-colors duration-300">Quality Management</h1>
        <div className="relative w-full md:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
          <input
            type="text"
            placeholder="Search qualities..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:border-emerald-500 text-zinc-900 dark:text-white transition-colors duration-300"
          />
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-900 rounded-2xl p-6 border border-zinc-200 dark:border-zinc-800 mb-8 max-w-2xl transition-colors duration-300">
        <h2 className="text-xl font-semibold mb-4 text-zinc-900 dark:text-white transition-colors duration-300">Add New Quality</h2>
        <form onSubmit={handleAdd} className="flex flex-col sm:flex-row gap-4">
          <input
            type="text"
            value={newQuality}
            onChange={(e) => setNewQuality(e.target.value)}
            placeholder="e.g., WEB-DL, HDRip, BluRay"
            className="flex-1 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500 text-zinc-900 dark:text-white transition-colors duration-300"
          />
          <div className="flex items-center gap-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 transition-colors duration-300">
            <label className="text-sm text-zinc-500 dark:text-zinc-400 transition-colors duration-300">Color:</label>
            <input
              type="color"
              value={newColor}
              onChange={(e) => setNewColor(e.target.value)}
              className="w-8 h-8 rounded cursor-pointer bg-transparent border-none p-0"
            />
          </div>
          <button
            type="submit"
            disabled={processing.add}
            className="bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-3 rounded-xl font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
          >
            {processing.add ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
            {processing.add ? 'Adding...' : 'Add Quality'}
          </button>
        </form>
      </div>

      {searchTerm && <p className="text-zinc-500 dark:text-zinc-400 mb-4 text-sm transition-colors duration-300">Drag and drop is disabled while searching.</p>}

      {loading ? (
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500"></div>
        </div>
      ) : (
        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="qualities">
          {(provided) => (
            <div
              {...provided.droppableProps}
              ref={provided.innerRef}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
            >
              {filteredQualities.map((quality, index) => (
                // @ts-ignore
                <Draggable key={quality.id} draggableId={quality.id} index={index} isDragDisabled={!!searchTerm}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      className={`bg-white dark:bg-zinc-900 border ${snapshot.isDragging ? 'border-emerald-500 shadow-lg shadow-emerald-500/20 z-10' : 'border-zinc-200 dark:border-zinc-800'} rounded-xl p-4 flex items-center justify-between transition-colors duration-300`}
                    >
                      {editingId === quality.id ? (
                        <div className="flex items-center gap-2 w-full">
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="flex-1 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-1.5 focus:outline-none focus:border-emerald-500 text-sm text-zinc-900 dark:text-white transition-colors duration-300"
                            autoFocus
                          />
                          <input
                            type="color"
                            value={editColor}
                            onChange={(e) => setEditColor(e.target.value)}
                            className="w-8 h-8 rounded cursor-pointer bg-transparent border-none p-0 shrink-0"
                          />
                          <button onClick={handleSaveEdit} className="p-1.5 text-emerald-500 hover:bg-emerald-500/10 rounded-lg transition-colors">
                            <Check className="w-4 h-4" />
                          </button>
                          <button onClick={() => setEditingId(null)} className="p-1.5 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-3">
                            <div {...provided.dragHandleProps} className={`cursor-grab active:cursor-grabbing p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors ${searchTerm ? 'opacity-50 pointer-events-none' : ''}`}>
                              <GripVertical className="w-4 h-4 text-zinc-500" />
                            </div>
                            <div className="flex items-center gap-2">
                              <div 
                                className="w-3 h-3 rounded-full" 
                                style={{ backgroundColor: quality.color || '#10b981' }}
                              />
                              <span className="font-medium text-zinc-900 dark:text-white transition-colors duration-300">{quality.name}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleEdit(quality)}
                              className="p-2 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setDeleteId(quality.id)}
                              className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
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
              {filteredQualities.length === 0 && (
                <div className="col-span-full text-center py-12 text-zinc-500">
                  No qualities found. Add some above!
                </div>
              )}
            </div>
          )}
        </Droppable>
      </DragDropContext>
      )}

      <ConfirmModal
        isOpen={!!deleteId}
        title="Delete Quality"
        message="Are you sure you want to delete this quality? This action cannot be undone."
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
