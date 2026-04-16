import { useEffect, useRef } from 'react';

export function useModalBehavior(isOpen: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  const modalIdRef = useRef(`modal_${Date.now()}_${Math.random()}`);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;

    const modalCount = parseInt(document.body.getAttribute('data-modal-count') || '0');
    
    if (modalCount === 0) {
      document.body.setAttribute('data-original-overflow', document.body.style.overflow || '');
      document.body.style.overflow = 'hidden';
    }
    document.body.setAttribute('data-modal-count', (modalCount + 1).toString());

    const modalId = modalIdRef.current;

    const handlePopState = (event: PopStateEvent) => {
      if (event.state?.modalId !== modalId) {
        onCloseRef.current();
      }
    };

    window.history.pushState({ modalId }, '');
    window.addEventListener('popstate', handlePopState);

    return () => {
      const currentCount = parseInt(document.body.getAttribute('data-modal-count') || '0');
      const newCount = Math.max(0, currentCount - 1);
      document.body.setAttribute('data-modal-count', newCount.toString());
      
      if (newCount === 0) {
        const originalOverflow = document.body.getAttribute('data-original-overflow');
        document.body.style.overflow = originalOverflow || '';
        document.body.removeAttribute('data-original-overflow');
      }
      
      window.removeEventListener('popstate', handlePopState);
      
      if (window.history.state?.modalId === modalId) {
        window.history.back();
      }
    };
  }, [isOpen]);
}
