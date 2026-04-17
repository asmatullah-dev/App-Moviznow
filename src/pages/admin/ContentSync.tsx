import { useState, useEffect } from 'react';
import { Database, CheckCircle2, AlertCircle, Loader2, ShieldCheck, Save, ArrowUp, ArrowDown, ArrowLeftRight, Search, Key, RefreshCw } from 'lucide-react';
import { clsx } from 'clsx';
import { db as sourceDb } from '../../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

interface LogEntry {
  timestamp: string;
  message: string;
  type: 'info' | 'error' | 'success' | 'warn';
}

interface DiffItem {
  id: string;
  title?: string;
  name?: string;
  type: 'missing_in_target' | 'missing_in_source' | 'different';
  sourceData?: any;
  targetData?: any;
}

interface ComparisonResult {
  [collection: string]: DiffItem[];
}

export default function ContentSync() {
  const [sourceKey, setSourceKey] = useState<string>('');
  const [availableTargets, setAvailableTargets] = useState<{ id: string; title: string; databaseId: string; key?: string }[]>([]);
  const [selectedTargetId, setSelectedTargetId] = useState<string>('');
  const [syncStatus, setSyncStatus] = useState({
    sourceConnected: false,
    targetConnected: false,
    sourceKeyExists: false,
    targetKeyExists: false
  });
  const [isPushing, setIsPushing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const [isComparing, setIsComparing] = useState(false);
  const [syncMode, setSyncMode] = useState<'all' | 'changed' | 'missing'>('all');
  const [onlyPublished, setOnlyPublished] = useState(false);
  const [syncAllData, setSyncAllData] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showDiffs, setShowDiffs] = useState(false);
  const [viewingItem, setViewingItem] = useState<{ item: DiffItem; collection: string } | null>(null);
  const [selectedItems, setSelectedItems] = useState<Record<string, string[]>>({});
  const [showLogs, setShowLogs] = useState(false);

  const addLog = (message: string, type: LogEntry['type'] = 'info') => {
    const entry = { timestamp: new Date().toLocaleTimeString(), message, type };
    setLogs(prev => [entry, ...prev].slice(0, 50));
    console.log(`[SyncLog] ${message}`);
  };

  const checkStatus = async (targetId?: string, sk?: string, targs?: any[]) => {
    try {
      const id = targetId || selectedTargetId;
      const t = (targs || availableTargets).find(x => x.id === id);
      
      const res = await fetch('/api/sync/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          sourceKey: sk || sourceKey,
          targetKey: t?.key,
          targetDbId: t?.databaseId
        })
      });
      const data = await res.json();
      setSyncStatus(data);
      if (!data.sourceConnected || !data.targetConnected) {
        addLog("Service account keys missing or invalid for this target. Please configure them in Admin Settings.", 'warn');
      } else {
        addLog("Service account keys connected and ready.", 'success');
      }
    } catch (err: any) {
      addLog(`Error checking sync status: ${err.message}`, 'error');
    }
  };

  // Load targets on mount
  useEffect(() => {
    const loadTargets = async () => {
      addLog("Loading targets from cloud...");
      try {
        const settingsDoc = await getDoc(doc(sourceDb, 'admin_settings', 'app_settings'));
        if (settingsDoc.exists()) {
          const data = settingsDoc.data();
          const targets = data?.serviceAccounts?.targets || [];
          const sKey = data?.serviceAccounts?.sourceKey || '';
          setSourceKey(sKey);
          setAvailableTargets(targets);
          if (targets.length > 0) {
            setSelectedTargetId(targets[0].id);
            checkStatus(targets[0].id, sKey, targets);
          }
          addLog(`${targets.length} targets loaded.`, 'success');
        }
      } catch (err: any) {
        addLog(`Error loading targets: ${err.message}`, 'error');
      }
    };
    loadTargets();
  }, []);

  useEffect(() => {
    if (selectedTargetId) {
      checkStatus(selectedTargetId);
    }
  }, [selectedTargetId]);

  const handleCopyLogs = () => {
    const logText = logs.map(l => `[${l.timestamp}] ${l.type.toUpperCase()}: ${l.message}`).join('\n');
    navigator.clipboard.writeText(logText);
    addLog("Logs copied to clipboard!", 'success');
  };

  const handleCompare = async () => {
    if (!selectedTargetId) {
      setError("Please select a target database first.");
      return;
    }
    const t = availableTargets.find(x => x.id === selectedTargetId);
    if (!sourceKey || !t?.key) {
      setError("Missing Service Account Keys. Please check Admin Settings.");
      return;
    }

    setIsComparing(true);
    setError(null);
    addLog(`Running comparison with target ${selectedTargetId}...`);
    try {
      const res = await fetch('/api/sync/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          sourceKey,
          targetKey: t.key,
          targetDbId: t.databaseId,
          onlyPublished,
          syncAllData
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Comparison failed');
      }

      const results = await res.json();
      setComparison(results);
      addLog("Comparison finished successfully.", 'success');
    } catch (err: any) {
      addLog(`Comparison error: ${err.message}`, 'error');
      setError("Failed to compare accounts: " + err.message);
    } finally {
      setIsComparing(false);
    }
  };

  const handleStartSync = async (specificIds?: Record<string, string[]>) => {
    if (!selectedTargetId) return;
    const t = availableTargets.find(x => x.id === selectedTargetId);
    
    setIsPushing(true);
    setError(null);
    addLog(`Starting ${specificIds ? 'granular' : (syncMode === 'all' ? 'full' : (syncMode === 'changed' ? 'smart' : 'missing-only'))} push to target...`);
    try {
      const res = await fetch('/api/sync/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          sourceKey,
          targetKey: t?.key,
          targetDbId: t?.databaseId,
          mode: syncMode,
          specificIds,
          onlyPublished,
          syncAllData
        })
      });
      console.log("Push response status:", res.status);

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Push failed');
      }

      const data = await res.json();
      data.logs.forEach((log: string) => addLog(log, 'success'));
      addLog(specificIds ? "Selected items pushed successfully." : "Full push finished successfully.", 'success');
      if (specificIds) setSelectedItems({});
      handleCompare();
    } catch (err: any) {
      addLog(`Push failed: ${err.message}`, 'error');
      setError("Sync failed.");
    } finally {
      setIsPushing(false);
    }
  };

  const handleStartPull = async (specificIds?: Record<string, string[]>) => {
    if (!selectedTargetId) return;
    const t = availableTargets.find(x => x.id === selectedTargetId);

    setIsPulling(true);
    setError(null);
    addLog(`Starting ${specificIds ? 'granular' : (syncMode === 'missing' ? 'missing-only' : 'full')} pull from target...`);
    try {
      const res = await fetch('/api/sync/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          sourceKey,
          targetKey: t?.key,
          targetDbId: t?.databaseId,
          specificIds,
          mode: syncMode,
          onlyPublished,
          syncAllData
        })
      });
      console.log("Pull response status:", res.status);

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Pull failed');
      }

      const data = await res.json();
      data.logs.forEach((log: string) => addLog(log, 'success'));
      addLog(specificIds ? "Selected items pulled successfully." : "Full pull finished successfully.", 'success');
      if (specificIds) setSelectedItems({});
      handleCompare();
    } catch (err: any) {
      addLog(`Pull failed: ${err.message}`, 'error');
      setError("Pull failed.");
    } finally {
      setIsPulling(false);
    }
  };

  const toggleSelectItem = (collection: string, id: string) => {
    setSelectedItems(prev => {
      const current = prev[collection] || [];
      if (current.includes(id)) {
        return { ...prev, [collection]: current.filter(i => i !== id) };
      } else {
        return { ...prev, [collection]: [...current, id] };
      }
    });
  };

  const hasSelectedItems = Object.values(selectedItems).some(ids => ids.length > 0);

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-zinc-900 dark:text-white">Service Account Sync</h2>
          <p className="text-zinc-500 dark:text-zinc-400 mt-1">Sync movies and metadata using Service Account keys for maximum reliability.</p>
        </div>
        <div className="p-3 bg-emerald-500/10 rounded-2xl">
          <Key className="w-8 h-8 text-emerald-500" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-zinc-900 p-8 rounded-3xl border border-zinc-200 dark:border-zinc-800 space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h4 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-500" />
                Connection Status
              </h4>
              <p className="text-xs text-zinc-500">Service account connection status.</p>
            </div>
            <button 
              onClick={() => checkStatus()}
              className="p-2 text-zinc-400 hover:text-emerald-500 transition-colors"
              title="Refresh Status"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className={clsx(
              "p-4 rounded-2xl border flex flex-col items-center gap-2 transition-all",
              syncStatus?.sourceConnected 
                ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-600" 
                : "bg-red-500/5 border-red-500/20 text-red-600"
            )}>
              <div className={clsx(
                "w-3 h-3 rounded-full",
                syncStatus?.sourceConnected ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-red-500"
              )} />
              <span className="text-xs font-bold uppercase tracking-wider">Source DB</span>
              <span className="text-[10px] opacity-70">{syncStatus?.sourceConnected ? 'Connected' : 'Disconnected'}</span>
            </div>

            <div className={clsx(
              "p-4 rounded-2xl border flex flex-col items-center gap-2 transition-all",
              syncStatus?.targetConnected 
                ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-600" 
                : "bg-red-500/5 border-red-500/20 text-red-600"
            )}>
              <div className={clsx(
                "w-3 h-3 rounded-full",
                syncStatus?.targetConnected ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-red-500"
              )} />
              <span className="text-xs font-bold uppercase tracking-wider">Target DB</span>
              <span className="text-[10px] opacity-70">{syncStatus?.targetConnected ? 'Connected' : 'Disconnected'}</span>
            </div>
          </div>
          
          {!syncStatus?.sourceConnected || !syncStatus?.targetConnected ? (
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-3">
              <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-[10px] text-amber-600 leading-relaxed">
                One or more service accounts are not connected. Please ensure keys are uploaded to the server or configured in <strong>Admin Settings</strong>.
              </p>
            </div>
          ) : (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-start gap-3">
              <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
              <p className="text-[10px] text-emerald-600 leading-relaxed">
                Both service accounts are connected and ready for synchronization.
              </p>
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-zinc-900 p-8 rounded-3xl border border-zinc-200 dark:border-zinc-800 space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h4 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                <Database className="w-5 h-5 text-emerald-500" />
                Target Selection
              </h4>
              <p className="text-xs text-zinc-500">Select the target database for synchronization.</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">
                {availableTargets.length} Targets Available
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-1">Select Target Account</label>
              <select
                value={selectedTargetId}
                onChange={e => setSelectedTargetId(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus:ring-2 focus:ring-emerald-500 outline-none transition-all text-sm"
              >
                <option value="" disabled>Select a target...</option>
                {availableTargets.map(target => (
                  <option key={target.id} value={target.id}>
                    {target.title || 'Untitled Target'} ({target.databaseId || '(default)'})
                  </option>
                ))}
              </select>
              {availableTargets.length === 0 && (
                <p className="text-[10px] text-amber-500 ml-1 italic">No targets configured. Go to Admin Settings to add one.</p>
              )}
            </div>
          </div>
        </div>
      </div>

        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-3 text-red-600 dark:text-red-400">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        <div className="space-y-6">
        <div className="bg-zinc-900 rounded-3xl border border-zinc-800 overflow-hidden shadow-2xl">
          <div className="px-6 py-4 bg-zinc-800/50 border-b border-zinc-700 flex items-center justify-between">
            <button 
              onClick={() => setShowLogs(!showLogs)}
              className="flex items-center gap-2 text-zinc-400 font-mono text-xs uppercase tracking-widest hover:text-white transition-colors"
            >
              <div className={clsx("w-2 h-2 rounded-full animate-pulse", showLogs ? "bg-emerald-500" : "bg-zinc-600")} />
              Sync Debug Console {showLogs ? '(Hide)' : '(Show)'}
            </button>
            <div className="flex items-center gap-3">
              {showLogs && (
                <>
                  <button 
                    onClick={handleCopyLogs}
                    className="text-[10px] text-zinc-500 hover:text-white uppercase font-bold tracking-tighter"
                  >
                    Copy Logs
                  </button>
                  <button 
                    onClick={() => setLogs([])}
                    className="text-[10px] text-zinc-500 hover:text-white uppercase font-bold tracking-tighter"
                  >
                    Clear Logs
                  </button>
                </>
              )}
            </div>
          </div>
          {showLogs && (
            <div className="h-48 overflow-y-auto p-4 font-mono text-[11px] space-y-1 bg-black/40">
              {logs.length === 0 ? (
                <div className="text-zinc-600 italic">Waiting for activity...</div>
              ) : logs.map((log, i) => (
                <div key={i} className="flex gap-3 border-b border-zinc-800/50 pb-1">
                  <span className="text-zinc-600 shrink-0">{log.timestamp}</span>
                  <span className={clsx(
                    "break-all",
                    log.type === 'error' ? "text-red-400" :
                    log.type === 'success' ? "text-emerald-400" :
                    log.type === 'warn' ? "text-amber-400" :
                    "text-zinc-300"
                  )}>
                    {log.message}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="bg-white dark:bg-zinc-900 p-8 rounded-3xl border border-zinc-200 dark:border-zinc-800 space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h4 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                <ArrowLeftRight className="w-5 h-5 text-emerald-500" />
                Manual Sync & Comparison
              </h4>
              <p className="text-xs text-zinc-500">Compare data between accounts and choose your action.</p>
            </div>
            <button
              onClick={handleCompare}
              disabled={isComparing || isPushing || isPulling}
              className="flex items-center gap-2 px-6 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-emerald-500/20"
            >
              {isComparing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              {comparison ? 'Refresh' : 'Run Comparison'}
            </button>
          </div>

          {isComparing ? (
            <div className="flex flex-col items-center justify-center py-12 text-zinc-400">
              <Loader2 className="w-12 h-12 mb-4 animate-spin text-emerald-500" />
              <p>Analyzing differences between accounts...</p>
            </div>
          ) : comparison ? (
            <div className="flex flex-wrap gap-x-8 gap-y-2 py-2">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-zinc-500 font-medium">Missing in Target</span>
                <span className="font-bold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full">
                  {Object.values(comparison).reduce((acc: number, curr: any) => acc + (Array.isArray(curr) ? curr.filter((d: any) => d.type === 'missing_in_target').length : 0), 0)}
                </span>
              </div>

              <div className="flex items-center gap-2 text-sm">
                <span className="text-zinc-500 font-medium">Missing in Source</span>
                <span className="font-bold text-blue-500 bg-blue-500/10 px-2 py-0.5 rounded-full">
                  {Object.values(comparison).reduce((acc: number, curr: any) => acc + (Array.isArray(curr) ? curr.filter((d: any) => d.type === 'missing_in_source').length : 0), 0)}
                </span>
              </div>

              <div className="flex items-center gap-2 text-sm">
                <span className="text-zinc-500 font-medium">Different Version</span>
                <span className="font-bold text-purple-500 bg-purple-500/10 px-2 py-0.5 rounded-full">
                  {Object.values(comparison).reduce((acc: number, curr: any) => acc + (Array.isArray(curr) ? curr.filter((d: any) => d.type === 'different').length : 0), 0)}
                </span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-zinc-400">
              <Search className="w-12 h-12 mb-4 opacity-20" />
              <p>Run comparison to see differences between accounts.</p>
            </div>
          )}

          {comparison && (
            <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800">
              <button
                onClick={() => setShowDiffs(!showDiffs)}
                className="text-sm font-bold text-emerald-500 hover:text-emerald-600 flex items-center gap-2"
              >
                {showDiffs ? 'Hide Detailed Differences' : 'View Detailed Differences'}
                <ArrowDown className={clsx("w-4 h-4 transition-transform", showDiffs && "rotate-180")} />
              </button>

              {showDiffs && (
                <div className="mt-4 space-y-4 max-h-[500px] overflow-y-auto pr-2">
                  {hasSelectedItems && (
                    <div className="sticky top-0 z-10 flex gap-2 p-2 bg-zinc-100 dark:bg-zinc-800 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-700 mb-4">
                      <button
                        onClick={() => handleStartSync(selectedItems)}
                        disabled={isPushing || isPulling}
                        className="flex-1 py-2 bg-emerald-500 text-white text-xs font-bold rounded-lg hover:bg-emerald-600 transition-colors flex items-center justify-center gap-2"
                      >
                        <ArrowUp className="w-3 h-3" />
                        Push Selected
                      </button>
                      <button
                        onClick={() => handleStartPull(selectedItems)}
                        disabled={isPushing || isPulling}
                        className="flex-1 py-2 bg-zinc-900 dark:bg-zinc-700 text-white text-xs font-bold rounded-lg hover:bg-black transition-colors flex items-center justify-center gap-2"
                      >
                        <ArrowDown className="w-3 h-3" />
                        Pull Selected
                      </button>
                      <button
                        onClick={() => setSelectedItems({})}
                        className="px-3 py-2 text-zinc-500 hover:text-red-500 text-xs font-bold"
                      >
                        Clear
                      </button>
                    </div>
                  )}

                  {Object.entries(comparison).map(([col, items]) => (
                    items.length > 0 && (
                      <div key={col} className="space-y-2">
                        <h5 className="text-xs font-bold uppercase text-zinc-400 tracking-widest">{col}</h5>
                        <div className="grid gap-2">
                          {items.map((item, idx) => (
                            <div key={idx} className="group flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-100 dark:border-zinc-800 hover:border-emerald-500/30 transition-all">
                              <div className="flex items-center gap-3">
                                <input 
                                  type="checkbox"
                                  checked={(selectedItems[col] || []).includes(item.id)}
                                  onChange={() => toggleSelectItem(col, item.id)}
                                  className="w-4 h-4 rounded border-zinc-300 text-emerald-500 focus:ring-emerald-500"
                                />
                                <div className={clsx(
                                  "w-2 h-2 rounded-full shrink-0",
                                  item.type === 'missing_in_target' ? "bg-amber-500" :
                                  item.type === 'missing_in_source' ? "bg-blue-500" :
                                  "bg-purple-500"
                                )} />
                                <div className="flex flex-col">
                                  <span className="text-sm font-medium">{item.title || item.id}</span>
                                  <span className="text-[10px] text-zinc-500 font-mono">{item.id}</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => setViewingItem({ item, collection: col })}
                                  className="p-2 text-zinc-400 hover:text-emerald-500 hover:bg-emerald-500/10 rounded-lg transition-all"
                                  title="Compare Details"
                                >
                                  <ArrowLeftRight className="w-4 h-4" />
                                </button>
                                <span className="text-[10px] font-bold uppercase px-2 py-1 rounded-md bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700">
                                  {item.type.replace(/_/g, ' ')}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

          <div className="bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-zinc-200 dark:border-zinc-800 space-y-6">
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-zinc-900 dark:text-white font-bold">
                <RefreshCw className="w-5 h-5 text-emerald-500" />
                Sync Options
              </div>
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setSyncMode('all')}
                    className={clsx(
                      "px-4 py-2 rounded-xl border-2 transition-all text-xs font-bold",
                      syncMode === 'all' 
                        ? "border-emerald-500 bg-emerald-500 text-white" 
                        : "border-zinc-100 dark:border-zinc-800 text-zinc-500 hover:border-zinc-200 dark:hover:border-zinc-700"
                    )}
                  >
                    Full Sync
                  </button>
                  <button
                    onClick={() => setSyncMode('changed')}
                    className={clsx(
                      "px-4 py-2 rounded-xl border-2 transition-all text-xs font-bold",
                      syncMode === 'changed' 
                        ? "border-emerald-500 bg-emerald-500 text-white" 
                        : "border-zinc-100 dark:border-zinc-800 text-zinc-500 hover:border-zinc-200 dark:hover:border-zinc-700"
                    )}
                  >
                    Smart Sync
                  </button>
                  <button
                    onClick={() => setSyncMode('missing')}
                    className={clsx(
                      "px-4 py-2 rounded-xl border-2 transition-all text-xs font-bold",
                      syncMode === 'missing' 
                        ? "border-emerald-500 bg-emerald-500 text-white" 
                        : "border-zinc-100 dark:border-zinc-800 text-zinc-500 hover:border-zinc-200 dark:hover:border-zinc-700"
                    )}
                  >
                    Missing Only
                  </button>
                </div>
                
                <label className="flex items-center gap-3 p-3 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-xl cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors w-fit">
                  <input
                    type="checkbox"
                    checked={onlyPublished}
                    onChange={(e) => setOnlyPublished(e.target.checked)}
                    className="w-4 h-4 rounded border-zinc-300 text-emerald-500 focus:ring-emerald-500"
                  />
                  <span className="text-sm font-bold text-zinc-700 dark:text-zinc-300">Target Published Content Only</span>
                </label>

                <label className="flex items-center gap-3 p-3 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/30 rounded-xl cursor-pointer hover:bg-red-100 dark:hover:bg-red-900/20 transition-colors w-fit">
                  <input
                    type="checkbox"
                    checked={syncAllData}
                    onChange={(e) => setSyncAllData(e.target.checked)}
                    className="w-4 h-4 rounded border-red-300 text-red-500 focus:ring-red-500"
                  />
                  <span className="text-sm font-bold text-red-700 dark:text-red-400">Include All App Data (Users, Settings, Orders, etc.)</span>
                </label>
              </div>
            </div>

            <div className="space-y-4 pt-6 border-t border-zinc-100 dark:border-zinc-800">
              <div className="flex items-center gap-2 text-zinc-900 dark:text-white font-bold">
                <ArrowLeftRight className="w-5 h-5 text-emerald-500" />
                Manual Sync Actions
              </div>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => handleStartSync()}
                  disabled={isPushing || isPulling || isComparing}
                  className="py-3 bg-emerald-500 hover:bg-emerald-600 disabled:bg-zinc-300 dark:disabled:bg-zinc-800 text-white font-bold rounded-2xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 text-sm"
                >
                  {isPushing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUp className="w-4 h-4" />}
                  {isPushing ? 'Pushing...' : 'Push'}
                </button>

                <button
                  onClick={() => handleStartPull()}
                  disabled={isPushing || isPulling || isComparing}
                  className="py-3 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 disabled:bg-zinc-100 dark:disabled:bg-zinc-900 text-zinc-900 dark:text-white font-bold rounded-2xl transition-all flex items-center justify-center gap-2 border-2 border-zinc-200 dark:border-zinc-700 shadow-sm text-sm"
                >
                  {isPulling ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowDown className="w-4 h-4" />}
                  {isPulling ? 'Pulling...' : 'Pull'}
                </button>
              </div>
            </div>
          </div>
        </div>

      {/* Comparison Modal */}
      {viewingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-zinc-900 rounded-3xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border border-zinc-200 dark:border-zinc-800">
            <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-800/50">
              <div>
                <h3 className="text-xl font-bold flex items-center gap-2">
                  <ArrowLeftRight className="w-6 h-6 text-emerald-500" />
                  Compare: {viewingItem.item.title || viewingItem.item.id}
                </h3>
                <p className="text-sm text-zinc-500">Collection: {viewingItem.collection} | ID: {viewingItem.item.id}</p>
              </div>
              <button 
                onClick={() => setViewingItem(null)}
                className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-full transition-colors"
              >
                <AlertCircle className="w-6 h-6 rotate-45" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between px-4 py-2 bg-emerald-500/10 text-emerald-600 rounded-xl font-bold text-sm">
                  <span>Source (This App)</span>
                  <ArrowUp className="w-4 h-4" />
                </div>
                <pre className="p-4 bg-zinc-50 dark:bg-zinc-950 rounded-2xl border border-zinc-200 dark:border-zinc-800 font-mono text-xs overflow-x-auto h-[400px]">
                  {viewingItem.item.sourceData ? JSON.stringify(viewingItem.item.sourceData, null, 2) : '// No data in source'}
                </pre>
                <button
                  onClick={() => {
                    handleStartSync({ [viewingItem.collection]: [viewingItem.item.id] });
                    setViewingItem(null);
                  }}
                  disabled={!viewingItem.item.sourceData || isPushing || isPulling}
                  className="w-full py-3 bg-emerald-500 text-white font-bold rounded-xl hover:bg-emerald-600 transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20"
                >
                  <ArrowUp className="w-4 h-4" />
                  Push This Version
                </button>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between px-4 py-2 bg-zinc-900 dark:bg-zinc-800 text-white rounded-xl font-bold text-sm">
                  <span>Target (Remote)</span>
                  <ArrowDown className="w-4 h-4" />
                </div>
                <pre className="p-4 bg-zinc-50 dark:bg-zinc-950 rounded-2xl border border-zinc-200 dark:border-zinc-800 font-mono text-xs overflow-x-auto h-[400px]">
                  {viewingItem.item.targetData ? JSON.stringify(viewingItem.item.targetData, null, 2) : '// No data in target'}
                </pre>
                <button
                  onClick={() => {
                    handleStartPull({ [viewingItem.collection]: [viewingItem.item.id] });
                    setViewingItem(null);
                  }}
                  disabled={!viewingItem.item.targetData || isPushing || isPulling}
                  className="w-full py-3 bg-zinc-900 dark:bg-zinc-700 text-white font-bold rounded-xl hover:bg-black transition-all flex items-center justify-center gap-2 shadow-lg"
                >
                  <ArrowDown className="w-4 h-4" />
                  Pull This Version
                </button>
              </div>
            </div>
            
            <div className="p-4 bg-zinc-50 dark:bg-zinc-800/50 border-t border-zinc-100 dark:border-zinc-800 flex justify-end">
              <button 
                onClick={() => setViewingItem(null)}
                className="px-6 py-2 text-zinc-500 font-bold hover:text-zinc-900 dark:hover:text-white transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


