import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { collection, query, getDocs, doc, getDoc, setDoc } from 'firebase/firestore';
import { db, runWithNetwork } from '../firebase';
import { UserProfile } from '../types';
import { useAuth } from './AuthContext';
import { safeStorage } from '../utils/safeStorage';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrorHandler';

export function isUserExpired(expiryDate?: string | null): boolean {
  if (!expiryDate || expiryDate === 'Lifetime' || expiryDate === 'null' || expiryDate === '') return false;
  const cleanDateStr = expiryDate.split('T')[0];
  const parts = cleanDateStr.split('-');
  if (parts.length !== 3) return false;

  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);

  if (isNaN(year) || isNaN(month) || isNaN(day)) return false;

  // Expiry boundary is midnight starting the day AFTER parts[2]
  // E.g. for "2026-08-19", boundary is 2026-08-20 00:00:00.
  // The user remains ACTIVE for the ENTIRE duration of August 19th.
  const localBoundary = new Date(year, month, day + 1, 0, 0, 0, 0);
  const utcBoundary = new Date(Date.UTC(year, month, day + 1, 0, 0, 0, 0));
  
  // Use the later boundary so timezone differences never prematurely expire a user during their valid date
  const effectiveBoundary = localBoundary > utcBoundary ? localBoundary : utcBoundary;
  
  return new Date() >= effectiveBoundary;
}

export function normalizeUserStatusAndExpiry(u: UserProfile): UserProfile {
  if (!u || !u.uid) return u;

  if (u.role === 'owner' || u.role === 'admin') {
    return { ...u, status: 'active', expiryDate: u.expiryDate || 'Lifetime' };
  }

  if (!u.expiryDate || u.expiryDate === 'null' || u.expiryDate === '') {
    if (u.status !== 'suspended' && u.status !== 'pending') {
      return { ...u, status: 'expired' };
    }
    return u;
  }

  if (u.expiryDate !== 'Lifetime') {
    if (isUserExpired(u.expiryDate)) {
      if (u.status !== 'suspended') {
        return { ...u, status: 'expired' };
      }
    } else {
      if (u.status !== 'suspended' && u.status !== 'pending') {
        return { ...u, status: 'active' };
      }
    }
  }

  return u;
}

interface UsersContextType {
  users: UserProfile[];
  loading: boolean;
  error: string | null;
  refreshUsers: (force?: boolean) => Promise<{ users: UserProfile[], updatedSomething: boolean }>;
  updateUserFields: (userId: string, fields: Partial<UserProfile>) => void;
  updateMultipleUserFields: (updates: Record<string, Partial<UserProfile>>) => void;
  finalizeUserChanges: (force?: boolean) => Promise<void>;
  hasPendingChanges: boolean;
}

const UsersContext = createContext<UsersContextType | undefined>(undefined);

