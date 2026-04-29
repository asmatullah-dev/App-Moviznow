import React from 'react';
import { useScrollRestoration } from '../hooks/useScrollRestoration';

interface ScrollableRowProps extends React.HTMLAttributes<HTMLDivElement> {
  scrollKey: string;
  children: React.ReactNode;
}

export const ScrollableRow = React.forwardRef<HTMLDivElement, ScrollableRowProps>(
  ({ scrollKey, children, className, style, ...props }, forwardedRef) => {
    const internalRef = useScrollRestoration<HTMLDivElement>(scrollKey);
    
    // Merge refs if needed (simple implementation)
    const setRefs = React.useCallback(
      (node: HTMLDivElement) => {
        // @ts-ignore
        internalRef.current = node;
        if (typeof forwardedRef === 'function') {
          forwardedRef(node);
        } else if (forwardedRef) {
          forwardedRef.current = node;
        }
      },
      [forwardedRef, internalRef]
    );

    return (
      <div 
        ref={setRefs} 
        className={className} 
        style={style} 
        {...props}
      >
        {children}
      </div>
    );
  }
);

ScrollableRow.displayName = 'ScrollableRow';
