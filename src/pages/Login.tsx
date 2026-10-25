import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth, standardizePhone } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { useLanguage } from '../contexts/LanguageContext';
import { Mail, Phone, ArrowLeft, Eye, EyeOff, Lock, User as UserIcon, Loader2, Sparkles, ShieldCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { UserProfile } from '../types';
import { getUserDisplayName } from '../utils/userUtils';
import { safeStorage } from '../utils/safeStorage';

type LoginStep = 'social' | 'identifier' | 'password' | 'reset-password' | 'create_password' | 'verify_otp';

export function maskEmail(email?: string | null): string {
  if (!email || typeof email !== 'string' || !email.includes('@')) return '';
  const clean = email.trim().toLowerCase();
  if (clean.endsWith('@moviznow.com')) return '';
  const [local, domain] = clean.split('@');
  if (local.length <= 2) {
    return `${local[0] || '*'}***@${domain}`;
  }
  const first = local.slice(0, 2);
  const last = local.slice(-2);
  return `${first}***${last}@${domain}`;
}

export default function Login() {
  const { 
    user, 
    profile, 
    signInWithGoogle, 
    signInWithEmail, 
    signUpWithPhoneAndPassword,
    findUsersByEmailOrPhone,
    updateUserProfileData,
    isPhoneWhitelisted,
    getWhitelistedPhoneRecord,
    linkPhoneToUid,
    clearError,
    authLoading, 
    error 
  } = useAuth();
  const { settings } = useSettings();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const [step, setStep] = useState<LoginStep>('social');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [customError, setCustomError] = useState<React.ReactNode | null>(null);
  const [emailWarningShown, setEmailWarningShown] = useState(false);
  
  const [identifier, setIdentifier] = useState(''); // Email or Phone
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [optionalEmail, setOptionalEmail] = useState('');
  const [registeredUser, setRegisteredUser] = useState<UserProfile | null>(null);
  const [otp, setOtp] = useState('');
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [verifyToken, setVerifyToken] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [wrongPasswordCount, setWrongPasswordCount] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  useEffect(() => {
    if (location.state?.suspended) {
      setCustomError("Your account has been suspended. Please contact admin.");
    }
  }, [location.state]);

  useEffect(() => {
    if (step === 'create_password' && registeredUser && !registeredUser.hasPassword && !verifyToken) {
      if (registeredUser.email && !registeredUser.email.endsWith('@moviznow.com')) {
        setStep('verify_otp');
      }
    }
  }, [step, registeredUser, verifyToken]);

  // Persist target redirect in sessionStorage so it survives OAuth popups or page refreshes
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const redirectUrl = searchParams.get('redirect');
    const fromState = location.state?.from;
    let target = '';
    if (fromState) {
      if (typeof fromState === 'object' && fromState !== null && 'pathname' in fromState) {
        target = (fromState.pathname || '/') + (fromState.search || '') + (fromState.hash || '');
      } else if (typeof fromState === 'string') {
        target = fromState;
      }
    } else if (redirectUrl) {
      target = redirectUrl;
    }
    if (target && target !== '/login' && !target.startsWith('/login?') && target !== '/maintenance') {
      try {
        sessionStorage.setItem('moviz_auth_redirect', target);
      } catch (e) {}
    }
  }, [location]);

  useEffect(() => {
    // Only redirect if auth check has completed, there is a valid authenticated Firebase user, and their profile is successfully loaded
    if (!authLoading && user && profile && !location.state?.switch) {
      try {
        window.dispatchEvent(new Event('moviz_auth_state_changed'));
      } catch (e) {}

      // If user is suspended, don't redirect to home, just show error
      if (profile?.status === 'suspended') {
        setCustomError("Your account has been suspended. Please contact admin.");
        return;
      }

      // If user requires password reset, force them to reset it
      if (profile?.requirePasswordReset && step !== 'reset-password') {
        setStep('reset-password');
        return;
      }
      
      if (!profile?.requirePasswordReset) {
        const searchParams = new URLSearchParams(location.search);
        let redirectUrl = searchParams.get('redirect');
        let from = location.state?.from;

        if (!from) {
          try {
            const storedRedirect = sessionStorage.getItem('moviz_auth_redirect');
            if (storedRedirect) {
              from = storedRedirect;
              sessionStorage.removeItem('moviz_auth_redirect');
            }
          } catch (e) {}
        }
        
        if (!from && redirectUrl) {
          if (redirectUrl.startsWith('http://') || redirectUrl.startsWith('https://')) {
            try {
              const parsed = new URL(redirectUrl);
              from = parsed.pathname + parsed.search;
            } catch (e) {
              from = redirectUrl;
            }
          } else {
            from = redirectUrl;
          }
        }

        const userEmailLower = user.email?.toLowerCase();
        const isAdmin = [
          "asmatullah9327@gmail.com",
          "asmatn628@gmail.com",
          "kabirahmaddev@gmail.com",
          "wamoviesstation@gmail.com",
        ].includes(userEmailLower || "") || profile?.role === 'admin' || profile?.role === 'owner';

        if (!from) {
          from = isAdmin ? '/admin' : '/';
        }

        let targetPath: any = from;
        if (typeof from === 'object' && from !== null && 'pathname' in from) {
          targetPath = (from.pathname || '/') + (from.search || '') + (from.hash || '');
        }

        if (typeof targetPath === 'string' && (targetPath.startsWith('/http://') || targetPath.startsWith('/https://'))) {
          try {
            const parsed = new URL(targetPath.substring(1));
            targetPath = parsed.pathname + parsed.search;
          } catch (e) {
            targetPath = '/';
          }
        }

        // Do not redirect to /login
        if (typeof targetPath === 'string' && (targetPath === '/login' || targetPath.startsWith('/login?'))) {
          targetPath = isAdmin ? '/admin' : '/';
        }

        navigate(targetPath, { replace: true });
      }
    } else if (!authLoading && !user) {
      // User is genuinely not logged in (Guest). Ensure no stale redirect happens and purge orphaned cache.
      const cached = safeStorage.getItem('profile_cache');
      if (cached && !profile) {
        safeStorage.removeItem('profile_cache');
        safeStorage.removeItem('profile_cache_timestamp');
      }
    }
  }, [user, profile, authLoading, navigate, location, step]);

  useEffect(() => {
    if (error) {
      setIsLoggingIn(false);
    }
  }, [error]);

  const formatIdentifier = (input: string) => {
    const trimmed = input.trim();
    // If it looks like a WhatsApp number (contains digits, maybe starts with + or 0)
    if (/^[\d+]+$/.test(trimmed)) {
      return standardizePhone(trimmed);
    }
    return trimmed.toLowerCase();
  };

  const handleGoogleLogin = async () => {
    setIsLoggingIn(true);
    try {
      await signInWithGoogle();
    } catch {
      // Error handled in AuthContext
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setCustomError(null);
    if (!otp.trim() || otp.trim().length < 6) {
      setCustomError("Please enter the complete 6-digit verification code.");
      return;
    }
    setOtpVerifying(true);
    try {
      const res = await fetch("/api/email/verify-login-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: registeredUser?.uid,
          otp: otp.trim(),
          phone: identifier,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Verification failed");

      setVerifyToken(data.verifyToken);
      setPassword('');
      setConfirmPassword('');
      setStep('create_password');
    } catch (err: any) {
      setCustomError(err.message || "Invalid or expired verification code.");
    } finally {
      setOtpVerifying(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0 || !registeredUser?.email || !registeredUser?.uid) return;
    clearError();
    setCustomError(null);
    setOtpSending(true);
    try {
      const res = await fetch("/api/email/send-login-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: identifier,
          email: registeredUser.email,
          uid: registeredUser.uid,
          displayName: registeredUser.displayName,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to resend code");
      setResendCooldown(30);
    } catch (err: any) {
      setCustomError(err.message || "Failed to resend verification code.");
    } finally {
      setOtpSending(false);
    }
  };

  const handleIdentifierNext = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setCustomError(null);
    setIsLoggingIn(true);
    
    try {
      const rawTrimmed = identifier.trim();
      const isEmail = rawTrimmed.includes('@');
      const isMoviznowEmail = rawTrimmed.toLowerCase().endsWith('@moviznow.com');
      const isPhone = !isEmail || isMoviznowEmail;
      const formatted = formatIdentifier(rawTrimmed);

      // 1. WhatsApp / Phone Number Flow
      if (isPhone) {
        const phonePart = isMoviznowEmail ? rawTrimmed.split('@')[0] : rawTrimmed;
        const standardizedPhone = standardizePhone(phonePart) || phonePart;

        // Step 1: Check the entered phone number in whitelist
        let phoneRecord = await getWhitelistedPhoneRecord(standardizedPhone, true);
        if (!phoneRecord.isWhitelisted && phonePart !== standardizedPhone) {
          const altRecord = await getWhitelistedPhoneRecord(phonePart, true);
          if (altRecord.isWhitelisted) {
            phoneRecord = altRecord;
          }
        }

        if (!phoneRecord.isWhitelisted) {
          setCustomError(
            <div className="flex flex-col gap-3">
              <p>This WhatsApp number is not authorized.</p>
              <div className="flex flex-col gap-2 mt-2">
                <button 
                  type="button"
                  onClick={handleGoogleLogin}
                  className="w-full bg-emerald-500 text-white py-2.5 rounded-xl font-medium hover:bg-emerald-600 transition-colors flex items-center justify-center gap-2 shadow-sm"
                >
                  Use Google <span className="text-[10px] uppercase tracking-wider opacity-90 bg-white/20 px-1.5 py-0.5 rounded-md">(Recommended)</span>
                </button>
                {settings?.isAdminContactEnabled !== false && (
                  <button 
                    type="button"
                    onClick={() => {
                      let supportPhone = settings?.supportNumber || '3416286423';
                      if (supportPhone.startsWith('92')) supportPhone = supportPhone.substring(2);
                      if (supportPhone.startsWith('0')) supportPhone = supportPhone.substring(1);
                      const adminPhone = `92${supportPhone}`;
                      const contactName = getUserDisplayName(user || { phone: standardizedPhone });
                      const message = `${t("Assalam O Alaikum! Admin")},\n\n${t("Name")}: ${contactName}\n${t("Email")}: ${user?.email || 'N/A'}\n${t("Phone")}: ${standardizedPhone}\n${t("Role & Status")}: ${t("Unknown")}, ${t("Unknown")}\n\n${t("Your message/question:")}\n${t("I need help logging in.")}`;
                      window.open(`https://wa.me/${adminPhone}?text=${encodeURIComponent(message)}`, '_blank');
                    }}
                    className="w-full bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white border border-zinc-200 dark:border-zinc-700 py-2.5 rounded-xl font-medium hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
                  >
                    Contact Admin
                  </button>
                )}
              </div>
            </div>
          );
          setIsLoggingIn(false);
          return;
        }

        // WhatsApp number is whitelisted!
        setIdentifier(standardizedPhone);

        // Step 2: Check UID (if not found then create account)
        const accountUid = (phoneRecord.uid && !phoneRecord.uid.startsWith('pending_')) ? phoneRecord.uid : null;

        if (!accountUid) {
          // UID is NOT found: proceed to create account
          setRegisteredUser(null);
          setDisplayName('');
          setOptionalEmail('');
          setPassword('');
          setConfirmPassword('');
          setVerifyToken('');
          setStep('create_password');
          setIsLoggingIn(false);
          return;
        }

        // UID IS found: proceed with UID!
        // Step 3: Check other details by UID (name, Email, has password)
        let resolvedDisplayName = '';
        let resolvedEmail = '';
        let resolvedHasPassword = false;
        let resolvedRole = 'user';
        let resolvedStatus = 'active';

        // 3a. Check phoneUser from getWhitelistedPhoneRecord
        if (phoneRecord.phoneUser) {
          if (phoneRecord.phoneUser.displayName) resolvedDisplayName = phoneRecord.phoneUser.displayName;
          if (phoneRecord.phoneUser.email && !phoneRecord.phoneUser.email.endsWith('@moviznow.com')) {
            resolvedEmail = phoneRecord.phoneUser.email;
          }
          if (phoneRecord.phoneUser.hasPassword !== undefined) {
            resolvedHasPassword = Boolean(phoneRecord.phoneUser.hasPassword);
          }
          if (phoneRecord.phoneUser.role) resolvedRole = phoneRecord.phoneUser.role;
          if (phoneRecord.phoneUser.status) resolvedStatus = phoneRecord.phoneUser.status;
        }

        // 3b. Safe read from Firestore doc if permissions permit
        if (!resolvedEmail || !resolvedDisplayName) {
          try {
            const { doc, getDoc } = await import('firebase/firestore');
            const { db } = await import('../firebase');
            const snap = await getDoc(doc(db, 'users', accountUid));
            if (snap.exists()) {
              const uData = snap.data();
              if (uData.displayName) resolvedDisplayName = uData.displayName;
              if (uData.email && !uData.email.endsWith('@moviznow.com')) resolvedEmail = uData.email;
              if (uData.hasPassword !== undefined) resolvedHasPassword = Boolean(uData.hasPassword);
              if (uData.role) resolvedRole = uData.role;
              if (uData.status) resolvedStatus = uData.status;
            }
          } catch (e) {
            // Permission denied is caught safely and does not break the flow
          }
        }

        // 3c. Check client cache (cached_all_users / profile_cache)
        if (!resolvedEmail || !resolvedDisplayName) {
          try {
            const cachedStr = safeStorage.getItem('cached_all_users');
            if (cachedStr) {
              const list = JSON.parse(cachedStr);
              const found = Array.isArray(list) ? list.find((u: any) => u.uid === accountUid) : null;
              if (found) {
                if (!resolvedDisplayName && found.displayName) resolvedDisplayName = found.displayName;
                if (!resolvedEmail && found.email && !found.email.endsWith('@moviznow.com')) resolvedEmail = found.email;
                if (!resolvedHasPassword && found.hasPassword) resolvedHasPassword = Boolean(found.hasPassword);
              }
            }
          } catch (e) {}

          try {
            const pStr = safeStorage.getItem('profile_cache');
            if (pStr) {
              const p = JSON.parse(pStr);
              if (p.uid === accountUid) {
                if (!resolvedDisplayName && p.displayName) resolvedDisplayName = p.displayName;
                if (!resolvedEmail && p.email && !p.email.endsWith('@moviznow.com')) resolvedEmail = p.email;
                if (!resolvedHasPassword && p.hasPassword) resolvedHasPassword = Boolean(p.hasPassword);
              }
            }
          } catch (e) {}
        }

        // 3d. Fallback for known owner UID / phone
        const stdDigits = standardizedPhone.replace(/\D/g, '');
        if (accountUid === "H0PFpJilsgPNVt6Cc2Y9czwATCs1" || stdDigits.endsWith("3416286423")) {
          if (!resolvedDisplayName) resolvedDisplayName = "Asmat Ullah";
          if (!resolvedEmail) resolvedEmail = "asmatn628@gmail.com";
          resolvedRole = "owner";
        }

        // Clean up resolved display name & email
        const isGenericName = resolvedDisplayName.startsWith('User (') || resolvedDisplayName === 'Movie Fan' || resolvedDisplayName === 'No Name';
        const cleanName = !isGenericName ? resolvedDisplayName : '';
        const cleanEmail = (resolvedEmail && !resolvedEmail.endsWith('@moviznow.com') && resolvedEmail.includes('@')) ? resolvedEmail.trim().toLowerCase() : '';

        const activeUserObj: UserProfile = {
          uid: accountUid,
          phone: standardizedPhone,
          displayName: cleanName,
          email: cleanEmail || `${stdDigits}@moviznow.com`,
          hasPassword: resolvedHasPassword,
          role: resolvedRole as any,
          status: resolvedStatus as any,
          createdAt: phoneRecord.phoneUser?.createdAt || new Date().toISOString(),
        };

        setRegisteredUser(activeUserObj);
        setDisplayName(cleanName);
        setOptionalEmail(cleanEmail);

        // Step 4: If has password then enter password to login
        if (resolvedHasPassword) {
          setStep('password');
          setIsLoggingIn(false);
          return;
        }

        // Step 5: If not has any password then proceed for create password,
        // BUT has email then verify OTP first!
        if (cleanEmail) {
          try {
            setOtpSending(true);
            const sendRes = await fetch("/api/email/send-login-otp", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                phone: standardizedPhone,
                email: cleanEmail,
                uid: accountUid,
                displayName: cleanName || "Movie Fan",
                emailSettings: settings?.emailSettings,
              }),
            });
            const sendData = await sendRes.json();
            if (!sendRes.ok) throw new Error(sendData.error || "Failed to send verification code");
            setResendCooldown(30);
          } catch (otpErr: any) {
            console.warn("Failed to send initial OTP:", otpErr);
            setCustomError(otpErr?.message || "Failed to send verification code. Please try again.");
          } finally {
            setOtpSending(false);
          }
          setOtp('');
          setVerifyToken('');
          setStep('verify_otp');
          setIsLoggingIn(false);
          return;
        }

        // Step 6: If email also Missing then ask to enter email address with creating password,
        // but don't ask for email if exist!
        setPassword('');
        setConfirmPassword('');
        setVerifyToken('');
        setStep('create_password');
        setIsLoggingIn(false);
        return;
      }

      // 2. Regular Email Flow
      const [foundUsersRaw, foundUsersFormatted] = await Promise.all([
        findUsersByEmailOrPhone(rawTrimmed),
        rawTrimmed !== formatted ? findUsersByEmailOrPhone(formatted) : Promise.resolve([])
      ]);
      
      const allFound = [...foundUsersRaw, ...foundUsersFormatted];
      const uniqueFound = allFound.filter((v, i, a) => a.findIndex(t => t.uid === v.uid) === i);
      let foundUser = uniqueFound.length > 0 ? uniqueFound[0] : null;

      if (foundUser) {
        const resolvedName = getUserDisplayName(foundUser);
        const isGenericName = resolvedName.startsWith('User (') || resolvedName === 'Movie Fan' || resolvedName === 'No Name';
        const cleanName = !isGenericName ? resolvedName : (foundUser.displayName || (foundUser.email ? foundUser.email.split('@')[0] : ''));
        const cleanEmail = (foundUser.email && !foundUser.email.endsWith('@moviznow.com')) ? foundUser.email : '';

        const fullFoundUser = {
          ...foundUser,
          displayName: cleanName || foundUser.displayName || 'Movie Fan',
          email: foundUser.email || cleanEmail,
        };

        setRegisteredUser(fullFoundUser);
        setDisplayName(cleanName);
        setOptionalEmail(cleanEmail);

        if (foundUser.hasPassword) {
          setStep('password');
        } else {
          // Google user without password logging in with email: MUST verify OTP first
          if (cleanEmail) {
            try {
              setOtpSending(true);
              const sendRes = await fetch("/api/email/send-login-otp", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  phone: foundUser.phone || formatIdentifier(rawTrimmed),
                  email: cleanEmail,
                  uid: foundUser.uid,
                  displayName: cleanName || foundUser.displayName,
                }),
              });
              const sendData = await sendRes.json();
              if (!sendRes.ok) throw new Error(sendData.error || "Failed to send verification code");
              setResendCooldown(30);
            } catch (otpErr: any) {
              console.warn("Failed to send initial OTP:", otpErr);
              setCustomError(otpErr?.message || "Failed to send verification code. Please try again.");
            } finally {
              setOtpSending(false);
            }
            setOtp('');
            setVerifyToken('');
            setStep('verify_otp');
            setIsLoggingIn(false);
            return;
          } else {
            setPassword('');
            setConfirmPassword('');
            setVerifyToken('');
            setStep('create_password');
          }
        }
      } else {
        setRegisteredUser(null);
        setDisplayName('');
        setOptionalEmail('');
        setPassword('');
        setConfirmPassword('');
        setVerifyToken('');
        setStep('create_password');
      }
    } catch (err) {
      console.error("Identifier next error:", err);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setCustomError(null);
    setIsLoggingIn(true);
    try {
      const isGoogleUser = Boolean(
        registeredUser && (
          registeredUser.provider === 'google.com' ||
          (registeredUser as any).isGoogleUser === true ||
          (registeredUser as any).providerId === 'google.com' ||
          (Array.isArray((registeredUser as any).providerData) && (registeredUser as any).providerData.some((p: any) => p?.providerId === 'google.com'))
        )
      );

      if (!isGoogleUser) {
        const phoneToCheck = registeredUser?.phone || (identifier.includes('@') ? (identifier.toLowerCase().endsWith('@moviznow.com') ? identifier.split('@')[0] : '') : identifier);
        if (phoneToCheck) {
          let isWhitelisted = await isPhoneWhitelisted(phoneToCheck, true);
          if (!isWhitelisted) {
            const std = standardizePhone(phoneToCheck);
            if (std && std !== phoneToCheck) {
              isWhitelisted = await isPhoneWhitelisted(std, true);
            }
          }
          if (!isWhitelisted) {
            setCustomError("This WhatsApp number is not authorized. Please contact admin.");
            setIsLoggingIn(false);
            return;
          }
        }
      }

      // Use the WhatsApp number / email to authenticate
      const loginCandidates: string[] = [];
      if (registeredUser?.email && !registeredUser.email.endsWith('@moviznow.com')) {
        loginCandidates.push(registeredUser.email);
      }
      if (identifier && !loginCandidates.includes(identifier)) {
        loginCandidates.push(identifier);
      }

      let loggedIn = false;
      let lastErr: any = null;
      for (const cand of loginCandidates) {
        try {
          await signInWithEmail(cand, password);
          loggedIn = true;
          setWrongPasswordCount(0);
          break;
        } catch (err: any) {
          lastErr = err;
          if (err?.code === 'auth/wrong-password') {
            break;
          }
        }
      }

      if (!loggedIn && lastErr) {
        throw lastErr;
      }
    } catch (err: any) {
      setIsLoggingIn(false);
      setWrongPasswordCount(prev => prev + 1);
    }
  };

  const handleForgotPassword = async () => {
    if (registeredUser?.email && !registeredUser.email.endsWith('@moviznow.com')) {
      try {
        const { getAuth, sendPasswordResetEmail } = await import('firebase/auth');
        await sendPasswordResetEmail(getAuth(), registeredUser.email);
        alert('A password reset link has been sent to your email.');
      } catch (error: any) {
        console.error("Error sending reset email:", error);
        setCustomError(error.message || 'Failed to send reset email.');
      }
    } else {
      if (settings?.isAdminContactEnabled === false) {
        alert("Password reset via admin contact is currently disabled.");
        return;
      }
      // Open WhatsApp to admin
      let supportPhone = settings?.supportNumber || '3416286423';
      if (supportPhone.startsWith('92')) supportPhone = supportPhone.substring(2);
      if (supportPhone.startsWith('0')) supportPhone = supportPhone.substring(1);
      const adminPhone = `92${supportPhone}`;
      const contactName = getUserDisplayName(registeredUser || { phone: identifier });
      const message = `Assalam O Alaikum! Admin,\n\nName: ${contactName}\nEmail: ${registeredUser?.email || 'N/A'}\nPhone: ${registeredUser?.phone || identifier}\nRole & Status: ${String(registeredUser?.role || 'Unknown').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}, ${String(registeredUser?.status || 'Unknown').replace(/\b\w/g, c => c.toUpperCase())}\n\n${t("Your message/question:")}\n${t("I forgot my password and need help resetting it.")}`;
      window.open(`https://wa.me/${adminPhone}?text=${encodeURIComponent(message)}`, '_blank');
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    setCustomError(null);
    setIsLoggingIn(true);
    try {
      await updateUserProfileData({ requirePasswordReset: false }, newPassword);
      // Success, profile listener will handle navigation
    } catch (err) {
      setIsLoggingIn(false);
    }
  };

  const isExistingAccount = Boolean(
    registeredUser && (
      (!registeredUser.uid || !registeredUser.uid.startsWith('pending_')) &&
      Boolean(registeredUser.uid)
    )
  );

  const existingDisplayName = (registeredUser?.displayName || displayName || '').trim();
  const hasExistingName = Boolean(
    existingDisplayName &&
    existingDisplayName !== 'Movie Fan' &&
    existingDisplayName !== 'No Name' &&
    existingDisplayName !== 'null' &&
    existingDisplayName !== 'undefined' &&
    !existingDisplayName.startsWith('User (')
  );

  const existingEmail = (registeredUser?.email || optionalEmail || '').trim();
  const hasExistingEmail = Boolean(
    existingEmail &&
    !existingEmail.endsWith('@moviznow.com') &&
    existingEmail.includes('@')
  );

  if (authLoading) return null;

  return (
    <div className="min-h-screen relative overflow-hidden bg-slate-50 dark:bg-zinc-950 flex flex-col items-center justify-center text-zinc-900 dark:text-white p-4 transition-colors duration-300">
      {/* Animated Ambient Background Lighting */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          animate={{
            scale: [1, 1.25, 1],
            opacity: [0.25, 0.45, 0.25],
            x: [0, 40, 0],
            y: [0, -30, 0],
          }}
          transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -top-32 -left-32 w-96 h-96 bg-emerald-500/20 dark:bg-emerald-500/25 rounded-full blur-3xl"
        />
        <motion.div
          animate={{
            scale: [1, 1.3, 1],
            opacity: [0.2, 0.4, 0.2],
            x: [0, -40, 0],
            y: [0, 40, 0],
          }}
          transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
          className="absolute -bottom-32 -right-32 w-96 h-96 bg-teal-500/20 dark:bg-emerald-600/20 rounded-full blur-3xl"
        />
        <div className="absolute inset-0 bg-[radial-gradient(#334155_1px,transparent_1px)] dark:bg-[radial-gradient(#27272a_1px,transparent_1px)] [background-size:24px_24px] opacity-25 pointer-events-none" />
      </div>

      {/* Main Glass Card with Spring Motion */}
      <motion.div 
        initial={{ opacity: 0, y: 24, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="max-w-md w-full bg-white/90 dark:bg-zinc-900/90 backdrop-blur-2xl rounded-3xl p-8 shadow-2xl shadow-emerald-950/10 dark:shadow-emerald-950/30 border border-zinc-200/80 dark:border-zinc-800/80 relative z-10 overflow-hidden"
      >
        {/* Sleek Top Glow Accent Line */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-600" />

        {/* Logo and Header Section */}
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="flex flex-col items-center mb-7 text-center"
        >
          <div className="relative mb-3.5 group">
            <motion.div 
              animate={{ rotate: [0, 5, -5, 0] }}
              transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute -inset-2 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-2xl blur-lg opacity-25 group-hover:opacity-50 transition duration-500"
            />
            <div className="relative bg-white dark:bg-zinc-950 p-3 rounded-2xl border border-zinc-200/80 dark:border-zinc-800/80 shadow-md flex items-center justify-center">
              <img src="/Blacklogo.svg" alt="Logo" className="w-auto h-16 block dark:hidden object-contain" />
              <img src="/Whitelogo.svg" alt="Logo" className="w-auto h-16 hidden dark:block object-contain" />
            </div>
          </div>
          
          <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-500 bg-clip-text text-transparent">
            {settings?.headerText || 'MovizNow'}
          </h1>
          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mt-1 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-emerald-500 animate-pulse" />
            Your ultimate movies & series destination
          </p>
        </motion.div>

        {/* Animated Error Container */}
        <AnimatePresence mode="wait">
          {(error || customError) && !isLoggingIn && (
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.96 }}
              transition={{ duration: 0.2 }}
              className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-600 dark:text-red-400 text-sm shadow-sm"
            >
              {customError || error}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Step Views with AnimatePresence */}
        <AnimatePresence mode="wait">
          {step === 'social' && (
            <motion.div
              key="social-step"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
              className="space-y-3.5"
            >
              <motion.button
                whileHover={{ scale: 1.015, y: -1 }}
                whileTap={{ scale: 0.985 }}
                onClick={handleGoogleLogin}
                disabled={isLoggingIn}
                className="w-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-semibold py-3.5 px-4 rounded-xl hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-all duration-200 flex items-center justify-center gap-3 disabled:opacity-70 disabled:cursor-not-allowed shadow-md shadow-zinc-950/10 dark:shadow-none"
              >
                {isLoggingIn ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin text-emerald-500" />
                    <span>Logging in...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
                      <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                    </svg>
                    <span>Continue with Google</span>
                  </>
                )}
              </motion.button>

              {settings?.isPhoneLoginEnabled !== false && (
                <motion.button
                  whileHover={{ scale: 1.015, y: -1 }}
                  whileTap={{ scale: 0.985 }}
                  onClick={() => { clearError(); setStep('identifier'); }}
                  className="w-full bg-white dark:bg-zinc-800/90 text-zinc-900 dark:text-white border border-zinc-200 dark:border-zinc-700/80 font-semibold py-3.5 px-4 rounded-xl hover:bg-emerald-500/5 hover:border-emerald-500/40 dark:hover:bg-zinc-800 transition-all duration-200 flex items-center justify-center gap-3 shadow-sm"
                >
                  <Phone className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                  <span>Continue with WhatsApp Number</span>
                </motion.button>
              )}

              <div className="relative flex items-center py-2">
                <div className="flex-grow border-t border-zinc-200 dark:border-zinc-800"></div>
                <span className="flex-shrink-0 mx-4 text-zinc-400 text-xs font-semibold uppercase tracking-wider">or</span>
                <div className="flex-grow border-t border-zinc-200 dark:border-zinc-800"></div>
              </div>

              <motion.button
                whileHover={{ scale: 1.015 }}
                whileTap={{ scale: 0.985 }}
                onClick={() => navigate('/')}
                className="w-full bg-zinc-100 dark:bg-zinc-800/50 text-zinc-600 dark:text-zinc-300 font-semibold py-3 px-4 rounded-xl hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-all duration-200 flex items-center justify-center gap-2 text-sm"
              >
                Explore as Guest
              </motion.button>
            </motion.div>
          )}

          {step === 'identifier' && settings?.isPhoneLoginEnabled !== false && (
            <motion.form
              key="identifier-step"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
              onSubmit={handleIdentifierNext}
              className="space-y-4"
            >
              <button 
                type="button"
                onClick={() => setStep('social')} 
                className="flex items-center gap-2 text-xs font-semibold text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors mb-2 group"
              >
                <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" /> Back
              </button>

              <div>
                <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1.5">WhatsApp Number</label>
                <div className="relative group">
                  <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 group-focus-within:text-emerald-500 transition-colors" />
                  <input
                    type="text"
                    required
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    className="w-full bg-white dark:bg-zinc-950/80 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-11 pr-4 py-3.5 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                    placeholder="0311..."
                  />
                </div>
                <p className="text-[11px] text-zinc-400 mt-1.5 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                  For WhatsApp numbers, +92 will be added automatically if missing.
                </p>
              </div>

              <motion.button
                whileHover={{ scale: 1.015 }}
                whileTap={{ scale: 0.985 }}
                type="submit"
                disabled={isLoggingIn}
                className="w-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-semibold py-3.5 px-4 rounded-xl hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-all duration-200 disabled:opacity-70 shadow-md shadow-zinc-950/10 dark:shadow-none flex items-center justify-center gap-2"
              >
                {isLoggingIn ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
                    <span>Checking...</span>
                  </>
                ) : (
                  'Next'
                )}
              </motion.button>
            </motion.form>
          )}

          {step === 'password' && (
            <motion.form
              key="password-step"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
              onSubmit={handlePasswordLogin}
              className="space-y-4"
            >
              <button 
                type="button"
                onClick={() => { setStep('identifier'); setWrongPasswordCount(0); }} 
                className="flex items-center gap-2 text-xs font-semibold text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors mb-2 group"
              >
                <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" /> Back
              </button>

              <div className="flex items-center gap-3.5 p-3.5 bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-500/20 rounded-2xl mb-2">
                <div className="w-10 h-10 rounded-full bg-emerald-500/15 flex items-center justify-center text-emerald-500 flex-shrink-0">
                  <UserIcon className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">Welcome back,</p>
                  <p className="text-sm font-semibold truncate text-zinc-900 dark:text-white">{registeredUser?.displayName || identifier}</p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1.5">Password</label>
                <div className="relative group">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 group-focus-within:text-emerald-500 transition-colors" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-white dark:bg-zinc-950/80 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-11 pr-11 py-3.5 text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <motion.button
                whileHover={{ scale: 1.015 }}
                whileTap={{ scale: 0.985 }}
                type="submit"
                disabled={isLoggingIn}
                className="w-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-semibold py-3.5 px-4 rounded-xl hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-all duration-200 disabled:opacity-70 shadow-md shadow-zinc-950/10 dark:shadow-none flex items-center justify-center gap-2"
              >
                {isLoggingIn ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
                    <span>Logging in...</span>
                  </>
                ) : (
                  'Login'
                )}
              </motion.button>
              
              {wrongPasswordCount > 0 && (
                <motion.div 
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-4 text-center p-3 bg-red-500/5 dark:bg-red-500/10 border border-red-500/20 rounded-xl"
                >
                  <p className="text-xs text-red-500 mb-2">Incorrect password. Contact admin for reset password.</p>
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    className="text-xs text-emerald-500 font-semibold hover:underline inline-flex items-center gap-1"
                  >
                    Forgot Password? (WhatsApp Admin)
                  </button>
                </motion.div>
              )}
            </motion.form>
          )}

          {step === 'verify_otp' && (
            <motion.form
              key="verify-otp-step"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
              onSubmit={handleVerifyOtp}
              className="space-y-4"
            >
              <button 
                type="button"
                onClick={() => { setStep('identifier'); setOtp(''); setCustomError(null); }} 
                className="flex items-center gap-2 text-xs font-semibold text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors mb-2 group"
              >
                <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" /> Back
              </button>

              <div className="text-center mb-3">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-500 mx-auto flex items-center justify-center mb-3">
                  <ShieldCheck className="w-6 h-6 text-emerald-500" />
                </div>
                <h2 className="text-lg font-bold">Verify Your Identity</h2>
                <p className="text-xs text-zinc-500 mt-1 max-w-xs mx-auto">
                  To set up a password for WhatsApp login, please enter the 6-digit verification code sent to your registered email:
                </p>
                {registeredUser?.email && (
                  <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mt-1">
                    {maskEmail(registeredUser.email)}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1.5 text-center">
                  6-Digit Verification Code
                </label>
                <div className="relative group">
                  <input
                    type="text"
                    required
                    maxLength={6}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete="one-time-code"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="w-full bg-white dark:bg-zinc-950/80 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3.5 text-center text-2xl font-mono tracking-[0.5em] text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-bold"
                    placeholder="••••••"
                    autoFocus
                  />
                </div>
                <p className="text-[11px] text-zinc-400 mt-1.5 text-center">
                  The code expires in 10 minutes. Check your spam/junk folder if needed.
                </p>
              </div>

              <motion.button
                whileHover={{ scale: 1.015 }}
                whileTap={{ scale: 0.985 }}
                type="submit"
                disabled={otpVerifying || otp.trim().length < 6}
                className="w-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-semibold py-3.5 px-4 rounded-xl hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-all duration-200 disabled:opacity-60 shadow-md shadow-zinc-950/10 dark:shadow-none flex items-center justify-center gap-2"
              >
                {otpVerifying ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
                    <span>Verifying Code...</span>
                  </>
                ) : (
                  'Verify Code'
                )}
              </motion.button>

              <div className="text-center pt-2">
                {resendCooldown > 0 ? (
                  <p className="text-xs text-zinc-400 font-medium">
                    Resend code in <span className="text-emerald-500 font-mono font-bold">{resendCooldown}s</span>
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={handleResendOtp}
                    disabled={otpSending}
                    className="text-xs text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 font-semibold transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
                  >
                    {otpSending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    Didn't receive code? Resend Code
                  </button>
                )}
              </div>
            </motion.form>
          )}

          {step === 'create_password' && (
            <motion.form 
              key="create-password-step"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
              onSubmit={async (e) => {
                e.preventDefault();
                clearError();
                setCustomError(null);
                setIsLoggingIn(true);
                
                const isExistingAccount = Boolean(
                  registeredUser && (
                    (!registeredUser.uid || !registeredUser.uid.startsWith('pending_')) &&
                    Boolean(registeredUser.uid)
                  )
                );

                const existingDisplayName = (registeredUser?.displayName || displayName || '').trim();
                const hasExistingName = Boolean(
                  existingDisplayName &&
                  existingDisplayName !== 'Movie Fan' &&
                  existingDisplayName !== 'No Name' &&
                  existingDisplayName !== 'null' &&
                  existingDisplayName !== 'undefined' &&
                  !existingDisplayName.startsWith('User (')
                );

                const existingEmail = (registeredUser?.email || optionalEmail || '').trim();
                const hasExistingEmail = Boolean(
                  existingEmail &&
                  !existingEmail.endsWith('@moviznow.com') &&
                  existingEmail.includes('@')
                );

                if (password.length < 6) {
                  setCustomError("Password must be at least 6 characters.");
                  setIsLoggingIn(false);
                  return;
                }

                if (!confirmPassword) {
                  setCustomError("Please enter confirm password.");
                  setIsLoggingIn(false);
                  return;
                }

                if (confirmPassword !== password) {
                  setCustomError("Passwords do not match.");
                  setIsLoggingIn(false);
                  return;
                }

                // If name does not already exist on account, validate Full Name
                if (!hasExistingName) {
                  const hasValidName = displayName.trim().length >= 2;
                  if (!hasValidName) {
                    setCustomError("Please enter your Full Name (minimum 2 characters).");
                    setIsLoggingIn(false);
                    return;
                  }
                }

                // If email does not already exist on account, validate optional email
                if (!hasExistingEmail) {
                  if (!optionalEmail.trim() && !emailWarningShown) {
                    setEmailWarningShown(true);
                    setIsLoggingIn(false);
                    return;
                  }
                }

                try {
                  const cleanId = identifier.trim();
                  const phonePart = cleanId.toLowerCase().endsWith('@moviznow.com')
                    ? cleanId.split('@')[0]
                    : (!cleanId.includes('@') ? cleanId : '');
                  const stdPhone = phonePart ? (standardizePhone(phonePart) || phonePart) : '';

                  if (isExistingAccount && registeredUser) {
                    // 1. If verified via OTP token, complete password setup securely on the server
                    if (verifyToken && registeredUser.uid) {
                      const completeRes = await fetch("/api/email/complete-phone-password-setup", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          uid: registeredUser.uid,
                          phone: stdPhone || identifier,
                          password,
                          verifyToken,
                        }),
                      });
                      const completeData = await completeRes.json();
                      if (!completeRes.ok) {
                        throw new Error(completeData.error || "Failed to complete password setup.");
                      }

                      if (completeData.customToken) {
                        const { getAuth, signInWithCustomToken } = await import('firebase/auth');
                        await signInWithCustomToken(getAuth(), completeData.customToken);
                        setIsLoggingIn(false);
                        return;
                      }
                    }

                    // Existing account (e.g. from Google login) setting password for WhatsApp login
                    const stdDigits = (stdPhone || identifier).replace(/\D/g, '');
                    const phoneAuthEmail = `${stdDigits}@moviznow.com`;
                    const googleEmail = (registeredUser.email && !registeredUser.email.endsWith('@moviznow.com'))
                      ? registeredUser.email
                      : (optionalEmail.trim() || null);
                    
                    let authUser: any = null;
                    const { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } = await import('firebase/auth');
                    const authInst = getAuth();

                    // 1. Try creating phone credential (e.g. 923001234567@moviznow.com)
                    try {
                      const cred = await createUserWithEmailAndPassword(authInst, phoneAuthEmail, password);
                      authUser = cred.user;
                    } catch (err1: any) {
                      if (err1.code === 'auth/email-already-in-use') {
                        try {
                          const cred = await signInWithEmailAndPassword(authInst, phoneAuthEmail, password);
                          authUser = cred.user;
                        } catch (signInErr: any) {}
                      }
                    }

                    // 2. If phoneAuthEmail was not used, try googleEmail if available
                    if (!authUser && googleEmail) {
                      try {
                        const cred = await createUserWithEmailAndPassword(authInst, googleEmail, password);
                        authUser = cred.user;
                      } catch (err2: any) {
                        if (err2.code === 'auth/email-already-in-use') {
                          try {
                            const cred = await signInWithEmailAndPassword(authInst, googleEmail, password);
                            authUser = cred.user;
                          } catch (signInErr: any) {}
                        }
                      }
                    }

                    if (authUser) {
                      const { doc, writeBatch } = await import('firebase/firestore');
                      const { db } = await import('../firebase');
                      const batch = writeBatch(db);

                      // 1. Update the original user doc (the Google user)
                      batch.set(doc(db, "users", registeredUser.uid), {
                        hasPassword: true,
                        phone: stdPhone || registeredUser.phone,
                        email: googleEmail || registeredUser.email,
                        displayName: (registeredUser.displayName && registeredUser.displayName !== 'Movie Fan') ? registeredUser.displayName : (displayName.trim() || undefined),
                        linkedPhoneUid: authUser.uid,
                        updatedAt: new Date().toISOString(),
                      }, { merge: true });

                      // 2. If authUser is a separate UID from registeredUser, mirror full profile so they access the SAME account
                      if (authUser.uid !== registeredUser.uid) {
                        batch.set(doc(db, "users", authUser.uid), {
                          ...registeredUser,
                          uid: authUser.uid,
                          primaryUid: registeredUser.uid,
                          hasPassword: true,
                          phone: stdPhone || registeredUser.phone,
                          email: googleEmail || phoneAuthEmail,
                          updatedAt: new Date().toISOString(),
                        }, { merge: true });
                      }

                      await batch.commit();

                      // 3. Update whitelisted_phones single doc
                      await linkPhoneToUid(stdPhone || identifier, registeredUser.uid, {
                        email: googleEmail || phoneAuthEmail,
                        displayName: registeredUser.displayName,
                        hasPassword: true,
                      });

                      // Auth state change will redirect to home automatically
                      setIsLoggingIn(false);
                      return;
                    } else {
                      // If automated creation requires Google verification
                      setCustomError(
                        <div className="flex flex-col gap-2">
                          <p>To verify ownership of your Google account ({googleEmail || 'Google'}), click below to confirm:</p>
                          <button
                            type="button"
                            onClick={handleGoogleLogin}
                            className="w-full bg-emerald-500 text-white py-2.5 rounded-xl font-medium hover:bg-emerald-600 transition-colors mt-1"
                          >
                            Verify with Google
                          </button>
                        </div>
                      );
                      setIsLoggingIn(false);
                      return;
                    }
                  } else {
                    // Truly new user signup
                    if (stdPhone) {
                      let isWhitelisted = await isPhoneWhitelisted(stdPhone, true);
                      if (!isWhitelisted && identifier !== stdPhone) {
                        isWhitelisted = await isPhoneWhitelisted(identifier, true);
                      }
                      if (!isWhitelisted) {
                        setCustomError("This WhatsApp number is not authorized for account creation. Please contact admin.");
                        setIsLoggingIn(false);
                        return;
                      }
                    }

                    const dummyEmail = `${identifier.replace(/[^0-9]/g, '')}@moviznow.com`;
                    try {
                      await signUpWithPhoneAndPassword(identifier, password, displayName, optionalEmail.trim().toLowerCase() || dummyEmail);
                    } catch (signErr: any) {
                      if (signErr?.code === 'auth/email-already-in-use' || signErr?.message?.includes('already registered')) {
                        // User already registered! Switch smoothly to password login
                        setCustomError("This WhatsApp number already has an account. Please enter your password to log in.");
                        setRegisteredUser({
                          uid: '',
                          phone: stdPhone || identifier,
                          email: optionalEmail.trim().toLowerCase() || dummyEmail,
                          hasPassword: true,
                          displayName: displayName || `User (${identifier})`,
                          role: 'user',
                          status: 'active',
                        } as any);
                        setStep('password');
                        setIsLoggingIn(false);
                        return;
                      }
                      throw signErr;
                    }
                  }
                } catch (err: any) {
                  setCustomError(err?.message || "Failed to create account.");
                  setIsLoggingIn(false);
                }
              }} 
              className="space-y-4"
            >
              <button 
                type="button"
                onClick={() => setStep('identifier')} 
                className="flex items-center gap-2 text-xs font-semibold text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors mb-2 group"
              >
                <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" /> Back
              </button>

              <div className="text-center mb-2">
                <h2 className="text-lg font-bold">
                  {registeredUser && !registeredUser.uid.startsWith('pending_') ? "Set Password" : "Create Password"}
                </h2>
                <p className="text-xs text-zinc-500">
                  {registeredUser && !registeredUser.uid.startsWith('pending_')
                    ? `Set up a password for ${identifier} to access your account`
                    : `Set up a password for ${identifier}`}
                </p>
              </div>

              {registeredUser && !registeredUser.uid.startsWith('pending_') && (
                <div className="flex items-center gap-3.5 p-3.5 bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-500/20 rounded-2xl mb-2">
                  <div className="w-10 h-10 rounded-full bg-emerald-500/15 flex items-center justify-center text-emerald-500 shrink-0">
                    <UserIcon className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">Account Found</p>
                    <p className="text-sm font-semibold truncate text-zinc-900 dark:text-white">
                      {getUserDisplayName(registeredUser)}
                    </p>
                    {registeredUser.email && !registeredUser.email.endsWith('@moviznow.com') && (
                      <p className="text-xs text-zinc-400 truncate">{maskEmail(registeredUser.email)}</p>
                    )}
                  </div>
                </div>
              )}

              {/* Show Full Name ONLY if name does NOT exist on the account */}
              {!hasExistingName && (
                <div>
                  <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1.5">Full Name</label>
                  <div className="relative group">
                    <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 group-focus-within:text-emerald-500 transition-colors" />
                    <input
                      type="text"
                      required
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="w-full bg-white dark:bg-zinc-950/80 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-11 pr-4 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                      placeholder="John Doe"
                    />
                  </div>
                </div>
              )}

              {/* Show Optional Email ONLY if email does NOT exist on the account */}
              {!hasExistingEmail && (
                <div>
                  <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1.5">Email (Optional)</label>
                  <div className="relative group">
                    <Mail className={`absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 ${emailWarningShown ? 'text-amber-500' : 'text-zinc-400 group-focus-within:text-emerald-500'} transition-colors`} />
                    <input
                      type="email"
                      value={optionalEmail}
                      onChange={(e) => { setOptionalEmail(e.target.value); setEmailWarningShown(false); }}
                      className={`w-full bg-white dark:bg-zinc-950/80 border ${emailWarningShown ? 'border-amber-500 focus:ring-amber-500/20' : 'border-zinc-200 dark:border-zinc-800 focus:ring-emerald-500/20 focus:border-emerald-500'} rounded-xl pl-11 pr-4 py-3.5 text-sm focus:outline-none focus:ring-2 transition-all`}
                      placeholder="you@example.com"
                    />
                  </div>
                  {emailWarningShown && (
                    <p className="text-xs text-amber-600 dark:text-amber-500 mt-2 font-medium">
                      It's highly recommended to provide an email for account recovery. Press Create Password again to continue without an email.
                    </p>
                  )}
                </div>
              )}

              {/* Password field */}
              <div>
                <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1.5">
                  {registeredUser && !registeredUser.uid.startsWith('pending_') ? "Create Password" : "Password"}
                </label>
                <div className="relative group">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 group-focus-within:text-emerald-500 transition-colors" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-white dark:bg-zinc-950/80 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-11 pr-11 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                    placeholder="At least 6 characters"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Confirm Password field (ALWAYS rendered) */}
              <div>
                <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1.5">Confirm Password</label>
                <div className="relative group">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 group-focus-within:text-emerald-500 transition-colors" />
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full bg-white dark:bg-zinc-950/80 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-11 pr-11 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                    placeholder="Confirm your password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1"
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <motion.button
                whileHover={{ scale: 1.015 }}
                whileTap={{ scale: 0.985 }}
                type="submit"
                disabled={isLoggingIn}
                className="w-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-semibold py-3.5 px-4 rounded-xl hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-all duration-200 disabled:opacity-70 shadow-md shadow-zinc-950/10 dark:shadow-none flex items-center justify-center gap-2"
              >
                {isLoggingIn ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
                    <span>Saving password...</span>
                  </>
                ) : (
                  registeredUser && !registeredUser.uid.startsWith('pending_') ? 'Set Password & Log In' : 'Create Password'
                )}
              </motion.button>
            </motion.form>
          )}

          {step === 'reset-password' && (
            <motion.form 
              key="reset-password-step"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
              onSubmit={handleResetPassword} 
              className="space-y-4"
            >
              <div className="text-center mb-2">
                <h2 className="text-lg font-bold">Password Restored</h2>
                <p className="text-xs text-zinc-500 text-balance">Your password was reset by the admin. Please enter a new password to continue.</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1.5">New Password</label>
                <div className="relative group">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 group-focus-within:text-emerald-500 transition-colors" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full bg-white dark:bg-zinc-950/80 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-11 pr-11 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  type="button"
                  onClick={async () => {
                    const { getAuth, signOut } = await import('firebase/auth');
                    await signOut(getAuth());
                    setStep('identifier');
                  }}
                  className="flex-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white font-semibold py-3 px-4 rounded-xl hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors text-sm"
                >
                  Cancel
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  type="submit"
                  disabled={isLoggingIn || newPassword.length < 6}
                  className="flex-1 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-semibold py-3 px-4 rounded-xl hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-colors text-sm disabled:opacity-70 flex items-center justify-center gap-2 shadow-md"
                >
                  {isLoggingIn ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
                      <span>Updating...</span>
                    </>
                  ) : (
                    'Update Password'
                  )}
                </motion.button>
              </div>
            </motion.form>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

