import React from 'react';
import { motion } from 'framer-motion';

export const PageTransition = ({ children, className = '' }: { children: React.ReactNode, className?: string }) => {
  return (
    <div className={`w-full ${className}`}>
      {children}
    </div>
  );
};
