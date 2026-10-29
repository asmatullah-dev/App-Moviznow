import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  UserPlus,
  ArrowRight,
  Search,
  Users,
  ShieldCheck,
  Phone,
  Zap,
  Filter,
  Check,
  AlertCircle
} from 'lucide-react';
import clsx from 'clsx';
import { Button } from './Button';
import { UserProfile } from '../types';
import {
  ContactComparisonItem,
  ContactsComparisonReport,
  compareUsersWithGoogleContacts,
  batchSyncUsersContacts,
  syncSingleUserContact,
  GoogleContactPerson,
  fetchAllGoogleContacts,
  ensureValidContactsToken,
  connectGoogleContacts
} from '../services/googleContactsService';
import { modalBackdropAnimation, modalContainerAnimation } from '../utils/modalAnimations';

interface GoogleContactsCompareModalProps {
  isOpen: boolean;
  onClose: () => void;
  users: UserProfile[];
  accountEmail?: string | null;
  onSyncCompleted?: (result: { synced: number; created: number; updated: number }) => void;
}

export function GoogleContactsCompareModal({
  isOpen,
  onClose,
  users,
  accountEmail = 'wmoviznow@gmail.com',
  onSyncCompleted
}: GoogleContactsCompareModalProps) {
  const [loading, setLoading] = useState(false);
  const [syncingAll, setSyncingAll] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{ current: number; total: number } | null>(null);
  const [report, setReport] = useState<ContactsComparisonReport | null>(null);
  const [activeTab, setActiveTab] = useState<'attention' | 'mismatches' | 'missing' | 'synced' | 'all'>('attention');
  const [searchTerm, setSearchTerm] = useState('');
  const [syncingUid, setSyncingUid] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Cached connections across modal lifetime
  const [cachedConnections, setCachedConnections] = useState<GoogleContactPerson[] | undefined>(undefined);

  const runComparison = async (freshToken?: string) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      let token = freshToken;
      if (!token) {
        const tokenState = await ensureValidContactsToken(false);
        token = tokenState.accessToken || undefined;
      }

      if (!token) {
        throw new Error('Google Contacts authorization required. Please connect account first.');
      }

      // Fetch all Google connections
      const connections = await fetchAllGoogleContacts(token);
      setCachedConnections(connections);

      // Run comparison
      const compReport = await compareUsersWithGoogleContacts(users, token, connections);
      setReport(compReport);
    } catch (err: any) {
      console.error('Error running contacts comparison:', err);
      setErrorMsg(err?.message || 'Failed to compare contacts with Google Contacts.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      runComparison();
    } else {
      setReport(null);
      setErrorMsg(null);
      setSuccessToast(null);
    }
  }, [isOpen]);

  // Filtered list based on active tab and search
  const displayedItems = useMemo(() => {
    if (!report) return [];

    let pool: ContactComparisonItem[] = [];
    if (activeTab === 'attention') {
      pool = [...report.mismatches, ...report.missing];
    } else if (activeTab === 'mismatches') {
      pool = report.mismatches;
    } else if (activeTab === 'missing') {
      pool = report.missing;
    } else if (activeTab === 'synced') {
      pool = report.synced;
    } else {
      pool = [...report.mismatches, ...report.missing, ...report.synced];
    }

    if (!searchTerm.trim()) return pool;

    const term = searchTerm.toLowerCase().trim();
    return pool.filter(item => {
      const name = (item.user.displayName || '').toLowerCase();
      const phone = (item.phone || '').toLowerCase();
      const current = item.currentGoogleName.toLowerCase();
      const target = item.expectedTargetName.toLowerCase();
      const reason = item.changeReason.toLowerCase();
      return name.includes(term) || phone.includes(term) || current.includes(term) || target.includes(term) || reason.includes(term);
    });
  }, [report, activeTab, searchTerm]);

  // Execute Batch Sync on All Mismatched & Missing contacts
  const handleAutoSyncAllMismatched = async () => {
    if (!report) return;
    const itemsToSync = [...report.mismatches, ...report.missing];
    if (itemsToSync.length === 0) return;

    setSyncingAll(true);
    setSyncProgress({ current: 0, total: itemsToSync.length });
    setErrorMsg(null);

    try {
      const tokenState = await ensureValidContactsToken(true);
      const token = tokenState.accessToken;
      if (!token) {
        throw new Error('Google Contacts authorization required to sync.');
      }

      const usersToSync = itemsToSync.map(i => i.user);
      const res = await batchSyncUsersContacts(
        usersToSync,
        token,
        (current, total) => {
          setSyncProgress({ current, total });
        },
        cachedConnections
      );

      setSuccessToast(`Successfully synced ${res.synced} contact(s) via batch! Created: ${res.created}, Updated: ${res.updated}.`);

      if (onSyncCompleted) {
        onSyncCompleted({
          synced: res.synced,
          created: res.created,
          updated: res.updated
        });
      }

      // Re-run comparison to refresh the UI with fresh state
      await runComparison(token);
    } catch (err: any) {
      console.error('Batch sync error:', err);
      setErrorMsg(err?.message || 'Failed to auto-sync mismatched contacts.');
    } finally {
      setSyncingAll(false);
      setSyncProgress(null);
    }
  };

  // Sync a single contact row
  const handleSyncSingle = async (item: ContactComparisonItem) => {
    setSyncingUid(item.user.uid);
    try {
      const tokenState = await ensureValidContactsToken(true);
      const token = tokenState.accessToken;
      if (!token) throw new Error('Authorization required');

      const res = await syncSingleUserContact(item.user, token, cachedConnections);
      if (res.success) {
        setSuccessToast(`Synced "${res.contactName}" successfully!`);
        // Fast local update of report
        if (report) {
          const updatedMismatches = report.mismatches.filter(m => m.user.uid !== item.user.uid);
          const updatedMissing = report.missing.filter(m => m.user.uid !== item.user.uid);
          const updatedSynced = [
            ...report.synced.filter(s => s.user.uid !== item.user.uid),
            {
              ...item,
              status: 'synced' as const,
              currentGoogleName: res.contactName,
              changeReason: 'Synced & correctly formatted'
            }
          ];
          setReport({
            totalChecked: report.totalChecked,
            mismatches: updatedMismatches,
            missing: updatedMissing,
            synced: updatedSynced
          });
        }
      } else {
        setErrorMsg(res.error || 'Failed to sync contact');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Sync failed');
    } finally {
      setSyncingUid(null);
    }
  };

  if (!isOpen) return null;

  const attentionCount = (report?.mismatches.length || 0) + (report?.missing.length || 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      {/* Backdrop */}
      <motion.div
        {...modalBackdropAnimation}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal Dialog */}
      <motion.div
        {...modalContainerAnimation}
        className="relative w-full max-w-5xl max-h-[92vh] flex flex-col bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-2xl overflow-hidden z-10"
      >
        {/* Top Header */}
        <div className="flex items-center justify-between p-5 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                  Google Contacts Format Comparator & Auto-Sync
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                  Batch Sync
                </span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                Compares phone number formats and role prefixes (e.g., AT ➔ AV replacements) against Google Contacts for {accountEmail}.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Success / Error Alerts */}
        {successToast && (
          <div className="mx-5 mt-4 p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between text-xs text-emerald-700 dark:text-emerald-300">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 shrink-0" />
              <span>{successToast}</span>
            </div>
            <button onClick={() => setSuccessToast(null)} className="p-1 hover:opacity-75">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {errorMsg && (
          <div className="mx-5 mt-4 p-3 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-between text-xs text-red-700 dark:text-red-300">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <button onClick={() => setErrorMsg(null)} className="p-1 hover:opacity-75">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Sync Progress Banner */}
        {syncingAll && syncProgress && (
          <div className="mx-5 mt-4 p-4 rounded-2xl bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-500/20">
            <div className="flex items-center justify-between text-xs font-semibold text-indigo-700 dark:text-indigo-300 mb-2">
              <div className="flex items-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-indigo-500" />
                <span>Executing Batch Sync to Google Contacts...</span>
              </div>
              <span>{syncProgress.current} / {syncProgress.total}</span>
            </div>
            <div className="w-full bg-indigo-100 dark:bg-indigo-900/50 rounded-full h-2 overflow-hidden">
              <div
                className="bg-indigo-600 dark:bg-indigo-400 h-full rounded-full transition-all duration-300"
                style={{
                  width: `${syncProgress.total > 0 ? (syncProgress.current / syncProgress.total) * 100 : 0}%`
                }}
              />
            </div>
          </div>
        )}

        {/* Summary Metric KPI Cards */}
        <div className="p-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800">
            <div className="text-zinc-500 dark:text-zinc-400 text-xs font-medium">Total Users Checked</div>
            <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-1">
              {loading ? '...' : (report?.totalChecked ?? 0)}
            </div>
            <div className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">With phone or email</div>
          </div>

          <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20">
            <div className="text-amber-700 dark:text-amber-400 text-xs font-medium flex items-center justify-between">
              <span>Format Mismatch</span>
              <AlertTriangle className="w-3.5 h-3.5" />
            </div>
            <div className="text-2xl font-bold text-amber-700 dark:text-amber-300 mt-1">
              {loading ? '...' : (report?.mismatches.length ?? 0)}
            </div>
            <div className="text-[11px] text-amber-600/80 dark:text-amber-400/80 mt-0.5">Needs replacement (e.g. AT ➔ AV)</div>
          </div>

          <div className="p-3.5 rounded-2xl bg-purple-500/10 border border-purple-500/20">
            <div className="text-purple-700 dark:text-purple-400 text-xs font-medium flex items-center justify-between">
              <span>Missing from Contacts</span>
              <UserPlus className="w-3.5 h-3.5" />
            </div>
            <div className="text-2xl font-bold text-purple-700 dark:text-purple-300 mt-1">
              {loading ? '...' : (report?.missing.length ?? 0)}
            </div>
            <div className="text-[11px] text-purple-600/80 dark:text-purple-400/80 mt-0.5">Not yet created in Google</div>
          </div>

          <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
            <div className="text-emerald-700 dark:text-emerald-400 text-xs font-medium flex items-center justify-between">
              <span>Synced & Correct</span>
              <CheckCircle className="w-3.5 h-3.5" />
            </div>
            <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-300 mt-1">
              {loading ? '...' : (report?.synced.length ?? 0)}
            </div>
            <div className="text-[11px] text-emerald-600/80 dark:text-emerald-400/80 mt-0.5">Accurate prefix & format</div>
          </div>
        </div>

        {/* Action Bar & Controls */}
        <div className="px-5 py-3 border-y border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Filter Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
            <button
              onClick={() => setActiveTab('attention')}
              className={clsx(
                "px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5",
                activeTab === 'attention'
                  ? "bg-amber-500 text-white shadow-sm"
                  : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
              )}
            >
              <span>Needs Attention</span>
              <span className={clsx(
                "px-1.5 py-0.2 rounded-full text-[10px] font-bold",
                activeTab === 'attention' ? "bg-white/20 text-white" : "bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300"
              )}>
                {attentionCount}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('mismatches')}
              className={clsx(
                "px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5",
                activeTab === 'mismatches'
                  ? "bg-amber-600 text-white shadow-sm"
                  : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
              )}
            >
              <span>Format Mismatch</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300">
                {report?.mismatches.length ?? 0}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('missing')}
              className={clsx(
                "px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5",
                activeTab === 'missing'
                  ? "bg-purple-600 text-white shadow-sm"
                  : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
              )}
            >
              <span>Missing</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300">
                {report?.missing.length ?? 0}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('synced')}
              className={clsx(
                "px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5",
                activeTab === 'synced'
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
              )}
            >
              <span>Synced</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300">
                {report?.synced.length ?? 0}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('all')}
              className={clsx(
                "px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer",
                activeTab === 'all'
                  ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-sm"
                  : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
              )}
            >
              All ({report?.totalChecked ?? 0})
            </button>
          </div>

          {/* Primary Batch Action and Refresh */}
          <div className="flex items-center gap-2 shrink-0">
            <Button
              onClick={() => runComparison()}
              variant="secondary"
              className="px-3 py-1.5 text-xs"
              loading={loading}
              icon={<RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />}
            >
              Re-Scan
            </Button>

            <Button
              onClick={handleAutoSyncAllMismatched}
              variant="emerald"
              className="px-4 py-1.5 text-xs font-semibold shadow-sm"
              disabled={loading || syncingAll || attentionCount === 0}
              loading={syncingAll}
              icon={<Zap className="w-3.5 h-3.5" />}
            >
              Auto-Sync Mismatched ({attentionCount})
            </Button>
          </div>
        </div>

        {/* Search within Modal */}
        <div className="px-5 pt-3 pb-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input
              type="text"
              placeholder="Filter by user name, phone, prefix, or reason..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-9 pr-4 py-1.5 text-xs focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        {/* Main Content Area / List */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2.5 min-h-[280px]">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-zinc-500">
              <RefreshCw className="w-8 h-8 animate-spin text-indigo-500" />
              <p className="text-sm font-medium">Fetching Google Contacts and comparing formats...</p>
            </div>
          ) : displayedItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <CheckCircle className="w-12 h-12 text-emerald-500 mb-2" />
              <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                {activeTab === 'attention' ? 'All Contacts Synced & Formatted!' : 'No Contacts Match This Filter'}
              </h3>
              <p className="text-xs text-zinc-500 max-w-sm mt-1">
                {activeTab === 'attention'
                  ? 'All user phone numbers and role prefixes match the saved formats in Google Contacts perfectly.'
                  : 'Try selecting a different filter tab or clearing your search filter.'}
              </p>
            </div>
          ) : (
            displayedItems.map(item => {
              const isSyncingThis = syncingUid === item.user.uid;
              const isMismatch = item.status === 'mismatch';
              const isMissing = item.status === 'missing';
              const isSynced = item.status === 'synced';

              return (
                <div
                  key={item.user.uid}
                  className={clsx(
                    "p-3.5 rounded-2xl border transition-all flex flex-col md:flex-row md:items-center justify-between gap-3",
                    isMismatch
                      ? "bg-amber-50/40 dark:bg-amber-950/15 border-amber-500/25 hover:border-amber-500/40"
                      : isMissing
                        ? "bg-purple-50/40 dark:bg-purple-950/15 border-purple-500/25 hover:border-purple-500/40"
                        : "bg-zinc-50/40 dark:bg-zinc-800/20 border-zinc-200 dark:border-zinc-800"
                  )}
                >
                  {/* Left Column: User Profile Info */}
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-100 truncate">
                        {item.user.displayName || item.user.email || 'Unnamed User'}
                      </span>

                      {/* Role Badge */}
                      <span className={clsx(
                        "px-2 py-0.5 rounded-md text-[10px] font-bold uppercase",
                        item.user.role === 'vip' ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20" :
                        item.user.role === 'basic' ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20" :
                        item.user.role === 'trial' ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20" :
                        "bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300"
                      )}>
                        {item.user.role}
                      </span>

                      {/* Status Badge */}
                      <span className={clsx(
                        "px-1.5 py-0.5 rounded text-[10px] font-medium capitalize",
                        item.user.status === 'active' ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10" :
                        item.user.status === 'expired' ? "text-red-600 dark:text-red-400 bg-red-500/10" :
                        "text-amber-600 dark:text-amber-400 bg-amber-500/10"
                      )}>
                        {item.user.status || 'pending'}
                      </span>

                      {/* Phone */}
                      {item.phone && (
                        <span className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400 font-mono">
                          <Phone className="w-3 h-3 text-zinc-400" />
                          {item.normalizedPhone || item.phone}
                        </span>
                      )}

                      {/* City */}
                      {item.user.city && item.user.city.toLowerCase() !== 'city' && (
                        <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                          📍 {item.user.city}
                        </span>
                      )}
                    </div>

                    {/* Diff View (Current in Google ➔ Expected Target) */}
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2 text-xs">
                      {/* Current in Google */}
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-zinc-400 uppercase font-medium">Current:</span>
                        <span className={clsx(
                          "px-2 py-0.5 rounded font-mono text-[11px]",
                          isMismatch
                            ? "line-through text-red-600 dark:text-red-400 bg-red-500/10"
                            : isMissing
                              ? "italic text-zinc-400 bg-zinc-200/50 dark:bg-zinc-800"
                              : "text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800"
                        )}>
                          {item.currentGoogleName}
                        </span>
                      </div>

                      <ArrowRight className="w-3.5 h-3.5 text-zinc-400 shrink-0 hidden sm:inline" />

                      {/* Target Format */}
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-zinc-400 uppercase font-medium">Target:</span>
                        <span className={clsx(
                          "px-2 py-0.5 rounded font-mono text-[11px] font-semibold",
                          isMismatch || isMissing
                            ? "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20"
                            : "text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800"
                        )}>
                          {item.expectedTargetName}
                        </span>
                      </div>
                    </div>

                    {/* Change Reason Note */}
                    <div className="flex items-center gap-1.5 text-[11px]">
                      {isMismatch ? (
                        <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400 font-medium">
                          <AlertTriangle className="w-3 h-3" />
                          {item.changeReason}
                        </span>
                      ) : isMissing ? (
                        <span className="inline-flex items-center gap-1 text-purple-700 dark:text-purple-400 font-medium">
                          <UserPlus className="w-3 h-3" />
                          {item.changeReason}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                          <Check className="w-3 h-3" />
                          {item.changeReason}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right Action: Sync button */}
                  <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                    {isSynced ? (
                      <span className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 rounded-xl">
                        <Check className="w-3.5 h-3.5" /> Synced
                      </span>
                    ) : (
                      <Button
                        onClick={() => handleSyncSingle(item)}
                        variant="secondary"
                        className="px-3 py-1 text-xs"
                        loading={isSyncingThis}
                        disabled={syncingAll}
                        icon={<RefreshCw className={`w-3.5 h-3.5 ${isSyncingThis ? 'animate-spin' : ''}`} />}
                      >
                        Sync Format
                      </Button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 flex items-center justify-between">
          <span className="text-xs text-zinc-500">
            {displayedItems.length} of {report?.totalChecked ?? 0} contact(s) shown
          </span>
          <Button onClick={onClose} variant="ghost" className="px-4 py-1.5 text-xs">
            Close
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
