import fs from 'fs';
let content = fs.readFileSync('src/contexts/LanguageContext.tsx', 'utf-8');

// Remove urdumagic import
content = content.replace("import { UrduMagic } from 'urdumagic';\n\nconst magic = UrduMagic.init({ defaultLang: \"en\", modes: [\"en\", \"ur\", \"roman\"], showSwitcher: false, strategy: 'offline' });\n", "");
content = content.replace("import { UrduMagic } from 'urdumagic';\n\nconst magic = UrduMagic.init({ defaultLang: \"en\", modes: [\"en\", \"ur\", \"roman\"], showSwitcher: false, strategy: 'offline' });", "");


const executeBatchFind = `const executeBatchTranslation = async () => {
    // Deprecated: Now using offline translation instantly
  };`;

const executeBatchReplace = `const executeBatchTranslation = async () => {
    if (pendingTranslations.current.size === 0) return;
    
    if (failureCount.current >= MAX_FAILURES) {
      console.warn("Translation disabled due to multiple failures");
      const itemsToTranslate = Array.from(pendingTranslations.current.entries());
      pendingTranslations.current.clear();
      itemsToTranslate.forEach(([text, { resolve }]) => resolve(text));
      return;
    }

    const itemsToTranslate = Array.from(pendingTranslations.current.entries());
    pendingTranslations.current.clear();
    
    setIsTranslating(true);
    
    const targetLangName = language === 'ur-roman' ? 'Roman Urdu (written with English alphabet)' : 'Urdu';
    
    try {
      const texts = itemsToTranslate.map(([text]) => text);
      
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: texts, targetLanguage: targetLangName })
      });
      const data = await res.json();
      
      if (data.translation && Array.isArray(data.translation)) {
        const translatedArray = data.translation;
        const CACHE_EXPIRATION = 30 * 60 * 1000;
        
        itemsToTranslate.forEach(([text, { resolve }], index) => {
          const translated = translatedArray[index] || text;
          const cacheKey = \`v2_trans_\${language}_\${btoa(encodeURIComponent(text.substring(0, 150)))}\`;
          const cacheData = JSON.stringify({
            translated,
            timestamp: Date.now()
          });
          safeStorage.setItemAsync(cacheKey, cacheData);
          resolve(translated);
        });
        failureCount.current = 0; // Reset on success
      } else {
        failureCount.current++;
        itemsToTranslate.forEach(([text, { resolve }]) => resolve(text));
      }
    } catch (e) {
      console.error("Batch translation failed", e);
      failureCount.current++;
      itemsToTranslate.forEach(([text, { resolve }]) => resolve(text));
    } finally {
      setIsTranslating(false);
    }
  };`;

content = content.replace(executeBatchFind, executeBatchReplace);


const translateFind = `const promise = new Promise<string>(async (resolve, reject) => {
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
    });`;

const translateReplace = `const promise = new Promise<string>((resolve, reject) => {
      pendingTranslations.current.set(text, { resolve, reject });
      
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(executeBatchTranslation, 1500); 
    });`;

content = content.replace(translateFind, translateReplace);

fs.writeFileSync('src/contexts/LanguageContext.tsx', content);