export function UsersProvider({ children }: { children: React.ReactNode }) {
  const { profile, user, authLoading } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>(() => {
    const cached = safeStorage.getItem('cached_all_users');
    if (!cached) return [];
    try {
      const parsed: UserProfile[] = JSON.parse(cached);
      const uniqueMap = new Map<string, UserProfile>();
      parsed.forEach(u => {
        if (u && u.uid && !uniqueMap.has(u.uid)) {
          uniqueMap.set(u.uid, normalizeUserStatusAndExpiry(u));
        }
      });
      return Array.from(uniqueMap.values());
    } catch (e) {
      return [];
    }
  });
  const [loading, setLoading] = useState(() => {
    const cached = safeStorage.getItem('cached_all_users');
    return cached ? JSON.parse(cached).length === 0 : true;
  });
  const [error, setError] = useState<string | null>(null);
  const [hasPendingChanges, setHasPendingChanges] = useState(() => {
    const pendingStr = safeStorage.getItem('pending_user_updates');
    if (!pendingStr) return false;
    try {
      const parsed = JSON.parse(pendingStr);
      return Object.keys(parsed).length > 0;
    } catch {
      return false;
    }
  });

  const updateMultipleUserFields = useCallback((updates: Record<string, Partial<UserProfile>>) => {
    if (Object.keys(updates).length === 0) return;

    setUsers(prev => {
      const next = prev.map(u => {
        if (updates[u.uid]) {
          return normalizeUserStatusAndExpiry({ ...u, ...updates[u.uid] });
        }
        return u;
      });
      safeStorage.setItem('cached_all_users', JSON.stringify(next));
      return next;
    });

    const pendingStr = safeStorage.getItem('pending_user_updates') || '{}';
    let pending: Record<string, Partial<UserProfile>> = {};
    try { pending = JSON.parse(pendingStr); } catch(e) {}
    
    for (const [userId, fields] of Object.entries(updates)) {
      pending[userId] = { ...pending[userId], ...fields };
    }
    
    safeStorage.setItem('pending_user_updates', JSON.stringify(pending));
    setHasPendingChanges(true);
    window.dispatchEvent(new CustomEvent('pending_user_updates_changed'));
  }, []);

  // Buffer changes locally
  const updateUserFields = useCallback((userId: string, fields: Partial<UserProfile>) => {
    updateMultipleUserFields({ [userId]: fields });
  }, [updateMultipleUserFields]);

  const finalizeUserChanges = useCallback(async (force: boolean = false) => {
    const pendingStr = safeStorage.getItem('pending_user_updates');
    if (!pendingStr) return;
    
    // Only allow sync when forced via the UI buttons for admins
    if (!force) {
        console.log("Users sync deferred: Only manual sync is allowed.");
        return;
    }
    
    let pending: Record<string, Partial<UserProfile>> = {};
    try { pending = JSON.parse(pendingStr); } catch(e) {}
    
    const userIds = Object.keys(pending);
    if (userIds.length === 0) return;

    try {
      const { writeBatch, deleteField } = await import('firebase/firestore');
      let batches = [writeBatch(db)];
      let opCount = 0;
      const nowIso = new Date().toISOString();

      for (const uid of userIds) {
        if (opCount >= 490) {
          batches.push(writeBatch(db));
          opCount = 0;
        }
        
        let writeData: any = { ...pending[uid] };
        writeData.uid = uid;
        writeData.updatedAt = nowIso;

        for (const key in writeData) {
          if (writeData[key] === '__DELETE_FIELD__') {
            writeData[key] = deleteField();
          } else if (writeData[key] !== null && typeof writeData[key] === 'object' && Object.keys(writeData[key] || {}).length === 0) {
            // Check if it's an empty object previously generated by deleteField stringification
            // This is a safety cleanup just in case there are lingering `{}` values.
            if (key === 'contentClicks' || key === 'linkClicks') {
              writeData[key] = deleteField();
            }
          }
        }
        
        batches[batches.length - 1].set(doc(db, 'users', uid), writeData, { merge: true });
        opCount++;
      }

      // Update chunk meta for all affected users
      const usersMeta: Record<string, number> = {};
      const versionTime = Date.now();
      for (const uid of userIds) {
        usersMeta[uid] = versionTime;
      }

      if (opCount >= 499) {
        batches.push(writeBatch(db));
      }
      batches[batches.length - 1].set(doc(db, 'chunk_meta', 'versions'), { users: usersMeta }, { merge: true });
      for (const b of batches) await b.commit();
      
      // Update local known mtimes cache
      const knownMtimesStr = safeStorage.getItem('sync_user_mtimes') || '{}';
      let knownMtimes: Record<string, number> = {};
      try { knownMtimes = JSON.parse(knownMtimesStr); } catch (e) {}
      Object.assign(knownMtimes, usersMeta);
      safeStorage.setItem('sync_user_mtimes', JSON.stringify(knownMtimes));

      safeStorage.removeItem('pending_user_updates');
      setHasPendingChanges(false);
      window.dispatchEvent(new CustomEvent('pending_user_updates_changed'));
      
      const nowSync = Date.now();
      const shiftedSync = new Date(nowSync + (5 - 7) * 60 * 60 * 1000);
      const periodSync = `${shiftedSync.getUTCFullYear()}-${shiftedSync.getUTCMonth() + 1}-${shiftedSync.getUTCDate()}`;
      safeStorage.setItem('last_user_finalize_period', periodSync);

    } catch(err) {
      console.error("Failed to commit user changes:", err);
      throw err;
    }
  }, []);

  const fetchUsers = useCallback(async (force = false) => {
    // DO NOT fetch users if Firebase Auth is not fully loaded, or if there is no authenticated user.
    // The profile might be restored from local storage synchronously, but Firestore requests
    // will be unauthenticated until authLoading is false and user is set, causing permission errors.
    if (authLoading || !user) {
        setLoading(false);
        return { users: [], updatedSomething: false };
    }

    const isPrivilegedUser = profile?.role === 'admin' || profile?.role === 'owner' || profile?.role === 'manager' || profile?.role === 'user_manager';
    if (!isPrivilegedUser) {
        setLoading(false);
        return { users: [], updatedSomething: false };
    }

    const now = Date.now();
    // PKT is UTC+5. Shift back by 7 hours to align the daily update cycle with 7 AM PKT.
    const shiftedTime = new Date(now + (5 - 7) * 60 * 60 * 1000);
    const checkPeriod = `${shiftedTime.getUTCFullYear()}-${shiftedTime.getUTCMonth() + 1}-${shiftedTime.getUTCDate()}`;

    const cachedStr = safeStorage.getItem('cached_all_users');
    const locallyCachedUsers: UserProfile[] = cachedStr ? JSON.parse(cachedStr) : [];
    const lastFetchTimeStr = safeStorage.getItem('last_users_sync_timestamp');
    const lastFetchTime = lastFetchTimeStr ? parseInt(lastFetchTimeStr, 10) : 0;

    // Throttle checks to avoid redundant fetches on every reload/navigation
    const lastCheckPeriod = safeStorage.getItem('last_chunk_users_check_period');
    const isRecentFetch = (now - lastFetchTime) < 30 * 60 * 1000;
    if (!force && locallyCachedUsers.length > 0 && (lastCheckPeriod === checkPeriod || isRecentFetch)) {
        setLoading(false);
        return { users: locallyCachedUsers, updatedSomething: false };
    }

    if (locallyCachedUsers.length === 0) {
        setLoading(true);
    }
    
    let updatedSomething = false;

    try {
      let currentUsers = [...locallyCachedUsers];
      let { getDocs, query, collection, where, documentId } = await import('firebase/firestore');

      if (currentUsers.length === 0) {
        // Initial bootstrap pull only when local cache is completely empty
        try {
          updatedSomething = true;
          const q = query(collection(db, 'users'));
          const snapshot = await runWithNetwork(() => getDocs(q));
          const rawFetched = snapshot.docs.map(doc => ({ ...doc.data(), uid: doc.id })) as UserProfile[];
          const uMap = new Map<string, UserProfile>();
          rawFetched.forEach(u => {
            if (u && u.uid) uMap.set(u.uid, normalizeUserStatusAndExpiry(u));
          });
          currentUsers = Array.from(uMap.values());

          // Also update known mtimes from chunk_meta so future delta syncs work seamlessly
          try {
            const { getChunkMeta } = await import('../utils/chunkMeta');
            const versions = await getChunkMeta(true);
            const serverUsersVersion = versions?.users || {};
            const knownMtimesStr = safeStorage.getItem('sync_user_mtimes') || '{}';
            let knownMtimes: Record<string, number> = {};
            try { knownMtimes = JSON.parse(knownMtimesStr); } catch(e) {}
            Object.entries(serverUsersVersion).forEach(([uid, mtime]) => {
              if (typeof mtime === 'number') {
                knownMtimes[uid] = mtime;
              }
            });
            safeStorage.setItem('sync_user_mtimes', JSON.stringify(knownMtimes));
          } catch(e) {}
        } catch (err) {
          handleFirestoreError(err, OperationType.LIST, 'users');
          throw err;
        }
      } else {
        // Fetch only specific users modified/updated, tracked via chunkMeta delta sync
        try {
          const currentUsersMap = new Map(currentUsers.map(u => [u.uid, normalizeUserStatusAndExpiry(u)]));

          // Fetch specific users modified, found via chunkMeta
          const { getChunkMeta } = await import('../utils/chunkMeta');
          const versions = await getChunkMeta(force);
          const serverUsersVersion = versions?.users || {};
          
          const knownMtimesStr = safeStorage.getItem('sync_user_mtimes') || '{}';
          let knownMtimes: Record<string, number> = {};
          try { knownMtimes = JSON.parse(knownMtimesStr); } catch (e) {}
          
          const uidsToFetch = new Set<string>();
          Object.entries(serverUsersVersion).forEach(([uid, mtime]) => {
             if (typeof mtime === 'number') {
               if (mtime === -1) {
                 if (currentUsersMap.has(uid)) {
                   currentUsersMap.delete(uid);
                   updatedSomething = true;
                 }
                 delete knownMtimes[uid];
               } else if (mtime > (knownMtimes[uid] || 0) && mtime > 0) {
                 uidsToFetch.add(uid);
                 knownMtimes[uid] = mtime;
               }
             }
          });

          // Check if any previously known users were deleted from chunk_meta/versions
          Object.keys(knownMtimes).forEach(knownUid => {
            if (!(knownUid in serverUsersVersion)) {
              delete knownMtimes[knownUid];
              if (currentUsersMap.has(knownUid)) {
                currentUsersMap.delete(knownUid);
                updatedSomething = true;
              }
            }
          });

          if (uidsToFetch.size > 0) {
            const uidsArray = Array.from(uidsToFetch);
            const chunks: string[][] = [];
            for (let i = 0; i < uidsArray.length; i += 30) {
               chunks.push(uidsArray.slice(i, i + 30));
            }
            const chunkSnapshots = await Promise.all(
              chunks.map(chunk => {
                const qMerged = query(collection(db, 'users'), where(documentId(), 'in', chunk));
                return getDocs(qMerged).then(snap => ({ chunk, snap }));
              })
            );

            for (const { chunk, snap } of chunkSnapshots) {
               updatedSomething = true;
               const foundUids = new Set<string>();
               snap.docs.forEach(doc => {
                  const u = { ...doc.data(), uid: doc.id } as UserProfile;
                  currentUsersMap.set(u.uid, normalizeUserStatusAndExpiry(u));
                  foundUids.add(doc.id);
               });
               chunk.forEach(reqUid => {
                 if (!foundUids.has(reqUid) && currentUsersMap.has(reqUid)) {
                   currentUsersMap.delete(reqUid);
                 }
               });
            }
          }
          
          safeStorage.setItem('sync_user_mtimes', JSON.stringify(knownMtimes));

          currentUsers = Array.from(currentUsersMap.values()).map(normalizeUserStatusAndExpiry);
        } catch (err) {
          handleFirestoreError(err, OperationType.LIST, 'users filter delta updates');
          throw err;
        }
      }
      
      // CRITICAL: Preserve any uncommitted local pending updates so in-flight edits are not overwritten
      const pendingStr = safeStorage.getItem('pending_user_updates');
      if (pendingStr) {
        try {
          const pending = JSON.parse(pendingStr);
          currentUsers = currentUsers.map(u => {
            if (pending[u.uid]) {
              return normalizeUserStatusAndExpiry({ ...u, ...pending[u.uid] });
            }
            return u;
          });
        } catch (e) {}
      }

      setUsers(currentUsers);
      safeStorage.setItem('cached_all_users', JSON.stringify(currentUsers));
      safeStorage.setItem('last_users_sync_timestamp', now.toString());
      
      // Mark as checked in this period
      const nowChecked = Date.now();
      const shiftedChecked = new Date(nowChecked + (5 - 7) * 60 * 60 * 1000);
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
  }, [profile, user, authLoading]);

  useEffect(() => {
    // Only clear users if not a privileged user.
    // Do NOT automatically trigger a heavy fetchUsers() full pull at root app boot!
    // Individual admin pages (like UserManagement) will request users via refreshUsers() on demand.
    const isPrivilegedUser = profile?.role === 'admin' || profile?.role === 'owner' || profile?.role === 'manager' || profile?.role === 'user_manager';
    
    if (!isPrivilegedUser && !authLoading) {
      setUsers([]);
      setLoading(false);
    }
  }, [profile?.role, authLoading]);

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
    <UsersContext.Provider value={{ users, loading, error, refreshUsers: fetchUsers, updateUserFields, updateMultipleUserFields, finalizeUserChanges, hasPendingChanges }}>
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

