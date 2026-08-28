import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { collection, query, getDocs, doc, getDoc, setDoc, where, documentId, limit } from 'firebase/firestore';
import { db, runWithNetwork } from '../firebase';
import { UserProfile } from '../types';
import { useAuth } from './AuthContext';
import { safeStorage } from '../utils/safeStorage';
import { getUtcVersion, parseVersionTime, getChunkMeta, updateChunkMetaLocalCache } from '../utils/chunkMeta';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrorHandler';
import { getUserDisplayName } from '../utils/userUtils';

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

  // Clean and ensure displayName is valid and populated
  const resolvedName = getUserDisplayName(u);
  if (!u.displayName || u.displayName.trim() === '' || u.displayName === 'No Name' || u.displayName === 'null' || u.displayName === 'undefined') {
    u = { ...u, displayName: resolvedName };
  }

  // Ensure createdAt (Joined Date) is always present
  if (!u.createdAt || u.createdAt === 'null' || u.createdAt === 'undefined') {
    u = { ...u, createdAt: new Date().toISOString() };
  }

  // Ensure role is populated
  if (!u.role) {
    u = { ...u, role: 'user' };
  }

  if (u.role === 'owner' || u.role === 'admin') {
    return { ...u, status: 'active', expiryDate: u.expiryDate || 'Lifetime' };
  }

  // If status is empty, null, or undefined, default to 'pending' (unless it has a valid future expiry date)
  if (!u.status || (u.status as any) === 'null' || (u.status as any) === 'undefined') {
    if (u.expiryDate && u.expiryDate !== 'Lifetime' && !isUserExpired(u.expiryDate)) {
      u = { ...u, status: 'active' };
    } else {
      u = { ...u, status: 'pending' };
    }
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

  const isFinalizingRef = useRef(false);
  const lastFetchTimestampRef = useRef(0);
  const fetchPromiseRef = useRef<Promise<{ users: UserProfile[], updatedSomething: boolean }> | null>(null);

  const finalizeUserChanges = useCallback(async (force: boolean = true) => {
    if (isFinalizingRef.current) return;
    
    const pendingStr = safeStorage.getItem('pending_user_updates');
    if (!pendingStr) return;
    
    // Only allow sync when forced (default true)
    if (!force) {
        console.log("Users sync deferred: Only manual sync is allowed.");
        return;
    }
    
    let pending: Record<string, Partial<UserProfile>> = {};
    try { pending = JSON.parse(pendingStr); } catch(e) {}
    
    const userIds = Object.keys(pending);
    if (userIds.length === 0) return;

    isFinalizingRef.current = true;
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
            if (key === 'contentClicks' || key === 'linkClicks') {
              writeData[key] = deleteField();
            }
          }
        }
        
        batches[batches.length - 1].set(doc(db, 'users', uid), writeData, { merge: true });
        opCount++;
      }

      const nowSyncUtc = getUtcVersion();
      const metaUsersUpdate: Record<string, any> = {};
      for (const uid of userIds) {
        metaUsersUpdate[uid] = nowSyncUtc;
      }
      if (opCount >= 490) {
        batches.push(writeBatch(db));
        opCount = 0;
      }
      batches[batches.length - 1].set(doc(db, 'chunk_meta', 'versions'), { users: metaUsersUpdate }, { merge: true });

      for (const b of batches) await runWithNetwork(() => b.commit());

      try {
        const { updateChunkMetaLocalCache } = await import('../utils/chunkMeta');
        updateChunkMetaLocalCache({ users: metaUsersUpdate });
      } catch (e) {}

      try {
        const knownMtimesStr = safeStorage.getItem('sync_user_mtimes') || '{}';
        const knownMtimes = JSON.parse(knownMtimesStr);
        Object.assign(knownMtimes, metaUsersUpdate);
        safeStorage.setItem('sync_user_mtimes', JSON.stringify(knownMtimes));
      } catch (e) {}

      safeStorage.removeItem('pending_user_updates');
      setHasPendingChanges(false);
      window.dispatchEvent(new CustomEvent('pending_user_updates_changed'));
      
      const nowSyncMs = Date.now();
      const shiftedSync = new Date(nowSyncMs + (5 - 7) * 60 * 60 * 1000);
      const periodSync = `${shiftedSync.getUTCFullYear()}-${shiftedSync.getUTCMonth() + 1}-${shiftedSync.getUTCDate()}`;
      safeStorage.setItem('last_user_finalize_period', periodSync);

    } catch(err) {
      console.error("Failed to commit user changes:", err);
      throw err;
    } finally {
      isFinalizingRef.current = false;
    }
  }, []);

  const fetchUsers = useCallback(async (force = false) => {
    if (fetchPromiseRef.current) {
        return fetchPromiseRef.current;
    }

    const runFetch = async () => {
      if (authLoading || !user) {
          setLoading(false);
          return { users: [], updatedSomething: false };
      }

      const cachedStr = safeStorage.getItem('cached_all_users');
      let locallyCachedUsers: UserProfile[] = [];
      if (cachedStr) {
        try { locallyCachedUsers = JSON.parse(cachedStr); } catch (e) {}
      }

      let effectiveProfile = profile;
      if (!effectiveProfile) {
        try {
          const cachedProf = safeStorage.getItem('profile_cache');
          if (cachedProf) effectiveProfile = JSON.parse(cachedProf);
        } catch (e) {}
      }

      const userEmailLower = user?.email?.toLowerCase() || effectiveProfile?.email?.toLowerCase() || '';
      const isAdminEmail = [
        "asmatn628@gmail.com",
        "asmatullah9327@gmail.com",
        "kabirahmaddev@gmail.com",
        "wamoviesstation@gmail.com"
      ].includes(userEmailLower);
      const isPrivilegedUser = isAdminEmail || effectiveProfile?.role === 'admin' || effectiveProfile?.role === 'owner' || effectiveProfile?.role === 'manager' || effectiveProfile?.role === 'user_manager';
      if (!isPrivilegedUser) {
          setLoading(false);
          return { users: locallyCachedUsers, updatedSomething: false };
      }

      const now = Date.now();
      const lastFetchTimeStr = safeStorage.getItem('last_users_sync_timestamp');
      const lastFetchTime = lastFetchTimeStr ? parseInt(lastFetchTimeStr, 10) : 0;

      // Minimum cooldown between non-forced fetch attempts (10 hours) to prevent redundant queries
      const TEN_HOURS_MS = 10 * 60 * 60 * 1000;
      if (!force && (now - lastFetchTime < TEN_HOURS_MS) && locallyCachedUsers.length > 0) {
          setLoading(false);
          return { users: locallyCachedUsers, updatedSomething: false };
      }
      
      // For forced calls, allow execution but prevent rapid duplicate triggers (e.g. 400ms debounce)
      if (force && (now - lastFetchTimestampRef.current < 400) && locallyCachedUsers.length > 0) {
          setLoading(false);
          return { users: locallyCachedUsers, updatedSomething: false };
      }
      lastFetchTimestampRef.current = now;

      if (locallyCachedUsers.length === 0) {
          setLoading(true);
      }
      
      let updatedSomething = false;

      try {
        // 1. Get chunk_meta (server chunk meta from Firestore, protected by strict 60s cooldown)
        const versions = await getChunkMeta(force);
        const serverUsersVersion: Record<string, any> = (versions && typeof versions === 'object' && versions.users && typeof versions.users === 'object') ? versions.users : {};

        // 2. Fetch fresh users collection directly from Firestore
        const snap = await runWithNetwork(() => getDocs(collection(db, 'users')));
        
        const freshUsersMap = new Map<string, UserProfile>();
        const updatedMtimes: Record<string, any> = {};

        snap.docs.forEach(docSnap => {
          const raw = { ...docSnap.data(), uid: docSnap.id } as UserProfile;
          const normalized = normalizeUserStatusAndExpiry(raw);
          freshUsersMap.set(docSnap.id, normalized);
          updatedMtimes[docSnap.id] = serverUsersVersion[docSnap.id] || normalized.updatedAt || getUtcVersion();
        });

        // 3. Compare with locally cached users to detect actual additions, deletions, or field changes
        const oldMap = new Map(locallyCachedUsers.map(u => [u.uid, u]));
        if (freshUsersMap.size !== locallyCachedUsers.length) {
          updatedSomething = true;
        } else {
          for (const [uid, freshUser] of freshUsersMap.entries()) {
            const oldUser = oldMap.get(uid);
            if (!oldUser) {
              updatedSomething = true;
              break;
            }
            if (
              oldUser.status !== freshUser.status ||
              oldUser.expiryDate !== freshUser.expiryDate ||
              oldUser.role !== freshUser.role ||
              oldUser.displayName !== freshUser.displayName ||
              oldUser.email !== freshUser.email ||
              oldUser.phone !== freshUser.phone ||
              oldUser.city !== freshUser.city ||
              oldUser.managedBy !== freshUser.managedBy ||
              oldUser.referralCode !== freshUser.referralCode ||
              oldUser.trialActivated !== freshUser.trialActivated ||
              oldUser.updatedAt !== freshUser.updatedAt ||
              (oldUser as any).notes !== (freshUser as any).notes
            ) {
              updatedSomething = true;
              break;
            }
          }
        }

        // 4. Preserve any uncommitted local pending updates so in-flight edits are not overwritten
        let finalUsers = Array.from(freshUsersMap.values());
        const pendingStr = safeStorage.getItem('pending_user_updates');
        if (pendingStr) {
          try {
            const pending = JSON.parse(pendingStr);
            finalUsers = finalUsers.map(u => {
              if (pending[u.uid]) {
                return normalizeUserStatusAndExpiry({ ...u, ...pending[u.uid] });
              }
              return u;
            });
          } catch (e) {}
        }

        // 5. Update state and cache
        safeStorage.setItem('sync_user_mtimes', JSON.stringify(updatedMtimes));
        try {
          updateChunkMetaLocalCache({ users: updatedMtimes });
        } catch (e) {}

        setUsers(finalUsers);
        safeStorage.setItem('cached_all_users', JSON.stringify(finalUsers));
        safeStorage.setItem('last_users_sync_timestamp', now.toString());

        // Mark as checked in this period
        const nowChecked = Date.now();
        const shiftedChecked = new Date(nowChecked + (5 - 7) * 60 * 60 * 1000);
        const periodChecked = `${shiftedChecked.getUTCFullYear()}-${shiftedChecked.getUTCMonth() + 1}-${shiftedChecked.getUTCDate()}`;
        safeStorage.setItem('last_chunk_users_check_period', periodChecked);

        setLoading(false);
        setError(null);

        return { users: finalUsers, updatedSomething };
      } catch (err: any) {
        console.error('Error fetching users:', err);
        setError(err.message || 'Failed to fetch users');
        setLoading(false);
        throw err;
      }
    };

    const p = runFetch().finally(() => {
      fetchPromiseRef.current = null;
    });
    fetchPromiseRef.current = p;
    return p;
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

