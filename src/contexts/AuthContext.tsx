import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { auth, db } from '../firebase';
import { safeStorage } from '../utils/safeStorage';
import { 
  onAuthStateChanged, 
  User, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  ConfirmationResult,
  updateProfile,
  updatePassword
} from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot, updateDoc, query, collection, where, getDocs, deleteDoc, limit, writeBatch, orderBy, increment } from 'firebase/firestore';
import { UserProfile } from '../types';
import { logEvent, updateTimeSpent } from '../services/analytics';
import { handleFirestoreError, OperationType } from '../utils/firestoreErrorHandler';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  authLoading: boolean;
  error: string | null;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string, displayName: string, phone?: string) => Promise<void>;
  signUpWithPhoneAndPassword: (phone: string, password: string, displayName: string, email?: string) => Promise<void>;
  isPhoneWhitelisted: (phone: string) => Promise<boolean>;
  findUsersByEmailOrPhone: (identifier: string) => Promise<UserProfile[]>;
  updateUserPassword: (newPassword: string) => Promise<void>;
  updateUserProfileData: (data: Partial<UserProfile>, newPassword?: string) => Promise<void>;
  clearError: () => void;
  logout: () => Promise<void>;
  toggleFavorite: (contentId: string) => Promise<void>;
  toggleWatchLater: (contentId: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const standardizePhone = (phone: string) => {
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [profile, setProfile] = useState<UserProfile | null>(() => {
    const cached = safeStorage.getItem('profile_cache');
    return cached ? JSON.parse(cached) : null;
  });
  const [loading, setLoading] = useState(() => !safeStorage.getItem('profile_cache'));
  const [authLoading, setAuthLoading] = useState(!auth.currentUser);
  const [error, setError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const sessionStartTimeRef = useRef<number | null>(null);
  const justLoggedInRef = useRef(false);

  const getLocalSessionId = () => {
    try {
      let id = localStorage.getItem('device_session_id');
      if (!id) {
        id = Math.random().toString(36).substring(2) + Date.now().toString(36);
        localStorage.setItem('device_session_id', id);
      }
      return id;
    } catch (e) {
      // Fallback for incognito/strict privacy modes where localStorage throws
      if (!(window as any)._fallbackSessionId) {
        (window as any)._fallbackSessionId = Math.random().toString(36).substring(2) + Date.now().toString(36);
      }
      return (window as any)._fallbackSessionId;
    }
  };

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Sync offline/pending actions periodically
  useEffect(() => {
    if (isOnline && user) {
      const syncPendingActions = async () => {
        const pendingFavorites = JSON.parse(safeStorage.getItem('pending_favorites') || '[]');
        const pendingWatchLater = JSON.parse(safeStorage.getItem('pending_watch_later') || '[]');

        if (pendingFavorites.length > 0 || pendingWatchLater.length > 0) {
          const userRef = doc(db, 'users', user.uid);
          try {
            const docSnap = await getDoc(userRef);
            if (docSnap.exists()) {
              const currentProfile = docSnap.data() as UserProfile;
              let newFavorites = [...(currentProfile.favorites || [])];
              let newWatchLater = [...(currentProfile.watchLater || [])];

              pendingFavorites.forEach((id: string) => {
                if (newFavorites.includes(id)) {
                  newFavorites = newFavorites.filter(fid => fid !== id);
                } else {
                  newFavorites.push(id);
                }
              });

              pendingWatchLater.forEach((id: string) => {
                if (newWatchLater.includes(id)) {
                  newWatchLater = newWatchLater.filter(wid => wid !== id);
                } else {
                  newWatchLater.push(id);
                }
              });

              await updateDoc(userRef, {
                favorites: newFavorites,
                watchLater: newWatchLater
              });

              safeStorage.removeItem('pending_favorites');
              safeStorage.removeItem('pending_watch_later');
            }
          } catch (error) {
            console.error("Background sync failed:", error);
          }
        }
      };
      
      // Sync immediately when coming online
      syncPendingActions();
      
      // Also sync periodically (every 30 seconds)
      const syncInterval = setInterval(syncPendingActions, 30000);
      
      // Sync on visibility change (tab switch)
      const handleVisibilityChange = () => {
        if (document.visibilityState === 'hidden') {
          syncPendingActions();
        }
      };
      document.addEventListener('visibilitychange', handleVisibilityChange);
      
      return () => {
        clearInterval(syncInterval);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      };
    }
  }, [isOnline, user]);

  useEffect(() => {
    let unsubProfile: (() => void) | undefined;

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (unsubProfile) {
        unsubProfile();
        unsubProfile = undefined;
      }

      setUser(currentUser);
      setAuthLoading(false);
      
      if (currentUser) {
        const userRef = doc(db, 'users', currentUser.uid);

        const sessionKey = `last_session_start_${currentUser.uid}`;
        const lastSessionStart = localStorage.getItem(sessionKey);
        const now = Date.now();
        const twelveHours = 12 * 60 * 60 * 1000;

        // Always initialize the ref for this React lifecycle to ensure interval tracking works
        if (!sessionStartTimeRef.current) {
          sessionStartTimeRef.current = now;
        }

        if (!sessionStorage.getItem('session_started')) {
          sessionStorage.setItem('session_started', 'true');
          
          if (!lastSessionStart || (now - parseInt(lastSessionStart) > twelveHours)) {
            // Merged write: increment session count and update lastActive in ONE call
            logEvent('session_start', currentUser.uid, {}, true); // Log to GA, skip individual Firestore write
            localStorage.setItem(sessionKey, now.toString());
            
            updateDoc(userRef, { 
              sessionsCount: increment(1),
              lastActive: new Date().toISOString() 
            }).catch(console.error);
          }
        }
        
        // Listen to profile changes
        unsubProfile = onSnapshot(userRef, async (docSnap) => {
          try {
            if (docSnap.exists()) {
              const data = docSnap.data() as UserProfile;
              safeStorage.setItem('profile_cache', JSON.stringify(data));
              
              const isOwner = currentUser.email === 'asmatn628@gmail.com';
              const isAdmin = currentUser.email === 'asmatullah9327@gmail.com';
              const hasAdminPrivileges = isOwner || isAdmin || data.role === 'owner' || data.role === 'admin';
              
              const updates: any = {};
              const localSessionId = getLocalSessionId();

              // 1-Device Lock Check
              if (!hasAdminPrivileges && !justLoggedInRef.current) {
                if (data.sessionId && data.sessionId !== localSessionId) {
                  console.log("Logged in from another device. Logging out.");
                  signOut(auth);
                  setError("You have been logged out because your account was accessed from another device.");
                  return;
                } else if (!data.sessionId) {
                  updates.sessionId = localSessionId;
                  data.sessionId = localSessionId;
                }
              }

              // Auto-expire logic
              const now = new Date();
              if (data.status === 'active' && data.expiryDate && data.role !== 'owner') {
                const expiryDate = new Date(data.expiryDate);
                expiryDate.setDate(expiryDate.getDate() + 1);
                if (expiryDate < now) {
                  updates.status = 'expired';
                  data.status = 'expired';
                }
              }

              // Role enforcement
              if (isOwner && (data.role !== 'owner' || data.status !== 'active' || data.expiryDate !== 'Lifetime')) {
                updates.role = 'owner';
                updates.status = 'active';
                updates.expiryDate = 'Lifetime';
                data.role = 'owner';
                data.status = 'active';
                data.expiryDate = 'Lifetime';
              } else if (isAdmin && (data.role !== 'admin' || data.status !== 'active')) {
                updates.role = 'admin';
                updates.status = 'active';
                data.role = 'admin';
                data.status = 'active';
              }

              const hasPassword = currentUser.providerData.some(p => p.providerId === 'password');
              if (!data.hasPassword && hasPassword) {
                updates.hasPassword = true;
                data.hasPassword = true;
              }

              // Perform consolidated update if needed
              if (Object.keys(updates).length > 0) {
                try {
                  await updateDoc(userRef, updates);
                } catch (err) {
                  console.error("Failed to perform consolidated profile update:", err);
                }
              }

              setProfile(data);
            } else {
              // Create new user profile
              const isOwner = currentUser.email === 'asmatn628@gmail.com';
              const isAdmin = currentUser.email === 'asmatullah9327@gmail.com';
              const defaultRoleToSet = isOwner ? 'owner' : isAdmin ? 'admin' : 'user';
              const defaultStatusToSet = (isOwner || isAdmin) ? 'active' : 'pending';
              const hasPassword = currentUser.providerData.some(p => p.providerId === 'password');
              
              // Extract phone from dummy email if available
              let extractedPhone = '';
              if (currentUser.email?.endsWith('@moviznow.com')) {
                const phonePart = currentUser.email.replace('@moviznow.com', '');
                extractedPhone = standardizePhone(phonePart);
              }
              const standardizedUserPhone = standardizePhone(currentUser.phoneNumber || extractedPhone);

              let mergedOldData: any = {};
              let oldDocIds: string[] = [];

              try {
                const searchRef = collection(db, 'users');
                const findMatches = async (field: string, value: string) => {
                  if (!value) return [];
                  const q = query(searchRef, where(field, '==', value), limit(5));
                  const snap = await getDocs(q);
                  return snap.docs.filter(d => d.id !== currentUser.uid);
                };

                let matchDocs: any[] = [];
                if (currentUser.email && !currentUser.email.endsWith('@moviznow.com')) {
                  // Try exact match
                  const emailMatches = await findMatches('email', currentUser.email);
                  matchDocs = [...matchDocs, ...emailMatches];
                  
                  // Try lowercase match
                  const lowerEmail = currentUser.email.toLowerCase();
                  if (lowerEmail !== currentUser.email) {
                    const lowerEmailMatches = await findMatches('email', lowerEmail);
                    matchDocs = [...matchDocs, ...lowerEmailMatches];
                  }
                }
                
                if (standardizedUserPhone) {
                  // Try standardized
                  const phoneMatches = await findMatches('phone', standardizedUserPhone);
                  matchDocs = [...matchDocs, ...phoneMatches];
                  
                  // Try raw digits if different
                  const rawDigits = standardizedUserPhone.replace(/\D/g, '');
                  if (rawDigits && rawDigits !== standardizedUserPhone) {
                    const rawMatches = await findMatches('phone', rawDigits);
                    matchDocs = [...matchDocs, ...rawMatches];
                  }

                  // Try without leading 0 or +92 if present
                  let baseNumber = rawDigits;
                  if (baseNumber.startsWith('92')) baseNumber = baseNumber.substring(2);
                  if (baseNumber.startsWith('0')) baseNumber = baseNumber.substring(1);
                  if (baseNumber && baseNumber !== rawDigits) {
                    const baseMatches = await findMatches('phone', baseNumber);
                    const zeroPrefixMatches = await findMatches('phone', `0${baseNumber}`);
                    const plus92Matches = await findMatches('phone', `+92${baseNumber}`);
                    matchDocs = [...matchDocs, ...baseMatches, ...zeroPrefixMatches, ...plus92Matches];
                  }
                }

                // Deduplicate by ID
                const uniqueMatchDocs = matchDocs.filter((doc, index, self) =>
                  index === self.findIndex((t) => t.id === doc.id)
                );

                if (uniqueMatchDocs.length > 0) {
                  oldDocIds = uniqueMatchDocs.map(d => d.id);
                  mergedOldData = uniqueMatchDocs.reduce((acc, doc) => {
                    const data = doc.data() as UserProfile;
                    
                    // Role Priority: owner > admin > manager > ... > user
                    const rolePriority: Record<string, number> = {
                      'owner': 100,
                      'admin': 90,
                      'manager': 80,
                      'user_manager': 75,
                      'content_manager': 70,
                      'selected_content': 60,
                      'user': 10,
                      'trial': 5
                    };
                    const getRoleRank = (r: string) => rolePriority[r] || 0;
                    const betterRole = getRoleRank(data.role) > getRoleRank(acc.role || '') ? data.role : acc.role || data.role;

                    // Status Priority: active > pending > expired > suspended
                    const statusPriority: Record<string, number> = {
                      'active': 100,
                      'pending': 50,
                      'expired': 20,
                      'suspended': 0
                    };
                    const getStatusRank = (s: string) => statusPriority[s] || 0;
                    const betterStatus = getStatusRank(data.status) > getStatusRank(acc.status || '') ? data.status : acc.status || data.status;

                    // Expiry Date Logic: "Lifetime" wins, otherwise latest date
                    let betterExpiry = acc.expiryDate;
                    if (data.expiryDate === 'Lifetime' || acc.expiryDate === 'Lifetime') {
                      betterExpiry = 'Lifetime';
                    } else if (data.expiryDate && (!acc.expiryDate || data.expiryDate > acc.expiryDate)) {
                      betterExpiry = data.expiryDate;
                    }

                    return {
                      ...acc,
                      ...data,
                      role: betterRole,
                      status: betterStatus,
                      expiryDate: betterExpiry,
                      favorites: [...new Set([...(acc.favorites || []), ...(data.favorites || [])])],
                      watchLater: [...new Set([...(acc.watchLater || []), ...(data.watchLater || [])])],
                      assignedContent: [...new Set([...(acc.assignedContent || []), ...(data.assignedContent || [])])],
                      sessionsCount: (acc.sessionsCount || 0) + (data.sessionsCount || 0),
                      timeSpent: (acc.timeSpent || 0) + (data.timeSpent || 0),
                      createdAt: acc.createdAt && acc.createdAt < data.createdAt ? acc.createdAt : data.createdAt,
                      lastActive: acc.lastActive && acc.lastActive > (data.lastActive || '') ? acc.lastActive : (data.lastActive || acc.lastActive),
                    };
                  }, {} as any);
                }
              } catch (e) {
                console.error("Failed to check for existing accounts:", e);
              }

              const newProfile: UserProfile = {
                // Start with all aggregated data from old accounts
                ...mergedOldData,
                // Ensure identity fields match exactly what was used for this successful login
                uid: currentUser.uid,
                email: currentUser.email || mergedOldData.email || '',
                phone: standardizedUserPhone || mergedOldData.phone || '',
                displayName: currentUser.displayName || mergedOldData.displayName || '',
                photoURL: currentUser.photoURL || mergedOldData.photoURL || '',
                // Increment session data for the current session
                sessionsCount: (mergedOldData.sessionsCount || 0) + 1,
                hasPassword: hasPassword,
                sessionId: getLocalSessionId(),
                // Enforce roles based on the high-privileged list or the old data
                role: isOwner ? 'owner' : isAdmin ? 'admin' : (mergedOldData.role || defaultRoleToSet),
                status: (isOwner || isAdmin) ? 'active' : (mergedOldData.status || defaultStatusToSet),
                expiryDate: isOwner ? 'Lifetime' : (mergedOldData.expiryDate || null),
                // Ensure we have a creation date
                createdAt: mergedOldData.createdAt || new Date().toISOString(),
                lastActive: new Date().toISOString(),
                // Ensure arrays are initialized if missing
                favorites: mergedOldData.favorites || [],
                watchLater: mergedOldData.watchLater || [],
                assignedContent: mergedOldData.assignedContent || [],
              };

              try {
                const batch = writeBatch(db);
                // Set the new user record
                batch.set(userRef, newProfile);
                
                // Delete all old records that were merged
                oldDocIds.forEach(oldId => {
                  batch.delete(doc(db, 'users', oldId));
                  console.log(`Merged and scheduled deletion of old profile: ${oldId}`);
                });
                
                await batch.commit();
                console.log(`Successfully combined ${oldDocIds.length} accounts into new UID ${currentUser.uid}`);
              } catch (err) {
                console.error("Failed to merge/create user profile:", err);
                // Fallback attempt if batch fails
                try {
                   await setDoc(userRef, newProfile);
                } catch(e) {}
              }
              safeStorage.setItem('profile_cache', JSON.stringify(newProfile));
              setProfile(newProfile);
            }
          } catch (error) {
            console.error("Error updating/creating profile:", error);
          } finally {
            setLoading(false);
          }
        }, (error) => {
          console.error("Profile snapshot error for UID:", currentUser.uid, error);
          setLoading(false);
          handleFirestoreError(error, OperationType.GET, `users/${currentUser.uid}`);
        });
      } else {
        if (unsubProfile) {
          unsubProfile();
          unsubProfile = undefined;
        }
        safeStorage.removeItem('profile_cache');
        setProfile(null);
        setLoading(false);
        
        if (sessionStartTimeRef.current) {
          sessionStorage.removeItem('session_started');
          sessionStartTimeRef.current = null;
        }
      }
    });

    // Track time spent accurately every second and save to local storage
    const timeTrackerInterval = setInterval(() => {
      if (auth.currentUser && sessionStartTimeRef.current) {
        if (document.visibilityState === 'visible') {
          const uid = auth.currentUser.uid;
          const globalTickKey = `last_global_tick_${uid}`;
          const now = Date.now();
          const lastTick = parseInt(safeStorage.getItem(globalTickKey) || '0', 10);
          
          // Prevent double-counting if multiple tabs are active (wall-clock precision lock)
          if (now - lastTick >= 900) {
            safeStorage.setItem(globalTickKey, now.toString());
            
            const cacheKey = `accumulated_time_seconds_${uid}`;
            const lastSyncKey = `last_time_sync_${uid}`;
            
            let accSeconds = parseInt(safeStorage.getItem(cacheKey) || '0', 10);
            if (isNaN(accSeconds)) accSeconds = 0;
            accSeconds += 1;
            safeStorage.setItem(cacheKey, accSeconds.toString());

            // Initialize last sync time if it doesn't exist so the 12-hour timer starts correctly
            let lastSyncTimeStr = safeStorage.getItem(lastSyncKey);
            if (!lastSyncTimeStr) {
               lastSyncTimeStr = Date.now().toString();
               safeStorage.setItem(lastSyncKey, lastSyncTimeStr);
            }

            let lastSyncTime = parseInt(lastSyncTimeStr, 10);
            if (isNaN(lastSyncTime)) lastSyncTime = Date.now();
            const twelveHoursMs = 12 * 60 * 60 * 1000;
            const forceSync = (Date.now() - lastSyncTime) >= twelveHoursMs;

            // Sync to Firestore every 5 minutes (300 seconds) or every 12 hours to reduce write operations
            if ((accSeconds >= 300 || forceSync) && navigator.onLine) {
              let minutesToSync = Math.floor(accSeconds / 60);
              
              // If forced by 12 hours and we have less than 1 minute, round up so we don't drop the time
              if (forceSync && minutesToSync === 0 && accSeconds > 0) {
                minutesToSync = 1;
              }

              if (minutesToSync > 0) {
                // Critical multi-tab lock: Deduct exactly what we consume immediately BEFORE the async request
                const actualSecondsToConsume = Math.min(accSeconds, minutesToSync * 60);
                
                // Double-check the cache before deducting to prevent race conditions across tabs
                let currentSafeSeconds = parseInt(safeStorage.getItem(cacheKey) || '0', 10);
                if (isNaN(currentSafeSeconds)) currentSafeSeconds = 0;
                
                // If another tab already synced and emptied this, abort
                if (currentSafeSeconds < actualSecondsToConsume) {
                  return;
                }

                const remainingSeconds = Math.max(0, currentSafeSeconds - actualSecondsToConsume);
                const optimisticSyncTime = Date.now().toString();
                
                safeStorage.setItem(cacheKey, remainingSeconds.toString());
                safeStorage.setItem(lastSyncKey, optimisticSyncTime);
                
                const userRef = doc(db, 'users', uid);
                const updates: any = {
                   lastActive: new Date().toISOString(),
                   timeSpent: increment(minutesToSync)
                };

                updateDoc(userRef, updates).then(() => {
                   logEvent('time_spent', uid, { duration: minutesToSync });
                }).catch((err) => {
                   console.error("Failed to sync time spent:", err);
                   // Revert strictly what was consumed on failure
                   let revertSafeSeconds = parseInt(safeStorage.getItem(cacheKey) || '0', 10);
                   if (isNaN(revertSafeSeconds)) revertSafeSeconds = 0;
                   safeStorage.setItem(cacheKey, (revertSafeSeconds + actualSecondsToConsume).toString());
                   // Only revert sync timer if another tab hasn't already successfully synced in the meantime
                   if (safeStorage.getItem(lastSyncKey) === optimisticSyncTime) {
                     safeStorage.setItem(lastSyncKey, lastSyncTime.toString());
                   }
                });
              }
            }
          }
        }
      }
    }, 1000);

    // Sync any remaining full minutes on visibility change
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && auth.currentUser && navigator.onLine) {
         const uid = auth.currentUser.uid;
         const cacheKey = `accumulated_time_seconds_${uid}`;
         const lastSyncKey = `last_time_sync_${uid}`;
         
         let accSeconds = parseInt(safeStorage.getItem(cacheKey) || '0', 10);
         if (isNaN(accSeconds)) accSeconds = 0;
         
         const minutesToSync = Math.floor(accSeconds / 60);

         // Only execute a Firestore update on hide if there are actually full minutes to sync
         if (minutesToSync > 0) {
           const actualSecondsToConsume = minutesToSync * 60;
           
           // Read latest cache to prevent cross-tab overlap deduction
           let currentSafeSeconds = parseInt(safeStorage.getItem(cacheKey) || '0', 10);
           if (isNaN(currentSafeSeconds)) currentSafeSeconds = 0;
           
           if (currentSafeSeconds < actualSecondsToConsume) {
             return; // Another tab synced it
           }

           const remainingSeconds = Math.max(0, currentSafeSeconds - actualSecondsToConsume);
           const optimisticSyncTime = Date.now().toString();
           
           // Synchronously deduct before async
           safeStorage.setItem(cacheKey, remainingSeconds.toString());
           safeStorage.setItem(lastSyncKey, optimisticSyncTime);
           
           const userRef = doc(db, 'users', uid);
           const updates: any = {
             lastActive: new Date().toISOString(),
             timeSpent: increment(minutesToSync)
           };

           updateDoc(userRef, updates)
             .then(() => {
               logEvent('time_spent', uid, { duration: minutesToSync });
             })
             .catch((err) => {
               console.error("Failed to sync closing time spent:", err);
               // Revert safely
               let revertSafeSeconds = parseInt(safeStorage.getItem(cacheKey) || '0', 10);
               if (isNaN(revertSafeSeconds)) revertSafeSeconds = 0;
               safeStorage.setItem(cacheKey, (revertSafeSeconds + actualSecondsToConsume).toString());
               
               // Let lastSyncKey naturally wait instead of complex revert parsing since the tab is hidden
             });
         }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      unsubscribe();
      if (unsubProfile) {
        unsubProfile();
      }
      clearInterval(timeTrackerInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const clearError = () => setError(null);

  const signInWithGoogle = async () => {
    try {
      setError(null);
      justLoggedInRef.current = true;
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      
      // Check if we need to link phone/email in Firestore
      const userRef = doc(db, 'users', result.user.uid);
      const snap = await getDoc(userRef);
      const localSessionId = getLocalSessionId();
      
      if (snap.exists()) {
        const data = snap.data();
        const updates: any = { sessionId: localSessionId };
        if (!data.email && result.user.email) {
          updates.email = result.user.email;
        }
        try {
          await updateDoc(userRef, updates);
        } catch (e) {}
      }
      setTimeout(() => { justLoggedInRef.current = false; }, 10000);
    } catch (err: any) {
      justLoggedInRef.current = false;
      console.error("Login error:", err);
      setError(err.message || "Failed to login");
    }
  };

  const signInWithEmail = async (email: string, password: string) => {
    try {
      setError(null);
      justLoggedInRef.current = true;
      const result = await signInWithEmailAndPassword(auth, email, password);
      try {
        await updateDoc(doc(db, 'users', result.user.uid), { sessionId: getLocalSessionId() });
      } catch (e) {}
      setTimeout(() => { justLoggedInRef.current = false; }, 10000);
    } catch (err: any) {
      justLoggedInRef.current = false;
      console.error("Email login error:", err);
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password') {
        setError("Invalid password. Try again or reset your password.");
      } else {
        setError(err.message || "Failed to login with email");
      }
      throw err;
    }
  };

  const signUpWithEmail = async (email: string, password: string, displayName: string, phone?: string) => {
    try {
      setError(null);
      
      // Check if email is already in use in Firestore
      const emailUsers = await findUsersByEmailOrPhone(email);
      if (emailUsers.some(u => u.hasPassword)) {
        throw new Error("This email is already registered.");
      }

      // Check if phone is already in use
      if (phone) {
        const phoneUsers = await findUsersByEmailOrPhone(phone);
        if (phoneUsers.some(u => u.hasPassword)) {
          throw new Error("This phone number is already registered to another account.");
        }
        
        const isWhitelisted = await isPhoneWhitelisted(phone);
        if (!isWhitelisted) {
          throw new Error("This phone number is not authorized for new account creation.");
        }
      } else {
        throw new Error("Phone number is required for new account creation.");
      }

      justLoggedInRef.current = true;
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(userCredential.user, { displayName });
      
      if (phone) {
        setTimeout(async () => {
          try {
            await updateDoc(doc(db, 'users', userCredential.user.uid), { phone });
          } catch (e) {}
        }, 2000);
      }
      setTimeout(() => { justLoggedInRef.current = false; }, 10000);
    } catch (err: any) {
      justLoggedInRef.current = false;
      console.error("Email signup error:", err);
      setError(err.message || "Failed to sign up");
      throw err;
    }
  };

  const signUpWithPhoneAndPassword = async (identifier: string, password: string, displayName: string, email?: string) => {
    try {
      setError(null);
      
      const isEmail = identifier.includes('@');
      const standardizedPhone = isEmail ? '' : standardizePhone(identifier);
      const digits = standardizedPhone.replace(/\D/g, '');
      const signupEmail = isEmail ? identifier : (email || `${digits}@moviznow.com`);

      // Check if identifier is already in use
      const matches = await findUsersByEmailOrPhone(identifier);
      if (matches.some(u => u.hasPassword)) {
        throw new Error("This account is already registered.");
      }

      if (!isEmail) {
        const isWhitelisted = await isPhoneWhitelisted(standardizedPhone);
        if (!isWhitelisted) {
          throw new Error("This phone number is not authorized for new account creation.");
        }
      }

      // Check if email is already in use
      if (email && email !== signupEmail) {
        const emailUsers = await findUsersByEmailOrPhone(email);
        if (emailUsers.some(u => u.hasPassword)) {
          throw new Error("This email is already registered.");
        }
      }

      justLoggedInRef.current = true;
      const userCredential = await createUserWithEmailAndPassword(auth, signupEmail, password);
      await updateProfile(userCredential.user, { displayName });
      
      if (standardizedPhone) {
        setTimeout(async () => {
          try {
            await updateDoc(doc(db, 'users', userCredential.user.uid), { phone: standardizedPhone });
          } catch (e) {}
        }, 2000);
      }
      setTimeout(() => { justLoggedInRef.current = false; }, 10000);
    } catch (err: any) {
      justLoggedInRef.current = false;
      console.error("Signup error:", err);
      if (err.code === 'auth/email-already-in-use') {
        setError("This account is already registered.");
      } else {
        setError(err.message || "Failed to sign up");
      }
      throw err;
    }
  };

  const isPhoneWhitelisted = async (phone: string): Promise<boolean> => {
    const standardizedPhone = standardizePhone(phone);
    const docRef = doc(db, 'whitelisted_phones', standardizedPhone);
    const docSnap = await getDoc(docRef);
    return docSnap.exists();
  };

  const findUsersByEmailOrPhone = async (identifier: string): Promise<UserProfile[]> => {
    try {
      const trimmed = identifier.trim();
      if (!trimmed) return [];

      const matches: UserProfile[] = [];
      const seenUids = new Set<string>();

      const addMatches = (snap: any) => {
        snap.docs.forEach((doc: any) => {
          const data = doc.data() as UserProfile;
          if (!seenUids.has(data.uid)) {
            matches.push(data);
            seenUids.add(data.uid);
          }
        });
      };

      const queries = [];

      // 1. Check exactly as provided (email or phone)
      queries.push(getDocs(query(collection(db, 'users'), where('email', '==', trimmed.toLowerCase()), limit(5))));
      queries.push(getDocs(query(collection(db, 'users'), where('phone', '==', trimmed), limit(5))));

      // 2. If it looks like a phone number, try multiple formats
      const cleaned = trimmed.replace(/[^\d+]/g, '');
      const isPhone = cleaned.length >= 7 && /^[\d+]+$/.test(cleaned);
      
      if (isPhone) {
        const standardized = standardizePhone(cleaned);
        
        let digitsOnly = cleaned.replace(/[^\d]/g, '');
        let base = digitsOnly;
        if (base.startsWith('92')) base = base.substring(2);
        else if (base.startsWith('0')) base = base.substring(1);
        
        const phoneFormats = [
          standardized,
          `+92${base}`,
          `0${base}`,
          `92${base}`,
          base
        ].filter((v, i, a) => v && a.indexOf(v) === i);

        const emailFormats = [
          `${base}@moviznow.com`,
          `92${base}@moviznow.com`,
          `0${base}@moviznow.com`,
          `+92${base}@moviznow.com`
        ].filter((v, i, a) => v && a.indexOf(v) === i);

        if (phoneFormats.length > 0) {
          queries.push(getDocs(query(collection(db, 'users'), where('phone', 'in', phoneFormats), limit(5))));
        }
        if (emailFormats.length > 0) {
          queries.push(getDocs(query(collection(db, 'users'), where('email', 'in', emailFormats), limit(5))));
        }
      }

      const snapshots = await Promise.all(queries);
      snapshots.forEach(addMatches);

      return matches;
    } catch (err) {
      console.error("Error finding users:", err);
      return [];
    }
  };

  const updateUserProfileData = async (data: Partial<UserProfile>, newPassword?: string) => {
    if (!auth.currentUser || !user || !profile) throw new Error("No user logged in");
    try {
      setError(null);

      // Check for phone duplicate if changing
      if (data.phone && data.phone !== profile.phone) {
        const existingPhones = await findUsersByEmailOrPhone(data.phone);
        if (existingPhones.some(u => u.uid !== user.uid)) {
          throw new Error("This phone number is already in use by another account.");
        }
      }

      // Check for email duplicate if changing (though UI might prevent this)
      if (data.email && data.email !== profile.email) {
        const existingEmails = await findUsersByEmailOrPhone(data.email);
        if (existingEmails.some(u => u.uid !== user.uid)) {
          throw new Error("This email address is already in use by another account.");
        }
      }
      
      // Update Auth Profile if name changed
      if (data.displayName && data.displayName !== auth.currentUser.displayName) {
        await updateProfile(auth.currentUser, { displayName: data.displayName });
      }

      // Update Auth Email if changed and provided
      if (data.email && data.email !== auth.currentUser.email && !data.email.endsWith('@moviznow.com')) {
        const { updateEmail } = await import('firebase/auth');
        await updateEmail(auth.currentUser, data.email);
      }

      // Update Password if provided
      if (newPassword) {
        await updatePassword(auth.currentUser, newPassword);
        data.hasPassword = true;
      }

      // Update Firestore
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, data);
      
      setProfile({ ...profile, ...data });
    } catch (err: any) {
      console.error("Update profile error:", err);
      setError(err.message || "Failed to update profile");
      throw err;
    }
  };

  const updateUserPassword = async (newPassword: string) => {
    if (!auth.currentUser || !user) throw new Error("No user logged in");
    try {
      await updatePassword(auth.currentUser, newPassword);
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, { hasPassword: true });
      if (profile) {
        setProfile({ ...profile, hasPassword: true });
      }
    } catch (err: any) {
      console.error("Update password error:", err);
      setError(err.message || "Failed to update password");
      throw err;
    }
  };

  const logout = async () => {
    await signOut(auth);
  };

  const toggleFavorite = async (contentId: string) => {
    if (!profile || !user) return;

    const newFavorites = profile.favorites?.includes(contentId)
      ? profile.favorites.filter(id => id !== contentId)
      : [...(profile.favorites || []), contentId];

    // Optimistic update
    const updatedProfile = { ...profile, favorites: newFavorites };
    setProfile(updatedProfile);
    safeStorage.setItem('profile_cache', JSON.stringify(updatedProfile));

    if (isOnline) {
      try {
        await updateDoc(doc(db, 'users', user.uid), { favorites: newFavorites });
      } catch (err) {
        console.error("Failed to update favorites online:", err);
        // If it failed despite being online, queue it
        const pending = JSON.parse(safeStorage.getItem('pending_favorites') || '[]');
        pending.push(contentId);
        safeStorage.setItem('pending_favorites', JSON.stringify(pending));
      }
    } else {
      const pending = JSON.parse(safeStorage.getItem('pending_favorites') || '[]');
      pending.push(contentId);
      safeStorage.setItem('pending_favorites', JSON.stringify(pending));
    }
  };

  const toggleWatchLater = async (contentId: string) => {
    if (!profile || !user) return;

    const newWatchLater = profile.watchLater?.includes(contentId)
      ? profile.watchLater.filter(id => id !== contentId)
      : [...(profile.watchLater || []), contentId];

    // Optimistic update
    const updatedProfile = { ...profile, watchLater: newWatchLater };
    setProfile(updatedProfile);
    safeStorage.setItem('profile_cache', JSON.stringify(updatedProfile));

    if (isOnline) {
      try {
        await updateDoc(doc(db, 'users', user.uid), { watchLater: newWatchLater });
      } catch (err) {
        console.error("Failed to update watch later online:", err);
        const pending = JSON.parse(safeStorage.getItem('pending_watch_later') || '[]');
        pending.push(contentId);
        safeStorage.setItem('pending_watch_later', JSON.stringify(pending));
      }
    } else {
      const pending = JSON.parse(safeStorage.getItem('pending_watch_later') || '[]');
      pending.push(contentId);
      safeStorage.setItem('pending_watch_later', JSON.stringify(pending));
    }
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      profile, 
      loading, 
      authLoading, 
      error, 
      signInWithGoogle, 
      signInWithEmail,
      signUpWithEmail,
      signUpWithPhoneAndPassword,
      isPhoneWhitelisted,
      findUsersByEmailOrPhone,
      updateUserPassword,
      updateUserProfileData,
      clearError,
      logout, 
      toggleFavorite, 
      toggleWatchLater 
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
