export const levenshteinDistance = (a: string, b: string): number => {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          Math.min(
            matrix[i][j - 1] + 1, // insertion
            matrix[i - 1][j] + 1 // deletion
          )
        );
      }
    }
  }

  return matrix[b.length][a.length];
};

export const smartSearch = <T extends Record<string, any>>(
  items: T[],
  query: string,
  fields: (keyof T)[] = ['title', 'name', 'displayName', 'email', 'phone'] as (keyof T)[]
): T[] => {
  if (!query.trim()) return [];

  const searchWords = query.toLowerCase().split(/[\s\-:]+/).filter(w => w.length > 0);
  if (searchWords.length === 0) return [];

  const scoredItems = items.map(item => {
    // Combine all searchable fields into one string for matching
    const searchableText = fields
      .map(f => String(item[f] || '').toLowerCase())
      .join(' ');
    
    const itemWords = searchableText.split(/[\s\-:]+/).filter(w => w.length > 0);
    
    let exactMatches = 0;
    let fuzzyMatches = 0;
    let fuzzyWordsUsed = 0;
    
    const matchedIndices = new Set<number>();

    for (const searchWord of searchWords) {
      let foundMatch = false;
      
      // 1. Try exact or prefix match
      for (let i = 0; i < itemWords.length; i++) {
        if (matchedIndices.has(i)) continue;
        const itemWord = itemWords[i];
        if (itemWord === searchWord || itemWord.startsWith(searchWord)) {
          exactMatches++;
          matchedIndices.add(i);
          foundMatch = true;
          break;
        }
      }

      // 2. Try fuzzy match (up to 2 spelling relaxations) for up to 2 words
      if (!foundMatch && fuzzyWordsUsed < 2 && searchWord.length > 2) {
        for (let i = 0; i < itemWords.length; i++) {
          if (matchedIndices.has(i)) continue;
          const itemWord = itemWords[i];
          
          const distance = levenshteinDistance(searchWord, itemWord);
          if (distance <= 2) {
            fuzzyMatches++;
            fuzzyWordsUsed++;
            matchedIndices.add(i);
            foundMatch = true;
            break;
          }
        }
      }
    }

    const totalMatches = exactMatches + fuzzyMatches;
    const matchRatio = totalMatches / searchWords.length;
    
    // Requirement: if half words match then also show results
    const isMatch = matchRatio >= 0.5;

    let score = 0;
    if (isMatch) {
      const q = query.toLowerCase();
      
      // Check individual fields for exact or startsWith matches to give higher precision
      let exactFieldMatch = false;
      let startsWithFieldMatch = false;
      
      for (const f of fields) {
        const val = String(item[f] || '').toLowerCase();
        if (val === q) {
          exactFieldMatch = true;
          break;
        }
        if (val.startsWith(q)) {
          startsWithFieldMatch = true;
        }
      }

      if (exactFieldMatch) {
        score += 50000;
      } else if (startsWithFieldMatch) {
        score += 25000;
      }

      // Exact substring match in any field gets highest priority
      if (searchableText.includes(q)) {
        score += 10000;
      }
      
      // Boost for exact word matches
      score += exactMatches * 1000;
      
      // Boost for fuzzy matches (less than exact)
      score += fuzzyMatches * 100;
      
      // Boost for match ratio
      score += matchRatio * 500;

      // Penalty for longer text (so shorter, more exact matches bubble up)
      score -= searchableText.length;
    }

    return { item, score, isMatch };
  });

  return scoredItems
    .filter(si => si.isMatch)
    .sort((a, b) => {
      // Primary sort by score descending
      if (Math.abs(b.score - a.score) > 0.001) {
        return b.score - a.score;
      }
      
      // Secondary sort by 'order' field ascending (if available)
      const orderA = a.item.order !== undefined ? a.item.order : Infinity;
      const orderB = b.item.order !== undefined ? b.item.order : Infinity;
      
      if (orderA !== orderB) {
        return orderA - orderB;
      }

      // Tertiary sort by createdAt descending (if available)
      const dateA = a.item.createdAt ? new Date(a.item.createdAt).getTime() : 0;
      const dateB = b.item.createdAt ? new Date(b.item.createdAt).getTime() : 0;
      return dateB - dateA;
    })
    .map(si => si.item);
};
