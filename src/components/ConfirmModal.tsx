import React, { useState } from 'react';
import { AlertTriangle, X, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useModalBehavior } from '../hooks/useModalBehavior';
import { useLanguage } from '../contexts/LanguageContext';

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
  const { t } = useLanguage();
  const [isConfirming, setIsConfirming] = useState(false);
  useModalBehavior(isOpen, onCancel);

  const translatedTitle = t(title);
  const translatedMessage = t(message);
  const translatedConfirm = t(confirmText);
  const translatedCancel = t(cancelText);

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

  const hasUrdu = (text: string) => /[\u0600-\u06FF]/.test(text);
  const titleClass = hasUrdu(translatedTitle) ? 'urdu-font ' : '';
  const messageClass = hasUrdu(translatedMessage) ? 'urdu-font ' : '';
  const confirmClass = hasUrdu(translatedConfirm) ? 'urdu-font ' : '';
  const cancelClass = hasUrdu(translatedCancel) ? 'urdu-font ' : '';

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4">
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
            className="relative bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl transition-colors duration-300"
          >
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="bg-red-500/10 p-2.5 rounded-full">
                    <AlertTriangle className="w-6 h-6 text-red-500" />
                  </div>
                  <h2 className={`text-xl font-bold text-zinc-900 dark:text-white transition-colors duration-300 ${titleClass}`}>{translatedTitle}</h2>
                </div>
                <button onClick={onCancel} disabled={isLoading} className="text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-all active:scale-95 disabled:opacity-50 p-1 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className={`text-zinc-600 dark:text-zinc-300 mb-6 text-sm sm:text-base leading-relaxed transition-colors duration-300 ${messageClass}`}>{translatedMessage}</p>
              <div className="flex justify-between gap-3">
                <button
                  onClick={onCancel}
                  disabled={isLoading}
                  className={`flex-1 py-3 text-sm rounded-xl font-bold text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all active:scale-95 disabled:opacity-50 ${cancelClass}`}
                >
                  {translatedCancel}
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={isLoading}
                  className={`flex-1 py-3 text-sm rounded-xl font-bold bg-red-600 hover:bg-red-700 text-white transition-all active:scale-95 shadow-lg shadow-red-600/20 disabled:opacity-50 flex items-center justify-center gap-2 ${confirmClass}`}
                >
                  {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {translatedConfirm}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
