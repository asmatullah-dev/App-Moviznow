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

      const userEmailLower = user?.email?.toLowerCase() || profile?.email?.toLowerCase() || '';
      const isAdminEmail = [
        "asmatn628@gmail.com",
        "asmatullah9327@gmail.com",
        "kabirahmaddev@gmail.com",
        "wamoviesstation@gmail.com"
      ].includes(userEmailLower);
      const isPrivilegedUser = isAdminEmail || profile?.role === 'admin' || profile?.role === 'owner' || profile?.role === 'manager' || profile?.role === 'user_manager';
      if (!isPrivilegedUser) {
          setLoading(false);
          return { users: locallyCachedUsers, updatedSomething: false };
      }

      const now = Date.now();
      // PKT is UTC+5. Shift back by 7 hours to align the daily update cycle with 7 AM PKT.
      const shiftedTime = new Date(now + (5 - 7) * 60 * 60 * 1000);
      const checkPeriod = `${shiftedTime.getUTCFullYear()}-${shiftedTime.getUTCMonth() + 1}-${shiftedTime.getUTCDate()}`;

      const lastFetchTimeStr = safeStorage.getItem('last_users_sync_timestamp');
      const lastFetchTime = lastFetchTimeStr ? parseInt(lastFetchTimeStr, 10) : 0;

      // Minimum cooldown between non-forced fetch attempts (10 hours) to prevent redundant queries
      const TEN_HOURS_MS = 10 * 60 * 60 * 1000;
      if (!force && (now - lastFetchTime < TEN_HOURS_MS) && locallyCachedUsers.length > 0) {
          setLoading(false);
          return { users: locallyCachedUsers, updatedSomething: false };
      }
      
      // For forced calls, allow execution but prevent tight loop (e.g. 1 sec debounce)
      if (force && (now - lastFetchTimestampRef.current < 1000) && locallyCachedUsers.length > 0) {
          setLoading(false);
          return { users: locallyCachedUsers, updatedSomething: false };
      }
      lastFetchTimestampRef.current = now;

      if (locallyCachedUsers.length === 0) {
          setLoading(true);
      }
      
      let updatedSomething = false;

      try {
        let currentUsers = [...locallyCachedUsers];
        const currentUsersMap = new Map(currentUsers.map(u => [u.uid, normalizeUserStatusAndExpiry(u)]));
        // 1. Get chunk_meta (server chunk meta from Firestore, protected by 60s cooldown)
        const versions = await getChunkMeta(force);
        const serverUsersVersion: Record<string, any> = (versions && typeof versions === 'object' && versions.users && typeof versions.users === 'object') ? versions.users : {};

        // 2. Get local chunk meta / mtimes for users
        const knownMtimesStr = safeStorage.getItem('sync_user_mtimes') || '{}';
        let localUsersVersion: Record<string, any> = {};
        try { localUsersVersion = JSON.parse(knownMtimesStr); } catch (e) {}

        // Fallback: If localUsersVersion is empty, attempt reading from cached_chunk_meta_doc
        if (Object.keys(localUsersVersion).length === 0) {
          const cachedMetaStr = safeStorage.getItem('cached_chunk_meta_doc');
          if (cachedMetaStr) {
            try {
              const parsed = JSON.parse(cachedMetaStr);
              if (parsed?.users) localUsersVersion = { ...parsed.users };
            } catch (e) {}
          }
        }

        const uidsToFetch = new Set<string>();

        // 3. Compare all user versions from local chunk meta with server chunk meta
        // Identify all changed users whose version is NOT matched (direct value comparison)
        Object.entries(serverUsersVersion).forEach(([uid, serverVer]) => {
          if (!uid || typeof uid !== 'string' || uid.trim() === '' || uid.includes('/') || uid === 'null' || uid === 'undefined') return;
          const serverTime = parseVersionTime(serverVer);
          
          if (serverVer === -1 || (typeof serverVer === 'object' && (serverVer as any)?.deleted)) {
            // Document deleted on server
            if (currentUsersMap.has(uid)) {
              currentUsersMap.delete(uid);
              updatedSomething = true;
            }
            delete localUsersVersion[uid];
          } else if (serverTime > 0) {
            const localVer = localUsersVersion[uid];

            // Version is NOT matched if:
            // a) localVer is missing/undefined
            // b) User doc is missing from local map
            // c) serverVer !== localVer
            if (localVer === undefined || !currentUsersMap.has(uid) || localVer !== serverVer) {
              uidsToFetch.add(uid.trim());
            }
          }
        });

        const uidsArray = Array.from(uidsToFetch);
        // Fetch all pending unmatched UIDs if force = true; cap at 150 per cycle for background sync
        const maxFetchCount = force ? uidsArray.length : 150;
        const cappedUids = uidsArray.slice(0, maxFetchCount);
        const validUids = cappedUids.filter(uid => 
          typeof uid === 'string' && 
          uid.trim().length > 0 && 
          !uid.includes('/') && 
          uid !== 'null' && 
          uid !== 'undefined'
        );

        // 4. Fetch all changed users whose version is not matched from Firestore safely
        if (validUids.length > 0) {
          const chunks: string[][] = [];
          for (let i = 0; i < validUids.length; i += 30) {
            chunks.push(validUids.slice(i, i + 30));
          }

          const chunkSnapshots = await Promise.allSettled(
            chunks.map(async chunk => {
              const qMerged = query(collection(db, 'users'), where(documentId(), 'in', chunk));
              const snap = await runWithNetwork(() => getDocs(qMerged));
              return { chunk, snap };
            })
          );

          for (const result of chunkSnapshots) {
            if (result.status === 'rejected') {
              console.warn("Failed to fetch a chunk of users:", result.reason);
              continue;
            }
            const { chunk, snap } = result.value;
            const foundUids = new Set<string>();

            snap.docs.forEach(docSnap => {
              const firestoreUserRaw = { ...docSnap.data(), uid: docSnap.id } as UserProfile;
              const firestoreUser = normalizeUserStatusAndExpiry(firestoreUserRaw);
              foundUids.add(docSnap.id);

              const localUser = currentUsersMap.get(docSnap.id);

              // 5. Fetch and compare time between local user doc and Firestore user doc
              const firestoreUserTime = parseVersionTime(
                firestoreUser.updatedAt || (firestoreUser as any).updated_at || (firestoreUser as any).version || 0
              );
              const localUserTime = localUser ? parseVersionTime(
                localUser.updatedAt || (localUser as any).updated_at || (localUser as any).version || 0
              ) : 0;

              // Newer time (or missing local user) will update local user doc
              if (!localUser || firestoreUserTime > localUserTime) {
                currentUsersMap.set(docSnap.id, firestoreUser);
                updatedSomething = true;
              } else if (firestoreUserTime === localUserTime) {
                // If timestamps are equal (or both 0), but chunk_meta version has updated, use chunk_meta version comparison
                const serverMetaTime = parseVersionTime(serverUsersVersion[docSnap.id]);
                const localMetaTime = parseVersionTime(localUsersVersion[docSnap.id]);
                if (serverMetaTime > localMetaTime) {
                  currentUsersMap.set(docSnap.id, firestoreUser);
                  updatedSomething = true;
                }
              }

              // Update local chunk meta / version for this user to match server chunk meta version
              localUsersVersion[docSnap.id] = serverUsersVersion[docSnap.id] || getUtcVersion();
            });

            // Handle UIDs requested but no longer existing in Firestore
            chunk.forEach(reqUid => {
              if (!foundUids.has(reqUid)) {
                if (currentUsersMap.has(reqUid)) {
                  currentUsersMap.delete(reqUid);
                  updatedSomething = true;
                }
                delete localUsersVersion[reqUid];
              }
            });
          }
        }

        // Fallback for brand new environments where currentUsersMap is empty and serverUsersVersion is empty
        if (currentUsersMap.size === 0 && Object.keys(serverUsersVersion).length === 0) {
          try {
            const snap = await runWithNetwork(() => getDocs(query(collection(db, 'users'), limit(300))));
            snap.docs.forEach(docSnap => {
              const u = normalizeUserStatusAndExpiry({ ...docSnap.data(), uid: docSnap.id } as UserProfile);
              currentUsersMap.set(docSnap.id, u);
              localUsersVersion[docSnap.id] = u.updatedAt || getUtcVersion();
              updatedSomething = true;
            });
          } catch (e) {
            console.warn("Initial users collection fetch fallback error:", e);
          }
        }

        // Save updated local chunk meta / mtimes back to local storage
        safeStorage.setItem('sync_user_mtimes', JSON.stringify(localUsersVersion));
        try {
          updateChunkMetaLocalCache({ users: localUsersVersion });
        } catch (e) {}

        currentUsers = Array.from(currentUsersMap.values()).map(normalizeUserStatusAndExpiry);
        
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

