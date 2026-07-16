import React from 'react';
import { motion } from 'framer-motion';

export const PageTransition = ({ children, className = '' }: { children: React.ReactNode, className?: string }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -30, scale: 0.98 }}
      transition={{ duration: 0.5, type: 'spring', bounce: 0.3 }}
      className={className}
    >
      {children}
    </motion.div>
  );
};
