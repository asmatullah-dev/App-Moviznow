import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../firebase';
import { safeStorage } from '../../utils/safeStorage';
import { collection, doc, updateDoc, onSnapshot, query, where, getDocs, writeBatch, deleteDoc, setDoc, limit } from 'firebase/firestore';
import { UserProfile, Role, Status, AnalyticsEvent } from '../../types';
import { Edit2, MessageCircle, X, Check, Search, ArrowUp, ArrowDown, Clock, Film, Trash2, Tv, Plus, Loader2, ArrowRight, UserPlus, Calendar, Heart, Bookmark, Save, Lock, Layers, Phone } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import clsx from 'clsx';
import AlertModal from '../../components/AlertModal';
import ConfirmModal from '../../components/ConfirmModal';
import { Button } from '../../components/Button';
import { handleFirestoreError, OperationType } from '../../utils/firestoreErrorHandler';
import { formatDateToMonthDDYYYY } from '../../utils/contentUtils';
import { useAuth } from '../../contexts/AuthContext';
import { smartSearch } from '../../utils/searchUtils';
import { useModalBehavior } from '../../hooks/useModalBehavior';
import { useSettings } from '../../contexts/SettingsContext';
import { useContent } from '../../contexts/ContentContext';
import { PhoneWhitelistManager } from '../../components/PhoneWhitelistManager';

import { useLocation, useNavigate } from 'react-router-dom';

import { useUsers } from '../../contexts/UsersContext';

type SortField = 'createdAt' | 'displayName' | 'phone' | 'expiryDate' | 'lastActive';
type SortOrder = 'asc' | 'desc';

const standardizePhone = (phone: string) => {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return '';
  
  // Pakistan specific standardization
  let base = digits;
  if (base.startsWith('92') && base.length >= 12) base = base.substring(2);
  else if (base.startsWith('0') && base.length >= 11) base = base.substring(1);
  
  // If it's a 10-digit number (standard Pak mobile length without prefix)
  if (base.length === 10) {
    return `+92${base}`;
  }
  
  // Fallback for other lengths or formats
  return phone.startsWith('+') ? `+${digits}` : digits;
};

