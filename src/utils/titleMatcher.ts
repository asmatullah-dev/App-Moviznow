import { isEpisodeRange } from './linkScanner';

export const extractTitleAndYear = (rawTitle: string): {
  title: string;
  year?: number;
  season?: number;
  episode?: number;
  isEpisodeRange?: boolean;
  formatted: string;
} => {
  if (!rawTitle) return { title: '', formatted: '' };

  let text = rawTitle.trim();

  // Strip URLs (e.g. https://..., http //..., hubcloud.ist/drive/...)
  text = text
    .replace(/https?:?\s*\/\/[^\s]+/gi, ' ')
    .replace(/\b(?:https?|ftp|hubcloud|vcloud|hubdrive)\.[a-z]{2,6}\/[^\s]+/gi, ' ')
    .replace(/\b(?:drive|file)\/[a-z0-9_-]+/gi, ' ');

  // Strip sample prefix first if present
  text = text.replace(/^(?:sample|sample[-_.\s]+)/i, '').trim();

  // Strip prefix words like Download, Watch Online, Stream, etc.
  text = text.replace(/^(download|watch|stream|movie|series)\b\s*/i, '');

  // Strip domain names/suffixes like .cfd, s.cfd, s-cfd
  text = text.replace(/\b(s\.cfd|cfd|s-cfd)\b/gi, ' ');

  // Convert non-numeric dots to spaces to normalize the text structure early (keeps 5.1, 7.1)
  text = text.replace(/(?<!\d)\.(?!\d)/g, ' ');

  // Clean consecutive dots, underscores, and dots around numbers early
  text = text.replace(/\.{2,}/g, ' ').replace(/_+/g, ' ');

  // Match 4-digit year (1900-2099)
  const yearMatch = text.match(/\b(19\d\d|20[0-2]\d)\b/);
  let year: number | undefined = undefined;
  if (yearMatch) {
    year = parseInt(yearMatch[1], 10);
  }

  // Detect season & episode before noise stripping
  const hasEpRange = isEpisodeRange(rawTitle);
  let season: number | undefined = undefined;
  let episode: number | undefined = undefined;

  const combMatch = hasEpRange ? null : (
    rawTitle.match(/(?<=^|[^a-zA-Z0-9])s(\d+)\s*e(\d+)(?![a-z0-9])/i) ||
    rawTitle.match(/season[\s._-]*(\d+)[\s._-]*episode[\s._-]*(\d+)/i) ||
    rawTitle.match(/(?<=^|[^a-zA-Z0-9])dl\s+(\d+)\s+(\d+)(?![a-z0-9])/i)
  );

  if (combMatch) {
    season = parseInt(combMatch[1], 10);
    episode = parseInt(combMatch[2], 10);
  } else {
    const sMatch = rawTitle.match(/(?<=^|[^a-zA-Z0-9])(?:s(\d+)|season[\s._-]*(\d+)|ss[\s._-]*(\d+))(?![a-z0-9])/i);
    const eMatch = hasEpRange ? null : rawTitle.match(/(?<=^|[^a-zA-Z0-9])(?:e(\d+)|episode[\s._-]*(\d+)|ep[\s._-]*(\d+))(?![a-z0-9])/i);
    if (sMatch) season = parseInt(sMatch[1] || sMatch[2] || sMatch[3], 10);
    if (eMatch) episode = parseInt(eMatch[1] || eMatch[2] || eMatch[3], 10);
  }

  // Find boundaries to split before the year or the season/episode marker
  let cleanTitle = text;
  let yearIndex: number | undefined = undefined;
  let markerIndex: number | undefined = undefined;

  if (yearMatch && yearMatch.index !== undefined) {
    yearIndex = yearMatch.index;
  }

  // Match season/episode markers like S01E01, S01, season 1, ep 1, etc.
  const markerMatch = text.match(/\b(s\d+e\d+|s\d+|season\s*\d+|episode\s*\d+|ep\s*\d+)\b/i);
  if (markerMatch && markerMatch.index !== undefined) {
    markerIndex = markerMatch.index;
  }

  // Use the earliest split indicator to isolate the clean series title
  let splitIndex: number | undefined = undefined;
  if (yearIndex !== undefined && markerIndex !== undefined) {
    splitIndex = Math.min(yearIndex, markerIndex);
  } else if (yearIndex !== undefined) {
    splitIndex = yearIndex;
  } else if (markerIndex !== undefined) {
    splitIndex = markerIndex;
  }

  if (splitIndex !== undefined && splitIndex > 0) {
    let beforeSplit = text.substring(0, splitIndex).trim();
    beforeSplit = beforeSplit.replace(/[\(\[\{\-_.\s]+$/, '').trim();
    if (beforeSplit.length > 1) {
      cleanTitle = beforeSplit;
    }
  }

  // Remove resolution, quality, format, audio, language noise keywords, domain tags, channel tags
  const noiseRegex = /\b(480p|720p|1080p|2160p|4k|2k|ds4k|ds-4k|hdrip|web-dl|webrip|web-?dlrip|bluray|brrip|dvdrip|hdtv|camrip|dual audio|multi audio|hindi|english|tamil|telugu|punjabi|malayalam|kannada|bengali|marathi|urdu|subtitles|esub|esubs|x264|x265|hevc|aac|ac3|eac3|dts|dd\+?|5\.1|7\.1|2\.0|5\s+1|7\s+1|2\s+0|hdhub4u(\.[a-z]+)?|moviesdrive(\.[a-z]+)?|skymovieshd(\.[a-z]+)?|filmygo(\.[a-z]+)?|filmyfly(\.[a-z]+)?|hubcloud(\.[a-z]+)?|hubdrive(\.[a-z]+)?|ms|mkv|mp4|zip|rar|download|full movie|movie|season \d+|s\d+e\d+|cfd|s\.cfd|s-cfd|org|cleaned?|hq|uncut|remastered|extended|directors?\s*cut|proper|dubbed|web\s*series)\b/gi;

  cleanTitle = cleanTitle.replace(noiseRegex, '').replace(/[()\[\]{}:_|-]+/g, ' ').replace(/\s+/g, ' ').trim();

  // Explicitly strip any season markers (S1, S2, S3, S4, S5, S01, S02, S03, Season 1, Season 2, etc.) from title
  cleanTitle = cleanTitle
    .replace(/\b(seasons?|s)\s*[-_]?\s*\d{1,2}\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Additional cleanup for remaining lone site tags or domain endings like "hdhub4u ms", "ms", etc.
  cleanTitle = cleanTitle
    .replace(/\b(hdhub4u|moviesdrive|skymovies|filmygo|filmyfly|hubcloud|vcloud|hubdrive)\b/gi, '')
    .replace(/\bms\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Capitalize properly
  if (cleanTitle) {
    cleanTitle = cleanTitle
      .split(' ')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  }

  const formatted = year && cleanTitle ? `${cleanTitle} (${year})` : cleanTitle;

  return { title: cleanTitle, year, season, episode, isEpisodeRange: hasEpRange, formatted };
};

export const normalizeTitle = (str: string): string => {
  return str.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');
};

export const normalizeNumerals = (str: string): string => {
  return str
    .toLowerCase()
    .replace(/\bpart\s*one\b/gi, 'part 1')
    .replace(/\bpart\s*two\b/gi, 'part 2')
    .replace(/\bpart\s*three\b/gi, 'part 3')
    .replace(/\bpart\s*four\b/gi, 'part 4')
    .replace(/\bpart\s*five\b/gi, 'part 5')
    .replace(/\bchapter\s*one\b/gi, 'chapter 1')
    .replace(/\bchapter\s*two\b/gi, 'chapter 2')
    .replace(/\bchapter\s*three\b/gi, 'chapter 3')
    .replace(/\bchapter\s*four\b/gi, 'chapter 4')
    .replace(/\bchapter\s*five\b/gi, 'chapter 5')
    .replace(/\b(viii|8th)\b/gi, '8')
    .replace(/\b(vii|7th)\b/gi, '7')
    .replace(/\b(vi|6th)\b/gi, '6')
    .replace(/\b(iv|4th)\b/gi, '4')
    .replace(/\b(v|5th)\b/gi, '5')
    .replace(/\b(iii|3rd)\b/gi, '3')
    .replace(/\b(ii|2nd)\b/gi, '2')
    .replace(/\b(ix|9th)\b/gi, '9')
    .replace(/\b(x|10th)\b/gi, '10');
};

export const extractSequelTag = (str: string): string | null => {
  const norm = normalizeNumerals(str);
  const partMatch = norm.match(/\b(?:part|chapter|volume|vol)\s*(\d+)\b/i);
  if (partMatch) return `part${partMatch[1]}`;
  const numMatch = norm.match(/\b(\d+)\b/);
  if (numMatch && (numMatch[1].length < 4 || parseInt(numMatch[1], 10) < 1900)) {
    return numMatch[1];
  }
  return null;
};

export const normalizeCleanForMatch = (str: string): string => {
  return normalizeNumerals(str)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\b(a|an|the)\b/gi, ' ')
    .replace(/[^a-z0-9]/g, '');
};

export const tokenizeCleanForMatch = (str: string): string[] => {
  return normalizeNumerals(str)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\b(a|an|the|of|in|for|and|to|movie|film|series|hindi|english|tamil|telugu|kannada|malayalam|punjabi|bengali|marathi|urdu|dual|multi|audio|dubbed|org|cleaned?|hq|uncut|remastered|extended|directors?\s*cut|proper|complete|all\s*episodes|season\s*\d+|s\d+|ep\s*\d+|e\d+|full\s*movie|hdrip|webrip|web-?dl|bluray|brrip|dvdrip|hevc|x264|x265|10bit|aac|esubs?)\b/gi, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0);
};

export const levenshteinDistance = (a: string, b: string): number => {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
};

export const isPreciseTitleMatch = (postCleanTitle: string, contentRawTitle: string): boolean => {
  if (!postCleanTitle || !contentRawTitle) return false;

  const contentParsed = extractTitleAndYear(contentRawTitle);
  const contentCleanTitle = contentParsed.title || contentRawTitle;

  const normP = normalizeCleanForMatch(postCleanTitle);
  const normC = normalizeCleanForMatch(contentCleanTitle);

  // Exact normalized match
  if (normP && normC && normP === normC) return true;

  const pTokens = tokenizeCleanForMatch(postCleanTitle);
  const cTokens = tokenizeCleanForMatch(contentCleanTitle);

  if (pTokens.length === 0 || cTokens.length === 0) return false;

  // Sequel / number mismatch check
  const pSeq = extractSequelTag(postCleanTitle);
  const cSeq = extractSequelTag(contentCleanTitle);
  if (pSeq !== cSeq) {
    if (pSeq || cSeq) return false;
  }

  // Exact token match
  if (pTokens.join(' ') === cTokens.join(' ')) return true;

  // Token containment: all core target tokens are present in post tokens in order
  if (cTokens.length >= 1 && pTokens.length >= cTokens.length) {
    let cIdx = 0;
    for (let i = 0; i < pTokens.length; i++) {
      if (pTokens[i] === cTokens[cIdx]) {
        cIdx++;
        if (cIdx === cTokens.length) break;
      }
    }
    if (cIdx === cTokens.length) {
      if (pSeq === cSeq) return true;
    }
  }

  // Single-word typo or minor punctuation difference if word counts match
  if (pTokens.length === cTokens.length && normP.length >= 6 && normC.length >= 6) {
    let diffWords = 0;
    for (let i = 0; i < pTokens.length; i++) {
      if (pTokens[i] !== cTokens[i]) {
        diffWords++;
        const dist = levenshteinDistance(pTokens[i], cTokens[i]);
        if (dist > 1 && (pTokens[i].length < 8 || dist > 2)) return false;
      }
    }
    if (diffWords <= 1) return true;
  }

  return false;
};

export const isFlexibleTitleMatch = (postCleanTitle: string, contentRawTitle: string): boolean => {
  return isPreciseTitleMatch(postCleanTitle, contentRawTitle);
};
