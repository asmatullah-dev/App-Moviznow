import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, Eye, EyeOff, CheckCircle2, AlertCircle, ArrowLeft, Loader2, Sparkles, ShieldCheck } from 'lucide-react';
import { auth } from '../firebase';
import { verifyPasswordResetCode, confirmPasswordReset } from 'firebase/auth';

const maskEmail = (email: string) => {
  if (!email || !email.includes('@')) return email;
  const [localPart, domain] = email.split('@');
  if (localPart.length <= 3) {
    return `${localPart[0]}***@${domain}`;
  }
  return `${localPart.slice(0, 2)}***${localPart.slice(-2)}@${domain}`;
};

export default function ResetPassword() {
  const navigate = useNavigate();
  const location = useLocation();

  const [oobCode, setOobCode] = useState<string | null>(null);
  const [isVerifyingCode, setIsVerifyingCode] = useState(true);
  const [userEmail, setUserEmail] = useState<string>('');
  const [codeValid, setCodeValid] = useState<boolean>(false);
  const [verifyError, setVerifyError] = useState<string>('');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string>('');
  const [isSuccess, setIsSuccess] = useState(false);
  const [redirectCountdown, setRedirectCountdown] = useState(5);

  useEffect(() => {
    // Extract oobCode and mode from search or hash
    const searchParams = new URLSearchParams(location.search);
    let code = searchParams.get('oobCode');
    const mode = searchParams.get('mode');

    if (!code && location.hash.includes('?')) {
      const hashParams = new URLSearchParams(location.hash.split('?')[1]);
      code = hashParams.get('oobCode');
    }

    if (!code) {
      setIsVerifyingCode(false);
      setCodeValid(false);
      setVerifyError('No reset code was provided in the link. Please request a new password reset link.');
      return;
    }

    setOobCode(code);

    const checkCode = async () => {
      try {
        setIsVerifyingCode(true);
        const email = await verifyPasswordResetCode(auth, code);
        setUserEmail(email);
        setCodeValid(true);
        setVerifyError('');
      } catch (err: any) {
        console.warn('Failed to verify reset code:', err);
        setCodeValid(false);
        if (err.code === 'auth/expired-action-code') {
          setVerifyError('This password reset link has expired. For security, reset links are valid for a limited time.');
        } else if (err.code === 'auth/invalid-action-code') {
          setVerifyError('This password reset link is invalid or has already been used.');
        } else {
          setVerifyError(err.message || 'Unable to verify reset link. Please try requesting a new one.');
        }
      } finally {
        setIsVerifyingCode(false);
      }
    };

    checkCode();
  }, [location.search, location.hash]);

  // Handle countdown on success
  useEffect(() => {
    if (!isSuccess) return;
    const interval = setInterval(() => {
      setRedirectCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          navigate('/login', { replace: true });
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isSuccess, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');

    if (!password) {
      setSubmitError('Please enter a new password.');
      return;
    }

    if (password.length < 6) {
      setSubmitError('Password must be at least 6 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setSubmitError('Passwords do not match. Please re-enter.');
      return;
    }

    if (!oobCode) {
      setSubmitError('Missing reset code. Please request a new link.');
      return;
    }

    setIsSubmitting(true);
    try {
      await confirmPasswordReset(auth, oobCode, password);

      // Best effort update to firestore user document to ensure hasPassword: true
      if (userEmail) {
        try {
          const { collection, query, where, getDocs, updateDoc } = await import('firebase/firestore');
          const { db } = await import('../firebase');
          const q = query(collection(db, 'users'), where('email', '==', userEmail.toLowerCase().trim()));
          const snap = await getDocs(q);
          snap.forEach(async (docSnap) => {
            try {
              await updateDoc(docSnap.ref, {
                hasPassword: true,
                requirePasswordReset: false,
                updatedAt: new Date().toISOString(),
              });
            } catch (err) {}
          });
        } catch (e) {
          // Non-blocking
        }
      }

      setIsSuccess(true);
    } catch (err: any) {
      console.warn('Password reset failed:', err);
      if (err.code === 'auth/expired-action-code') {
        setSubmitError('This reset link has expired. Please request a new link.');
      } else if (err.code === 'auth/weak-password') {
        setSubmitError('The password is too weak. Please choose a stronger password.');
      } else {
        setSubmitError(err.message || 'Failed to reset password. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-slate-50 dark:bg-zinc-950 flex flex-col items-center justify-center text-zinc-900 dark:text-white p-4 transition-colors duration-300">
      {/* Ambient background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[20%] -left-[10%] w-[50vw] h-[50vw] rounded-full bg-emerald-500/10 dark:bg-emerald-500/15 blur-[120px]" />
        <div className="absolute -bottom-[20%] -right-[10%] w-[50vw] h-[50vw] rounded-full bg-teal-500/10 dark:bg-teal-500/10 blur-[120px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="relative z-10 w-full max-w-md bg-white/85 dark:bg-zinc-900/85 backdrop-blur-xl border border-zinc-200/80 dark:border-zinc-800/80 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-zinc-950/5 dark:shadow-zinc-950/40"
      >
        {/* Logo */}
        <div className="flex flex-col items-center justify-center mb-6">
          <Link to="/" className="inline-block transition-transform active:scale-95">
            <img src="/Blacklogo.svg" alt="MovizNow" className="w-auto h-12 block dark:hidden object-contain" />
            <img src="/Whitelogo.svg" alt="MovizNow" className="w-auto h-12 hidden dark:block object-contain" />
          </Link>
        </div>

        {/* Loading state */}
        {isVerifyingCode && (
          <div className="py-12 flex flex-col items-center justify-center text-center space-y-4">
            <div className="relative">
              <div className="w-12 h-12 rounded-full border-2 border-emerald-500/20 animate-ping absolute inset-0" />
              <Loader2 className="w-12 h-12 text-emerald-500 animate-spin relative z-10" />
            </div>
            <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
              Verifying your reset link...
            </p>
          </div>
        )}

        {/* Error state (Invalid or Expired Link) */}
        {!isVerifyingCode && !codeValid && (
          <div className="space-y-5 text-center">
            <div className="w-14 h-14 rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center mx-auto border border-rose-500/20">
              <AlertCircle className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-zinc-900 dark:text-white mb-2">
                Link Invalid or Expired
              </h2>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 max-w-sm mx-auto leading-relaxed">
                {verifyError || 'This password reset link is invalid or has already been used.'}
              </p>
            </div>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => navigate('/login')}
                className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-semibold py-3 px-4 rounded-xl shadow-md transition-all active:scale-[0.98] flex items-center justify-center gap-2 text-sm"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Return to Login to Request New Link</span>
              </button>
            </div>
          </div>
        )}

        {/* Success state */}
        {!isVerifyingCode && codeValid && isSuccess && (
          <div className="space-y-5 text-center py-4">
            <div className="w-16 h-16 rounded-3xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center mx-auto border border-emerald-500/20 shadow-inner">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-zinc-900 dark:text-white mb-2">
                Password Reset Successfully!
              </h2>
              <p className="text-xs text-zinc-600 dark:text-zinc-400 max-w-sm mx-auto leading-relaxed">
                Your new password for <span className="font-semibold text-zinc-900 dark:text-zinc-200">{maskEmail(userEmail)}</span> has been securely saved.
              </p>
            </div>
            <div className="pt-2 space-y-3">
              <button
                type="button"
                onClick={() => navigate('/login', { replace: true })}
                className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-semibold py-3.5 px-4 rounded-xl shadow-md transition-all active:scale-[0.98] flex items-center justify-center gap-2 text-sm"
              >
                <span>Log In Now</span>
                <span className="text-xs opacity-80">({redirectCountdown}s)</span>
              </button>
            </div>
          </div>
        )}

        {/* Active Reset Form */}
        {!isVerifyingCode && codeValid && !isSuccess && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="text-center mb-4">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[11px] font-semibold mb-2">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Verified Account</span>
              </div>
              <h2 className="text-xl font-bold text-zinc-900 dark:text-white">
                Set New Password
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                Enter a new password for <span className="font-semibold text-zinc-800 dark:text-zinc-200">{maskEmail(userEmail)}</span>
              </p>
            </div>

            {submitError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span className="flex-1">{submitError}</span>
              </div>
            )}

            {/* New Password */}
            <div>
              <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1.5">
                New Password
              </label>
              <div className="relative group">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 group-focus-within:text-emerald-500 transition-colors" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-white dark:bg-zinc-950/80 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-11 pr-11 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-zinc-900 dark:text-white placeholder-zinc-400"
                  placeholder="Minimum 6 characters"
                  autoFocus
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

            {/* Confirm Password */}
            <div>
              <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1.5">
                Confirm New Password
              </label>
              <div className="relative group">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 group-focus-within:text-emerald-500 transition-colors" />
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full bg-white dark:bg-zinc-950/80 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-11 pr-11 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-zinc-900 dark:text-white placeholder-zinc-400"
                  placeholder="Re-enter password"
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

            {/* Submit Button */}
            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              type="submit"
              disabled={isSubmitting || password.length < 6 || !confirmPassword}
              className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-semibold py-3.5 px-4 rounded-xl shadow-md transition-all flex items-center justify-center gap-2 text-sm mt-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Saving New Password...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Save New Password</span>
                </>
              )}
            </motion.button>

            <div className="pt-2 text-center">
              <Link
                to="/login"
                className="text-xs font-semibold text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors inline-flex items-center gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Login</span>
              </Link>
            </div>
          </form>
        )}
      </motion.div>
    </div>
  );
}