export default function UserManagement() {
  const { profile, findUsersByEmailOrPhone } = useAuth();
  const { settings } = useSettings();
  const { contentList } = useContent();
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
  const [filterStatus, setFilterStatus] = useState<Status | 'all'>(() => (sessionStorage.getItem('user_mgmt_status') as any) || 'all');

  useEffect(() => {
    sessionStorage.setItem('user_mgmt_search', searchTerm);
    sessionStorage.setItem('user_mgmt_sort_field', sortField);
    sessionStorage.setItem('user_mgmt_sort_order', sortOrder);
    sessionStorage.setItem('user_mgmt_role', filterRole);
    sessionStorage.setItem('user_mgmt_status', filterStatus);
  }, [searchTerm, sortField, sortOrder, filterRole, filterStatus]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);

  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [isEditingOverlay, setIsEditingOverlay] = useState(false);
  const [isAnalyticsLoading, setIsAnalyticsLoading] = useState(false);
  const [userAnalytics, setUserAnalytics] = useState<{ timeSpent: number, favoritesCount: number, watchLaterCount: number, lastActive: string | null, hasScanned: boolean }>({ timeSpent: 0, favoritesCount: 0, watchLaterCount: 0, lastActive: null, hasScanned: false });
  const [userRequests, setUserRequests] = useState<any[]>([]);
  const [assignedContentTitles, setAssignedContentTitles] = useState<string[]>([]);
  const [allContent, setAllContent] = useState<any[]>([]);
  const [contentSearch, setContentSearch] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isContentPickerOpen, setIsContentPickerOpen] = useState(false);
  const [assignedIds, setAssignedIds] = useState<Set<string>>(new Set());
  const [contentSearchTerm, setContentSearchTerm] = useState('');
  
  // Add User State
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  const [isWhitelistModalOpen, setIsWhitelistModalOpen] = useState(false);
  const [newUserForm, setNewUserForm] = useState({ email: '', phone: '', displayName: '', role: 'user' as Role, status: 'pending' as 'pending' | 'active', expiryDate: '' });
  const [foundUser, setFoundUser] = useState<UserProfile | null>(null);
  const [searchStatus, setSearchStatus] = useState<'idle' | 'searching' | 'found' | 'not_found'>('idle');
  const [managers, setManagers] = useState<Record<string, string>>({});
  const [processing, setProcessing] = useState<Record<string, boolean>>({});
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

  const handleSearchUser = async () => {
    if (!newUserForm.phone && !newUserForm.email) {
      setAlertConfig({ isOpen: true, title: 'Error', message: 'Please provide a WhatsApp / Phone Number or Email.' });
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
  useModalBehavior(isContentPickerOpen, () => setIsContentPickerOpen(false));
  useModalBehavior(isAddUserModalOpen, () => setIsAddUserModalOpen(false));
  useModalBehavior(!!selectedUser, () => {
    setSelectedUser(null);
    setIsEditingOverlay(false);
    setEditingId(null);
  });

  const { users: allUsers, loading: usersLoading } = useUsers();
  
  const users = useMemo(() => {
    if ((profile?.role as string) === 'user_manager' || (profile?.role as string) === 'manager') {
      return allUsers.filter(u => u.managedBy === profile.uid);
    } else if ((profile?.role === 'admin' || profile?.role === 'owner') && managedByFilter) {
      return allUsers.filter(u => u.managedBy === managedByFilter);
    }
    return allUsers;
  }, [allUsers, profile, managedByFilter]);

  useEffect(() => {
    setLoading(usersLoading);
  }, [usersLoading]);

  const hasRunAutoUpdates = React.useRef(false);

  // Separate effect for auto-updates and caching to avoid blocking the main listener
  useEffect(() => {
    if (loading || users.length === 0 || hasRunAutoUpdates.current) return;

    const runAutoUpdates = async () => {
      hasRunAutoUpdates.current = true;
      const now = new Date();
      let batches = [writeBatch(db)];
      let currentBatchIndex = 0;
      let operationCount = 0;
      let hasUpdates = false;

      users.forEach((user: UserProfile) => {
        let needsUpdate = false;
        const updates: any = {};
        
        // Auto-assign owner role to asmatn628@gmail.com
        if (user.email === 'asmatn628@gmail.com' && user.role !== 'owner') {
          updates.role = 'owner';
          updates.expiryDate = 'Lifetime';
          needsUpdate = true;
        }
        
        // Auto-expire users whose expiry date has passed
        if (user.status === 'active' && user.expiryDate && user.role !== 'owner') {
          const expiryDate = new Date(user.expiryDate);
          const expiryEnd = new Date(expiryDate.getTime() + 24 * 60 * 60 * 1000);
          if (now > expiryEnd) {
            updates.status = 'expired';
            needsUpdate = true;
          }
        }

        if (needsUpdate) {
          if (operationCount === 500) {
            batches.push(writeBatch(db));
            currentBatchIndex++;
            operationCount = 0;
          }
          batches[currentBatchIndex].update(doc(db, 'users', user.uid), updates);
          operationCount++;
          hasUpdates = true;
        }
      });

      if (hasUpdates) {
        try {
          await Promise.all(batches.map(b => b.commit()));
          console.log("Auto-updates committed successfully");
        } catch (error) {
          console.error("Error committing auto-updates batch:", error);
        }
      }
    };

    const timer = setTimeout(runAutoUpdates, 3000); // Wait 3s after load/change
    return () => clearTimeout(timer);
  }, [users, loading, profile, managedByFilter]);

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
      setAllContent([...contentList].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()));
    }
  }, [contentList]);

  const fetchUserAnalytics = async (user: UserProfile) => {
    setIsAnalyticsLoading(true);
    // Note: movie requests and assigned content titles are still fetched here as they are part of the detailed view
    setUserRequests([]);
    setAssignedContentTitles([]);
    try {
      // Fetch movie requests
      const requestsSnapshot = await getDocs(query(collection(db, 'movie_requests'), where('userId', '==', user.uid)));
      const requestsData = requestsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setUserRequests(requestsData);

      // Process Assigned Content Titles using contentList from context
      if (user.role === 'selected_content' && user.assignedContent && user.assignedContent.length > 0) {
        const contentMap = new Map<string, string>();
        contentList.forEach(c => {
          contentMap.set(c.id, c.title);
        });
        const titles = user.assignedContent.map(id => contentMap.get(id) || 'Unknown Content');
        setAssignedContentTitles(titles);
      } else {
        setAssignedContentTitles([]);
      }

      // Process Analytics (Migrated to GA4)
      const newAnalytics = { 
        timeSpent: user.timeSpent || 0,
        favoritesCount: (user.favorites || []).length,
        watchLaterCount: (user.watchLater || []).length,
        lastActive: user.lastActive || null,
        hasScanned: true
      };
      setUserAnalytics(newAnalytics);
      safeStorage.setItem(`user_analytics_${user.uid}`, JSON.stringify(newAnalytics));

    } catch (error) {
      console.error("Error fetching user analytics:", error);
      handleFirestoreError(error, OperationType.LIST, 'analytics/content');
    } finally {
      setIsAnalyticsLoading(false);
    }
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
        setUserAnalytics(JSON.parse(cached));
      } catch (e) {
        setUserAnalytics({ timeSpent: 0, favoritesCount: 0, watchLaterCount: 0, lastActive: null, hasScanned: false });
      }
    } else {
      setUserAnalytics({ timeSpent: 0, favoritesCount: 0, watchLaterCount: 0, lastActive: null, hasScanned: false });
    }
    
    setUserRequests([]);
    setAssignedContentTitles([]);
  };

  const handleEdit = (user: UserProfile) => {
    if (user.role === 'owner') return;
    if (user.uid === profile?.uid) return; // Owner cannot edit themselves
    setSelectedUser(user);
    setEditingId(user.uid);
    setEditForm({
      displayName: user.displayName || '',
      email: user.email || '',
      phone: user.phone || '',
      expiryDate: user.expiryDate ? user.expiryDate.split('T')[0] : '',
      role: user.role,
      status: user.status,
      permissions: user.permissions || [],
    });
    setIsEditingOverlay(true);
  };

  const handleResetPassword = async (userId: string) => {
    try {
      setProcessing(prev => ({ ...prev, [`reset_${userId}`]: true }));
      await updateDoc(doc(db, 'users', userId), {
        requirePasswordReset: true
      });
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
              : 'WhatsApp / Phone Number is already in use by another account.';
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
      };
      
      // Set isUserManager flag if role is user_manager or manager
      if (editForm.role === 'user_manager' || editForm.role === 'manager') {
        updateData.isUserManager = true;
      }
      
      if (editForm.expiryDate) {
        updateData.expiryDate = new Date(editForm.expiryDate).toISOString();
      } else {
        updateData.expiryDate = null;
      }

      const currentEditingId = editingId;
      const previousRole = selectedUser.role;
      const newRole = editForm.role;

      await updateDoc(doc(db, 'users', currentEditingId), updateData);

      // Handle User Manager role changes
      if (previousRole === 'user_manager' && newRole !== 'user_manager') {
        // Expire all managed users
        const managedUsers = allUsers.filter(u => u.managedBy === currentEditingId);
        if (managedUsers.length > 0) {
          const batch = writeBatch(db);
          managedUsers.forEach(userData => {
            batch.update(doc(db, 'users', userData.uid), {
              status: 'expired',
              previousStatus: userData.status || 'active'
            });
          });
          await batch.commit();
        }
      } else if (previousRole !== 'user_manager' && newRole === 'user_manager') {
        // Restore all managed users
        const managedUsers = allUsers.filter(u => u.managedBy === currentEditingId);
        if (managedUsers.length > 0) {
          const batch = writeBatch(db);
          managedUsers.forEach(userData => {
            if (userData.previousStatus) {
              batch.update(doc(db, 'users', userData.uid), {
                status: userData.previousStatus,
                previousStatus: null
              });
            }
          });
          await batch.commit();
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
      if (userToDelete?.status === 'suspended') {
        // Second time: delete all user data
        const batch = writeBatch(db);
        
        // 1. Delete user document
        batch.delete(doc(db, 'users', currentDeleteConfirm));
        
        // Parallelize all data fetches
        const [
          ordersSnap,
          requestsSnap,
          joinedRequestsSnap,
          tokensSnap,
          notificationsSnap
        ] = await Promise.all([
          getDocs(query(collection(db, 'orders'), where('userId', '==', currentDeleteConfirm))),
          getDocs(query(collection(db, 'movie_requests'), where('userId', '==', currentDeleteConfirm))),
          getDocs(query(collection(db, 'movie_requests'), where('requestedBy', 'array-contains', currentDeleteConfirm))),
          getDocs(query(collection(db, 'fcm_tokens'), where('userId', '==', currentDeleteConfirm))),
          getDocs(query(collection(db, 'notifications'), where('targetUserId', '==', currentDeleteConfirm)))
        ]);
        
        // 2. Delete orders
        ordersSnap.forEach(d => batch.delete(d.ref));
        
        // 3. Delete movie requests created by this user
        requestsSnap.forEach(d => batch.delete(d.ref));

        // 3b. Remove user from other movie requests they joined
        joinedRequestsSnap.forEach(d => {
          const data = d.data();
          if (data.userId !== currentDeleteConfirm) {
            const newRequestedBy = (data.requestedBy || []).filter((id: string) => id !== currentDeleteConfirm);
            batch.update(d.ref, { 
              requestedBy: newRequestedBy,
              requestCount: newRequestedBy.length
            });
          }
        });
        
        // 4. Delete FCM tokens
        tokensSnap.forEach(d => batch.delete(d.ref));

        // 5. Delete notifications targeted to this user
        notificationsSnap.forEach(d => batch.delete(d.ref));
        
        await batch.commit();
        setAlertConfig({ isOpen: true, title: 'Success', message: 'User and all associated data deleted successfully' });
      } else {
        // First time: suspend
        await updateDoc(doc(db, 'users', currentDeleteConfirm), {
          status: 'suspended'
        });
        setAlertConfig({ isOpen: true, title: 'Success', message: 'User suspended successfully' });
      }
      setDeleteConfirm(null);
    } catch (error) {
      console.error('Error in delete/suspend action:', error);
      setAlertConfig({ isOpen: true, title: 'Error', message: 'Failed to complete action' });
      setProcessing(prev => ({ ...prev, delete: false }));
      handleFirestoreError(error, OperationType.DELETE, `users/${currentDeleteConfirm}`);
    } finally {
      setProcessing(prev => ({ ...prev, delete: false }));
    }
  };

  const sendWhatsAppReminder = (user: UserProfile) => {
    if (!user.phone) {
      setAlertConfig({ isOpen: true, title: 'Missing WhatsApp / Phone Number', message: 'User does not have a WhatsApp / Phone number set.' });
      return;
    }
    
    let message = '';
    const name = user.displayName || 'there';
    const now = new Date();
    
    // Check if today is the joining date
    const isJoiningDate = user.createdAt && new Date(user.createdAt).toDateString() === now.toDateString();
    const welcomeText = isJoiningDate ? `Welcome to ${settings?.headerText || 'MovizNow'} App. ` : '';
    const membershipType = user.role === 'trial' ? 'Trial' : 'membership';
    
    if (user.expiryDate) {
      const expiryDate = new Date(user.expiryDate);
      const diffTime = expiryDate.getTime() - now.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      const expiryStr = formatDateToMonthDDYYYY(user.expiryDate);

      if (diffDays > 3) {
        message = `Hello ${name},\n\n${welcomeText}Your ${membershipType} for ${settings?.headerText || 'MovizNow'} app will expire on ${expiryStr}.\n\nThank You`;
      } else {
        message = `Hello ${name},\n\n${welcomeText}Your ${membershipType} for ${settings?.headerText || 'MovizNow'} app is expiring very soon on ${expiryStr}. Please renew to continue enjoying our services.\n\nThank You`;
      }
    } else {
      message = `Hello ${name},\n\n${welcomeText}This is a friendly reminder regarding your ${settings?.headerText || 'MovizNow'} ${membershipType}.\n\nThank You`;
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
      await updateDoc(doc(db, 'users', selectedUser.uid), {
        assignedContent: nextAssigned
      });
      
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
      await updateDoc(doc(db, 'users', selectedUser.uid), {
        assignedContent: nextAssigned
      });
      
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
      await updateDoc(doc(db, 'users', selectedUser.uid), {
        assignedContent: nextAssigned
      });
      
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
      await updateDoc(doc(db, 'movie_requests', requestId), { status });
      // Refresh user requests
      setUserRequests(prev => prev.map(r => r.id === requestId ? { ...r, status } : r));
    } catch (error) {
      console.error("Error updating request status:", error);
    }
  };

  const handleDeleteRequest = async (requestId: string) => {
    if (!window.confirm("Are you sure you want to delete this request?")) return;
    try {
      await deleteDoc(doc(db, 'movie_requests', requestId));
      setUserRequests(prev => prev.filter(r => r.id !== requestId));
    } catch (error) {
      console.error("Error deleting request:", error);
    }
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder(field === 'lastActive' ? 'desc' : 'asc');
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

  const handleBulkStatusChange = async (status: 'active' | 'pending' | 'suspended' | 'expired') => {
    if (!window.confirm(`Are you sure you want to change the status of ${selectedUsers.length} users to ${status}?`)) return;
    
    setProcessing(prev => ({ ...prev, bulk: true }));
    const currentSelected = [...selectedUsers];
    setSelectedUsers([]);
    
    try {
      const batch = writeBatch(db);
      currentSelected.forEach(uid => {
        const user = users.find(u => u.uid === uid);
        if (user?.role !== 'owner') {
          const userRef = doc(db, 'users', uid);
          batch.update(userRef, { status });
        }
      });
      await batch.commit();
    } catch (error) {
      console.error('Error updating users:', error);
      setAlertConfig({ isOpen: true, title: 'Error', message: 'Failed to update users' });
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
    
    if (searchTerm) {
      result = smartSearch(result, searchTerm, ['displayName', 'email', 'phone']);
    }
    if (filterRole !== 'all') {
      result = result.filter(u => u.role === filterRole);
    }
    if (filterStatus !== 'all') {
      result = result.filter(u => u.status === filterStatus);
    }

    // Sort
    if (!searchTerm) {
      result.sort((a, b) => {
        let comparison = 0;
        switch (sortField) {
          case 'createdAt':
            comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
            break;
          case 'displayName':
            comparison = (a.displayName || '').localeCompare(b.displayName || '');
            break;
          case 'phone':
            comparison = (a.phone || '').localeCompare(b.phone || '');
            break;
          case 'expiryDate':
            const hasA = !!a.expiryDate;
            const hasB = !!b.expiryDate;
            if (!hasA && !hasB) {
              comparison = 0;
            } else if (!hasA) {
              comparison = sortOrder === 'asc' ? 1 : -1;
            } else if (!hasB) {
              comparison = sortOrder === 'asc' ? -1 : 1;
            } else {
              comparison = new Date(a.expiryDate!).getTime() - new Date(b.expiryDate!).getTime();
            }
            break;
          case 'lastActive':
            const activeA = a.lastActive ? new Date(a.lastActive).getTime() : 0;
            const activeB = b.lastActive ? new Date(b.lastActive).getTime() : 0;
            comparison = activeA - activeB;
            break;
        }
        return sortOrder === 'asc' ? comparison : -comparison;
      });
    }

    return result;
  }, [users, searchTerm, filterRole, filterStatus, sortField, sortOrder]);

  const handleAddUser = async () => {
    if (!foundUser && !newUserForm.phone && !newUserForm.email) {
      setAlertConfig({ isOpen: true, title: 'Error', message: 'Please provide a WhatsApp / Phone Number or Email.' });
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
          displayName: newUserForm.displayName || foundUser.displayName
        };
        
        if (newUserForm.expiryDate) {
          updateData.expiryDate = new Date(newUserForm.expiryDate).toISOString();
        }
        
        await updateDoc(doc(db, 'users', (foundUser as any).id), updateData);
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
          const newUserId = `pending_${Date.now()}`;
          const newUserData: any = {
            uid: newUserId,
            email: emailToMatch,
            phone: standardizedPhone,
            displayName: newUserForm.displayName || '',
            role: newUserForm.role,
            status: newUserForm.status,
            hasPassword: false,
            createdAt: new Date().toISOString(),
            isUserManager: (newUserForm.role as string) === 'user_manager' || (newUserForm.role as string) === 'manager'
          };

          if (newUserForm.expiryDate) {
            newUserData.expiryDate = new Date(newUserForm.expiryDate).toISOString();
          }

          if ((profile?.role as string) === 'user_manager' || (profile?.role as string) === 'manager') {
            newUserData.managedBy = profile.uid;
          }

          await setDoc(doc(db, 'users', newUserId), newUserData);
          setAlertConfig({ isOpen: true, title: 'Success', message: 'Pending user added successfully.' });
        }
      }
      
      setIsAddUserModalOpen(false);
      setNewUserForm({ email: '', phone: '', displayName: '', role: 'user', status: 'pending', expiryDate: '' });
      setFoundUser(null);
      setSearchStatus('idle');
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
            {(profile?.role === 'admin' || profile?.role === 'owner') && (
              <Button
                onClick={() => setIsWhitelistModalOpen(true)}
                variant="secondary"
                icon={<Phone className="w-5 h-5" />}
              >
                Phone Whitelist
              </Button>
            )}
            <Button
              onClick={() => setIsAddUserModalOpen(true)}
              variant="emerald"
              icon={<UserPlus className="w-5 h-5" />}
            >
              {(profile?.role === 'admin' || profile?.role === 'owner') ? 'Add User' : 'Add Pending User'}
            </Button>
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
              placeholder="Search users by name, email, or phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-9 pr-4 py-2 focus:outline-none focus:border-emerald-500 text-sm"
            />
          </div>

          {/* Line 3: Filters and Bulk Actions */}
          <div className="flex flex-wrap gap-3 items-center">
            {selectedUsers.length > 0 && (
              <div className="flex items-center gap-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-1.5">
                <span className="text-xs text-zinc-500 dark:text-zinc-400">{selectedUsers.length} selected</span>
                <select
                  onChange={(e) => {
                    if (e.target.value) {
                      handleBulkStatusChange(e.target.value as any);
                      e.target.value = '';
                    }
                  }}
                  className="bg-transparent border-none text-xs focus:outline-none text-emerald-500 font-medium cursor-pointer"
                >
                  <option value="">Bulk Actions</option>
                  <option value="active">Set Active</option>
                  <option value="pending">Set Pending</option>
                  <option value="expired">Set Expired</option>
                  {(profile?.role === 'admin' || profile?.role === 'owner') && (
                    <option value="suspended">Suspend</option>
                  )}
                </select>
              </div>
            )}
            <div className="flex gap-2 flex-1 overflow-x-auto pb-1 md:pb-0 items-center">
              <select
                value={filterRole}
                onChange={(e) => setFilterRole(e.target.value as any)}
                className="bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-1.5 focus:outline-none focus:border-emerald-500 min-w-[120px] text-xs"
              >
                <option value="all">All Roles</option>
                <option value="user">User</option>
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
              
              {(searchTerm || filterRole !== 'all' || filterStatus !== 'all' || sortField !== 'createdAt' || sortOrder !== 'desc') && (
                <button
                  onClick={() => {
                    setSearchTerm('');
                    setFilterRole('all');
                    setFilterStatus('all');
                    setSortField('createdAt');
                    setSortOrder('desc');
                  }}
                  className="p-1.5 text-zinc-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors shrink-0"
                  title="Reset Filters & Sorting"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
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
                          {user.displayName || 'No Name'}
                        </div>
                        <div className="text-zinc-500 dark:text-zinc-400 text-xs mt-0.5 truncate" title={user.email}>{user.email}</div>
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
                          user.role === 'content_manager' ? 'bg-indigo-500/10 text-indigo-500' :
                          user.role === 'user_manager' ? 'bg-blue-500/10 text-blue-500' :
                          user.role === 'manager' ? 'bg-emerald-500/10 text-emerald-500' :
                          user.role === 'selected_content' ? 'bg-pink-500/10 text-pink-500' :
                          user.role === 'trial' ? 'bg-yellow-500/10 text-yellow-500' :
                          'bg-zinc-500/10 text-zinc-500'}`}
                      >
                        {user.role === 'selected_content' ? 'Selected Content' : 
                         user.role === 'content_manager' ? 'Content Manager' :
                         user.role === 'user_manager' ? 'User Manager' :
                         user.role === 'manager' ? 'Manager' :
                         user.role.charAt(0).toUpperCase() + user.role.slice(1).replace('_', ' ')}
                      </span>
                      {user.role !== 'owner' && (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider
                          ${user.status === 'active' ? 'bg-emerald-500/10 text-emerald-500' : 
                            user.status === 'expired' ? 'bg-red-500/10 text-red-500' : 
                            'bg-yellow-500/10 text-yellow-500'}`}
                        >
                          {user.status}
                        </span>
                      )}
                      <div className="flex items-center gap-2 mt-0.5">
                        {isUserOnline(user.lastActive) && (
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                          </span>
                        )}
                        <span className={`text-[10px] font-medium ${isUserOnline(user.lastActive) ? 'text-emerald-500' : 'text-zinc-500 dark:text-zinc-400'}`}>
                          {isUserOnline(user.lastActive) ? 'Online' : (user.lastActive ? formatDistanceToNow(new Date(user.lastActive), { addSuffix: true }) : 'Never')}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 md:px-4 py-4">
                    <div className="flex flex-col gap-1">
                      <span className="text-zinc-600 dark:text-zinc-300 font-medium">
                        {user.role === 'owner' ? 'Lifetime' : user.expiryDate ? format(new Date(user.expiryDate), 'MMM dd, yyyy') : '-'}
                      </span>
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
                  <div>
                    <label className="block text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-1">Name</label>
                    <input
                      type="text"
                      value={editForm.displayName || ''}
                      onChange={(e) => setEditForm({ ...editForm, displayName: e.target.value })}
                      className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2 focus:outline-none focus:border-emerald-500"
                    />
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
                    <label className="block text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-1">WhatsApp / Phone Number</label>
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
                        className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
                      >
                        <option value="user">User</option>
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
                        value={editForm.status}
                        onChange={(e) => setEditForm({ ...editForm, status: e.target.value as Status })}
                        className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
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
                      <h3 className="text-lg font-bold text-zinc-900 dark:text-white">{selectedUser.displayName || 'No Name'}</h3>
                      <p className="text-zinc-500 dark:text-zinc-400 text-sm">{selectedUser.email?.endsWith('@moviznow.com') ? 'No Email' : selectedUser.email}</p>
                      <p className="text-zinc-500 dark:text-zinc-400 text-sm">{selectedUser.phone || 'No WhatsApp / Phone Number'}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    <div className="bg-white dark:bg-zinc-950 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 flex justify-between items-center">
                      <div>
                        <div className="text-zinc-500 text-[10px] uppercase font-bold mb-0.5">Role</div>
                        <div className="font-bold text-emerald-400 text-sm">
                          {selectedUser.role === 'selected_content' ? 'Selected Content' : 
                           selectedUser.role === 'content_manager' ? 'Content Manager' :
                           selectedUser.role === 'user_manager' ? 'User Manager' :
                           selectedUser.role === 'manager' ? 'Manager' :
                           selectedUser.role.charAt(0).toUpperCase() + selectedUser.role.slice(1).replace('_', ' ')}
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
                        <div className="capitalize font-bold text-zinc-900 dark:text-white text-sm">{selectedUser.status}</div>
                      </div>
                    </div>
                    
                    <div className="bg-white dark:bg-zinc-950 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 flex justify-between items-center">
                      <div>
                        <div className="text-zinc-500 text-[10px] uppercase font-bold mb-0.5">Joined</div>
                        <div className="font-bold text-zinc-900 dark:text-white text-sm">{format(new Date(selectedUser.createdAt), 'MMM dd, yyyy')}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-zinc-500 text-[10px] uppercase font-bold mb-0.5">Expiry Date</div>
                        <div className="font-bold text-zinc-900 dark:text-white text-sm">{selectedUser.role === 'owner' ? 'Lifetime' : selectedUser.expiryDate ? format(new Date(selectedUser.expiryDate), 'MMM dd, yyyy') : 'N/A'}</div>
                      </div>
                    </div>

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

                  {selectedUser.role === 'selected_content' && (
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
                                  await updateDoc(doc(db, 'users', selectedUser.uid), {
                                    assignedContent: nextAssigned
                                  });
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
                  )}

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
                          <div className="flex items-center justify-between bg-white dark:bg-zinc-950 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800">
                            <div className="flex items-center gap-3 text-zinc-600 dark:text-zinc-300">
                              <Calendar className="w-4 h-4 text-emerald-500" />
                              <span className="text-xs font-medium">Last Active</span>
                            </div>
                            <div className="text-right">
                              <div className="flex items-center justify-end gap-2">
                                {isUserOnline(userAnalytics.lastActive || selectedUser.lastActive) && (
                                  <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                  </span>
                                )}
                                <div className={`font-bold text-xs ${isUserOnline(userAnalytics.lastActive || selectedUser.lastActive) ? 'text-emerald-500' : 'text-zinc-900 dark:text-white'}`}>
                                  {isUserOnline(userAnalytics.lastActive || selectedUser.lastActive) ? 'Online' : ((userAnalytics.lastActive || selectedUser.lastActive) ? format(new Date((userAnalytics.lastActive || selectedUser.lastActive)!), 'MMM dd, HH:mm') : 'Never')}
                                </div>
                              </div>
                              {(userAnalytics.lastActive || selectedUser.lastActive) && (
                                <div className="text-[10px] text-zinc-500">
                                  {formatDistanceToNow(new Date((userAnalytics.lastActive || selectedUser.lastActive)!), { addSuffix: true })}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center justify-between bg-white dark:bg-zinc-950 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800">
                            <div className="flex items-center gap-3 text-zinc-600 dark:text-zinc-300">
                              <Clock className="w-4 h-4 text-emerald-500" />
                              <span className="text-xs font-medium">Time in App</span>
                            </div>
                            <span className="font-bold text-zinc-900 dark:text-white text-xs">{userAnalytics.timeSpent || 0} mins</span>
                          </div>
                          <div className="bg-white dark:bg-zinc-950 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800">
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-3 text-zinc-600 dark:text-zinc-300">
                                <Heart className="w-4 h-4 text-emerald-500" />
                                <span className="text-xs font-medium">Favorites</span>
                              </div>
                              <span className="font-bold text-zinc-900 dark:text-white text-xs">{userAnalytics.favoritesCount || 0}</span>
                            </div>
                          </div>
                          <div className="bg-white dark:bg-zinc-950 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800">
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-3 text-zinc-600 dark:text-zinc-300">
                                <Bookmark className="w-4 h-4 text-emerald-500" />
                                <span className="text-xs font-medium">Watch Later</span>
                              </div>
                              <span className="font-bold text-zinc-900 dark:text-white text-xs">{userAnalytics.watchLaterCount || 0}</span>
                            </div>
                          </div>
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
                  {selectedUser.role !== 'owner' && (
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
                            {content.status === 'draft' && (
                              <span className="bg-yellow-500/20 text-yellow-500 text-xs px-2 py-1 rounded font-medium">Draft</span>
                            )}
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
        title={users.find(u => u.uid === deleteConfirm)?.status === 'suspended' ? "Delete User Data" : "Suspend User"}
        message={users.find(u => u.uid === deleteConfirm)?.status === 'suspended' 
          ? "Are you sure you want to PERMANENTLY delete this user and all their associated data (orders, requests, analytics)? This action cannot be undone." 
          : "Are you sure you want to suspend this user? They will no longer be able to access the application."}
        confirmText={users.find(u => u.uid === deleteConfirm)?.status === 'suspended' ? "Delete Everything" : "Suspend"}
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirm(null)}
        loading={processing.delete}
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
                        <p className="font-bold">{foundUser.displayName || 'No Name'}</p>
                        <p className="text-sm text-zinc-500 dark:text-zinc-400">{foundUser.phone}</p>
                        <p className="text-sm text-zinc-500 dark:text-zinc-400">{foundUser.email}</p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-1">WhatsApp / Phone Number</label>
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
                      <div>
                        <label className="block text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-1">Display Name</label>
                        <input
                          type="text"
                          value={newUserForm.displayName}
                          onChange={(e) => setNewUserForm({ ...newUserForm, displayName: e.target.value })}
                          className="w-full p-2 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-transparent"
                        />
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
                        <option value="user">User</option>
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
                    <label className="block text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-1">WhatsApp / Phone Number</label>
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
