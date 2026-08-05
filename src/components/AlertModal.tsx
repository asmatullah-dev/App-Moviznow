import React, { useEffect } from 'react';
import { AlertCircle, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useModalBehavior } from '../hooks/useModalBehavior';
import { useHaptics } from '../hooks/useHaptics';

import { useLanguage } from '../contexts/LanguageContext';

interface AlertModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  onClose: () => void;
  buttonText?: string;
  children?: React.ReactNode;
}

export default function AlertModal({
  isOpen,
  title,
  message,
  onClose,
  buttonText,
  children
}: AlertModalProps) {
  const { t } = useLanguage();
  const translatedTitle = t(title);
  const translatedMessage = t(message);
  const effectiveButtonText = buttonText ? t(buttonText) : t('OK');
  useModalBehavior(isOpen, onClose);
  const { vibrate } = useHaptics();

  useEffect(() => {
    if (isOpen) {
      vibrate([50, 50, 50]); // A small distinct pattern for alerts
    }
  }, [isOpen, vibrate]);

  const hasUrdu = (text: string) => /[\u0600-\u06FF]/.test(text);
  const titleClass = hasUrdu(translatedTitle) ? 'urdu-font ' : '';
  const messageClass = hasUrdu(translatedMessage) ? 'urdu-font ' : '';
  const buttonClass = hasUrdu(effectiveButtonText) ? 'urdu-font ' : '';

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
            onClick={onClose}
          />
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="relative bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl"
          >
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="bg-emerald-500/10 p-2.5 rounded-full text-emerald-500">
                    <AlertCircle className="w-6 h-6" />
                  </div>
                  <h2 className={`text-xl font-bold text-zinc-900 dark:text-white ${titleClass}`}>{translatedTitle}</h2>
                </div>
                <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1 rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-all">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className={`text-zinc-600 dark:text-zinc-300 mb-6 text-sm sm:text-base font-medium leading-relaxed ${messageClass}`}>{translatedMessage}</p>
              <div className="flex flex-col gap-3">
                {children ? children : (
                  <div className="flex justify-end">
                    <button
                      onClick={onClose}
                      className={`w-full py-3 px-6 text-sm rounded-xl font-bold bg-emerald-500 hover:bg-emerald-600 text-white transition-all active:scale-95 shadow-lg shadow-emerald-500/20 ${buttonClass}`}
                    >
                      {effectiveButtonText}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
