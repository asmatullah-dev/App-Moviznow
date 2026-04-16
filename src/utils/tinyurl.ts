export const generateTinyUrl = async (url: string, useAlias: boolean = true, aliasPrefix: string = '3363284466'): Promise<string> => {
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

  // If it's already a tinyurl, don't shorten it
  if (url.includes('tinyurl.com') || url.includes('bit.ly') || url.includes('t.ly')) {
    return url;
  }

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
    
    const response = await fetch(`/api/tinyurl?url=${encodeURIComponent(url)}${aliasParam}`);
    
    if (response.ok) {
      const shortUrl = await response.text();
      if (shortUrl && shortUrl.startsWith('http') && !shortUrl.toLowerCase().includes('<html')) {
        return shortUrl;
      }
    }
    
    // If alias is taken or other error, try without alias or retry with new alias
    const retryResponse = await fetch(`/api/tinyurl?url=${encodeURIComponent(url)}`);
    if (retryResponse.ok) {
      const shortUrl = await retryResponse.text();
      if (shortUrl && shortUrl.startsWith('http') && !shortUrl.toLowerCase().includes('<html')) {
        return shortUrl;
      }
    }
  } catch (error) {
    console.error("Error generating TinyURL:", error);
  }
  
  return url; // Fallback to original url
};
