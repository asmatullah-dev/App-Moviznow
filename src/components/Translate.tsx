import React, { useEffect, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { canUserUseAiTranslation } from '../utils/roleUtils';

/**
 * Component for AI-powered translation (primarily for long-form content like synopses)
 * AI translation is strictly restricted to admin, owner & VIP users only.
 */
export const Translate: React.FC<{ 
  children: string | React.ReactNode;
  loadingFallback?: React.ReactNode;
}> = ({ children, loadingFallback }) => {
  const { language, translate } = useLanguage();
  const { profile, user } = useAuth();
  const [translated, setTranslated] = useState<string | React.ReactNode>(children);
  const [loading, setLoading] = useState(false);

  const canAiTranslate = canUserUseAiTranslation(profile, user);

  useEffect(() => {
    if (language === 'en' || !canAiTranslate) {
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
  }, [children, language, translate, canAiTranslate]);

  if (!canAiTranslate || language === 'en') {
    return <>{children}</>;
  }

  if (loading && loadingFallback) {
    return <>{loadingFallback}</>;
  }

  return (
    <span className={language === 'ur' ? 'urdu-font' : ''}>
      {translated}
    </span>
  );
};
