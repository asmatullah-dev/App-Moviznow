import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Info, Sparkles, Layers, Database } from 'lucide-react';
import { useModalBehavior } from '../hooks/useModalBehavior';
import { useLanguage } from '../contexts/LanguageContext';
import { useHaptics } from '../hooks/useHaptics';
import { APP_VERSION } from '../version';
import {
  modalBackdropAnimation,
  modalContainerAnimation,
  modalGpuStyle,
} from '../utils/modalAnimations';

interface VersionInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function VersionInfoModal({ isOpen, onClose }: VersionInfoModalProps) {
  const { t } = useLanguage();
  const { vibrate } = useHaptics();
  useModalBehavior(isOpen, onClose);

  // Parse version parts (Major.Minor.Content)
  const parts = APP_VERSION.split('.');
  const majorVersion = parts[0] || '4';
  const minorVersion = parts[1] || '1';
  const contentVersion = parts[2] || '10';

  const handleClose = () => {
    if (vibrate) vibrate(15);
    onClose();
  };

  return (
    <AnimatePresence mode="wait">
      {isOpen && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 sm:p-6 overflow-hidden">
          {/* Backdrop with optimized GPU opacity transition */}
          <motion.div
            {...modalBackdropAnimation}
            className="fixed inset-0 bg-black/75 backdrop-blur-xs transform-gpu will-change-[opacity]"
            onClick={handleClose}
          />

          {/* Modal Container with jitter-free hardware accelerated spring animation */}
          <motion.div
            {...modalContainerAnimation}
            style={modalGpuStyle}
            className="relative w-full max-w-lg bg-white dark:bg-zinc-950 border border-zinc-200/90 dark:border-zinc-800/90 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] z-10 transform-gpu overscroll-contain transition-colors duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top Glow Accent Bar */}
            <div className="absolute inset-x-0 top-0 h-[2.5px] bg-gradient-to-r from-emerald-500 via-indigo-500 to-amber-500" />

            <div className="p-5 sm:p-7 space-y-5 overflow-y-auto overscroll-contain">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-500 dark:text-emerald-400 shadow-inner shrink-0">
                    <Info className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-zinc-900 dark:text-white flex items-center gap-2">
                      <span>{t("Version Information")}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 font-mono font-bold">
                        v{APP_VERSION}
                      </span>
                    </h2>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 font-mono">
                      Major.Minor.Content
                    </p>
                  </div>
                </div>

                <button
                  onClick={handleClose}
                  className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800/80 transition-colors active:scale-95 cursor-pointer shrink-0"
                  title={t("Close")}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Format Breakdown Banner */}
              <div className="bg-zinc-100/90 dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-800/90 rounded-2xl p-4 flex items-center justify-around text-center shadow-inner">
                <div className="flex flex-col items-center">
                  <span className="text-[10px] uppercase font-extrabold text-indigo-600 dark:text-indigo-400 tracking-wider">{t("Major")}</span>
                  <span className="text-2xl font-black font-mono text-indigo-700 dark:text-indigo-300 mt-0.5">{majorVersion}</span>
                </div>
                <span className="text-zinc-400 dark:text-zinc-600 font-black text-xl select-none">.</span>
                <div className="flex flex-col items-center">
                  <span className="text-[10px] uppercase font-extrabold text-sky-600 dark:text-sky-400 tracking-wider">{t("Minor")}</span>
                  <span className="text-2xl font-black font-mono text-sky-700 dark:text-sky-300 mt-0.5">{minorVersion}</span>
                </div>
                <span className="text-zinc-400 dark:text-zinc-600 font-black text-xl select-none">.</span>
                <div className="flex flex-col items-center">
                  <span className="text-[10px] uppercase font-extrabold text-amber-600 dark:text-amber-400 tracking-wider">{t("Content")}</span>
                  <span className="text-2xl font-black font-mono text-amber-700 dark:text-amber-300 mt-0.5">{contentVersion}</span>
                </div>
              </div>

              {/* Version Breakdown Explanations */}
              <div className="space-y-3">
                {/* Major */}
                <div className="bg-zinc-50 dark:bg-zinc-900/60 border border-indigo-200/80 dark:border-indigo-500/20 rounded-2xl p-4 flex items-start gap-3.5 hover:border-indigo-500/40 transition-colors">
                  <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5">
                    <Layers className="w-4 h-4" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-black text-indigo-600 dark:text-indigo-300">{t("Major")}</span>
                      <span className="text-[11px] font-mono font-bold text-zinc-600 dark:text-zinc-400 bg-zinc-200/70 dark:bg-zinc-800 px-2 py-0.5 rounded border border-zinc-300/60 dark:border-zinc-700/60">
                        {majorVersion}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">
                      {t("For major changes in the app (core architecture, major UI overhauls, new features, breaking features).")}
                    </p>
                  </div>
                </div>

                {/* Minor */}
                <div className="bg-zinc-50 dark:bg-zinc-900/60 border border-sky-200/80 dark:border-sky-500/20 rounded-2xl p-4 flex items-start gap-3.5 hover:border-sky-500/40 transition-colors">
                  <div className="w-9 h-9 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-600 dark:text-sky-400 shrink-0 mt-0.5">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-black text-sky-600 dark:text-sky-300">{t("Minor")}</span>
                      <span className="text-[11px] font-mono font-bold text-zinc-600 dark:text-zinc-400 bg-zinc-200/70 dark:bg-zinc-800 px-2 py-0.5 rounded border border-zinc-300/60 dark:border-zinc-700/60">
                        {minorVersion}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">
                      {t("For minor changes in the app (Improving features, UI tweaks/stability, performance fixes, system stability).")}
                    </p>
                  </div>
                </div>

                {/* Content */}
                <div className="bg-zinc-50 dark:bg-zinc-900/60 border border-amber-200/80 dark:border-amber-500/20 rounded-2xl p-4 flex items-start gap-3.5 hover:border-amber-500/40 transition-colors">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0 mt-0.5">
                    <Database className="w-4 h-4" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-black text-amber-600 dark:text-amber-300">{t("Content")}</span>
                      <span className="text-[11px] font-mono font-bold text-zinc-600 dark:text-zinc-400 bg-zinc-200/70 dark:bg-zinc-800 px-2 py-0.5 rounded border border-zinc-300/60 dark:border-zinc-700/60">
                        {contentVersion}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">
                      {t("For updates in content (Movie & Series Catalog updates, collections, trending, newly added updates).")}
                    </p>
                  </div>
                </div>
              </div>

              {/* Close Button */}
              <button
                onClick={handleClose}
                className="w-full py-3.5 rounded-2xl font-black text-sm bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-lg shadow-emerald-500/20 transition-all active:scale-98 cursor-pointer"
              >
                {t("Got it")}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
