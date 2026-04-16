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

        if (!sessionStorage.getItem('session_started')) {
          sessionStorage.setItem('session_started', 'true');
          sessionStartTimeRef.current = Date.now();
          logEvent('session_start', currentUser.uid);
          
          // Update lastActive on session start
          updateDoc(userRef, { lastActive: new Date().toISOString() }).catch(console.error);
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
              
              // 1-Device Lock Check
              const localSessionId = getLocalSessionId();
              if (!hasAdminPrivileges && !justLoggedInRef.current) {
                if (data.sessionId && data.sessionId !== localSessionId) {
                  console.log("Logged in from another device. Logging out.");
                  signOut(auth);
                  setError("You have been logged out because your account was accessed from another device.");
                  return;
                } else if (!data.sessionId) {
                  updateDoc(userRef, { sessionId: localSessionId }).catch(console.error);
                  data.sessionId = localSessionId;
                }
              }

              // Auto-expire logic
              const now = new Date();
              if (data.status === 'active' && data.expiryDate && data.role !== 'owner') {
                const expiryDate = new Date(data.expiryDate);
                // Add 1 day to expiryDate so it expires on the next day
                expiryDate.setDate(expiryDate.getDate() + 1);
                if (expiryDate < now) {
                  try {
                    await updateDoc(userRef, { status: 'expired' });
                    data.status = 'expired';
                  } catch (err) {
                    console.error("Failed to auto-expire user:", err);
                  }
                }
              }

              if (isOwner && (data.role !== 'owner' || data.status !== 'active' || data.expiryDate !== 'Lifetime')) {
                try {
                  await updateDoc(userRef, { role: 'owner', status: 'active', expiryDate: 'Lifetime' });
                  setProfile({ ...data, role: 'owner', status: 'active', expiryDate: 'Lifetime' });
                } catch (err) {
                  console.error("Failed to update owner role:", err);
                  setProfile({ ...data, role: 'owner', status: 'active', expiryDate: 'Lifetime' }); // Set locally anyway
                }
              } else if (isAdmin && (data.role !== 'admin' || data.status !== 'active')) {
                try {
                  await updateDoc(userRef, { role: 'admin', status: 'active' });
                  setProfile({ ...data, role: 'admin', status: 'active' });
                } catch (err) {
                  console.error("Failed to update admin role:", err);
                  setProfile({ ...data, role: 'admin', status: 'active' }); // Set locally anyway
                }
              } else {
                const hasPassword = currentUser.providerData.some(p => p.providerId === 'password');
                if (!data.hasPassword && hasPassword) {
                  updateDoc(userRef, { hasPassword: true }).catch(console.error);
                  data.hasPassword = true;
                }
                setProfile(data);
              }
            } else {
              // Create new user profile
              const isOwner = currentUser.email === 'asmatn628@gmail.com';
              const isAdmin = currentUser.email === 'asmatullah9327@gmail.com';
              const roleToSet = isOwner ? 'owner' : isAdmin ? 'admin' : 'user';
              const hasPassword = currentUser.providerData.some(p => p.providerId === 'password');
              
              // Extract phone from dummy email if available
              let extractedPhone = '';
              if (currentUser.email?.endsWith('@moviznow.com')) {
                const phonePart = currentUser.email.replace('@moviznow.com', '');
                extractedPhone = standardizePhone(phonePart);
              }

              const newProfile: UserProfile = {
                uid: currentUser.uid,
                email: currentUser.email || '',
                phone: standardizePhone(currentUser.phoneNumber || extractedPhone),
                displayName: currentUser.displayName || '',
                photoURL: currentUser.photoURL || '',
                role: roleToSet,
                status: (isOwner || isAdmin) ? 'active' : 'pending',
                createdAt: new Date().toISOString(),
                sessionsCount: 1,
                timeSpent: 0,
                expiryDate: isOwner ? 'Lifetime' : null,
                hasPassword: hasPassword,
                sessionId: getLocalSessionId(),
              };

              try {
                await setDoc(userRef, newProfile);
              } catch (err) {
                console.error("Failed to create user profile:", err);
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

    // Track time spent periodically (every 5 minutes to reduce Firestore writes)
    const timeTrackerInterval = setInterval(() => {
      if (auth.currentUser && sessionStartTimeRef.current) {
        // Combine updates into a single write
        const userRef = doc(db, 'users', auth.currentUser.uid);
        updateDoc(userRef, {
          timeSpent: increment(5),
          lastActive: new Date().toISOString()
        }).then(() => {
          // Also log to GA4
          logEvent('time_spent', auth.currentUser!.uid, { duration: 5 });
        }).catch(console.error);
      }
    }, 5 * 60000);

    // Also track time spent when window unloads
    const handleBeforeUnload = () => {
      if (auth.currentUser && sessionStartTimeRef.current) {
        const timeSpentMs = Date.now() - sessionStartTimeRef.current;
        const timeSpentMinutes = Math.floor(timeSpentMs / 60000);
        if (timeSpentMinutes > 0) {
          // We can't reliably await async calls in beforeunload, but we can try
          // Usually beacon API is better, but this is a simple approach
          // The periodic interval is the main tracker
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      unsubscribe();
      if (unsubProfile) {
        unsubProfile();
      }
      clearInterval(timeTrackerInterval);
      window.removeEventListener('beforeunload', handleBeforeUnload);
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
