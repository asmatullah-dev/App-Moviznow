import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../firebase';
import { collection, addDoc, deleteDoc, doc, updateDoc, writeBatch } from 'firebase/firestore';
import { Language } from '../../types';
import { Plus, Edit2, Trash2, X, Check, Search, GripVertical, Loader2 } from 'lucide-react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import ConfirmModal from '../../components/ConfirmModal';
import { handleFirestoreError, OperationType } from '../../utils/firestoreErrorHandler';
import { useModalBehavior } from '../../hooks/useModalBehavior';

import { useContent } from '../../contexts/ContentContext';

export default function LanguageManagement() {
  const { languages, updateSearchIndex } = useContent();
  const [newLanguage, setNewLanguage] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
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
    if (!newLanguage.trim()) return;
    setProcessing(prev => ({ ...prev, add: true }));
    try {
      const maxOrder = languages.length > 0 ? Math.max(...languages.map(l => l.order || 0)) : 0;
      await addDoc(collection(db, 'languages'), { name: newLanguage.trim(), order: maxOrder + 1 });
      setNewLanguage('');
    } finally {
      setProcessing(prev => ({ ...prev, add: false }));
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setProcessing(prev => ({ ...prev, delete: true }));
    try {
      await deleteDoc(doc(db, 'languages', deleteId));
    } finally {
      setProcessing(prev => ({ ...prev, delete: false }));
    }
  };

  const handleEdit = (language: Language) => {
    setEditingId(language.id);
    setEditName(language.name);
  };

  const handleSaveEdit = async () => {
    if (!editName.trim() || !editingId) return;
    setProcessing(prev => ({ ...prev, edit: true }));
    try {
      await updateDoc(doc(db, 'languages', editingId), { name: editName.trim() });
      setEditingId(null);
      setEditName('');
    } finally {
      setProcessing(prev => ({ ...prev, edit: false }));
    }
  };

  const onDragEnd = async (result: DropResult) => {
    if (!result.destination) return;
    if (searchTerm) return; // Disable drag and drop when searching

    const items = Array.from<Language>(languages);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    // Batch update order in Firestore
    const batch = writeBatch(db);
    items.forEach((item, index) => {
      const ref = doc(db, 'languages', item.id);
      batch.update(ref, { order: index });
    });
    await batch.commit();
  };

  const filteredLanguages = useMemo(() => {
    if (!searchTerm) return languages;
    const lower = searchTerm.toLowerCase();
    return languages.filter(l => l.name.toLowerCase().includes(lower));
  }, [languages, searchTerm]);

  return (
    <div className="p-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <h1 className="text-3xl font-bold text-zinc-900 dark:text-white transition-colors duration-300">Language Management</h1>
        <div className="relative w-full md:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
          <input
            type="text"
            placeholder="Search languages..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:border-emerald-500 text-zinc-900 dark:text-white transition-colors duration-300"
          />
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-900 rounded-2xl p-6 border border-zinc-200 dark:border-zinc-800 mb-8 max-w-2xl transition-colors duration-300">
        <h2 className="text-xl font-semibold mb-4 text-zinc-900 dark:text-white transition-colors duration-300">Add New Language</h2>
        <form onSubmit={handleAdd} className="flex flex-col gap-4">
          <input
            type="text"
            value={newLanguage}
            onChange={(e) => setNewLanguage(e.target.value)}
            placeholder="e.g., English, Spanish, Hindi"
            className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500 text-zinc-900 dark:text-white transition-colors duration-300"
          />
          <button
            type="submit"
            disabled={processing.add}
            className="bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-3 rounded-xl font-medium flex items-center justify-center gap-2 transition-colors w-full disabled:opacity-50"
          >
            {processing.add ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
            {processing.add ? 'Adding...' : 'Add Language'}
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
          <Droppable droppableId="languages">
          {(provided) => (
            <div
              {...provided.droppableProps}
              ref={provided.innerRef}
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
            >
              {filteredLanguages.map((language, index) => (
                // @ts-ignore
                <Draggable key={language.id} draggableId={language.id} index={index} isDragDisabled={!!searchTerm}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      className={`bg-white dark:bg-zinc-900 border ${snapshot.isDragging ? 'border-emerald-500 shadow-lg shadow-emerald-500/20 z-10' : 'border-zinc-200 dark:border-zinc-800'} rounded-xl p-4 flex items-center justify-between transition-colors duration-300`}
                    >
                      {editingId === language.id ? (
                        <div className="flex items-center gap-2 w-full">
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="flex-1 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-1.5 focus:outline-none focus:border-emerald-500 text-sm text-zinc-900 dark:text-white transition-colors duration-300"
                            autoFocus
                          />
                          <button onClick={handleSaveEdit} className="text-emerald-500 hover:text-emerald-400 p-1">
                            <Check className="w-4 h-4" />
                          </button>
                          <button onClick={() => setEditingId(null)} className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white p-1 transition-colors">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-3">
                            <div {...provided.dragHandleProps} className={`cursor-grab active:cursor-grabbing p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors ${searchTerm ? 'opacity-50 pointer-events-none' : ''}`}>
                              <GripVertical className="w-4 h-4 text-zinc-500" />
                            </div>
                            <span className="font-medium text-zinc-900 dark:text-white transition-colors duration-300">{language.name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button onClick={() => handleEdit(language)} className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white p-2 transition-colors">
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button onClick={() => setDeleteId(language.id)} className="text-red-500/70 hover:text-red-500 p-2 transition-colors">
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
              {filteredLanguages.length === 0 && (
                <div className="col-span-full text-center py-8 text-zinc-500">
                  No languages found.
                </div>
              )}
            </div>
          )}
        </Droppable>
      </DragDropContext>
      )}

      <ConfirmModal
        isOpen={!!deleteId}
        title="Delete Language"
        message="Are you sure you want to delete this language? This action cannot be undone."
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
