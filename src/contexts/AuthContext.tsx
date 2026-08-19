import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  useCallback,
} from "react";
import { auth, db, runWithNetwork } from "../firebase";
import { safeStorage } from "../utils/safeStorage";
import { isValidGmailAddress } from "../utils/emailValidation";
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
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (e) {}
    }
    return null;
  });
  const [loading, setLoading] = useState(() => {
    return !safeStorage.getItem("profile_cache");
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
      const title = isNewUser ? `Welcome to MovizNow, ${displayName}! 🎉` : `Welcome back, ${displayName}! 👋`;
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

      // Try writing to Firestore notification_chunks if admin user
      const userEmailLower = (userEmail || '').toLowerCase();
      const isAdminUser = [
        "asmatn628@gmail.com",
        "asmatullah9327@gmail.com",
        "kabirahmaddev@gmail.com",
        "wamoviesstation@gmail.com"
      ].includes(userEmailLower);

      if (isAdminUser) {
        const { doc, getDoc, serverTimestamp, writeBatch } = await import("firebase/firestore");
        const cid = "app_chunk_0";
        const chunkRef = doc(db, 'notification_chunks', cid);
        const chunkSnap = await getDoc(chunkRef);
        const chunkItems = chunkSnap.exists() ? chunkSnap.data()?.items || {} : {};
        const newChunkItems = { [id]: notifItem, ...chunkItems };

        const batch = writeBatch(db);
        batch.set(chunkRef, { items: newChunkItems, updatedAt: serverTimestamp() }, { merge: true });
        batch.set(doc(db, 'chunk_meta', 'versions'), { notifications: { version: Date.now(), latestAppChunkId: cid, latestChunkId: cid } }, { merge: true });
        await batch.commit();

        safeStorage.removeItem('cached_notifications_version');
      }
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

      const userRef = doc(db, "users", currentUser.uid);
      const cachedProfileStr = safeStorage.getItem("profile_cache");
      let localProfile = cachedProfileStr ? JSON.parse(cachedProfileStr) : null;

      // Only show loading if we have no profile data to show
      if (!profile && !localProfile) setLoading(true);

      try {
        const localVersionKey = `profile_version_${currentUser.uid}`;
        const localVersion = parseInt(
          safeStorage.getItem(localVersionKey) || "0",
          10,
        );

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
        const versionChanged =
          serverVersion > localVersion || localVersion === 0;

        let serverProfile: UserProfile | null = null;
        let docSnap;

        // 7. Always verify user UID in Firestore when online
        if (navigator.onLine) {
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

          if (modified || !mergedProfile.referralCode) {
            let newlyGenerated = false;
            if (!mergedProfile.referralCode) {
              mergedProfile.referralCode = generateReferralCode(currentUser.uid);
              newlyGenerated = true;
            }

            try {
              const pStr = safeStorage.getItem("pending_user_updates");
              let pAll = pStr ? JSON.parse(pStr) : {};
              pAll[currentUser.uid] = pAll[currentUser.uid] || {};
              
              if (modified) {
                if (mergedProfile.reported_links) pAll[currentUser.uid].reported_links = mergedProfile.reported_links;
                if (mergedProfile.movieRequests) pAll[currentUser.uid].movieRequests = mergedProfile.movieRequests;
              }
              if (newlyGenerated) {
                pAll[currentUser.uid].referralCode = mergedProfile.referralCode;
              }
              
              safeStorage.setItem("pending_user_updates", JSON.stringify(pAll));
            } catch (e) {
              console.error("Failed to queue modified profile fields", e);
            }
            
            safeStorage.setItem("needs_user_sync", "true");
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
                  
                  // Give the newly referred user 5 days and make them active
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
                    baseDate.setDate(baseDate.getDate() + 5);
                    mergedProfile.expiryDate = baseDate.toISOString();
                    userUpdatesToPush.expiryDate = mergedProfile.expiryDate;
                    
                    mergedProfile.status = "active";
                      userUpdatesToPush.status = "active";
                  }
                  
                  localStorage.removeItem("referral_code");
                  localStorage.setItem("referral_credit_message", "Your account is credited with 5 Days membership with referral code " + storedRefCode);
                  
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

            // Tier 1: Signup Reward (5 days)
            // Given immediately when the referred user joins (they are active for 5 days by default)
            if (!mergedProfile.signupRewardClaimed) {
              extensionDays += 5;
              updates.signupRewardClaimed = true;
            }

            // Tier 2: Activation Reward (5 days)
            // Given if the user is active AND has at least one order
            const hasBoughtMembership = (mergedProfile.orders && mergedProfile.orders.length > 0);
            if (hasBoughtMembership && !mergedProfile.activationRewardClaimed) {
              extensionDays += 5;
              updates.activationRewardClaimed = true;
            }

            if (extensionDays > 0) {
              const { writeBatch } = await import("firebase/firestore");
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

        // Strict rule: Only write to Firestore if forced or if it's the daily sync window (after 9 AM PKT)
        // If needsUserSync is true but it's not the daily sync time, it stays in local storage until next day
        const isLogin = justLoggedInRef.current || reason === "login";
        const isSignOut = reason === "logout";
        const shouldWrite =
          (serverProfile || localProfile) &&
          (isVersionMissing ||
            isLogin ||
            isSignOut ||
            force ||
            (hasLocalChanges && isDailySync));

        if (shouldWrite) {
          try {
            const { writeBatch } = await import("firebase/firestore");
            const batch = writeBatch(db);
            const newVersion = Date.now();

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

            updatesToPush.lastActive = new Date().toISOString();

            if (Object.keys(updatesToPush).length > 0) {
              batch.set(userRef, updatesToPush, { merge: true });
            }
            await batch.commit();

            if (isDailySync) localStorage.setItem(dailySyncKey, pktDate);
            safeStorage.setItem("needs_user_sync", "false");
            safeStorage.removeItem("pending_favorites_array");
            safeStorage.removeItem("pending_watch_later_array");
            safeStorage.removeItem("pending_orders_array");
            safeStorage.removeItem("pending_content_clicks");
            safeStorage.removeItem("pending_link_clicks");
            safeStorage.setItem(localVersionKey, newVersion.toString());
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

          // Auto-expire logic
          const expiryNow = new Date();
          if (
            (data.status === "active" || !data.status) &&
            data.role !== "owner" &&
            data.role !== "admin"
          ) {
            if (!data.expiryDate || data.expiryDate === "null" || data.expiryDate === "") {
              // Active status without an expiry date is invalid for regular users — mark as expired!
              updates.status = "expired";
              data.status = "expired";
              if (mergedProfile) {
                mergedProfile.status = "expired";
              }
            } else if (data.expiryDate !== "Lifetime") {
              // Parse expiry date by YYYY-MM-DD to avoid timezone shifting
              const expiryDateStr = data.expiryDate.split("T")[0];
              const parts = expiryDateStr.split("-");
              if (parts.length === 3) {
                // Create expiration boundary at 00:00:00 local time on the day AFTER the expiry date
                const expiryBoundary = new Date(
                  parseInt(parts[0]),
                  parseInt(parts[1]) - 1,
                  parseInt(parts[2]) + 1,
                );
                if (expiryNow >= expiryBoundary) {
                  let isReallyExpired = true;
                  if (!serverProfile && navigator.onLine) {
                    try {
                      const freshSnap = await getDoc(userRef);
                      if (freshSnap.exists()) {
                        const freshData = freshSnap.data() as UserProfile;
                        serverProfile = freshData;
                        if (freshData.expiryDate) {
                          const fExpStr = freshData.expiryDate.split("T")[0];
                          const fParts = fExpStr.split("-");
                          if (fParts.length === 3) {
                            const freshBoundary = new Date(
                              parseInt(fParts[0]),
                              parseInt(fParts[1]) - 1,
                              parseInt(fParts[2]) + 1,
                            );
                            if (
                              expiryNow < freshBoundary ||
                              freshData.status !== "active"
                            ) {
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
          if (
            Object.keys(updates).length > 0 &&
            (isDailySync ||
              isLogin ||
              isSignOut ||
              (force && reason !== "manual"))
          ) {
            try {
              const { writeBatch } = await import("firebase/firestore");
              const batch = writeBatch(db);
              batch.set(userRef, updates, { merge: true });
              await batch.commit();
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

          // Also check for and merge any old duplicate records (e.g., pending_... or duplicate email/phone docs)
          try {
            const searchRef = collection(db, "users");
            const findMatches = async (field: string, value: string) => {
              if (!value) return [];
              try {
                const q = query(searchRef, where(field, "==", value), limit(10));
                const snap = await getDocs(q);
                return snap.docs.filter((d) => d.id !== currentUser.uid);
              } catch (err) {
                return [];
              }
            };

            let matchDocs: any[] = [];
            const userEmail = currentUser.email || data.email;
            if (userEmail && !userEmail.endsWith("@moviznow.com")) {
              const emailMatches = await findMatches("email", userEmail);
              const lowerEmailMatches = await findMatches("email", userEmail.toLowerCase());
              matchDocs = [...matchDocs, ...emailMatches, ...lowerEmailMatches];
            }

            const userPhone = currentUser.phoneNumber || data.phone;
            const stdPhone = userPhone ? standardizePhone(userPhone) : "";
            if (stdPhone) {
              const phoneMatches = await findMatches("phone", stdPhone);
              const rawDigits = stdPhone.replace(/\D/g, "");
              matchDocs = [...matchDocs, ...phoneMatches];
              if (rawDigits) {
                let baseNumber = rawDigits;
                if (baseNumber.startsWith("92")) baseNumber = baseNumber.substring(2);
                if (baseNumber.startsWith("0")) baseNumber = baseNumber.substring(1);
                if (baseNumber) {
                  const baseMatches = await findMatches("phone", baseNumber);
                  const zeroMatches = await findMatches("phone", `0${baseNumber}`);
                  const plus92Matches = await findMatches("phone", `+92${baseNumber}`);
                  const dummyEmailMatches = await findMatches("email", `${baseNumber}@moviznow.com`);
                  matchDocs = [...matchDocs, ...baseMatches, ...zeroMatches, ...plus92Matches, ...dummyEmailMatches];
                }
              }
            }

            const uniqueMatchDocs = matchDocs.filter((docItem, idx, self) => idx === self.findIndex((t) => t.id === docItem.id));
            if (uniqueMatchDocs.length > 0) {
              const oldDocIds = uniqueMatchDocs.map((d) => d.id);
              console.log("Found duplicate documents to merge into existing profile:", oldDocIds);

              const origRole = data.role;
              const origStatus = data.status;
              const origExpiry = data.expiryDate;

              uniqueMatchDocs.forEach((oldDoc) => {
                const oldData = oldDoc.data() as UserProfile;
                const rolePriority: Record<string, number> = {
                  owner: 100, admin: 90, manager: 80, user_manager: 75, content_manager: 70, selected_content: 60, user: 10, trial: 5
                };
                const statusPriority: Record<string, number> = { active: 100, pending: 50, expired: 20, suspended: 0 };
                const getRoleRank = (r: string) => rolePriority[r] || 0;
                const getStatusRank = (s: string) => statusPriority[s] || 0;

                if (getRoleRank(oldData.role) > getRoleRank(data.role)) data.role = oldData.role;
                if (getStatusRank(oldData.status) > getStatusRank(data.status)) data.status = oldData.status;

                if (oldData.expiryDate === "Lifetime" || data.expiryDate === "Lifetime") {
                  data.expiryDate = "Lifetime";
                } else if (oldData.expiryDate && (!data.expiryDate || oldData.expiryDate > data.expiryDate)) {
                  data.expiryDate = oldData.expiryDate;
                }

                if ((!data.displayName || data.displayName.startsWith("User ")) && oldData.displayName && !oldData.displayName.startsWith("User ")) {
                  data.displayName = oldData.displayName;
                }
                if (!data.phone && oldData.phone) data.phone = oldData.phone;
                if ((!data.email || data.email.endsWith("@moviznow.com")) && oldData.email && !oldData.email.endsWith("@moviznow.com")) {
                  data.email = oldData.email;
                }
                if (!data.city && oldData.city) data.city = oldData.city;
                if (!data.managedBy && oldData.managedBy) data.managedBy = oldData.managedBy;

                data.favorites = Array.from(new Set([...(data.favorites || []), ...(oldData.favorites || [])]));
                data.watchLater = Array.from(new Set([...(data.watchLater || []), ...(oldData.watchLater || [])]));
                data.assignedContent = Array.from(new Set([...(data.assignedContent || []), ...(oldData.assignedContent || [])]));

                const existingOrders = data.orders || [];
                (oldData.orders || []).forEach((o: any) => {
                  if (!existingOrders.find((eo: any) => eo.id === o.id)) existingOrders.push(o);
                });
                data.orders = existingOrders;

                data.sessionsCount = (data.sessionsCount || 0) + (oldData.sessionsCount || 0);
                data.timeSpent = Math.max(data.timeSpent || 0, oldData.timeSpent || 0);
                if (oldData.createdAt && (!data.createdAt || oldData.createdAt < data.createdAt)) {
                  data.createdAt = oldData.createdAt;
                }
              });

              // Check if user is admin
              const userEmailLower = (currentUser.email || '').toLowerCase();
              const isUserAdmin = [
                "asmatn628@gmail.com",
                "asmatullah9327@gmail.com",
                "kabirahmaddev@gmail.com",
                "wamoviesstation@gmail.com"
              ].includes(userEmailLower) || origRole === 'admin' || origRole === 'owner';

              if (!isUserAdmin) {
                // Non-admins cannot update role/status/expiry directly in standard merge
                data.role = origRole;
                data.status = origStatus;
                data.expiryDate = origExpiry;
              }

              data.uid = currentUser.uid;
              const payloadToSave: any = { ...data };
              if (!isUserAdmin) {
                delete payloadToSave.role;
                delete payloadToSave.status;
                delete payloadToSave.expiryDate;
                delete payloadToSave.trialActivated;
                delete payloadToSave.managedBy;
                delete payloadToSave.permissions;
                delete payloadToSave.assignedContent;
              }

              const { writeBatch, deleteDoc, setDoc } = await import("firebase/firestore");
              const batch = writeBatch(db);
              batch.set(userRef, payloadToSave, { merge: true });
              await batch.commit();

              // Update version metadata safely
              try {
                const metaUpdates: Record<string, number> = { [currentUser.uid]: Date.now() };
                oldDocIds.forEach((oldId) => { metaUpdates[oldId] = -1; });
                await setDoc(doc(db, "chunk_meta", "versions"), { users: metaUpdates }, { merge: true });
              } catch (metaErr) {}

              // Clean up duplicate documents safely
              for (const oldId of oldDocIds) {
                try {
                  await deleteDoc(doc(db, "users", oldId));
                } catch (delErr) {
                  console.warn("Could not delete duplicate document:", oldId, delErr);
                }
              }
            }
          } catch (e) {
            console.error("Error merging duplicate records into existing account:", e);
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
                const betterStatus =
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
                    acc.lastActive && acc.lastActive > (data.lastActive || "")
                      ? acc.lastActive
                      : data.lastActive || acc.lastActive,
                };
              }, {} as any);
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

          const newProfile: UserProfile = {
            // Start with all aggregated data from old accounts
            ...mergedOldData,
            // Ensure identity fields match exactly what was used for this successful login
            uid: currentUser.uid,
            email: currentUser.email || mergedOldData.email || "",
            phone: standardizedUserPhone || mergedOldData.phone || "",
            displayName:
              (currentUser.displayName && currentUser.displayName.trim()) ||
              (mergedOldData.displayName && mergedOldData.displayName.trim()) ||
              (currentUser.email ? currentUser.email.split('@')[0] : '') ||
              (standardizedUserPhone ? `User (${standardizedUserPhone})` : `User ${currentUser.uid.slice(0, 6)}`),
            photoURL: currentUser.photoURL || mergedOldData.photoURL || "",
            referralCode: mergedOldData.referralCode || generateReferralCode(currentUser.uid),
            referredBy: referredByUid || mergedOldData.referredBy || null,
            signupRewardClaimed: isNewlyReferred || mergedOldData.signupRewardClaimed || false,
            hasReceivedReferralReward: isNewlyReferred || mergedOldData.hasReceivedReferralReward || false,
            activationRewardClaimed: mergedOldData.activationRewardClaimed || false,
            notificationRewardClaimed: mergedOldData.notificationRewardClaimed || false,
            pwaRewardClaimed: mergedOldData.pwaRewardClaimed || false,
            reviewRewardClaimed: mergedOldData.reviewRewardClaimed || false,
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
                  ? "user"
                  : mergedOldData.role || defaultRoleToSet,
            status:
              isOwner || isAdmin
                ? "active"
                : isNewlyReferred
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
                    baseDate.setDate(baseDate.getDate() + 5);
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
              const { setDoc } = await import("firebase/firestore");
              const metaUpdates: Record<string, number> = { [currentUser.uid]: Date.now() };
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
              const { writeBatch } = await import("firebase/firestore");
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
            (serverVersion || Date.now()).toString(),
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
              setProfile(cachedP);
              hasValidCachedProfile = true;
            }
          } catch (e) {}
        }

        const sessionKey = `last_session_start_${currentUser.uid}`;
        const dailySyncKey = `last_daily_sync_${currentUser.uid}`;
        const lastSyncDateStr = localStorage.getItem(dailySyncKey);
        const lastSessionStart = localStorage.getItem(sessionKey);
        const now = Date.now();
        const shiftedTime = new Date(now + (5 - 7) * 60 * 60 * 1000);
        const pktDate = `${shiftedTime.getUTCFullYear()}-${shiftedTime.getUTCMonth() + 1}-${shiftedTime.getUTCDate()}`;

        const isDailySync = lastSyncDateStr !== pktDate;

        // If user has no local cache or daily sync is due, fetch via getDoc once
        if (!hasValidCachedProfile || isDailySync) {
          refreshProfile(false, "auto").catch((err) => {
            console.warn("Initial daily profile sync failed:", err);
          });
        }

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
            let isOwnerUser =
              currentUser.email?.toLowerCase() === "asmatn628@gmail.com";
            try {
              const cachedProfileStr = safeStorage.getItem("profile_cache");
              if (cachedProfileStr) {
                const p = JSON.parse(cachedProfileStr);
                if (p.role === "owner") isOwnerUser = true;
              }
            } catch (e) {}

            logEvent("session_start", currentUser.uid, {}, true); // Log to GA, skip individual Firestore write
            localStorage.setItem(sessionKey, now.toString());

            if (!isOwnerUser) {
              pendingUpdates.sessionsCount = increment(1);
            }
            pendingUpdates.lastActive = new Date().toISOString();

            const { getDeviceDetails } = await import("../utils/deviceInfo");
            const deviceDetails = await getDeviceDetails();
            if (deviceDetails) {
              try {
                const pendingStr =
                  safeStorage.getItem("pending_user_updates") || "{}";
                let pendingAll = JSON.parse(pendingStr);
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

        // Add pending local state lists if daily sync applies or it's past 7AM and needs sync
        const needsSync = safeStorage.getItem("needs_user_sync") === "true";
        const isPast7AM = new Date(now + 5 * 3600000).getUTCHours() >= 7;
        if (isDailySync || (isPast7AM && needsSync)) {
          const pendingFavorites = safeStorage.getItem(
            "pending_favorites_array",
          );
          if (pendingFavorites)
            pendingUpdates.favorites = JSON.parse(pendingFavorites);

          const pendingWatchLater = safeStorage.getItem(
            "pending_watch_later_array",
          );
          if (pendingWatchLater)
            pendingUpdates.watchLater = JSON.parse(pendingWatchLater);

          const pendingOrders = safeStorage.getItem("pending_orders_array");
          if (pendingOrders) {
            const { arrayUnion } = await import("firebase/firestore");
            pendingUpdates.orders = arrayUnion(...JSON.parse(pendingOrders));
          }
        }

        let mergedPendingKeys = false;
        // When other user data is updating, include the pending user updates (like gender, age, device)
        if (
          Object.keys(pendingUpdates).length > 0 ||
          isDailySync ||
          (isPast7AM && needsSync)
        ) {
          const pendingUpdatesStr = safeStorage.getItem("pending_user_updates");
          if (pendingUpdatesStr) {
            try {
              const pendingAll = JSON.parse(pendingUpdatesStr);
              if (pendingAll[currentUser.uid]) {
                const myPending = pendingAll[currentUser.uid];
                // timeSpent is accumulated later so delete it to not mess up integer vs accumulation logic if any
                Object.assign(pendingUpdates, myPending);
                mergedPendingKeys = true;
              }
            } catch (e) {}
          }
        }

        const hasLocalProfile = !!safeStorage.getItem("profile_cache");
        if (Object.keys(pendingUpdates).length > 0 && hasLocalProfile) {
          try {
            const { writeBatch } = await import("firebase/firestore");
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

            if (mergedPendingKeys) {
              try {
                const pStr = safeStorage.getItem("pending_user_updates");
                if (pStr) {
                  const pAll = JSON.parse(pStr);
                  delete pAll[currentUser.uid];
                  safeStorage.setItem(
                    "pending_user_updates",
                    JSON.stringify(pAll),
                  );
                }
              } catch (e) {}
            }
          } catch (err) {
            console.error("Daily sync failed:", err);
          }
        }

        refreshProfile();
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
      localStorage.removeItem(`last_daily_sync_${result.user.uid}`);

      // Check if we need to link phone/email in Firestore
      const userRef = doc(db, "users", result.user.uid);
      const snap = await getDoc(userRef);
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
      if (snap.exists()) {
        docExists = true;
        const data = snap.data();
        updates.sessionId = localSessionId;
        if (!data.email && result.user.email) {
          updates.email = result.user.email;
        }
      }

      const applyUpdates = async () => {
        if (Object.keys(updates).length > 0) {
          try {
            const { setDoc } = await import("firebase/firestore");
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
      justLoggedInRef.current = true;
      const result = await signInWithEmailAndPassword(auth, email, password);

      // Force refresh app data
      safeStorage.removeItem("profile_cache");
      safeStorage.removeItem("cached_chunk_users_versions");
      safeStorage.removeItem("cached_all_users");
      localStorage.removeItem(`last_daily_sync_${result.user.uid}`);

      try {
        const { writeBatch } = await import("firebase/firestore");
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

        batch.update(doc(db, "users", result.user.uid), updates);
        await batch.commit();
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

      if (phone) {
        const standardizedPhone = standardizePhone(phone);
        sessionStorage.setItem("pending_signup_phone", standardizedPhone);
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
        if (authErr.code === "auth/operation-not-allowed") {
          throw new Error(
            "Email/Password accounts are not enabled. Please enable 'Email/Password' in the Firebase Auth console.",
          );
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
        sessionStorage.setItem("pending_signup_phone", standardizedPhone);
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
    const dailySyncKey = `last_daily_sync_${user.uid}`;

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
        const parts = data.expiryDate.split("T")[0].split("-");
        if (parts.length === 3) {
          const boundary = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]) + 1);
          if (new Date() < boundary && data.status !== "suspended") {
            data.status = "active";
          }
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
        const { writeBatch } = await import("firebase/firestore");
        let batch = writeBatch(db);
        batch.set(userRefPath, data, { merge: true });
        batch.set(doc(db, "chunk_meta", "versions"), {
          users: {
            [user.uid]: Date.now()
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

      const shiftedTime = new Date(Date.now() + (5 - 7) * 60 * 60 * 1000);
      const pktDate = `${shiftedTime.getUTCFullYear()}-${shiftedTime.getUTCMonth() + 1}-${shiftedTime.getUTCDate()}`;
      const isDailySync = safeStorage.getItem(dailySyncKey) !== pktDate;
      if (isDailySync) safeStorage.setItem(dailySyncKey, pktDate);
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
      const { writeBatch } = await import("firebase/firestore");
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
      localStorage.removeItem(`last_daily_sync_${auth.currentUser.uid}`);
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
        runReconciliation();
      }
    }
  }, [user?.uid, profile?.uid]);

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
