import React from 'react';
import { Mail, X, Loader2, Send, Calendar, ShieldCheck, AlertCircle, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { UserProfile } from '../types';
import { isUserExpired } from '../contexts/UsersContext';
import { safeFormat } from '../utils/userUtils';
import { useModalBehavior } from '../hooks/useModalBehavior';
import {
  modalBackdropAnimation,
  modalContainerAnimation,
  modalGpuStyle,
} from '../utils/modalAnimations';

interface SendEmailConfirmModalProps {
  isOpen: boolean;
  user: UserProfile | null;
  onConfirm: (user: UserProfile) => void | Promise<void>;
  onClose: () => void;
  isLoading?: boolean;
}

export default function SendEmailConfirmModal({
  isOpen,
  user,
  onConfirm,
  onClose,
  isLoading = false,
}: SendEmailConfirmModalProps) {
  useModalBehavior(isOpen, onClose);

  if (!isOpen || !user) return null;

  const isExpired = user.status === 'expired' || (!!user.expiryDate && user.expiryDate !== 'Lifetime' && isUserExpired(user.expiryDate));
  const effectiveStatus = user.role === 'owner' ? 'active' : (isExpired ? 'expired' : 'active');
  const userEmail = (user.email || '').trim().toLowerCase();

  const templateType = effectiveStatus === 'expired' 
    ? 'Membership Expired Notice' 
    : 'Active Access Confirmation';

  const subjectLine = effectiveStatus === 'expired'
    ? '⚠️ MovizNow Membership Expired: Action Required'
    : '⭐ MovizNow Membership Status: Active Access';

  const formatExpiryDisplay = () => {
    if (user.role === 'owner') return '👑 Lifetime Access';
    if (!user.expiryDate) return 'Not Set / Expired';
    if (user.expiryDate === 'Lifetime') return '👑 Lifetime Access';
    try {
      return safeFormat(user.expiryDate, 'MMM dd, yyyy');
    } catch {
      return user.expiryDate.split('T')[0] || user.expiryDate;
    }
  };

  const handleSend = () => {
    if (!isLoading) {
      onConfirm(user);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          {...modalBackdropAnimation}
          className="fixed inset-0 bg-black/70 backdrop-blur-xs"
          onClick={isLoading ? undefined : onClose}
        />

        {/* Modal Dialog */}
        <motion.div
          {...modalContainerAnimation}
          style={modalGpuStyle}
          className="relative w-full max-w-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden z-10 flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 dark:border-zinc-800/80">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0">
                <Mail className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-zinc-900 dark:text-white leading-tight">
                  Confirm Email Notification
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Verify recipient details before dispatching
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-lg transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="p-5 space-y-4 text-sm">
            {/* Recipient Card */}
            <div className="bg-zinc-50 dark:bg-zinc-950/60 p-3.5 rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 flex items-center gap-3.5">
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName || 'User'}
                  className="w-12 h-12 rounded-xl object-cover shrink-0 border border-zinc-200 dark:border-zinc-800"
                />
              ) : (
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-bold text-lg flex items-center justify-center shrink-0 shadow-xs">
                  {(user.displayName || user.email || 'U').charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="font-bold text-zinc-900 dark:text-white text-sm truncate">
                  {user.displayName || 'Member'}
                </div>
                <div className="text-xs font-mono text-blue-600 dark:text-blue-400 truncate font-medium">
                  {userEmail}
                </div>
                {user.phone && (
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">
                    {user.phone}
                  </div>
                )}
              </div>
            </div>

            {/* Status & Expiry Metadata (Clean Typographic Layout) */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-zinc-50/80 dark:bg-zinc-950/40 p-2.5 rounded-xl border border-zinc-200/60 dark:border-zinc-800/60">
                <span className="text-zinc-500 uppercase tracking-wider text-[10px] font-bold block mb-1">
                  Account Status
                </span>
                <div className="flex items-center gap-1.5 font-semibold">
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      effectiveStatus === 'active' ? 'bg-emerald-500' : 'bg-rose-500'
                    }`}
                  />
                  <span
                    className={
                      effectiveStatus === 'active'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-rose-600 dark:text-rose-400'
                    }
                  >
                    {effectiveStatus.toUpperCase()}
                  </span>
                </div>
              </div>

              <div className="bg-zinc-50/80 dark:bg-zinc-950/40 p-2.5 rounded-xl border border-zinc-200/60 dark:border-zinc-800/60">
                <span className="text-zinc-500 uppercase tracking-wider text-[10px] font-bold block mb-1">
                  Membership Expiry
                </span>
                <div className="flex items-center gap-1.5 font-semibold text-zinc-900 dark:text-zinc-200 truncate">
                  <Calendar className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                  <span className="truncate">{formatExpiryDisplay()}</span>
                </div>
              </div>
            </div>

            {/* Email Preview Section */}
            <div className="bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200/60 dark:border-blue-900/40 rounded-xl p-3.5 space-y-2">
              <div className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
                Email Notification Preview
              </div>
              <div className="space-y-1.5 text-xs">
                <div className="flex items-start gap-2">
                  <span className="text-zinc-500 shrink-0 font-medium">Template:</span>
                  <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                    {templateType}
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-zinc-500 shrink-0 font-medium">Subject:</span>
                  <span className="font-mono text-[11px] text-zinc-800 dark:text-zinc-200 break-all">
                    {subjectLine}
                  </span>
                </div>
              </div>
            </div>

            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
              Are you sure you want to send this status email notification? This will immediately dispatch the email to the user&apos;s stored Gmail address.
            </p>
          </div>

          {/* Footer Buttons */}
          <div className="flex items-center justify-end gap-2.5 px-5 py-3.5 bg-zinc-50/80 dark:bg-zinc-950/40 border-t border-zinc-100 dark:border-zinc-800/80">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200/60 dark:hover:bg-zinc-800 rounded-xl transition-colors disabled:opacity-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSend}
              disabled={isLoading}
              className="px-4 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-xl shadow-xs transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Sending Email...</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>Send Email</span>
                </>
              )}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
