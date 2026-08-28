import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { auth, db, runWithNetwork } from "../firebase";
import { safeStorage } from "../utils/safeStorage";
import { getUtcVersion, parseVersionTime } from "../utils/chunkMeta";
import { isValidGmailAddress } from "../utils/emailValidation";
import { getUserDisplayName } from "../utils/userUtils";
import { isUserExpired, normalizeUserStatusAndExpiry } from "./UsersContext";
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
  setPersistence,
  browserLocalPersistence,
} from "firebase/auth";
import {
  doc,
  getDoc,
  setDoc,
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
  refreshProfile: (
    force?: boolean,
    reason?: "auto" | "manual" | "login" | "logout",
  ) => Promise<boolean>;
  isSyncing: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Ensure local persistence mode before doing any auth logic to prevent unexpected logouts
setPersistence(auth, browserLocalPersistence).catch(console.error);

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

const generateReferralCode = (uid?: string) => {
  if (uid) {
    let hash = 0;
    for (let i = 0; i < uid.length; i++) {
      const char = uid.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36).toUpperCase().padStart(6, 'X').substring(0, 6);
  }
  return Math.random().toString(36).substring(2, 8).toUpperCase();
};

export const ensureSingleAndValidReferralCode = async (uid: string, currentProfileCode?: string): Promise<string> => {
  const refDocRef = doc(db, "referral", "all");
  let allCodes: Record<string, string> = {};
  let allCodeToUid: Record<string, string> = {};

  try {
    const refDocSnap = await getDoc(refDocRef);
    if (refDocSnap.exists()) {
      const refData = refDocSnap.data() || {};
      allCodes = refData.codes || {};
      allCodeToUid = refData.codeToUid || {};
    }
  } catch (err) {
    console.error("Failed to read referral/all in ensureSingleAndValidReferralCode:", err);
  }

  let codeFromAllCodes = allCodes[uid];
  let chosenCode = codeFromAllCodes;

  if (!chosenCode) {
    for (const [code, mappedUid] of Object.entries(allCodeToUid)) {
      if (mappedUid === uid) {
        chosenCode = code;
        break;
      }
    }
  }

  if (!chosenCode && currentProfileCode) {
    const ownerOfCurrent = allCodeToUid[currentProfileCode];
    if (!ownerOfCurrent || ownerOfCurrent === uid) {
      chosenCode = currentProfileCode;
    }
  }

  if (!chosenCode) {
    chosenCode = generateReferralCode(uid);
    let attempt = 0;
    while (allCodeToUid[chosenCode] && allCodeToUid[chosenCode] !== uid && attempt < 10) {
      chosenCode = generateReferralCode(uid + "_" + attempt);
      attempt++;
    }
  }

  const duplicateCodesToDelete: string[] = [];
  for (const [code, mappedUid] of Object.entries(allCodeToUid)) {
    if (mappedUid === uid && code !== chosenCode) {
      duplicateCodesToDelete.push(code);
    }
  }

  const needsReferralCodesUpdate = allCodes[uid] !== chosenCode;
  const needsReferralCodeToUidUpdate = allCodeToUid[chosenCode] !== uid;
  const hasDuplicatesToDelete = duplicateCodesToDelete.length > 0;

  if (needsReferralCodesUpdate || needsReferralCodeToUidUpdate || hasDuplicatesToDelete) {
    try {
      const { deleteField, writeBatch } = await import("firebase/firestore");
      const batch = writeBatch(db);

      const referralUpdates: any = {
        codes: {
          [uid]: chosenCode
        },
        codeToUid: {
          [chosenCode]: uid
        }
      };

      if (hasDuplicatesToDelete) {
        duplicateCodesToDelete.forEach((dupCode) => {
          referralUpdates.codeToUid[dupCode] = deleteField();
        });
      }

      batch.set(refDocRef, referralUpdates, { merge: true });
      await batch.commit();
      console.log(`Reconciled referral code for user ${uid}. Chosen: ${chosenCode}, Cleared duplicates:`, duplicateCodesToDelete);
    } catch (e) {
      console.error("Failed to commit referral reconciliation batch:", e);
    }
  }

  return chosenCode;
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
        try {
          const parsed = JSON.parse(cached);
          return normalizeUserStatusAndExpiry(parsed);
        } catch (e) {
          return null;
        }
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
        (window as any)._isNewSessionId = true;
      }
      return id;
    } catch (e) {
      if (!(window as any)._fallbackSessionId) {
        (window as any)._fallbackSessionId =
          Math.random().toString(36).substring(2) + Date.now().toString(36);
        (window as any)._isNewSessionId = true;
      }
      return (window as any)._fallbackSessionId;
    }
  };

  const triggerWelcomeNotificationAndEmail = useCallback(async (userUid: string, userEmail?: string | null, userName?: string | null, isNewUser: boolean = false) => {
    if (!userUid) return;
    const sessionKey = `welcome_notif_sent_${userUid}_${new Date().toISOString().split('T')[0]}`;
    if (safeStorage.getItem(sessionKey)) return;
    safeStorage.setItem(sessionKey, "1");

    let finalDisplayName = userName;
    if (!finalDisplayName || finalDisplayName === "Movie Fan" || finalDisplayName.includes("@")) {
      try {
        const { doc, getDoc } = await import("firebase/firestore");
        const userRef = doc(db, "users", userUid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          const userData = userSnap.data();
          if (userData.displayName) {
            finalDisplayName = userData.displayName;
          }
        }
      } catch (e) {
        console.warn("Failed to fetch user displayName from Firestore:", e);
      }
    }

    const displayName = finalDisplayName || "Movie Fan";

    // 1. Send Welcome Email if user is NEW and has a valid Gmail address
    if (isNewUser && userEmail && isValidGmailAddress(userEmail)) {
      const emailSentKey = `welcome_email_sent_${userEmail.trim().toLowerCase()}`;
      if (!safeStorage.getItem(emailSentKey)) {
        safeStorage.setItem(emailSentKey, "true");
        const cachedSettingsStr = safeStorage.getItem("cached_app_settings");
        let localEmailSettings = null;
        if (cachedSettingsStr) {
          try {
            const parsedSettings = JSON.parse(cachedSettingsStr);
            if (parsedSettings.emailSettings) {
              localEmailSettings = parsedSettings.emailSettings;
            }
          } catch (e) {}
        }

        const userTz = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Karachi";

        fetch("/api/email/send-welcome", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: userEmail,
            displayName: displayName,
            smtpSettings: localEmailSettings || undefined,
            appUrl: window.location.origin,
            isNewUser,
            timeZone: userTz
          }),
        }).catch((e) => console.warn("Welcome email trigger notice:", e));
      }
    }

    // 2. Add Welcome notification in local notification cache & Firestore (if admin)
    try {
      const id = "welcome_" + Math.random().toString(36).substring(2, 9);
      const title = isNewUser ? `Welcome to MovizNow, ${displayName}! ��` : `Welcome back, ${displayName}! ��`;
      const body = isNewUser 
        ? "We're thrilled to have you join our community! Get ready to explore thousands of high-quality movies and trending TV series."
        : "Great to see you again on MovizNow! Explore trending movies, new releases, and stream your favorites.";
      
      const notifItem = {
        id,
        title,
        body,
        targetUserId: userUid,
        createdBy: "system",
        createdAt: new Date().toISOString()
      };

      // Store in local storage notification cache for immediate in-app display
      try {
        const cachedStr = safeStorage.getItem('cached_notifications_data');
        let localList: any[] = cachedStr ? JSON.parse(cachedStr) : [];
        if (!localList.some(n => n.id === id || (n.title === title && n.targetUserId === userUid))) {
          localList = [notifItem, ...localList];
          safeStorage.setItem('cached_notifications_data', JSON.stringify(localList));
        }
      } catch (e) {}
    } catch (err) {
      // Ignore background notification creation notices
    }
  }, []);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    const handleLanguageChange = (e: Event) => {
      const customEvent = e as CustomEvent<string>;
      const newLang = customEvent.detail;
      if (profile && profile.uid) {
        setProfile(prev => prev ? { ...prev, preferredLanguage: newLang } : null);
        
        try {
          // Store in pending updates for background sync later, don't sync instantly to cloud
          const pendingStr = safeStorage.getItem("pending_user_updates") || "{}";
          const pendingAll = JSON.parse(pendingStr);
          pendingAll[profile.uid] = pendingAll[profile.uid] || {};
          pendingAll[profile.uid].preferredLanguage = newLang;
          safeStorage.setItem("pending_user_updates", JSON.stringify(pendingAll));
        } catch (err) {
          console.error("Failed to save language preference to pending updates", err);
        }
      }
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("app_language_changed", handleLanguageChange);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("app_language_changed", handleLanguageChange);
    };
  }, [profile?.uid]);

  const lastRefreshTimeRef = useRef<number>(0);

  const refreshProfile = useCallback(
    async (
      force = false,
      reason: "auto" | "manual" | "login" | "logout" = "auto",
    ): Promise<boolean> => {
      let updatedSomething = false;
      const currentUser = auth.currentUser;
      if (!currentUser) {
        // Do not clear profile cache here to prevent auto logout bug when Firebase auth state drops temporarily
        setLoading(false);
        return false;
      }

      const now = Date.now();
      // Throttle automatic refreshes to once every 15 seconds per tab
      if (reason === "auto" && now - lastRefreshTimeRef.current < 15000 && !force) {
        return false;
      }
      lastRefreshTimeRef.current = now;

      const userRef = doc(db, "users", currentUser.uid);
      const cachedProfileStr = safeStorage.getItem("profile_cache");
      let localProfile = cachedProfileStr ? JSON.parse(cachedProfileStr) : null;

      // Only show loading if we have no profile data to show
      if (!profile && !localProfile) setLoading(true);

      try {
        const localVersionKey = `profile_version_${currentUser.uid}`;
        const localVersion = safeStorage.getItem(localVersionKey) || "0";
        const localVersionTime = parseVersionTime(localVersion);

        const now = Date.now();
        const userSyncKey = `last_user_sync_time_v2_${currentUser.uid}`;
        const lastSyncStr = localStorage.getItem(userSyncKey);
        const lastSyncTime = lastSyncStr ? parseInt(lastSyncStr, 10) : 0;
        const TEN_HOURS_MS = 10 * 60 * 60 * 1000;
        const is10HourSyncPassed = !lastSyncTime || (now - lastSyncTime >= TEN_HOURS_MS);

        if (localProfile) {
          const normLocal = normalizeUserStatusAndExpiry(localProfile);
          setProfile(normLocal);
          if (normLocal.status !== localProfile.status) {
            safeStorage.setItem("profile_cache", JSON.stringify(normLocal));
          }
          setLoading(false); // Unblock immediately if we have cached data
        }

        // 1. Firstly read chunk_meta
        let serverVersion: any = localVersion;
        let isVersionMissing = false;
        if (navigator.onLine) {
          setIsSyncing(true);
          try {
            const { getChunkMeta } = await import("../utils/chunkMeta");
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
        const serverVersionTime = parseVersionTime(serverVersion);
        const effectiveServerVersion = serverVersionTime > 0 ? (typeof serverVersion === 'object' ? (serverVersion.updatedAt || serverVersion.version) : serverVersion) : 1;
        const versionChanged =
          (serverVersionTime > 0 && serverVersionTime > localVersionTime) || (!localProfile);

        let serverProfile: UserProfile | null = null;
        let docSnap;

        // 7. Verify user UID in Firestore when online and chunk_meta version has changed or profile is missing
        if (navigator.onLine && (versionChanged || !localProfile)) {
          try {
            docSnap = await runWithNetwork(() => getDoc(userRef));
            if (docSnap.exists()) {
              serverProfile = docSnap.data() as UserProfile;
              updatedSomething = true;
            } else if (!justLoggedInRef.current) {
              console.warn(
                `User UID ${currentUser.uid} not found in Firestore. Logging out and routing to login.`,
              );
              safeStorage.removeItem("profile_cache");
              safeStorage.removeItem("profile_doc_snap");
              safeStorage.removeItem(`profile_version_${currentUser.uid}`);
              safeStorage.removeItem("cached_all_users");
              localStorage.removeItem("session_started");
              setProfile(null);
              setUser(null);
              setLoading(false);
              await signOut(auth).catch(() => {});
              return false;
            }
          } catch (e) {
            console.error(
              "Error reading user data from Firestore, using local fallback",
              e,
            );
            if (!localProfile) {
              // Can't run without local profile if getDoc fails
              throw e;
            }
          }
        }

        if (localProfile && localProfile.uid && localProfile.uid !== currentUser.uid) {
          console.warn("UID mismatch between auth and local storage. Invalid user session.");
          safeStorage.removeItem("profile_cache");
          safeStorage.removeItem("profile_doc_snap");
          safeStorage.removeItem(`profile_version_${currentUser.uid}`);
          safeStorage.removeItem("cached_all_users");
          localStorage.removeItem("session_started");
          setProfile(null);
          setUser(null);
          setLoading(false);
          await signOut(auth).catch(() => {});
          return false;
        }

        // 3. Update user data if changed versions then sync it with local storage version like time in app, favorites, watch later... merge data intelligently first in local storage
        let mergedProfile: UserProfile | null = localProfile
          ? ({ ...localProfile } as UserProfile)
          : null;
        if (serverProfile) {
          mergedProfile = {
            ...(localProfile || {}),
            ...serverProfile,
            favorites:
              safeStorage.getItem("needs_user_sync") === "true" &&
              safeStorage.getItem("pending_favorites_array")
                ? JSON.parse(safeStorage.getItem("pending_favorites_array")!)
                : Array.from(
                    new Set([
                      ...(localProfile?.favorites || []),
                      ...(serverProfile.favorites || []),
                    ]),
                  ),
            watchLater:
              safeStorage.getItem("needs_user_sync") === "true" &&
              safeStorage.getItem("pending_watch_later_array")
                ? JSON.parse(safeStorage.getItem("pending_watch_later_array")!)
                : Array.from(
                    new Set([
                      ...(localProfile?.watchLater || []),
                      ...(serverProfile.watchLater || []),
                    ]),
                  ),
            orders: (() => {
              const localOrders = localProfile?.orders || [];
              const serverOrders = serverProfile.orders || [];
              const serverOrderMap = new Map(serverOrders.map((so) => [so.id, so]));
              const merged = [...serverOrders];
              localOrders.forEach((lo) => {
                if (!serverOrderMap.has(lo.id)) {
                  merged.push(lo);
                }
              });
              return merged;
            })(),
            timeSpent: Math.max(
              serverProfile.timeSpent || 0,
              localProfile?.timeSpent || 0,
            ),
          };
        }

        // Apply any pending user updates from local storage to the merged profile
        // This ensures the local state is always up-to-date even if not yet pushed to Firestore
        const pendingUpdatesStr = safeStorage.getItem("pending_user_updates");
        if (pendingUpdatesStr && mergedProfile) {
          try {
            const pendingAll = JSON.parse(pendingUpdatesStr);
            const myPending = pendingAll[currentUser.uid];
            if (myPending) {
              mergedProfile = { ...mergedProfile, ...myPending };
            }
          } catch (e) {
            console.error("Failed to merge pending updates into profile state", e);
          }
        }

        if (mergedProfile) {
          let modified = false;
          const nowTime = Date.now();
          const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

          if (mergedProfile.reported_links) {
            const filtered = mergedProfile.reported_links.filter((r: any) => {
              if (r.status !== "pending" && r.updatedAt) {
                const rDate = new Date(r.updatedAt).getTime();
                if (nowTime - rDate > SEVEN_DAYS_MS) return false;
              }
              return true;
            });
            if (filtered.length !== mergedProfile.reported_links.length) {
              mergedProfile.reported_links = filtered;
              modified = true;
            }
          }

          if (mergedProfile.movieRequests) {
            const filtered = mergedProfile.movieRequests.filter((r: any) => {
              if (r.status !== "pending" && r.updatedAt) {
                const rDate = new Date(r.updatedAt).getTime();
                if (nowTime - rDate > SEVEN_DAYS_MS) return false;
              }
              return true;
            });
            if (filtered.length !== mergedProfile.movieRequests.length) {
              mergedProfile.movieRequests = filtered;
              modified = true;
            }
          }

          if (!mergedProfile.referralCode) {
            mergedProfile.referralCode = generateReferralCode(currentUser.uid);
            try {
              const pStr = safeStorage.getItem("pending_user_updates");
              let pAll = pStr ? JSON.parse(pStr) : {};
              pAll[currentUser.uid] = pAll[currentUser.uid] || {};
              pAll[currentUser.uid].referralCode = mergedProfile.referralCode;
              safeStorage.setItem("pending_user_updates", JSON.stringify(pAll));
              safeStorage.setItem("needs_user_sync", "true");
            } catch (e) {
              console.error("Failed to queue referralCode update", e);
            }
          }
        }

        // Check and apply referral if available for existing profile
        if (mergedProfile && !mergedProfile.referredBy && !mergedProfile.hasReceivedReferralReward && navigator.onLine) {
          const storedRefCode = localStorage.getItem("referral_code");
          if (storedRefCode) {
            const userCreatedAt = mergedProfile.createdAt ? new Date(mergedProfile.createdAt) : new Date();
            const daysSinceJoined = (new Date().getTime() - userCreatedAt.getTime()) / (1000 * 60 * 60 * 24);
            const isEligibleNewUser = daysSinceJoined <= 3;

            if (isEligibleNewUser) {
              try {
                const { doc, collection, query, where, getDocs, limit, writeBatch, getDoc } = await import("firebase/firestore");
                let foundInviterUid = null;

                // 1. Get the single referral document
                const refDoc = await getDoc(doc(db, "referral", "all"));
                if (refDoc.exists()) {
                  const data = refDoc.data() || {};
                  const codeToUidMap = data.codeToUid || {};
                  foundInviterUid = codeToUidMap[storedRefCode];
                }

                

                if (foundInviterUid && foundInviterUid !== currentUser.uid) {
                  mergedProfile.referredBy = foundInviterUid;
                  mergedProfile.signupRewardClaimed = true;
                  mergedProfile.hasReceivedReferralReward = true;
                  
                  // Give the newly referred user 10 days and make them active and role basic
                  const userUpdatesToPush: any = {
                    referredBy: foundInviterUid,
                    signupRewardClaimed: true,
                    hasReceivedReferralReward: true
                  };
                  
                  if (mergedProfile.expiryDate !== "Lifetime") {
                    let baseDate = new Date();
                    if (mergedProfile.expiryDate) {
                      const currentExp = new Date(mergedProfile.expiryDate);
                      if (currentExp > baseDate) baseDate = currentExp;
                    }
                    baseDate.setDate(baseDate.getDate() + 10);
                    mergedProfile.expiryDate = baseDate.toISOString();
                    userUpdatesToPush.expiryDate = mergedProfile.expiryDate;
                    
                    mergedProfile.status = "active";
                    userUpdatesToPush.status = "active";
                  }

                  if (['user', 'trial', 'selected_content', ''].includes(mergedProfile.role || '')) {
                    mergedProfile.role = 'basic';
                    userUpdatesToPush.role = 'basic';
                  }
                  
                  localStorage.removeItem("referral_code");
                  localStorage.setItem("referral_credit_message", "Your account is credited with 10 Days membership with referral code " + storedRefCode);
                  
                  // Write these updates to Firestore immediately
                  const batch = writeBatch(db);
                  batch.set(userRef, userUpdatesToPush, { merge: true });

                  // Also add them to the inviter's joins
                  const displayName = currentUser.displayName || mergedProfile.displayName || currentUser.email || mergedProfile.email || "User";
                  const email = currentUser.email || mergedProfile.email || "";
                  const status = (mergedProfile.orders && mergedProfile.orders.length > 0) ? "paid" : "login";
                  
                  const { increment } = await import("firebase/firestore");
                  batch.set(doc(db, "referral", "all"), {
                    joins: {
                      [currentUser.uid]: {
                        uid: currentUser.uid,
                        code: storedRefCode,
                        inviterUid: foundInviterUid,
                        displayName,
                        email,
                        status,
                        createdAt: new Date().toISOString(),
                        signupClaimed: false,
                        activationClaimed: false
                      }
                    },
                    stats: {
                      [foundInviterUid]: {
                        totalJoined: increment(1)
                      }
                    }
                  }, { merge: true });

                  // Ensure the newly referred user also has their own referral registration in codes map
                  if (mergedProfile.referralCode) {
                    batch.set(doc(db, "referral", "all"), {
                      codes: {
                        [mergedProfile.uid]: mergedProfile.referralCode
                      },
                      codeToUid: {
                        [mergedProfile.referralCode]: mergedProfile.uid
                      }
                    }, { merge: true });
                  }

                  await batch.commit();
                  updatedSomething = true;
                  console.log("Successfully applied referral reward to existing user profile.");
                }
              } catch (e) {
                console.error("Failed to apply referral to existing user:", e);
              }
            }
          }
        }

        // 5. Referral Inviter Reward Check
        if (mergedProfile?.referredBy && navigator.onLine) {
          try {
            const updates: any = {};
            let extensionDays = 0;

            // Tier 1: Signup Reward (10 days)
            // Given immediately when the referred user joins (they are active for 10 days by default)
            if (!mergedProfile.signupRewardClaimed) {
              extensionDays += 10;
              updates.signupRewardClaimed = true;
            }

            // Tier 2: Activation Reward (10 days)
            // Given if the user is active AND has at least one order
            const hasBoughtMembership = (mergedProfile.orders && mergedProfile.orders.length > 0);
            if (hasBoughtMembership && !mergedProfile.activationRewardClaimed) {
              extensionDays += 10;
              updates.activationRewardClaimed = true;
            }

            if (extensionDays > 0) {
              let baseDate = new Date();
              if (mergedProfile.expiryDate && mergedProfile.expiryDate !== 'Lifetime') {
                const currentExp = new Date(mergedProfile.expiryDate);
                if (currentExp > baseDate) {
                  baseDate = currentExp;
                }
              }
              baseDate.setDate(baseDate.getDate() + extensionDays);
              updates.expiryDate = baseDate.toISOString();
              updates.status = "active";

              if (['user', 'trial', 'selected_content', ''].includes(mergedProfile.role || '')) {
                updates.role = 'basic';
              }

              const { writeBatch} = await import("firebase/firestore");
              const batch = writeBatch(db);
              batch.set(userRef, updates, { merge: true });
              await batch.commit();
              
              // Update local profile state
              Object.assign(mergedProfile, updates);
              safeStorage.setItem("profile_cache", JSON.stringify(mergedProfile));
            }
          } catch (e) {
            console.error("Failed to process referral rewards", e);
          }
        }

        // Flush any accumulated seconds before sync
        const cacheKey = `accumulated_time_seconds_${currentUser.uid}`;
        let accSecs = parseInt(safeStorage.getItem(cacheKey) || "0", 10);
        if (accSecs > 0) {
          safeStorage.setItem(cacheKey, "0");
          const pendingStr =
            safeStorage.getItem("pending_user_updates") || "{}";
          try {
            let pendingAll = JSON.parse(pendingStr);
            pendingAll[currentUser.uid] = pendingAll[currentUser.uid] || {};
            let currentBase =
              typeof pendingAll[currentUser.uid].timeSpent === "number"
                ? pendingAll[currentUser.uid].timeSpent
                : localProfile?.timeSpent || 0;
            pendingAll[currentUser.uid].timeSpent = currentBase + accSecs;
            safeStorage.setItem(
              "pending_user_updates",
              JSON.stringify(pendingAll),
            );
          } catch (e) {}
        }

        // 4. Update user data doc and update chunk_meta version for user ONLY when necessary daily or local change
        const needsUserSync = safeStorage.getItem("needs_user_sync") === "true";
        let pendingUpdatesExist = false;
        try {
          const pdStr = safeStorage.getItem("pending_user_updates");
          if (pdStr) {
            const pObj = JSON.parse(pdStr);
            if (
              pObj[currentUser.uid] &&
              Object.keys(pObj[currentUser.uid]).length > 0
            )
              pendingUpdatesExist = true;
          }
        } catch (e) {}

        const hasLocalChanges =
          needsUserSync || accSecs > 0 || pendingUpdatesExist;

        // Strict rule: Only write to Firestore if explicitly manual or on fresh login/logout with local changes
        const isLogin = justLoggedInRef.current || reason === "login";
        const isSignOut = reason === "logout";
        const shouldWrite =
          reason !== "auto" && // Never write on automatic refreshes/session starts
          (serverProfile || localProfile) &&
          (isLogin ||
            isSignOut ||
            (force && reason === "manual") ||
            (hasLocalChanges && reason === "manual"));

        if (shouldWrite) {
          try {
            const { writeBatch} = await import("firebase/firestore");
            const batch = writeBatch(db);
            const newVersion = getUtcVersion();

            const updatesToPush: any = {};
            if (needsUserSync) {
              const pendFavs = safeStorage.getItem("pending_favorites_array");
              if (pendFavs) updatesToPush.favorites = JSON.parse(pendFavs);
              const pendWL = safeStorage.getItem("pending_watch_later_array");
              if (pendWL) updatesToPush.watchLater = JSON.parse(pendWL);

              // Merge pending orders if any
              const pendOrdersStr = safeStorage.getItem("pending_orders_array");
              if (pendOrdersStr) {
                try {
                  const pendingOrders = JSON.parse(pendOrdersStr);
                  if (Array.isArray(pendingOrders) && pendingOrders.length > 0) {
                    const existingOrders = serverProfile?.orders || localProfile?.orders || [];
                    const orderMap = new Map();
                    existingOrders.forEach((o: any) => o && o.id && orderMap.set(o.id, o));
                    pendingOrders.forEach((o: any) => o && o.id && orderMap.set(o.id, o));
                    updatesToPush.orders = Array.from(orderMap.values());
                  }
                } catch(e) {}
              }

              // Sync any deferred string/boolean/array profile fields
              const syncableKeys = [
                "phone",
                "displayName",
                "lastNotificationCheck",
                "notification",
                "movieRequests",
                "orders",
                "settings",
                "timeSpent",
              ];
              syncableKeys.forEach((key) => {
                if (
                  localProfile &&
                  localProfile[key] !== undefined &&
                  JSON.stringify(localProfile[key]) !==
                    JSON.stringify(serverProfile?.[key])
                ) {
                  updatesToPush[key] = localProfile[key];
                }
              });
            }
            if (mergedProfile.timeSpent !== undefined)
              updatesToPush.timeSpent = mergedProfile.timeSpent;

            // Check if there's any pending timeSpent in pending_user_updates for THIS user
            const pendingUpdatesStr = safeStorage.getItem(
              "pending_user_updates",
            );
            if (pendingUpdatesStr) {
              try {
                const pendingAll = JSON.parse(pendingUpdatesStr);
                const myPending = pendingAll[currentUser.uid];
                if (myPending) {
                  if (myPending.timeSpent !== undefined) {
                    updatesToPush.timeSpent = Math.max(
                      updatesToPush.timeSpent || 0,
                      myPending.timeSpent,
                    );
                    delete myPending.timeSpent;
                  }
                  Object.assign(updatesToPush, myPending);
                  delete pendingAll[currentUser.uid];
                  safeStorage.setItem(
                    "pending_user_updates",
                    JSON.stringify(pendingAll),
                  );
                }
              } catch (e) {}
            }

            if (mergedProfile) {
              const normMerged = normalizeUserStatusAndExpiry(mergedProfile);
              if (normMerged.status === "expired" && serverProfile?.status !== "expired") {
                updatesToPush.status = "expired";
              }
            }
            const realKeysToPush = Object.keys(updatesToPush).filter(k => k !== 'lastActive' && k !== 'updatedAt');
            if (realKeysToPush.length > 0) {
              updatesToPush.lastActive = new Date().toISOString();
              batch.set(userRef, updatesToPush, { merge: true });
              batch.set(doc(db, "chunk_meta", "versions"), {
                users: {
                  [currentUser.uid]: getUtcVersion()
                }
              }, { merge: true });
              await batch.commit();

              try {
                const { updateChunkMetaLocalCache } = await import("../utils/chunkMeta");
                updateChunkMetaLocalCache({ users: { [currentUser.uid]: getUtcVersion() } });
              } catch (e) {}

              try {
                const mtimesStr = safeStorage.getItem("sync_user_mtimes");
                if (mtimesStr) {
                  const mtimes = JSON.parse(mtimesStr);
                  mtimes[currentUser.uid] = newVersion;
                  safeStorage.setItem("sync_user_mtimes", JSON.stringify(mtimes));
                }
              } catch (e) {}
            }

            localStorage.setItem(userSyncKey, now.toString());
            safeStorage.setItem("needs_user_sync", "false");
            safeStorage.removeItem("pending_favorites_array");
            safeStorage.removeItem("pending_watch_later_array");
            safeStorage.removeItem("pending_orders_array");
            safeStorage.removeItem("pending_content_clicks");
            safeStorage.removeItem("pending_link_clicks");
            safeStorage.setItem(localVersionKey, getUtcVersion());
            mergedProfile = { ...mergedProfile, ...updatesToPush };
            if (hasLocalChanges || versionChanged) updatedSomething = true;
            console.log("Profile changes synced & merged to Firestore");
          } catch (err) {
            handleFirestoreError(
              err,
              OperationType.WRITE,
              `users/${currentUser.uid}`,
            );
            console.error("Manual/Daily profile sync failed:", err);
          }
        } else {
          localStorage.setItem(userSyncKey, now.toString());
          if (serverProfile || localProfile) {
            safeStorage.setItem(localVersionKey, effectiveServerVersion.toString());
          }
        }

        if (mergedProfile && Object.keys(mergedProfile).length > 0) {
          const profileJson = JSON.stringify(mergedProfile);
          safeStorage.setItem("profile_cache", profileJson);
          safeStorage.setItemAsync("profile_cache", profileJson).catch(() => {});
          safeStorage.setItem("profile_cache_timestamp", Date.now().toString());
          setProfile(mergedProfile);
        }

        // Admin & Session checks
        if (mergedProfile || serverProfile) {
          const data =
            mergedProfile && Object.keys(mergedProfile).length > 0
              ? mergedProfile
              : (serverProfile as UserProfile);

          const userEmailLower = currentUser.email?.toLowerCase();
          const isOwner = userEmailLower === "asmatn628@gmail.com";
          const isAdmin = [
            "asmatullah9327@gmail.com",
            "kabirahmaddev@gmail.com",
            "wamoviesstation@gmail.com",
          ].includes(userEmailLower || "");
          const hasAdminPrivileges =
            isOwner ||
            isAdmin ||
            data.role === "owner" ||
            data.role === "admin";

          const updates: any = {};
          const localSessionId = getLocalSessionId();

          // 1-Device Lock Check
          if (!hasAdminPrivileges && safeStorage.isAvailable) {
            if (justLoggedInRef.current || (window as any)._isNewSessionId) {
              // Set new session ID, evicting previous devices
              updates.sessionId = localSessionId;
              data.sessionId = localSessionId;
              (window as any)._isNewSessionId = false; // reset after initial assignment
            } else {
              if (data.sessionId && data.sessionId !== localSessionId) {
                console.log("Logged in from another device. Session mismatch detected.");
                // signOut(auth); // Disabled to prevent auto logout bug
                // setError(
                //  "You have been logged out because your account was accessed from another device.",
                // );
                // return false;
              } else if (!data.sessionId) {
                updates.sessionId = localSessionId;
                data.sessionId = localSessionId;
              }
            }
          }

          // Auto-expire & active restoration logic
          const expiryNow = new Date();
          if (data.role !== "owner" && data.role !== "admin") {
            if (!data.expiryDate || data.expiryDate === "null" || data.expiryDate === "") {
              if (data.status !== "suspended" && data.status !== "pending") {
                if (!data.status) {
                  updates.status = "pending";
                  data.status = "pending";
                  if (mergedProfile) mergedProfile.status = "pending";
                } else if (data.status === "active") {
                  updates.status = "expired";
                  data.status = "expired";
                  if (mergedProfile) {
                    mergedProfile.status = "expired";
                  }
                }
              }
            } else if (data.expiryDate !== "Lifetime") {
              if (isUserExpired(data.expiryDate)) {
                if (data.status !== "suspended") {
                  updates.status = "expired";
                  data.status = "expired";
                  if (mergedProfile) {
                    mergedProfile.status = "expired";
                  }
                }
              } else {
                // Today is on or before expiry date — user MUST be active!
                if (data.status !== "suspended" && data.status !== "pending") {
                  if (data.status === "expired" || !data.status) {
                    updates.status = "active";
                    data.status = "active";
                    if (mergedProfile) {
                      mergedProfile.status = "active";
                    }
                  }
                }
              }
            }
          }

          // Ensure joined date (createdAt) is never missing
          if (!data.createdAt || data.createdAt === "null" || data.createdAt === "undefined") {
            const fallbackCreatedAt = currentUser.metadata?.creationTime
              ? new Date(currentUser.metadata.creationTime).toISOString()
              : new Date().toISOString();
            data.createdAt = fallbackCreatedAt;
            updates.createdAt = fallbackCreatedAt;
            if (mergedProfile) {
              mergedProfile.createdAt = fallbackCreatedAt;
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

          // Perform consolidated update if needed (skip if update is status="expired" only)
          const isOnlyStatusExpired = Object.keys(updates).length === 1 && updates.status === "expired";
          if (
            Object.keys(updates).length > 0 &&
            !isOnlyStatusExpired &&
            (is10HourSyncPassed ||
              isLogin ||
              isSignOut ||
              (force && reason !== "manual"))
          ) {
            try {
              const { writeBatch} = await import("firebase/firestore");
              const batch = writeBatch(db);
              const verTime = getUtcVersion();
              batch.set(userRef, updates, { merge: true });
              batch.set(doc(db, "chunk_meta", "versions"), {
                users: {
                  [currentUser.uid]: getUtcVersion()
                }
              }, { merge: true });
              await batch.commit();
              safeStorage.setItem(`profile_version_${currentUser.uid}`, getUtcVersion());
              try {
                const { updateChunkMetaLocalCache } = await import("../utils/chunkMeta");
                updateChunkMetaLocalCache({ users: { [currentUser.uid]: getUtcVersion() } });
              } catch (e) {}
            } catch (err) {
              handleFirestoreError(
                err,
                OperationType.WRITE,
                `users/${currentUser.uid}`,
              );
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
            "wamoviesstation@gmail.com",
          ].includes(userEmailLower || "");
          const defaultRoleToSet = isOwner
            ? "owner"
            : isAdmin
              ? "admin"
              : "user";
          const defaultStatusToSet = isOwner || isAdmin ? "active" : "pending";
          const hasPassword = currentUser.providerData.some(
            (p) => p.providerId === "password",
          );

          // Extract phone from dummy email if available
          let extractedPhone = "";
          if (currentUser.email?.endsWith("@moviznow.com")) {
            const phonePart = currentUser.email.replace("@moviznow.com", "");
            extractedPhone = standardizePhone(phonePart);
          }
          const pendingPhone = sessionStorage.getItem("pending_signup_phone");
          if (pendingPhone) {
            sessionStorage.removeItem("pending_signup_phone");
          }
          const standardizedUserPhone = standardizePhone(
            currentUser.phoneNumber || extractedPhone || pendingPhone || "",
          );

          // Prevent creating a profile for completely empty/anonymous accounts without phone or email
          if (currentUser.isAnonymous || (!currentUser.email && !standardizedUserPhone)) {
             setLoading(false);
             return false;
          }

          let mergedOldData: any = {};
          let oldDocIds: string[] = [];

          try {
            const searchRef = collection(db, "users");
            const findMatches = async (field: string, value: string) => {
              if (!value) return [];
              try {
                const q = query(searchRef, where(field, "==", value), limit(5));
                const snap = await getDocs(q);
                return snap.docs.filter((d) => d.id !== currentUser.uid);
              } catch (err) {
                return [];
              }
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
                const baseMatches = await findMatches("phone", baseNumber);
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
                const getStatusRank = (s: string) => statusPriority[s] || 0;
                let betterStatus =
                  getStatusRank(data.status) > getStatusRank(acc.status || "")
                    ? data.status
                    : acc.status || data.status;

                // Expiry Date Logic: "Lifetime" wins, otherwise latest date
                let betterExpiry = acc.expiryDate;
                if (
                  data.expiryDate === "Lifetime" ||
                  acc.expiryDate === "Lifetime"
                ) {
                  betterExpiry = "Lifetime";
                } else if (data.expiryDate) {
                  if (!acc.expiryDate || acc.expiryDate === "null" || acc.expiryDate === "") {
                    betterExpiry = data.expiryDate;
                  } else {
                    const accTime = new Date(acc.expiryDate).getTime();
                    const dataTime = new Date(data.expiryDate).getTime();
                    if (!isNaN(dataTime) && (isNaN(accTime) || dataTime > accTime)) {
                      betterExpiry = data.expiryDate;
                    }
                  }
                }

                // If merged expiry is valid / in future, ensure status is active
                if (betterExpiry === "Lifetime" || (betterExpiry && !isUserExpired(betterExpiry))) {
                  if (betterStatus !== "suspended") {
                    betterStatus = "active";
                  }
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
                    acc.lastActive && acc.lastActive > (data.lastActive || "")
                      ? acc.lastActive
                      : data.lastActive || acc.lastActive,
                };
              }, {} as any);
            } else {
              // No existing matching profile found in search
              const isNewSignup =
                justLoggedInRef.current ||
                !!safeStorage.getItem("pending_signup_profile") ||
                !!sessionStorage.getItem("pending_signup_phone") ||
                (currentUser.metadata?.creationTime &&
                  Date.now() - new Date(currentUser.metadata.creationTime).getTime() < 3 * 60 * 1000);

              if (!isNewSignup) {
                console.warn(
                  `User UID ${currentUser.uid} was deleted from Firestore and no matching profile exists. Signing out safely.`,
                );
                safeStorage.removeItem("profile_cache");
                safeStorage.removeItem("profile_doc_snap");
                safeStorage.removeItem(`profile_version_${currentUser.uid}`);
                safeStorage.removeItem("cached_all_users");
                localStorage.removeItem("session_started");
                setProfile(null);
                setUser(null);
                setLoading(false);
                await signOut(auth).catch(() => {});
                return false;
              }
            }
          } catch (e) {
            console.error("Failed to check for existing accounts:", e);
          }

          // Check for referral
          const storedRefCode = localStorage.getItem("referral_code");
          let referredByUid = null;
          
          const userCreatedAt = mergedOldData.createdAt ? new Date(mergedOldData.createdAt) : new Date();
          const daysSinceJoined = (new Date().getTime() - userCreatedAt.getTime()) / (1000 * 60 * 60 * 24);
          const isEligibleNewUser = daysSinceJoined <= 3;

          if (storedRefCode && !mergedOldData.referredBy && !mergedOldData.hasReceivedReferralReward && isEligibleNewUser) {
            try {
              const { doc, collection, query, where, getDocs, limit, writeBatch, getDoc } = await import("firebase/firestore");
              let foundInviterUid = null;

              // 1. Get the single referral document
              const refDoc = await getDoc(doc(db, "referral", "all"));
              if (refDoc.exists()) {
                const data = refDoc.data() || {};
                const codeToUidMap = data.codeToUid || {};
                foundInviterUid = codeToUidMap[storedRefCode];
              }

              

              if (foundInviterUid && foundInviterUid !== currentUser.uid) {
                referredByUid = foundInviterUid;
              }
            } catch (e) {
              console.error("Failed to find inviter", e);
            }
          }

          const isNewlyReferred = referredByUid && !mergedOldData.referredBy && !mergedOldData.hasReceivedReferralReward;

          if (isNewlyReferred && storedRefCode) {
            localStorage.setItem("referral_credit_message", "Your account is credited with 5 Days membership with referral code " + storedRefCode);
          }

          let pendingSignupProfile: any = null;
          try {
            const pendingSignupStr = safeStorage.getItem("pending_signup_profile");
            if (pendingSignupStr) {
              pendingSignupProfile = JSON.parse(pendingSignupStr);
            }
          } catch (e) {}

          const cleanAuthName =
            currentUser.displayName &&
            currentUser.displayName.trim() &&
            currentUser.displayName !== "No Name" &&
            currentUser.displayName !== "null" &&
            currentUser.displayName !== "undefined"
              ? currentUser.displayName.trim()
              : "";
          const cleanPendingName =
            pendingSignupProfile?.displayName &&
            pendingSignupProfile.displayName.trim() &&
            pendingSignupProfile.displayName !== "No Name"
              ? pendingSignupProfile.displayName.trim()
              : "";
          const cleanOldName =
            mergedOldData.displayName &&
            mergedOldData.displayName.trim() &&
            mergedOldData.displayName !== "No Name" &&
            mergedOldData.displayName !== "null" &&
            mergedOldData.displayName !== "undefined"
              ? mergedOldData.displayName.trim()
              : "";
          const isDummyEmail =
            currentUser.email && currentUser.email.endsWith("@moviznow.com");
          const cleanEmailName =
            currentUser.email && !isDummyEmail
              ? currentUser.email.split("@")[0]
              : "";

          const resolvedPhone =
            pendingSignupProfile?.phone ||
            standardizedUserPhone ||
            mergedOldData.phone ||
            "";
          const resolvedEmail =
            pendingSignupProfile?.email ||
            currentUser.email ||
            mergedOldData.email ||
            "";

          const resolvedDisplayName =
            cleanAuthName ||
            cleanPendingName ||
            cleanOldName ||
            cleanEmailName ||
            (resolvedPhone ? `User (${resolvedPhone})` : `User (${currentUser.uid.slice(0, 6)})`);

          const newProfile: UserProfile = {
            // Start with all aggregated data from old accounts
            ...mergedOldData,
            // Ensure identity fields match exactly what was used for this successful login
            uid: currentUser.uid,
            email: resolvedEmail,
            phone: resolvedPhone,
            displayName: resolvedDisplayName,
            photoURL: currentUser.photoURL || mergedOldData.photoURL || "",
            referralCode: mergedOldData.referralCode || generateReferralCode(currentUser.uid),
            referredBy: referredByUid || mergedOldData.referredBy || null,
            signupRewardClaimed: isNewlyReferred || mergedOldData.signupRewardClaimed || false,
            hasReceivedReferralReward: isNewlyReferred || mergedOldData.hasReceivedReferralReward || false,
            activationRewardClaimed: mergedOldData.activationRewardClaimed || false,
            notificationRewardClaimed: mergedOldData.notificationRewardClaimed || false,
            pwaRewardClaimed: mergedOldData.pwaRewardClaimed || false,
            reviewRewardClaimed: mergedOldData.reviewRewardClaimed || false,
            timeSpent: (mergedOldData.timeSpent || 0) + (localProfile?.timeSpent || 0),
            // Increment session data for the current session, unless it's an owner
            sessionsCount: isOwner
              ? mergedOldData.sessionsCount || 0
              : (mergedOldData.sessionsCount || 0) + 1,
            hasPassword: hasPassword,
            sessionId: getLocalSessionId(),
            // Enforce roles based on the high-privileged list or the old data
            role: isOwner
              ? "owner"
              : isAdmin
                ? "admin"
                : isNewlyReferred
                  ? "basic"
                  : mergedOldData.role || defaultRoleToSet,
            status:
              isOwner || isAdmin
                ? "active"
                : isNewlyReferred
                  ? "active"
                  : (mergedOldData.expiryDate && (mergedOldData.expiryDate === "Lifetime" || !isUserExpired(mergedOldData.expiryDate)) && mergedOldData.status !== "suspended")
                    ? "active"
                    : mergedOldData.status || defaultStatusToSet,
            expiryDate: isOwner
              ? "Lifetime"
              : isNewlyReferred
                ? (() => {
                    let baseDate = new Date();
                    if (mergedOldData.expiryDate && mergedOldData.expiryDate !== "Lifetime") {
                      const currentExp = new Date(mergedOldData.expiryDate);
                      if (currentExp > baseDate) baseDate = currentExp;
                    }
                    baseDate.setDate(baseDate.getDate() + 10);
                    return baseDate.toISOString();
                  })()
                : mergedOldData.expiryDate || null,
            // Ensure we have a creation date
            createdAt: mergedOldData.createdAt || new Date().toISOString(),
            lastActive: new Date().toISOString(),
            // Ensure arrays are initialized if missing
            favorites: mergedOldData.favorites || [],
            watchLater: mergedOldData.watchLater || [],
            assignedContent: mergedOldData.assignedContent || [],
            welcomeEmailSent: mergedOldData.welcomeEmailSent || false,
          };

          if (referredByUid) {
            localStorage.removeItem("referral_code");
          }

          try {
            const pendingUpdatesStr = safeStorage.getItem(
              "pending_user_updates",
            );
            if (pendingUpdatesStr) {
              const pendingAll = JSON.parse(pendingUpdatesStr);
              if (pendingAll[currentUser.uid]) {
                const myPending = pendingAll[currentUser.uid];
                // Apply pending profile updates during profile creation
                Object.assign(newProfile, myPending);
                delete pendingAll[currentUser.uid];
                safeStorage.setItem(
                  "pending_user_updates",
                  JSON.stringify(pendingAll),
                );
              }
            }
          } catch (e) {}

          try {
            const batch = writeBatch(db);
            // Set the new user record
            batch.set(userRef, newProfile);

            if (isNewlyReferred) {
              const displayName = currentUser.displayName || newProfile.displayName || currentUser.email || newProfile.email || "User";
              const email = currentUser.email || newProfile.email || "";
              const status = (newProfile.orders && newProfile.orders.length > 0) ? "paid" : "login";
              
              const { increment } = await import("firebase/firestore");
              // Update the inviter's referral document inside "all"
              batch.set(doc(db, "referral", "all"), {
                joins: {
                  [currentUser.uid]: {
                    uid: currentUser.uid,
                    code: storedRefCode,
                    inviterUid: referredByUid,
                    displayName,
                    email,
                    status,
                    createdAt: new Date().toISOString(),
                    signupClaimed: false,
                    activationClaimed: false
                  }
                },
                stats: {
                  [referredByUid]: {
                    totalJoined: increment(1)
                  }
                }
              }, { merge: true });
            }

            // Also register their own referralCode in the codes map inside "all"
            if (newProfile.referralCode) {
              batch.set(doc(db, "referral", "all"), {
                codes: {
                  [newProfile.uid]: newProfile.referralCode
                },
                codeToUid: {
                  [newProfile.referralCode]: newProfile.uid
                }
              }, { merge: true });
            }

            await batch.commit();

            // Update version metadata safely
            try {
              const { setDoc} = await import("firebase/firestore");
              const metaUpdates: Record<string, any> = { [currentUser.uid]: getUtcVersion() };
              oldDocIds.forEach((oldId) => { metaUpdates[oldId] = -1; });
              await setDoc(doc(db, "chunk_meta", "versions"), { users: metaUpdates }, { merge: true });
            } catch (metaErr) {}

            // Delete old duplicate documents safely
            if (oldDocIds && oldDocIds.length > 0) {
              const { deleteDoc } = await import("firebase/firestore");
              for (const oldId of oldDocIds) {
                try {
                  await deleteDoc(doc(db, "users", oldId));
                  console.log(`Merged and deleted old profile: ${oldId}`);
                } catch (delErr) {
                  console.warn("Could not delete duplicate document:", oldId, delErr);
                }
              }
            }

            // Trigger welcome email for new user via central handler (prevents duplicate emails)
            const userEmail = currentUser.email || newProfile.email;
            if (userEmail && isValidGmailAddress(userEmail) && !mergedOldData.welcomeEmailSent) {
              const userName = currentUser.displayName || newProfile.displayName || "Movie Lover";
              triggerWelcomeNotificationAndEmail(currentUser.uid, userEmail, userName, true);
              updateDoc(userRef, { welcomeEmailSent: true }).catch(() => {});
            }

            console.log(
              `Successfully combined ${oldDocIds.length} accounts into new UID ${currentUser.uid}`,
            );
          } catch (err) {
            console.error("Failed to merge/create user profile:", err);
            // Fallback attempt if batch fails
            try {
              const { writeBatch} = await import("firebase/firestore");
              const fbBatch = writeBatch(db);
              fbBatch.set(userRef, newProfile);
              fbBatch.set(doc(db, "referral", "all"), {
                codes: {
                  [newProfile.uid]: newProfile.referralCode
                },
                codeToUid: {
                  [newProfile.referralCode]: newProfile.uid
                }
              }, { merge: true });
              await fbBatch.commit();
            } catch (e) {}
          }
          safeStorage.setItem("profile_cache", JSON.stringify(newProfile));
          safeStorage.setItem("profile_cache_timestamp", Date.now().toString());
          safeStorage.setItem(
            localVersionKey,
            (serverVersion || getUtcVersion()),
          );
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
    },
    [],
  );

  useEffect(() => {
    const handleVisibilityChange = () => {
      // Removing visibility tracking manual sync as per requirement.
      // Profile syncing will only happen at 7AM, login/logout, or explicit phone update.
    };
    window.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      window.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [refreshProfile]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);

      if (currentUser) {
        const userRef = doc(db, "users", currentUser.uid);
        // Load profile immediately from local cache
        const cachedProfileStr = safeStorage.getItem("profile_cache");
        let hasValidCachedProfile = false;
        if (cachedProfileStr) {
          try {
            const cachedP = JSON.parse(cachedProfileStr);
            if (cachedP && cachedP.uid && cachedP.uid !== currentUser.uid) {
              console.warn("Mismatched UID in local storage. Clearing cache.");
              safeStorage.removeItem("profile_cache");
              safeStorage.removeItem("profile_doc_snap");
              safeStorage.removeItem(`profile_version_${currentUser.uid}`);
              safeStorage.removeItem("cached_all_users");
            } else if (cachedP && cachedP.uid === currentUser.uid) {
              const normCachedP = normalizeUserStatusAndExpiry(cachedP);
              setProfile(normCachedP);
              if (normCachedP.status !== cachedP.status) {
                safeStorage.setItem("profile_cache", JSON.stringify(normCachedP));
              }
              hasValidCachedProfile = true;
            }
          } catch (e) {}
        }

        const sessionKey = `last_session_start_${currentUser.uid}`;
        const now = Date.now();
        const twelveHours = 12 * 60 * 60 * 1000;
        const lastSessionStart = localStorage.getItem(sessionKey);

        // Always try to refresh user profile from Firestore on app startup/auth state to sync latest status/dates
        refreshProfile(false, "auto").catch((err) => {
          console.warn("Initial profile sync failed:", err);
        });

        // Always initialize the ref for this React lifecycle to ensure interval tracking works
        if (!sessionStartTimeRef.current) {
          sessionStartTimeRef.current = now;
        }

        if (!sessionStorage.getItem("session_started")) {
          sessionStorage.setItem("session_started", "true");

          if (
            !lastSessionStart ||
            now - parseInt(lastSessionStart, 10) > twelveHours
          ) {
            logEvent("session_start", currentUser.uid, {}, true); // Log to GA, skip individual Firestore write
            localStorage.setItem(sessionKey, now.toString());

            // Track session count & device details purely in local storage
            try {
              const cachedProfileStr = safeStorage.getItem("profile_cache");
              const p = cachedProfileStr ? JSON.parse(cachedProfileStr) : null;
              if (p?.role !== "owner") {
                const sessionCacheKey = `accumulated_sessions_${currentUser.uid}`;
                const curSessions = parseInt(safeStorage.getItem(sessionCacheKey) || "0", 10);
                safeStorage.setItem(sessionCacheKey, (curSessions + 1).toString());
              }
            } catch (e) {}

            const { getDeviceDetails } = await import("../utils/deviceInfo");
            const deviceDetails = await getDeviceDetails();
            if (deviceDetails) {
              try {
                const pendingStr =
                  safeStorage.getItem("pending_user_updates") || "{}";
                const pendingAll = JSON.parse(pendingStr);
                pendingAll[currentUser.uid] = pendingAll[currentUser.uid] || {};
                pendingAll[currentUser.uid].device = deviceDetails;
                safeStorage.setItem(
                  "pending_user_updates",
                  JSON.stringify(pendingAll),
                );
              } catch (e) {}
            }
          }
        }
      } else {
        // Do not clear profile cache here to prevent auto logout bug when Firebase auth state drops temporarily
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
          const cachedProfileStr = safeStorage.getItem("profile_cache");
          if (cachedProfileStr) {
            const p = JSON.parse(cachedProfileStr);
            if (p.role === "owner") return;
          }
        } catch (e) {}

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
                const cachedUsersStr =
                  safeStorage.getItem("cached_all_users") || "[]";
                let cachedUsers: any[] = [];
                try {
                  cachedUsers = JSON.parse(cachedUsersStr);
                } catch (e) {}
                const userIndex = cachedUsers.findIndex((u) => u.uid === uid);

                if (userIndex !== -1) {
                  cachedUsers[userIndex].timeSpent =
                    (cachedUsers[userIndex].timeSpent || 0) + secondsToSync;
                  cachedUsers[userIndex].lastActive = new Date().toISOString();
                  safeStorage.setItem(
                    "cached_all_users",
                    JSON.stringify(cachedUsers),
                  );

                  // Only dispatch custom event if user is currently loaded
                  window.dispatchEvent(
                    new CustomEvent("user_local_update", {
                      detail: {
                        uid,
                        fields: {
                          timeSpent: cachedUsers[userIndex].timeSpent,
                          lastActive: cachedUsers[userIndex].lastActive,
                        },
                      },
                    }),
                  );
                }

                // Removed writing to pending_user_updates here as per user request to avoid auto updating pending state.
                // Time spent will be synced when another event triggers profile update.

                logEvent("time_spent", uid, { duration: secondsToSync }).catch(
                  (err) => {
                    console.error(
                      "Failed to sync time spent to analytics:",
                      err,
                    );
                  },
                );
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
          const cachedProfileStr = safeStorage.getItem("profile_cache");
          if (cachedProfileStr) {
            const p = JSON.parse(cachedProfileStr);
            if (p.role === "owner") return;
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
      localStorage.removeItem(`last_user_sync_time_v2_${result.user.uid}`);

      // Check if we need to link phone/email in Firestore
      const userRef = doc(db, "users", result.user.uid);
      
      // Before getting the new uid doc, check if email already exists for merging
      let oldDocData = null;
      let shouldSignOutDeleted = false;
      if (result.user.email) {
        try {
          const { collection, query, where, getDocs, limit } = await import("firebase/firestore");
          const usersRef = collection(db, "users");
          const q = query(usersRef, where("email", "==", result.user.email), limit(10));
          const qs = await getDocs(q);
          
          // Find existing doc with different UID
          const existingDoc = qs.docs.find(d => d.id !== result.user.uid);
          if (existingDoc) {
            oldDocData = existingDoc.data();
            if (oldDocData.status === "deleted") {
              shouldSignOutDeleted = true;
            }
          }
        } catch (queryErr) {
          console.warn("Could not check duplicate email doc during login:", queryErr);
        }
      }

      if (shouldSignOutDeleted) {
        justLoggedInRef.current = false;
        await signOut(auth);
        throw new Error("Your account has been deleted or blocked.");
      }

      let snap: any = null;
      try {
        snap = await getDoc(userRef);
      } catch (getErr) {
        console.warn("Could not fetch user document directly, onAuthStateChanged will synchronize:", getErr);
      }
      const localSessionId = getLocalSessionId();

      const updates: any = {};
      const { getDeviceDetails } = await import("../utils/deviceInfo");
      const deviceDetails = await getDeviceDetails();

      if (deviceDetails) {
        try {
          const pendingStr =
            safeStorage.getItem("pending_user_updates") || "{}";
          let pendingAll = JSON.parse(pendingStr);
          pendingAll[result.user.uid] = pendingAll[result.user.uid] || {};
          pendingAll[result.user.uid].device = deviceDetails;
          safeStorage.setItem(
            "pending_user_updates",
            JSON.stringify(pendingAll),
          );
        } catch (e) {}
      }

      try {
        const pendingStr = safeStorage.getItem("pending_user_updates");
        if (pendingStr) {
          const pendingAll = JSON.parse(pendingStr);
          if (pendingAll[result.user.uid]) {
            Object.assign(updates, pendingAll[result.user.uid]);
            // Preserving pendingAll for onAuthStateChanged
          }
        }
      } catch (e) {}

      let docExists = false;
      if (snap && snap.exists()) {
        docExists = true;
        const data = snap.data();
        updates.sessionId = localSessionId;
        if (!data.email && result.user.email) {
          updates.email = result.user.email;
        }
        if (result.user.displayName && (!data.displayName || data.displayName === "No Name" || data.displayName === "null" || data.displayName === "undefined" || data.displayName.startsWith("User ("))) {
          updates.displayName = result.user.displayName;
        }
        if (result.user.photoURL && !data.photoURL) {
          updates.photoURL = result.user.photoURL;
        }
      } else if (oldDocData) {
        // Safely merge existing email data into new uid (except timeSpent and uid)
        for (const key of Object.keys(oldDocData)) {
          if (key !== "timeSpent" && key !== "uid" && key !== "sessionId" && key !== "createdAt" && key !== "updatedAt") {
            updates[key] = oldDocData[key];
          }
        }
        updates.email = result.user.email;
        if (result.user.displayName) updates.displayName = result.user.displayName;
        if (result.user.photoURL) updates.photoURL = result.user.photoURL;
      }

      const applyUpdates = async () => {
        if (Object.keys(updates).length > 0) {
          try {
            const { setDoc} = await import("firebase/firestore");
            await setDoc(userRef, updates, { merge: true });
            setProfile((prev: any) => {
              if (!prev) return prev;
              const newProfile = { ...prev, ...updates };
              safeStorage.setItem("profile_cache", JSON.stringify(newProfile));
              return newProfile;
            });
          } catch (e) {}
        }
      };

      if (docExists) {
         await applyUpdates();
      } else {
        // If it doesn't exist, it will be created by onAuthStateChanged shortly
        setTimeout(applyUpdates, 3000);
      }

      if (result.user) {
        triggerWelcomeNotificationAndEmail(
          result.user.uid,
          result.user.email,
          result.user.displayName,
          !docExists
        );
      }

      setTimeout(() => {
        justLoggedInRef.current = false;
      }, 10000);
    } catch (err: any) {
      justLoggedInRef.current = false;

      // Ignore user closing the popup
      if (
        err?.code === "auth/popup-closed-by-user" ||
        err?.code === "auth/cancelled-popup-request"
      ) {
        return;
      }

      console.error("Login error:", err);
      setError(err.message || "Failed to login");
    }
  };

  const signInWithEmail = async (email: string, password: string) => {
    try {
      setError(null);
      
      // If logging in with phone-generated email, verify whitelist
      if (email.endsWith('@moviznow.com')) {
        const phonePart = email.split('@')[0];
        const isWhitelisted = await isPhoneWhitelisted(phonePart);
        if (!isWhitelisted) {
          throw new Error("This WhatsApp number is not authorized. Please contact admin.");
        }
      }

      justLoggedInRef.current = true;
      const result = await signInWithEmailAndPassword(auth, email, password);

      // Force refresh app data
      safeStorage.removeItem("profile_cache");
      safeStorage.removeItem("cached_chunk_users_versions");
      safeStorage.removeItem("cached_all_users");
      localStorage.removeItem(`last_user_sync_time_v2_${result.user.uid}`);

      try {
        const { writeBatch} = await import("firebase/firestore");
        const batch = writeBatch(db);
        const updates: any = { sessionId: getLocalSessionId() };

        try {
          const pendingStr = safeStorage.getItem("pending_user_updates");
          if (pendingStr) {
            const pendingAll = JSON.parse(pendingStr);
            if (pendingAll[result.user.uid]) {
              Object.assign(updates, pendingAll[result.user.uid]);
              delete pendingAll[result.user.uid];
              safeStorage.setItem(
                "pending_user_updates",
                JSON.stringify(pendingAll),
              );
            }
          }
        } catch (e) {}

        const loginVerTime = getUtcVersion();
        batch.update(doc(db, "users", result.user.uid), updates);
        batch.set(doc(db, "chunk_meta", "versions"), {
          users: {
            [result.user.uid]: getUtcVersion()
          }
        }, { merge: true });
        await batch.commit();
        safeStorage.setItem(`profile_version_${result.user.uid}`, getUtcVersion());
        try {
          const { updateChunkMetaLocalCache } = await import("../utils/chunkMeta");
          updateChunkMetaLocalCache({ users: { [result.user.uid]: getUtcVersion() } });
        } catch (e) {}
      } catch (e) {}

      if (result.user) {
        triggerWelcomeNotificationAndEmail(
          result.user.uid,
          result.user.email,
          result.user.displayName || email.split("@")[0],
          false // always an existing user on login
        );
      }

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
        throw new Error(
          "WhatsApp Number is required for new account creation.",
        );
      }

      const cleanSignupName = displayName.trim() || (phone ? `User (${standardizePhone(phone)})` : email.split('@')[0]);

      if (phone) {
        const standardizedPhone = standardizePhone(phone);
        sessionStorage.setItem("pending_signup_phone", standardizedPhone);
      }

      safeStorage.setItem("pending_signup_profile", JSON.stringify({
        displayName: cleanSignupName,
        phone: phone ? standardizePhone(phone) : "",
        email: email,
        createdAt: new Date().toISOString(),
        status: "pending",
        role: "user",
      }));

      justLoggedInRef.current = true;
      let userCredential;
      try {
        userCredential = await createUserWithEmailAndPassword(
          auth,
          email,
          password,
        );
      } catch (authErr: any) {
        if (authErr.code === "auth/operation-not-allowed") {
          throw new Error(
            "Email/Password accounts are not enabled. Please enable 'Email/Password' in the Firebase Auth console.",
          );
        }
        throw authErr;
      }
      await updateProfile(userCredential.user, { displayName: cleanSignupName });

      try {
        const { writeBatch} = await import("firebase/firestore");
        const batch = writeBatch(db);
        const signupTime = getUtcVersion();
        batch.set(doc(db, "users", userCredential.user.uid), {
          displayName: cleanSignupName,
          phone: phone ? standardizePhone(phone) : "",
          email: email,
          createdAt: new Date().toISOString(),
          status: "pending",
          role: "user",
        }, { merge: true });
        batch.set(doc(db, "chunk_meta", "versions"), {
          users: {
            [userCredential.user.uid]: getUtcVersion()
          }
        }, { merge: true });
        await runWithNetwork(() => batch.commit());
        safeStorage.setItem(`profile_version_${userCredential.user.uid}`, getUtcVersion());
        try {
          const { updateChunkMetaLocalCache } = await import("../utils/chunkMeta");
          updateChunkMetaLocalCache({ users: { [userCredential.user.uid]: getUtcVersion() } });
        } catch (e) {}
      } catch (e) {}

      setTimeout(() => {
        justLoggedInRef.current = false;
        safeStorage.removeItem("pending_signup_profile");
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

      const cleanPhoneSignupName = displayName.trim() || (standardizedPhone ? `User (${standardizedPhone})` : (signupEmail ? signupEmail.split('@')[0] : 'User'));

      if (standardizedPhone) {
        sessionStorage.setItem("pending_signup_phone", standardizedPhone);
      }

      safeStorage.setItem("pending_signup_profile", JSON.stringify({
        displayName: cleanPhoneSignupName,
        phone: standardizedPhone || "",
        email: signupEmail,
        createdAt: new Date().toISOString(),
        status: "pending",
        role: "user",
      }));

      justLoggedInRef.current = true;
      let userCredential;
      try {
        userCredential = await createUserWithEmailAndPassword(
          auth,
          signupEmail,
          password,
        );
      } catch (authErr: any) {
        if (authErr.code === "auth/operation-not-allowed") {
          throw new Error(
            "Email/Password accounts are not enabled. Please enable 'Email/Password' in the Firebase Auth console to support phone signups.",
          );
        }
        if (authErr.code === "auth/email-already-in-use") {
          throw new Error(
            `The email address ${signupEmail} is already registered. Please log in with that email or Google login.`,
          );
        }
        throw authErr;
      }
      await updateProfile(userCredential.user, { displayName: cleanPhoneSignupName });

      try {
        const { writeBatch} = await import("firebase/firestore");
        const batch = writeBatch(db);
        const signupTime = getUtcVersion();
        batch.set(doc(db, "users", userCredential.user.uid), {
          displayName: cleanPhoneSignupName,
          phone: standardizedPhone || "",
          email: signupEmail,
          createdAt: new Date().toISOString(),
          status: "pending",
          role: "user",
        }, { merge: true });
        batch.set(doc(db, "chunk_meta", "versions"), {
          users: {
            [userCredential.user.uid]: getUtcVersion()
          }
        }, { merge: true });
        await runWithNetwork(() => batch.commit());
        safeStorage.setItem(`profile_version_${userCredential.user.uid}`, getUtcVersion());
        try {
          const { updateChunkMetaLocalCache } = await import("../utils/chunkMeta");
          updateChunkMetaLocalCache({ users: { [userCredential.user.uid]: getUtcVersion() } });
        } catch (e) {}
      } catch (e) {}

      setTimeout(() => {
        justLoggedInRef.current = false;
        safeStorage.removeItem("pending_signup_profile");
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
    if (!standardizedPhone) return false;
    const stdDigits = standardizedPhone.replace(/\D/g, "");
    const last10 = stdDigits.slice(-10);

    try {
      // Check single document storage in settings/whitelisted_phones
      const docRef = doc(db, "settings", "whitelisted_phones");
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        const numbers: string[] = Array.isArray(data.numbers) ? data.numbers : (Array.isArray(data.phones) ? data.phones : []);
        return numbers.some((n: any) => {
          if (!n || typeof n !== "string") return false;
          const stdN = standardizePhone(n);
          if (stdN && stdN === standardizedPhone) return true;
          const nDigits = n.replace(/\D/g, "");
          if (nDigits.slice(-10) === last10 && last10.length === 10) return true;
          return n.trim() === phone.trim() || n.trim() === standardizedPhone;
        });
      }
      return false;
    } catch (err) {
      console.error("Error checking whitelisted phone:", err);
      return false;
    }
  };

  const findUsersByEmailOrPhone = async (
    identifier: string,
  ): Promise<UserProfile[]> => {
    try {
      const trimmed = identifier.trim();
      if (!trimmed) return [];

      // Check local cached users first if available
      try {
        const cachedUsersStr = safeStorage.getItem('cached_all_users');
        if (cachedUsersStr) {
          const cachedUsers: UserProfile[] = JSON.parse(cachedUsersStr);
          if (Array.isArray(cachedUsers) && cachedUsers.length > 0) {
            const lower = trimmed.toLowerCase();
            const cleanedDigits = trimmed.replace(/\D/g, "");
            const localMatches = cachedUsers.filter(u => {
              if (u.email && u.email.toLowerCase() === lower) return true;
              if (u.phone && (u.phone === trimmed || (cleanedDigits && u.phone.replace(/\D/g, "").includes(cleanedDigits)))) return true;
              return false;
            });
            if (localMatches.length > 0) {
              return localMatches;
            }
          }
        }
      } catch (e) {}

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
          limit(5),
        ),
        "email_exact",
      );

      // 2. Check phone variations
      // Clean identifier: remove everything except digits and possibly a leading +
      const cleanedForSearch = trimmed.replace(/[^\d+]/g, "");
      const isLikelyPhone =
        cleanedForSearch.length >= 7 && /^[\d+]+$/.test(cleanedForSearch);

      if (isLikelyPhone) {
        const standardized = standardizePhone(cleanedForSearch);

        let digitsOnly = cleanedForSearch.replace(/\D/g, "");
        let baseNumber = digitsOnly;
        if (baseNumber.startsWith("92")) baseNumber = baseNumber.substring(2);
        else if (baseNumber.startsWith("0"))
          baseNumber = baseNumber.substring(1);

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
              limit(5),
            ),
            "phone_in",
          );
        }

        if (emailFormats.length > 0) {
          await evaluateQuery(
            query(
              collection(db, "users"),
              where("email", "in", emailFormats),
              limit(5),
            ),
            "email_in",
          );
        }
      } else {
        // Just search the raw trimmed identifier in phone too in case it was saved oddly
        await evaluateQuery(
          query(
            collection(db, "users"),
            where("phone", "==", trimmed),
            limit(5),
          ),
          "phone_exact",
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
    const userSyncKey = `last_user_sync_time_v2_${user.uid}`;

    try {
      setError(null);

      // Check for phone duplicate if changing
      if (data.phone && data.phone !== profile.phone) {
        const standardizedNewPhone = standardizePhone(data.phone);
        const existingPhones =
          await findUsersByEmailOrPhone(standardizedNewPhone);
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
        const pendingStr = safeStorage.getItem("pending_user_updates") || "{}";
        try {
          let pendingAll = JSON.parse(pendingStr);
          pendingAll[user.uid] = pendingAll[user.uid] || {};
          let currentBase =
            typeof pendingAll[user.uid].timeSpent === "number"
              ? pendingAll[user.uid].timeSpent
              : profile.timeSpent || 0;
          pendingAll[user.uid].timeSpent = currentBase + accSecs;
          safeStorage.setItem(
            "pending_user_updates",
            JSON.stringify(pendingAll),
          );
        } catch (e) {}
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
              data.timeSpent = Math.max(
                data.timeSpent || profile.timeSpent || 0,
                myPending.timeSpent,
              );
              delete myPending.timeSpent;
            }
            Object.assign(data, myPending);
            delete pendingAll[user.uid];
            safeStorage.setItem(
              "pending_user_updates",
              JSON.stringify(pendingAll),
            );
          }
        } catch (e) {}
      }

      // Save local first!
      const nowIso = new Date().toISOString();
      data.uid = user.uid;
      data.lastActive = nowIso;
      data.updatedAt = nowIso;

      if (data.expiryDate && data.expiryDate !== "Lifetime") {
        if (!isUserExpired(data.expiryDate) && data.status !== "suspended" && data.status !== "pending") {
          data.status = "active";
        } else if (isUserExpired(data.expiryDate) && data.status !== "suspended") {
          data.status = "expired";
        }
      }

      const updatedProfile = { ...profile, ...data };
      console.log('updateUserProfileData: updating profile with data:', data);
      setProfile(updatedProfile);
      safeStorage.setItem("profile_cache", JSON.stringify(updatedProfile));
      safeStorage.setItem("profile_cache_timestamp", Date.now().toString());

      try {
        const cachedAllStr = safeStorage.getItem("cached_all_users");
        if (cachedAllStr) {
          let cachedAll: UserProfile[] = JSON.parse(cachedAllStr);
          const idx = cachedAll.findIndex(u => u.uid === user.uid);
          if (idx !== -1) {
            cachedAll[idx] = { ...cachedAll[idx], ...data };
          } else {
            cachedAll.push({ ...profile, ...data } as UserProfile);
          }
          safeStorage.setItem("cached_all_users", JSON.stringify(cachedAll));
        }
      } catch (e) {}

      const userRefPath = doc(db, "users", user.uid);

      try {
        const { writeBatch} = await import("firebase/firestore");
        let batch = writeBatch(db);
        const updateVerTime = getUtcVersion();
        batch.set(userRefPath, data, { merge: true });
        batch.set(doc(db, "chunk_meta", "versions"), {
          users: {
            [user.uid]: getUtcVersion()
          }
        }, { merge: true });

        if (data.referralCode) {
          batch.set(doc(db, "referral", "all"), {
            codes: {
              [user.uid]: data.referralCode
            },
            codeToUid: {
              [data.referralCode]: user.uid
            }
          }, { merge: true });
        }

        // Propagate status update if they are referred and transitioned to paid
        const wasPaid = profile?.orders && profile.orders.length > 0;
        const isPaidNow = data.orders && data.orders.length > 0;
        const belongsToInviter = profile?.referredBy || data.referredBy;
        if (belongsToInviter && isPaidNow && !wasPaid) {
          const { increment } = await import("firebase/firestore");
          batch.set(doc(db, "referral", "all"), {
            joins: {
              [user.uid]: {
                status: "paid"
              }
            },
            stats: {
              [belongsToInviter]: {
                totalPaid: increment(1)
              }
            }
          }, { merge: true });
        }
            await batch.commit();

        console.log("Users doc updated successfully.");
      } catch (err: any) {
        handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`);

        try {
          const pendingStr = safeStorage.getItem("pending_user_updates");
          let pendingAll = pendingStr ? JSON.parse(pendingStr) : {};
          pendingAll[user.uid] = { ...(pendingAll[user.uid] || {}), ...data };
          safeStorage.setItem(
            "pending_user_updates",
            JSON.stringify(pendingAll),
          );
        } catch (e) {}

        safeStorage.setItem("needs_user_sync", "true");
        return;
      }

      safeStorage.setItem(userSyncKey, Date.now().toString());
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
      const { writeBatch} = await import("firebase/firestore");
      const batch = writeBatch(db);
      batch.update(userRef, { hasPassword: true });
            await batch.commit();
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
      await refreshProfile(true, "logout");
      window.dispatchEvent(new Event("force_flush_all_data"));
      // give listeners a brief moment to catch up
      await new Promise((r) => setTimeout(r, 500));
    } catch (e) {
      console.error("Flush before logout error", e);
    }
    
    // Explicitly clear cache on intentional logout to ensure user is logged out
    safeStorage.removeItem("profile_cache");
    safeStorage.removeItem("cached_chunk_users_versions");
    safeStorage.removeItem("cached_all_users");
    safeStorage.removeItem("referral_stats_count");
    safeStorage.removeItem("referral_stats_activated");
    safeStorage.removeItem("referral_users_list");
    if (auth.currentUser) {
      localStorage.removeItem(`last_user_sync_time_v2_${auth.currentUser.uid}`);
      safeStorage.removeItem(`referral_stats_count_${auth.currentUser.uid}`);
      safeStorage.removeItem(`referral_stats_activated_${auth.currentUser.uid}`);
      safeStorage.removeItem(`referral_users_list_${auth.currentUser.uid}`);
    }
    setProfile(null);
    setUser(null);

    await signOut(auth);
  };

  const toggleFavorite = useCallback(async (contentId: string) => {
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
    safeStorage.setItem(
      "pending_favorites_array",
      JSON.stringify(newFavorites),
    );
    safeStorage.setItem("needs_user_sync", "true");
  }, [profile, user]);

  const toggleWatchLater = useCallback(async (contentId: string) => {
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
    safeStorage.setItem(
      "pending_watch_later_array",
      JSON.stringify(newWatchLater),
    );
    safeStorage.setItem("needs_user_sync", "true");
  }, [profile, user]);

  useEffect(() => {
    if (user && profile && navigator.onLine) {
      const runReconciliation = async () => {
        try {
          const reconciledCode = await ensureSingleAndValidReferralCode(user.uid, profile.referralCode);
          if (reconciledCode !== profile.referralCode) {
            setProfile((prev) => prev ? { ...prev, referralCode: reconciledCode } : null);
            const cached = safeStorage.getItem("profile_cache");
            if (cached) {
              const parsed = JSON.parse(cached);
              parsed.referralCode = reconciledCode;
              safeStorage.setItem("profile_cache", JSON.stringify(parsed));
            }
          }
        } catch (e) {
          console.error("Referral reconciliation error:", e);
        }
      };
      const sessionReconciledKey = `referral_reconciled_${user.uid}`;
      if (!sessionStorage.getItem(sessionReconciledKey)) {
        sessionStorage.setItem(sessionReconciledKey, "true");
        if (!profile.referralCode) {
          runReconciliation();
        }
      }
    }
  }, [user?.uid, profile?.uid]);

  const normalizedProfile = useMemo(() => {
    if (!profile) return null;
    return normalizeUserStatusAndExpiry(profile);
  }, [profile]);

  return (
    <AuthContext.Provider
      value={{
        user,
        profile: normalizedProfile,
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
