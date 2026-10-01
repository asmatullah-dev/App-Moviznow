import React, { useState, useEffect, useMemo } from 'react';
import { 
  Database, 
  Search, 
  Plus, 
  Trash2, 
  Edit2, 
  Check, 
  X, 
  Copy, 
  RefreshCw, 
  Code, 
  FileJson, 
  AlertCircle, 
  Save, 
  SlidersHorizontal, 
  Undo2, 
  ChevronDown, 
  ChevronRight,
  Layers,
  ArrowUpRight
} from 'lucide-react';
import { doc, getDoc, setDoc, updateDoc, deleteField } from 'firebase/firestore';
import { motion, AnimatePresence } from 'framer-motion';
import { db, runWithNetwork } from '../firebase';
import { Button } from './Button';
import { safeStorage } from '../utils/safeStorage';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrorHandler';

export interface ChunkMetaDocModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export type FieldType = 'string' | 'number' | 'boolean' | 'array' | 'object' | 'null' | 'undefined';

export function detectType(val: any): FieldType {
  if (val === null) return 'null';
  if (val === undefined) return 'undefined';
  if (Array.isArray(val)) return 'array';
  const t = typeof val;
  if (t === 'string') return 'string';
  if (t === 'number') return 'number';
  if (t === 'boolean') return 'boolean';
  if (t === 'object') return 'object';
  return 'string';
}

