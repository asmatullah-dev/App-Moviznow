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
  refreshUsers: (force?: boolean) => Promise<UserProfile[]>;
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
  const [loading, setLoading] = useState(true);
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
    const pktTime = new Date(now + (5 * 60 * 60 * 1000));
    const isPast9AM = pktTime.getUTCHours() >= 9;
    
    if (!isPast9AM && !force) {
        console.log("Users sync deferred: Before 9 AM PKT and group sync not forced.");
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
      
      const metaUpdates: Record<string, number> = {};

      for (const uid of userIds) {
        if (opCount >= 490) {
          batches.push(writeBatch(db));
          opCount = 0;
        }
        batches[batches.length - 1].update(doc(db, 'users', uid), pending[uid]);
        metaUpdates[uid] = now;
        opCount++;
      }

      // Add chunk_meta update
      if (opCount >= 490) batches.push(writeBatch(db));
      batches[batches.length - 1].set(doc(db, 'chunk_meta', 'versions'), { users: metaUpdates }, { merge: true });

      for (const b of batches) await b.commit();
      
      safeStorage.removeItem('pending_user_updates');
      setHasPendingChanges(false);
      
      // Update local meta versions
      const cachedMetaStr = safeStorage.getItem('cached_user_meta_versions');
      const localVersions = cachedMetaStr ? JSON.parse(cachedMetaStr) : {};
      Object.assign(localVersions, metaUpdates);
      safeStorage.setItem('cached_user_meta_versions', JSON.stringify(localVersions));

    } catch(err) {
      console.error("Failed to commit user changes:", err);
      throw err;
    }
  }, []);

  const fetchUsers = useCallback(async (force = false) => {
    const isPrivilegedUser = profile?.role === 'admin' || profile?.role === 'owner' || profile?.role === 'manager' || profile?.role === 'user_manager';
    if (!isPrivilegedUser) {
        setLoading(false);
        return [];
    }

    const now = Date.now();
    const pktTime = new Date(now + (5 * 60 * 60 * 1000));
    const isPast9AM = pktTime.getUTCHours() >= 9;
    const pktDate = `${pktTime.getUTCFullYear()}-${pktTime.getUTCMonth() + 1}-${pktTime.getUTCDate()}`;
    const checkPeriod = isPast9AM ? pktDate : `before-9am-${pktDate}`;

    const cachedStr = safeStorage.getItem('cached_all_users');
    const locallyCachedUsers = cachedStr ? JSON.parse(cachedStr) : [];

    // Period check to avoid redundant fetches
    const lastCheckPeriod = safeStorage.getItem('last_user_meta_check_period');
    if (!force && lastCheckPeriod === checkPeriod && locallyCachedUsers.length > 0) {
        setLoading(false);
        return locallyCachedUsers;
    }

    setLoading(true);
    try {
      // 1. Fetch chunk_meta/versions
      let serverVersions = {};
      try {
        const meta = await import('../utils/chunkMeta').then(m => m.getChunkMeta(force));
        serverVersions = meta.users || {};
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, 'chunk_meta/versions');
        throw err;
      }
      
      const cachedMetaStr = safeStorage.getItem('cached_user_meta_versions');
      const localVersions = cachedMetaStr ? JSON.parse(cachedMetaStr) : {};
      
      // Determine which users need fetching
      const usersToFetch: string[] = [];
      const deletedUserIds: string[] = [];

      for (const [uid, serverVer] of Object.entries(serverVersions)) {
        const localVer = localVersions[uid];
        if (serverVer === -1) {
            deletedUserIds.push(uid);
        } else if (!localVer || localVer < (serverVer as number)) {
            usersToFetch.push(uid);
        }
      }

      let currentUsers = [...locallyCachedUsers];
      
      // Handle deleted users
      if (deletedUserIds.length > 0) {
        currentUsers = currentUsers.filter(u => !deletedUserIds.includes(u.uid));
      }

      if (usersToFetch.length > 0) {
        // Fetch up to 30 users per query (Firestore IN limit)
        const newFetchedUsers: UserProfile[] = [];
        for (let i = 0; i < usersToFetch.length; i += 30) {
            const batchIds = usersToFetch.slice(i, i + 30);
            
            const fetches = batchIds.map(id => getDoc(doc(db, 'users', id)).catch(err => {
              handleFirestoreError(err, OperationType.GET, `users/${id}`);
              throw err;
            }));
            const snaps = await Promise.all(fetches);
            snaps.forEach(snap => {
               if (snap.exists()) {
                   newFetchedUsers.push(snap.data() as UserProfile);
               }
            });
        }
        
        // Merge
        const currentUsersMap = new Map(currentUsers.map(u => [u.uid, u]));
        newFetchedUsers.forEach(u => currentUsersMap.set(u.uid, u));
        currentUsers = Array.from(currentUsersMap.values());
      } else if (currentUsers.length === 0) {
        // Fallback: If local cache is empty for some reason, do a full pull.
        try {
          const q = query(collection(db, 'users'));
          const snapshot = await getDocs(q);
          currentUsers = snapshot.docs.map(doc => ({ ...doc.data(), uid: doc.id })) as UserProfile[];
        } catch (err) {
          handleFirestoreError(err, OperationType.LIST, 'users');
          throw err;
        }
        
        // Populate meta logic locally if it's missing on server
        if (Object.keys(serverVersions).length === 0) {
            const initialMeta: Record<string, number> = {};
            currentUsers.forEach(u => initialMeta[u.uid] = Date.now());
            try { 
              await setDoc(doc(db, 'chunk_meta', 'versions'), { users: initialMeta }, { merge: true }); 
            } catch(e) {
              console.warn("Failed to set chunk_meta versions singleton:", e);
            }
            Object.assign(serverVersions, initialMeta);
        }
      }
      
      setUsers(currentUsers);
      safeStorage.setItem('cached_all_users', JSON.stringify(currentUsers));
      safeStorage.setItem('cached_user_meta_versions', JSON.stringify(serverVersions));
      
      // Mark as checked in this period
      const now = Date.now();
      const pktTime = new Date(now + (5 * 60 * 60 * 1000));
      const isPast9AM = pktTime.getUTCHours() >= 9;
      const pktDate = `${pktTime.getUTCFullYear()}-${pktTime.getUTCMonth() + 1}-${pktTime.getUTCDate()}`;
      const checkPeriod = isPast9AM ? pktDate : `before-9am-${pktDate}`;
      safeStorage.setItem('last_user_meta_check_period', checkPeriod);
      
      setLoading(false);
      setError(null);
      return currentUsers;
    } catch (err: any) {
      console.error('Error fetching users:', err);
      setError(err.message);
      setLoading(false);
      return locallyCachedUsers;
    }
  }, []);

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

