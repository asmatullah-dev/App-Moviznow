import type { Transition, Variants } from 'framer-motion';
import type React from 'react';

/**
 * Standard Jitter-Free Modal & Popup Animation Configuration
 * Provides 60fps/120fps hardware-accelerated animations across the entire application.
 */

// --- GPU ACCELERATION STYLES (prevents subpixel jitter and font blur) ---
export const modalGpuStyle: React.CSSProperties = {
  willChange: 'transform, opacity',
  transform: 'translate3d(0, 0, 0)',
  backfaceVisibility: 'hidden',
  WebkitFontSmoothing: 'subpixel-antialiased',
};

// --- BACKDROP ANIMATIONS ---
export const modalBackdropVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

export const modalBackdropTransition: Transition = {
  duration: 0.2,
  ease: 'easeOut',
};

export const modalBackdropAnimation = {
  variants: modalBackdropVariants,
  initial: 'initial',
  animate: 'animate',
  exit: 'exit',
  transition: modalBackdropTransition,
};

// --- MODAL CONTAINER ANIMATIONS (Physics Spring - Zero Jitter) ---
export const modalContainerVariants: Variants = {
  initial: { opacity: 0, scale: 0.96, y: 12 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.97, y: 8 },
};

export const modalContainerTransition: Transition = {
  type: 'spring',
  damping: 28,
  stiffness: 350,
  mass: 0.8,
};

export const modalContainerAnimation = {
  variants: modalContainerVariants,
  initial: 'initial',
  animate: 'animate',
  exit: 'exit',
  transition: modalContainerTransition,
};

// --- DROPDOWN & POPOVER ANIMATIONS ---
export const popoverVariants: Variants = {
  initial: { opacity: 0, scale: 0.96, y: -6 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.96, y: -6 },
};

export const popoverTransition: Transition = {
  type: 'spring',
  damping: 26,
  stiffness: 380,
  mass: 0.7,
};

export const popoverAnimation = {
  variants: popoverVariants,
  initial: 'initial',
  animate: 'animate',
  exit: 'exit',
  transition: popoverTransition,
};

// --- FULLSCREEN / LARGE MODAL ANIMATIONS ---
export const fullScreenModalVariants: Variants = {
  initial: { opacity: 0, scale: 0.98, y: 8 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.98, y: 8 },
};

export const fullScreenModalTransition: Transition = {
  type: 'spring',
  damping: 30,
  stiffness: 360,
  mass: 0.8,
};

export const fullScreenModalAnimation = {
  variants: fullScreenModalVariants,
  initial: 'initial',
  animate: 'animate',
  exit: 'exit',
  transition: fullScreenModalTransition,
};

// --- BOTTOM SHEET ANIMATIONS ---
export const bottomSheetVariants: Variants = {
  initial: { opacity: 0, y: '100%' },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: '100%' },
};

export const bottomSheetTransition: Transition = {
  type: 'spring',
  damping: 30,
  stiffness: 320,
  mass: 0.8,
};

export const bottomSheetAnimation = {
  variants: bottomSheetVariants,
  initial: 'initial',
  animate: 'animate',
  exit: 'exit',
  transition: bottomSheetTransition,
};
