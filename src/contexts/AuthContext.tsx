import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  useCallback,
} from "react";
import { auth, db } from "../firebase";
import { safeStorage } from "../utils/safeStorage";
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
  updatePassword,
} from "firebase/auth";
import {
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  updateDoc,
  query,
  collection,
  where,
  getDocs,
  deleteDoc,
  limit,
  writeBatch,
  orderBy,
  increment,
} from "firebase/firestore";
import { UserProfile } from "../types";
import { logEvent, updateTimeSpent } from "../services/analytics";
import {
  handleFirestoreError,
  OperationType,
} from "../utils/firestoreErrorHandler";

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  authLoading: boolean;
  error: string | null;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (
    email: string,
    password: string,
    displayName: string,
    phone?: string,
  ) => Promise<void>;
  signUpWithPhoneAndPassword: (
    phone: string,
    password: string,
    displayName: string,
    email?: string,
  ) => Promise<void>;
  isPhoneWhitelisted: (phone: string) => Promise<boolean>;
  findUsersByEmailOrPhone: (identifier: string) => Promise<UserProfile[]>;
  updateUserPassword: (newPassword: string) => Promise<void>;
  updateUserProfileData: (
    data: Partial<UserProfile>,
    newPassword?: string,
    force?: boolean,
  ) => Promise<void>;
  clearError: () => void;
  logout: () => Promise<void>;
  toggleFavorite: (contentId: string) => Promise<void>;
  toggleWatchLater: (contentId: string) => Promise<void>;
  refreshProfile: (force?: boolean, reason?: 'auto' | 'manual' | 'login' | 'logout') => Promise<boolean>;
  isSyncing: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const standardizePhone = (phone: string) => {
  if (!phone) return "";
  // Remove all non-digits
  const cleaned = phone.trim();
  let digits = cleaned.replace(/\D/g, "");
  if (!digits) return "";

  // Pakistan specific standardization: target is +923XXXXXXXXX (13 chars)
  // Standard mobile number in PK is 10 digits starting with 3 (e.g. 3001234567)
  
  let base = digits;
  
  // Repeatedly remove prefixes that are common in Pakistan
  // 1. Remove 92 if it's there and leaves at least 10 digits
  if (base.startsWith("92") && base.length > 10) {
    base = base.substring(2);
  }
  
  // 2. Remove 0 if it's there and leaves exactly 10 digits (e.g. 0300... -> 300...)
  if (base.startsWith("0") && base.length === 11) {
    base = base.substring(1);
  }

  // Final check: if we have 10 digits starting with 3, it's a standard PK mobile
  if (base.length === 10 && base.startsWith("3")) {
    return `+92${base}`;
  }

  // Fallback for already correct format or other international numbers
  if (cleaned.startsWith("+")) {
    return `+${digits}`;
  }

  // If it's 12 digits starting with 923, it's likely already standardized without the plus
  if (digits.length === 12 && digits.startsWith("923")) {
    return `+${digits}`;
  }

  return digits;
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [profile, setProfile] = useState<UserProfile | null>(() => {
    const cached = safeStorage.getItem("profile_cache");
    const timestampStr = safeStorage.getItem("profile_cache_timestamp");
    if (cached && timestampStr) {
      const timestamp = parseInt(timestampStr, 10);
      const now = Date.now();
      if (now - timestamp <= 30 * 60 * 60 * 1000) {
        return JSON.parse(cached);
      }
    }
    return null;
  });
  const [loading, setLoading] = useState(() => {
    const cached = safeStorage.getItem("profile_cache");
    const timestampStr = safeStorage.getItem("profile_cache_timestamp");
    if (cached && timestampStr) {
      const timestamp = parseInt(timestampStr, 10);
      const now = Date.now();
      if (now - timestamp <= 30 * 60 * 60 * 1000) {
        return false;
      }
    }
    return true;
  });
  const [authLoading, setAuthLoading] = useState(!auth.currentUser);
  const [error, setError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const sessionStartTimeRef = useRef<number | null>(null);
  const justLoggedInRef = useRef(false);

  const getLocalSessionId = () => {
    try {
      let id = safeStorage.getItem("device_session_id");
      if (!id) {
        id = Math.random().toString(36).substring(2) + Date.now().toString(36);
        safeStorage.setItem("device_session_id", id);
      }
      return id;
    } catch (e) {
      if (!(window as any)._fallbackSessionId) {
        (window as any)._fallbackSessionId =
          Math.random().toString(36).substring(2) + Date.now().toString(36);
      }
      return (window as any)._fallbackSessionId;
    }
  };

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const refreshProfile = useCallback(async (force = false, reason: 'auto' | 'manual' | 'login' | 'logout' = 'auto'): Promise<boolean> => {
    let updatedSomething = false;
    const currentUser = auth.currentUser;
    if (!currentUser) {
      safeStorage.removeItem("profile_cache");
      setProfile(null);
      setLoading(false);
      return false;
    }

    const userRef = doc(db, "users", currentUser.uid);
    const cachedProfileStr = safeStorage.getItem("profile_cache");
    let localProfile = cachedProfileStr ? JSON.parse(cachedProfileStr) : null;
    
    // Only show loading if we have no profile data to show
    if (!profile && !localProfile) setLoading(true);

    try {
      const localVersionKey = `profile_version_${currentUser.uid}`;
      const localVersion = parseInt(safeStorage.getItem(localVersionKey) || "0", 10);
      
      const now = Date.now();
      const dailySyncKey = `last_daily_sync_${currentUser.uid}`;
      const lastSyncDateStr = localStorage.getItem(dailySyncKey);
      
      const shiftedTime = new Date(now + (5 - 7) * 60 * 60 * 1000);
      const pktDate = `${shiftedTime.getUTCFullYear()}-${shiftedTime.getUTCMonth() + 1}-${shiftedTime.getUTCDate()}`;
      const isDailySync = lastSyncDateStr !== pktDate;

      if (localProfile && !profile) {
         setProfile(localProfile);
         setLoading(false); // Unblock immediately if we have cached data
      }

      // 1. Firstly read chunk_meta
      let serverVersion = localVersion;
      let isVersionMissing = false;
      if (navigator.onLine && (force || isDailySync || !localProfile)) {
        setIsSyncing(true);
        try {
          const { getChunkMeta } = await import('../utils/chunkMeta');
          const meta = await getChunkMeta(force);
          const chunkUsersMeta = meta.users || {};
          if (currentUser.uid in chunkUsersMeta) {
             serverVersion = chunkUsersMeta[currentUser.uid];
          } else {
             isVersionMissing = true;
          }
        } catch (e) {
          console.error("Failed to fetch chunk_meta for profile:", e);
        }
      }

      // 2. If version changes found
      const versionChanged = serverVersion > localVersion || localVersion === 0;

      let serverProfile: UserProfile | null = null;
      let docSnap;
      
      // 7. Before updating user data, first check version from content_meta, if different new version first read the user data doc
      if (navigator.onLine && (versionChanged || !localProfile || force)) {
        try {
          docSnap = await getDoc(userRef);
          if (docSnap.exists()) {
            serverProfile = docSnap.data() as UserProfile;
            updatedSomething = true;
          }
        } catch (e) {
          console.error("Error reading user data from Firestore, using local fallback", e);
          if (!localProfile) {
            // Can't run without local profile if getDoc fails
            throw e;
          }
        }
      } else if (navigator.onLine) {
        // Just checking if we need to retrieve snapshot for later (legacy checks)
         const cachedDocSnapStr = safeStorage.getItem("profile_doc_snap");
         if (!cachedDocSnapStr && !localProfile) {
            try {
              docSnap = await getDoc(userRef);
              if (docSnap.exists()) {
                 serverProfile = docSnap.data() as UserProfile;
              }
            } catch (e) {}
         }
      }

      // 3. Update user data if changed versions then sync it with local storage version like time in app, favorites, watch later... merge data intelligently first in local storage
      let mergedProfile: UserProfile | null = localProfile ? { ...localProfile } as UserProfile : null;
      if (serverProfile) {
        mergedProfile = {
            ...(localProfile || {}),
            ...serverProfile,
            favorites: safeStorage.getItem("needs_user_sync") === "true" && safeStorage.getItem("pending_favorites_array") 
                ? JSON.parse(safeStorage.getItem("pending_favorites_array")!) 
                : Array.from(new Set([...(localProfile?.favorites || []), ...(serverProfile.favorites || [])])),
            watchLater: safeStorage.getItem("needs_user_sync") === "true" && safeStorage.getItem("pending_watch_later_array") 
                ? JSON.parse(safeStorage.getItem("pending_watch_later_array")!) 
                : Array.from(new Set([...(localProfile?.watchLater || []), ...(serverProfile.watchLater || [])])),
            orders: (() => {
                const localOrders = localProfile?.orders || [];
                const serverOrders = serverProfile.orders || [];
                const merged = [...localOrders];
                serverOrders.forEach(so => {
                    if (!merged.find(lo => lo.id === so.id)) merged.push(so);
                });
                return merged;
            })(),
            timeSpent: Math.max(serverProfile.timeSpent || 0, localProfile?.timeSpent || 0)
        };
      }

      // Flush any accumulated seconds before sync
      const cacheKey = `accumulated_time_seconds_${currentUser.uid}`;
      let accSecs = parseInt(safeStorage.getItem(cacheKey) || "0", 10);
      if (accSecs > 0) {
        safeStorage.setItem(cacheKey, "0");
        const pendingStr = safeStorage.getItem('pending_user_updates') || '{}';
        try {
          let pendingAll = JSON.parse(pendingStr);
          pendingAll[currentUser.uid] = pendingAll[currentUser.uid] || {};
          let currentBase = typeof pendingAll[currentUser.uid].timeSpent === 'number' ? pendingAll[currentUser.uid].timeSpent : (localProfile?.timeSpent || 0);
          pendingAll[currentUser.uid].timeSpent = currentBase + accSecs;
          safeStorage.setItem('pending_user_updates', JSON.stringify(pendingAll));
        } catch(e){}
      }

      // 4. Update user data doc and update chunk_meta version for user ONLY when necessary daily or local change
      const needsUserSync = safeStorage.getItem("needs_user_sync") === "true";
      let pendingTimeSpent = false;
      try {
        const pdStr = safeStorage.getItem("pending_user_updates");
        if (pdStr) {
           const pObj = JSON.parse(pdStr);
           if (pObj[currentUser.uid] && pObj[currentUser.uid].timeSpent !== undefined) pendingTimeSpent = true;
        }
      } catch(e){}
      
      const hasLocalChanges = needsUserSync || (accSecs > 0) || pendingTimeSpent;
      
      // Strict rule: Only write to Firestore if forced or if it's the daily sync window (after 9 AM PKT)
      // If needsUserSync is true but it's not the daily sync time, it stays in local storage until next day
      const isLogin = justLoggedInRef.current || reason === 'login';
      const isSignOut = reason === 'logout';
      const shouldWrite = (serverProfile || localProfile) && 
        (isVersionMissing || isLogin || isSignOut || (hasLocalChanges && (isDailySync || force)));

      if (shouldWrite) {
        try {
            const { writeBatch } = await import('firebase/firestore');
            const batch = writeBatch(db);
            const newVersion = Date.now();
            
            const updatesToPush: any = {};
            if (needsUserSync) {
                const pendFavs = safeStorage.getItem("pending_favorites_array");
                if (pendFavs) updatesToPush.favorites = JSON.parse(pendFavs);
                const pendWL = safeStorage.getItem("pending_watch_later_array");
                if (pendWL) updatesToPush.watchLater = JSON.parse(pendWL);
                
                // Sync any deferred string/boolean/array profile fields
                const syncableKeys = ['phone', 'displayName', 'lastNotificationCheck', 'notification', 'movieRequests', 'orders', 'settings', 'timeSpent'];
                syncableKeys.forEach(key => {
                   if (localProfile && localProfile[key] !== undefined && JSON.stringify(localProfile[key]) !== JSON.stringify(serverProfile?.[key])) {
                       updatesToPush[key] = localProfile[key];
                   }
                });
            }
            if (mergedProfile.timeSpent !== undefined) updatesToPush.timeSpent = mergedProfile.timeSpent;
            
            // Check if there's any pending timeSpent in pending_user_updates for THIS user
            const pendingUpdatesStr = safeStorage.getItem("pending_user_updates");
            if (pendingUpdatesStr) {
              try {
                const pendingAll = JSON.parse(pendingUpdatesStr);
                const myPending = pendingAll[currentUser.uid];
                if (myPending) {
                   if (myPending.timeSpent !== undefined) {
                     updatesToPush.timeSpent = Math.max(updatesToPush.timeSpent || 0, myPending.timeSpent);
                     delete myPending.timeSpent;
                   }
                   Object.assign(updatesToPush, myPending);
                   delete pendingAll[currentUser.uid];
                   safeStorage.setItem("pending_user_updates", JSON.stringify(pendingAll));
                }
              } catch (e) {}
            }
            
            updatesToPush.lastActive = new Date().toISOString();

            if (Object.keys(updatesToPush).length > 0) {
              batch.set(userRef, updatesToPush, { merge: true });
            }
            // Add user version to chunk_meta to prevent infinite writes
            const metaRef = doc(db, 'chunk_meta', 'versions');
            let skipCommit = false;
            try {
               const { updateDoc } = await import('firebase/firestore');
               await updateDoc(metaRef, { [`users.${currentUser.uid}`]: newVersion });
            } catch (e) {
               batch.set(metaRef, { users: { [currentUser.uid]: newVersion } }, { merge: true });
               await batch.commit();
               skipCommit = true;
            }
            if (!skipCommit) await batch.commit();

            if (isDailySync) localStorage.setItem(dailySyncKey, pktDate);
            safeStorage.setItem("needs_user_sync", "false");
            safeStorage.removeItem("pending_favorites_array");
            safeStorage.removeItem("pending_watch_later_array");
            safeStorage.removeItem("pending_content_clicks");
            safeStorage.removeItem("pending_link_clicks");
            safeStorage.setItem(localVersionKey, newVersion.toString());
            mergedProfile = { ...mergedProfile, ...updatesToPush };
            if (hasLocalChanges || versionChanged) updatedSomething = true;
            console.log("Profile changes synced & merged to Firestore");
        } catch (err) {
            handleFirestoreError(err, OperationType.WRITE, `users/${currentUser.uid}`);
            console.error("Manual/Daily profile sync failed:", err);
        }
      } else {
        if (isDailySync) localStorage.setItem(dailySyncKey, pktDate);
        if (serverProfile) {
            safeStorage.setItem(localVersionKey, serverVersion.toString());
        }
      }

      if (mergedProfile && Object.keys(mergedProfile).length > 0) {
          safeStorage.setItem("profile_cache", JSON.stringify(mergedProfile));
      safeStorage.setItem("profile_cache_timestamp", Date.now().toString());
          setProfile(mergedProfile);
      }

      // Admin & Session checks
      if (mergedProfile || serverProfile) {
        const data = mergedProfile && Object.keys(mergedProfile).length > 0 ? mergedProfile : serverProfile as UserProfile;

        const userEmailLower = currentUser.email?.toLowerCase();
        const isOwner = userEmailLower === "asmatn628@gmail.com";
        const isAdmin = [
          "asmatullah9327@gmail.com",
          "kabirahmaddev@gmail.com",
          "wamoviesstation@gmail.com"
        ].includes(userEmailLower || "");
        const hasAdminPrivileges =
          isOwner ||
          isAdmin ||
          data.role === "owner" ||
          data.role === "admin";

        const updates: any = {};
        const localSessionId = getLocalSessionId();

        // 1-Device Lock Check
        if (!hasAdminPrivileges && !justLoggedInRef.current && safeStorage.isAvailable) {
          if (data.sessionId && data.sessionId !== localSessionId) {
            console.log("Logged in from another device. Logging out.");
            signOut(auth);
            setError(
              "You have been logged out because your account was accessed from another device."
            );
            return false;
          } else if (!data.sessionId) {
            updates.sessionId = localSessionId;
            data.sessionId = localSessionId;
          }
        }

        // Auto-expire logic
        const expiryNow = new Date();
        if (
          data.status === "active" &&
          data.expiryDate &&
          data.role !== "owner"
        ) {
          // Parse expiry date by YYYY-MM-DD to avoid timezone shifting
          const expiryDateStr = data.expiryDate.split('T')[0]; 
          const parts = expiryDateStr.split('-');
          // Create expiration boundary at 00:00:00 local time on the day AFTER the expiry date
          const expiryBoundary = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]) + 1);
          if (expiryNow >= expiryBoundary) {
            let isReallyExpired = true;
            if (!serverProfile && navigator.onLine) {
              try {
                const freshSnap = await getDoc(userRef);
                if (freshSnap.exists()) {
                  const freshData = freshSnap.data() as UserProfile;
                  serverProfile = freshData;
                  if (freshData.expiryDate) {
                    const fExpStr = freshData.expiryDate.split('T')[0];
                    const fParts = fExpStr.split('-');
                    const freshBoundary = new Date(parseInt(fParts[0]), parseInt(fParts[1]) - 1, parseInt(fParts[2]) + 1);
                    if (expiryNow < freshBoundary || freshData.status !== "active") {
                      isReallyExpired = false;
                      data.expiryDate = freshData.expiryDate;
                      data.status = freshData.status;
                      if (mergedProfile) {
                        mergedProfile.expiryDate = freshData.expiryDate;
                        mergedProfile.status = freshData.status;
                      }
                    }
                  }
                }
              } catch (e) {
                console.error("Failed to fresh fetch for expiry check", e);
              }
            }
            
            if (isReallyExpired) {
              updates.status = "expired";
              data.status = "expired";
              if (mergedProfile) {
                mergedProfile.status = "expired";
              }
            }
          }
        }

        // Role enforcement
        if (
          isOwner &&
          (data.role !== "owner" ||
            data.status !== "active" ||
            data.expiryDate !== "Lifetime")
        ) {
          updates.role = "owner";
          updates.status = "active";
          updates.expiryDate = "Lifetime";
          data.role = "owner";
          data.status = "active";
          data.expiryDate = "Lifetime";
        } else if (
          isAdmin &&
          (data.role !== "admin" || data.status !== "active")
        ) {
          updates.role = "admin";
          updates.status = "active";
          data.role = "admin";
          data.status = "active";
        }

        const hasPassword = currentUser.providerData.some(
          (p) => p.providerId === "password",
        );
        if (!data.hasPassword && hasPassword) {
          updates.hasPassword = true;
          data.hasPassword = true;
        }

      // Perform consolidated update if needed
      if (Object.keys(updates).length > 0 && (isDailySync || isLogin || isSignOut || (force && reason !== 'manual'))) {
          try {
            const { writeBatch } = await import('firebase/firestore');
            const batch = writeBatch(db);
            batch.set(userRef, updates, { merge: true });
            await batch.commit();
          } catch (err) {
            handleFirestoreError(err, OperationType.WRITE, `users/${currentUser.uid}`);
            console.error(
              "Failed to perform consolidated profile update:",
              err,
            );
          }
        }

        setProfile(data);
      } else {
        // Create new user profile
        const userEmailLower = currentUser.email?.toLowerCase();
        const isOwner = userEmailLower === "asmatn628@gmail.com";
        const isAdmin = [
          "asmatullah9327@gmail.com",
          "kabirahmaddev@gmail.com",
          "wamoviesstation@gmail.com"
        ].includes(userEmailLower || "");
        const defaultRoleToSet = isOwner
          ? "owner"
          : isAdmin
            ? "admin"
            : "user";
        const defaultStatusToSet =
          isOwner || isAdmin ? "active" : "pending";
        const hasPassword = currentUser.providerData.some(
          (p) => p.providerId === "password",
        );

        // Extract phone from dummy email if available
        let extractedPhone = "";
        if (currentUser.email?.endsWith("@moviznow.com")) {
          const phonePart = currentUser.email.replace(
            "@moviznow.com",
            "",
          );
          extractedPhone = standardizePhone(phonePart);
        }
        const pendingPhone = sessionStorage.getItem('pending_signup_phone');
        if (pendingPhone) {
          sessionStorage.removeItem('pending_signup_phone');
        }
        const standardizedUserPhone = standardizePhone(
          currentUser.phoneNumber || extractedPhone || pendingPhone || "",
        );

        let mergedOldData: any = {};
        let oldDocIds: string[] = [];

        try {
          const searchRef = collection(db, "users");
          const findMatches = async (field: string, value: string) => {
            if (!value) return [];
            const q = query(
              searchRef,
              where(field, "==", value),
              limit(5),
            );
            const snap = await getDocs(q);
            return snap.docs.filter((d) => d.id !== currentUser.uid);
          };

          let matchDocs: any[] = [];
          if (
            currentUser.email &&
            !currentUser.email.endsWith("@moviznow.com")
          ) {
            // Try exact match
            const emailMatches = await findMatches(
              "email",
              currentUser.email,
            );
            matchDocs = [...matchDocs, ...emailMatches];

            // Try lowercase match
            const lowerEmail = currentUser.email.toLowerCase();
            if (lowerEmail !== currentUser.email) {
              const lowerEmailMatches = await findMatches(
                "email",
                lowerEmail,
              );
              matchDocs = [...matchDocs, ...lowerEmailMatches];
            }
          }

          if (standardizedUserPhone) {
            // Try standardized
            const phoneMatches = await findMatches(
              "phone",
              standardizedUserPhone,
            );
            matchDocs = [...matchDocs, ...phoneMatches];

            // Try raw digits if different
            const rawDigits = standardizedUserPhone.replace(/\D/g, "");
            if (rawDigits && rawDigits !== standardizedUserPhone) {
              const rawMatches = await findMatches("phone", rawDigits);
              matchDocs = [...matchDocs, ...rawMatches];
            }

            // Try without leading 0 or +92 if present
            let baseNumber = rawDigits;
            if (baseNumber.startsWith("92"))
              baseNumber = baseNumber.substring(2);
            if (baseNumber.startsWith("0"))
              baseNumber = baseNumber.substring(1);
            if (baseNumber && baseNumber !== rawDigits) {
              const baseMatches = await findMatches(
                "phone",
                baseNumber,
              );
              const zeroPrefixMatches = await findMatches(
                "phone",
                `0${baseNumber}`,
              );
              const plus92Matches = await findMatches(
                "phone",
                `+92${baseNumber}`,
              );
              matchDocs = [
                ...matchDocs,
                ...baseMatches,
                ...zeroPrefixMatches,
                ...plus92Matches,
              ];
            }
          }

          // Deduplicate by ID
          const uniqueMatchDocs = matchDocs.filter(
            (doc, index, self) =>
              index === self.findIndex((t) => t.id === doc.id),
          );

          if (uniqueMatchDocs.length > 0) {
            oldDocIds = uniqueMatchDocs.map((d) => d.id);
            mergedOldData = uniqueMatchDocs.reduce((acc, doc) => {
              const data = doc.data() as UserProfile;

              // Role Priority: owner > admin > manager > ... > user
              const rolePriority: Record<string, number> = {
                owner: 100,
                admin: 90,
                manager: 80,
                user_manager: 75,
                content_manager: 70,
                selected_content: 60,
                user: 10,
                trial: 5,
              };
              const getRoleRank = (r: string) => rolePriority[r] || 0;
              const betterRole =
                getRoleRank(data.role) > getRoleRank(acc.role || "")
                  ? data.role
                  : acc.role || data.role;

              // Status Priority: active > pending > expired > suspended
              const statusPriority: Record<string, number> = {
                active: 100,
                pending: 50,
                expired: 20,
                suspended: 0,
              };
              const getStatusRank = (s: string) =>
                statusPriority[s] || 0;
              const betterStatus =
                getStatusRank(data.status) >
                getStatusRank(acc.status || "")
                  ? data.status
                  : acc.status || data.status;

              // Expiry Date Logic: "Lifetime" wins, otherwise latest date
              let betterExpiry = acc.expiryDate;
              if (
                data.expiryDate === "Lifetime" ||
                acc.expiryDate === "Lifetime"
              ) {
                betterExpiry = "Lifetime";
              } else if (
                data.expiryDate &&
                (!acc.expiryDate || data.expiryDate > acc.expiryDate)
              ) {
                betterExpiry = data.expiryDate;
              }

              return {
                ...acc,
                ...data,
                role: betterRole,
                status: betterStatus,
                expiryDate: betterExpiry,
                favorites: [
                  ...new Set([
                    ...(acc.favorites || []),
                    ...(data.favorites || []),
                  ]),
                ],
                watchLater: [
                  ...new Set([
                    ...(acc.watchLater || []),
                    ...(data.watchLater || []),
                  ]),
                ],
                assignedContent: [
                  ...new Set([
                    ...(acc.assignedContent || []),
                    ...(data.assignedContent || []),
                  ]),
                ],
                sessionsCount:
                  (acc.sessionsCount || 0) + (data.sessionsCount || 0),
                timeSpent: (acc.timeSpent || 0) + (data.timeSpent || 0),
                createdAt:
                  acc.createdAt && acc.createdAt < data.createdAt
                    ? acc.createdAt
                    : data.createdAt,
                lastActive:
                  acc.lastActive &&
                  acc.lastActive > (data.lastActive || "")
                    ? acc.lastActive
                    : data.lastActive || acc.lastActive,
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
          email: currentUser.email || mergedOldData.email || "",
          phone: standardizedUserPhone || mergedOldData.phone || "",
          displayName:
            currentUser.displayName || mergedOldData.displayName || "",
          photoURL:
            currentUser.photoURL || mergedOldData.photoURL || "",
          // Increment session data for the current session, unless it's an owner
          sessionsCount: isOwner ? (mergedOldData.sessionsCount || 0) : ((mergedOldData.sessionsCount || 0) + 1),
          hasPassword: hasPassword,
          sessionId: getLocalSessionId(),
          // Enforce roles based on the high-privileged list or the old data
          role: isOwner
            ? "owner"
            : isAdmin
              ? "admin"
              : mergedOldData.role || defaultRoleToSet,
          status:
            isOwner || isAdmin
              ? "active"
              : mergedOldData.status || defaultStatusToSet,
          expiryDate: isOwner
            ? "Lifetime"
            : mergedOldData.expiryDate || null,
          // Ensure we have a creation date
          createdAt:
            mergedOldData.createdAt || new Date().toISOString(),
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
          const metaUpdates: Record<string, number> = { [currentUser.uid]: Date.now() };
          oldDocIds.forEach((oldId) => {
            batch.delete(doc(db, "users", oldId));
            console.log(
              `Merged and scheduled deletion of old profile: ${oldId}`,
            );
          });

          await batch.commit();
          console.log(
            `Successfully combined ${oldDocIds.length} accounts into new UID ${currentUser.uid}`,
          );
        } catch (err) {
          console.error("Failed to merge/create user profile:", err);
          // Fallback attempt if batch fails
          try {
            const { writeBatch } = await import('firebase/firestore');
            const fbBatch = writeBatch(db);
            fbBatch.set(userRef, newProfile);
            await fbBatch.commit();
          } catch (e) {}
        }
        safeStorage.setItem("profile_cache",
          JSON.stringify(newProfile),
        );
      safeStorage.setItem("profile_cache_timestamp", Date.now().toString());
        safeStorage.setItem(localVersionKey, (serverVersion || Date.now()).toString());
        setProfile(newProfile);
      }
    } catch (error) {
      console.error("Error updating/creating profile:", error);
      handleFirestoreError(
        error,
        OperationType.GET,
        `users/${currentUser.uid}`,
      );
    } finally {
      setIsSyncing(false);
      setLoading(false);
      return updatedSomething;
    }
  }, []);

  useEffect(() => {
    const handleVisibilityChange = () => {
      // Removing visibility tracking manual sync as per requirement.
      // Profile syncing will only happen at 7AM, login/logout, or explicit phone update.
    };
    window.addEventListener("visibilitychange", handleVisibilityChange);
    return () => window.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [refreshProfile]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);

      if (currentUser) {
        const userRef = doc(db, "users", currentUser.uid);

        const sessionKey = `last_session_start_${currentUser.uid}`;
        const dailySyncKey = `last_daily_sync_${currentUser.uid}`;
        const lastSyncDateStr = localStorage.getItem(dailySyncKey);
        const lastSessionStart = localStorage.getItem(sessionKey);
        const now = Date.now();
        const shiftedTime = new Date(now + (5 - 7) * 60 * 60 * 1000);
        const pktDate = `${shiftedTime.getUTCFullYear()}-${shiftedTime.getUTCMonth() + 1}-${shiftedTime.getUTCDate()}`;

        const isDailySync = lastSyncDateStr !== pktDate;

        const twelveHours = 12 * 60 * 60 * 1000;

        // Always initialize the ref for this React lifecycle to ensure interval tracking works
        if (!sessionStartTimeRef.current) {
          sessionStartTimeRef.current = now;
        }

        let pendingUpdates: any = {};
        if (!sessionStorage.getItem("session_started")) {
          sessionStorage.setItem("session_started", "true");

          if (
            !lastSessionStart ||
            now - parseInt(lastSessionStart) > twelveHours
          ) {
            let isOwnerUser = currentUser.email?.toLowerCase() === "asmatn628@gmail.com";
            try {
              const cachedProfileStr = safeStorage.getItem('profile_cache');
              if (cachedProfileStr) {
                const p = JSON.parse(cachedProfileStr);
                if (p.role === 'owner') isOwnerUser = true;
              }
            } catch(e) {}

            logEvent("session_start", currentUser.uid, {}, true); // Log to GA, skip individual Firestore write
            localStorage.setItem(sessionKey, now.toString());
            
            if (!isOwnerUser) {
              pendingUpdates.sessionsCount = increment(1);
            }
            pendingUpdates.lastActive = new Date().toISOString();
          }
        }
        
        // Add pending local state lists if daily sync applies or it's past 7AM and needs sync
        const needsSync = safeStorage.getItem("needs_user_sync") === "true";
        const isPast7AM = new Date(now + 5 * 3600000).getUTCHours() >= 7;
        if (isDailySync || (isPast7AM && needsSync)) {
            const pendingFavorites = safeStorage.getItem("pending_favorites_array");
            if (pendingFavorites) pendingUpdates.favorites = JSON.parse(pendingFavorites);

            const pendingWatchLater = safeStorage.getItem("pending_watch_later_array");
            if (pendingWatchLater) pendingUpdates.watchLater = JSON.parse(pendingWatchLater);
            
            const pendingOrders = safeStorage.getItem("pending_orders_array");
            if (pendingOrders) {
               const { arrayUnion } = await import('firebase/firestore');
               pendingUpdates.orders = arrayUnion(...JSON.parse(pendingOrders));
            }
        }

        const hasLocalProfile = !!safeStorage.getItem("profile_cache");
        if (Object.keys(pendingUpdates).length > 0 && hasLocalProfile) {
            try {
                const { writeBatch } = await import('firebase/firestore');
                const batch = writeBatch(db);
                batch.set(userRef, pendingUpdates, { merge: true });
                await batch.commit();

                if (isDailySync) localStorage.setItem(dailySyncKey, pktDate);
                safeStorage.setItem("needs_user_sync", "false");
                safeStorage.removeItem("pending_favorites_array");
                safeStorage.removeItem("pending_watch_later_array");
                safeStorage.removeItem("pending_content_clicks");
                safeStorage.removeItem("pending_link_clicks");
                safeStorage.removeItem("pending_orders_array");
            } catch (err) {
                console.error("Daily sync failed:", err);
            }
        }

        refreshProfile();
      } else {
        safeStorage.removeItem("profile_cache");
        setProfile(null);
        setLoading(false);

        if (sessionStartTimeRef.current) {
          sessionStorage.removeItem("session_started");
          sessionStartTimeRef.current = null;
        }
      }
    });

    // Track time spent accurately every second and save to local storage
    const timeTrackerInterval = setInterval(() => {
      if (auth.currentUser && sessionStartTimeRef.current) {
        // Skip analytics for owner account
        try {
          const cachedProfileStr = safeStorage.getItem('profile_cache');
          if (cachedProfileStr) {
            const p = JSON.parse(cachedProfileStr);
            if (p.role === 'owner') return;
          }
        } catch(e) {}

        if (document.visibilityState === "visible") {
          const uid = auth.currentUser.uid;
          const globalTickKey = `last_global_tick_${uid}`;
          const now = Date.now();
          const lastTick = parseInt(
            safeStorage.getItem(globalTickKey) || "0",
            10,
          );

          // Prevent double-counting if multiple tabs are active (wall-clock precision lock)
          if (now - lastTick >= 900) {
            safeStorage.setItem(globalTickKey, now.toString());

            const cacheKey = `accumulated_time_seconds_${uid}`;
            const lastSyncKey = `last_time_sync_${uid}`;

            let accSeconds = parseInt(safeStorage.getItem(cacheKey) || "0", 10);
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
            const forceSync = Date.now() - lastSyncTime >= twelveHoursMs;

            // We no longer trigger partial time syncs. We just accumulate locally.
            // When daily sync or logout happens, it will be flushed.
            if (forceSync && navigator.onLine) {
              let secondsToSync = accSeconds;

              if (secondsToSync > 0) {
                // Critical multi-tab lock: Deduct exactly what we consume immediately BEFORE the async request
                const actualSecondsToConsume = secondsToSync;

                // Prevent double-counting if multiple tabs are active (wall-clock precision lock)
                let currentSafeSeconds = parseInt(
                  safeStorage.getItem(cacheKey) || "0",
                  10,
                );
                if (isNaN(currentSafeSeconds)) currentSafeSeconds = 0;

                // If another tab already synced and emptied this, abort
                if (currentSafeSeconds < actualSecondsToConsume) {
                  return;
                }

                const remainingSeconds = Math.max(
                  0,
                  currentSafeSeconds - actualSecondsToConsume,
                );
                const optimisticSyncTime = Date.now().toString();

                safeStorage.setItem(cacheKey, remainingSeconds.toString());
                safeStorage.setItem(lastSyncKey, optimisticSyncTime);

                // Update local cached_all_users for UI updates, but avoid triggering "pending changes"
                const cachedUsersStr = safeStorage.getItem('cached_all_users') || '[]';
                let cachedUsers: any[] = [];
                try { cachedUsers = JSON.parse(cachedUsersStr); } catch (e) {}
                const userIndex = cachedUsers.findIndex(u => u.uid === uid);
                
                if (userIndex !== -1) {
                  cachedUsers[userIndex].timeSpent = (cachedUsers[userIndex].timeSpent || 0) + secondsToSync;
                  cachedUsers[userIndex].lastActive = new Date().toISOString();
                  safeStorage.setItem('cached_all_users', JSON.stringify(cachedUsers));
                  
                  // Only dispatch custom event if user is currently loaded
                  window.dispatchEvent(new CustomEvent('user_local_update', { 
                    detail: { uid, fields: { timeSpent: cachedUsers[userIndex].timeSpent, lastActive: cachedUsers[userIndex].lastActive } }
                  }));
                }

                // Removed writing to pending_user_updates here as per user request to avoid auto updating pending state.
                // Time spent will be synced when another event triggers profile update.

                logEvent("time_spent", uid, { duration: secondsToSync })
                  .catch((err) => {
                    console.error("Failed to sync time spent to analytics:", err);
                  });
              }
            }
          }
        }
      }
    }, 1000);

    // Sync any remaining full minutes on visibility change
    const handleVisibilityChange = () => {
      if (
        document.visibilityState === "hidden" &&
        auth.currentUser &&
        navigator.onLine
      ) {
        // Skip analytics for owner account
        try {
          const cachedProfileStr = safeStorage.getItem('profile_cache');
          if (cachedProfileStr) {
            const p = JSON.parse(cachedProfileStr);
            if (p.role === 'owner') return;
          }
        } catch (e) {}

        const uid = auth.currentUser.uid;
        const cacheKey = `accumulated_time_seconds_${uid}`;
        const lastSyncKey = `last_time_sync_${uid}`;

        let accSeconds = parseInt(safeStorage.getItem(cacheKey) || "0", 10);
        if (isNaN(accSeconds)) accSeconds = 0;

        const secondsToSync = accSeconds;

        // Only execute a Firestore update on hide if there are actually seconds to sync
        if (secondsToSync > 0) {
          const actualSecondsToConsume = secondsToSync;

          // Read latest cache to prevent cross-tab overlap deduction
          let currentSafeSeconds = parseInt(
            safeStorage.getItem(cacheKey) || "0",
            10,
          );
          if (isNaN(currentSafeSeconds)) currentSafeSeconds = 0;

          if (currentSafeSeconds < actualSecondsToConsume) {
            return; // Another tab synced it
          }

          const optimisticSyncTime = Date.now().toString();

          // We zero out the cache since we consumed it, BUT wait!
          // Since we are NOT syncing to pending_updates or Firestore here,
          // we actually just want to keep it in `accumulated_time_seconds` until refreshProfile or another action flush it.
          // Therefore, doing anything in handleVisibilityChange for time tracking is unnecessary.
          // I will just leave this empty for `timeSpent`, the cacheKey remains accumulated.
          return;
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      unsubscribe();
      clearInterval(timeTrackerInterval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const clearError = () => setError(null);

  const signInWithGoogle = async () => {
    try {
      setError(null);
      justLoggedInRef.current = true;
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);

      // Force refresh app data
      safeStorage.removeItem("profile_cache");
      safeStorage.removeItem("cached_chunk_users_versions");
      safeStorage.removeItem("cached_all_users");
      localStorage.removeItem(`last_daily_sync_${result.user.uid}`);

      // Check if we need to link phone/email in Firestore
      const userRef = doc(db, "users", result.user.uid);
      const snap = await getDoc(userRef);
      const localSessionId = getLocalSessionId();

      if (snap.exists()) {
        const data = snap.data();
        const updates: any = { sessionId: localSessionId };
        if (!data.email && result.user.email) {
          updates.email = result.user.email;
        }
        try {
          const { writeBatch } = await import('firebase/firestore');
          const batch = writeBatch(db);
          batch.update(userRef, updates);
          await batch.commit();
        } catch (e) {}
      }
      setTimeout(() => {
        justLoggedInRef.current = false;
      }, 10000);
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
      
      // Force refresh app data
      safeStorage.removeItem("profile_cache");
      safeStorage.removeItem("cached_chunk_users_versions");
      safeStorage.removeItem("cached_all_users");
      localStorage.removeItem(`last_daily_sync_${result.user.uid}`);
      
      try {
        const { writeBatch } = await import('firebase/firestore');
        const batch = writeBatch(db);
        batch.update(doc(db, "users", result.user.uid), {
          sessionId: getLocalSessionId(),
        });
        await batch.commit();
      } catch (e) {}
      setTimeout(() => {
        justLoggedInRef.current = false;
      }, 10000);
    } catch (err: any) {
      justLoggedInRef.current = false;
      console.error("Email login error:", err);
      if (
        err.code === "auth/invalid-credential" ||
        err.code === "auth/wrong-password"
      ) {
        setError("Invalid password. Try again or reset your password.");
      } else {
        setError(err.message || "Failed to login with email");
      }
      throw err;
    }
  };

  const signUpWithEmail = async (
    email: string,
    password: string,
    displayName: string,
    phone?: string,
  ) => {
    try {
      setError(null);

      // Check if email is already in use in Firestore
      const emailUsers = await findUsersByEmailOrPhone(email);
      if (emailUsers.some((u) => u.hasPassword)) {
        throw new Error("This email is already registered.");
      }

      // Check if phone is already in use
      if (phone) {
        const standardizedPhone = standardizePhone(phone);
        const phoneUsers = await findUsersByEmailOrPhone(standardizedPhone);
        if (phoneUsers.some((u) => u.hasPassword)) {
          throw new Error(
            "This WhatsApp number is already registered to another account.",
          );
        }

        const isWhitelisted = await isPhoneWhitelisted(standardizedPhone);
        if (!isWhitelisted) {
          throw new Error(
            "This WhatsApp number is not authorized for new account creation.",
          );
        }
      } else {
        throw new Error("WhatsApp Number is required for new account creation.");
      }

      if (phone) {
        const standardizedPhone = standardizePhone(phone);
        sessionStorage.setItem('pending_signup_phone', standardizedPhone);
      }

      justLoggedInRef.current = true;
      let userCredential;
      try {
        userCredential = await createUserWithEmailAndPassword(
          auth,
          email,
          password,
        );
      } catch (authErr: any) {
        if (authErr.code === 'auth/operation-not-allowed') {
          throw new Error("Email/Password accounts are not enabled. Please enable 'Email/Password' in the Firebase Auth console.");
        }
        throw authErr;
      }
      await updateProfile(userCredential.user, { displayName });

      setTimeout(() => {
        justLoggedInRef.current = false;
      }, 10000);
    } catch (err: any) {
      justLoggedInRef.current = false;
      console.error("Email signup error:", err);
      setError(err.message || "Failed to sign up");
      throw err;
    }
  };

  const signUpWithPhoneAndPassword = async (
    identifier: string,
    password: string,
    displayName: string,
    email?: string,
  ) => {
    try {
      setError(null);

      const isEmail = identifier.includes("@");
      const standardizedPhone = isEmail ? "" : standardizePhone(identifier);
      
      const signupEmail = isEmail ? identifier : email;

      if (!signupEmail) {
        throw new Error("An email address is required to create an account.");
      }

      // Check if identifier is already in use
      const matches = await findUsersByEmailOrPhone(identifier);
      if (matches.some((u) => u.hasPassword)) {
        throw new Error("This account is already registered.");
      }

      if (!isEmail) {
        const isWhitelisted = await isPhoneWhitelisted(standardizedPhone);
        if (!isWhitelisted) {
          throw new Error(
            "This WhatsApp number is not authorized for new account creation.",
          );
        }
      }

      // Check if email is already in use
      if (email && email !== signupEmail) {
        const emailUsers = await findUsersByEmailOrPhone(email);
        if (emailUsers.some((u) => u.hasPassword)) {
          throw new Error("This email is already registered.");
        }
      }

      if (standardizedPhone) {
        sessionStorage.setItem('pending_signup_phone', standardizedPhone);
      }

      justLoggedInRef.current = true;
      let userCredential;
      try {
        userCredential = await createUserWithEmailAndPassword(
          auth,
          signupEmail,
          password,
        );
      } catch (authErr: any) {
        if (authErr.code === 'auth/operation-not-allowed') {
          throw new Error("Email/Password accounts are not enabled. Please enable 'Email/Password' in the Firebase Auth console to support phone signups.");
        }
        if (authErr.code === 'auth/email-already-in-use') {
          throw new Error(`The email address ${signupEmail} is already registered. Please log in with that email or Google login.`);
        }
        throw authErr;
      }
      await updateProfile(userCredential.user, { displayName });

      setTimeout(() => {
        justLoggedInRef.current = false;
      }, 10000);
    } catch (err: any) {
      justLoggedInRef.current = false;
      console.error("Signup error:", err);
      if (err.code === "auth/email-already-in-use") {
        setError("This account is already registered.");
      } else {
        setError(err.message || "Failed to sign up");
      }
      throw err;
    }
  };

  const isPhoneWhitelisted = async (phone: string): Promise<boolean> => {
    const standardizedPhone = standardizePhone(phone);
    const docRef = doc(db, "whitelisted_phones", standardizedPhone);
    const docSnap = await getDoc(docRef);
    return docSnap.exists();
  };

  const findUsersByEmailOrPhone = async (
    identifier: string,
  ): Promise<UserProfile[]> => {
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

      const evaluateQuery = async (q: any, name: string) => {
        try {
          const snap = await getDocs(q);
          addMatches(snap);
        } catch (err) {
          console.error(`Error in query ${name}:`, err);
        }
      };

      // 1. Check email variations
      const lowercaseIdentifier = trimmed.toLowerCase();
      await evaluateQuery(
        query(
          collection(db, "users"),
          where("email", "==", lowercaseIdentifier),
          limit(5)
        ),
        "email_exact"
      );

      // 2. Check phone variations
      // Clean identifier: remove everything except digits and possibly a leading +
      const cleanedForSearch = trimmed.replace(/[^\d+]/g, "");
      const isLikelyPhone = cleanedForSearch.length >= 7 && /^[\d+]+$/.test(cleanedForSearch);

      if (isLikelyPhone) {
        const standardized = standardizePhone(cleanedForSearch);
        
        let digitsOnly = cleanedForSearch.replace(/\D/g, "");
        let baseNumber = digitsOnly;
        if (baseNumber.startsWith("92")) baseNumber = baseNumber.substring(2);
        else if (baseNumber.startsWith("0")) baseNumber = baseNumber.substring(1);

        const phoneFormats = [
          cleanedForSearch,
          standardized,
          `+92${baseNumber}`,
          `0${baseNumber}`,
          `92${baseNumber}`,
          baseNumber,
        ].filter((v, i, a) => v && a.indexOf(v) === i);

        const emailFormats = [
          `${baseNumber}@moviznow.com`,
          `92${baseNumber}@moviznow.com`,
          `0${baseNumber}@moviznow.com`,
          `+92${baseNumber}@moviznow.com`,
        ].filter((v, i, a) => v && a.indexOf(v) === i);

        if (phoneFormats.length > 0) {
          await evaluateQuery(
            query(
              collection(db, "users"),
              where("phone", "in", phoneFormats),
              limit(5)
            ),
            "phone_in"
          );
        }
        
        if (emailFormats.length > 0) {
          await evaluateQuery(
            query(
              collection(db, "users"),
              where("email", "in", emailFormats),
              limit(5)
            ),
            "email_in"
          );
        }
      } else {
        // Just search the raw trimmed identifier in phone too in case it was saved oddly
        await evaluateQuery(
          query(
            collection(db, "users"),
            where("phone", "==", trimmed),
            limit(5)
          ),
          "phone_exact"
        );
      }

      return matches;
    } catch (err) {
      console.error("Error finding users (outer):", err);
      return [];
    }
  };

  const updateUserProfileData = async (
    data: Partial<UserProfile>,
    newPassword?: string,
    force = false,
  ) => {
    if (!auth.currentUser || !user || !profile)
      throw new Error("No user logged in");
    
    const now = Date.now();
    const dailySyncKey = `last_daily_sync_${user.uid}`;
    const lastSyncDateStr = localStorage.getItem(dailySyncKey);
    const shiftedTime = new Date(now + (5 - 7) * 60 * 60 * 1000);
    const pktDate = `${shiftedTime.getUTCFullYear()}-${shiftedTime.getUTCMonth() + 1}-${shiftedTime.getUTCDate()}`;
    const isDailySync = lastSyncDateStr !== pktDate;
    const isPhoneUpdate = !!(data.phone && data.phone !== profile.phone);

    if (!isDailySync && !force && !isPhoneUpdate) {
      console.log("Profile update deferred: Already updated in this 9 AM PKT period.");
      // Still update local profile and set needs_user_sync so it catches up tomorrow
      setProfile({ ...profile, ...data });
      safeStorage.setItem("profile_cache", JSON.stringify({ ...profile, ...data }));
      safeStorage.setItem("profile_cache_timestamp", Date.now().toString());
      safeStorage.setItem("needs_user_sync", "true");
      return;
    }

    try {
      setError(null);

      // Check for phone duplicate if changing
      if (data.phone && data.phone !== profile.phone) {
        const standardizedNewPhone = standardizePhone(data.phone);
        const existingPhones = await findUsersByEmailOrPhone(standardizedNewPhone);
        if (existingPhones.some((u) => u.uid !== user.uid)) {
          throw new Error(
            "This WhatsApp number is already in use by another account.",
          );
        }
        data.phone = standardizedNewPhone;
      }

      // Check for email duplicate if changing (though UI might prevent this)
      if (data.email && data.email !== profile.email) {
        const existingEmails = await findUsersByEmailOrPhone(data.email);
        if (existingEmails.some((u) => u.uid !== user.uid)) {
          throw new Error(
            "This email address is already in use by another account.",
          );
        }
      }

      // Update Auth Profile if name changed
      if (
        data.displayName &&
        data.displayName !== auth.currentUser.displayName
      ) {
        await updateProfile(auth.currentUser, {
          displayName: data.displayName,
        });
      }

      // Update Auth Email if changed and provided
      if (
        data.email &&
        data.email !== auth.currentUser.email &&
        !data.email.endsWith("@moviznow.com")
      ) {
        const { updateEmail } = await import("firebase/auth");
        await updateEmail(auth.currentUser, data.email);
      }

      // Update Password if provided
      if (newPassword) {
        await updatePassword(auth.currentUser, newPassword);
        data.hasPassword = true;
      }

      // Flush any accumulated seconds before sync
      const cacheKey = `accumulated_time_seconds_${user.uid}`;
      let accSecs = parseInt(safeStorage.getItem(cacheKey) || "0", 10);
      if (accSecs > 0) {
        safeStorage.setItem(cacheKey, "0");
        const pendingStr = safeStorage.getItem('pending_user_updates') || '{}';
        try {
          let pendingAll = JSON.parse(pendingStr);
          pendingAll[user.uid] = pendingAll[user.uid] || {};
          let currentBase = typeof pendingAll[user.uid].timeSpent === 'number' ? pendingAll[user.uid].timeSpent : (profile.timeSpent || 0);
          pendingAll[user.uid].timeSpent = currentBase + accSecs;
          safeStorage.setItem('pending_user_updates', JSON.stringify(pendingAll));
        } catch(e){}
      }

      // Include pending local updates if there are any
      const needsSync = safeStorage.getItem("needs_user_sync") === "true";
      if (needsSync) {
        const pendFavs = safeStorage.getItem("pending_favorites_array");
        if (pendFavs) data.favorites = JSON.parse(pendFavs);
        const pendWL = safeStorage.getItem("pending_watch_later_array");
        if (pendWL) data.watchLater = JSON.parse(pendWL);
        const pendOrders = safeStorage.getItem("pending_orders_array");
        if (pendOrders) {
          data.orders = [...(profile.orders || []), ...JSON.parse(pendOrders)];
        }
        
        safeStorage.setItem("needs_user_sync", "false");
        safeStorage.removeItem("pending_favorites_array");
        safeStorage.removeItem("pending_watch_later_array");
        safeStorage.removeItem("pending_content_clicks");
        safeStorage.removeItem("pending_link_clicks");
        safeStorage.removeItem("pending_orders_array");
      }
      
      const pendingUpdatesStr = safeStorage.getItem("pending_user_updates");
      if (pendingUpdatesStr) {
        try {
          const pendingAll = JSON.parse(pendingUpdatesStr);
          const myPending = pendingAll[user.uid];
          if (myPending) {
             if (myPending.timeSpent !== undefined) {
               data.timeSpent = Math.max(data.timeSpent || profile.timeSpent || 0, myPending.timeSpent);
               delete myPending.timeSpent;
             }
             Object.assign(data, myPending);
             delete pendingAll[user.uid];
             safeStorage.setItem("pending_user_updates", JSON.stringify(pendingAll));
          }
        } catch (e) {}
      }

      // Save local first!
      const updatedProfile = { ...profile, ...data };
      setProfile(updatedProfile);
      safeStorage.setItem("profile_cache", JSON.stringify(updatedProfile));
      safeStorage.setItem("profile_cache_timestamp", Date.now().toString());
      
      const userRefPath = doc(db, "users", user.uid);
      
      try {
        const { writeBatch } = await import('firebase/firestore');
        let batch = writeBatch(db);
        batch.set(userRefPath, data, { merge: true });
        
        let skipCommit = false;
        try {
           const { updateDoc } = await import('firebase/firestore');
           await updateDoc(doc(db, 'chunk_meta', 'versions'), { [`users.${user.uid}`]: now });
        } catch (e) {
           batch.set(doc(db, 'chunk_meta', 'versions'), { users: { [user.uid]: now } }, { merge: true });
           await batch.commit();
           skipCommit = true;
        }
        if (!skipCommit) await batch.commit();
        
        console.log("Users doc updated successfully.");
      } catch (err: any) {
        handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`);
        safeStorage.setItem("needs_user_sync", "true");
        return;
      }
      
      if (isDailySync) localStorage.setItem(dailySyncKey, pktDate);
      safeStorage.setItem("needs_user_sync", "false");

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
      const userRef = doc(db, "users", user.uid);
      const { writeBatch } = await import('firebase/firestore');
      const batch = writeBatch(db);
      batch.update(userRef, { hasPassword: true });
      
      let skipCommit = false;
      try {
         const { updateDoc } = await import('firebase/firestore');
         await updateDoc(doc(db, 'chunk_meta', 'versions'), { [`users.${user.uid}`]: Date.now() });
      } catch (e) {
         batch.set(doc(db, 'chunk_meta', 'versions'), { users: { [user.uid]: Date.now() } }, { merge: true });
         await batch.commit();
         skipCommit = true;
      }
      if (!skipCommit) await batch.commit();
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
    try {
      await refreshProfile(true, 'logout');
      window.dispatchEvent(new Event('force_flush_all_data'));
      // give listeners a brief moment to catch up
      await new Promise(r => setTimeout(r, 500));
    } catch(e) {
      console.error("Flush before logout error", e);
    }
    await signOut(auth);
  };

  const toggleFavorite = async (contentId: string) => {
    if (!profile || !user) return;

    const newFavorites = profile.favorites?.includes(contentId)
      ? profile.favorites.filter((id) => id !== contentId)
      : [...(profile.favorites || []), contentId];

    // Optimistic update
    const updatedProfile = { ...profile, favorites: newFavorites };
    setProfile(updatedProfile);
    safeStorage.setItem("profile_cache", JSON.stringify(updatedProfile));
      safeStorage.setItem("profile_cache_timestamp", Date.now().toString());

    // Save pending change array
    safeStorage.setItem("pending_favorites_array", JSON.stringify(newFavorites));
    safeStorage.setItem("needs_user_sync", "true");
  };

  const toggleWatchLater = async (contentId: string) => {
    if (!profile || !user) return;

    const newWatchLater = profile.watchLater?.includes(contentId)
      ? profile.watchLater.filter((id) => id !== contentId)
      : [...(profile.watchLater || []), contentId];

    // Optimistic update
    const updatedProfile = { ...profile, watchLater: newWatchLater };
    setProfile(updatedProfile);
    safeStorage.setItem("profile_cache", JSON.stringify(updatedProfile));
      safeStorage.setItem("profile_cache_timestamp", Date.now().toString());

    // Save pending change array
    safeStorage.setItem("pending_watch_later_array", JSON.stringify(newWatchLater));
    safeStorage.setItem("needs_user_sync", "true");
  };

  return (
    <AuthContext.Provider
      value={{
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
        toggleWatchLater,
        refreshProfile,
        isSyncing,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
