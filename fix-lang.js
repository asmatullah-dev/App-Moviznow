import fs from 'fs';
let content = fs.readFileSync('src/contexts/LanguageContext.tsx', 'utf-8');

// Add import
if (!content.includes("urdumagic")) {
  content = content.replace(
    "import React, { createContext, useContext, useState, ReactNode, useRef } from 'react';",
    "import React, { createContext, useContext, useState, ReactNode, useRef } from 'react';\nimport { UrduMagic } from 'urdumagic';\n\nconst magic = UrduMagic.init({ defaultLang: \"en\", modes: [\"en\", \"ur\", \"roman\"], showSwitcher: false, strategy: 'offline' });"
  );
}

// Replace executeBatchTranslation completely with an empty function (since we won't use it, but keep it just in case)
const batchFuncStart = content.indexOf('const executeBatchTranslation = async () => {');
const translateStart = content.indexOf('const translate = async (text: string): Promise<string> => {');

const executeBatchTranslationReplacement = `const executeBatchTranslation = async () => {
    // Deprecated: Now using offline translation instantly
  };`;

content = content.substring(0, batchFuncStart) + executeBatchTranslationReplacement + '\n\n  ' + content.substring(translateStart);

// Replace translate
const translateBodyFind = `const translate = async (text: string): Promise<string> => {
    if (language === 'en' || !text) return text;
    
    // Skip translating generic episode titles
    if (/^episode\\s+\\d+$/i.test(text.trim())) return text;
    
    const CACHE_EXPIRATION = 30 * 60 * 1000;
    const cacheKey = \`v2_trans_\${language}_\${btoa(encodeURIComponent(text.substring(0, 150)))}\`;
    
    try {
      const cached = await safeStorage.getItemAsync(cacheKey);
      if (cached) {
        const { translated, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < CACHE_EXPIRATION) {
          return translated;
        }
      }
    } catch (e) {
      // Ignore cache errors
    }

    // Check if already in-flight
    if (inFlightTranslations.current.has(text)) {
      return inFlightTranslations.current.get(text)!;
    }

    const promise = new Promise<string>((resolve, reject) => {
      pendingTranslations.current.set(text, { resolve, reject });
      
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(executeBatchTranslation, 1500); 
    });

    inFlightTranslations.current.set(text, promise);
    promise.finally(() => {
      inFlightTranslations.current.delete(text);
    });

    return promise;
  };`;

const translateBodyReplace = `const translate = async (text: string): Promise<string> => {
    if (language === 'en' || !text) return text;
    
    // Skip translating generic episode titles
    if (/^episode\\s+\\d+$/i.test(text.trim())) return text;

    const CACHE_EXPIRATION = 30 * 60 * 1000;
    const cacheKey = \`v2_trans_\${language}_\${btoa(encodeURIComponent(text.substring(0, 150)))}\`;
    
    try {
      const cached = await safeStorage.getItemAsync(cacheKey);
      if (cached) {
        const { translated, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < CACHE_EXPIRATION) {
          return translated;
        }
      }
    } catch (e) {
      // Ignore cache errors
    }

    // Check if already in-flight
    if (inFlightTranslations.current.has(text)) {
      return inFlightTranslations.current.get(text)!;
    }

    const promise = new Promise<string>(async (resolve, reject) => {
      try {
        const targetMode = language === 'ur-roman' ? 'roman' : 'ur';
        const translated = await magic.translate(text, targetMode);
        
        // Cache the result
        const cacheData = JSON.stringify({
          translated,
          timestamp: Date.now()
        });
        safeStorage.setItemAsync(cacheKey, cacheData);
        
        resolve(translated);
      } catch (e) {
        console.error("Offline translation failed", e);
        resolve(text);
      }
    });

    inFlightTranslations.current.set(text, promise);
    promise.finally(() => {
      inFlightTranslations.current.delete(text);
    });

    return promise;
  };`;

content = content.replace(translateBodyFind, translateBodyReplace);

fs.writeFileSync('src/contexts/LanguageContext.tsx', content);
