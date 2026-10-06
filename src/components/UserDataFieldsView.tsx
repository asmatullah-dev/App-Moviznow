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
  ChevronDown, 
  ChevronRight, 
  SlidersHorizontal, 
  Undo2, 
  ArrowLeft 
} from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db, runWithNetwork } from '../firebase';
import { UserProfile } from '../types';
import { Button } from './Button';
import { safeStorage } from '../utils/safeStorage';

export interface UserDataFieldsViewProps {
  user: UserProfile;
  onSaveUserFields: (updatedFields: Record<string, any>, deletedKeys?: string[]) => Promise<void>;
  isProcessing?: boolean;
  onBack?: () => void;
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

export const UserDataFieldsView: React.FC<UserDataFieldsViewProps> = ({
  user,
  onSaveUserFields,
  isProcessing = false,
  onBack,
}) => {
  // Working copy of fields merged with local storage user document snapshot and pending updates
  const getLatestLocalUserData = (): Record<string, any> => {
    let initial: Record<string, any> = { ...user };
    try {
      // Check stored user caches
      const userCachedStr = safeStorage.getItem(`user_${user.uid}`) || safeStorage.getItem(`user_profile_${user.uid}`);
      if (userCachedStr) {
        const parsed = JSON.parse(userCachedStr);
        if (typeof parsed === 'object' && parsed !== null) {
          initial = { ...initial, ...parsed };
        }
      }

      // Check admin users list cache
      const adminUsersStr = safeStorage.getItem('admin_users');
      if (adminUsersStr) {
        const adminUsers = JSON.parse(adminUsersStr);
        if (Array.isArray(adminUsers)) {
          const found = adminUsers.find((u: any) => u.uid === user.uid);
          if (found && typeof found === 'object') {
            initial = { ...initial, ...found };
          }
        }
      }

      // Check pending user updates
      const pendingStr = safeStorage.getItem('pending_user_updates');
      if (pendingStr) {
        const pending = JSON.parse(pendingStr);
        if (pending[user.uid]) {
          initial = { ...initial, ...pending[user.uid] };
        }
      }
    } catch (e) {}
    return initial;
  };

  const [data, setData] = useState<Record<string, any>>(() => getLatestLocalUserData());
  const [originalData, setOriginalData] = useState<Record<string, any>>(() => getLatestLocalUserData());
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

  // Local feedback notices
  const [fetchNotice, setFetchNotice] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Sync working copy if the user prop changes identity
  useEffect(() => {
    const latestLocal = getLatestLocalUserData();
    setData({ ...latestLocal });
    setOriginalData({ ...latestLocal });
    setDeletedKeys(new Set());
    setEditingKey(null);
    setConfirmDeleteKey(null);
  }, [user.uid]);

  // Handle switching to JSON mode
  useEffect(() => {
    if (isJsonMode) {
      setRawJsonText(JSON.stringify(data, null, 2));
      setJsonError(null);
    }
  }, [isJsonMode, data]);

  // Determine changed fields count
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

  // Filtered field list
  const filteredKeys = useMemo(() => {
    const keys = Object.keys(data).filter(k => !deletedKeys.has(k));
    keys.sort((a, b) => {
      // Prioritize key IDs
      if (a === 'uid') return -1;
      if (b === 'uid') return 1;
      if (a === 'email') return -1;
      if (b === 'email') return 1;
      if (a === 'displayName') return -1;
      if (b === 'displayName') return 1;
      if (a === 'role') return -1;
      if (b === 'role') return 1;
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

  // Delete a field with inline confirmation
  const handleDeleteField = (key: string) => {
    if (key === 'uid') {
      setErrorNotice("Cannot delete the user UID primary key.");
      return;
    }
    setConfirmDeleteKey(key);
  };

  const executeDeleteField = (key: string) => {
    if (key === 'uid') {
      setErrorNotice("Cannot delete the user UID primary key.");
      setConfirmDeleteKey(null);
      return;
    }
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
          setAddFieldError('Value must be a valid JSON array (e.g. ["item1", "item2"])');
          return;
        }
      } else if (newType === 'object') {
        parsedVal = newValueStr.trim() ? JSON.parse(newValueStr) : {};
        if (typeof parsedVal !== 'object' || Array.isArray(parsedVal)) {
          setAddFieldError('Value must be a valid JSON object (e.g. {"key": "value"})');
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

      // Reset add form
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
      if (!parsed.uid) {
        setJsonError('User document must retain "uid" field');
        return;
      }

      // Check which original keys are missing now (to mark for delete)
      const newDeleted = new Set<string>();
      for (const k of Object.keys(originalData)) {
        if (!(k in parsed) && k !== 'uid') {
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

  // Save all changes to local cache and Firestore
  const handleCommitAllChanges = async () => {
    setErrorNotice(null);
    try {
      // Calculate field updates
      const fieldsToSave: Record<string, any> = {};
      const deletedKeyList = Array.from(deletedKeys);

      for (const [k, v] of Object.entries(data)) {
        if (!deletedKeys.has(k)) {
          fieldsToSave[k] = v;
        }
      }

      // Explicitly mark deleted keys for Firestore deleteField()
      deletedKeyList.forEach(k => {
        fieldsToSave[k] = '__DELETE_FIELD__';
      });

      await onSaveUserFields(fieldsToSave, deletedKeyList);
      setOriginalData({ ...data });
      setDeletedKeys(new Set());
      setFetchNotice("All user fields successfully saved to Firestore & local cache.");
      setTimeout(() => setFetchNotice(null), 4000);
    } catch (err: any) {
      console.error("Failed to commit user data fields:", err);
      setErrorNotice(`Error saving user fields: ${err?.message || 'Failed'}`);
    }
  };

  // Copy helper
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

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* Top Banner / Document info */}
      <div className="bg-zinc-100 dark:bg-zinc-950/80 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-3.5 space-y-3 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500 shrink-0">
              <Database className="w-4 h-4" />
            </span>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-mono font-bold text-zinc-900 dark:text-white">
                  Firestore Document: <span className="text-emerald-500 font-semibold">users/{user.uid}</span>
                </span>
                <button
                  onClick={() => handleCopy(user.uid, 'uid_badge')}
                  className="text-[10px] text-zinc-500 hover:text-emerald-500 inline-flex items-center gap-0.5 cursor-pointer"
                  title="Copy UID"
                >
                  <Copy className="w-3 h-3" />
                  {copiedKey === 'uid_badge' ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <p className="text-[11px] text-zinc-500">
                Viewing local cached state synced with Firestore database. Total fields: <span className="font-bold text-zinc-700 dark:text-zinc-300">{Object.keys(data).length}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {onBack && (
              <Button
                onClick={onBack}
                variant="secondary"
                className="text-xs py-1.5 px-3 h-auto"
                icon={<ArrowLeft className="w-3.5 h-3.5" />}
              >
                Back to Details
              </Button>
            )}

            <Button
              onClick={() => setIsJsonMode(!isJsonMode)}
              variant={isJsonMode ? 'emerald' : 'secondary'}
              className="text-xs py-1.5 px-3 h-auto"
              icon={isJsonMode ? <SlidersHorizontal className="w-3.5 h-3.5" /> : <FileJson className="w-3.5 h-3.5" />}
            >
              {isJsonMode ? 'Table View' : 'Raw JSON'}
            </Button>

            <Button
              onClick={() => handleCopy(JSON.stringify(data, null, 2), 'all_json')}
              variant="secondary"
              className="text-xs py-1.5 px-3 h-auto"
              icon={<Copy className="w-3.5 h-3.5" />}
            >
              {copiedKey === 'all_json' ? 'Copied JSON!' : 'Copy JSON'}
            </Button>
          </div>
        </div>

        {fetchNotice && (
          <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0" />
              <span>{fetchNotice}</span>
            </div>
            <button onClick={() => setFetchNotice(null)} className="text-emerald-500 hover:text-emerald-700 cursor-pointer">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {errorNotice && (
          <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs flex items-center justify-between gap-2">
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

      {/* JSON Mode Full Editor */}
      {isJsonMode ? (
        <div className="flex-1 flex flex-col space-y-3 min-h-[350px]">
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span>Direct JSON Editor for <code className="text-emerald-500 font-mono">users/{user.uid}</code></span>
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
              className="text-emerald-500 hover:underline flex items-center gap-1 cursor-pointer"
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
            className="flex-1 w-full bg-zinc-900 text-zinc-100 font-mono text-xs p-4 rounded-2xl border border-zinc-700 focus:outline-none focus:border-emerald-500 resize-none min-h-[320px] custom-scrollbar"
            spellCheck={false}
          />

          {jsonError && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{jsonError}</span>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
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
        /* Structured Table / Fields View */
        <div className="flex-1 flex flex-col space-y-3 min-h-0">
          {/* Controls bar: Search, Type filter, Add Field toggle */}
          <div className="flex flex-wrap items-center justify-between gap-2 shrink-0">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                placeholder="Search field name or value..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-9 pr-8 py-1.5 text-xs focus:outline-none focus:border-emerald-500"
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
                      ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-xs'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900'
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
            <div className="p-3.5 bg-emerald-500/5 dark:bg-emerald-950/20 border border-emerald-500/20 rounded-2xl space-y-3 shrink-0">
              <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                <Plus className="w-4 h-4" />
                Add New Field to Firestore Document (`users/{user.uid}`)
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-zinc-500 uppercase mb-1">Field Name (Key)</label>
                  <input
                    type="text"
                    placeholder="e.g. customNotes, telegramId"
                    value={newKey}
                    onChange={(e) => setNewKey(e.target.value)}
                    className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-1.5 text-xs font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-zinc-500 uppercase mb-1">Data Type</label>
                  <select
                    value={newType}
                    onChange={(e) => setNewType(e.target.value as FieldType)}
                    className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:border-emerald-500"
                  >
                    <option value="string">string (Text)</option>
                    <option value="number">number (Integer / Float)</option>
                    <option value="boolean">boolean (true / false)</option>
                    <option value="array">array (JSON list)</option>
                    <option value="object">object (JSON map)</option>
                    <option value="null">null</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-zinc-500 uppercase mb-1">Initial Value</label>
                  {newType === 'boolean' ? (
                    <select
                      value={newValueStr}
                      onChange={(e) => setNewValueStr(e.target.value)}
                      className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:border-emerald-500"
                    >
                      <option value="true">true</option>
                      <option value="false">false</option>
                    </select>
                  ) : newType === 'null' ? (
                    <input
                      type="text"
                      disabled
                      value="null"
                      className="w-full bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-1.5 text-xs opacity-60"
                    />
                  ) : (
                    <input
                      type="text"
                      placeholder={newType === 'array' ? '["item1", "item2"]' : newType === 'object' ? '{"key": "value"}' : 'Value'}
                      value={newValueStr}
                      onChange={(e) => setNewValueStr(e.target.value)}
                      className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:border-emerald-500"
                    />
                  )}
                </div>
              </div>

              {addFieldError && (
                <div className="text-[11px] text-red-500 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>{addFieldError}</span>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button
                  onClick={handleAddNewField}
                  variant="emerald"
                  className="text-xs py-1 px-3 h-auto"
                  icon={<Plus className="w-3 h-3" />}
                >
                  Confirm Add Field
                </Button>
              </div>
            </div>
          )}

          {/* Fields List Table */}
          <div className="flex-1 overflow-y-auto border border-zinc-200 dark:border-zinc-800 rounded-2xl bg-white dark:bg-zinc-950/60 custom-scrollbar">
            <table className="w-full text-left text-xs table-fixed border-collapse">
              <colgroup>
                <col className="w-[30%]" />
                <col className="w-[58%]" />
                <col className="w-[12%]" />
              </colgroup>
              <thead className="sticky top-0 bg-zinc-100/90 dark:bg-zinc-900/90 backdrop-blur-xs border-b border-zinc-200 dark:border-zinc-800 z-10 text-[10px] uppercase font-bold text-zinc-500 tracking-wider">
                <tr>
                  <th className="py-2.5 px-3">Field & Type</th>
                  <th className="py-2.5 px-3">Value</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60 font-sans">
                {filteredKeys.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="p-8 text-center text-zinc-500">
                      No matching fields found {searchTerm ? `for "${searchTerm}"` : ''}.
                    </td>
                  </tr>
                ) : (
                  filteredKeys.map(key => {
                    const value = data[key];
                    const type = detectType(value);
                    const isEditing = editingKey === key;
                    const isExpanded = expandedKeys.has(key);
                    const isNewField = !(key in originalData);
                    const isModified = !isNewField && JSON.stringify(originalData[key]) !== JSON.stringify(value);

                    // Color code badge by type
                    const typeBadgeStyles: Record<FieldType, string> = {
                      string: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
                      number: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
                      boolean: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
                      array: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
                      object: 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20',
                      null: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
                      undefined: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
                    };

                    return (
                      <tr 
                        key={key} 
                        className={`hover:bg-zinc-50/50 dark:hover:bg-zinc-900/40 transition-colors ${
                          isModified ? 'bg-amber-500/5' : isNewField ? 'bg-emerald-500/5' : ''
                        }`}
                      >
                        {/* Combined Field Key & Type */}
                        <td className="py-2.5 px-3.5 align-top overflow-hidden">
                          <div className="flex flex-col gap-1.5 overflow-hidden">
                            {/* 1st row: Field Key & Badges */}
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-mono font-bold text-zinc-900 dark:text-zinc-100 text-[11px] break-all">
                                {key}
                              </span>
                              {key === 'uid' && (
                                <span className="text-[9px] px-1 py-0.2 rounded font-bold uppercase bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
                                  Primary
                                </span>
                              )}
                              {isNewField && (
                                <span className="text-[9px] px-1 py-0.2 rounded font-bold uppercase bg-emerald-500/20 text-emerald-500">
                                  New
                                </span>
                              )}
                              {isModified && (
                                <span className="text-[9px] px-1 py-0.2 rounded font-bold uppercase bg-amber-500/20 text-amber-500">
                                  Modified
                                </span>
                              )}
                            </div>

                            {/* 2nd row: Type Badge */}
                            <div>
                              <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border inline-block ${typeBadgeStyles[type]}`}>
                                {type}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Value Column */}
                        <td className="py-2 px-3 align-top overflow-hidden">
                          {isEditing ? (
                            <div className="space-y-1.5">
                              {type === 'boolean' ? (
                                <select
                                  value={editValueStr}
                                  onChange={(e) => setEditValueStr(e.target.value)}
                                  className="bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-emerald-500"
                                >
                                  <option value="true">true</option>
                                  <option value="false">false</option>
                                </select>
                              ) : type === 'array' || type === 'object' ? (
                                <textarea
                                  value={editValueStr}
                                  onChange={(e) => setEditValueStr(e.target.value)}
                                  className="w-full bg-zinc-900 text-zinc-100 font-mono text-xs p-2 rounded-lg border border-zinc-700 focus:outline-none focus:border-emerald-500 min-h-[120px] custom-scrollbar"
                                  rows={5}
                                />
                              ) : (
                                <input
                                  type={type === 'number' ? 'number' : 'text'}
                                  value={editValueStr}
                                  onChange={(e) => setEditValueStr(e.target.value)}
                                  className="w-full bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:border-emerald-500"
                                />
                              )}

                              {editTypeError && (
                                <div className="text-[10px] text-red-500 flex items-center gap-1">
                                  <AlertCircle className="w-3 h-3" />
                                  <span>{editTypeError}</span>
                                </div>
                              )}

                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={() => handleSaveFieldEdit(key)}
                                  className="px-2 py-0.5 rounded bg-emerald-500 text-white text-[11px] font-bold hover:bg-emerald-600 transition-colors flex items-center gap-1 cursor-pointer"
                                >
                                  <Check className="w-3 h-3" />
                                  Apply
                                </button>
                                <button
                                  onClick={handleCancelFieldEdit}
                                  className="px-2 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-[11px] hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div>
                              {type === 'boolean' ? (
                                <button
                                  onClick={() => handleToggleBoolean(key)}
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase border transition-transform active:scale-95 cursor-pointer ${
                                    value
                                      ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30'
                                      : 'bg-red-500/10 text-red-500 border-red-500/30'
                                  }`}
                                  title="Click to toggle boolean"
                                >
                                  {String(value)}
                                </button>
                              ) : type === 'array' ? (
                                <div>
                                  <button
                                    onClick={() => toggleExpand(key)}
                                    className="flex items-center gap-1 text-[11px] font-mono text-amber-600 dark:text-amber-400 hover:underline cursor-pointer"
                                  >
                                    {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                                    Array ({value.length} items)
                                  </button>
                                  {isExpanded && (
                                    <pre className="mt-1 p-2 bg-zinc-900 text-zinc-200 rounded-lg text-[10px] font-mono overflow-x-auto max-h-40 custom-scrollbar border border-zinc-800">
                                      {JSON.stringify(value, null, 2)}
                                    </pre>
                                  )}
                                </div>
                              ) : type === 'object' ? (
                                <div>
                                  <button
                                    onClick={() => toggleExpand(key)}
                                    className="flex items-center gap-1 text-[11px] font-mono text-cyan-600 dark:text-cyan-400 hover:underline cursor-pointer"
                                  >
                                    {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                                    Object ({Object.keys(value).length} keys)
                                  </button>
                                  {isExpanded && (
                                    <pre className="mt-1 p-2 bg-zinc-900 text-zinc-200 rounded-lg text-[10px] font-mono overflow-x-auto max-h-40 custom-scrollbar border border-zinc-800">
                                      {JSON.stringify(value, null, 2)}
                                    </pre>
                                  )}
                                </div>
                              ) : type === 'null' ? (
                                <span className="font-mono text-zinc-400 italic">null</span>
                              ) : (
                                <div className="text-zinc-800 dark:text-zinc-200 font-mono text-[11px] break-all max-h-24 overflow-y-auto custom-scrollbar">
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

                                {key !== 'uid' && (
                                  <>
                                    <button
                                      onClick={() => handleStartEdit(key)}
                                      className="p-1 text-zinc-400 hover:text-blue-500 rounded transition-colors cursor-pointer"
                                      title="Edit field value"
                                    >
                                      <Edit2 className="w-3.5 h-3.5" />
                                    </button>

                                    <button
                                      onClick={() => handleDeleteField(key)}
                                      className="p-1 text-zinc-400 hover:text-red-500 rounded transition-colors cursor-pointer"
                                      title="Delete field from Firestore"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </>
                                )}
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

      {/* Save / Changes Footer Bar */}
      <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2 text-xs">
          {changesCount > 0 ? (
            <span className="flex items-center gap-1.5 font-bold text-amber-500">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
              {changesCount} field{changesCount > 1 ? 's' : ''} modified or pending save
            </span>
          ) : (
            <span className="text-zinc-500 flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5 text-emerald-500" />
              All fields in sync with local data
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
            onClick={handleCommitAllChanges}
            loading={isProcessing}
            variant="emerald"
            className="text-xs py-2 px-4 font-bold h-auto shadow-md"
            icon={<Save className="w-4 h-4" />}
          >
            Save to Firestore & Cache
          </Button>
        </div>
      </div>
    </div>
  );
};

export default UserDataFieldsView;
