import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Lock, KeyRound, Check, Copy, MessageCircle, RefreshCw, AlertCircle, Loader2, Sparkles, ShieldAlert } from 'lucide-react';
import { UserProfile } from '../types';
import { standardizePhone } from '../contexts/AuthContext';
import { getUserDisplayName } from '../utils/userUtils';

interface AdminPasswordResetModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile | null;
  adminUid: string;
  onSuccess: (updatedUser: Partial<UserProfile>) => void;
}

export const AdminPasswordResetModal: React.FC<AdminPasswordResetModalProps> = ({
  isOpen,
  onClose,
  user,
  adminUid,
  onSuccess,
}) => {
  const [mode, setMode] = useState<'temp_password' | 'clear_password'>('temp_password');
  const [customPassword, setCustomPassword] = useState('moviznow123');
  const [requireReset, setRequireReset] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<{
    action: 'set' | 'cleared';
    tempPassword?: string;
    requireReset?: boolean;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  if (!isOpen || !user) return null;

  const displayName = getUserDisplayName(user);
  const userPhone = user.phone || '';
  const userEmail = (user.email && !user.email.endsWith('@moviznow.com')) ? user.email : '';

  const generateRandomPin = () => {
    const pin = Math.floor(100000 + Math.random() * 900000).toString();
    setCustomPassword(pin);
  };

  const handleReset = async () => {
    setIsLoading(true);
    setError(null);

    try {
      if (mode === 'temp_password' && customPassword.trim().length < 6) {
        throw new Error('Temporary password must be at least 6 characters.');
      }

      const res = await fetch('/api/admin/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid: user.uid,
          adminUid,
          clearPassword: mode === 'clear_password',
          newPassword: mode === 'temp_password' ? customPassword.trim() : undefined,
          requirePasswordReset: mode === 'temp_password' ? requireReset : false,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to reset password');
      }

      if (mode === 'clear_password') {
        setSuccessResult({ action: 'cleared' });
        onSuccess({
          hasPassword: false,
          requirePasswordReset: false,
        });
      } else {
        setSuccessResult({
          action: 'set',
          tempPassword: data.tempPassword || customPassword.trim(),
          requireReset,
        });
        onSuccess({
          hasPassword: true,
          requirePasswordReset: requireReset,
        });
      }
    } catch (err: any) {
      console.error('Password reset error:', err);
      setError(err.message || 'An error occurred while resetting the password.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyMessage = () => {
    if (!successResult?.tempPassword) return;
    const msg = `Assalam O Alaikum ${displayName}!\n\nYour MovizNow password has been reset by Admin.\n\nTemporary Password: ${successResult.tempPassword}\nLogin: https://MovizNow.com\n\n${successResult.requireReset ? 'Please log in with this temporary password to set your own new password.' : ''}\n\nThank you!`;
    navigator.clipboard.writeText(msg);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSendWhatsApp = () => {
    if (!userPhone) return;
    const cleanPhone = userPhone.replace(/\D/g, '');
    let msg = '';
    if (successResult?.action === 'cleared') {
      msg = `Assalam O Alaikum ${displayName}!\n\nYour MovizNow password has been cleared by Admin.\n\nYou can now visit https://MovizNow.com, enter your WhatsApp number, and create a new password directly.\n\nThank you!`;
    } else {
      msg = `Assalam O Alaikum ${displayName}!\n\nYour MovizNow password has been reset by Admin.\n\nTemporary Password: ${successResult?.tempPassword || customPassword}\nLogin: https://MovizNow.com\n\n${successResult?.requireReset ? 'Please log in with this temporary password to set your own new password.' : ''}\n\nThank you!`;
    }
    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  const handleResetModal = () => {
    setSuccessResult(null);
    setError(null);
    setCustomPassword('moviznow123');
    setRequireReset(true);
    setMode('temp_password');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-3xl p-6 shadow-2xl border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-white relative"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">Reset User Password</h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Manage credentials for {displayName}
              </p>
            </div>
          </div>
          <button
            onClick={handleResetModal}
            className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* User Quick Info */}
        <div className="my-4 p-3 bg-zinc-50 dark:bg-zinc-950/60 rounded-2xl border border-zinc-200/80 dark:border-zinc-800/80 text-xs space-y-1.5">
          <div className="flex justify-between">
            <span className="text-zinc-500">Account:</span>
            <span className="font-semibold">{displayName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">WhatsApp / Phone:</span>
            <span className="font-mono font-semibold">{userPhone || 'None'}</span>
          </div>
          {userEmail && (
            <div className="flex justify-between">
              <span className="text-zinc-500">Email:</span>
              <span className="font-semibold">{userEmail}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-zinc-500">Current Status:</span>
            <span className="font-semibold">
              {user.hasPassword ? (
                <span className="text-emerald-500">Password Active</span>
              ) : (
                <span className="text-amber-500">No Password Set</span>
              )}
            </span>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-600 dark:text-red-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Success View */}
        {successResult ? (
          <div className="py-2 space-y-4">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center mx-auto border border-emerald-500/20">
                <Check className="w-6 h-6" />
              </div>
              <h4 className="text-base font-bold text-zinc-900 dark:text-white">
                {successResult.action === 'cleared' ? 'Password Cleared!' : 'Password Reset Successfully!'}
              </h4>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {successResult.action === 'cleared'
                  ? 'The user can now enter their WhatsApp number on MovizNow and create a new password.'
                  : 'Share this temporary password with the user so they can log in.'}
              </p>
            </div>

            {successResult.tempPassword && (
              <div className="p-3 bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-center space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  Temporary Password
                </span>
                <div className="text-xl font-mono font-bold text-zinc-900 dark:text-white tracking-wider">
                  {successResult.tempPassword}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2 pt-2">
              {userPhone && (
                <button
                  type="button"
                  onClick={handleSendWhatsApp}
                  className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-semibold py-3 px-4 rounded-xl shadow-md transition-all flex items-center justify-center gap-2 text-sm"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>Send Details via WhatsApp</span>
                </button>
              )}

              {successResult.tempPassword && (
                <button
                  type="button"
                  onClick={handleCopyMessage}
                  className="w-full bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-700 font-semibold py-2.5 px-4 rounded-xl transition-all flex items-center justify-center gap-2 text-xs"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copied Message!' : 'Copy WhatsApp Message'}</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleResetModal}
                className="w-full text-zinc-500 hover:text-zinc-900 dark:hover:text-white py-2 text-xs font-semibold"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          /* Active Form */
          <div className="space-y-4">
            {/* Mode selector */}
            <div className="grid grid-cols-2 gap-2 p-1 bg-zinc-100 dark:bg-zinc-950 rounded-xl text-xs font-semibold">
              <button
                type="button"
                onClick={() => setMode('temp_password')}
                className={`py-2 px-3 rounded-lg transition-all ${
                  mode === 'temp_password'
                    ? 'bg-white dark:bg-zinc-800 shadow-sm text-emerald-600 dark:text-emerald-400'
                    : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300'
                }`}
              >
                Set Temp Password
              </button>
              <button
                type="button"
                onClick={() => setMode('clear_password')}
                className={`py-2 px-3 rounded-lg transition-all ${
                  mode === 'clear_password'
                    ? 'bg-white dark:bg-zinc-800 shadow-sm text-amber-600 dark:text-amber-400'
                    : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300'
                }`}
              >
                Clear Password
              </button>
            </div>

            {mode === 'temp_password' ? (
              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                      Temporary Password
                    </label>
                    <button
                      type="button"
                      onClick={generateRandomPin}
                      className="text-[11px] text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 font-semibold"
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>Generate PIN</span>
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                    <input
                      type="text"
                      value={customPassword}
                      onChange={(e) => setCustomPassword(e.target.value)}
                      className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-sm font-mono focus:outline-none focus:border-emerald-500"
                      placeholder="e.g. 123456 or moviznow123"
                    />
                  </div>
                </div>

                <label className="flex items-start gap-2.5 p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-950/40 border border-zinc-200/60 dark:border-zinc-800/60 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={requireReset}
                    onChange={(e) => setRequireReset(e.target.checked)}
                    className="w-4 h-4 mt-0.5 text-emerald-500 rounded border-zinc-300 dark:border-zinc-700 focus:ring-emerald-500"
                  />
                  <div className="text-xs">
                    <span className="font-semibold block text-zinc-800 dark:text-zinc-200">
                      Force password change on next login
                    </span>
                    <span className="text-zinc-500 text-[11px]">
                      User will be required to set their own new password immediately after logging in.
                    </span>
                  </div>
                </label>
              </div>
            ) : (
              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-300 space-y-1.5">
                <div className="flex items-center gap-1.5 font-bold">
                  <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0" />
                  <span>Clear User Password</span>
                </div>
                <p className="leading-relaxed">
                  This will mark <span className="font-bold">{displayName}</span> as having no password.
                  When they enter their WhatsApp number on the login screen, they will be prompted to create a fresh password immediately.
                </p>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={handleResetModal}
                disabled={isLoading}
                className="flex-1 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-semibold py-2.5 px-4 rounded-xl text-xs transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleReset}
                disabled={isLoading || (mode === 'temp_password' && customPassword.trim().length < 6)}
                className="flex-1 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-semibold py-2.5 px-4 rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 shadow-md"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>{mode === 'clear_password' ? 'Confirm Clear' : 'Reset Password'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
};
