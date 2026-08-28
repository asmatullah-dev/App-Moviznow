import React, { useState, useEffect, useMemo, useRef } from 'react';
import { db } from '../../firebase';
import { safeStorage } from '../../utils/safeStorage';
import { collection, doc, updateDoc, getDoc, query, where, getDocs, writeBatch, deleteDoc, setDoc, limit, deleteField, increment} from 'firebase/firestore';
import { UserProfile, Role, Status, AnalyticsEvent, Content } from '../../types';
import { Edit2, MessageCircle, X, Check, Search, ArrowUp, ArrowDown, Clock, Film, Trash2, Tv, Plus, Loader2, ArrowRight, UserPlus, Calendar, Heart, Bookmark, Save, Lock, Layers, Phone, AlertCircle, Bell, Mail, RefreshCw, Link2 as LinkIcon, Copy } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import clsx from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';
import AlertModal from '../../components/AlertModal';
import ConfirmModal from '../../components/ConfirmModal';
import { Button } from '../../components/Button';
import { handleFirestoreError, OperationType } from '../../utils/firestoreErrorHandler';
import { formatDateToMonthDDYYYY } from '../../utils/contentUtils';
import { useAuth, standardizePhone } from '../../contexts/AuthContext';
import { getUserDisplayName } from '../../utils/userUtils';
import { smartSearch } from '../../utils/searchUtils';
import { useModalBehavior } from '../../hooks/useModalBehavior';
import { useSettings } from '../../contexts/SettingsContext';
import { useAdminContent } from '../../contexts/AdminContentContext';
import { PhoneWhitelistManager } from '../../components/PhoneWhitelistManager';

import { useLocation, useNavigate } from 'react-router-dom';

import { useUsers, isUserExpired } from '../../contexts/UsersContext';
import { getUtcVersion } from '../../utils/chunkMeta';

type SortField = 'createdAt' | 'displayName' | 'phone' | 'expiryDate' | 'lastActive';
type SortOrder = 'asc' | 'desc';

