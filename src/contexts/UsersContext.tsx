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
  refreshUsers: () => Promise<void>;
  updateUserFields: (userId: string, fields: Partial<UserProfile>) => void;
  finalizeUserChanges: () => Promise<void>;
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

  const finalizeUserChanges = useCallback(async () => {
    const pendingStr = safeStorage.getItem('pending_user_updates');
    if (!pendingStr) return;
    
    let pending: Record<string, Partial<UserProfile>> = {};
    try { pending = JSON.parse(pendingStr); } catch(e) {}
    
    const userIds = Object.keys(pending);
    if (userIds.length === 0) return;

    try {
      const { writeBatch } = await import('firebase/firestore');
      let batches = [writeBatch(db)];
      let opCount = 0;
      
      const now = Date.now();
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

      // Add user_meta update
      if (opCount >= 490) batches.push(writeBatch(db));
      batches[batches.length - 1].set(doc(db, 'user_meta', 'versions'), metaUpdates, { merge: true });

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

  const fetchUsers = useCallback(async () => {
    try {
      // 1. Fetch user_meta/versions
      let metaDoc;
      try {
        metaDoc = await getDoc(doc(db, 'user_meta', 'versions'));
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, 'user_meta/versions');
        throw err;
      }
      
      const serverVersions = metaDoc.exists() ? metaDoc.data() : {};
      
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

      // If missing completely in user_meta... well, we can't magically find them unless we did a full pull once.
      // But standard protocol is if the cache has it, we keep it, otherwise fetch newbies.
      
      let currentUsers = [...users];
      
      // Handle deleted users
      if (deletedUserIds.length > 0) {
        currentUsers = currentUsers.filter(u => !deletedUserIds.includes(u.uid));
      }

      if (usersToFetch.length > 0) {
        // Fetch up to 30 users per query (Firestore IN limit)
        const newFetchedUsers: UserProfile[] = [];
        for (let i = 0; i < usersToFetch.length; i += 30) {
            const batchIds = usersToFetch.slice(i, i + 30);
            
            // wait, since we don't have indexes guaranteed, let's just use getDoc inside Promise.all
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
        if (!metaDoc.exists()) {
            const initialMeta: Record<string, number> = {};
            currentUsers.forEach(u => initialMeta[u.uid] = Date.now());
            try { 
              await setDoc(doc(db, 'user_meta', 'versions'), initialMeta); 
            } catch(e) {
              // Non-critical, but log if fail
              console.warn("Failed to set user_meta versions singleton:", e);
            }
            Object.assign(serverVersions, initialMeta);
        }
      }
      
      setUsers(currentUsers);
      safeStorage.setItem('cached_all_users', JSON.stringify(currentUsers));
      safeStorage.setItem('cached_user_meta_versions', JSON.stringify(serverVersions));
      
      setLoading(false);
      setError(null);
    } catch (err: any) {
      console.error('Error fetching users:', err);
      // Wait, fallback to cached if fail.
      setError(err.message);
      setLoading(false);
    }
  }, [users]);

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

