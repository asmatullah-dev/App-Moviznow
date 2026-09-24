import React from 'react';
import { motion, useReducedMotion, Variants } from 'framer-motion';

const pageVariants: Variants = {
  initial: {
    opacity: 0,
  },
  animate: {
    opacity: 1,
    transition: {
      duration: 0.3,
      ease: [0.16, 1, 0.3, 1],
    },
  },
  exit: {
    opacity: 0,
    transition: {
      duration: 0.2,
      ease: [0.16, 1, 0.3, 1],
    },
  },
};

const reducedVariants: Variants = {
  initial: { opacity: 1 },
  animate: { opacity: 1 },
  exit: { opacity: 1 },
};

export const PageTransition = ({ 
  children, 
  className = '' 
}: { 
  children: React.ReactNode; 
  className?: string;
}) => {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      variants={shouldReduceMotion ? reducedVariants : pageVariants}
      initial="initial"
      animate="animate"
      className={`w-full ${className}`}
    >
      {children}
    </motion.div>
  );
};