export default function UserManagement() {
  const { profile, findUsersByEmailOrPhone, authLoading } = useAuth();
  const { settings } = useSettings();
  const { contentList, updateContentFields } = useAdminContent();
  const location = useLocation();
  const navigate = useNavigate();
  const searchParams = new URLSearchParams(location.search);
  const managedByFilter = searchParams.get('managedBy');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<UserProfile>>({});
  const [alertConfig, setAlertConfig] = useState<{ isOpen: boolean; title: string; message: string }>({ isOpen: false, title: '', message: '' });
  
  const [searchTerm, setSearchTerm] = useState(() => sessionStorage.getItem('user_mgmt_search') || '');
  const [sortField, setSortField] = useState<SortField>(() => (sessionStorage.getItem('user_mgmt_sort_field') as any) || 'createdAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>(() => (sessionStorage.getItem('user_mgmt_sort_order') as any) || 'desc');
  const [filterRole, setFilterRole] = useState<Role | 'all'>(() => (sessionStorage.getItem('user_mgmt_role') as any) || 'all');
  const [filterLanguage, setFilterLanguage] = useState<string>(() => sessionStorage.getItem('user_mgmt_lang') || 'all');
  const [filterReward, setFilterReward] = useState<string>(() => sessionStorage.getItem('user_mgmt_reward') || 'all');
  const [filterStatus, setFilterStatus] = useState<Status | 'all'>(() => (sessionStorage.getItem('user_mgmt_status') as any) || 'all');
  const [hideAnonymousAndInvalid, setHideAnonymousAndInvalid] = useState(() => {
    const cached = sessionStorage.getItem('user_mgmt_hide_anonymous_invalid');
    return cached === null ? true : cached === 'true';
  });

  useEffect(() => {
    sessionStorage.setItem('user_mgmt_search', searchTerm);
    sessionStorage.setItem('user_mgmt_sort_field', sortField);
    sessionStorage.setItem('user_mgmt_sort_order', sortOrder);
    sessionStorage.setItem('user_mgmt_role', filterRole);
    sessionStorage.setItem('user_mgmt_status', filterStatus);
    sessionStorage.setItem('user_mgmt_lang', filterLanguage);
    sessionStorage.setItem('user_mgmt_reward', filterReward);
    sessionStorage.setItem('user_mgmt_hide_anonymous_invalid', hideAnonymousAndInvalid.toString());
  }, [searchTerm, sortField, sortOrder, filterRole, filterStatus, filterLanguage, filterReward, hideAnonymousAndInvalid]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [isBulkDeleteConfirmOpen, setIsBulkDeleteConfirmOpen] = useState(false);
  const [bulkDeleteValidUids, setBulkDeleteValidUids] = useState<string[]>([]);

  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [copiedUid, setCopiedUid] = useState(false);
  const [isEditingOverlay, setIsEditingOverlay] = useState(false);
  const [isAnalyticsLoading, setIsAnalyticsLoading] = useState(false);
  const [scannedAnalytics, setScannedAnalytics] = useState<Record<string, { timeSpent: number, favoritesCount: number, watchLaterCount: number, lastActive: string | null, hasScanned: boolean, sessionsCount: number }>>({});
  const [userRequests, setUserRequests] = useState<any[]>([]);
  const [assignedContentTitles, setAssignedContentTitles] = useState<string[]>([]);
  const [allContent, setAllContent] = useState<any[]>([]);
  const [contentSearch, setContentSearch] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [loading, setLoading] = useState(() => {
    const cached = safeStorage.getItem('cached_all_users');
    if (!cached) return true;
    try {
      const parsed = JSON.parse(cached);
      return !Array.isArray(parsed) || parsed.length === 0;
    } catch {
      return true;
    }
  });
  const [isMountRefreshing, setIsMountRefreshing] = useState(false);
  const [isContentPickerOpen, setIsContentPickerOpen] = useState(false);
  const [assignedIds, setAssignedIds] = useState<Set<string>>(new Set());
  const [contentSearchTerm, setContentSearchTerm] = useState('');
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  
  // Add User State
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  const [isWhitelistModalOpen, setIsWhitelistModalOpen] = useState(false);
  const [newUserForm, setNewUserForm] = useState({ email: '', phone: '', displayName: '', city: '', role: 'user' as Role, status: 'pending' as 'pending' | 'active', expiryDate: '' });
  const [foundUser, setFoundUser] = useState<UserProfile | null>(null);
  const [searchStatus, setSearchStatus] = useState<'idle' | 'searching' | 'found' | 'not_found'>('idle');
  const [managers, setManagers] = useState<Record<string, string>>({});
  const [processing, setProcessing] = useState<Record<string, boolean>>({});
  const [userReviews, setUserReviews] = useState<Record<string, {rating: number, text: string}[]>>({});

  useEffect(() => {
    const loadReviews = () => {
      try {
        const cached = safeStorage.getItem('cached_reviews_data');
        if (cached) {
          const data = JSON.parse(cached);
          if (Array.isArray(data)) {
            const reviewMap: Record<string, {rating: number, text: string}[]> = {};
            data.forEach(r => {
              if (r.userId) {
                if (!reviewMap[r.userId]) {
                  reviewMap[r.userId] = [];
                }
                reviewMap[r.userId].push({ rating: r.rating, text: r.text });
              }
            });
            setUserReviews(reviewMap);
          }
        }
      } catch (e) {
        console.error("Failed to parse reviews from cache", e);
      }
    };
    loadReviews();
  }, []);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 30000); // Re-render every 30s to keep relative times fresh
    return () => clearInterval(timer);
  }, []);

  const isUserOnline = (lastActive?: string) => {
    if (!lastActive) return false;
    const lastActiveDate = new Date(lastActive);
    const now = new Date();
    const diffMinutes = (now.getTime() - lastActiveDate.getTime()) / 60000;
    return diffMinutes < 4; // Consider online if active in last 4 minutes (heartbeat is 2m)
  };

  const safeFormat = (dateStr: string | null | undefined, fmt: string) => {
    if (!dateStr) return 'N/A';
    if (dateStr === 'Lifetime') return 'Lifetime';

    // If dateStr is strictly YYYY-MM-DD (date only), format in local time to prevent UTC day shift
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim())) {
      const parts = dateStr.trim().split('-');
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const d = new Date(year, month, day);
      return isNaN(d.getTime()) ? 'Invalid Date' : format(d, fmt);
    }

    // Full ISO timestamp or string with time
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      return format(d, fmt);
    }
    return 'Invalid Date';
  };

  const safeDistance = (dateStr: string | null | undefined) => {
    if (!dateStr) return 'Never';
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? 'Invalid Date' : formatDistanceToNow(d, { addSuffix: true });
  };

  const handleSearchUser = async () => {
    if (!newUserForm.phone && !newUserForm.email) {
      setAlertConfig({ isOpen: true, title: 'Error', message: 'Please provide a WhatsApp Number or Email.' });
      return;
    }

    setSearchStatus('searching');
    try {
      const standardizedPhone = newUserForm.phone ? standardizePhone(newUserForm.phone) : '';
      let user: any = null;

      if (standardizedPhone) {
        const found = allUsers.find(u => u.phone === standardizedPhone && u.status === 'pending');
        if (found) {
          user = { id: found.uid, ...found };
        }
      }
      
      if (!user && newUserForm.email) {
        const searchEmail = newUserForm.email.trim().toLowerCase();
        const found = allUsers.find(u => u.email === searchEmail && u.status === 'pending');
        if (found) {
          user = { id: found.uid, ...found };
        }
      }

      if (user) {
        setFoundUser(user);
        setSearchStatus('found');
      } else {
        setSearchStatus('not_found');
        setAlertConfig({ isOpen: true, title: 'Not Found', message: 'No pending user found with that phone or email.' });
      }
    } catch (error) {
      console.error('Error searching user:', error);
      setSearchStatus('idle');
      setAlertConfig({ isOpen: true, title: 'Error', message: 'Failed to search user.' });
    }
  };

  useModalBehavior(alertConfig.isOpen, () => setAlertConfig(prev => ({ ...prev, isOpen: false })));
  useModalBehavior(!!deleteConfirm, () => setDeleteConfirm(null));
  useModalBehavior(isBulkDeleteConfirmOpen, () => setIsBulkDeleteConfirmOpen(false));
  useModalBehavior(isContentPickerOpen, () => setIsContentPickerOpen(false));
  useModalBehavior(isAddUserModalOpen, () => setIsAddUserModalOpen(false));
  useModalBehavior(!!selectedUser, () => {
    setSelectedUser(null);
    setIsEditingOverlay(false);
    setEditingId(null);
  });

  const { users: allUsers, loading: usersLoading, updateMultipleUserFields, updateUserFields, finalizeUserChanges, hasPendingChanges, refreshUsers } = useUsers();
  
  // Track user UIDs whose status changed to 'expired' during the User Management tab session
  const changedToExpiredUidsRef = useRef<Set<string>>(new Set());
  const prevUsersMapRef = useRef<Map<string, string>>(new Map());

  // Track status changes to 'expired' across user updates
  useEffect(() => {
    if (!allUsers || allUsers.length === 0) return;
    allUsers.forEach(u => {
      if (u && u.uid && u.role !== 'admin' && u.role !== 'owner') {
        const prevStatus = prevUsersMapRef.current.get(u.uid);
        if (u.status === 'expired' && prevStatus && prevStatus !== 'expired') {
          changedToExpiredUidsRef.current.add(u.uid);
        }
        prevUsersMapRef.current.set(u.uid, u.status || '');
      }
    });
  }, [allUsers]);

  // Fetch fresh data on mount and force sync on unmount
  const { checkForUpdates } = useAdminContent();
  const isSyncingOnMountRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    if (authLoading) return; // Wait until auth is fully loaded
    if (isSyncingOnMountRef.current) return;

    const syncOnMount = async () => {
      isSyncingOnMountRef.current = true;
      setIsMountRefreshing(true);
      try {
        window.dispatchEvent(new CustomEvent('sync_status', { detail: { status: 'syncing', message: 'Refreshing users...' } }));
        
        // Record initial statuses before refresh
        const initialMap = new Map((allUsers || []).map(u => [u.uid, u.status]));

        // If there are pending changes from previous session/offline, finalize them first
        const pendingStr = safeStorage.getItem('pending_user_updates');
        if (pendingStr) {
          try {
            const parsed = JSON.parse(pendingStr);
            if (Object.keys(parsed).length > 0) {
              await finalizeUserChanges(true);
            }
          } catch(e) {
            console.warn("Failed to finalize pending user updates on mount:", e);
          }
        }
        
        // Delta sync users using chunk_meta (60s cooldown prevents redundant server queries)
        const res = await refreshUsers(true);
        if (mounted) {
          if (res?.updatedSomething) {
            window.dispatchEvent(new CustomEvent('sync_status', { detail: { status: 'success', message: 'Users refreshed successfully' } }));
          } else {
            window.dispatchEvent(new CustomEvent('sync_status', { detail: { status: 'up-to-date', message: 'Users are up to date' } }));
          }
        }
      } catch (err) {
        console.error("Refresh users failed on tab open:", err);
        if (mounted) {
          window.dispatchEvent(new CustomEvent('sync_status', { detail: { status: 'error', message: 'Failed to refresh users' } }));
        }
      } finally {
        isSyncingOnMountRef.current = false;
        if (mounted) {
          setIsMountRefreshing(false);
        }
      }
    };

    if (mounted) {
      syncOnMount();
    }
    
    return () => {
      mounted = false;
      isSyncingOnMountRef.current = false;
      setIsMountRefreshing(false);

      // Email notification for Expiry only triggered by admin and owner when exiting User Management tab
      if ((profile?.role === 'admin' || profile?.role === 'owner') && changedToExpiredUidsRef.current.size > 0 && profile?.uid) {
        const expiredUids = Array.from(changedToExpiredUidsRef.current);
        if (expiredUids.length > 0) {
          console.log(`[UserManagement Exit] Triggering expiry notifications for ${expiredUids.length} user(s):`, expiredUids);
          fetch('/api/notifications/check-expiry', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              adminUid: profile.uid,
              targetUserIds: expiredUids,
            }),
            keepalive: true,
          }).catch(err => console.error("Error triggering exit expiry notifications:", err));
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, location.pathname]);

  // Handle page unload for hard refreshes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasPendingChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasPendingChanges]);
  
  const users = useMemo(() => {
    if ((profile?.role as string) === 'user_manager' || (profile?.role as string) === 'manager') {
      return allUsers.filter(u => u.managedBy === profile.uid);
    } else if ((profile?.role === 'admin' || profile?.role === 'owner') && managedByFilter) {
      return allUsers.filter(u => u.managedBy === managedByFilter);
    }
    return allUsers;
  }, [allUsers, profile, managedByFilter]);

  useEffect(() => {
    if (allUsers && allUsers.length > 0) {
      setLoading(false);
    } else {
      setLoading(usersLoading);
    }
  }, [usersLoading, allUsers]);

  // Removed unsolicited background auto-update write loop to prevent phantom Firestore writes

  // Removed separate effect for caching users

  useEffect(() => {
    if (profile?.role === 'admin' || profile?.role === 'owner') {
      const managersData: Record<string, string> = {};
      allUsers.forEach(data => {
        if (data.isUserManager || data.role === 'user_manager' || data.role === 'manager') {
          managersData[data.uid] = data.displayName || data.email || 'Unknown Manager';
        }
      });
      setManagers(managersData);
    }
  }, [profile, allUsers]);

  useEffect(() => {
    if (contentList && contentList.length > 0) {
      setAllContent([...contentList].sort((a, b) => {
        if (a.order !== undefined && b.order !== undefined) return b.order - a.order;
        if (a.order === undefined && b.order !== undefined) return 1;
        if (a.order !== undefined && b.order === undefined) return -1;
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      }));
    }
  }, [contentList]);

  const fetchUserAnalytics = async (user: UserProfile) => {
    setIsAnalyticsLoading(true);
    setUserRequests([]);
    setAssignedContentTitles([]);
    
    try {
      // 1. Find the fresh user in the local allUsers list (already managed by UsersContext)
      const freshUser = allUsers.find(u => u.uid === user.uid) || user;
      
      // Update selectedUser if fresh data found, to ensure the UI shows latest counts
      if (selectedUser?.uid === freshUser.uid) {
        setSelectedUser(freshUser);
      }

      const newAnalytics = { 
        timeSpent: freshUser.timeSpent || 0,
        favoritesCount: (freshUser.favorites || []).length,
        watchLaterCount: (freshUser.watchLater || []).length,
        lastActive: freshUser.lastActive || null,
        sessionsCount: freshUser.sessionsCount || 0,
        hasScanned: true
      };
      
      setScannedAnalytics(prev => ({
        ...prev,
        [user.uid]: newAnalytics
      }));
      
      // Cache for quick reload
      safeStorage.setItem(`user_analytics_${user.uid}`, JSON.stringify(newAnalytics));

      // 3. Update assigned content titles
      if (freshUser.assignedContent && freshUser.assignedContent.length > 0) {
        const contentMap = new Map<string, string>();
        contentList.forEach(c => {
          contentMap.set(c.id, c.title);
        });
        const titles = freshUser.assignedContent.map(id => contentMap.get(id) || 'Unknown Content');
        setAssignedContentTitles(titles);
      } else {
        setAssignedContentTitles([]);
      }

      // 4. Load movie requests from local user data
      setUserRequests(freshUser.movieRequests || []);

    } catch (error) {
      console.error("Error scanning user:", error);
    } finally {
      setIsAnalyticsLoading(false);
    }
  };

  const getUserAnalytics = (uid: string) => {
    return scannedAnalytics[uid] || { timeSpent: 0, favoritesCount: 0, watchLaterCount: 0, lastActive: null, hasScanned: false, sessionsCount: 0 };
  };

  const handleRowClick = (user: UserProfile, e: React.MouseEvent) => {
    // Prevent opening overlay if clicking on inputs, selects, or buttons
    if ((e.target as HTMLElement).closest('button, input, select')) return;
    if (editingId === user.uid) return;
    
    setSelectedUser(user);
    setAssignedIds(new Set(user.assignedContent || []));
    
    const cached = safeStorage.getItem(`user_analytics_${user.uid}`);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        setScannedAnalytics(prev => ({ ...prev, [user.uid]: parsed }));
      } catch (e) {
        setScannedAnalytics(prev => ({ 
          ...prev, 
          [user.uid]: { timeSpent: 0, favoritesCount: 0, watchLaterCount: 0, lastActive: null, hasScanned: false, sessionsCount: 0 } 
        }));
      }
    } else {
      setScannedAnalytics(prev => ({ 
        ...prev, 
        [user.uid]: { timeSpent: 0, favoritesCount: 0, watchLaterCount: 0, lastActive: null, hasScanned: false, sessionsCount: 0 } 
      }));
    }
    
    
    setUserRequests([]);
    setAssignedContentTitles([]);
  };

  const handleEdit = (user: UserProfile) => {
    if (user.role === 'owner' && user.uid !== profile?.uid) return; // Cannot edit owner unless it's yourself
    setSelectedUser(user);
    setEditingId(user.uid);
    setIsEditingOverlay(true);
    setEditForm({
      displayName: user.displayName || '',
      email: user.email || '',
      phone: user.phone || '',
      city: user.city || '',
      expiryDate: user.expiryDate ? user.expiryDate.split('T')[0] : '',
      role: user.role,
      status: user.status,
      permissions: user.permissions || [],
      dob: user.dob || '',
      gender: user.gender || '',
    });
    setIsEditingOverlay(true);
  };

  const handleResetPassword = async (userId: string) => {
    try {
      setProcessing(prev => ({ ...prev, [`reset_${userId}`]: true }));
      updateUserFields(userId, {
        requirePasswordReset: true
      });
      await finalizeUserChanges(true);
      setAlertConfig({ isOpen: true, title: 'Success', message: 'User has been flagged for password reset on next login.' });
    } catch (error: any) {
      console.error("Error resetting password:", error);
      setAlertConfig({ isOpen: true, title: 'Error', message: error.message || 'Failed to reset password' });
    } finally {
      setProcessing(prev => ({ ...prev, [`reset_${userId}`]: false }));
    }
  };

  const handleSave = async () => {
    if (!editingId || !selectedUser || selectedUser.role === 'owner') return;
    setProcessing(prev => ({ ...prev, save: true }));
    try {
      const standardizedPhone = standardizePhone(editForm.phone || '');

      // Check for duplicates in parallel
      const duplicateChecks = [];
      if (editForm.email && editForm.email !== selectedUser.email) {
        duplicateChecks.push(findUsersByEmailOrPhone(editForm.email).then(matches => ({ type: 'email', matches })));
      }
      if (standardizedPhone && standardizedPhone !== selectedUser.phone) {
        duplicateChecks.push(findUsersByEmailOrPhone(standardizedPhone).then(matches => ({ type: 'phone', matches })));
      }

      if (duplicateChecks.length > 0) {
        const results = await Promise.all(duplicateChecks);
        for (const res of results) {
          if (res.matches.some(u => u.uid !== editingId)) {
            const msg = res.type === 'email' 
              ? 'Email address is already in use by another account.' 
              : 'WhatsApp Number is already in use by another account.';
            setAlertConfig({ isOpen: true, title: 'Error', message: msg });
            setProcessing(prev => ({ ...prev, save: false }));
            return;
          }
        }
      }

      const updateData: any = {
        displayName: editForm.displayName,
        email: editForm.email,
        phone: standardizedPhone,
        role: editForm.role,
        status: editForm.status,
        permissions: editForm.permissions || [],
        dob: editForm.dob,
        gender: editForm.gender,
        city: editForm.city,
      };
      
      // Update isUserManager flag to match role
      const isNowManager = editForm.role === 'user_manager' || editForm.role === 'manager';
      updateData.isUserManager = isNowManager;
      
      if (editForm.expiryDate && editForm.expiryDate !== 'Lifetime') {
        const dateStr = editForm.expiryDate.split('T')[0];
        updateData.expiryDate = `${dateStr}T23:59:59.999Z`;
      } else if (editForm.expiryDate === 'Lifetime') {
        updateData.expiryDate = 'Lifetime';
      } else if (editForm.status === 'active' && (editForm.role as string) !== 'owner' && (editForm.role as string) !== 'admin' && (selectedUser as any).role !== 'owner' && (selectedUser as any).role !== 'admin') {
        // Active status requires an expiry date — default to 30 days if left empty
        const defaultExp = new Date();
        defaultExp.setDate(defaultExp.getDate() + 30);
        const dateStr = defaultExp.toISOString().split('T')[0];
        updateData.expiryDate = `${dateStr}T23:59:59.999Z`;
      } else {
        updateData.expiryDate = null;
      }

      // Detect if membership expiry date increased by more than 5 days.
      // That means they bought a membership!
      let membershipDateIncreased = false;
      if (updateData.expiryDate) {
        const newTime = new Date(updateData.expiryDate).getTime();
        let oldTime = 0;
        if (selectedUser.expiryDate && selectedUser.expiryDate !== 'Lifetime') {
          oldTime = new Date(selectedUser.expiryDate).getTime();
        } else {
          oldTime = Date.now(); // fallback to current time
        }
        
        // Check if increased by more than 5 days (5 days in ms = 5 * 24 * 60 * 60 * 1000 = 432000000)
        const diffDays = (newTime - oldTime) / (24 * 60 * 60 * 1000);
        if (diffDays > 5) {
          membershipDateIncreased = true;
        }
      }

      if (membershipDateIncreased) {
        // Change to paid status and automatically send reward to inviter
        updateData.status = 'active'; // ensure user is active since they bought membership
        
        const inviterUid = selectedUser.referredBy;
        if (inviterUid) {
          try {
            // Check if activation reward was already claimed
            if (!selectedUser.activationRewardClaimed) {
              const inviterData = allUsers.find(u => u.uid === inviterUid);
              
              if (inviterData) {
                let baseDate = new Date();
                if (inviterData.expiryDate && inviterData.expiryDate !== 'Lifetime') {
                  const currentExp = new Date(inviterData.expiryDate);
                  if (currentExp > baseDate) {
                    baseDate = currentExp;
                  }
                }
                baseDate.setDate(baseDate.getDate() + 10);
                const newInviterExpiryStr = baseDate.toISOString();
                
                const inviterUpdate: any = {
                  expiryDate: newInviterExpiryStr,
                  status: 'active'
                };
                if (['user', 'trial', 'selected_content', ''].includes(inviterData.role || '')) {
                  inviterUpdate.role = 'basic';
                }
                
                updateUserFields(inviterUid, inviterUpdate);
              }
              
              // Set the activationClaimed and status = 'paid' on the join record in /referral/all
              await setDoc(doc(db, 'referral', 'all'), {
                joins: {
                  [selectedUser.uid]: {
                    status: 'paid',
                    activationClaimed: true
                  }
                },
                stats: {
                  [inviterUid]: {
                    totalPaid: increment(1)
                  }
                }
              }, { merge: true });
              
              // Also ensure updateData itself marks activationRewardClaimed as true on the user's profile
              updateData.activationRewardClaimed = true;
              console.log("Successfully sent 10 days reward to inviter:", inviterUid);
            }
          } catch (e) {
            console.error("Failed to automatically grant referral activation reward:", e);
          }
        } else {
          // If no inviter is present, we still set activationRewardClaimed to true to mark this user as activated/paid
          updateData.activationRewardClaimed = true;
        }
      }

      const currentEditingId = editingId;
      const previousRole = selectedUser.role;
      const newRole = editForm.role;

      updateUserFields(currentEditingId, updateData);
      await finalizeUserChanges(true);

      // Send membership update notification to enabled services if expiry date changed
      if (updateData.expiryDate !== undefined && updateData.expiryDate !== selectedUser.expiryDate) {
        fetch('/api/notifications/notify-membership-update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: currentEditingId,
            newExpiryDate: updateData.expiryDate || 'Lifetime',
            previousExpiryDate: selectedUser.expiryDate,
            role: updateData.role || selectedUser.role,
            status: updateData.status || selectedUser.status,
            adminName: profile?.displayName || 'Admin'
          })
        }).catch(err => console.warn('Failed to send membership update notification:', err));
      }

      // Handle Manager role changes
      const wasManager = previousRole === 'user_manager' || previousRole === 'manager' || selectedUser.isUserManager;

      if (wasManager && !isNowManager) {
        // Expire all managed users
        const managedUsers = allUsers.filter(u => u.managedBy === currentEditingId);
        if (managedUsers.length > 0) {
          managedUsers.forEach(userData => {
            if (userData.status !== 'pending') {
              updateUserFields(userData.uid, {
                status: 'expired',
                previousStatus: userData.status || 'active'
              });
            }
          });
        }
      } else if (!wasManager && isNowManager) {
        // Restore all managed users
        const managedUsers = allUsers.filter(u => u.managedBy === currentEditingId);
        if (managedUsers.length > 0) {
          managedUsers.forEach(userData => {
            if (userData.previousStatus) {
              updateUserFields(userData.uid, {
                status: userData.previousStatus,
                previousStatus: null
              });
            }
          });
        }
      }

      setEditingId(null);
      setIsEditingOverlay(false);
      setSelectedUser({
        ...selectedUser,
        ...updateData
      });
    } catch (error) {
      console.error('Error updating user:', error);
      setAlertConfig({ isOpen: true, title: 'Error', message: 'Failed to update user' });
      setProcessing(prev => ({ ...prev, save: false }));
      handleFirestoreError(error, OperationType.UPDATE, `users/${editingId}`);
    } finally {
      setProcessing(prev => ({ ...prev, save: false }));
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    setProcessing(prev => ({ ...prev, delete: true }));
    const userToDelete = users.find(u => u.uid === deleteConfirm);
    if (userToDelete?.role === 'owner') {
      setProcessing(prev => ({ ...prev, delete: false }));
      return;
    }
    const currentDeleteConfirm = deleteConfirm;
    
    try {
      if (profile?.uid) {
        try {
          const res = await fetch('/api/admin/users/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uid: currentDeleteConfirm, adminUid: profile.uid })
          });
          if (!res.ok) {
             const errorData = await res.json().catch(() => ({}));
             console.error("Failed to delete user from Firebase Auth:", errorData);
          }
        } catch (e) {
          console.error("Failed to call delete API:", e);
        }
      }

      const batch = writeBatch(db);
      
      // 1. Delete user document
      batch.delete(doc(db, 'users', currentDeleteConfirm));
      batch.set(doc(db, 'chunk_meta', 'versions'), { users: { [currentDeleteConfirm]: deleteField() } }, { merge: true });

      await batch.commit();

      // Clean up sync_user_mtimes cache
      const mtimesStr = safeStorage.getItem('sync_user_mtimes');
      if (mtimesStr) {
        try {
          const mtimes = JSON.parse(mtimesStr);
          delete mtimes[currentDeleteConfirm];
          safeStorage.setItem('sync_user_mtimes', JSON.stringify(mtimes));
        } catch (e) {}
      }

      // Immediately remove from local storage cache so UI updates synchronously
      const cachedStr = safeStorage.getItem('cached_all_users');
      if (cachedStr) {
        try {
          const cached: UserProfile[] = JSON.parse(cachedStr);
          const updated = cached.filter(u => u.uid !== currentDeleteConfirm);
          safeStorage.setItem('cached_all_users', JSON.stringify(updated));
        } catch (e) {}
      }

      // OPTIONAL: Immediately hide it from UI if refreshUsers takes time
      // But refreshUsers should pick up the -1 mtime anyway
      await refreshUsers(true);

      setAlertConfig({ isOpen: true, title: 'Success', message: 'User and all associated data deleted successfully' });
      setDeleteConfirm(null);
    } catch (error) {
      console.error('Error in delete action:', error);
      setAlertConfig({ isOpen: true, title: 'Error', message: 'Failed to delete user' });
      handleFirestoreError(error, OperationType.DELETE, `users/${currentDeleteConfirm}`);
    } finally {
      setProcessing(prev => ({ ...prev, delete: false }));
    }
  };

  const handleBulkDeleteUsers = () => {
    if (selectedUsers.length === 0) return;

    // Filter out owner role users and current logged-in account
    const validToDel = selectedUsers.filter(uid => {
      const u = users.find(user => user.uid === uid);
      return u && u.role !== 'owner' && u.uid !== profile?.uid;
    });

    if (validToDel.length === 0) {
      setAlertConfig({
        isOpen: true,
        title: 'Action Not Allowed',
        message: 'None of the selected users can be deleted (Owner accounts and your own logged-in account cannot be deleted).'
      });
      return;
    }

    setBulkDeleteValidUids(validToDel);
    setIsBulkDeleteConfirmOpen(true);
  };

  const executeBulkDelete = async () => {
    if (bulkDeleteValidUids.length === 0) return;
    setProcessing(prev => ({ ...prev, delete: true, bulk: true }));

    const uidsToDelete = [...bulkDeleteValidUids];
    const validUidsSet = new Set(uidsToDelete);

    try {
      // 1. Delete users from Firebase Auth via Admin API
      if (profile?.uid) {
        try {
          const res = await fetch('/api/admin/users/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uids: uidsToDelete, adminUid: profile.uid })
          });
          if (!res.ok) {
            const errorData = await res.json().catch(() => ({}));
            console.error("Failed to bulk delete users from Firebase Auth:", errorData);
          }
        } catch (e) {
          console.error("Failed to call bulk delete API:", e);
        }
      }

      // 2. Process Firestore deletions in batches of up to 400 users
      const BATCH_CHUNK_SIZE = 400;
      for (let i = 0; i < uidsToDelete.length; i += BATCH_CHUNK_SIZE) {
        const batch = writeBatch(db);
        const chunkUids = uidsToDelete.slice(i, i + BATCH_CHUNK_SIZE);
        const versionUsersUpdate: Record<string, any> = {};

        chunkUids.forEach(uid => {
          batch.delete(doc(db, 'users', uid));
          versionUsersUpdate[uid] = deleteField();
        });

        batch.set(doc(db, 'chunk_meta', 'versions'), { users: versionUsersUpdate }, { merge: true });

        await batch.commit();
      }

      // 3. Update local storage cache and mtimes
      const mtimesStr = safeStorage.getItem('sync_user_mtimes');
      if (mtimesStr) {
        try {
          const mtimes = JSON.parse(mtimesStr);
          validUidsSet.forEach(uid => delete mtimes[uid]);
          safeStorage.setItem('sync_user_mtimes', JSON.stringify(mtimes));
        } catch (e) {}
      }

      const cachedStr = safeStorage.getItem('cached_all_users');
      if (cachedStr) {
        try {
          const cached: UserProfile[] = JSON.parse(cachedStr);
          const updated = cached.filter(u => !validUidsSet.has(u.uid));
          safeStorage.setItem('cached_all_users', JSON.stringify(updated));
        } catch (e) {}
      }

      // 5. Refresh users list & reset state
      await refreshUsers(true);
      setSelectedUsers([]);
      setIsBulkDeleteConfirmOpen(false);
      setBulkDeleteValidUids([]);

      setAlertConfig({
        isOpen: true,
        title: 'Success',
        message: `${uidsToDelete.length} users and all associated data deleted successfully.`
      });
    } catch (error) {
      console.error('Error in bulk delete action:', error);
      setAlertConfig({ isOpen: true, title: 'Error', message: 'Failed to delete selected users.' });
      handleFirestoreError(error, OperationType.DELETE, 'users/bulk');
    } finally {
      setProcessing(prev => ({ ...prev, delete: false, bulk: false }));
    }
  };

  const sendWhatsAppReminder = (user: UserProfile) => {
    if (!user.phone) {
      setAlertConfig({ isOpen: true, title: 'Missing WhatsApp Number', message: 'User does not have a WhatsApp number set.' });
      return;
    }
    
    let message = '';
    const name = user.displayName || 'there';
    const now = new Date();
    
    // Check if today is the joining date
    const isJoiningDate = user.createdAt && new Date(user.createdAt).toDateString() === now.toDateString();
    const welcomeText = isJoiningDate ? `Welcome to ${settings?.headerText || 'MovizNow'} App. ` : '';
    const membershipType = user.role === 'trial' ? 'Trial' : 'Membership';
    
    if (user.expiryDate) {
      const expiryDate = new Date(user.expiryDate);
      const diffTime = expiryDate.getTime() - now.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      const expiryStr = formatDateToMonthDDYYYY(user.expiryDate);

      if (diffDays < 0) {
        message = `Assalam O Alaikum! ${name},\n\nYour ${membershipType} for ${settings?.headerText || 'MovizNow'} app is Expired. Please renew to continue enjoying our services.\nVisit Now: MovizNow.com\nThank You`;
      } else if (diffDays > 5) {
        message = `Assalam O Alaikum! ${name},\n\nYour Membership Expiry date for MovizNow is *${expiryStr}*\nEnjoy all Unlimited new latest & old Movies & Series on MovizNow without any restrictions with Direct Play (MX Player, VLC and All Video Players) & Download (Also download able with telegram)\nVisit Now: MovizNow.com\nThank You`;
      } else if (diffDays > 3) {
        message = `Assalam O Alaikum! ${name},\n\n${welcomeText}Your ${membershipType} for ${settings?.headerText || 'MovizNow'} app will expire on ${expiryStr}.\nVisit Now: MovizNow.com\nThank You`;
      } else {
        message = `Assalam O Alaikum! ${name},\n\n${welcomeText}Your ${membershipType} for ${settings?.headerText || 'MovizNow'} app is expiring very soon on ${expiryStr}. Please renew to continue enjoying our services.\nVisit Now: MovizNow.com\nThank You`;
      }
    } else {
      message = `Assalam O Alaikum! ${name},\n\n${welcomeText}This is a friendly reminder regarding your ${settings?.headerText || 'MovizNow'} ${membershipType}.\nVisit Now: MovizNow.com\nThank You`;
    }

    const encodedMessage = encodeURIComponent(message);
    const phone = user.phone.replace(/\D/g, ''); // Remove non-digits
    
    window.open(`https://wa.me/${phone}?text=${encodedMessage}`, '_blank');
  };

  const handleAddContent = async (contentId: string) => {
    if (!selectedUser || selectedUser.role === 'owner') return;
    try {
      const currentAssigned = selectedUser.assignedContent || [];
      if (currentAssigned.includes(contentId)) return;
      
      const nextAssigned = [...currentAssigned, contentId];
      updateUserFields(selectedUser.uid, {
        assignedContent: nextAssigned
      });
      await finalizeUserChanges(true);
      
      // Update local state for immediate feedback
      setSelectedUser({ ...selectedUser, assignedContent: nextAssigned });
      setContentSearch('');
    } catch (error) {
      console.error("Error adding content:", error);
    }
  };

  const handleRemoveContent = async (contentId: string) => {
    if (!selectedUser || selectedUser.role === 'owner') return;
    try {
      const nextAssigned = (selectedUser.assignedContent || []).filter(id => id !== contentId);
      updateUserFields(selectedUser.uid, {
        assignedContent: nextAssigned
      });
      await finalizeUserChanges(true);
      
      // Update local state
      setSelectedUser({ ...selectedUser, assignedContent: nextAssigned });
    } catch (error) {
      console.error("Error removing content:", error);
    }
  };

  const handleSaveAccess = async () => {
    if (!selectedUser || selectedUser.role === 'owner') return;
    setProcessing(prev => ({ ...prev, saveAccess: true }));
    try {
      const nextAssigned = Array.from(assignedIds);
      updateUserFields(selectedUser.uid, {
        assignedContent: nextAssigned
      });
      await finalizeUserChanges(true);
      
      // Update local state
      setSelectedUser({ ...selectedUser, assignedContent: nextAssigned });
      setIsContentPickerOpen(false);
      
      // Update titles
      const titles: string[] = [];
      allContent.forEach(item => {
        if (nextAssigned.includes(item.id)) {
          titles.push(item.title);
        }
      });
      setAssignedContentTitles(titles);
    } catch (error) {
      console.error('Error updating access:', error);
      setAlertConfig({ isOpen: true, title: 'Error', message: 'Failed to update access' });
      setProcessing(prev => ({ ...prev, saveAccess: false }));
      handleFirestoreError(error, OperationType.UPDATE, `users/${selectedUser.uid}`);
    } finally {
      setProcessing(prev => ({ ...prev, saveAccess: false }));
    }
  };

  const toggleContent = (contentId: string, seasons?: any[]) => {
    const newSet = new Set(assignedIds);
    if (newSet.has(contentId)) {
      newSet.delete(contentId);
      if (seasons) {
        seasons.forEach(s => newSet.delete(`${contentId}:${s.id}`));
      }
    } else {
      newSet.add(contentId);
      if (seasons) {
        seasons.forEach(s => newSet.delete(`${contentId}:${s.id}`));
      }
    }
    setAssignedIds(newSet);
  };

  const toggleSeason = (contentId: string, seasonId: string, allSeasons: any[]) => {
    const newSet = new Set(assignedIds);
    const seasonKey = `${contentId}:${seasonId}`;
    
    if (newSet.has(contentId)) {
      newSet.delete(contentId);
      allSeasons.forEach(s => {
        if (s.id !== seasonId) {
          newSet.add(`${contentId}:${s.id}`);
        }
      });
    } else if (newSet.has(seasonKey)) {
      newSet.delete(seasonKey);
    } else {
      newSet.add(seasonKey);
      let allSelected = true;
      for (const s of allSeasons) {
        if (s.id !== seasonId && !newSet.has(`${contentId}:${s.id}`)) {
          allSelected = false;
          break;
        }
      }
      if (allSelected) {
        allSeasons.forEach(s => newSet.delete(`${contentId}:${s.id}`));
        newSet.add(contentId);
      }
    }
    setAssignedIds(newSet);
  };

  const handleUpdateRequestStatus = async (requestId: string, status: string) => {
    try {
      const updatedRequests = userRequests.map(r => r.id === requestId ? { ...r, status } : r);
      if (selectedUser) {
        updateUserFields(selectedUser.uid, { movieRequests: updatedRequests });
        await finalizeUserChanges(true);
      }
      setUserRequests(updatedRequests);
    } catch (error) {
      console.error("Error updating request status:", error);
    }
  };

  const handleDeleteRequest = async (requestId: string) => {
    if (!window.confirm("Are you sure you want to delete this request?")) return;
    try {
      const updatedRequests = userRequests.filter(r => r.id !== requestId);
      if (selectedUser) {
        updateUserFields(selectedUser.uid, { movieRequests: updatedRequests });
        await finalizeUserChanges(true);
      }
      setUserRequests(updatedRequests);
    } catch (error) {
      console.error("Error deleting request:", error);
    }
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder(field === 'lastActive' || field === 'createdAt' || field === 'expiryDate' ? 'desc' : 'asc');
    }
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedUsers(filteredAndSortedUsers.filter(u => u.role !== 'owner').map(u => u.uid));
    } else {
      setSelectedUsers([]);
    }
  };

  const handleSelectUser = (uid: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const user = users.find(u => u.uid === uid);
    if (user?.role === 'owner') return;
    setSelectedUsers(prev => 
      prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]
    );
  };

  const handleMergeUsers = async () => {
    if (selectedUsers.length !== 2) {
      setAlertConfig({ isOpen: true, title: 'Error', message: 'You must select exactly two users to merge.' });
      return;
    }

    const user1 = users.find(u => u.uid === selectedUsers[0]);
    const user2 = users.find(u => u.uid === selectedUsers[1]);

    if (!user1 || !user2) return;

    if (!window.confirm(`Are you sure you want to merge "${user2.displayName || user2.email || user2.phone || 'User 2'}" into "${user1.displayName || user1.email || user1.phone || 'User 1'}"?\n\nAll data from the second user will be merged into the first, and the second user record will be deleted. This cannot be undone.`)) {
      return;
    }

    setProcessing(prev => ({ ...prev, bulk: true }));

    try {
      const batch = writeBatch(db);
      const u1Ref = doc(db, 'users', user1.uid);
      const u2Ref = doc(db, 'users', user2.uid);

      const updates: any = {};
      
      // Merge email
      if (!user1.email && user2.email) {
        updates.email = user2.email;
      }
      
      // Merge phone
      if (!user1.phone && user2.phone) {
        updates.phone = user2.phone;
      }

      // Merge timeSpent & sessionsCount
      updates.timeSpent = (user1.timeSpent || 0) + (user2.timeSpent || 0);
      updates.sessionsCount = (user1.sessionsCount || 0) + (user2.sessionsCount || 0);

      // Merge expiry (take Lifetime or latest date)
      if (user1.expiryDate === "Lifetime" || user2.expiryDate === "Lifetime") {
        updates.expiryDate = "Lifetime";
      } else if (user1.expiryDate || user2.expiryDate) {
        const t1 = user1.expiryDate ? new Date(user1.expiryDate).getTime() : 0;
        const t2 = user2.expiryDate ? new Date(user2.expiryDate).getTime() : 0;
        updates.expiryDate = t1 > t2 ? user1.expiryDate : user2.expiryDate;
      }
      
      // Merge access contents
      if (user1.assignedContent || user2.assignedContent) {
        updates.assignedContent = Array.from(new Set([...(user1.assignedContent || []), ...(user2.assignedContent || [])]));
      }

      // Merge favorites
      if (user1.favorites || user2.favorites) {
        updates.favorites = Array.from(new Set([...(user1.favorites || []), ...(user2.favorites || [])]));
      }

      // Merge watchLater
      if (user1.watchLater || user2.watchLater) {
        updates.watchLater = Array.from(new Set([...(user1.watchLater || []), ...(user2.watchLater || [])]));
      }

      // Missing fields from user2 to user1
      const excludeKeys = ['uid', 'id', 'email', 'phone', 'expiryDate', 'assignedContent', 'favorites', 'watchLater', 'role', 'status', 'managedBy', 'createdAt', 'updatedAt'];
      Object.keys(user2).forEach(key => {
        if (!excludeKeys.includes(key) && (user1 as any)[key] === undefined && (user2 as any)[key] !== undefined) {
          updates[key] = (user2 as any)[key];
        }
      });

      updates.updatedAt = new Date().toISOString();

      batch.update(u1Ref, updates);
      batch.delete(u2Ref);
      batch.set(doc(db, 'chunk_meta', 'versions'), { users: { [user1.uid]: getUtcVersion(), [user2.uid]: deleteField() } }, { merge: true });

      // Migrate FCM token from user2 to user1 if present
      if ((user2 as any).fcmToken && !(user1 as any).fcmToken) {
        updates.fcmToken = (user2 as any).fcmToken;
      }

      // Re-assign any content they added (for Content Management Tab)
      const contentUpdates = contentList
        .filter(c => c.addedBy === user2.uid)
        .map(c => ({
          id: c.id,
          chunkId: c.chunkId,
          fields: { addedBy: user1.uid }
        }));
        
      if (contentUpdates.length > 0) {
        await updateContentFields(contentUpdates);
      }

      await batch.commit();

      setAlertConfig({ isOpen: true, title: 'Success', message: 'Users merged successfully' });
      setSelectedUsers([]);
    } catch (error) {
      console.error('Error merging users:', error);
      setAlertConfig({ isOpen: true, title: 'Error', message: 'Failed to merge users' });
      handleFirestoreError(error, OperationType.UPDATE, `users/${user1.uid}`);
    } finally {
      setProcessing(prev => ({ ...prev, bulk: false }));
    }
  };

  const handleBulkStatusChange = async (status: 'active' | 'pending' | 'suspended' | 'expired') => {
    if (!window.confirm(`Are you sure you want to change the status of ${selectedUsers.length} users to ${status}?`)) return;
    
    setProcessing(prev => ({ ...prev, bulk: true }));
    const currentSelected = [...selectedUsers];
    setSelectedUsers([]);
    
    try {
      currentSelected.forEach(uid => {
        const user = users.find(u => u.uid === uid);
        if (user?.role !== 'owner') {
          updateUserFields(uid, { status });
          if (status === 'expired') {
            changedToExpiredUidsRef.current.add(uid);
          }
        }
      });
      await finalizeUserChanges(true);
    } catch (error) {
      console.error('Error updating users:', error);
      setAlertConfig({ isOpen: true, title: 'Error', message: 'Failed to update users' });
      setProcessing(prev => ({ ...prev, bulk: false }));
      handleFirestoreError(error, OperationType.UPDATE, 'users/bulk');
    } finally {
      setProcessing(prev => ({ ...prev, bulk: false }));
    }
  };

  const handleBulkRoleChange = async (role: Role) => {
    if (!window.confirm(`Are you sure you want to change the role of ${selectedUsers.length} users to ${role}?`)) return;
    
    setProcessing(prev => ({ ...prev, bulk: true }));
    const currentSelected = [...selectedUsers];
    setSelectedUsers([]);
    
    try {
      const batchUpdates: Record<string, Partial<UserProfile>> = {};
      currentSelected.forEach(uid => {
        const user = users.find(u => u.uid === uid);
        if (user?.role !== 'owner' && uid !== profile?.uid) {
          batchUpdates[uid] = { role };
        }
      });
      if (Object.keys(batchUpdates).length > 0) {
        updateMultipleUserFields(batchUpdates);
        await finalizeUserChanges(true);
      }
    } catch (error) {
      console.error('Error updating user roles:', error);
      setAlertConfig({ isOpen: true, title: 'Error', message: 'Failed to update user roles' });
      setProcessing(prev => ({ ...prev, bulk: false }));
      handleFirestoreError(error, OperationType.UPDATE, 'users/bulk');
    } finally {
      setProcessing(prev => ({ ...prev, bulk: false }));
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortOrder === 'asc' ? <ArrowUp className="w-4 h-4 inline ml-1" /> : <ArrowDown className="w-4 h-4 inline ml-1" />;
  };

  const filteredAndSortedUsers = useMemo(() => {
    let result = [...users];

    // Filter
    result = result.filter(u => u.role !== 'owner');

    if (hideAnonymousAndInvalid) {
      result = result.filter(u => {
        const hasEmail = u.email && typeof u.email === 'string' && u.email.trim() !== '' && !u.email.endsWith('@moviznow.com');
        const phoneDigits = u.phone ? u.phone.replace(/\D/g, '') : '';
        // Real phone numbers are at least 10 digits if they don't start with 92, and at least 12 digits if they start with 92
        const hasRealPhone = phoneDigits.length >= 10 && (phoneDigits.startsWith('92') ? phoneDigits.length >= 12 : true);
        
        // Check if the displayName is a dummy name
        const isDummyName = !u.displayName || u.displayName.trim() === '' || u.displayName.toLowerCase().startsWith('user (');
        
        if (!hasEmail && isDummyName && !hasRealPhone) {
          return false;
        }
        return true;
      });
    }
    
    if (searchTerm) {
      result = smartSearch(result, searchTerm, ['displayName', 'email', 'phone', 'uid', 'city', 'preferredLanguage', 'device.os', 'device.model', 'device.type'] as any);
    }
    if (filterRole !== 'all') {
      result = result.filter(u => u.role === filterRole);
    }
    if (filterLanguage !== 'all') {
      if (filterLanguage === 'none') {
        result = result.filter(u => !u.preferredLanguage);
      } else {
        result = result.filter(u => u.preferredLanguage === filterLanguage);
      }
    }
    if (filterStatus !== 'all') {
      result = result.filter(u => u.status === filterStatus);
    }
    if (filterReward !== 'all') {
      const referredSet = new Set(allUsers.filter(au => au.referredBy).map(au => au.referredBy));
      if (filterReward === 'notification') {
        result = result.filter(u => u.notificationRewardClaimed);
      } else if (filterReward === 'pwa') {
        result = result.filter(u => u.pwaRewardClaimed);
      } else if (filterReward === 'review') {
        result = result.filter(u => u.reviewRewardClaimed);
      } else if (filterReward === 'referred') {
        result = result.filter(u => referredSet.has(u.uid));
      } else if (filterReward === 'joined_referral') {
        result = result.filter(u => u.hasReceivedReferralReward || u.referredBy);
      } else if (filterReward === 'active') {
        result = result.filter(u => u.activationRewardClaimed);
      } else if (filterReward === 'any_reward') {
        result = result.filter(u => 
          u.notificationRewardClaimed || 
          u.pwaRewardClaimed || 
          u.reviewRewardClaimed ||
          u.activationRewardClaimed || 
          u.hasReceivedReferralReward || 
          u.referredBy || 
          referredSet.has(u.uid)
        );
      } else if (filterReward === 'none') {
        result = result.filter(u => 
          !u.notificationRewardClaimed && 
          !u.pwaRewardClaimed && 
          !u.reviewRewardClaimed &&
          !u.activationRewardClaimed && 
          !u.hasReceivedReferralReward && 
          !u.referredBy && 
          !referredSet.has(u.uid)
        );
      }
    }

    // Sort
    result.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'createdAt': {
          const getT = (val: any) => {
            if (!val || val === 'null' || val === 'undefined' || val === '') return 0;
            if (typeof val === 'object') {
              if (val.toMillis) return val.toMillis();
              if (val.seconds) return val.seconds * 1000;
            }
            const t = new Date(val).getTime();
            return isNaN(t) ? 0 : t;
          };
          const timeA = getT(a.createdAt);
          const timeB = getT(b.createdAt);
          comparison = sortOrder === 'asc' ? timeA - timeB : timeB - timeA;
          break;
        }
        case 'lastActive': {
          const getT = (val: any) => {
            if (!val || val === 'null' || val === 'undefined' || val === '') return 0;
            if (typeof val === 'object') {
              if (val.toMillis) return val.toMillis();
              if (val.seconds) return val.seconds * 1000;
            }
            const t = new Date(val).getTime();
            return isNaN(t) ? 0 : t;
          };
          const timeA = getT(a.lastActive);
          const timeB = getT(b.lastActive);
          // If sorting desc, put never active (0) at bottom
          if (timeA === 0 && timeB !== 0) return 1;
          if (timeB === 0 && timeA !== 0) return -1;
          comparison = sortOrder === 'asc' ? timeA - timeB : timeB - timeA;
          break;
        }
        case 'displayName': {
          const nameA = (getUserDisplayName(a) || a.displayName || a.email || a.phone || '').toLowerCase();
          const nameB = (getUserDisplayName(b) || b.displayName || b.email || b.phone || '').toLowerCase();
          comparison = sortOrder === 'asc' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
          break;
        }
        case 'phone': {
          const phoneA = (a.phone || '').replace(/\D/g, '');
          const phoneB = (b.phone || '').replace(/\D/g, '');
          comparison = sortOrder === 'asc' ? phoneA.localeCompare(phoneB) : phoneB.localeCompare(phoneA);
          break;
        }
        case 'expiryDate': {
          const getExpiryT = (u: UserProfile) => {
            if (u.role === 'owner' || u.expiryDate === 'Lifetime') {
              return Number.MAX_SAFE_INTEGER;
            }
            const val = u.expiryDate;
            if (!val || val === 'null' || val === 'undefined' || val === '') return 0;
            if (typeof val === 'object') {
              if ((val as any).toMillis) return (val as any).toMillis();
              if ((val as any).seconds) return (val as any).seconds * 1000;
            }
            if (typeof val === 'string') {
              const cleanStr = val.trim();
              if (/^\d{4}-\d{2}-\d{2}$/.test(cleanStr)) {
                const parts = cleanStr.split('-');
                const y = parseInt(parts[0], 10);
                const m = parseInt(parts[1], 10) - 1;
                const d = parseInt(parts[2], 10);
                const dateObj = new Date(y, m, d, 23, 59, 59, 999);
                return isNaN(dateObj.getTime()) ? 0 : dateObj.getTime();
              }
            }
            const t = new Date(val).getTime();
            return isNaN(t) ? 0 : t;
          };
          const timeA = getExpiryT(a);
          const timeB = getExpiryT(b);

          if (sortOrder === 'asc') {
            // In ascending order: users with no expiry date (0) go to bottom
            if (timeA === 0 && timeB !== 0) return 1;
            if (timeB === 0 && timeA !== 0) return -1;
            comparison = timeA - timeB;
          } else {
            // In descending order: Lifetime (MAX_SAFE_INTEGER) at top, valid dates next, no expiry (0) at bottom
            if (timeA === 0 && timeB !== 0) return 1;
            if (timeB === 0 && timeA !== 0) return -1;
            comparison = timeB - timeA;
          }
          break;
        }
      }

      // Stable tie-breaker if primary comparison is equal
      if (comparison === 0) {
        const createA = (a.createdAt || '').toString();
        const createB = (b.createdAt || '').toString();
        return createB.localeCompare(createA);
      }
      return comparison;
    });

    return result;
  }, [users, searchTerm, filterRole, filterStatus, filterLanguage, filterReward, sortField, sortOrder, allUsers, hideAnonymousAndInvalid]);

  const handleAddUser = async () => {
    if (!foundUser && !newUserForm.phone && !newUserForm.email) {
      setAlertConfig({ isOpen: true, title: 'Error', message: 'Please provide a WhatsApp Number or Email.' });
      return;
    }

    setProcessing(prev => ({ ...prev, addUser: true }));
    try {
      if (foundUser) {
        // Claim existing pending user
        const updateData: any = {
          managedBy: profile?.uid,
          role: newUserForm.role,
          status: newUserForm.status,
          displayName: newUserForm.displayName || foundUser.displayName,
          city: newUserForm.city || foundUser.city
        };
        
        if (newUserForm.expiryDate) {
          if (newUserForm.expiryDate === 'Lifetime') {
            updateData.expiryDate = 'Lifetime';
          } else {
            const dateStr = newUserForm.expiryDate.split('T')[0];
            updateData.expiryDate = `${dateStr}T23:59:59.999Z`;
          }
        }
        
        updateUserFields((foundUser as any).id, updateData);
        await finalizeUserChanges(true);
        setAlertConfig({ isOpen: true, title: 'Success', message: 'Pending user claimed successfully.' });
      } else {
        const standardizedPhone = newUserForm.phone ? standardizePhone(newUserForm.phone) : '';
        const digits = standardizedPhone.replace(/\D/g, '');
        const emailToMatch = newUserForm.email ? newUserForm.email.trim().toLowerCase() : `${digits}@moviznow.com`;

        // Check if user is allowed to add new users
        if ((profile?.role as string) === 'user_manager' || (profile?.role as string) === 'manager') {
          setAlertConfig({ isOpen: true, title: 'Error', message: 'No pending user found with that phone or email. Managers can only claim existing pending users.' });
        } else {
          // No matches, create new pending user
          
          let existingUser: any = null;
          if (standardizedPhone) {
            const existing = await findUsersByEmailOrPhone(standardizedPhone);
            if (existing.length > 0) existingUser = existing[0];
          }
          if (!existingUser && emailToMatch && emailToMatch.indexOf('@moviznow.com') === -1) {
            const existing = await findUsersByEmailOrPhone(emailToMatch);
            if (existing.length > 0) existingUser = existing[0];
          }

          if (existingUser) {
            let defaultExpiryDate: string | null = existingUser.expiryDate || null;
            if (newUserForm.expiryDate) {
              if (newUserForm.expiryDate === 'Lifetime') {
                defaultExpiryDate = 'Lifetime';
              } else {
                const dateStr = newUserForm.expiryDate.split('T')[0];
                defaultExpiryDate = `${dateStr}T23:59:59.999Z`;
              }
            } else if (newUserForm.status === 'active' && (newUserForm.role as string) !== 'owner' && (newUserForm.role as string) !== 'admin') {
              const defaultExp = new Date();
              defaultExp.setDate(defaultExp.getDate() + 30);
              const dateStr = defaultExp.toISOString().split('T')[0];
              defaultExpiryDate = `${dateStr}T23:59:59.999Z`;
            }

            const updateData: any = {
              role: newUserForm.role,
              status: newUserForm.status,
              expiryDate: defaultExpiryDate,
              displayName: newUserForm.displayName.trim() || existingUser.displayName,
              city: newUserForm.city || existingUser.city
            };
            if ((profile?.role as string) === 'user_manager' || (profile?.role as string) === 'manager') {
              updateData.managedBy = profile.uid;
            }
            updateUserFields(existingUser.uid, updateData);
            await finalizeUserChanges(true);
            setAlertConfig({ isOpen: true, title: 'Success', message: `Existing user account (${existingUser.email || existingUser.phone}) updated successfully.` });
            setProcessing(prev => ({ ...prev, addUser: false }));
            return;
          }
          
          const newUserId = `pending_${Date.now()}`;
          let defaultExpiryDate: string | null = null;
          if (newUserForm.expiryDate && newUserForm.expiryDate !== 'Lifetime') {
            const dateStr = newUserForm.expiryDate.split('T')[0];
            defaultExpiryDate = `${dateStr}T23:59:59.999Z`;
          } else if (newUserForm.expiryDate === 'Lifetime') {
            defaultExpiryDate = 'Lifetime';
          } else if (newUserForm.status === 'active' && newUserForm.role !== 'owner' && newUserForm.role !== 'admin') {
            const defaultExp = new Date();
            defaultExp.setDate(defaultExp.getDate() + 30);
            const dateStr = defaultExp.toISOString().split('T')[0];
            defaultExpiryDate = `${dateStr}T23:59:59.999Z`;
          }

          const newUserData: any = {
            uid: newUserId,
            email: emailToMatch,
            phone: standardizedPhone,
            displayName: newUserForm.displayName.trim() || (standardizedPhone ? `User (${standardizedPhone})` : `User ${newUserId.slice(-6)}`),
            city: newUserForm.city || '',
            role: newUserForm.role,
            status: newUserForm.status,
            expiryDate: defaultExpiryDate,
            hasPassword: false,
            createdAt: new Date().toISOString(),
            isUserManager: (newUserForm.role as string) === 'user_manager' || (newUserForm.role as string) === 'manager'
          };

          if ((profile?.role as string) === 'user_manager' || (profile?.role as string) === 'manager') {
            newUserData.managedBy = profile.uid;
          }

          const batch = writeBatch(db);
          batch.set(doc(db, 'users', newUserId), newUserData);
          batch.set(doc(db, 'chunk_meta', 'versions'), { users: { [newUserId]: getUtcVersion() } }, { merge: true });
          await batch.commit();
          
          setAlertConfig({ isOpen: true, title: 'Success', message: 'Pending user added successfully.' });
          refreshUsers(true).catch(console.error);
        }
      }
      
      setIsAddUserModalOpen(false);
      setNewUserForm({ email: '', phone: '', displayName: '', city: '', role: 'user', status: 'pending', expiryDate: '' });
      setFoundUser(null);
      setSearchStatus('idle');
      if (foundUser) {
        refreshUsers(true).catch(console.error);
      }
    } catch (error) {
      console.error('Error adding/claiming user:', error);
      setAlertConfig({ isOpen: true, title: 'Error', message: 'Failed to add/claim user.' });
    } finally {
      setProcessing(prev => ({ ...prev, addUser: false }));
    }
  };

  return (
    <div className="flex flex-col min-h-full">
      {/* Line 1: Title and Add User (Non-sticky) */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl md:text-3xl font-bold">Membership Management</h1>
          {(isMountRefreshing || isManualRefreshing) && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 rounded-full animate-pulse border border-emerald-500/20">
              <RefreshCw className="w-3 h-3 animate-spin" />
              Syncing latest...
            </span>
          )}
          {managedByFilter && (
            <button
              onClick={() => {
                searchParams.delete('managedBy');
                navigate(`${location.pathname}?${searchParams.toString()}`);
              }}
              className="px-3 py-1 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-sm rounded-lg transition-colors"
            >
              Clear Manager Filter
            </button>
          )}
        </div>
        { ((profile?.role as string) === 'user_manager' || (profile?.role as string) === 'manager' || profile?.role === 'admin' || profile?.role === 'owner') && (
          <div className="flex gap-2">
            <Button
              onClick={() => {
                if (isManualRefreshing) return;
                setIsManualRefreshing(true);
                window.dispatchEvent(new CustomEvent('sync_status', { detail: { status: 'syncing', message: 'Refreshing users...' } }));
                
                const doSync = async () => {
                   // 1. Finalize any pending user edits first
                   const pendingStr = safeStorage.getItem('pending_user_updates');
                   if (pendingStr) {
                     try {
                       const parsed = JSON.parse(pendingStr);
                       if (Object.keys(parsed).length > 0) {
                         await finalizeUserChanges(true);
                       }
                     } catch(e) {
                       console.warn("Finalize user changes warning:", e);
                     }
                   }
                   // 2. Refresh users (uses saved chunk meta during 60s cooldown, or fetches server if cooldown expired)
                   const res = await refreshUsers(true);
                   return res;
                };
                
                doSync().then((res) => {
                  if (res?.updatedSomething) {
                    window.dispatchEvent(new CustomEvent('sync_status', { detail: { status: 'success', message: 'Users refreshed successfully' } }));
                  } else {
                    window.dispatchEvent(new CustomEvent('sync_status', { detail: { status: 'up-to-date', message: 'Users are up to date' } }));
                  }
                }).catch((err) => {
                  console.error("Manual refresh failed:", err);
                  window.dispatchEvent(new CustomEvent('sync_status', { detail: { status: 'error', message: 'Failed to refresh users' } }));
                }).finally(() => {
                  setIsManualRefreshing(false);
                });
              }}
              disabled={isManualRefreshing}
              variant="ghost"
              className={`px-3 ${hasPendingChanges ? 'bg-yellow-500/10 text-yellow-600 hover:bg-yellow-500/20' : 'text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700'}`}
              icon={<RefreshCw className={`w-5 h-5 ${(usersLoading || isManualRefreshing || isMountRefreshing) ? 'animate-spin' : ''}`} />}
              title={hasPendingChanges ? "Sync pending changes" : "Refresh users"}
            />
            {(profile?.role === 'admin' || profile?.role === 'owner') && (
              <Button
                onClick={() => setIsWhitelistModalOpen(true)}
                variant="secondary"
                className="px-3"
                icon={<Phone className="w-5 h-5" />}
                title="Phone Whitelist"
              />
            )}
            <Button
              onClick={() => setIsAddUserModalOpen(true)}
              variant="emerald"
              className="px-3"
              icon={<UserPlus className="w-5 h-5" />}
              title={(profile?.role === 'admin' || profile?.role === 'owner') ? 'Add User' : 'Add Pending User'}
            />
          </div>
        )}
      </div>

      {/* Sticky Header: Search and Filters */}
      <div className="sticky top-16 md:top-0 z-30 bg-white dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 -mx-4 md:-mx-8 px-4 md:px-8 py-3 mb-6 transition-colors duration-300">
        <div className="space-y-3">
          {/* Line 2: Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              placeholder="Search users by name, email, phone or ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-9 pr-4 py-2 focus:outline-none focus:border-emerald-500 text-sm"
            />
          </div>

          {/* Line 3: Filters and Bulk Actions */}
          <div className="flex flex-wrap gap-3 items-center">
            {selectedUsers.length > 0 && (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-1.5">
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">{selectedUsers.length} selected</span>
                  <select
                    onChange={(e) => {
                      if (e.target.value) {
                        if (e.target.value === 'merge') {
                          handleMergeUsers();
                        } else if (e.target.value === 'delete_selected') {
                          handleBulkDeleteUsers();
                        } else if (e.target.value.startsWith('role_')) {
                          const targetRole = e.target.value.substring(5) as Role;
                          handleBulkRoleChange(targetRole);
                        } else {
                          handleBulkStatusChange(e.target.value as any);
                        }
                        e.target.value = '';
                      }
                    }}
                    className="bg-transparent border-none text-xs focus:outline-none text-emerald-500 font-medium cursor-pointer"
                  >
                    <option value="">Bulk Actions</option>
                    <optgroup label="Change Status" className="text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-900">
                      <option value="active">Set Active</option>
                      <option value="pending">Set Pending</option>
                      <option value="expired">Set Expired</option>
                      {(profile?.role === 'admin' || profile?.role === 'owner') && (
                        <option value="suspended">Suspend</option>
                      )}
                    </optgroup>
                    <optgroup label="Change Role" className="text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-900">
                      <option value="role_user">Set Role: User</option>
                      <option value="role_basic">Set Role: Basic (With Ads)</option>
                      <option value="role_vip">Set Role: VIP (Ad-Free)</option>
                      <option value="role_trial">Set Role: Trial</option>
                      <option value="role_selected_content">Set Role: Selected Content</option>
                      {(profile?.role === 'admin' || profile?.role === 'owner') && (
                        <>
                          <option value="role_admin">Set Role: Admin</option>
                          <option value="role_manager">Set Role: Manager</option>
                          <option value="role_user_manager">Set Role: User Manager</option>
                          <option value="role_content_manager">Set Role: Content Manager</option>
                        </>
                      )}
                    </optgroup>
                    <optgroup label="Danger Zone" className="text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-900">
                      {selectedUsers.length === 2 && (profile?.role === 'admin' || profile?.role === 'owner') && (
                        <option value="merge">Merge Users</option>
                      )}
                      <option value="delete_selected" className="text-red-500 font-semibold">Delete Selected Users ({selectedUsers.length})</option>
                    </optgroup>
                  </select>
                </div>
                <button
                  type="button"
                  onClick={handleBulkDeleteUsers}
                  disabled={processing.delete || processing.bulk}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-500 hover:text-white bg-red-500/10 hover:bg-red-600 border border-red-500/30 rounded-lg transition-colors disabled:opacity-50 shrink-0 cursor-pointer"
                  title="Delete all selected users and their data"
                >
                  {processing.delete || processing.bulk ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
                  <span>Delete ({selectedUsers.length})</span>
                </button>
              </div>
            )}
            <div className="flex gap-2 flex-1 overflow-x-auto pb-1 md:pb-0 items-center">
              {(searchTerm || filterRole !== 'all' || filterStatus !== 'all' || filterLanguage !== 'all' || filterReward !== 'all' || sortField !== 'createdAt' || sortOrder !== 'desc' || !hideAnonymousAndInvalid) && (
                <button
                  onClick={() => {
                    setSearchTerm('');
                    setFilterRole('all');
                    setFilterStatus('all');
                    setFilterLanguage('all');
                    setFilterReward('all');
                    setSortField('createdAt');
                    setSortOrder('desc');
                    setHideAnonymousAndInvalid(true);
                  }}
                  className="p-1.5 text-zinc-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors shrink-0"
                  title="Reset Filters & Sorting"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
              <select
                value={filterRole}
                onChange={(e) => setFilterRole(e.target.value as any)}
                className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-1.5 focus:outline-none focus:border-emerald-500 min-w-[120px] text-xs"
              >
                <option value="all">All Roles</option>
                <option value="user">User</option>
                <option value="basic">Basic User (With Ads)</option>
                <option value="vip">VIP User (Ad-Free)</option>
                <option value="trial">Trial</option>
                <option value="selected_content">Selected Content</option>
                {(profile?.role === 'admin' || profile?.role === 'owner') && (
                  <>
                    <option value="content_manager">Content Manager</option>
                    <option value="user_manager">User Manager</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Admin</option>
                  </>
                )}
              </select>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as any)}
                className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-1.5 focus:outline-none focus:border-emerald-500 min-w-[120px] text-xs"
              >
                <option value="all">All Statuses</option>
                <option value="active">Active</option>
                <option value="pending">Pending</option>
                <option value="expired">Expired</option>
              </select>
              <select
                value={filterReward}
                onChange={(e) => setFilterReward(e.target.value)}
                className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-1.5 focus:outline-none focus:border-emerald-500 min-w-[120px] text-xs"
              >
                <option value="all">All Users</option>
                <option value="any_reward">All Rewards</option>
                <option value="none">No Rewards</option>
                <option value="notification">Notification Reward</option>
                <option value="pwa">App Install Reward</option>
                <option value="review">Review Reward</option>
                <option value="referred">Referred Users</option>
                <option value="active">Activation Reward</option>
                <option value="joined_referral">Joined via Referral</option>
              </select>
              <select
                value={filterLanguage}
                onChange={(e) => setFilterLanguage(e.target.value)}
                className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-1.5 focus:outline-none focus:border-emerald-500 min-w-[120px] text-xs"
              >
                <option value="all">All Languages</option>
                <option value="en">English</option>
                <option value="ur">Urdu</option>
                <option value="ur-roman">Roman Urdu</option>
                <option value="none">No Language</option>
              </select>
              
              <label className="flex items-center gap-2 cursor-pointer bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-1.5 shrink-0 select-none">
                <input
                  type="checkbox"
                  checked={hideAnonymousAndInvalid}
                  onChange={(e) => setHideAnonymousAndInvalid(e.target.checked)}
                  className="w-3.5 h-3.5 text-emerald-500 rounded border-zinc-300 dark:border-zinc-700 focus:ring-emerald-500 bg-zinc-50 dark:bg-zinc-900 cursor-pointer"
                />
                <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Hide Anonymous & Invalid</span>
              </label>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1">

      {loading ? (
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500"></div>
        </div>
      ) : (
        <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-white/50 dark:bg-zinc-950/50 text-zinc-500 dark:text-zinc-400 uppercase font-semibold">
                <tr>
                  <th className="px-3 md:px-4 py-4 w-12 whitespace-nowrap">
                    <input 
                      type="checkbox" 
                      checked={selectedUsers.length === filteredAndSortedUsers.length && filteredAndSortedUsers.length > 0}
                      onChange={handleSelectAll}
                      className="w-4 h-4 rounded border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-zinc-950"
                    />
                  </th>
                  <th className="px-3 md:px-4 py-4 cursor-pointer hover:text-zinc-900 dark:text-white transition-colors whitespace-nowrap max-w-[200px] md:max-w-[250px]" onClick={() => toggleSort('displayName')}>
                    User Info <SortIcon field="displayName" />
                  </th>
                <th className="px-3 md:px-4 py-4 cursor-pointer hover:text-zinc-900 dark:text-white transition-colors whitespace-nowrap" onClick={() => toggleSort('lastActive')}>
                  Role & Last <SortIcon field="lastActive" />
                </th>
                <th className="px-3 md:px-4 py-4 cursor-pointer hover:text-zinc-900 dark:text-white transition-colors whitespace-nowrap" onClick={() => toggleSort('expiryDate')}>
                  Expiry Date <SortIcon field="expiryDate" />
                </th>
                <th className="px-3 md:px-4 py-4 text-right whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {filteredAndSortedUsers.map((user) => (
                <tr key={user.uid} onClick={(e) => handleRowClick(user, e)} className="hover:bg-zinc-200 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer">
                  <td className="px-3 md:px-4 py-4" onClick={(e) => e.stopPropagation()}>
                    {user.role !== 'owner' && (
                      <input 
                        type="checkbox" 
                        checked={selectedUsers.includes(user.uid)}
                        onChange={(e) => {
                          e.stopPropagation();
                          handleSelectUser(user.uid, e as any);
                        }}
                        className="w-4 h-4 rounded border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-zinc-950"
                      />
                    )}
                  </td>
                  <td className="px-3 md:px-4 py-4 max-w-[200px] md:max-w-[250px]">
                    <div className="flex items-center gap-3">
                      {user.photoURL && user.photoURL.trim() !== "" ? (
                        <img src={user.photoURL} alt={user.displayName || 'User'} className="w-10 h-10 rounded-full object-cover shrink-0" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-500 dark:text-zinc-400 font-bold shrink-0">
                          {(user.displayName || user.email || '?').charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-zinc-900 dark:text-white flex items-center gap-2 truncate">
                          {getUserDisplayName(user)} {user.city && <span className="text-zinc-500 font-normal">({user.city})</span>}
                        </div>
                        <div className="text-zinc-500 dark:text-zinc-400 text-xs mt-0.5 truncate" title={user.email}>
                          {user.email && !user.email.endsWith('@moviznow.com') ? user.email : (user.phone ? `${user.phone} (Phone)` : 'No Email')}
                        </div>
                        <div className="text-zinc-500 text-xs mt-0.5 flex items-center gap-1 truncate">
                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                          {user.phone || 'No phone'}
                        </div>

                      </div>
                    </div>
                  </td>
                  <td className="px-3 md:px-4 py-4 whitespace-nowrap">
                    <div className="flex flex-col gap-1 items-start">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize
                        ${user.role === 'admin' ? 'bg-purple-500/10 text-purple-500' : 
                          user.role === 'vip' ? 'bg-amber-500/10 text-amber-500 font-bold' :
                          user.role === 'basic' ? 'bg-sky-500/10 text-sky-500 font-bold' :
                          user.role === 'content_manager' ? 'bg-indigo-500/10 text-indigo-500' :
                          user.role === 'user_manager' ? 'bg-blue-500/10 text-blue-500' :
                          user.role === 'manager' ? 'bg-emerald-500/10 text-emerald-500' :
                          user.role === 'selected_content' ? 'bg-pink-500/10 text-pink-500' :
                          user.role === 'trial' ? 'bg-yellow-500/10 text-yellow-500' :
                          'bg-zinc-500/10 text-zinc-500'}`}
                      >
                        {user.role === 'vip' ? 'VIP User' :
                         user.role === 'basic' ? 'Basic User' :
                         user.role === 'selected_content' ? 'Selected Content' : 
                         user.role === 'content_manager' ? 'Content Manager' :
                         user.role === 'user_manager' ? 'User Manager' :
                         user.role === 'manager' ? 'Manager' :
                         user.role === 'user' ? 'User' :
                         user.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1).replace('_', ' ') : 'User'}
                      </span>
                      <div className="flex items-center gap-2 mt-1">
                      {user.role !== 'owner' && (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider
                          ${user.status === 'active' ? 'bg-emerald-500/10 text-emerald-500' : 
                            user.status === 'expired' ? 'bg-red-500/10 text-red-500' : 
                            'bg-yellow-500/10 text-yellow-500'}`}
                        >
                          {user.status || 'pending'}
                        </span>
                      )}
                      {user.notification === 'yes' && (
                        <span title="Notifications Enabled"><Bell className="w-4 h-4 text-emerald-500 dark:text-emerald-400" /></span>
                      )}
                      {user.notification === 'no' && (
                        <span title="Notifications Disabled"><Bell className="w-4 h-4 text-zinc-300 dark:text-zinc-600" /></span>
                      )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {isUserOnline(user.lastActive) && (
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                          </span>
                        )}
                        <span className={`text-[10px] font-medium ${isUserOnline(user.lastActive) ? 'text-emerald-500' : 'text-zinc-500 dark:text-zinc-400'}`}>
                          {isUserOnline(user.lastActive) ? 'Online' : (user.lastActive ? safeDistance(user.lastActive) : 'Never')}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 md:px-4 py-4">
                    <div className="flex flex-col gap-1">
                      <span className="text-zinc-600 dark:text-zinc-300 font-medium">
                        {user.role === 'owner' ? 'Lifetime' : user.expiryDate ? safeFormat(user.expiryDate, 'MMM dd, yyyy') : '-'}
                      </span>
                      {user.referredBy && (() => {
                        const inviter = allUsers.find(u => u.uid === user.referredBy);
                        return (
                          <div className="text-[11px] text-indigo-600 dark:text-indigo-400 font-medium flex flex-wrap items-center gap-0.5">
                            <span className="text-zinc-400 dark:text-zinc-500">Ref by:</span>
                            <span>
                              {inviter 
                                ? (inviter.displayName || inviter.phone || inviter.email || 'User') 
                                : 'Yes'}
                            </span>
                          </div>
                        );
                      })()}
                      {(profile?.role === 'admin' || profile?.role === 'owner') && user.managedBy && (
                        <span className="text-zinc-500 dark:text-zinc-400 text-xs">
                          {managers[user.managedBy] || ''}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 md:px-4 py-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          sendWhatsAppReminder(user);
                        }}
                        className="p-1.5 text-emerald-500 hover:bg-emerald-500/10 rounded-lg transition-colors disabled:opacity-50"
                        title="Send WhatsApp Reminder"
                        disabled={processing[`reminder_${user.uid}`]}
                      >
                        {processing[`reminder_${user.uid}`] ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageCircle className="w-4 h-4" />}
                      </button>
                      {user.role !== 'owner' && user.uid !== profile?.uid && (
                        <>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEdit(user);
                            }} 
                            className="p-1.5 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:text-white hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          {(profile?.role === 'admin' || profile?.role === 'owner') && (
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteConfirm(user.uid);
                              }} 
                              className="p-1.5 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredAndSortedUsers.length === 0 && (
          <div className="p-8 text-center text-zinc-500">
            No users found matching your filters.
          </div>
        )}
      </div>
      )}
    </div>

      {selectedUser && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 md:p-6 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center shrink-0">
              <h2 className="text-xl font-bold">{isEditingOverlay ? 'Edit User' : 'User Details'}</h2>
              <button onClick={() => { setSelectedUser(null); setIsEditingOverlay(false); setEditingId(null); }} className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:text-white transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="overflow-y-auto flex-1">
              {isEditingOverlay ? (
                <div className="p-4 md:p-6 space-y-4">
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-1">Name</label>
                      <input
                        type="text"
                        value={editForm.displayName || ''}
                        onChange={(e) => setEditForm({ ...editForm, displayName: e.target.value })}
                        className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2 focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-1">City</label>
                      <input
                        type="text"
                        value={editForm.city || ''}
                        onChange={(e) => setEditForm({ ...editForm, city: e.target.value })}
                        className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2 focus:outline-none focus:border-emerald-500"
                        placeholder="Enter city"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-1">Email</label>
                    <input
                      type="email"
                      value={editForm.email || ''}
                      onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                      className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2 focus:outline-none focus:border-emerald-500"
                      disabled={(profile?.role as string) === 'user_manager' || (profile?.role as string) === 'manager'}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-1">WhatsApp Number</label>
                    <input
                      type="text"
                      value={editForm.phone || ''}
                      onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                      className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <label className="block text-[10px] font-bold text-zinc-500 uppercase mb-1">Role</label>
                      <select
                        value={editForm.role}
                        onChange={(e) => setEditForm({ ...editForm, role: e.target.value as Role })}
                        disabled={selectedUser.uid === profile?.uid}
                        className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 disabled:opacity-50"
                      >
                        <option value="user">User (Pending/New)</option>
                        <option value="basic">Basic User (With Ads)</option>
                        <option value="vip">VIP User (Ad-Free)</option>
                        <option value="trial">Trial</option>
                        <option value="selected_content">Selected Content</option>
                        {(profile?.role === 'admin' || profile?.role === 'owner') && (
                          <>
                            <option value="content_manager">Content Manager</option>
                            <option value="user_manager">User Manager</option>
                            <option value="manager">Manager</option>
                            <option value="admin">Admin</option>
                          </>
                        )}
                      </select>
                    </div>
                    <div className="flex-1">
                      <label className="block text-[10px] font-bold text-zinc-500 uppercase mb-1">Status</label>
                      <select
                        value={editForm.status || 'active'}
                        onChange={(e) => setEditForm({ ...editForm, status: e.target.value as Status })}
                        disabled={selectedUser.uid === profile?.uid}
                        className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 disabled:opacity-50"
                      >
                        <option value="active">Active</option>
                        <option value="pending">Pending</option>
                        <option value="expired">Expired</option>
                      </select>
                    </div>

                    <ArrowRight className="w-4 h-4 text-zinc-600 shrink-0 mt-5" />

                    <div className="flex-1">
                      <label className="block text-[10px] font-bold text-zinc-500 uppercase mb-1">Expiry Date</label>
                      <input
                        type="date"
                        value={editForm.expiryDate || ''}
                        onChange={(e) => setEditForm({ ...editForm, expiryDate: e.target.value })}
                        disabled={selectedUser.uid === profile?.uid}
                        className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 disabled:opacity-50"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mt-2">
                    <div className="flex-1">
                      <label className="block text-[10px] font-bold text-zinc-500 uppercase mb-1">Gender</label>
                      <select
                        value={editForm.gender || ''}
                        onChange={(e) => setEditForm({ ...editForm, gender: e.target.value })}
                        className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
                      >
                        <option value="">Unknown</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                    <div className="flex-1">
                      <label className="block text-[10px] font-bold text-zinc-500 uppercase mb-1">Date of Birth</label>
                      <input
                        type="date"
                        value={editForm.dob || ''}
                        onChange={(e) => setEditForm({ ...editForm, dob: e.target.value })}
                        className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 md:p-6 space-y-6">
                  <div className="flex items-center gap-4">
                    {selectedUser.photoURL && selectedUser.photoURL.trim() !== "" ? (
                      <img src={selectedUser.photoURL} alt={selectedUser.displayName || 'User'} className="w-16 h-16 rounded-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="w-16 h-16 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center text-2xl font-bold text-emerald-500 shrink-0">
                        {selectedUser.displayName ? selectedUser.displayName.charAt(0).toUpperCase() : '?'}
                      </div>
                    )}
                    <div>
                      <h3 className="text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                        {getUserDisplayName(selectedUser)} 
                      </h3>
                      {selectedUser.city && <p className="text-zinc-600 dark:text-zinc-300 font-medium text-sm">{selectedUser.city}</p>}
                      <p className="text-zinc-500 dark:text-zinc-400 text-sm">{selectedUser.email?.endsWith('@moviznow.com') ? 'No Email' : selectedUser.email}</p>
                      <p className="text-zinc-500 dark:text-zinc-400 text-sm">{selectedUser.phone || 'No WhatsApp Number'}</p>
                      <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                        <span className="text-zinc-500 dark:text-zinc-400 font-mono text-[10px] break-all border border-zinc-200 dark:border-zinc-800 rounded px-1.5 py-0.5 inline-flex items-center gap-1 bg-zinc-50 dark:bg-zinc-900">
                          <span className="font-semibold text-zinc-600 dark:text-zinc-300">UID:</span> {selectedUser.uid}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(selectedUser.uid);
                            setCopiedUid(true);
                            setTimeout(() => setCopiedUid(false), 2000);
                          }}
                          className="text-[10px] px-2 py-0.5 rounded border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 transition-colors flex items-center gap-1"
                          title="Copy exact UID to clipboard"
                        >
                          {copiedUid ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-500" />
                              <span className="text-emerald-500 font-medium">Copied!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3 text-zinc-400" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                        {selectedUser.uid.startsWith('pending_') && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 font-medium border border-amber-500/20" title="This user was added manually or is pending login; UID will convert to Auth UID when they sign in">
                            Pending Auth
                          </span>
                        )}
                      </div>
                      
                      <div className="flex flex-col gap-1 pt-2 mt-2 border-t border-zinc-200 dark:border-zinc-800">
                        <div className="text-xs text-zinc-600 dark:text-zinc-400">
                          <span className="font-semibold text-zinc-900 dark:text-zinc-200">Device:</span>{' '}
                          {selectedUser.device ? (
                            `${selectedUser.device.os} - ${selectedUser.device.model} (${selectedUser.device.type || 'desktop'})`
                          ) : 'N/A'}
                        </div>
                        {selectedUser.preferredLanguage && (
                          <div className="text-xs text-zinc-600 dark:text-zinc-400">
                            <span className="font-semibold text-zinc-900 dark:text-zinc-200">Language:</span>{' '}
                            {selectedUser.preferredLanguage === 'en' ? 'English' : selectedUser.preferredLanguage === 'ur' ? 'Urdu' : selectedUser.preferredLanguage === 'ur-roman' ? 'Roman Urdu' : selectedUser.preferredLanguage}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    <div className="bg-white dark:bg-zinc-950 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 flex justify-between items-center">
                      <div>
                        <div className="text-zinc-500 text-[10px] uppercase font-bold mb-0.5">Role</div>
                        <div className="font-bold text-emerald-400 text-sm">
                          {selectedUser.role === 'vip' ? 'VIP User' :
                           selectedUser.role === 'basic' ? 'Basic User' :
                           selectedUser.role === 'selected_content' ? 'Selected Content' : 
                           selectedUser.role === 'content_manager' ? 'Content Manager' :
                           selectedUser.role === 'user_manager' ? 'User Manager' :
                           selectedUser.role === 'manager' ? 'Manager' :
                           selectedUser.role === 'user' ? 'User' :
                           selectedUser.role ? selectedUser.role.charAt(0).toUpperCase() + selectedUser.role.slice(1).replace('_', ' ') : 'User'}
                        </div>
                      </div>
                      {(profile?.role === 'admin' || profile?.role === 'owner') && (
                        <div className="text-center">
                          <div className="text-zinc-500 text-[10px] uppercase font-bold mb-0.5">Password</div>
                          <button
                            onClick={() => handleResetPassword(selectedUser.uid)}
                            disabled={processing[`reset_${selectedUser.uid}`] || !selectedUser.hasPassword}
                            className="text-xs font-bold text-red-500 hover:text-red-600 transition-colors disabled:opacity-50 flex items-center gap-1 mx-auto"
                            title={!selectedUser.hasPassword ? "User has not set a password yet" : "Force password reset"}
                          >
                            {processing[`reset_${selectedUser.uid}`] ? <Loader2 className="w-3 h-3 animate-spin" /> : <Lock className="w-3 h-3" />}
                            Reset
                          </button>
                        </div>
                      )}
                      <div className="text-right">
                        <div className="text-zinc-500 text-[10px] uppercase font-bold mb-0.5">Status</div>
                        <div className="capitalize font-bold text-zinc-900 dark:text-white text-sm">{selectedUser.status || 'active'}</div>
                      </div>
                    </div>

                    {/* Notification Services Configuration for Admin */}
                    {(() => {
                      const prefs = selectedUser.notificationPreferences || {};
                      const fcmPref = prefs.fcm || {};
                      const emailPref = prefs.email || {};

                      const isFcmMasterEnabled = fcmPref.enabled !== false && selectedUser.notification !== 'no' && !selectedUser.isFcmDisabled;
                      const isEmailMasterEnabled = emailPref.enabled !== false && selectedUser.emailNotificationsEnabled !== false && selectedUser.emailNotificationsDisabled !== true && selectedUser.unsubscribed !== true;

                      const fcmNewContent = fcmPref.newContent !== false;
                      const fcmMembershipAlerts = fcmPref.membershipAlerts !== false && fcmPref.membershipExpiry !== false;

                      const emailLoginAlerts = emailPref.loginAlerts !== false;
                      const emailNewContent = emailPref.newContent !== false;
                      const emailMembershipAlerts = emailPref.membershipAlerts !== false && emailPref.membershipExpiry !== false;

                      const handleUpdateNotificationPrefs = async (newPrefs: any, legacyUpdates: any = {}) => {
                        try {
                          const mergedPrefs = {
                            fcm: {
                              enabled: isFcmMasterEnabled,
                              newContent: fcmNewContent,
                              membershipAlerts: fcmMembershipAlerts,
                              membershipExpiry: fcmMembershipAlerts,
                              ...(newPrefs.fcm || {})
                            },
                            email: {
                              enabled: isEmailMasterEnabled,
                              loginAlerts: emailLoginAlerts,
                              newContent: emailNewContent,
                              membershipAlerts: emailMembershipAlerts,
                              membershipExpiry: emailMembershipAlerts,
                              ...(newPrefs.email || {})
                            }
                          };

                          const updateData = {
                            notificationPreferences: mergedPrefs,
                            ...legacyUpdates
                          };

                          // Instant local UI state update
                          setSelectedUser(prev => prev ? ({ ...prev, ...updateData }) : null);

                          // Save into pending changes buffer (synced when tab switched, exited, or saved)
                          updateUserFields(selectedUser.uid, updateData);
                          await finalizeUserChanges(true);
                        } catch (err) {
                          console.error("Failed to update notification preferences:", err);
                        }
                      };

                      return (
                        <div className="bg-white dark:bg-zinc-950 p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 space-y-3">
                          <div className="flex justify-between items-center border-b border-zinc-100 dark:border-zinc-900 pb-2">
                            <div className="text-zinc-500 text-[10px] uppercase font-bold tracking-wider">
                              Notification Services Configured
                            </div>
                            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-500 dark:text-indigo-400">
                              Admin Editable
                            </span>
                          </div>

                          {/* Service 1: FCM Push Notifications */}
                          <div className="space-y-2">
                            <div className="flex items-center justify-between bg-zinc-50 dark:bg-zinc-900/60 p-2.5 rounded-lg border border-zinc-200/60 dark:border-zinc-800/60">
                              <div className="flex items-center gap-2">
                                <Bell className="w-4 h-4 text-purple-500 shrink-0" />
                                <div>
                                  <div className="font-bold text-xs text-zinc-900 dark:text-white flex items-center gap-1.5">
                                    FCM Push Notifications
                                    <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${isFcmMasterEnabled ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"}`}>
                                      {isFcmMasterEnabled ? "ACTIVE" : "DISABLED"}
                                    </span>
                                  </div>
                                  <p className="text-[10px] text-zinc-500">Real-time mobile & browser device alerts</p>
                                </div>
                              </div>
                              <button
                                onClick={() => handleUpdateNotificationPrefs(
                                  { fcm: { enabled: !isFcmMasterEnabled } },
                                  { notification: !isFcmMasterEnabled ? 'yes' : 'no', isFcmDisabled: isFcmMasterEnabled }
                                )}
                                className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors ${
                                  isFcmMasterEnabled
                                    ? "bg-red-500/10 text-red-500 hover:bg-red-500/20"
                                    : "bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20"
                                }`}
                              >
                                {isFcmMasterEnabled ? "Disable FCM" : "Enable FCM"}
                              </button>
                            </div>

                            {/* FCM Sub-Channels */}
                            {isFcmMasterEnabled && (
                              <div className="grid grid-cols-3 gap-2 pl-2 border-l-2 border-purple-500/30 text-xs">
                                <div className="flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-900/30 p-2 rounded border border-zinc-200/50 dark:border-zinc-800/50">
                                  <span className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">New Content</span>
                                  <button
                                    onClick={() => handleUpdateNotificationPrefs({ fcm: { newContent: !fcmNewContent } })}
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${fcmNewContent ? "bg-emerald-500/20 text-emerald-500" : "bg-zinc-300 dark:bg-zinc-800 text-zinc-500"}`}
                                  >
                                    {fcmNewContent ? "ON" : "OFF"}
                                  </button>
                                </div>
                                <div className="flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-900/30 p-2 rounded border border-zinc-200/50 dark:border-zinc-800/50">
                                  <span className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">Membership Alerts</span>
                                  <button
                                    onClick={() => handleUpdateNotificationPrefs({ fcm: { membershipAlerts: !fcmMembershipAlerts, membershipExpiry: !fcmMembershipAlerts } })}
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${fcmMembershipAlerts ? "bg-emerald-500/20 text-emerald-500" : "bg-zinc-300 dark:bg-zinc-800 text-zinc-500"}`}
                                  >
                                    {fcmMembershipAlerts ? "ON" : "OFF"}
                                  </button>
                                </div>
                                <div className="flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-900/30 p-2 rounded border border-zinc-200/50 dark:border-zinc-800/50">
                                  <span className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">Orders</span>
                                  <button
                                    onClick={() => handleUpdateNotificationPrefs({ fcm: { orders: !(fcmPref.orders !== false) } })}
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${fcmPref.orders !== false ? "bg-emerald-500/20 text-emerald-500" : "bg-zinc-300 dark:bg-zinc-800 text-zinc-500"}`}
                                  >
                                    {fcmPref.orders !== false ? "ON" : "OFF"}
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Service 2: Email Notifications */}
                          <div className="space-y-2">
                            <div className="flex items-center justify-between bg-zinc-50 dark:bg-zinc-900/60 p-2.5 rounded-lg border border-zinc-200/60 dark:border-zinc-800/60">
                              <div className="flex items-center gap-2">
                                <Mail className="w-4 h-4 text-blue-500 shrink-0" />
                                <div>
                                  <div className="font-bold text-xs text-zinc-900 dark:text-white flex items-center gap-1.5">
                                    Email Notifications
                                    <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${isEmailMasterEnabled ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"}`}>
                                      {isEmailMasterEnabled ? "ACTIVE" : "DISABLED"}
                                    </span>
                                  </div>
                                  <p className="text-[10px] text-zinc-500">Security, release newsletters & membership emails</p>
                                </div>
                              </div>
                              <button
                                onClick={() => handleUpdateNotificationPrefs(
                                  { email: { enabled: !isEmailMasterEnabled } },
                                  {
                                    emailNotificationsEnabled: !isEmailMasterEnabled,
                                    emailNotificationsDisabled: isEmailMasterEnabled,
                                    unsubscribed: isEmailMasterEnabled
                                  }
                                )}
                                className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors ${
                                  isEmailMasterEnabled
                                    ? "bg-red-500/10 text-red-500 hover:bg-red-500/20"
                                    : "bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20"
                                }`}
                              >
                                {isEmailMasterEnabled ? "Disable Email" : "Enable Email"}
                              </button>
                            </div>

                            {/* Email Sub-Channels */}
                            {isEmailMasterEnabled && (
                              <div className="grid grid-cols-2 gap-1.5 pl-2 border-l-2 border-blue-500/30 text-xs">
                                <div className="flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-900/30 p-2 rounded border border-zinc-200/50 dark:border-zinc-800/50">
                                  <span className="text-[10px] font-semibold text-zinc-700 dark:text-zinc-300 truncate">Login Alerts</span>
                                  <button
                                    onClick={() => handleUpdateNotificationPrefs({ email: { loginAlerts: !emailLoginAlerts } })}
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 ${emailLoginAlerts ? "bg-emerald-500/20 text-emerald-500" : "bg-zinc-300 dark:bg-zinc-800 text-zinc-500"}`}
                                  >
                                    {emailLoginAlerts ? "ON" : "OFF"}
                                  </button>
                                </div>
                                <div className="flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-900/30 p-2 rounded border border-zinc-200/50 dark:border-zinc-800/50">
                                  <span className="text-[10px] font-semibold text-zinc-700 dark:text-zinc-300 truncate">New Content</span>
                                  <button
                                    onClick={() => handleUpdateNotificationPrefs({ email: { newContent: !emailNewContent } })}
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 ${emailNewContent ? "bg-emerald-500/20 text-emerald-500" : "bg-zinc-300 dark:bg-zinc-800 text-zinc-500"}`}
                                  >
                                    {emailNewContent ? "ON" : "OFF"}
                                  </button>
                                </div>
                                <div className="flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-900/30 p-2 rounded border border-zinc-200/50 dark:border-zinc-800/50">
                                  <span className="text-[10px] font-semibold text-zinc-700 dark:text-zinc-300 truncate">Membership</span>
                                  <button
                                    onClick={() => handleUpdateNotificationPrefs({ email: { membershipAlerts: !emailMembershipAlerts, membershipExpiry: !emailMembershipAlerts } })}
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 ${emailMembershipAlerts ? "bg-emerald-500/20 text-emerald-500" : "bg-zinc-300 dark:bg-zinc-800 text-zinc-500"}`}
                                  >
                                    {emailMembershipAlerts ? "ON" : "OFF"}
                                  </button>
                                </div>
                                <div className="flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-900/30 p-2 rounded border border-zinc-200/50 dark:border-zinc-800/50">
                                  <span className="text-[10px] font-semibold text-zinc-700 dark:text-zinc-300 truncate">Orders</span>
                                  <button
                                    onClick={() => handleUpdateNotificationPrefs({ email: { orders: !(emailPref.orders !== false) } })}
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 ${emailPref.orders !== false ? "bg-emerald-500/20 text-emerald-500" : "bg-zinc-300 dark:bg-zinc-800 text-zinc-500"}`}
                                  >
                                    {emailPref.orders !== false ? "ON" : "OFF"}
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                    
                    <div className="bg-white dark:bg-zinc-950 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 flex justify-between items-center">
                      <div>
                        <div className="text-zinc-500 text-[10px] uppercase font-bold mb-0.5">Joined</div>
                        <div className="font-bold text-zinc-900 dark:text-white text-sm">{safeFormat(selectedUser.createdAt, 'MMM dd, yyyy')}</div>
                      </div>
                      <div className="text-center px-2 border-x border-zinc-100 dark:border-zinc-800/50">
                        <div className="text-zinc-500 text-[10px] uppercase font-bold mb-0.5">Gender / Age</div>
                        <div className="font-bold text-zinc-900 dark:text-white text-sm flex items-center justify-center gap-1.5 flex-wrap">
                          <span className="capitalize">{typeof selectedUser.gender === 'string' ? (selectedUser.gender.toLowerCase() === 'male' ? 'M' : selectedUser.gender.toLowerCase() === 'female' ? 'F' : (selectedUser.gender.toLowerCase() === 'unknown' ? 'Unknown' : 'NA')) : 'NA'}</span>
                          <span className="text-zinc-400 dark:text-zinc-500">·</span>
                          <span>{(() => {
                             if (!selectedUser.dob) return 'NA';
                             if (String(selectedUser.dob) === 'Unknown') return 'Unknown';
                             const d = new Date(selectedUser.dob);
                             if (isNaN(d.getTime())) return String(selectedUser.dob);
                             const today = new Date();
                             let yrs = today.getFullYear() - d.getFullYear();
                             const m = today.getMonth() - d.getMonth();
                             if (m < 0 || (m === 0 && today.getDate() < d.getDate())) {
                               yrs--;
                             }
                             const monthStr = d.toLocaleString('en-US', { month: 'short' });
                             return `${monthStr} ${d.getDate()}, ${d.getFullYear()} (${yrs}Y)`;
                          })()}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-zinc-500 text-[10px] uppercase font-bold mb-0.5">Expiry Date</div>
                        <div className="font-bold text-zinc-900 dark:text-white text-sm">{selectedUser.role === 'owner' ? 'Lifetime' : selectedUser.expiryDate ? safeFormat(selectedUser.expiryDate, 'MMM dd, yyyy') : 'N/A'}</div>
                        {selectedUser.referredBy && (() => {
                          const inviter = allUsers.find(u => u.uid === selectedUser.referredBy);
                          return (
                            <div className="mt-1.5 text-right">
                              <span className="text-[10px] text-zinc-400 dark:text-zinc-500 block uppercase font-bold">Ref by:</span>
                              <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400 block">
                                {inviter 
                                  ? (inviter.displayName || inviter.phone || inviter.email || 'User') 
                                  : 'Yes'}
                              </span>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                    {(() => {
                      const referredUsers = allUsers.filter(u => u.referredBy === selectedUser.uid);
                      const activatedReferredCount = referredUsers.filter(u => u.activationRewardClaimed).length;
                      const hasAnyExtension = selectedUser.pwaRewardClaimed || selectedUser.notificationRewardClaimed || selectedUser.reviewRewardClaimed || selectedUser.hasReceivedReferralReward || selectedUser.referredBy || referredUsers.length > 0;
                      
                      if (!hasAnyExtension) return null;
                      
                      return (
                        <div className="bg-white dark:bg-zinc-950 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800">
                          <div className="text-zinc-500 text-[10px] uppercase font-bold mb-2">Membership Extensions</div>
                          <div className="space-y-1.5">
                            {selectedUser.pwaRewardClaimed && (
                              <div className="flex justify-between items-center text-xs">
                                <span className="text-zinc-600 dark:text-zinc-400">App Install Reward</span>
                                <span className="font-medium text-emerald-600 dark:text-emerald-400">+3 Days</span>
                              </div>
                            )}
                            {selectedUser.notificationRewardClaimed && (
                              <div className="flex justify-between items-center text-xs">
                                <span className="text-zinc-600 dark:text-zinc-400">Notification Reward</span>
                                <span className="font-medium text-emerald-600 dark:text-emerald-400">+3 Days</span>
                              </div>
                            )}
                            {selectedUser.reviewRewardClaimed && (
                              <div className="flex justify-between items-center text-xs">
                                <span className="text-zinc-600 dark:text-zinc-400">Review Reward</span>
                                <span className="font-medium text-emerald-600 dark:text-emerald-400">+5 Days</span>
                              </div>
                            )}
                            {referredUsers.length > 0 && (
                              <div className="flex justify-between items-center text-xs">
                                <span className="text-zinc-600 dark:text-zinc-400">Referred {referredUsers.length} User{referredUsers.length !== 1 ? 's' : ''}</span>
                                <span className="font-medium text-emerald-600 dark:text-emerald-400">+{referredUsers.length * 5} Days</span>
                              </div>
                            )}
                            {activatedReferredCount > 0 && (
                              <div className="flex justify-between items-center text-xs">
                                <span className="text-zinc-600 dark:text-zinc-400">{activatedReferredCount} Referral{activatedReferredCount !== 1 ? 's' : ''} Activated</span>
                                <span className="font-medium text-emerald-600 dark:text-emerald-400">+{activatedReferredCount * 5} Days</span>
                              </div>
                            )}
                            {(selectedUser.hasReceivedReferralReward || selectedUser.referredBy) && (
                              <div className="flex justify-between items-center text-xs">
                                <span className="text-zinc-600 dark:text-zinc-400">Joined via Referral</span>
                                <span className="font-medium text-emerald-600 dark:text-emerald-400">+5 Days</span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    {userReviews[selectedUser.uid] && userReviews[selectedUser.uid].length > 0 && (
                      <div className="bg-white dark:bg-zinc-950 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 flex flex-col gap-3">
                        {userReviews[selectedUser.uid].map((rev, idx) => (
                          <div key={idx} className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <div className="text-zinc-500 text-[10px] uppercase font-bold">App Rating:</div>
                              <div className="flex text-yellow-400">
                                {Array.from({ length: 5 }).map((_, i) => (
                                  <svg key={i} className={`w-4 h-4 ${i < rev.rating ? "fill-yellow-400" : "text-zinc-300 dark:text-zinc-700"}`} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                                ))}
                              </div>
                            </div>
                            {rev.text && (
                              <p className="text-xs text-zinc-600 dark:text-zinc-300 italic">"{rev.text}"</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {selectedUser.permissions && selectedUser.permissions.length > 0 && (
                      <div className="bg-white dark:bg-zinc-950 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800">
                        <div className="text-zinc-500 text-[10px] uppercase font-bold mb-1">Management Access</div>
                        <div className="flex flex-wrap gap-1.5">
                          {selectedUser.permissions.map(perm => (
                            <span key={perm} className="px-2 py-0.5 bg-emerald-500/10 text-emerald-500 text-[10px] font-bold uppercase rounded-md border border-emerald-500/20">
                              {perm}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="border-t border-zinc-200 dark:border-zinc-800 pt-6">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Assigned Content</h4>
                      <Button 
                        onClick={() => setIsContentPickerOpen(true)}
                        variant="ghost"
                        className="text-xs font-bold text-emerald-500 hover:text-emerald-400 transition-colors flex items-center gap-1 h-auto py-1 px-2"
                        icon={<Plus className="w-3 h-3" />}
                      >
                        Manage
                      </Button>
                    </div>
                    
                    <div className="flex flex-wrap gap-2">
                      {selectedUser.assignedContent?.map(id => {
                        const [contentId, seasonId] = id.split(':');
                        const content = allContent.find(c => c.id === contentId);
                        let displayName = content?.title || contentId;
                        
                        if (seasonId && content?.seasons) {
                          try {
                            const seasons = Array.isArray(content.seasons) ? content.seasons : JSON.parse(content.seasons || '[]');
                            const season = seasons.find((s: any) => s.id === seasonId);
                            if (season) {
                              displayName += ` - Season ${season.seasonNumber}`;
                            }
                          } catch (e) {
                            console.error("Error parsing seasons:", e);
                          }
                        }
                        
                        return (
                          <div key={id} className="flex items-center gap-2 bg-zinc-100 dark:bg-zinc-800 px-2 py-1 rounded-lg border border-zinc-300 dark:border-zinc-700">
                            <span className="text-[10px] text-zinc-600 dark:text-zinc-300">{displayName}</span>
                            <button 
                              onClick={async () => {
                                const nextAssigned = (selectedUser.assignedContent || []).filter(cid => cid !== id);
                                updateUserFields(selectedUser.uid, {
                                  assignedContent: nextAssigned
                                });
                                await finalizeUserChanges(true);
                                setSelectedUser({ ...selectedUser, assignedContent: nextAssigned });
                                setAssignedIds(new Set(nextAssigned));
                                // Update titles
                                setAssignedContentTitles(prev => prev.filter(t => t !== content?.title));
                              }} 
                              className="text-zinc-500 hover:text-red-500 transition-colors"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        );
                      })}
                      {(!selectedUser.assignedContent || selectedUser.assignedContent.length === 0) && (
                        <p className="text-[10px] text-zinc-500 italic">No content assigned yet.</p>
                      )}
                    </div>
                  </div>

                  {profile?.role !== 'user_manager' && (
                    <>
                      <div className="border-t border-zinc-200 dark:border-zinc-800 pt-6">
                        <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-4">Movie Requests</h4>
                        <div className="space-y-2">
                          {userRequests.length === 0 ? (
                            <p className="text-xs text-zinc-500 italic">No requests submitted yet.</p>
                          ) : (
                            userRequests.map(req => (
                              <div key={req.id} className="bg-white dark:bg-zinc-950 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <div className={clsx(
                                    "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-white",
                                    req.type === 'movie' ? "bg-blue-500/90" : "bg-purple-500/90"
                                  )}>
                                    {req.type === 'movie' ? <Film className="w-4 h-4" /> : <Tv className="w-4 h-4" />}
                                  </div>
                                  <div>
                                    <p className="text-xs font-bold text-zinc-200">{req.title}</p>
                                    <p className="text-[10px] text-zinc-500 uppercase font-bold">{req.type}</p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className={clsx(
                                    "text-[10px] font-bold px-2 py-0.5 rounded-full border",
                                    req.status === 'pending' && "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
                                    req.status === 'completed' && "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
                                    req.status === 'rejected' && "bg-red-500/10 text-red-500 border-red-500/20"
                                  )}>
                                    {req.status}
                                  </span>
                                  <div className="flex items-center gap-1">
                                    {req.status === 'pending' && (
                                      <>
                                        <button 
                                          onClick={() => handleUpdateRequestStatus(req.id, 'completed')}
                                          className="p-1.5 text-emerald-500 hover:bg-emerald-500/10 rounded-lg transition-colors"
                                          title="Complete"
                                        >
                                          <Check className="w-4 h-4" />
                                        </button>
                                        <button 
                                          onClick={() => handleUpdateRequestStatus(req.id, 'rejected')}
                                          className="p-1.5 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                                          title="Reject"
                                        >
                                          <X className="w-4 h-4" />
                                        </button>
                                      </>
                                    )}
                                    <button 
                                      onClick={() => handleDeleteRequest(req.id)}
                                      className="p-1.5 text-zinc-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                                      title="Delete"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      <div className="border-t border-zinc-200 dark:border-zinc-800 pt-6">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Activity Overview</h4>
                            <button 
                              onClick={() => selectedUser && fetchUserAnalytics(selectedUser)}
                              disabled={isAnalyticsLoading}
                              className="p-1 text-emerald-500 hover:bg-emerald-500/10 rounded-lg transition-colors disabled:opacity-50"
                              title="Scan Activity"
                            >
                              <Search className={clsx("w-4 h-4", isAnalyticsLoading && "animate-pulse")} />
                            </button>
                          </div>
                          {isAnalyticsLoading && (
                            <div className="flex items-center gap-2 text-emerald-500">
                              <Loader2 className="w-3 h-3 animate-spin" />
                              <span className="text-[10px] font-bold uppercase tracking-wider">Scanning</span>
                            </div>
                          )}
                        </div>
                        <div className="space-y-2">
                          {(() => {
                            const userAna = getUserAnalytics(selectedUser.uid);
                            return (
                              <>
                                <div className="flex items-center justify-between bg-white dark:bg-zinc-950 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800">
                                  <div className="flex items-center gap-3 text-zinc-600 dark:text-zinc-300">
                                    <Calendar className="w-4 h-4 text-emerald-500" />
                                    <span className="text-xs font-medium">Last Active</span>
                                  </div>
                                  <div className="text-right">
                                    <div className="flex items-center justify-end gap-2">
                                      {isUserOnline(userAna.lastActive) && (
                                        <span className="relative flex h-2 w-2">
                                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                        </span>
                                      )}
                                      <div className={`font-bold text-xs ${isUserOnline(userAna.lastActive) ? 'text-emerald-500' : 'text-zinc-900 dark:text-white'}`}>
                                        {!userAna.hasScanned ? (
                                          <span className="text-zinc-400 italic font-normal">Not Scanned</span>
                                        ) : (
                                          isUserOnline(userAna.lastActive) ? 'Online' : (userAna.lastActive ? safeFormat(userAna.lastActive, 'MMM dd, HH:mm') : 'Never')
                                        )}
                                      </div>
                                    </div>
                                    {userAna.hasScanned && userAna.lastActive && (
                                      <div className="text-[10px] text-zinc-500">
                                        {safeDistance(userAna.lastActive)}
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center justify-between bg-white dark:bg-zinc-950 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800">
                                  <div className="flex items-center gap-3 text-zinc-600 dark:text-zinc-300">
                                    <Clock className="w-4 h-4 text-emerald-500" />
                                    <span className="text-xs font-medium">Time in App</span>
                                  </div>
                                  <span className="font-bold text-zinc-900 dark:text-white text-xs">
                                    {!userAna.hasScanned ? (
                                      <span className="text-zinc-400 italic font-normal">Not Scanned</span>
                                    ) : (
                                      `${Math.floor((userAna.timeSpent || 0) / 60)}m ${(userAna.timeSpent || 0) % 60}s`
                                    )}
                                  </span>
                                </div>
                                <div className="bg-white dark:bg-zinc-950 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800">
                                  <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-3 text-zinc-600 dark:text-zinc-300">
                                      <Heart className="w-4 h-4 text-emerald-500" />
                                      <span className="text-xs font-medium">Favorites</span>
                                    </div>
                                    <span className="font-bold text-zinc-900 dark:text-white text-xs">
                                      {!userAna.hasScanned ? (
                                        <span className="text-zinc-400 italic font-normal">Not Scanned</span>
                                      ) : (
                                        userAna.favoritesCount || 0
                                      )}
                                    </span>
                                  </div>
                                  {userAna.hasScanned && (selectedUser.favorites || []).length > 0 && (
                                    <div className="mt-2 pt-2 border-t border-zinc-100 dark:border-zinc-900 max-h-24 overflow-y-auto custom-scrollbar">
                                      <div className="text-[10px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                                        {selectedUser.favorites!.map((id, idx) => {
                                          const content = contentList.find(c => c.id === id);
                                          const title = content ? content.title : `Deleted (${id})`;
                                          return (
                                            <span key={id}>
                                              {title}{idx < selectedUser.favorites!.length - 1 ? ', ' : ''}
                                            </span>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  )}
                                </div>
                                <div className="bg-white dark:bg-zinc-950 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800">
                                  <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-3 text-zinc-600 dark:text-zinc-300">
                                      <Bookmark className="w-4 h-4 text-emerald-500" />
                                      <span className="text-xs font-medium">Watch Later</span>
                                    </div>
                                    <span className="font-bold text-zinc-900 dark:text-white text-xs">
                                      {!userAna.hasScanned ? (
                                        <span className="text-zinc-400 italic font-normal">Not Scanned</span>
                                      ) : (
                                        userAna.watchLaterCount || 0
                                      )}
                                    </span>
                                  </div>
                                  {userAna.hasScanned && (selectedUser.watchLater || []).length > 0 && (
                                    <div className="mt-2 pt-2 border-t border-zinc-100 dark:border-zinc-900 max-h-24 overflow-y-auto custom-scrollbar">
                                      <div className="text-[10px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                                        {selectedUser.watchLater!.map((id, idx) => {
                                          const content = contentList.find(c => c.id === id);
                                          const title = content ? content.title : `Deleted (${id})`;
                                          return (
                                            <span key={id}>
                                              {title}{idx < selectedUser.watchLater!.length - 1 ? ', ' : ''}
                                            </span>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  )}
                                </div>
                                <div className="col-span-1 sm:col-span-2 bg-white dark:bg-zinc-950 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800">
                                  <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-3 text-zinc-600 dark:text-zinc-300">
                                      <Clock className="w-4 h-4 text-emerald-500" />
                                      <span className="text-xs font-medium">Recent Activity (Last 5)</span>
                                    </div>
                                    <span className="font-bold text-zinc-900 dark:text-white text-xs">
                                      {!userAna.hasScanned ? (
                                        <span className="text-zinc-400 italic font-normal">Not Scanned</span>
                                      ) : (
                                        selectedUser.clickHistory?.length || 0
                                      )}
                                    </span>
                                  </div>
                                  {userAna.hasScanned && (selectedUser.clickHistory || []).length > 0 && (
                                    <div className="mt-2 pt-2 border-t border-zinc-100 dark:border-zinc-900 max-h-32 overflow-y-auto custom-scrollbar flex flex-col gap-1.5">
                                      {selectedUser.clickHistory!.map((entry, idx) => (
                                          <div key={idx} className="text-[10px] leading-relaxed text-zinc-500 dark:text-zinc-400 break-words border-l-2 border-emerald-500/20 pl-2">
                                            {typeof entry === 'string' ? entry : entry.label}
                                          </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                                <div className="flex items-center justify-between bg-white dark:bg-zinc-950 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800">
                                  <div className="flex items-center gap-3 text-zinc-600 dark:text-zinc-300">
                                    <Layers className="w-4 h-4 text-emerald-500" />
                                    <span className="text-xs font-medium">Sessions Count</span>
                                  </div>
                                  <span className="font-bold text-zinc-900 dark:text-white text-xs">
                                    {!userAna.hasScanned ? (
                                      <span className="text-zinc-400 italic font-normal">Not Scanned</span>
                                    ) : (
                                      `${userAna.sessionsCount || 0}`
                                    )}
                                  </span>
                                </div>
                                <div className="col-span-1 sm:col-span-2 bg-white dark:bg-zinc-950 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800">
                                  <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-3 text-zinc-600 dark:text-zinc-300">
                                      <LinkIcon className="w-4 h-4 text-emerald-500" />
                                      <span className="text-xs font-medium">Reported Links</span>
                                    </div>
                                    <span className="font-bold text-zinc-900 dark:text-white text-xs">
                                      {selectedUser.reported_links?.length || 0}
                                    </span>
                                  </div>
                                  {(selectedUser.reported_links || []).length > 0 && (
                                    <div className="mt-2 pt-2 border-t border-zinc-100 dark:border-zinc-900 max-h-32 overflow-y-auto custom-scrollbar flex flex-col gap-1.5">
                                      {selectedUser.reported_links!.map((report, idx) => (
                                          <div key={idx} className="text-[10px] leading-relaxed break-words border-l-2 pl-2 border-amber-500/20 text-zinc-600 dark:text-zinc-300">
                                            <span className="font-bold">{report.contentTitle}</span> - {report.linkName || report.linkUrl}
                                            <br />
                                            <span className={clsx("font-semibold mr-1", report.status === 'resolved' ? "text-emerald-500" : "text-amber-500")}>
                                              [{report.status ? report.status.toUpperCase() : 'PENDING'}]
                                            </span>
                                            <span className="text-zinc-400">
                                              {report.createdAt ? new Date(report.createdAt).toLocaleDateString() : ''}
                                            </span>
                                          </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="p-4 md:p-6 border-t border-zinc-200 dark:border-zinc-800 flex justify-between gap-2 shrink-0">
              {isEditingOverlay ? (
                <>
                  <Button
                    onClick={() => { setIsEditingOverlay(false); setEditingId(null); }}
                    variant="secondary"
                    className="px-5 py-2.5 text-sm"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSave}
                    variant="emerald"
                    className="px-5 py-2.5 text-sm"
                    loading={processing.save}
                    icon={<Check className="w-4 h-4" />}
                  >
                    Save
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    onClick={() => {
                      sendWhatsAppReminder(selectedUser);
                      setSelectedUser(null);
                      setIsEditingOverlay(false);
                      setEditingId(null);
                    }}
                    variant="emerald"
                    className="px-5 py-2.5 text-sm"
                    loading={processing[`reminder_${selectedUser.uid}`]}
                    icon={<MessageCircle className="w-4 h-4" />}
                  >
                    Send Reminder
                  </Button>
                  {(selectedUser.role !== 'owner' || selectedUser.uid === profile?.uid) && (
                    <Button
                      onClick={() => {
                        handleEdit(selectedUser);
                      }}
                      variant="secondary"
                      className="px-5 py-2.5 text-sm"
                      icon={<Edit2 className="w-4 h-4" />}
                    >
                      Edit User
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Content Picker Modal */}
      {isContentPickerOpen && selectedUser && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
          <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold">Manage Access</h2>
                <p className="text-zinc-500 dark:text-zinc-400 text-sm">Select content for {selectedUser.displayName || selectedUser.email}</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="relative w-full sm:w-48">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <input
                    type="text"
                    placeholder="Search content..."
                    value={contentSearchTerm}
                    onChange={(e) => setContentSearchTerm(e.target.value)}
                    className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg pl-9 pr-3 py-1.5 text-sm focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <button onClick={() => setIsContentPickerOpen(false)} className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:text-white p-2">
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6">
              <div className="space-y-2">
                {(contentSearchTerm.trim() ? smartSearch(allContent, contentSearchTerm) : allContent)
                  .map((content) => {
                    const isSeries = content.type === 'series';
                    const seasons = isSeries && content.seasons ? (typeof content.seasons === 'string' ? JSON.parse(content.seasons || '[]') : content.seasons) : [];
                    const isFullyAssigned = assignedIds.has(content.id);
                    const isPartiallyAssigned = !isFullyAssigned && seasons.some((s: any) => assignedIds.has(`${content.id}:${s.id}`));

                    return (
                      <div key={content.id} className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
                        <label
                          className={`flex items-center gap-4 p-4 cursor-pointer transition-colors ${
                            isFullyAssigned
                              ? 'bg-emerald-500/10'
                              : isPartiallyAssigned ? 'bg-emerald-500/5' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'
                          }`}
                        >
                          <input 
                            type="checkbox" 
                            className="hidden" 
                            checked={isFullyAssigned}
                            onChange={() => toggleContent(content.id, seasons)}
                          />
                          <div className={`w-6 h-6 rounded flex items-center justify-center border ${
                            isFullyAssigned ? 'bg-emerald-500 border-emerald-500' : isPartiallyAssigned ? 'border-emerald-500 bg-emerald-500/20' : 'border-zinc-600'
                          }`}>
                            {isFullyAssigned && <Check className="w-4 h-4 text-zinc-900 dark:text-white" />}
                            {!isFullyAssigned && isPartiallyAssigned && <div className="w-3 h-3 bg-emerald-500 rounded-sm" />}
                          </div>
                          <div className="flex-1 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <img src={content.posterUrl} className="w-8 h-12 object-cover rounded" referrerPolicy="no-referrer" />
                              <div>
                                <h4 className="font-medium">{content.title}</h4>
                                <p className="text-xs text-zinc-500 capitalize">{content.type} • {content.year}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {content.status === 'draft' && (
                                <span className="bg-yellow-500/20 text-yellow-500 text-xs px-2 py-1 rounded font-medium">Draft</span>
                              )}
                              {content.status === 'selected_content' && (
                                <span className="bg-pink-500/20 text-pink-500 text-xs px-2 py-1 rounded font-medium flex items-center gap-1">
                                  <Lock className="w-3 h-3" /> SCO
                                </span>
                              )}
                            </div>
                          </div>
                        </label>
                        
                        {isSeries && seasons.length > 0 && (
                          <div className="border-t border-zinc-200 dark:border-zinc-800/50 bg-zinc-50 dark:bg-zinc-900/30 p-2 pl-14 space-y-1">
                            {seasons.map((season: any) => {
                              const isSeasonAssigned = isFullyAssigned || assignedIds.has(`${content.id}:${season.id}`);
                              return (
                                <label key={season.id} className="flex items-center gap-3 p-2 rounded-lg cursor-pointer hover:bg-zinc-200 dark:hover:bg-zinc-800/50">
                                  <input
                                    type="checkbox"
                                    className="hidden"
                                    checked={isSeasonAssigned}
                                    onChange={() => toggleSeason(content.id, season.id, seasons)}
                                  />
                                  <div className={`w-5 h-5 rounded flex items-center justify-center border ${
                                    isSeasonAssigned ? 'bg-emerald-500 border-emerald-500' : 'border-zinc-600'
                                  }`}>
                                    {isSeasonAssigned && <Check className="w-3 h-3 text-zinc-900 dark:text-white" />}
                                  </div>
                                  <span className="text-sm text-zinc-600 dark:text-zinc-300">Season {season.seasonNumber}</span>
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>

            <div className="p-4 sm:p-6 border-t border-zinc-200 dark:border-zinc-800 flex justify-between gap-2">
              <Button
                onClick={() => setIsContentPickerOpen(false)}
                variant="secondary"
                className="px-5 py-2.5 text-sm"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveAccess}
                variant="emerald"
                className="px-5 py-2.5 text-sm"
                loading={processing.saveAccess}
              >
                Save Changes
              </Button>
            </div>
          </div>
        </div>
      )}

      <AlertModal
        isOpen={alertConfig.isOpen}
        title={alertConfig.title}
        message={alertConfig.message}
        onClose={() => setAlertConfig({ ...alertConfig, isOpen: false })}
      />

      <ConfirmModal
        isOpen={!!deleteConfirm}
        title="Delete User Data"
        message="Are you sure you want to PERMANENTLY delete this user and all their associated data (orders, requests, analytics)? This action cannot be undone."
        confirmText="Delete Everything"
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirm(null)}
        loading={processing.delete}
      />

      <ConfirmModal
        isOpen={isBulkDeleteConfirmOpen}
        title={`Delete ${bulkDeleteValidUids.length} Selected Users`}
        message={`Are you sure you want to PERMANENTLY delete these ${bulkDeleteValidUids.length} selected users and ALL their associated data (auth accounts, orders, requests, FCM tokens)? This action cannot be undone.`}
        confirmText="Delete Selected Users"
        onConfirm={executeBulkDelete}
        onCancel={() => {
          setIsBulkDeleteConfirmOpen(false);
          setBulkDeleteValidUids([]);
        }}
        loading={processing.delete || processing.bulk}
      />

      {/* Whitelist Modal */}
      {isWhitelistModalOpen && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 md:p-6 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center shrink-0">
              <h2 className="text-xl font-bold">Manage Whitelist</h2>
              <button onClick={() => setIsWhitelistModalOpen(false)} className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:text-white transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-4 md:p-6 overflow-y-auto">
              <PhoneWhitelistManager />
            </div>
            <div className="p-4 md:p-6 border-t border-zinc-200 dark:border-zinc-800 flex gap-3 shrink-0">
              <Button onClick={() => setIsWhitelistModalOpen(false)} variant="secondary" className="w-full">
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Add User Modal */}
      {isAddUserModalOpen && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 md:p-6 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center shrink-0">
              <h2 className="text-xl font-bold">{(profile?.role === 'admin' || profile?.role === 'owner') ? 'Add User' : 'Add Pending User'}</h2>
              <button onClick={() => { setIsAddUserModalOpen(false); setSearchStatus('idle'); setFoundUser(null); }} className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:text-white transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-4 md:p-6 space-y-4 overflow-y-auto">
              {(profile?.role === 'admin' || profile?.role === 'owner' || searchStatus === 'found') ? (
                <div className="space-y-4">
                  {searchStatus === 'found' && foundUser ? (
                    <div className="bg-zinc-100 dark:bg-zinc-800 p-4 rounded-xl flex items-center gap-4">
                      <img src={foundUser.photoURL || 'https://ui-avatars.com/api/?name=' + foundUser.displayName} alt={foundUser.displayName} className="w-12 h-12 rounded-full" />
                      <div>
                        <p className="font-bold">{getUserDisplayName(foundUser)}</p>
                        <p className="text-sm text-zinc-500 dark:text-zinc-400">{foundUser.phone}</p>
                        <p className="text-sm text-zinc-500 dark:text-zinc-400">{foundUser.email}</p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-1">WhatsApp Number</label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={newUserForm.phone}
                            onChange={(e) => setNewUserForm({ ...newUserForm, phone: e.target.value })}
                            className="flex-1 p-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-transparent"
                            placeholder="+92..."
                          />
                          <Button onClick={handleSearchUser} disabled={searchStatus === 'searching'}>
                            {searchStatus === 'searching' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Search'}
                          </Button>
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-1">Email</label>
                        <input
                          type="email"
                          value={newUserForm.email}
                          onChange={(e) => setNewUserForm({ ...newUserForm, email: e.target.value })}
                          className="w-full p-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-transparent"
                          placeholder="user@example.com"
                        />
                      </div>
                      <div className="flex gap-4">
                        <div className="flex-1">
                          <label className="block text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-1">Display Name</label>
                          <input
                            type="text"
                            value={newUserForm.displayName}
                            onChange={(e) => setNewUserForm({ ...newUserForm, displayName: e.target.value })}
                            className="w-full p-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-transparent"
                          />
                        </div>
                        <div className="flex-1">
                          <label className="block text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-1">City</label>
                          <input
                            type="text"
                            value={newUserForm.city}
                            onChange={(e) => setNewUserForm({ ...newUserForm, city: e.target.value })}
                            className="w-full p-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-transparent"
                          />
                        </div>
                      </div>
                    </>
                  )}

                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-1">Role</label>
                      <select
                        value={newUserForm.role}
                        onChange={(e) => setNewUserForm({ ...newUserForm, role: e.target.value as Role })}
                        className="w-full p-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-transparent"
                      >
                        <option value="user">User (Pending/New)</option>
                        <option value="basic">Basic User (With Ads)</option>
                        <option value="vip">VIP User (Ad-Free)</option>
                        <option value="trial">Trial</option>
                        <option value="selected_content">Selected Content</option>
                        {(profile?.role === 'admin' || profile?.role === 'owner') && (
                          <>
                            <option value="content_manager">Content Manager</option>
                            <option value="user_manager">User Manager</option>
                            <option value="manager">Manager</option>
                            <option value="admin">Admin</option>
                          </>
                        )}
                      </select>
                    </div>
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-1">Status</label>
                      <select
                        value={newUserForm.status}
                        onChange={(e) => setNewUserForm({ ...newUserForm, status: e.target.value as 'pending' | 'active' })}
                        className="w-full p-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-transparent"
                      >
                        <option value="pending">Pending</option>
                        <option value="active">Active</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-1">Expiry Date</label>
                    <input
                      type="date"
                      value={newUserForm.expiryDate}
                      onChange={(e) => setNewUserForm({ ...newUserForm, expiryDate: e.target.value })}
                      className="w-full p-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-transparent"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-1">WhatsApp Number</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newUserForm.phone}
                        onChange={(e) => setNewUserForm({ ...newUserForm, phone: e.target.value })}
                        className="flex-1 p-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-transparent"
                        placeholder="+92..."
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-1">Email</label>
                    <input
                      type="email"
                      value={newUserForm.email}
                      onChange={(e) => setNewUserForm({ ...newUserForm, email: e.target.value })}
                      className="w-full p-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-transparent"
                      placeholder="user@example.com"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 md:p-6 border-t border-zinc-200 dark:border-zinc-800 flex gap-3 shrink-0">
              <Button
                onClick={() => { setIsAddUserModalOpen(false); setSearchStatus('idle'); setFoundUser(null); }}
                variant="secondary"
                className="flex-1"
              >
                Cancel
              </Button>
              {(profile?.role === 'admin' || profile?.role === 'owner') ? (
                <Button
                  onClick={handleAddUser}
                  variant="emerald"
                  className="flex-1"
                  loading={processing.addUser}
                  icon={<UserPlus className="w-4 h-4" />}
                >
                  Add User
                </Button>
              ) : searchStatus === 'found' ? (
                <Button
                  onClick={handleAddUser}
                  variant="emerald"
                  className="flex-1"
                  loading={processing.addUser}
                  icon={<UserPlus className="w-4 h-4" />}
                >
                  Claim User
                </Button>
              ) : (
                <Button
                  onClick={handleSearchUser}
                  variant="emerald"
                  className="flex-1"
                  loading={searchStatus === 'searching'}
                  icon={<Search className="w-4 h-4" />}
                >
                  Search User
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
