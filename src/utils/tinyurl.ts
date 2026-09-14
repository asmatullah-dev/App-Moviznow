const tinyUrlMemoryCache = new Map<string, string>();

export const generateTinyUrl = async (url: string, useAlias: boolean = true, aliasPrefix: string = '3416286423'): Promise<string> => {
  if (!url || typeof url !== 'string') return url;
  
  // If it's HTML content, don't try to shorten it
  const trimmed = url.trim().toLowerCase();
  if (trimmed.includes('<html') || trimmed.includes('<!doctype') || trimmed.includes('<head') || trimmed.includes('<body')) {
    return '';
  }

  // If it's already a pixeldrain link, don't shorten it
  if (url.includes('pixeldrain.com') || url.includes('pixeldrain.dev') || url.includes('pixeldrain.net') || url.includes('pixel.drain') || url.includes('pixeldra.in')) {
    return url;
  }

  // If it's already a tinyurl or shortener, don't shorten it
  if (url.includes('tinyurl.com') || url.includes('bit.ly') || url.includes('t.ly') || url.includes('t.me')) {
    return url;
  }

  const cacheKey = `tiny_${url}_${useAlias ? aliasPrefix : 'noalias'}`;
  if (tinyUrlMemoryCache.has(cacheKey)) {
    return tinyUrlMemoryCache.get(cacheKey)!;
  }

  try {
    const cachedLocal = sessionStorage.getItem(cacheKey);
    if (cachedLocal && cachedLocal.startsWith('http')) {
      tinyUrlMemoryCache.set(cacheKey, cachedLocal);
      return cachedLocal;
    }
  } catch (e) {}

  try {
    let aliasParam = '';
    if (useAlias) {
      // Generate a random alphabet character
      const alphabet = 'abcdefghijklmnopqrstuvwxyz';
      const firstChar = alphabet[Math.floor(Math.random() * alphabet.length)];
      // Generate 3 random alphanumeric characters
      const randomChars = Math.random().toString(36).substring(2, 5);
      const alias = `${aliasPrefix}${firstChar}${randomChars}`;
      aliasParam = `&alias=${alias}`;
    }
    
    // Fast 3-second timeout to prevent stalling
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(`/api/tinyurl?url=${encodeURIComponent(url)}${aliasParam}`, {
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    
    if (response.ok) {
      const shortUrl = await response.text();
      if (shortUrl && shortUrl.startsWith('http') && !shortUrl.toLowerCase().includes('<html')) {
        tinyUrlMemoryCache.set(cacheKey, shortUrl);
        try { sessionStorage.setItem(cacheKey, shortUrl); } catch (e) {}
        return shortUrl;
      }
    }
    
    // If alias is taken or other error, try without alias with 2-second timeout
    const retryController = new AbortController();
    const retryTimeoutId = setTimeout(() => retryController.abort(), 2000);
    const retryResponse = await fetch(`/api/tinyurl?url=${encodeURIComponent(url)}`, {
      signal: retryController.signal
    });
    clearTimeout(retryTimeoutId);

    if (retryResponse.ok) {
      const shortUrl = await retryResponse.text();
      if (shortUrl && shortUrl.startsWith('http') && !shortUrl.toLowerCase().includes('<html')) {
        tinyUrlMemoryCache.set(cacheKey, shortUrl);
        try { sessionStorage.setItem(cacheKey, shortUrl); } catch (e) {}
        return shortUrl;
      }
    }
  } catch (error) {
    // Timeout or network error - fall back immediately without throwing
  }
  
  return url; // Fallback to original url
};

