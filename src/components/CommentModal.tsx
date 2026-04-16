import React, { useState } from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useModalBehavior } from '../hooks/useModalBehavior';

interface CommentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (comment: string) => void;
  initialComment: string;
}

export default function CommentModal({ isOpen, onClose, onSave, initialComment }: CommentModalProps) {
  const [comment, setComment] = useState(initialComment);

  useModalBehavior(isOpen, onClose);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="relative bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-md p-6 shadow-2xl transition-colors duration-300"
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-zinc-900 dark:text-white transition-colors duration-300">Add Comment</h2>
              <button onClick={onClose} className="text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Enter comment..."
              className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg p-3 text-sm text-zinc-900 dark:text-white placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 min-h-[120px] mb-4 transition-colors duration-300"
            />
            <div className="flex justify-end gap-2">
              <button onClick={onClose} className="px-4 py-2 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white text-sm transition-colors">Cancel</button>
              <button 
                onClick={() => { onSave(comment); onClose(); }}
                className="px-4 py-2 bg-emerald-600 text-zinc-900 dark:text-white rounded-lg text-sm font-bold hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-500/20"
              >
                Save Comment
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