export const ChunkMetaDocModal: React.FC<ChunkMetaDocModalProps> = ({
  isOpen,
  onClose,
}) => {
  // Working copy of chunk_meta document fields
  const [data, setData] = useState<Record<string, any>>({});
  const [originalData, setOriginalData] = useState<Record<string, any>>({});
  const [deletedKeys, setDeletedKeys] = useState<Set<string>>(new Set());

  // Search and filters
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | FieldType>('all');
  
  // UI states
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValueStr, setEditValueStr] = useState('');
  const [editTypeError, setEditTypeError] = useState<string | null>(null);
  const [isJsonMode, setIsJsonMode] = useState(false);
  const [rawJsonText, setRawJsonText] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const [confirmDeleteKey, setConfirmDeleteKey] = useState<string | null>(null);
  
  // Add field form state
  const [isAddingField, setIsAddingField] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newType, setNewType] = useState<FieldType>('string');
  const [newValueStr, setNewValueStr] = useState('');
  const [addFieldError, setAddFieldError] = useState<string | null>(null);

  // Expanded object/array views
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [nestedSearchTerms, setNestedSearchTerms] = useState<Record<string, string>>({});

  // Loading & Saving states
  const [isLoadingLive, setIsLoadingLive] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Initial load from local cache + live Firestore
  useEffect(() => {
    if (!isOpen) return;

    // 1. Immediately populate from local cache if present
    let cachedData: Record<string, any> = {};
    try {
      const stored = safeStorage.getItem('admin_chunk_meta_versions') || safeStorage.getItem('chunk_meta_versions');
      if (stored) {
        cachedData = JSON.parse(stored);
        if (typeof cachedData === 'object' && cachedData !== null) {
          setData({ ...cachedData });
          setOriginalData({ ...cachedData });
        }
      }
    } catch (e) {
      console.warn("Failed reading cached chunk_meta:", e);
    }

    // 2. Fetch fresh live doc from Firestore
    fetchLiveDoc(Object.keys(cachedData).length === 0);
  }, [isOpen]);

  const fetchLiveDoc = async (showLoadingSpinner: boolean = true) => {
    if (showLoadingSpinner) setIsLoadingLive(true);
    setErrorNotice(null);
    try {
      const metaRef = doc(db, 'chunk_meta', 'versions');
      const snap = await runWithNetwork(() => getDoc(metaRef));
      if (snap.exists()) {
        const liveDoc = snap.data();
        setData({ ...liveDoc });
        setOriginalData({ ...liveDoc });
        setDeletedKeys(new Set());
        setEditingKey(null);
        setConfirmDeleteKey(null);
        
        // Cache locally for offline/quick reference
        try {
          safeStorage.setItem('admin_chunk_meta_versions', JSON.stringify(liveDoc));
          safeStorage.setItem('chunk_meta_versions', JSON.stringify(liveDoc));
        } catch (e) {}

        setStatusNotice(`Live chunk_meta document loaded from Firestore (${Object.keys(liveDoc).length} top-level fields).`);
      } else {
        setStatusNotice('Document chunk_meta/versions does not exist yet in Firestore.');
      }
    } catch (err: any) {
      console.error("Error fetching chunk_meta doc:", err);
      setErrorNotice(`Firestore read error: ${err?.message || 'Failed to fetch live doc'}`);
    } finally {
      setIsLoadingLive(false);
      setTimeout(() => setStatusNotice(null), 5000);
    }
  };

  // Switch to JSON mode sync
  useEffect(() => {
    if (isJsonMode) {
      const activeData: Record<string, any> = {};
      for (const [k, v] of Object.entries(data)) {
        if (!deletedKeys.has(k)) {
          activeData[k] = v;
        }
      }
      setRawJsonText(JSON.stringify(activeData, null, 2));
      setJsonError(null);
    }
  }, [isJsonMode, data, deletedKeys]);

  // Determine modified fields count
  const changesCount = useMemo(() => {
    let count = deletedKeys.size;
    for (const [k, v] of Object.entries(data)) {
      if (!deletedKeys.has(k)) {
        if (!(k in originalData)) {
          count++;
        } else if (JSON.stringify(originalData[k]) !== JSON.stringify(v)) {
          count++;
        }
      }
    }
    return count;
  }, [data, originalData, deletedKeys]);

  // Filtered keys
  const filteredKeys = useMemo(() => {
    const keys = Object.keys(data).filter(k => !deletedKeys.has(k));
    keys.sort((a, b) => {
      // Prioritize primary version keys
      if (a === 'users') return -1;
      if (b === 'users') return 1;
      if (a === 'users_version') return -1;
      if (b === 'users_version') return 1;
      if (a.includes('version') && !b.includes('version')) return -1;
      if (!a.includes('version') && b.includes('version')) return 1;
      return a.localeCompare(b);
    });

    return keys.filter(key => {
      const val = data[key];
      const type = detectType(val);
      
      if (typeFilter !== 'all' && type !== typeFilter) {
        return false;
      }

      if (!searchTerm) return true;
      const lowerSearch = searchTerm.toLowerCase();
      if (key.toLowerCase().includes(lowerSearch)) return true;
      
      try {
        const valStr = typeof val === 'object' ? JSON.stringify(val) : String(val);
        return valStr.toLowerCase().includes(lowerSearch);
      } catch {
        return false;
      }
    });
  }, [data, deletedKeys, typeFilter, searchTerm]);

  // Toggle boolean field immediately
  const handleToggleBoolean = (key: string) => {
    setData(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  // Start editing a specific field
  const handleStartEdit = (key: string) => {
    const val = data[key];
    setEditingKey(key);
    setEditTypeError(null);
    if (typeof val === 'object') {
      setEditValueStr(JSON.stringify(val, null, 2));
    } else {
      setEditValueStr(val !== undefined && val !== null ? String(val) : '');
    }
  };

  // Save the currently edited field
  const handleSaveFieldEdit = (key: string) => {
    const originalType = detectType(data[key]);
    let parsedValue: any = editValueStr;

    try {
      if (originalType === 'number') {
        parsedValue = Number(editValueStr);
        if (isNaN(parsedValue)) {
          setEditTypeError('Please enter a valid number');
          return;
        }
      } else if (originalType === 'boolean') {
        parsedValue = editValueStr.toLowerCase() === 'true';
      } else if (originalType === 'array' || originalType === 'object') {
        parsedValue = JSON.parse(editValueStr);
      } else if (originalType === 'null' || editValueStr === 'null') {
        parsedValue = null;
      }

      setData(prev => ({
        ...prev,
        [key]: parsedValue
      }));
      setEditingKey(null);
      setEditTypeError(null);
    } catch (err: any) {
      setEditTypeError(`Invalid JSON format: ${err?.message || 'Syntax error'}`);
    }
  };

  // Cancel edit of a field
  const handleCancelFieldEdit = () => {
    setEditingKey(null);
    setEditTypeError(null);
  };

  // Delete a field
  const executeDeleteField = (key: string) => {
    setDeletedKeys(prev => new Set(prev).add(key));
    setData(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    if (editingKey === key) {
      setEditingKey(null);
    }
    setConfirmDeleteKey(null);
  };

  // Add a new field
  const handleAddNewField = () => {
    setAddFieldError(null);
    const trimmedKey = newKey.trim();
    if (!trimmedKey) {
      setAddFieldError('Field name is required');
      return;
    }
    if (data[trimmedKey] !== undefined && !deletedKeys.has(trimmedKey)) {
      setAddFieldError(`Field "${trimmedKey}" already exists`);
      return;
    }

    let parsedVal: any = newValueStr;
    try {
      if (newType === 'number') {
        parsedVal = Number(newValueStr);
        if (isNaN(parsedVal)) {
          setAddFieldError('Please enter a valid numeric value');
          return;
        }
      } else if (newType === 'boolean') {
        parsedVal = newValueStr.toLowerCase() === 'true';
      } else if (newType === 'array') {
        parsedVal = newValueStr.trim() ? JSON.parse(newValueStr) : [];
        if (!Array.isArray(parsedVal)) {
          setAddFieldError('Value must be a valid JSON array');
          return;
        }
      } else if (newType === 'object') {
        parsedVal = newValueStr.trim() ? JSON.parse(newValueStr) : {};
        if (typeof parsedVal !== 'object' || Array.isArray(parsedVal)) {
          setAddFieldError('Value must be a valid JSON object');
          return;
        }
      } else if (newType === 'null') {
        parsedVal = null;
      }

      setData(prev => ({
        ...prev,
        [trimmedKey]: parsedVal
      }));
      setDeletedKeys(prev => {
        const next = new Set(prev);
        next.delete(trimmedKey);
        return next;
      });

      setNewKey('');
      setNewValueStr('');
      setIsAddingField(false);
      setAddFieldError(null);
    } catch (err: any) {
      setAddFieldError(`Invalid JSON format: ${err?.message || 'Syntax error'}`);
    }
  };

  // Apply raw JSON changes
  const handleApplyRawJson = () => {
    try {
      const parsed = JSON.parse(rawJsonText);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        setJsonError('Top-level JSON must be a key-value object');
        return;
      }

      const newDeleted = new Set<string>();
      for (const k of Object.keys(originalData)) {
        if (!(k in parsed)) {
          newDeleted.add(k);
        }
      }

      setData(parsed);
      setDeletedKeys(newDeleted);
      setIsJsonMode(false);
      setJsonError(null);
    } catch (err: any) {
      setJsonError(`JSON Syntax Error: ${err?.message}`);
    }
  };

  // Save all changes directly to chunk_meta/versions in Firestore
  const handleSaveToFirestore = async () => {
    setIsSaving(true);
    setErrorNotice(null);
    try {
      const metaRef = doc(db, 'chunk_meta', 'versions');
      
      const payload: Record<string, any> = {};
      for (const [k, v] of Object.entries(data)) {
        if (!deletedKeys.has(k)) {
          payload[k] = v;
        }
      }

      // Add deleteField for removed keys
      if (deletedKeys.size > 0) {
        deletedKeys.forEach(k => {
          payload[k] = deleteField();
        });
      }

      await runWithNetwork(() => setDoc(metaRef, payload, { merge: true }));

      // Update local storage caches
      const cleanData: Record<string, any> = {};
      for (const [k, v] of Object.entries(data)) {
        if (!deletedKeys.has(k)) {
          cleanData[k] = v;
        }
      }
      safeStorage.setItem('admin_chunk_meta_versions', JSON.stringify(cleanData));
      safeStorage.setItem('chunk_meta_versions', JSON.stringify(cleanData));

      setOriginalData({ ...cleanData });
      setData({ ...cleanData });
      setDeletedKeys(new Set());
      setStatusNotice('Successfully saved chunk_meta/versions to Firestore!');

      // Dispatch event to inform system that versions updated
      window.dispatchEvent(new CustomEvent('chunk_meta_updated', { detail: cleanData }));
    } catch (err: any) {
      console.error("Failed to save chunk_meta doc:", err);
      handleFirestoreError(err, OperationType.WRITE, 'chunk_meta/versions');
      setErrorNotice(`Failed to save: ${err?.message || 'Error occurred'}`);
    } finally {
      setIsSaving(false);
      setTimeout(() => setStatusNotice(null), 5000);
    }
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(id);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const toggleExpand = (key: string) => {
    setExpandedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div 
        className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl w-full max-w-5xl h-[92vh] max-h-[92vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="p-4 sm:p-5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-3 shrink-0 bg-zinc-50/50 dark:bg-zinc-950/40">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-indigo-500/10 text-indigo-500 dark:text-indigo-400">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-bold text-zinc-900 dark:text-white">
                  Chunk Meta Document
                </h2>
                <span className="font-mono text-[11px] font-semibold px-2.5 py-0.5 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                  chunk_meta/versions
                </span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Firestore version manifest and delta cache document. Total fields: <span className="font-bold text-zinc-700 dark:text-zinc-300">{Object.keys(data).length}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="p-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors cursor-pointer"
              title="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Action Controls & Document Banner */}
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-100/50 dark:bg-zinc-950/20 shrink-0 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                onClick={() => fetchLiveDoc(true)}
                disabled={isLoadingLive}
                variant="secondary"
                className="text-xs py-1.5 px-3 h-auto"
                icon={<RefreshCw className={`w-3.5 h-3.5 ${isLoadingLive ? 'animate-spin' : ''}`} />}
              >
                {isLoadingLive ? 'Loading Live...' : 'Load Live from Firestore'}
              </Button>

              <Button
                onClick={() => {
                  try {
                    const stored = safeStorage.getItem('admin_chunk_meta_versions') || safeStorage.getItem('chunk_meta_versions');
                    if (stored) {
                      const parsed = JSON.parse(stored);
                      setData({ ...parsed });
                      setOriginalData({ ...parsed });
                      setDeletedKeys(new Set());
                      setStatusNotice('Loaded chunk_meta from local browser cache.');
                      setTimeout(() => setStatusNotice(null), 4000);
                    } else {
                      setErrorNotice('No cached chunk_meta found in local browser storage.');
                    }
                  } catch (e: any) {
                    setErrorNotice(`Failed reading cache: ${e?.message}`);
                  }
                }}
                variant="secondary"
                className="text-xs py-1.5 px-3 h-auto"
                icon={<Layers className="w-3.5 h-3.5" />}
              >
                Load from Cache
              </Button>

              <Button
                onClick={() => setIsJsonMode(!isJsonMode)}
                variant={isJsonMode ? 'emerald' : 'secondary'}
                className="text-xs py-1.5 px-3 h-auto"
                icon={isJsonMode ? <SlidersHorizontal className="w-3.5 h-3.5" /> : <FileJson className="w-3.5 h-3.5" />}
              >
                {isJsonMode ? 'Table View' : 'Raw JSON'}
              </Button>

              <Button
                onClick={() => handleCopy(JSON.stringify(data, null, 2), 'chunk_meta_json')}
                variant="secondary"
                className="text-xs py-1.5 px-3 h-auto"
                icon={<Copy className="w-3.5 h-3.5" />}
              >
                {copiedKey === 'chunk_meta_json' ? 'Copied JSON!' : 'Copy Entire Doc'}
              </Button>
            </div>

            <div className="flex items-center gap-2">
              {changesCount > 0 && (
                <span className="text-xs font-semibold text-amber-500 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                  {changesCount} field{changesCount > 1 ? 's' : ''} modified
                </span>
              )}
            </div>
          </div>

          {statusNotice && (
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs flex items-center justify-between gap-2 animate-fade-in">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 shrink-0" />
                <span>{statusNotice}</span>
              </div>
              <button onClick={() => setStatusNotice(null)} className="text-emerald-500 hover:text-emerald-700 cursor-pointer">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {errorNotice && (
            <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs flex items-center justify-between gap-2 animate-fade-in">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorNotice}</span>
              </div>
              <button onClick={() => setErrorNotice(null)} className="text-red-400 hover:text-red-600 cursor-pointer">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden p-4 sm:p-5 flex flex-col min-h-0">
          {isJsonMode ? (
            /* JSON Mode Full Editor */
            <div className="flex-1 flex flex-col space-y-3 min-h-[350px]">
              <div className="flex items-center justify-between text-xs text-zinc-500">
                <span>Direct JSON Editor for <code className="text-indigo-500 font-mono font-semibold">chunk_meta/versions</code></span>
                <button
                  onClick={() => {
                    try {
                      const formatted = JSON.stringify(JSON.parse(rawJsonText), null, 2);
                      setRawJsonText(formatted);
                      setJsonError(null);
                    } catch (e: any) {
                      setJsonError(e.message);
                    }
                  }}
                  className="text-indigo-500 hover:underline flex items-center gap-1 cursor-pointer font-medium"
                >
                  <Code className="w-3 h-3" />
                  Prettify JSON
                </button>
              </div>

              <textarea
                value={rawJsonText}
                onChange={(e) => {
                  setRawJsonText(e.target.value);
                  setJsonError(null);
                }}
                className="flex-1 w-full bg-zinc-950 text-zinc-100 font-mono text-xs p-4 rounded-2xl border border-zinc-700 focus:outline-none focus:border-indigo-500 resize-none min-h-[300px] custom-scrollbar shadow-inner"
                spellCheck={false}
              />

              {jsonError && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{jsonError}</span>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 shrink-0">
                <Button
                  onClick={() => setIsJsonMode(false)}
                  variant="secondary"
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleApplyRawJson}
                  variant="emerald"
                  className="text-xs"
                  icon={<Check className="w-3.5 h-3.5" />}
                >
                  Apply JSON Changes
                </Button>
              </div>
            </div>
          ) : (
            /* Table View with Filters, Search, Add */
            <div className="flex-1 flex flex-col space-y-3 min-h-0">
              {/* Controls bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 shrink-0">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="text"
                    placeholder="Search field key or value..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-9 pr-8 py-1.5 text-xs focus:outline-none focus:border-indigo-500"
                  />
                  {searchTerm && (
                    <button
                      onClick={() => setSearchTerm('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* Type selector */}
                <div className="flex items-center gap-1 overflow-x-auto text-[11px] pb-1 sm:pb-0">
                  {(['all', 'string', 'number', 'boolean', 'array', 'object'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setTypeFilter(t)}
                      className={`px-2 py-1 rounded-lg font-medium capitalize transition-colors cursor-pointer ${
                        typeFilter === t
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>

                <Button
                  onClick={() => setIsAddingField(!isAddingField)}
                  variant={isAddingField ? 'secondary' : 'emerald'}
                  className="text-xs py-1.5 px-3 h-auto shrink-0"
                  icon={isAddingField ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                >
                  {isAddingField ? 'Cancel Add' : 'Add Field'}
                </Button>
              </div>

              {/* Add Field Form */}
              {isAddingField && (
                <div className="p-3.5 bg-indigo-500/5 dark:bg-indigo-950/20 border border-indigo-500/20 rounded-2xl space-y-3 shrink-0 animate-fade-in">
                  <div className="text-xs font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                    <Plus className="w-4 h-4" />
                    Add New Field to `chunk_meta/versions`
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold text-zinc-500 uppercase mb-1">Field Name (Key)</label>
                      <input
                        type="text"
                        placeholder="e.g. notifications_version, custom_key"
                        value={newKey}
                        onChange={(e) => setNewKey(e.target.value)}
                        className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-1.5 text-xs font-mono focus:outline-none focus:border-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-zinc-500 uppercase mb-1">Data Type</label>
                      <select
                        value={newType}
                        onChange={(e) => setNewType(e.target.value as FieldType)}
                        className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:border-indigo-500 capitalize"
                      >
                        <option value="string">String</option>
                        <option value="number">Number</option>
                        <option value="boolean">Boolean</option>
                        <option value="object">Object (JSON)</option>
                        <option value="array">Array (JSON)</option>
                        <option value="null">Null</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-zinc-500 uppercase mb-1">Initial Value</label>
                      {newType === 'boolean' ? (
                        <select
                          value={newValueStr || 'true'}
                          onChange={(e) => setNewValueStr(e.target.value)}
                          className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:border-indigo-500"
                        >
                          <option value="true">true</option>
                          <option value="false">false</option>
                        </select>
                      ) : (
                        <input
                          type="text"
                          placeholder={newType === 'number' ? '12345678' : newType === 'object' ? '{"key": "value"}' : newType === 'array' ? '["item1"]' : 'Value'}
                          value={newValueStr}
                          onChange={(e) => setNewValueStr(e.target.value)}
                          className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-1.5 text-xs font-mono focus:outline-none focus:border-indigo-500"
                        />
                      )}
                    </div>
                  </div>

                  {addFieldError && (
                    <div className="text-[11px] text-red-500 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{addFieldError}</span>
                    </div>
                  )}

                  <div className="flex justify-end gap-2 pt-1">
                    <Button
                      onClick={() => setIsAddingField(false)}
                      variant="secondary"
                      className="text-xs py-1 px-3 h-auto"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleAddNewField}
                      variant="emerald"
                      className="text-xs py-1 px-3 h-auto"
                      icon={<Check className="w-3.5 h-3.5" />}
                    >
                      Add Field
                    </Button>
                  </div>
                </div>
              )}

              {/* Fields Table */}
              <div className="flex-1 overflow-y-auto rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/60 custom-scrollbar">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 text-[10px] font-bold text-zinc-500 uppercase tracking-wider sticky top-0 z-10 backdrop-blur-md">
                      <th className="py-2.5 px-3.5 w-1/4">Field Key</th>
                      <th className="py-2.5 px-3 w-24">Type</th>
                      <th className="py-2.5 px-3">Value</th>
                      <th className="py-2.5 px-3 text-right w-24">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                    {filteredKeys.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-12 text-center text-xs text-zinc-400">
                          {searchTerm ? `No fields matching "${searchTerm}"` : 'No fields found in chunk_meta document.'}
                        </td>
                      </tr>
                    ) : (
                      filteredKeys.map((key) => {
                        const value = data[key];
                        const type = detectType(value);
                        const isEditing = editingKey === key;
                        const isExpanded = expandedKeys.has(key);
                        const isModified = !(key in originalData) || JSON.stringify(originalData[key]) !== JSON.stringify(value);

                        return (
                          <tr 
                            key={key} 
                            className={`group hover:bg-zinc-50/80 dark:hover:bg-zinc-900/40 transition-colors ${
                              isModified ? 'bg-amber-500/5 dark:bg-amber-500/10' : ''
                            }`}
                          >
                            {/* Key */}
                            <td className="py-2 px-3.5 align-top">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-mono text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                                  {key}
                                </span>
                                {isModified && (
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" title="Modified" />
                                )}
                              </div>
                            </td>

                            {/* Type Badge */}
                            <td className="py-2 px-3 align-top">
                              <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider ${
                                type === 'string'
                                  ? 'bg-blue-500/10 text-blue-500 border border-blue-500/20'
                                  : type === 'number'
                                    ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                                    : type === 'boolean'
                                      ? 'bg-purple-500/10 text-purple-500 border border-purple-500/20'
                                      : type === 'object'
                                        ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                                        : type === 'array'
                                          ? 'bg-cyan-500/10 text-cyan-500 border border-cyan-500/20'
                                          : 'bg-zinc-500/10 text-zinc-500 border border-zinc-500/20'
                              }`}>
                                {type}
                              </span>
                            </td>

                            {/* Value Display / Edit Form */}
                            <td className="py-2 px-3 align-top">
                              {isEditing ? (
                                <div className="space-y-2 animate-fade-in">
                                  {type === 'object' || type === 'array' ? (
                                    <textarea
                                      value={editValueStr}
                                      onChange={(e) => setEditValueStr(e.target.value)}
                                      className="w-full bg-zinc-900 text-zinc-100 font-mono text-xs p-2.5 rounded-xl border border-zinc-700 focus:outline-none focus:border-indigo-500 min-h-[140px] custom-scrollbar"
                                      spellCheck={false}
                                    />
                                  ) : (
                                    <input
                                      type="text"
                                      value={editValueStr}
                                      onChange={(e) => setEditValueStr(e.target.value)}
                                      className="w-full bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg px-2.5 py-1 text-xs font-mono focus:outline-none focus:border-indigo-500 text-zinc-900 dark:text-zinc-100"
                                      autoFocus
                                    />
                                  )}

                                  {editTypeError && (
                                    <div className="text-[11px] text-red-500 flex items-center gap-1">
                                      <AlertCircle className="w-3 h-3 shrink-0" />
                                      <span>{editTypeError}</span>
                                    </div>
                                  )}

                                  <div className="flex items-center gap-1.5">
                                    <button
                                      onClick={() => handleSaveFieldEdit(key)}
                                      className="px-2 py-0.5 rounded bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold transition-colors cursor-pointer flex items-center gap-1"
                                    >
                                      <Check className="w-3 h-3" />
                                      Save
                                    </button>
                                    <button
                                      onClick={handleCancelFieldEdit}
                                      className="px-2 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 text-xs hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-colors cursor-pointer flex items-center gap-1"
                                    >
                                      <X className="w-3 h-3" />
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div>
                                  {type === 'boolean' ? (
                                    <div className="flex items-center gap-2">
                                      <button
                                        onClick={() => handleToggleBoolean(key)}
                                        className={`px-2 py-0.5 rounded-md text-xs font-mono font-bold transition-all cursor-pointer ${
                                          value 
                                            ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/30 hover:bg-emerald-500/20' 
                                            : 'bg-zinc-500/10 text-zinc-500 border border-zinc-500/30 hover:bg-zinc-500/20'
                                        }`}
                                      >
                                        {value ? 'true' : 'false'}
                                      </button>
                                    </div>
                                  ) : type === 'object' || type === 'array' ? (
                                    <div className="space-y-1">
                                      <button
                                        onClick={() => toggleExpand(key)}
                                        className="text-xs font-mono text-indigo-500 hover:text-indigo-400 flex items-center gap-1 cursor-pointer font-medium"
                                      >
                                        {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                        <span>
                                          {type === 'array' 
                                            ? `Array (${(value as any[]).length} items)` 
                                            : `Object (${Object.keys(value || {}).length} entries)`}
                                        </span>
                                      </button>

                                      {isExpanded && (
                                        <div className="mt-1 space-y-1.5 animate-fade-in">
                                          {/* Sub-search for large objects like users */}
                                          {type === 'object' && Object.keys(value || {}).length > 5 && (
                                            <div className="flex items-center gap-2">
                                              <input
                                                type="text"
                                                placeholder={`Filter ${key} entries...`}
                                                value={nestedSearchTerms[key] || ''}
                                                onChange={(e) => setNestedSearchTerms(prev => ({ ...prev, [key]: e.target.value }))}
                                                className="bg-zinc-900 border border-zinc-800 text-zinc-200 text-[10px] font-mono px-2 py-1 rounded-lg w-full max-w-xs focus:outline-none focus:border-indigo-500"
                                              />
                                            </div>
                                          )}

                                          <pre className="p-2.5 bg-zinc-950 text-zinc-200 rounded-xl text-[11px] font-mono overflow-x-auto max-h-56 custom-scrollbar border border-zinc-800 shadow-inner">
                                            {(() => {
                                              if (type === 'object' && nestedSearchTerms[key]) {
                                                const q = nestedSearchTerms[key].toLowerCase();
                                                const filteredObj: Record<string, any> = {};
                                                for (const [subK, subV] of Object.entries(value || {})) {
                                                  if (subK.toLowerCase().includes(q) || String(subV).toLowerCase().includes(q)) {
                                                    filteredObj[subK] = subV;
                                                  }
                                                }
                                                return JSON.stringify(filteredObj, null, 2);
                                              }
                                              return JSON.stringify(value, null, 2);
                                            })()}
                                          </pre>
                                        </div>
                                      )}
                                    </div>
                                  ) : type === 'null' ? (
                                    <span className="font-mono text-zinc-400 italic text-xs">null</span>
                                  ) : (
                                    <div className="text-zinc-800 dark:text-zinc-200 font-mono text-xs break-all max-h-24 overflow-y-auto custom-scrollbar">
                                      {String(value)}
                                    </div>
                                  )}
                                </div>
                              )}
                            </td>

                            {/* Actions */}
                            <td className="py-2 px-3 align-top text-right">
                              {!isEditing && (
                                confirmDeleteKey === key ? (
                                  <div className="flex items-center justify-end gap-1">
                                    <span className="text-[10px] text-red-500 font-bold">Delete?</span>
                                    <button
                                      onClick={() => executeDeleteField(key)}
                                      className="px-1.5 py-0.5 rounded bg-red-500 hover:bg-red-600 text-white text-[10px] font-bold transition-colors cursor-pointer"
                                      title="Confirm delete"
                                    >
                                      Yes
                                    </button>
                                    <button
                                      onClick={() => setConfirmDeleteKey(null)}
                                      className="px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 text-[10px] hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
                                      title="Cancel"
                                    >
                                      No
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-end gap-1">
                                    <button
                                      onClick={() => handleCopy(typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value), key)}
                                      className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded transition-colors cursor-pointer"
                                      title="Copy field value"
                                    >
                                      {copiedKey === key ? (
                                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                                      ) : (
                                        <Copy className="w-3.5 h-3.5" />
                                      )}
                                    </button>

                                    <button
                                      onClick={() => handleStartEdit(key)}
                                      className="p-1 text-zinc-400 hover:text-indigo-500 rounded transition-colors cursor-pointer"
                                      title="Edit field value"
                                    >
                                      <Edit2 className="w-3.5 h-3.5" />
                                    </button>

                                    <button
                                      onClick={() => setConfirmDeleteKey(key)}
                                      className="p-1 text-zinc-400 hover:text-red-500 rounded transition-colors cursor-pointer"
                                      title="Delete field"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                )
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer with Reset & Save to Firestore Buttons */}
        <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/60 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 text-xs">
            {changesCount > 0 ? (
              <span className="flex items-center gap-1.5 font-bold text-amber-500">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                {changesCount} field{changesCount > 1 ? 's' : ''} modified or pending save
              </span>
            ) : (
              <span className="text-zinc-500 flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5 text-emerald-500" />
                All chunk_meta fields in sync
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {changesCount > 0 && (
              <Button
                onClick={() => {
                  setData({ ...originalData });
                  setDeletedKeys(new Set());
                  setEditingKey(null);
                  setConfirmDeleteKey(null);
                }}
                variant="secondary"
                className="text-xs py-1.5 px-3 h-auto"
                icon={<Undo2 className="w-3.5 h-3.5" />}
              >
                Reset Changes
              </Button>
            )}

            <Button
              onClick={handleSaveToFirestore}
              loading={isSaving}
              variant="emerald"
              className="text-xs py-2 px-4 font-bold h-auto shadow-md"
              icon={<Save className="w-4 h-4" />}
            >
              Save to Firestore & Cache
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChunkMetaDocModal;
