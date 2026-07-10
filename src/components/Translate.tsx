import React, { useEffect, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';

/**
 * Component for AI-powered translation (primarily for long-form content like synopses)
 */
export const Translate: React.FC<{ 
  children: string | React.ReactNode;
  loadingFallback?: React.ReactNode;
}> = ({ children, loadingFallback }) => {
  const { language, translate } = useLanguage();
  const [translated, setTranslated] = useState<string | React.ReactNode>(children);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (language === 'en') {
      setTranslated(children);
      setLoading(false);
      return;
    }

    if (typeof children === 'string' && children.trim()) {
      let isMounted = true;
      setLoading(true);
      translate(children).then(res => {
        if (isMounted) {
          setTranslated(res);
          setLoading(false);
        }
      });
      return () => { isMounted = false; };
    } else {
      setTranslated(children);
      setLoading(false);
    }
  }, [children, language, translate]);

  if (loading && loadingFallback && language !== 'en') {
    return <>{loadingFallback}</>;
  }

  return (
    <span className={language === 'ur' ? 'urdu-font' : ''}>
      {translated}
    </span>
  );
};
