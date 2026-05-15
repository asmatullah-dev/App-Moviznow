import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { collection, query, getDocs, doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile } from '../types';
import { useAuth } from './AuthContext';
import { safeStorage } from '../utils/safeStorage';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrorHandler';

interface UsersContextType {
  users: UserProfile[];
  loading: boolean;
  error: string | null;
  refreshUsers: (force?: boolean) => Promise<{ users: UserProfile[], updatedSomething: boolean }>;
  updateUserFields: (userId: string, fields: Partial<UserProfile>) => void;
  finalizeUserChanges: (force?: boolean) => Promise<void>;
  hasPendingChanges: boolean;
}

const UsersContext = createContext<UsersContextType | undefined>(undefined);

export function UsersProvider({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>(() => {
    const cached = safeStorage.getItem('cached_all_users');
    return cached ? JSON.parse(cached) : [];
  });
  const [loading, setLoading] = useState(() => {
    const cached = safeStorage.getItem('cached_all_users');
    return cached ? JSON.parse(cached).length === 0 : true;
  });
  const [error, setError] = useState<string | null>(null);
  const [hasPendingChanges, setHasPendingChanges] = useState(false);

  // Buffer changes locally
  const updateUserFields = useCallback((userId: string, fields: Partial<UserProfile>) => {
    setUsers(prev => {
      const next = prev.map(u => u.uid === userId ? { ...u, ...fields } : u);
      safeStorage.setItem('cached_all_users', JSON.stringify(next));
      return next;
    });

    const pendingStr = safeStorage.getItem('pending_user_updates') || '{}';
    let pending: Record<string, Partial<UserProfile>> = {};
    try { pending = JSON.parse(pendingStr); } catch(e) {}
    
    pending[userId] = { ...pending[userId], ...fields };
    safeStorage.setItem('pending_user_updates', JSON.stringify(pending));
    setHasPendingChanges(true);
  }, []);

  const finalizeUserChanges = useCallback(async (force: boolean = false) => {
    const pendingStr = safeStorage.getItem('pending_user_updates');
    if (!pendingStr) return;
    
    // Check 9AM restriction for auto-syncs
    const now = Date.now();
    // PKT is UTC+5. Shift back by 9 hours to align the daily update cycle with 9 AM PKT.
    const shiftedTime = new Date(now + (5 - 9) * 60 * 60 * 1000);
    const checkPeriod = `${shiftedTime.getUTCFullYear()}-${shiftedTime.getUTCMonth() + 1}-${shiftedTime.getUTCDate()}`;
    const lastCheckPeriod = safeStorage.getItem('last_user_finalize_period');
    
    if (lastCheckPeriod === checkPeriod && !force) {
        console.log("Users sync deferred: Already synced in this 9 AM PKT period.");
        return;
    }
    
    let pending: Record<string, Partial<UserProfile>> = {};
    try { pending = JSON.parse(pendingStr); } catch(e) {}
    
    const userIds = Object.keys(pending);
    if (userIds.length === 0) return;

    try {
      const { writeBatch } = await import('firebase/firestore');
      let batches = [writeBatch(db)];
      let opCount = 0;

      for (const uid of userIds) {
        if (opCount >= 490) {
          batches.push(writeBatch(db));
          opCount = 0;
        }
        batches[batches.length - 1].update(doc(db, 'users', uid), pending[uid]);
        opCount++;
      }

      for (const b of batches) await b.commit();
      
      // Sync with chunk_meta so users see the updates on next check
      try {
        const { updateUserChunkMeta } = await import('../utils/chunkMeta');
        await updateUserChunkMeta(userIds);
      } catch (e) {
        console.error("Failed to update chunk_meta for users:", e);
      }

      safeStorage.removeItem('pending_user_updates');
      setHasPendingChanges(false);
      
      const nowSync = Date.now();
      const shiftedSync = new Date(nowSync + (5 - 9) * 60 * 60 * 1000);
      const periodSync = `${shiftedSync.getUTCFullYear()}-${shiftedSync.getUTCMonth() + 1}-${shiftedSync.getUTCDate()}`;
      safeStorage.setItem('last_user_finalize_period', periodSync);

    } catch(err) {
      console.error("Failed to commit user changes:", err);
      throw err;
    }
  }, []);

  const fetchUsers = useCallback(async (force = false) => {
    const isPrivilegedUser = profile?.role === 'admin' || profile?.role === 'owner' || profile?.role === 'manager' || profile?.role === 'user_manager';
    if (!isPrivilegedUser) {
        setLoading(false);
        return { users: [], updatedSomething: false };
    }

    const now = Date.now();
    // PKT is UTC+5. Shift back by 9 hours to align the daily update cycle with 9 AM PKT.
    const shiftedTime = new Date(now + (5 - 9) * 60 * 60 * 1000);
    const checkPeriod = `${shiftedTime.getUTCFullYear()}-${shiftedTime.getUTCMonth() + 1}-${shiftedTime.getUTCDate()}`;

    const cachedStr = safeStorage.getItem('cached_all_users');
    const locallyCachedUsers: UserProfile[] = cachedStr ? JSON.parse(cachedStr) : [];
    const lastFetchTimeStr = safeStorage.getItem('last_users_sync_timestamp');
    const lastFetchTime = lastFetchTimeStr ? parseInt(lastFetchTimeStr, 10) : 0;

    // Period check to avoid redundant fetches
    const lastCheckPeriod = safeStorage.getItem('last_chunk_users_check_period');
    if (!force && lastCheckPeriod === checkPeriod && locallyCachedUsers.length > 0) {
        setLoading(false);
        return { users: locallyCachedUsers, updatedSomething: false };
    }

    if (locallyCachedUsers.length === 0) {
        setLoading(true);
    }
    
    let updatedSomething = false;

    try {
      let currentUsers = [...locallyCachedUsers];
      let { getDocs, query, collection, where } = await import('firebase/firestore');

      if (currentUsers.length === 0 || force) {
        // Fallback: If local cache is empty for some reason, do a full pull.
        try {
          updatedSomething = true;
          const q = query(collection(db, 'users'));
          const snapshot = await getDocs(q);
          currentUsers = snapshot.docs.map(doc => ({ ...doc.data(), uid: doc.id })) as UserProfile[];
        } catch (err) {
          handleFirestoreError(err, OperationType.LIST, 'users');
          throw err;
        }
      } else {
        // Fetch only recently active/updated users since our last run
        try {
          // Add a generous buffer (1 hour) to ensure no missed updates near the boundary
          const bufferTime = 60 * 60 * 1000;
          const sinceIso = new Date(Math.max(0, lastFetchTime - bufferTime)).toISOString();
          const q = query(collection(db, 'users'), where('lastActive', '>=', sinceIso));
          const snapshot = await getDocs(q);
          
          if (!snapshot.empty) {
            updatedSomething = true;
            const fetchedUsers = snapshot.docs.map(doc => ({ ...doc.data(), uid: doc.id })) as UserProfile[];
            const currentUsersMap = new Map(currentUsers.map(u => [u.uid, u]));
            fetchedUsers.forEach(u => currentUsersMap.set(u.uid, u));
            currentUsers = Array.from(currentUsersMap.values());
          }
        } catch (err) {
          handleFirestoreError(err, OperationType.LIST, 'users filter by lastActive');
          throw err;
        }
      }
      
      setUsers(currentUsers);
      safeStorage.setItem('cached_all_users', JSON.stringify(currentUsers));
      safeStorage.setItem('last_users_sync_timestamp', now.toString());
      
      // Mark as checked in this period
      const nowChecked = Date.now();
      const shiftedChecked = new Date(nowChecked + (5 - 9) * 60 * 60 * 1000);
      const periodChecked = `${shiftedChecked.getUTCFullYear()}-${shiftedChecked.getUTCMonth() + 1}-${shiftedChecked.getUTCDate()}`;
      safeStorage.setItem('last_chunk_users_check_period', periodChecked);
      
      setLoading(false);
      setError(null);
      
      return { users: currentUsers, updatedSomething };
    } catch (err: any) {
      console.error('Error fetching users:', err);
      setError(err.message);
      setLoading(false);
      
      return { users: locallyCachedUsers, updatedSomething: false };
    }
  }, [profile]);

  useEffect(() => {
    // Only fetch users if the current user is an admin, owner, manager, or user_manager
    const isPrivilegedUser = profile?.role === 'admin' || profile?.role === 'owner' || profile?.role === 'manager' || profile?.role === 'user_manager';
    
    if (!isPrivilegedUser) {
      setUsers([]);
      setLoading(false);
      return;
    }

    fetchUsers();
  }, [profile?.role]);

  useEffect(() => {
    const handlePendingChanges = () => {
      setHasPendingChanges(true);
      const cached = safeStorage.getItem('cached_all_users');
      if (cached) setUsers(JSON.parse(cached));
    };
    
    // Using an async wrapper function allows us to cleanly handle the Promise
    const handleForceFlush = () => {
       finalizeUserChanges(true).catch(e => console.error("Force flush error", e));
    };
    
    window.addEventListener('pending_user_updates_changed', handlePendingChanges);
    window.addEventListener('force_flush_all_data', handleForceFlush);
    return () => {
      window.removeEventListener('pending_user_updates_changed', handlePendingChanges);
      window.removeEventListener('force_flush_all_data', handleForceFlush);
    };
  }, [finalizeUserChanges]);

  return (
    <UsersContext.Provider value={{ users, loading, error, refreshUsers: fetchUsers, updateUserFields, finalizeUserChanges, hasPendingChanges }}>
      {children}
    </UsersContext.Provider>
  );
}

export function useUsers() {
  const context = useContext(UsersContext);
  if (context === undefined) {
    throw new Error('useUsers must be used within a UsersProvider');
  }
  return context;
}

