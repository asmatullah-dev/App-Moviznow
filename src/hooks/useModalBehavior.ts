import { useEffect, useRef } from 'react';

interface ModalEntry {
  id: string;
  onClose: () => void;
  pushedHistory: boolean;
}

// Global active modal stack
const modalStack: ModalEntry[] = [];
let isHandlingPopState = false;
let isProgrammaticBack = false;

function updateBodyScroll() {
  if (typeof document === 'undefined') return;
  const currentCount = modalStack.length;
  if (currentCount > 0) {
    if (!document.body.hasAttribute('data-original-overflow')) {
      document.body.setAttribute('data-original-overflow', document.body.style.overflow || '');
      document.body.style.overflow = 'hidden';
    }
    document.body.setAttribute('data-modal-count', currentCount.toString());
  } else {
    const originalOverflow = document.body.getAttribute('data-original-overflow');
    document.body.style.overflow = originalOverflow || '';
    document.body.removeAttribute('data-original-overflow');
    document.body.removeAttribute('data-modal-count');
  }
}

// Global popstate handler for all modals
if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    if (isProgrammaticBack) {
      isProgrammaticBack = false;
      return;
    }

    if (modalStack.length > 0) {
      // Hardware / OS back button was pressed
      const topModal = modalStack.pop();
      if (topModal) {
        topModal.pushedHistory = false;
        isHandlingPopState = true;
        try {
          topModal.onClose();
        } finally {
          isHandlingPopState = false;
          updateBodyScroll();
        }
      }
    }
  });
}

export function useModalBehavior(isOpen: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  const modalIdRef = useRef<string>('');
  if (!modalIdRef.current) {
    modalIdRef.current = `modal_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  }
  const modalId = modalIdRef.current;
  const hasPushedRef = useRef(false);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) {
      // Modal closed
      const existingIdx = modalStack.findIndex(m => m.id === modalId);
      if (existingIdx !== -1) {
        const [removed] = modalStack.splice(existingIdx, 1);
        updateBodyScroll();

        // If this modal pushed a history state and we are NOT handling a popstate event,
        // pop the history state programmatically to keep history clean.
        if (removed.pushedHistory && !isHandlingPopState && typeof window !== 'undefined') {
          if (window.history.state?.__modalId === modalId) {
            isProgrammaticBack = true;
            window.history.back();
          }
        }
      }
      hasPushedRef.current = false;
      return;
    }

    // Modal opened
    const alreadyInStack = modalStack.some(m => m.id === modalId);
    if (!alreadyInStack) {
      // Push state into window.history preserving existing React Router state
      if (typeof window !== 'undefined') {
        const currentState = window.history.state || {};
        window.history.pushState({ ...currentState, __modalId: modalId }, '');
        hasPushedRef.current = true;
      }

      modalStack.push({
        id: modalId,
        onClose: () => onCloseRef.current(),
        pushedHistory: hasPushedRef.current
      });
      updateBodyScroll();
    }

    return () => {
      // Component unmounting while modal was open
      const idx = modalStack.findIndex(m => m.id === modalId);
      if (idx !== -1) {
        modalStack.splice(idx, 1);
        updateBodyScroll();
        // On unmount, do NOT call window.history.back() to avoid skipping route transitions
      }
    };
  }, [isOpen, modalId]);
}
