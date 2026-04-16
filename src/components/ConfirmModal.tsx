import React, { useState } from 'react';
import { AlertTriangle, X, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useModalBehavior } from '../hooks/useModalBehavior';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
  loading?: boolean;
}

export default function ConfirmModal({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  loading: externalLoading = false
}: ConfirmModalProps) {
  const [isConfirming, setIsConfirming] = useState(false);
  useModalBehavior(isOpen, onCancel);

  const handleConfirm = async () => {
    setIsConfirming(true);
    try {
      await onConfirm();
      onCancel();
    } finally {
      setIsConfirming(false);
    }
  };

  const isLoading = externalLoading || isConfirming;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
            onClick={!isLoading ? onCancel : undefined}
          />
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="relative bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl transition-colors duration-300"
          >
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="bg-red-500/10 p-2 rounded-full">
                    <AlertTriangle className="w-6 h-6 text-red-500" />
                  </div>
                  <h2 className="text-xl font-bold text-zinc-900 dark:text-white transition-colors duration-300">{title}</h2>
                </div>
                <button onClick={onCancel} disabled={isLoading} className="text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-all active:scale-95 disabled:opacity-50">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-zinc-600 dark:text-zinc-300 mb-6 transition-colors duration-300">{message}</p>
              <div className="flex justify-between gap-2">
                <button
                  onClick={onCancel}
                  disabled={isLoading}
                  className="px-5 py-2.5 text-sm rounded-xl font-medium text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all active:scale-95 border border-transparent hover:border-zinc-200 dark:hover:border-zinc-700 disabled:opacity-50"
                >
                  {cancelText}
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={isLoading}
                  className="px-5 py-2.5 text-sm rounded-xl font-medium bg-red-500 hover:bg-red-600 text-white transition-all active:scale-95 border border-white/20 shadow-lg disabled:opacity-50 flex items-center gap-2"
                >
                  {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {confirmText}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
