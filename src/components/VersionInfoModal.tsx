import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Info, Sparkles, Layers, Database } from 'lucide-react';
import { useModalBehavior } from '../hooks/useModalBehavior';
import { useLanguage } from '../contexts/LanguageContext';
import { APP_VERSION } from '../version';

interface VersionInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function VersionInfoModal({ isOpen, onClose }: VersionInfoModalProps) {
  const { t } = useLanguage();
  useModalBehavior(isOpen, onClose);

  // Parse version parts (Major.Minor.Content)
  const parts = APP_VERSION.split('.');
  const majorVersion = parts[0] || '4';
  const minorVersion = parts[1] || '0';
  const contentVersion = parts[2] || '09';

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
            onClick={onClose}
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="relative bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl text-white"
          >
            {/* Top Glow Accent */}
            <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-emerald-500 via-indigo-500 to-amber-500" />

            <div className="p-6 sm:p-7 space-y-6">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-inner">
                    <Info className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black text-white flex items-center gap-2">
                      <span>{t("Version Information")}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-mono">
                        v{APP_VERSION}
                      </span>
                    </h2>
                    <p className="text-xs text-zinc-400 mt-0.5 font-mono">
                      Major.Minor.Content
                    </p>
                  </div>
                </div>

                <button
                  onClick={onClose}
                  className="text-zinc-400 hover:text-white p-2 rounded-full hover:bg-zinc-800 transition-colors active:scale-95"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Format Breakdown Banner */}
              <div className="bg-gradient-to-r from-zinc-950 via-zinc-900 to-zinc-950 border border-zinc-800/90 rounded-2xl p-4 flex items-center justify-around text-center shadow-inner">
                <div className="flex flex-col items-center">
                  <span className="text-[10px] uppercase font-extrabold text-indigo-400 tracking-wider">{t("Major")}</span>
                  <span className="text-2xl font-black font-mono text-indigo-300 mt-0.5">{majorVersion}</span>
                </div>
                <span className="text-zinc-600 font-black text-xl">.</span>
                <div className="flex flex-col items-center">
                  <span className="text-[10px] uppercase font-extrabold text-sky-400 tracking-wider">{t("Minor")}</span>
                  <span className="text-2xl font-black font-mono text-sky-300 mt-0.5">{minorVersion}</span>
                </div>
                <span className="text-zinc-600 font-black text-xl">.</span>
                <div className="flex flex-col items-center">
                  <span className="text-[10px] uppercase font-extrabold text-amber-400 tracking-wider">{t("Content")}</span>
                  <span className="text-2xl font-black font-mono text-amber-300 mt-0.5">{contentVersion}</span>
                </div>
              </div>

              {/* Version Breakdown Explanations */}
              <div className="space-y-3">
                {/* Major */}
                <div className="bg-zinc-950/70 border border-indigo-500/20 rounded-2xl p-4 flex items-start gap-3.5 hover:border-indigo-500/40 transition-colors">
                  <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0 mt-0.5">
                    <Layers className="w-4 h-4" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-black text-indigo-300">{t("Major")}</span>
                      <span className="text-[11px] font-mono font-bold text-zinc-400 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
                        {majorVersion}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-300 leading-relaxed">
                      {t("For major changes in the app (core architecture, major UI overhauls, new features, breaking features).")}
                    </p>
                  </div>
                </div>

                {/* Minor */}
                <div className="bg-zinc-950/70 border border-sky-500/20 rounded-2xl p-4 flex items-start gap-3.5 hover:border-sky-500/40 transition-colors">
                  <div className="w-9 h-9 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400 shrink-0 mt-0.5">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-black text-sky-300">{t("Minor")}</span>
                      <span className="text-[11px] font-mono font-bold text-zinc-400 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
                        {minorVersion}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-300 leading-relaxed">
                      {t("For minor changes in the app (Improving features, UI tweaks/stability, performance fixes, system stability).")}
                    </p>
                  </div>
                </div>

                {/* Content */}
                <div className="bg-zinc-950/70 border border-amber-500/20 rounded-2xl p-4 flex items-start gap-3.5 hover:border-amber-500/40 transition-colors">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0 mt-0.5">
                    <Database className="w-4 h-4" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-black text-amber-300">{t("Content")}</span>
                      <span className="text-[11px] font-mono font-bold text-zinc-400 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
                        {contentVersion}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-300 leading-relaxed">
                      {t("For updates in content (Movie & Series Catalog updates, collections, trending, newly added updates).")}
                    </p>
                  </div>
                </div>
              </div>

              {/* Close Button */}
              <button
                onClick={onClose}
                className="w-full py-3 rounded-2xl font-extrabold text-sm bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-lg shadow-emerald-500/20 transition-all active:scale-98"
              >
                {t("Got it")}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
