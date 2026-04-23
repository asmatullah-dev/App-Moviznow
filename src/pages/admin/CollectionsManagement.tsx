import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
import { collection, doc, addDoc, updateDoc, deleteDoc, getDocs, onSnapshot, query, orderBy, writeBatch } from 'firebase/firestore';
import { Plus, Trash2, Edit2, Save, X, Layers, Film, ChevronUp, ChevronDown, Loader2, TrendingUp, Zap } from 'lucide-react';
import { Collection as AppCollection, Content } from '../../types';
import { useContent } from '../../contexts/ContentContext';
import { clsx } from 'clsx';
import ConfirmModal from '../../components/ConfirmModal';
import { handleFirestoreError, OperationType } from '../../utils/firestoreErrorHandler';
import { formatContentTitle } from '../../utils/contentUtils';

export default function CollectionsManagement() {
  const { contentList, collections } = useContent();
  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ title: string; description: string; contentIds: string[] }>({ title: '', description: '', contentIds: [] });
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [contentSearch, setContentSearch] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleAdd = async () => {
    try {
      await addDoc(collection(db, 'collections'), {
        title: 'New Collection',
        contentIds: [],
        createdAt: new Date().toISOString(),
        order: collections.length
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'collections');
    }
  };

  const handleSave = async (id: string) => {
    try {
      setIsSaving(true);
      await updateDoc(doc(db, 'collections', id), {
        title: editForm.title,
        description: editForm.description,
        contentIds: editForm.contentIds
      });
      setIsEditing(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `collections/${id}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await deleteDoc(doc(db, 'collections', deleteConfirm));
      setDeleteConfirm(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `collections/${deleteConfirm}`);
    }
  };

  const handleAddContent = (contentId: string) => {
    if (!editForm.contentIds.includes(contentId)) {
      const isSpecial = editForm.title.toLowerCase() === 'newly added' || editForm.title.toLowerCase() === 'trending';
      if (isSpecial) {
        setEditForm({ ...editForm, contentIds: [contentId, ...editForm.contentIds] });
      } else {
        setEditForm({ ...editForm, contentIds: [...editForm.contentIds, contentId] });
      }
      setContentSearch('');
    }
  };

  const handleRemoveContent = (contentId: string) => {
    setEditForm({ ...editForm, contentIds: editForm.contentIds.filter(id => id !== contentId) });
  };

  const moveContentUp = (index: number) => {
    if (index === 0) return;
    const newIds = [...editForm.contentIds];
    const temp = newIds[index];
    newIds[index] = newIds[index - 1];
    newIds[index - 1] = temp;
    setEditForm({ ...editForm, contentIds: newIds });
  };

  const moveContentDown = (index: number) => {
    if (index === editForm.contentIds.length - 1) return;
    const newIds = [...editForm.contentIds];
    const temp = newIds[index];
    newIds[index] = newIds[index + 1];
    newIds[index + 1] = temp;
    setEditForm({ ...editForm, contentIds: newIds });
  };

  // Reorder collections
  const moveUp = async (index: number) => {
    if (index === 0) return;
    const batch = writeBatch(db);
    const curr = collections[index];
    const prev = collections[index - 1];
    batch.update(doc(db, 'collections', curr.id), { order: index - 1 });
    batch.update(doc(db, 'collections', prev.id), { order: index });
    await batch.commit();
  };

  const moveDown = async (index: number) => {
    if (index === collections.length - 1) return;
    const batch = writeBatch(db);
    const curr = collections[index];
    const next = collections[index + 1];
    batch.update(doc(db, 'collections', curr.id), { order: index + 1 });
    batch.update(doc(db, 'collections', next.id), { order: index });
    await batch.commit();
  };

  const searchResults = contentSearch.length > 2 
    ? contentList.filter(c => 
        (c.title?.toLowerCase().includes(contentSearch.toLowerCase())) &&
        !editForm.contentIds.includes(c.id)
      ).slice(0, 10)
    : [];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-white dark:bg-zinc-900 p-4 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-500">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-zinc-900 to-zinc-600 dark:from-white dark:to-zinc-400">
              Collections Management
            </h1>
            <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5">Manage grouped content rows for the home page</p>
          </div>
        </div>
        <button
          onClick={handleAdd}
          className="bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-lg flex items-center gap-2 transition-all active:scale-95 shadow-lg shadow-emerald-500/20 text-xs font-bold"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Add Collection</span>
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {collections.map((collection, index) => (
            <div 
              key={collection.id} 
              className={clsx(
                "group relative transition-all hover:scale-[1.01] flex flex-col transform-gpu shadow-sm",
                isEditing === collection.id ? "ring-2 ring-emerald-500/30" : "border-zinc-200 dark:border-zinc-800"
              )}
            >
              <div className="absolute -inset-[1px] bg-gradient-to-br from-emerald-500 to-emerald-700 rounded-2xl z-0 opacity-0 group-hover:opacity-100 transition-all duration-300 group-hover:blur-sm" />
              
              <div className="relative h-full w-full rounded-[15.5px] p-[1px] bg-gradient-to-br from-emerald-400 via-emerald-500 to-emerald-600 z-10 transition-opacity">
                <div className="relative h-full w-full bg-black rounded-[14.5px] p-[0.5px]">
                  <div className="relative h-full w-full bg-white dark:bg-zinc-900 rounded-[14px] overflow-hidden">
            {isEditing === collection.id ? (
              <div className="p-6 space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-1">Collection Title</label>
                      <input
                        type="text"
                        value={editForm.title}
                        onChange={(e) => setEditForm(prev => ({ ...prev, title: e.target.value }))}
                        className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl px-5 py-3 text-zinc-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                        placeholder="e.g. Action Blockbusters"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-1">Description (Optional)</label>
                      <input
                        type="text"
                        value={editForm.description}
                        onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                        className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl px-5 py-3 text-zinc-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                        placeholder="Brief overview of this collection"
                      />
                    </div>
                  </div>
                    <div className="flex flex-col items-end gap-1">
                      <div className="flex items-center gap-1.5 self-end">
                        <button
                          onClick={() => handleSave(collection.id)}
                          disabled={isSaving || editForm.contentIds.length < 2 || !editForm.title.trim()}
                          className="flex items-center gap-1.5 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-emerald-500/10 disabled:opacity-50 disabled:cursor-not-allowed"
                          title={editForm.contentIds.length < 2 ? "At least 2 items are required" : ""}
                        >
                          {isSaving ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Save className="w-3.5 h-3.5" />
                          )}
                          <span>{isSaving ? 'Saving...' : 'Save'}</span>
                        </button>
                        <button
                          onClick={() => setIsEditing(null)}
                          disabled={isSaving}
                          className="p-2 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-xl transition-all disabled:opacity-50"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      {editForm.contentIds.length < 2 && (
                        <span className="text-[9px] text-zinc-400 font-medium">Add at least 2 items to save</span>
                      )}
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-1">Search to Add Content</label>
                      <div className="relative">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400">
                          <Plus className="w-4 h-4" />
                        </div>
                        <input
                          type="text"
                          value={contentSearch}
                          onChange={(e) => setContentSearch(e.target.value)}
                          placeholder="Search movies or series..."
                          className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-10 pr-4 py-2 text-xs focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                        />
                        {contentSearch.length > 2 && searchResults.length > 0 && (
                          <div className="absolute z-[30] w-full mt-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-2xl max-h-48 overflow-y-auto overflow-x-hidden border-emerald-500/20">
                            {searchResults.map(c => (
                              <button
                                key={c.id}
                                onClick={() => handleAddContent(c.id)}
                                className="w-full text-left px-3 py-2 hover:bg-emerald-500/5 flex items-center justify-between group border-b border-zinc-100 dark:border-zinc-800/50 last:border-0 transition-colors"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <div className="w-6 h-9 bg-zinc-100 dark:bg-zinc-800 rounded overflow-hidden shrink-0">
                                    {c.posterUrl ? <img src={c.posterUrl} alt="" className="w-full h-full object-cover" /> : <Film className="w-3 h-3 m-auto text-zinc-500" />}
                                  </div>
                                  <div className="flex flex-col gap-0.5 min-w-0">
                                    <span className="text-xs font-bold truncate group-hover:text-emerald-500 transition-colors">{formatContentTitle(c)}</span>
                                    <span className="text-[8px] text-zinc-500 font-mono">({c.year}) • {c.type}</span>
                                  </div>
                                </div>
                                <div className="p-1 bg-emerald-500/10 rounded-md text-emerald-500 opacity-0 group-hover:opacity-100 transition-all scale-75 group-hover:scale-100">
                                  <Plus className="w-3 h-3" />
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between px-1">
                      <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Included Content ({editForm.contentIds.length})</label>
                      {editForm.contentIds.length > 0 && (
                        <button 
                          onClick={() => setEditForm(prev => ({ ...prev, contentIds: [] }))}
                          className="text-[10px] font-bold text-red-500 hover:text-red-600 uppercase tracking-widest"
                        >
                          Clear All
                        </button>
                      )}
                    </div>
                    <div className="bg-zinc-50 dark:bg-zinc-950/50 rounded-xl border border-zinc-200 dark:border-zinc-800/50 p-1.5 max-h-[300px] overflow-y-auto space-y-1.5 custom-scrollbar">
                      {editForm.contentIds.length === 0 ? (
                        <div className="py-8 text-center flex flex-col items-center gap-2">
                          <Film className="w-6 h-6 text-zinc-300 dark:text-zinc-700" />
                          <p className="text-[10px] text-zinc-500">No content added yet</p>
                        </div>
                      ) : (
                        editForm.contentIds.map((id, idx) => {
                          const c = contentList.find(c => c.id === id);
                          if (!c) return null;
                          return (
                            <div key={id} className="flex items-center gap-2 p-1.5 bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 group hover:border-emerald-500/30 transition-all">
                              <div className="w-9 h-14 bg-zinc-100 dark:bg-zinc-800 rounded-md overflow-hidden shrink-0 relative">
                                {c.posterUrl ? <img src={c.posterUrl} alt="" className="w-full h-full object-cover" /> : <Film className="w-4 h-4 m-auto text-zinc-500" />}
                                <div className="absolute top-0.5 left-0.5 w-4 h-4 bg-black/60 backdrop-blur-md rounded flex items-center justify-center text-[8px] font-bold text-white border border-white/10">
                                  {idx + 1}
                                </div>
                              </div>
                              <div className="flex-1 min-w-0">
                                <h5 className="text-xs font-bold text-zinc-900 dark:text-white truncate">{formatContentTitle(c)}</h5>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  <span className="text-[8px] text-zinc-500 font-mono uppercase px-1 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded font-bold">
                                    {c.type}
                                  </span>
                                  <span className="text-[8px] text-zinc-500">{c.year}</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-1">
                                <div className="flex flex-col gap-0.5">
                                  <button
                                    onClick={() => moveContentUp(idx)}
                                    disabled={idx === 0}
                                    className="p-1 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-400 hover:text-emerald-500 disabled:opacity-20 transition-all"
                                  >
                                    <ChevronUp className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={() => moveContentDown(idx)}
                                    disabled={idx === editForm.contentIds.length - 1}
                                    className="p-1 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-400 hover:text-emerald-500 disabled:opacity-20 transition-all"
                                  >
                                    <ChevronDown className="w-3 h-3" />
                                  </button>
                                </div>
                                <button
                                  onClick={() => handleRemoveContent(id)}
                                  className="p-1.5 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white rounded-lg transition-all border border-red-500/20 ml-1"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className={clsx(
                    "w-10 h-10 rounded-xl flex items-center justify-center transition-all bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300",
                    collection.title.toLowerCase() === 'trending' && "bg-pink-500/10 text-pink-500 dark:text-pink-400",
                    collection.title.toLowerCase() === 'newly added' && "bg-cyan-500/10 text-cyan-500 dark:text-cyan-400"
                  )}>
                    {collection.title.toLowerCase() === 'trending' ? (
                      <TrendingUp className="w-5 h-5" />
                    ) : collection.title.toLowerCase() === 'newly added' ? (
                      <Zap className="w-5 h-5" />
                    ) : (
                      <Layers className="w-5 h-5" />
                    )}
                  </div>
                  <div>
                    <h3 className="font-bold text-base text-zinc-900 dark:text-white group-hover:text-emerald-500 transition-colors">
                      {collection.title}
                    </h3>
                    {collection.description && (
                      <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5 line-clamp-1">{collection.description}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[8px] font-bold uppercase tracking-widest">
                        {collection.contentIds.length} Items
                      </span>
                      <span className="text-[8px] text-zinc-400 font-mono italic">
                        Order: {index + 1}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex flex-col gap-0.5 pr-2 border-r border-zinc-200 dark:border-zinc-800">
                    <button 
                      onClick={() => moveUp(index)} 
                      disabled={index === 0} 
                      className="p-1 rounded-md bg-zinc-50 dark:bg-zinc-800 text-zinc-400 hover:text-emerald-500 disabled:opacity-20 transition-all border border-zinc-200/50 dark:border-zinc-700/50"
                      title="Move Collection Up"
                    >
                      <ChevronUp className="w-3.5 h-3.5" />
                    </button>
                    <button 
                      onClick={() => moveDown(index)} 
                      disabled={index === collections.length - 1} 
                      className="p-1 rounded-md bg-zinc-50 dark:bg-zinc-800 text-zinc-400 hover:text-emerald-500 disabled:opacity-20 transition-all border border-zinc-200/50 dark:border-zinc-700/50"
                      title="Move Collection Down"
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => {
                        setIsEditing(collection.id);
                        setEditForm({ 
                          title: collection.title, 
                          description: collection.description || '', 
                          contentIds: collection.contentIds || [] 
                        });
                      }}
                      className="p-2 bg-blue-500/10 text-blue-500 hover:bg-blue-500 hover:text-white rounded-xl transition-all border border-blue-500/20 group/edit"
                    >
                      <Edit2 className="w-4 h-4 transition-transform group-hover/edit:scale-110" />
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(collection.id)}
                      className="p-2 bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white rounded-xl transition-all border border-red-500/20 group/del"
                    >
                      <Trash2 className="w-4 h-4 transition-transform group-hover/del:scale-110" />
                    </button>
                  </div>
                </div>
              </div>
            )}
                </div>
              </div>
            </div>
          </div>
        ))}
        {collections.length === 0 && (
          <div className="text-center py-12 text-zinc-500">
            <Layers className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p>No collections found</p>
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={!!deleteConfirm}
        title="Delete Collection"
        message="Are you sure you want to delete this collection? This will not delete the actual movies/series."
        confirmText="Delete"
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
}
