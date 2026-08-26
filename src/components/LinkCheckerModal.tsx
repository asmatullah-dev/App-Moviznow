import React, { useMemo, useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Link as LinkIcon,
  ClipboardPaste,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  Copy,
  Trash2,
  FileDown,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  Info,
  Siren,
  Plus,
  X,
  Server,
  Search,
  Download,
  ExternalLink,
  Film,
  Globe,
  Loader2 as LoaderIcon
} from "lucide-react";
import { QualityLinks, Language, Quality, LinkDef, Content } from '../types';
import { useAdminContent } from '../contexts/AdminContentContext';
import { 
  LinkCheckResult, 
  StatusLabel, 
  normalizeUrl, 
  splitLinks, 
  guessLinkType, 
  detectMetadataForLink, 
  buildMismatchWarnings,
  performFullLinkScan
} from '../utils/linkScanner';
import { useModalBehavior } from '../hooks/useModalBehavior';
import {
  getMoviesdriveDomain,
  setMoviesdriveDomain,
  getSkymoviesDomain,
  setSkymoviesDomain,
  getFilmygoDomain,
  setFilmygoDomain
} from '../utils/domains';

export const isMissingPixeldrain = (r: { url?: string; candidates?: Array<{ text: string; href: string }> } | null | undefined): boolean => {
  if (!r || !r.url) return false;
  const url = r.url.toLowerCase();
  const isHubcloud = url.includes("hubcloud") || url.includes("vcloud") || url.includes("hubdrive") || url.includes("drivehub") || url.includes("gdflix") || url.includes("hubcdn") || url.includes("hblinks");
  if (!isHubcloud) return false;
  if (!r.candidates || r.candidates.length === 0) return true;
  return !r.candidates.some(c => 
    (c.text && c.text.toLowerCase().includes("pixeldrain")) || 
    (c.href && c.href.toLowerCase().includes("pixeldrain"))
  );
};

export const getLocationTag = (item: {
  season?: number;
  episode?: number;
  isFullSeasonMKV?: boolean;
  isFullSeasonZIP?: boolean;
  fileName?: string;
  url?: string;
  finalUrl?: string;
  locationName?: string;
  linkName?: string;
  qualityLabel?: string;
  codecLabel?: string;
}): string | null => {
  if (item.locationName && item.locationName.trim().length > 0) {
    let loc = item.locationName.trim();
    if (item.isFullSeasonZIP && !/\bZIP\b/i.test(loc)) {
      loc = `${loc} ZIP`;
    } else if (item.isFullSeasonMKV && !/\bMKV\b/i.test(loc)) {
      loc = `${loc} MKV`;
    }
    return loc;
  }
  if (item.linkName && item.linkName.trim().length > 0) {
    let loc = item.linkName.trim();
    if (item.isFullSeasonZIP && !/\bZIP\b/i.test(loc)) {
      loc = `${loc} ZIP`;
    } else if (item.isFullSeasonMKV && !/\bMKV\b/i.test(loc)) {
      loc = `${loc} MKV`;
    }
    return loc;
  }

  let season = item.season;
  let episode = item.episode;
  let isFullSeasonMKV = item.isFullSeasonMKV;
  let isFullSeasonZIP = item.isFullSeasonZIP;

  // Fallback parsing from fileName, url, or finalUrl if season or episode missing
  if (season === undefined && episode === undefined) {
    const textToScan = `${item.fileName || ''} ${item.finalUrl || ''} ${item.url || ''}`.toLowerCase();
    const hasRange = /(?:e|ep|episode)\s*\d+\s*(?:-|to|&)\s*(?:e|ep)?\d+/i.test(textToScan);

    const combinedMatch = hasRange ? null : (
      textToScan.match(/(?<=^|[^a-zA-Z0-9])s(\d+)\s*e(\d+)(?![a-z0-9])/i) ||
      textToScan.match(/season\s*(\d+).*?episode\s*(\d+)/i) ||
      textToScan.match(/(?<=^|[^a-zA-Z0-9])dl\s+(\d+)\s+(\d+)(?![a-z0-9])/i)
    );

    if (combinedMatch) {
      season = parseInt(combinedMatch[1], 10);
      episode = parseInt(combinedMatch[2], 10);
    } else {
      const sMatch = textToScan.match(/(?<=^|[^a-zA-Z0-9])(?:s(\d+)|season\s*(\d+)|ss\s*(\d+))(?![a-z0-9])/i);
      const eMatch = hasRange ? null : textToScan.match(/(?<=^|[^a-zA-Z0-9])(?:e(\d+)|episode\s*(\d+)|ep\s*(\d+))(?![a-z0-9])/i);

      if (sMatch) season = parseInt(sMatch[1] || sMatch[2] || sMatch[3], 10);
      if (eMatch) episode = parseInt(eMatch[1] || eMatch[2] || eMatch[3], 10);

      if (textToScan.includes(".zip")) isFullSeasonZIP = true;
      else if (textToScan.includes(".mkv") || hasRange || /full season|complete season|all episodes/i.test(textToScan)) {
        isFullSeasonMKV = true;
      }
    }
  }

  const qual = item.qualityLabel || '';
  const codec = item.codecLabel ? ` ${item.codecLabel}` : '';

  if (season !== undefined && episode !== undefined) {
    return `S${season}E${episode}`;
  }
  if (season !== undefined) {
    if (isFullSeasonZIP) return qual ? `S${season} ${qual}${codec} ZIP`.trim() : `S${season} ZIP`;
    if (isFullSeasonMKV) return qual ? `S${season} ${qual}${codec} MKV`.trim() : `S${season} MKV`;
    return `S${season}`;
  }
  if (episode !== undefined) {
    return `E${episode}`;
  }
  if (isFullSeasonZIP) {
    return qual ? `${qual}${codec} ZIP`.trim() : 'ZIP';
  }
  if (isFullSeasonMKV) {
    return qual ? `${qual}${codec} MKV`.trim() : 'MKV';
  }

  if (qual) {
    return `${qual}${codec}`.trim();
  }

  return null;
};

const PostPoster: React.FC<{ image?: string; title: string }> = ({ image, title }) => {
  const [imgError, setImgError] = useState(false);

  const isDummy = !image || imgError || /arw\.gif|logo|favicon|icon|\.gif$/i.test(image);

  if (isDummy) {
    return (
      <div className="w-10 h-14 bg-zinc-200 dark:bg-zinc-800 rounded-lg shrink-0 flex items-center justify-center border border-zinc-300 dark:border-zinc-700">
        <Film className="w-5 h-5 text-zinc-400" />
      </div>
    );
  }

  return (
    <img 
      src={image} 
      alt={title} 
      onError={() => setImgError(true)}
      className="w-10 h-14 object-cover rounded-lg shrink-0 border border-zinc-200 dark:border-zinc-800 bg-zinc-800 shadow-sm"
    />
  );
};

const extractTitleAndYear = (rawTitle: string): { title: string; year?: number; formatted: string } => {
  if (!rawTitle) return { title: "", formatted: "" };

  let text = rawTitle.trim();

  // Strip prefix words like Download, Watch Online, Stream, etc.
  text = text.replace(/^(download|watch|stream|movie|series)\b\s*/i, "");

  // Match 4-digit year (1900-2099)
  const yearMatch = text.match(/\b(19\d\d|20[0-2]\d)\b/);
  let year: number | undefined = undefined;
  if (yearMatch) {
    year = parseInt(yearMatch[1], 10);
  }

  let cleanTitle = text;
  if (yearMatch && yearMatch.index !== undefined) {
    let beforeYear = text.substring(0, yearMatch.index).trim();
    beforeYear = beforeYear.replace(/[\(\[\{\-_]+$/, "").trim();
    if (beforeYear.length > 1) {
      cleanTitle = beforeYear;
    }
  }

  // Remove resolution, quality, format, audio, language noise keywords
  const noiseRegex = /\b(480p|720p|1080p|2160p|4k|hdrip|web-dl|webrip|bluray|brrip|dvdrip|hdtv|camrip|dual audio|multi audio|hindi|english|tamil|telugu|punjabi|malayalam|kannada|bengali|marathi|urdu|subtitles|esub|esubs|x264|x265|hevc|aac|mkv|mp4|download|full movie|movie|season \d+|s\d+e?\d*)\b/gi;

  cleanTitle = cleanTitle.replace(noiseRegex, "").replace(/[()\[\]{}:_|-]+/g, " ").replace(/\s+/g, " ").trim();

  // Explicitly strip any season markers (S1, S2, S3, S4, S5, S01, S02, S03, Season 1, Season 2, etc.) from title
  cleanTitle = cleanTitle
    .replace(/\b(seasons?|s)\s*[-_]?\s*\d{1,2}\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  const formatted = year && cleanTitle ? `${cleanTitle} (${year})` : cleanTitle;

  return { title: cleanTitle, year, formatted };
};

const normalizeTitle = (str: string) => {
  return str.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
};

const normalizeForCompare = (str: string, stripSeason: boolean = true): string => {
  if (!str) return "";
  let clean = str
    .toLowerCase()
    .replace(/&/g, " and ");

  if (stripSeason) {
    clean = clean
      .replace(/\b(season|seasons)\s*\d{1,2}\b/gi, " ")
      .replace(/\bs\d{1,2}\b/gi, " ");
  }

  return clean.replace(/[^a-z0-9]/g, "");
};

const tokenize = (str: string): string[] => {
  return str
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(season|seasons)\s*\d{1,2}\b/gi, " ")
    .replace(/\bs\d{1,2}\b/gi, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 0 && !["a", "an", "the", "and", "of", "in", "for", "part", "vol", "volume", "season", "seasons", "s1", "s2", "s3", "s4", "s5", "s01", "s02", "s03", "s04", "s05"].includes(w));
};

const levenshteinDistance = (a: string, b: string): number => {
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

const isFlexibleTitleMatch = (postCleanTitle: string, contentRawTitle: string): boolean => {
  if (!postCleanTitle || !contentRawTitle) return false;

  const contentParsed = extractTitleAndYear(contentRawTitle);
  const contentCleanTitle = contentParsed.title || contentRawTitle;

  // 1. Direct comparison with seasons stripped (e.g., "Loklok S1" vs "Loklok" or "Loki Season 2" vs "Loki S02")
  const normP_season = normalizeForCompare(postCleanTitle, true);
  const normC_season = normalizeForCompare(contentCleanTitle, true);

  if (normP_season && normC_season && normP_season === normC_season) return true;

  // 2. Direct comparison WITH seasons kept
  const normP_full = normalizeForCompare(postCleanTitle, false);
  const normC_full = normalizeForCompare(contentCleanTitle, false);

  if (normP_full && normC_full && normP_full === normC_full) return true;

  // 3. Substring match on season-stripped normalized strings
  if (normP_season.length >= 4 && normC_season.length >= 4) {
    if (normP_season.includes(normC_season) || normC_season.includes(normP_season)) return true;
  }

  // 4. Substring match on full normalized strings
  if (normP_full.length >= 4 && normC_full.length >= 4) {
    if (normP_full.includes(normC_full) || normC_full.includes(normP_full)) return true;
  }

  // 5. Edit distance for minor typos / symbol variations
  const maxLen = Math.max(normP_season.length, normC_season.length);
  const dist = levenshteinDistance(normP_season, normC_season);
  if (maxLen >= 5 && dist <= 2) return true;
  if (maxLen >= 10 && dist <= 3) return true;

  // 6. Token-based word comparison (handles S1/S2/Season differences, symbol differences, 1-word differences)
  const pTokens = tokenize(postCleanTitle);
  const cTokens = tokenize(contentCleanTitle);

  if (pTokens.length === 0 || cTokens.length === 0) return false;

  const cSet = new Set(cTokens);
  const common = pTokens.filter(t => cSet.has(t)).length;

  const maxTokens = Math.max(pTokens.length, cTokens.length);
  const minTokens = Math.min(pTokens.length, cTokens.length);

  // If token sets match completely or differ by 1 word
  if (maxTokens <= 3 && common >= minTokens) return true;
  if (maxTokens > 3 && common >= maxTokens - 1) return true;

  // Overlap ratio check: at least 70% of words in common
  if (common / maxTokens >= 0.7) return true;

  return false;
};

const getAllUrlsFromContent = (c: Content): string[] => {
  const urls: string[] = [];
  const safeParse = (data: any): any[] => {
    if (!data) return [];
    if (typeof data === 'string') {
      try {
        return JSON.parse(data);
      } catch(e) {
        return [];
      }
    }
    return data;
  };

  const extractUrls = (items: any) => {
    if (!Array.isArray(items)) return;
    items.forEach((ld: any) => {
      if (ld?.url) urls.push(ld.url);
      if (ld?.links && Array.isArray(ld.links)) {
        ld.links.forEach((l: any) => {
          if (l?.url) urls.push(l.url);
        });
      }
    });
  };

  if (c.movieLinks) {
    extractUrls(safeParse(c.movieLinks));
  }
  if (c.seasons) {
    const parsed = safeParse(c.seasons);
    if (Array.isArray(parsed)) {
      parsed.forEach((s: any) => {
        extractUrls(s.zipLinks || []);
        extractUrls(s.mkvLinks || []);
        if (Array.isArray(s.episodes)) {
          s.episodes.forEach((e: any) => {
            extractUrls(e.links || []);
          });
        }
      });
    }
  }
  if (c.fullSeasonZip) {
    extractUrls(safeParse(c.fullSeasonZip));
  }
  if (c.fullSeasonMkv) {
    extractUrls(safeParse(c.fullSeasonMkv));
  }
  if ((c as any).telegramLinks) {
    extractUrls(safeParse((c as any).telegramLinks));
  }
  if (c.trailerUrl) urls.push(c.trailerUrl);

  return urls;
};

const checkGalleryAvailability = (
  postTitle: string, 
  contentList: Content[],
  qualities: Quality[] = [],
  languages: Language[] = [],
  titleIndex?: Map<string, Content>
): { isAvailable: boolean; badgeLabel: 'Available' | 'Missing'; reason?: string; matchedContent?: Content; parsed: { title: string; year?: number; formatted: string } } => {
  const parsed = extractTitleAndYear(postTitle);
  if (!parsed.title) {
    return { isAvailable: false, badgeLabel: 'Missing', reason: 'Unrecognized Title', parsed };
  }

  const normParsed = normalizeTitle(parsed.title);
  if (!normParsed) {
    return { isAvailable: false, badgeLabel: 'Missing', reason: 'Unrecognized Title', parsed };
  }

  let matched: Content | undefined = undefined;
  if (titleIndex && titleIndex.has(normParsed)) {
    const candidate = titleIndex.get(normParsed)!;
    if (!parsed.year || !candidate.year || Math.abs(candidate.year - parsed.year) <= 1) {
      matched = candidate;
    }
  }

  if (!matched) {
    matched = contentList.find(c => {
      if (!c || !c.title) return false;

      // Flexible title match on primary title or 2nd title (handles dubbed titles, original titles, symbols, typos, 1-word difference)
      const titleMatches = isFlexibleTitleMatch(parsed.title, c.title) || 
        (c.secondTitle ? isFlexibleTitleMatch(parsed.title, c.secondTitle) : false);
      if (!titleMatches) return false;

      // Strict year check: if post has a year, check against main content year AND all season years (Season 1, Season 2, etc.)
      if (parsed.year) {
        const candidateYears: number[] = [];
        if (c.year) candidateYears.push(c.year);

        const titleYear = extractTitleAndYear(c.title).year;
        if (titleYear) candidateYears.push(titleYear);

        if (c.secondTitle) {
          const secTitleYear = extractTitleAndYear(c.secondTitle).year;
          if (secTitleYear) candidateYears.push(secTitleYear);
        }

        if (c.seasons) {
          try {
            const parsedSeasons: any[] = Array.isArray(c.seasons) ? c.seasons : JSON.parse(c.seasons as string);
            if (Array.isArray(parsedSeasons)) {
              parsedSeasons.forEach(s => {
                if (s.year && typeof s.year === 'number') {
                  candidateYears.push(s.year);
                }
                if (s.title) {
                  const sYear = extractTitleAndYear(s.title).year;
                  if (sYear) candidateYears.push(sYear);
                }
              });
            }
          } catch (e) {
            // ignore JSON parse error
          }
        }

        if (candidateYears.length > 0) {
          const hasMatchingYear = candidateYears.some(y => Math.abs(y - parsed.year!) <= 1);
          if (!hasMatchingYear) {
            return false;
          }
        }
      }

      return true;
    });
  }

  if (!matched) {
    return {
      isAvailable: false,
      badgeLabel: 'Missing',
      reason: 'Not in Gallery',
      parsed
    };
  }

  // Quality evaluation: Digital releases (WEB-DL, WEBRip, HDRip, BluRay, BRRip)
  const digitalQualityRegex = /\b(web-?dl|web-?rip|hdr-?ip|hd-?rip|bluray|blu-?ray|brrip|br-?rip)\b/i;
  const postHasDigitalQuality = digitalQualityRegex.test(postTitle);

  const libQualityObj = qualities.find(q => q.id === matched.qualityId);
  const libQualityName = libQualityObj ? libQualityObj.name : "";
  const combinedLibInfo = `${libQualityName} ${matched.title} ${matched.description || ""} ${matched.movieLinks || ""}`.toLowerCase();
  
  const libraryHasDigitalQuality = digitalQualityRegex.test(combinedLibInfo);

  // If post has WEB-DL, HDRip, BluRay and library item is a lower quality print (e.g. CAM, PreDVD, HDCAM)
  if (postHasDigitalQuality && !libraryHasDigitalQuality) {
    return {
      isAvailable: false,
      badgeLabel: 'Missing',
      reason: `Old Print in Library (${libQualityName || 'CAM/PreDVD'} → Upgrade: Digital)`,
      matchedContent: matched,
      parsed
    };
  }

  // Audio / Language evaluation (Hindi Audio)
  const postHasHindi = /\b(hindi|hin|dual audio|multi audio|hindi org|hindi clean)\b/i.test(postTitle);
  if (postHasHindi) {
    const libLangNames = (matched.languageIds || [])
      .map(id => languages.find(l => l.id === id)?.name || "")
      .filter(Boolean);
    const libHasHindi = libLangNames.some(l => /hindi/i.test(l)) || 
      /hindi/i.test(matched.title) || 
      /hindi/i.test(matched.description || "");

    if (!libHasHindi) {
      return {
        isAvailable: false,
        badgeLabel: 'Missing',
        reason: 'Missing Hindi Audio in Library',
        matchedContent: matched,
        parsed
      };
    }
  }

  // Line / HQ Audio vs Clean Audio
  const postIsLineAudio = /\b(line audio|hq cam|cam audio)\b/i.test(postTitle);
  const libraryHasLineAudio = /\b(line audio|hq cam|cam audio)\b/i.test(combinedLibInfo);

  if (!postIsLineAudio && libraryHasLineAudio) {
    return {
      isAvailable: false,
      badgeLabel: 'Missing',
      reason: 'Clean Audio Upgrade Available (Library has Line Audio)',
      matchedContent: matched,
      parsed
    };
  }

  // Check if library version has Pixeldrain but is missing Hubcloud links
  const allLibUrls = getAllUrlsFromContent(matched);
  const hasPixeldrain = allLibUrls.some(u => {
    const l = u.toLowerCase();
    return l.includes("pixeldrain") || l.includes("pixel.drain") || l.includes("pixeldra.in");
  });
  const hasHubcloud = allLibUrls.some(u => {
    const l = u.toLowerCase();
    return l.includes("hubcloud") || l.includes("vcloud") || l.includes("hubdrive");
  });

  if (hasPixeldrain && !hasHubcloud) {
    return {
      isAvailable: false,
      badgeLabel: 'Missing',
      reason: 'Only Pixel Version in Library (Missing Hubcloud Links)',
      matchedContent: matched,
      parsed
    };
  }

  return {
    isAvailable: true,
    badgeLabel: 'Available',
    reason: `In Gallery${libQualityName ? ` (${libQualityName})` : ''}`,
    matchedContent: matched,
    parsed
  };
};

const filterFilmygoHits = (hits: any[], pageUrl: string): any[] => {
  if (!hits || hits.length === 0) return [];

  // Exclude gdflix links completely
  const nonGdflixHits = hits.filter(h => {
    const u = (h.url || '').toLowerCase();
    const name = (h.file_name || '').toLowerCase();
    return !u.includes('gdflix') && !name.includes('gdflix');
  });
  if (nonGdflixHits.length === 0) return [];

  const parseSizeInGB = (sizeStr?: string | null): number => {
    if (!sizeStr) return 0;
    const match = sizeStr.match(/(\d+(?:\.\d+)?)\s*(GB|MB)/i);
    if (!match) return 0;
    const val = parseFloat(match[1]);
    const unit = match[2].toUpperCase();
    if (unit === 'GB') return val;
    if (unit === 'MB') return val / 1024;
    return 0;
  };

  const isHindiLineHit = (h: any): boolean => {
    const name = ((h.file_name || '') + ' ' + (h.label || '')).toLowerCase();
    return /\bhindi\b.*?\bline\b/i.test(name);
  };

  let effectiveHits = nonGdflixHits;
  const hasAnyHindiLine = effectiveHits.some(isHindiLineHit);

  if (hasAnyHindiLine) {
    effectiveHits = effectiveHits.filter(h => {
      const name = ((h.file_name || '') + ' ' + (h.label || '')).toLowerCase();
      if (/\bhindi\b/i.test(name)) {
        return isHindiLineHit(h);
      }
      return true;
    });
  }

  const pageUrlLower = pageUrl.toLowerCase();

  const findHit = (res: '480p' | '720p' | '1080p', isHevc: boolean) => {
    const candidates = effectiveHits.filter(h => {
      const name = (h.file_name || '').toLowerCase();
      const hasRes = name.includes(res);
      const hasHevc = name.includes('hevc');
      return hasRes && (isHevc ? hasHevc : !hasHevc);
    });

    if (candidates.length === 0) return undefined;

    return candidates[0];
  };

  // Check if non-HEVC quality links exist at all in the hits list
  const hasAnyNonHevc = effectiveHits.some(h => {
    const name = (h.file_name || '').toLowerCase();
    return (name.includes('480p') || name.includes('720p') || name.includes('1080p')) && !name.includes('hevc');
  });

  const isSeriesUrl = pageUrlLower.includes('series') || 
                       pageUrlLower.includes('season') || 
                       pageUrlLower.includes('s01') || 
                       pageUrlLower.includes('s02') || 
                       pageUrlLower.includes('s1') || 
                       pageUrlLower.includes('s2') || 
                       pageUrlLower.includes('episode');

  // If URL indicates series or there are no non-HEVC links at all, treat as Series
  const isSeries = isSeriesUrl || !hasAnyNonHevc;

  const selected: any[] = [];

  if (isSeries) {
    // Series rule: select "480p HEVC", "720p HEVC", "1080p HEVC"
    const hit480pHevc = findHit('480p', true);
    const hit720pHevc = findHit('720p', true);
    const hit1080pHevc = findHit('1080p', true);

    if (hit480pHevc) selected.push(hit480pHevc);
    if (hit720pHevc) selected.push(hit720pHevc);
    if (hit1080pHevc) selected.push(hit1080pHevc);

    if (selected.length === 0) {
      for (const hit of hits) {
        const nameLower = (hit.file_name || '').toLowerCase();
        if (nameLower.includes('480p hevc') || 
            nameLower.includes('720p hevc') || 
            nameLower.includes('1080p hevc')) {
          selected.push(hit);
        }
      }
    }
  } else {
    // Movie rule:
    // "Download Now 480p"
    // "Download Now 720p"
    // "Download Now 1080p"
    // "Download Now 720p HEVC" (only if 720p size > 1.4GB)
    // PLUS: If any resolution (480p, 720p, or 1080p) non-HEVC is missing, select its HEVC version as fallback!
    const hit480p = findHit('480p', false);
    const hit480pHevc = findHit('480p', true);

    const hit720p = findHit('720p', false);
    const hit720pHevc = findHit('720p', true);

    const hit1080p = findHit('1080p', false);
    const hit1080pHevc = findHit('1080p', true);

    // 480p: prefer non-HEVC, fallback to HEVC if missing
    if (hit480p) {
      selected.push(hit480p);
    } else if (hit480pHevc) {
      selected.push(hit480pHevc);
    }

    // 720p: prefer non-HEVC. Select HEVC if size > 1.4GB or if non-HEVC is missing
    if (hit720p) {
      selected.push(hit720p);
      const sizeGB = parseSizeInGB(hit720p.size);
      if (sizeGB > 1.4 && hit720pHevc) {
        selected.push(hit720pHevc);
      }
    } else if (hit720pHevc) {
      selected.push(hit720pHevc);
    }

    // 1080p: prefer non-HEVC, fallback to HEVC if missing
    if (hit1080p) {
      selected.push(hit1080p);
    } else if (hit1080pHevc) {
      selected.push(hit1080pHevc);
    }
  }

  if (selected.length === 0) {
    return effectiveHits;
  }

  // Return selected hits, deduplicated by the Set
  return Array.from(new Set(selected));
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  initialInput?: string;
  autoStart?: boolean;
  isBatchMode?: boolean;
  onAddLinks?: (
    links: QualityLinks,
    metadata?: {
      languages: string[];
      printQuality?: string;
      subtitles?: boolean;
      type?: "movie" | "series";
      season?: number;
      episode?: number;
      title?: string;
      year?: number;
    }
  ) => void;
  onBatchAddLinks?: (
    batches: {
      title: string;
      year?: number;
      links: QualityLinks;
      metadata: any;
    }[]
  ) => void;
  onResults?: (results: LinkCheckResult[]) => void;
  content?: Content | null;
  languages?: Language[];
  qualities?: Quality[];
  disableAutoClipboard?: boolean;
};

const badgeMap: Record<StatusLabel, string> = {
  WORKING: "bg-emerald-500/15 text-emerald-400 border-emerald-800/80",
  REDIRECT: "bg-cyan-500/15 text-cyan-400 border-cyan-800/80",
  PROTECTED: "bg-yellow-500/15 text-yellow-400 border-yellow-800/80",
  BROKEN: "bg-red-500/15 text-red-400 border-red-800/80",
  UNAVAILABLE: "bg-orange-500/15 text-orange-400 border-orange-800/80",
  UNKNOWN: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-300 border-zinc-300 dark:border-zinc-700",
  MISSING_FILENAME: "bg-pink-500/15 text-pink-400 border-pink-800/80",
  MISSING_METADATA: "bg-pink-500/15 text-pink-400 border-pink-800/80",
  SMALL_FILE: "bg-orange-500/15 text-orange-400 border-orange-800/80",
  SIZE_MISMATCH: "bg-red-500/15 text-red-400 border-red-800/80",
};

export const LinkCheckerModal: React.FC<Props> = ({
  isOpen,
  onClose,
  title = "Link Checker",
  initialInput = "",
  autoStart = false,
  isBatchMode = false,
  onAddLinks,
  onBatchAddLinks,
  onResults,
  content,
  languages = [],
  qualities = [],
  disableAutoClipboard = false,
}) => {
  const { contentList = [] } = useAdminContent();
  const [availabilityFilter, setAvailabilityFilter] = useState<'all' | 'missing' | 'available'>('all');
  const [showDomainSettings, setShowDomainSettings] = useState(false);
  const [moviesdriveDomainInput, setMoviesdriveDomainInput] = useState(() => getMoviesdriveDomain());
  const [skymoviesDomainInput, setSkymoviesDomainInput] = useState(() => getSkymoviesDomain());
  const [filmygoDomainInput, setFilmygoDomainInput] = useState(() => getFilmygoDomain());

  const handleSaveDomains = () => {
    if (moviesdriveDomainInput) setMoviesdriveDomain(moviesdriveDomainInput);
    if (skymoviesDomainInput) setSkymoviesDomain(skymoviesDomainInput);
    if (filmygoDomainInput) setFilmygoDomain(filmygoDomainInput);
    setShowDomainSettings(false);
  };
  const [input, setInput] = useState(initialInput);
  const inputRef = React.useRef(input);
  useEffect(() => {
    inputRef.current = input;
  }, [input]);

  const [autoClipboard, setAutoClipboard] = useState(false);
  const [clipboardStatus, setClipboardStatus] = useState<"active" | "unfocused" | "denied" | "idle">("idle");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<LinkCheckResult[]>([]);
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set());
  const eligibleUrlsForSelect = useMemo(() => {
    return results.filter(r => {
      const isHubcloud = r.url.toLowerCase().includes("hubcloud");
      if (!isHubcloud) return true;
      const hasPixeldrain = !!r.candidates?.some(c => c.text.toLowerCase().includes("pixeldrain") || c.href.toLowerCase().includes("pixeldrain"));
      return hasPixeldrain;
    }).map(r => r.url);
  }, [results]);

  const areAllEligibleSelected = useMemo(() => {
    if (eligibleUrlsForSelect.length === 0) return false;
    return eligibleUrlsForSelect.every(url => selectedUrls.has(url));
  }, [eligibleUrlsForSelect, selectedUrls]);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [isReviewingBatch, setIsReviewingBatch] = useState(false);
  const [batchReviewItems, setBatchReviewItems] = useState<{
    key: string;
    title: string;
    year: string;
    links: QualityLinks;
    metadata: any;
  }[]>([]);

  // MDrive Scraper State
  const [mdriveUrl, setMdriveUrl] = useState<string | null>(null);
  const [mdriveResults, setMdriveResults] = useState<any[]>([]);
  const [mdriveLoading, setMdriveLoading] = useState(false);
  const [mdriveError, setMdriveError] = useState<string | null>(null);
  const [mdriveSelectedIndices, setMdriveSelectedIndices] = useState<Set<number>>(new Set());
  const [mdriveExtractingDirect, setMdriveExtractingDirect] = useState<Record<number, boolean>>({});
  const processedExtractionsRef = React.useRef<Set<string>>(new Set());

  // MoviesDrive Search Results & Pagination State
  const [moviesdriveSearchUrl, setMoviesdriveSearchUrl] = useState<string | null>(null);
  const [moviesdriveSearchPosts, setMoviesdriveSearchPosts] = useState<{ title: string; url: string; image?: string }[]>([]);
  const [moviesdriveSelectedUrls, setMoviesdriveSelectedUrls] = useState<Set<string>>(new Set());
  const [allAccumulatedPosts, setAllAccumulatedPosts] = useState<Map<string, { title: string; url: string; image?: string }>>(new Map());
  const [hasUserInteractedSelection, setHasUserInteractedSelection] = useState<boolean>(false);
  const [moviesdriveSearchQuery, setMoviesdriveSearchQuery] = useState<string>("");
  const [moviesdrivePageLoading, setMoviesdrivePageLoading] = useState<boolean>(false);
  const [customPageInput, setCustomPageInput] = useState<string>("");

  // Direct MoviesDrive Search Input State
  const [showMoviesdriveSearchInput, setShowMoviesdriveSearchInput] = useState<boolean>(false);
  const [moviesdriveSearchTerm, setMoviesdriveSearchTerm] = useState<string>("");

  // Direct SkyMoviesHD Search Input State & Pagination Limit
  const [showSkymoviesSearchInput, setShowSkymoviesSearchInput] = useState<boolean>(false);
  const [skymoviesSearchTerm, setSkymoviesSearchTerm] = useState<string>("");
  const [skymoviesVisibleLimit, setSkymoviesVisibleLimit] = useState<number>(50);

  // Direct FilmyGo Search Input State
  const [showFilmygoSearchInput, setShowFilmygoSearchInput] = useState<boolean>(false);
  const [filmygoSearchTerm, setFilmygoSearchTerm] = useState<string>("");

  React.useEffect(() => {
    setSkymoviesVisibleLimit(50);
  }, [moviesdriveSearchPosts, moviesdriveSearchUrl]);

  const moviesdrivePageInfo = useMemo(() => {
    const mdDomain = getMoviesdriveDomain();
    const skyDomain = getSkymoviesDomain();
    const filmyDomain = getFilmygoDomain();
    if (!moviesdriveSearchUrl) return { query: "", page: 1, origin: mdDomain, isSkyMovies: false, isFilmygo: false };
    try {
      const u = new URL(moviesdriveSearchUrl);
      const isSky = u.hostname.includes("skymovies") || u.origin === skyDomain;
      const isFilmy = u.hostname.includes("filmygo") || u.origin === filmyDomain;
      const q = u.searchParams.get("to-search") || u.searchParams.get("search") || u.searchParams.get("q") || u.searchParams.get("s") || "";
      const p = parseInt(u.searchParams.get("to-page") || u.searchParams.get("page") || u.searchParams.get("p") || u.searchParams.get("pg") || "1", 10) || 1;
      return { query: q, page: p, origin: u.origin || (isFilmy ? filmyDomain : isSky ? skyDomain : mdDomain), isSkyMovies: isSky, isFilmygo: isFilmy };
    } catch {
      return { query: "", page: 1, origin: mdDomain, isSkyMovies: false, isFilmygo: false };
    }
  }, [moviesdriveSearchUrl]);

  const contentTitleIndex = useMemo(() => {
    const map = new Map<string, Content>();
    if (!contentList) return map;
    contentList.forEach(c => {
      if (c.title) {
        const norm = normalizeTitle(c.title);
        if (norm) map.set(norm, c);
      }
      if (c.secondTitle) {
        const norm = normalizeTitle(c.secondTitle);
        if (norm) map.set(norm, c);
      }
    });
    return map;
  }, [contentList]);

  const moviesdrivePostsWithAvailability = useMemo(() => {
    return moviesdriveSearchPosts.map((post, originalIndex) => {
      const avail = checkGalleryAvailability(post.title, contentList, qualities, languages, contentTitleIndex);
      return { post, originalIndex, avail };
    });
  }, [moviesdriveSearchPosts, contentList, qualities, languages, contentTitleIndex]);

  const moviesdriveFilteredPosts = useMemo(() => {
    return moviesdrivePostsWithAvailability.filter(({ post, avail }) => {
      const matchesQuery = !moviesdriveSearchQuery || post.title.toLowerCase().includes(moviesdriveSearchQuery.toLowerCase());
      if (!matchesQuery) return false;
      if (availabilityFilter === 'missing') return !avail.isAvailable;
      if (availabilityFilter === 'available') return avail.isAvailable;
      return true;
    });
  }, [moviesdrivePostsWithAvailability, moviesdriveSearchQuery, availabilityFilter]);

  const moviesdriveDisplayedPosts = useMemo(() => {
    return moviesdrivePageInfo.isSkyMovies
      ? moviesdriveFilteredPosts.slice(0, skymoviesVisibleLimit)
      : moviesdriveFilteredPosts;
  }, [moviesdriveFilteredPosts, moviesdrivePageInfo.isSkyMovies, skymoviesVisibleLimit]);

  const { moviesdriveAvailCount, moviesdriveMissingCount } = useMemo(() => {
    let availCount = 0;
    let missingCount = 0;
    moviesdrivePostsWithAvailability.forEach(({ avail }) => {
      if (avail.isAvailable) availCount++;
      else missingCount++;
    });
    return { moviesdriveAvailCount: availCount, moviesdriveMissingCount: missingCount };
  }, [moviesdrivePostsWithAvailability]);

  const searchLocationInContent = React.useCallback((contentObj: any, url: string, finalUrl?: string) => {
    if (!contentObj) return null;

    const normUrl = normalizeUrl(url);
    const normFinal = finalUrl ? normalizeUrl(finalUrl) : undefined;
    const targetUrls = [url, finalUrl, normUrl, normFinal].filter(Boolean) as string[];

    const extractId = (u: string) => {
      if (!u) return null;
      const m = u.match(/\/(?:u|l|file|d|get|drive|link)\/([a-zA-Z0-9_-]+)/i);
      if (m) return m[1];
      return null;
    };

    const targetIds = [extractId(url), finalUrl ? extractId(finalUrl) : null].filter((id): id is string => !!id && id.length >= 4);

    const isMatch = (candUrl?: string) => {
      if (!candUrl) return false;
      if (targetUrls.some(tu => tu && (candUrl.includes(tu) || tu.includes(candUrl)))) return true;
      const candNorm = normalizeUrl(candUrl);
      if (targetUrls.some(tu => tu && (candNorm.includes(tu) || tu.includes(candNorm)))) return true;
      const candId = extractId(candUrl);
      if (candId && targetIds.some(tid => tid === candId || candUrl.includes(tid))) return true;
      return false;
    };

    const safeParse = (data: any) => {
      if (!data) return [];
      if (typeof data === 'string') {
        try { return JSON.parse(data); } catch { return []; }
      }
      return data;
    };

    // Check movieLinks
    const movieLinks = safeParse(contentObj.movieLinks);
    if (Array.isArray(movieLinks)) {
      for (const ml of movieLinks) {
        if (isMatch(ml.url)) {
          const lName = ml.name || ml.quality || 'Movie Link';
          return {
            season: undefined,
            episode: undefined,
            isFullSeasonMKV: ml.isFullSeasonMKV,
            isFullSeasonZIP: ml.isFullSeasonZIP,
            qualityLabel: ml.quality || ml.name,
            linkName: lName,
            locationName: lName
          };
        }
      }
    }

    // Check seasons
    const seasonsData = safeParse(contentObj.seasons);
    if (Array.isArray(seasonsData)) {
      for (const s of seasonsData) {
        const sNum = s.seasonNumber ?? s.season ?? s.number;
        const parsedSNum = sNum !== undefined ? parseInt(String(sNum), 10) : undefined;

        // Check zipLinks
        const zipLinks = safeParse(s.zipLinks);
        if (Array.isArray(zipLinks)) {
          for (const zl of zipLinks) {
            if (isMatch(zl.url)) {
              const zS = zl.season !== undefined ? parseInt(String(zl.season), 10) : parsedSNum;
              const zE = zl.episode !== undefined ? parseInt(String(zl.episode), 10) : undefined;
              const rawQual = zl.name || zl.quality || '';
              let lName = rawQual;
              if (lName && !/\bZIP\b/i.test(lName)) {
                lName = `${lName} ZIP`;
              } else if (!lName) {
                lName = zS !== undefined ? `S${zS} ZIP` : 'ZIP';
              }

              let locTag = rawQual;
              if (zS !== undefined && locTag && !locTag.toLowerCase().includes(`s${zS}`)) {
                locTag = `S${zS} ${locTag}`.trim();
              }
              if (!locTag) locTag = zS !== undefined ? `S${zS} ZIP` : 'ZIP';
              if (!/\bZIP\b/i.test(locTag)) {
                locTag = `${locTag} ZIP`;
              }

              return {
                season: zS,
                episode: zE,
                isFullSeasonZIP: zl.isFullSeasonZIP ?? true,
                isFullSeasonMKV: zl.isFullSeasonMKV,
                qualityLabel: zl.name || zl.quality,
                linkName: lName,
                locationName: locTag
              };
            }
          }
        }

        // Check mkvLinks
        const mkvLinks = safeParse(s.mkvLinks);
        if (Array.isArray(mkvLinks)) {
          for (const ml of mkvLinks) {
            if (isMatch(ml.url)) {
              const mS = ml.season !== undefined ? parseInt(String(ml.season), 10) : parsedSNum;
              const mE = ml.episode !== undefined ? parseInt(String(ml.episode), 10) : undefined;
              const rawQual = ml.name || ml.quality || '';
              let lName = rawQual;
              if (lName && !/\bMKV\b/i.test(lName)) {
                lName = `${lName} MKV`;
              } else if (!lName) {
                lName = mS !== undefined ? `S${mS} MKV` : 'MKV';
              }

              let locTag = rawQual;
              if (mS !== undefined && locTag && !locTag.toLowerCase().includes(`s${mS}`)) {
                locTag = `S${mS} ${locTag}`.trim();
              }
              if (!locTag) locTag = mS !== undefined ? `S${mS} MKV` : 'MKV';
              if (!/\bMKV\b/i.test(locTag)) {
                locTag = `${locTag} MKV`;
              }

              return {
                season: mS,
                episode: mE,
                isFullSeasonMKV: ml.isFullSeasonMKV ?? true,
                isFullSeasonZIP: ml.isFullSeasonZIP,
                qualityLabel: ml.name || ml.quality,
                linkName: lName,
                locationName: locTag
              };
            }
          }
        }

        // Check episodes
        const episodes = safeParse(s.episodes);
        if (Array.isArray(episodes)) {
          for (const ep of episodes) {
            const epNum = ep.episodeNumber ?? ep.episode ?? ep.number ?? ep.ep;
            const parsedEpNum = epNum !== undefined ? parseInt(String(epNum), 10) : undefined;

            const links = safeParse(ep.links);
            if (Array.isArray(links)) {
              for (const l of links) {
                if (isMatch(l.url)) {
                  const lS = l.season !== undefined ? parseInt(String(l.season), 10) : parsedSNum;
                  const lE = l.episode !== undefined ? parseInt(String(l.episode), 10) : parsedEpNum;
                  const lName = l.name || l.quality || (lS !== undefined && lE !== undefined ? `S${lS}E${lE}` : `E${lE}`);
                  let locTag = '';
                  if (lS !== undefined && lE !== undefined) {
                    locTag = `S${lS}E${lE}`;
                    if (l.name || l.quality) locTag += ` ${l.name || l.quality}`;
                  } else if (lE !== undefined) {
                    locTag = `E${lE}`;
                    if (l.name || l.quality) locTag += ` ${l.name || l.quality}`;
                  } else {
                    locTag = l.name || l.quality || '';
                  }
                  return {
                    season: lS,
                    episode: lE,
                    isFullSeasonMKV: l.isFullSeasonMKV,
                    isFullSeasonZIP: l.isFullSeasonZIP,
                    qualityLabel: l.name || l.quality,
                    linkName: lName,
                    locationName: locTag
                  };
                }
              }
            }
          }
        }
      }
    }

    // Check top-level content fields
    const topZip = safeParse(contentObj.fullSeasonZip || contentObj.zipLinks);
    if (Array.isArray(topZip)) {
      for (const zl of topZip) {
        if (isMatch(zl.url)) {
          const zS = zl.season !== undefined ? parseInt(String(zl.season), 10) : undefined;
          const rawQual = zl.name || zl.quality || '';
          let lName = rawQual;
          if (lName && !/\bZIP\b/i.test(lName)) {
            lName = `${lName} ZIP`;
          } else if (!lName) {
            lName = zS !== undefined ? `S${zS} ZIP` : 'ZIP';
          }

          let locTag = rawQual;
          if (zS !== undefined && locTag && !locTag.toLowerCase().includes(`s${zS}`)) {
            locTag = `S${zS} ${locTag}`.trim();
          }
          if (!locTag) locTag = zS !== undefined ? `S${zS} ZIP` : 'ZIP';
          if (!/\bZIP\b/i.test(locTag)) {
            locTag = `${locTag} ZIP`;
          }

          return {
            season: zS,
            episode: zl.episode !== undefined ? parseInt(String(zl.episode), 10) : undefined,
            isFullSeasonZIP: zl.isFullSeasonZIP ?? true,
            qualityLabel: zl.name || zl.quality,
            linkName: lName,
            locationName: locTag
          };
        }
      }
    }

    const topMkv = safeParse(contentObj.fullSeasonMkv || contentObj.mkvLinks);
    if (Array.isArray(topMkv)) {
      for (const ml of topMkv) {
        if (isMatch(ml.url)) {
          const mS = ml.season !== undefined ? parseInt(String(ml.season), 10) : undefined;
          const rawQual = ml.name || ml.quality || '';
          let lName = rawQual;
          if (lName && !/\bMKV\b/i.test(lName)) {
            lName = `${lName} MKV`;
          } else if (!lName) {
            lName = mS !== undefined ? `S${mS} MKV` : 'MKV';
          }

          let locTag = rawQual;
          if (mS !== undefined && locTag && !locTag.toLowerCase().includes(`s${mS}`)) {
            locTag = `S${mS} ${locTag}`.trim();
          }
          if (!locTag) locTag = mS !== undefined ? `S${mS} MKV` : 'MKV';
          if (!/\bMKV\b/i.test(locTag)) {
            locTag = `${locTag} MKV`;
          }

          return {
            season: mS,
            episode: ml.episode !== undefined ? parseInt(String(ml.episode), 10) : undefined,
            isFullSeasonMKV: ml.isFullSeasonMKV ?? true,
            qualityLabel: ml.name || ml.quality,
            linkName: lName,
            locationName: locTag
          };
        }
      }
    }

    return null;
  }, []);

  const resolveLocationAndMetadata = React.useCallback((res: LinkCheckResult) => {
    // Remove location fetching or retrieving for working links; retrieve only for non-working links.
    const isWorking = res.ok || res.statusLabel === "WORKING" || res.statusLabel === "REDIRECT" || res.statusLabel === "PROTECTED";

    let season = res.season;
    let episode = res.episode;
    let isFullSeasonMKV = res.isFullSeasonMKV;
    let isFullSeasonZIP = res.isFullSeasonZIP;
    let qualityLabel = res.qualityLabel;
    let linkName = res.linkName;
    let locationName = isWorking ? undefined : res.locationName;

    const url = res.url || '';
    const finalUrl = res.finalUrl || '';

    // 1. Try search in passed `content` prop or items in `contentList` (only for non-working links to retrieve location)
    if (!isWorking) {
      const searchTargets = [content, ...(contentList || [])].filter(Boolean);

      for (const cItem of searchTargets) {
        const loc = searchLocationInContent(cItem, url, finalUrl);
        if (loc) {
          if (season === undefined) season = loc.season;
          if (episode === undefined) episode = loc.episode;
          if (isFullSeasonMKV === undefined || !isFullSeasonMKV) isFullSeasonMKV = loc.isFullSeasonMKV;
          if (isFullSeasonZIP === undefined || !isFullSeasonZIP) isFullSeasonZIP = loc.isFullSeasonZIP;
          if (!qualityLabel) qualityLabel = loc.qualityLabel;
          if (!linkName) linkName = loc.linkName;
          if (!locationName) locationName = loc.locationName;
          if (season !== undefined || episode !== undefined || isFullSeasonMKV || isFullSeasonZIP || linkName || locationName) {
            break;
          }
        }
      }
    }

    // 2. Try extractedMetaRef.current by direct URL, normalized URL, or file ID
    if (season === undefined && episode === undefined && !isFullSeasonMKV && !isFullSeasonZIP) {
      const normUrl = normalizeUrl(url);
      const normFinal = finalUrl ? normalizeUrl(finalUrl) : undefined;

      let meta = extractedMetaRef.current[url] || 
                 extractedMetaRef.current[normUrl] || 
                 (normFinal ? extractedMetaRef.current[normFinal] : undefined);

      if (!meta || (meta.season === undefined && meta.episode === undefined)) {
        try {
          const extractId = (u: string) => {
            const m = u.match(/\/(?:u|l|file|d|get|drive|link)\/([a-zA-Z0-9_-]+)/i) || u.match(/([a-zA-Z0-9_-]{8,})/);
            return m ? m[1] : null;
          };
          const id = extractId(url) || (finalUrl ? extractId(finalUrl) : null);
          if (id && id.length >= 4) {
            for (const [mUrl, mData] of Object.entries(extractedMetaRef.current)) {
              if (mUrl.includes(id)) {
                meta = mData;
                break;
              }
            }
          }
        } catch (e) {}
      }

      if (meta) {
        if (season === undefined) season = meta.season;
        if (episode === undefined) episode = meta.episode;
        if (isFullSeasonMKV === undefined) isFullSeasonMKV = meta.isFullSeasonMKV;
        if (isFullSeasonZIP === undefined) isFullSeasonZIP = meta.isFullSeasonZIP;
        if (!qualityLabel) qualityLabel = meta.qualityLabel;
        if (!linkName) linkName = (meta as any).linkName;
        if (!locationName) locationName = (meta as any).locationName;
      }
    }

    // 3. Try parsing from inputRef.current text with upwards scanning
    if (season === undefined && episode === undefined && !isFullSeasonMKV && !isFullSeasonZIP) {
      const textMeta = detectMetadataForLink(inputRef.current, url, languages, qualities);
      if (season === undefined) season = textMeta.season;
      if (episode === undefined) episode = textMeta.episode;
      if (isFullSeasonMKV === undefined) isFullSeasonMKV = textMeta.isFullSeasonMKV;
      if (isFullSeasonZIP === undefined) isFullSeasonZIP = textMeta.isFullSeasonZIP;
      if (!qualityLabel) qualityLabel = textMeta.qualityLabel;
    }

    // 4. Try parsing from url / finalUrl string itself as last resort
    if (season === undefined && episode === undefined && !isFullSeasonMKV && !isFullSeasonZIP) {
      const urlText = `${finalUrl} ${url}`;
      const sMatch = urlText.match(/(?<=^|[^a-zA-Z0-9])(?:s(\d+)|season\s*(\d+))(?![a-z0-9])/i);
      const eMatch = urlText.match(/(?<=^|[^a-zA-Z0-9])(?:e(\d+)|episode\s*(\d+))(?![a-z0-9])/i);
      if (sMatch) season = parseInt(sMatch[1] || sMatch[2], 10);
      if (eMatch) episode = parseInt(eMatch[1] || eMatch[2], 10);
      if (urlText.toLowerCase().includes(".zip")) isFullSeasonZIP = true;
      if (urlText.toLowerCase().includes(".mkv")) isFullSeasonMKV = true;
    }

    const mergedResult: LinkCheckResult = {
      ...res,
      season,
      episode,
      isFullSeasonMKV,
      isFullSeasonZIP,
      qualityLabel: res.qualityLabel || qualityLabel,
      linkName,
      locationName: isWorking ? undefined : locationName
    };

    const tag = isWorking ? null : getLocationTag(mergedResult);

    return { mergedResult, tag };
  }, [content, contentList, languages, qualities, searchLocationInContent]);

  const areAllFilteredSelected = useMemo(() => {
    if (moviesdriveFilteredPosts.length === 0) return false;
    return moviesdriveFilteredPosts.every(({ post }) => moviesdriveSelectedUrls.has(post.url));
  }, [moviesdriveFilteredPosts, moviesdriveSelectedUrls]);

  const handleSelectAllFiltered = () => {
    setHasUserInteractedSelection(true);
    setMoviesdriveSelectedUrls(prev => {
      const next = new Set(prev);
      if (areAllFilteredSelected) {
        moviesdriveFilteredPosts.forEach(({ post }) => {
          next.delete(post.url);
        });
      } else {
        moviesdriveFilteredPosts.forEach(({ post }) => {
          if (post.url) next.add(post.url);
        });
      }
      return next;
    });
  };

  const handleMoviesdrivePageChange = async (targetPage: number) => {
    if (targetPage < 1 || !moviesdriveSearchUrl) return;
    const { query, origin, isSkyMovies, isFilmygo } = moviesdrivePageInfo;
    let newUrl = "";
    let endpoint = "";
    if (isSkyMovies) {
      newUrl = `${origin}/search.php?search=${encodeURIComponent(query)}&cat=All&page=${targetPage}`;
      endpoint = `/api/skymovieshd?url=${encodeURIComponent(newUrl)}`;
    } else if (isFilmygo) {
      if (query) {
        newUrl = `${origin}/site-search.html?to-search=${encodeURIComponent(query)}&to-page=${targetPage}`;
      } else {
        newUrl = `${origin}/?to-page=${targetPage}`;
      }
      endpoint = `/api/filmygo?url=${encodeURIComponent(newUrl)}`;
    } else {
      newUrl = `${origin}/search.html?q=${encodeURIComponent(query)}&page=${targetPage}`;
      endpoint = `/api/moviesdrive?url=${encodeURIComponent(newUrl)}`;
    }
    setMoviesdriveSearchUrl(newUrl);
    setMoviesdrivePageLoading(true);
    try {
      const res = await fetch(endpoint);
      if (!res.ok) throw new Error('Catalog page fetch failed');
      const data = await res.json();
      if (data.is_search && Array.isArray(data.posts)) {
        setMoviesdriveSearchPosts(data.posts);
        
        setAllAccumulatedPosts(prev => {
          const nextMap = new Map(prev);
          data.posts.forEach((p: any) => {
            if (p.url) nextMap.set(p.url, p);
          });
          return nextMap;
        });

        if (!hasUserInteractedSelection) {
          const limit = isSkyMovies ? 50 : data.posts.length;
          setMoviesdriveSelectedUrls(prev => {
            const next = new Set(prev);
            data.posts.slice(0, limit).forEach((p: any) => {
              if (p.url) next.add(p.url);
            });
            return next;
          });
        }
      }
    } catch (e) {
      console.error("Error fetching catalog page:", e);
    } finally {
      setMoviesdrivePageLoading(false);
    }
  };

  const executeMoviesdriveSearch = (query: string) => {
    const trimmed = query.trim();
    const domain = getMoviesdriveDomain();
    let targetUrl = "";
    if (!trimmed) {
      targetUrl = `${domain}/`;
    } else if (!trimmed.startsWith("http")) {
      targetUrl = `${domain}/search.html?q=${encodeURIComponent(trimmed)}&page=1`;
    } else {
      targetUrl = trimmed;
    }
    
    // Clear cache & active search overlays for fresh search
    processedExtractionsRef.current.delete(normalizeUrl(targetUrl));
    processedExtractionsRef.current.delete(targetUrl);
    setMoviesdriveSearchUrl(null);
    setMoviesdriveSearchPosts([]);
    setAllAccumulatedPosts(new Map());
    setMoviesdriveSelectedUrls(new Set());

    setInput(targetUrl);
    setShowMoviesdriveSearchInput(false);
    setShowSkymoviesSearchInput(false);
    setShowFilmygoSearchInput(false);
    setMoviesdriveSearchTerm("");
    setTimeout(() => {
      handleCheck(undefined, targetUrl, 0, true);
    }, 100);
  };

  const executeSkymoviesSearch = (query: string) => {
    const trimmed = query.trim();
    const domain = getSkymoviesDomain();
    let targetUrl = "";
    if (!trimmed) {
      targetUrl = `${domain}/`;
    } else if (!trimmed.startsWith("http")) {
      targetUrl = `${domain}/search.php?search=${encodeURIComponent(trimmed)}&cat=All`;
    } else {
      targetUrl = trimmed;
    }

    // Clear cache & active search overlays for fresh search
    processedExtractionsRef.current.delete(normalizeUrl(targetUrl));
    processedExtractionsRef.current.delete(targetUrl);
    setMoviesdriveSearchUrl(null);
    setMoviesdriveSearchPosts([]);
    setAllAccumulatedPosts(new Map());
    setMoviesdriveSelectedUrls(new Set());

    setInput(targetUrl);
    setShowSkymoviesSearchInput(false);
    setShowMoviesdriveSearchInput(false);
    setShowFilmygoSearchInput(false);
    setSkymoviesSearchTerm("");
    setTimeout(() => {
      handleCheck(undefined, targetUrl, 0, true);
    }, 100);
  };

  const executeFilmygoSearch = (query: string) => {
    const trimmed = query.trim();
    const domain = getFilmygoDomain();
    let targetUrl = "";
    if (!trimmed) {
      targetUrl = `${domain}/?to-page=1`;
    } else if (!trimmed.startsWith("http")) {
      targetUrl = `${domain}/site-search.html?to-search=${encodeURIComponent(trimmed)}&to-page=1`;
    } else {
      targetUrl = trimmed;
    }

    // Clear cache & active search overlays for fresh search
    processedExtractionsRef.current.delete(normalizeUrl(targetUrl));
    processedExtractionsRef.current.delete(targetUrl);
    setMoviesdriveSearchUrl(null);
    setMoviesdriveSearchPosts([]);
    setAllAccumulatedPosts(new Map());
    setMoviesdriveSelectedUrls(new Set());

    setInput(targetUrl);
    setShowFilmygoSearchInput(false);
    setShowMoviesdriveSearchInput(false);
    setShowSkymoviesSearchInput(false);
    setFilmygoSearchTerm("");
    setTimeout(() => {
      handleCheck(undefined, targetUrl, 0, true);
    }, 100);
  };

  const handleClose = useCallback(() => {
    if (moviesdriveSearchUrl) {
      setMoviesdriveSearchUrl(null);
      setMoviesdriveSearchPosts([]);
      setAllAccumulatedPosts(new Map());
      setMoviesdriveSelectedUrls(new Set());
      setHasUserInteractedSelection(false);
      setMoviesdriveSearchQuery("");
      setMoviesdrivePageLoading(false);
      setCustomPageInput("");
    } else if (mdriveUrl) {
      setMdriveUrl(null);
    } else {
      onClose();
    }
  }, [moviesdriveSearchUrl, mdriveUrl, onClose]);

  useModalBehavior(isOpen, handleClose);

  const links = useMemo(() => {
    return splitLinks(input).map(normalizeUrl).filter(Boolean);
  }, [input]);

  // Auto-start check tracker
  const autoStartedInputRef = React.useRef<string | null>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  const extractedMeta = useMemo(() => {
    const map: Record<string, {
      qualityLabel?: string;
      codecLabel?: string;
      audioLabel?: string;
      subtitleLabel?: string;
      printQualityLabel?: string;
      season?: number;
      episode?: number;
      isFullSeasonMKV?: boolean;
      isFullSeasonZIP?: boolean;
    }> = {};
    for (const link of links) {
      map[link] = detectMetadataForLink(input, link, languages, qualities);
    }
    return map;
  }, [input, links, languages, qualities]);

  const extractedMetaRef = React.useRef(extractedMeta);
  React.useEffect(() => {
    extractedMetaRef.current = extractedMeta;
  }, [extractedMeta]);

  const firstType = useMemo(() => (links[0] ? guessLinkType(links[0]) : "General link"), [links]);

  const toggleExpand = (url: string) => {
    setExpanded((prev) => ({ ...prev, [url]: !prev[url] }));
  };

  const toggleSelect = (url: string) => {
    setSelectedUrls((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (areAllEligibleSelected) {
      setSelectedUrls((prev) => {
        const next = new Set(prev);
        eligibleUrlsForSelect.forEach(url => next.delete(url));
        return next;
      });
    } else {
      setSelectedUrls((prev) => {
        const next = new Set(prev);
        eligibleUrlsForSelect.forEach(url => next.add(url));
        return next;
      });
    }
  };

  const updateBatchReviewItem = (key: string, field: 'title' | 'year', value: string) => {
    setBatchReviewItems(prev => prev.map(item => 
      item.key === key ? { ...item, [field]: value } : item
    ));
  };

  const confirmBatchReview = () => {
    if (!onBatchAddLinks) return;
    
    onBatchAddLinks(batchReviewItems.map(item => ({
      title: item.title,
      year: item.year ? parseInt(item.year) : undefined,
      links: item.links,
      metadata: item.metadata
    })));
    reset();
    onClose();
  };

  const handleMdriveSearch = async (targetUrl: string) => {
    setMdriveLoading(true);
    setMdriveError(null);
    setMdriveResults([]);
    setMdriveSelectedIndices(new Set());

    try {
      const res = await fetch(`/api/mdrive?url=${encodeURIComponent(targetUrl)}`);
      if (!res.ok) throw new Error('Failed to fetch from MDrive');
      const data = await res.json();
      const hits = (data.hits || []).filter((h: any) => {
        const u = (h.url || '').toLowerCase();
        const name = (h.file_name || '').toLowerCase();
        return !u.includes('gdflix') && !name.includes('gdflix');
      });
      setMdriveResults(hits);

      if (hits.length === 1) {
        // Auto-select and proceed without UI if only one result
        const singleLink = hits[0].url;
        processedExtractionsRef.current.add(targetUrl);
        
        const baseLink = targetUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
        const escapedBase = baseLink.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(https?://)?(www\\.)?${escapedBase}/?`, 'g');
        
        const currentInput = inputRef.current;
        const nextInput = currentInput.replace(regex, singleLink);
        
        console.log("MDrive auto-replacement:", { from: targetUrl, to: singleLink });
        setInput(nextInput);
        setMdriveUrl(null);
        setMdriveResults([]);
        
        setTimeout(() => {
          handleCheck(undefined, nextInput);
        }, 400);
        return;
      }

      if (hits.length > 1) {
        // Multiple links found, show selection popup
        setMdriveUrl(targetUrl);
      } else if (hits.length === 0) {
        // No links found, mark as processed and continue
        processedExtractionsRef.current.add(targetUrl);
        setMdriveUrl(null); // Ensure popup stays closed
        setTimeout(() => {
          handleCheck();
        }, 400);
      }
    } catch (err: any) {
      // On error, show the popup so the user can see the error
      setMdriveUrl(targetUrl);
      setMdriveError(err.message);
    } finally {
      setMdriveLoading(false);
      setLoading(false); // Also reset main loading just in case
    }
  };

  const handleExtractDirectMdrive = async (index: number) => {
    const item = mdriveResults[index];
    if (!item || mdriveExtractingDirect[index]) return;

    setMdriveExtractingDirect(prev => ({ ...prev, [index]: true }));
    try {
      const res = await fetch('/api/hubcloud/direct-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: item.url })
      });
      const data = await res.json();
      
      if (data.size || data.url) {
        setMdriveResults(prev => {
          const next = [...prev];
          // We DO NOT update the url to data.url per user request, just grab the size
          next[index] = { ...next[index], size: data.size || item.size };
          return next;
        });
      }
    } catch (err) {
      console.error('Failed to extract size:', err);
    } finally {
      setMdriveExtractingDirect(prev => ({ ...prev, [index]: false }));
    }
  };

  const confirmMdriveSelection = () => {
    if (mdriveUrl && mdriveSelectedIndices.size > 0) {
      const selectedLinks = mdriveResults.filter((_, i) => mdriveSelectedIndices.has(i));
      const newLinksText = selectedLinks.map(l => l.url).join('\n');
      
      // Mark as processed BEFORE replacement to prevent it from being found again
      processedExtractionsRef.current.add(mdriveUrl);

      // Replace the MDrive link with the extracted links
      const baseLink = mdriveUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
      const escapedBase = baseLink.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(https?://)?(www\\.)?${escapedBase}/?`, 'g');
      
      // Use inputRef to ensure we have the absolute latest input
      const currentInput = inputRef.current;
      let nextInput = currentInput.replace(regex, newLinksText);
      if (nextInput === currentInput) {
        nextInput = currentInput.trim() ? `${currentInput.trim()}\n${newLinksText}` : newLinksText;
      }
      
      console.log("MDrive replacement:", { from: mdriveUrl, to: newLinksText, success: nextInput !== currentInput });
      setInput(nextInput);
      
      setMdriveUrl(null);
      setMdriveResults([]);
      
      // Trigger check for everything - this will automatically pick up the next extractions if any exist
      setTimeout(() => {
        handleCheck(undefined, nextInput);
      }, 400);
    } else if (mdriveUrl) {
      // Just remove the mdriveUrl to go back if nothing selected
      setMdriveUrl(null);
    }
  };

  const confirmMoviesdriveSearchSelection = () => {
    if (moviesdriveSearchUrl && moviesdriveSelectedUrls.size > 0) {
      const selectedPosts: { title: string; url: string; image?: string }[] = [];
      
      for (const [url, post] of allAccumulatedPosts.entries()) {
        if (moviesdriveSelectedUrls.has(url)) {
          selectedPosts.push(post);
        }
      }
      for (const post of moviesdriveSearchPosts) {
        if (moviesdriveSelectedUrls.has(post.url) && !selectedPosts.some(p => p.url === post.url)) {
          selectedPosts.push(post);
        }
      }

      const newLinksText = selectedPosts.map(p => p.url).join('\n');
      
      processedExtractionsRef.current.add(moviesdriveSearchUrl);

      const currentInput = inputRef.current;
      const targetSearchNorm = normalizeUrl(moviesdriveSearchUrl);

      let replaced = false;
      const lines = currentInput.split('\n');
      const newLines = lines.map(line => {
        const trimmed = line.trim();
        if (!trimmed) return line;
        if (trimmed === moviesdriveSearchUrl || normalizeUrl(trimmed) === targetSearchNorm || normalizeUrl(trimmed).includes(targetSearchNorm)) {
          replaced = true;
          return newLinksText;
        }
        return line;
      });

      let nextInput = newLines.join('\n');
      if (!replaced) {
        const baseLink = moviesdriveSearchUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
        const escapedBase = baseLink.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(https?://)?(www\\.)?${escapedBase}/?`, 'gi');
        nextInput = currentInput.replace(regex, newLinksText);
      }

      if (nextInput === currentInput) {
        if (currentInput.includes(moviesdriveSearchUrl)) {
          nextInput = currentInput.replace(moviesdriveSearchUrl, newLinksText);
        } else {
          nextInput = currentInput.trim() ? `${currentInput.trim()}\n${newLinksText}` : newLinksText;
        }
      }
      
      console.log("Catalog Search Page Replacement:", { from: moviesdriveSearchUrl, count: selectedPosts.length, replaced: nextInput !== currentInput });
      setInput(nextInput);
      
      setMoviesdriveSearchUrl(null);
      setMoviesdriveSearchPosts([]);
      setAllAccumulatedPosts(new Map());
      setMoviesdriveSelectedUrls(new Set());
      setHasUserInteractedSelection(false);
      setMoviesdriveSearchQuery("");
      
      setTimeout(() => {
        handleCheck(undefined, nextInput);
      }, 400);
    } else if (moviesdriveSearchUrl) {
      processedExtractionsRef.current.add(moviesdriveSearchUrl);
      setMoviesdriveSearchUrl(null);
      setMoviesdriveSearchPosts([]);
      setAllAccumulatedPosts(new Map());
      setMoviesdriveSelectedUrls(new Set());
      setHasUserInteractedSelection(false);
      setMoviesdriveSearchQuery("");
    }
  };

  const handleCheck = async (onlyUrls?: string[], initialInputOverride?: string, depth = 0, force = false) => {
    setError(null);
    if (depth === 0 && !initialInputOverride) {
      processedExtractionsRef.current.clear();
    }
    if (depth > 10) {
      console.warn("Max check depth reached, stopping recursion.");
      setLoading(false);
      return;
    }

    // Derive links directly from input or use provided override
    const currentInputSnapshot = initialInputOverride || inputRef.current;
    
    let currentLinks = onlyUrls || splitLinks(currentInputSnapshot).map(normalizeUrl).filter(Boolean);
    
    if (!currentLinks.length) {
      setError("Please paste at least one valid link first.");
      setLoading(false);
      return;
    }

    const mdDomain = getMoviesdriveDomain();
    const skyDomain = getSkymoviesDomain();
    const filmyDomain = getFilmygoDomain();

    // 1. Identify all extractable links
    const extractableLinks = currentLinks.filter(u => {
      const normU = normalizeUrl(u);
      const isExtractableHost = 
        normU.includes('howblogs.xyz') || normU.includes('sky-blogs.xyz') ||
        normU.includes('filesdl.in') || normU.includes('filesdl.top') || normU.includes('filesdl.') || normU.includes('linkmake.') ||
        normU.includes('mdrive.lol') || normU.includes('mdrvie.lol') ||
        normU.includes('moviesdrives.') || normU.includes('moviesdrive.') ||
        normU.includes('filmygo.') || normU.includes('skymovies') ||
        (mdDomain && normU.includes(normalizeUrl(mdDomain))) ||
        (skyDomain && normU.includes(normalizeUrl(skyDomain))) ||
        (filmyDomain && normU.includes(normalizeUrl(filmyDomain)));

      return isExtractableHost && 
        !processedExtractionsRef.current.has(u) && 
        !processedExtractionsRef.current.has(normU);
    });

    if (extractableLinks.length > 0) {
      setLoading(true);
      let pausedForUI = false;
      try {
        // Take up to 5 links at once
        const batch = extractableLinks.slice(0, 5);
        const results = await Promise.all(batch.map(async (targetUrl) => {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 12000);
          try {
            const normUrl = normalizeUrl(targetUrl);
            if (normUrl.includes('mdrive.lol') || normUrl.includes('mdrvie.lol')) {
              const res = await fetch(`/api/mdrive?url=${encodeURIComponent(normUrl)}`, { signal: controller.signal });
              clearTimeout(timer);
              if (!res.ok) throw new Error('MDrive fetch failed');
              const data = await res.json();
              return { type: 'mdrive', original: targetUrl, data };
            } else if (normUrl.includes('moviesdrives.') || normUrl.includes('moviesdrive.') || (mdDomain && normUrl.includes(normalizeUrl(mdDomain)))) {
              const res = await fetch(`/api/moviesdrive?url=${encodeURIComponent(normUrl)}`, { signal: controller.signal });
              clearTimeout(timer);
              if (!res.ok) throw new Error('MoviesDrive fetch failed');
              const data = await res.json();
              return { type: 'moviesdrive', original: targetUrl, data };
            } else if (normUrl.includes('filmygo.') || (filmyDomain && normUrl.includes(normalizeUrl(filmyDomain)))) {
              const res = await fetch(`/api/filmygo?url=${encodeURIComponent(normUrl)}`, { signal: controller.signal });
              clearTimeout(timer);
              if (!res.ok) throw new Error('FilmyGo fetch failed');
              const data = await res.json();
              return { type: 'filmygo', original: targetUrl, data };
            } else if (normUrl.includes('skymovies') || (skyDomain && normUrl.includes(normalizeUrl(skyDomain)))) {
              const res = await fetch(`/api/skymovieshd?url=${encodeURIComponent(normUrl)}`, { signal: controller.signal });
              clearTimeout(timer);
              if (!res.ok) throw new Error('SkymoviesHD fetch failed');
              const data = await res.json();
              return { type: 'skymovieshd', original: targetUrl, data };
            } else {
              const endpoint = normUrl.includes('howblogs.xyz') ? '/api/howblogs' : '/api/filesdl';
              const res = await fetch(`${endpoint}?url=${encodeURIComponent(normUrl)}`, { signal: controller.signal });
              clearTimeout(timer);
              if (!res.ok) throw new Error('Extraction failed');
              const data = await res.json();
              return { type: 'auto', original: targetUrl, extracted: data.url };
            }
          } catch (e) {
            clearTimeout(timer);
            console.error(`Failed to extract ${targetUrl}:`, e);
            return { type: 'error', original: targetUrl };
          }
        }));

        let nextInput = currentInputSnapshot;

        const markProcessed = (origUrl: string) => {
          processedExtractionsRef.current.add(origUrl);
          processedExtractionsRef.current.add(normalizeUrl(origUrl));
        };

        const replaceOriginalUrl = (origUrl: string, replacement: string) => {
          markProcessed(origUrl);
          const baseLink = origUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
          const escapedBase = baseLink.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(`(https?://)?(www\\.)?${escapedBase}/?`, 'g');
          let updated = nextInput.replace(regex, replacement);
          if (updated === nextInput) {
            updated = nextInput.split('\n').map(line => {
              const trimmed = line.trim();
              if (!trimmed) return line;
              if (trimmed === origUrl.trim() || normalizeUrl(trimmed) === normalizeUrl(origUrl)) {
                return replacement;
              }
              return line;
            }).join('\n');
          }
          nextInput = updated;
        };

        for (const res of results) {
          if (res.type === 'auto') {
            markProcessed(res.original);
            if (res.extracted && res.extracted !== res.original) {
              replaceOriginalUrl(res.original, res.extracted);
              console.log("Auto-replacement successful:", { from: res.original, to: res.extracted });
            }
          } else if (res.type === 'mdrive' || res.type === 'moviesdrive' || res.type === 'filmygo' || res.type === 'skymovieshd') {
            if ((res.type === 'moviesdrive' || res.type === 'skymovieshd' || res.type === 'filmygo') && res.data?.is_search) {
              markProcessed(res.original);
              if (Array.isArray(res.data?.posts) && res.data.posts.length > 0) {
                setMoviesdriveSearchUrl(res.original);
                setMoviesdriveSearchPosts(res.data.posts);
                const isSky = res.type === 'skymovieshd' || res.original.includes('skymovies');
                const initialLimit = isSky ? 10 : Math.min(res.data.posts.length, 25);

                const accMap = new Map<string, { title: string; url: string; image?: string }>();
                res.data.posts.forEach((p: any) => {
                  if (p.url) accMap.set(p.url, p);
                });
                setAllAccumulatedPosts(accMap);

                const initialSelected = new Set<string>();
                res.data.posts.slice(0, initialLimit).forEach((p: any) => {
                  if (p.url) initialSelected.add(p.url);
                });
                setMoviesdriveSelectedUrls(initialSelected);
                setHasUserInteractedSelection(false);
                setMoviesdriveSearchQuery("");
                pausedForUI = true;
                break;
              } else {
                setError(`No matching contents found on ${res.type === 'skymovieshd' ? 'SkyMoviesHD' : res.type === 'filmygo' ? 'FilmyGo' : 'MoviesDrive'}.`);
              }
            }

            const rawHits = res.data?.hits || [];
            const hits = rawHits.filter((h: any) => {
              const u = (h.url || '').toLowerCase();
              const name = (h.file_name || '').toLowerCase();
              return !u.includes('gdflix') && !name.includes('gdflix');
            });
            if (hits.length > 0) {
              if (res.type === 'filmygo') {
                const autoHits = filterFilmygoHits(hits, res.original);
                if (autoHits.length > 0) {
                  const selectedUrls = autoHits.map(h => h.url).join('\n');
                  replaceOriginalUrl(res.original, selectedUrls);
                  console.log(`FilmyGo auto-selected ${autoHits.length} hits without modal popup:`, { from: res.original, count: autoHits.length });
                } else {
                  // Show selection UI if autoHits is empty but hits exist
                  setMdriveUrl(res.original);
                  setMdriveResults(hits);
                  setMdriveSelectedIndices(new Set());
                  pausedForUI = true;
                  break;
                }
              } else if (res.type === 'mdrive') {
                if (hits.length === 1) {
                  replaceOriginalUrl(res.original, hits[0].url);
                  console.log("MDrive auto-extraction successful (1 link).");
                } else {
                  setMdriveUrl(res.original);
                  setMdriveResults(hits);
                  setMdriveSelectedIndices(new Set());
                  pausedForUI = true;
                  break;
                }
              } else if (hits.length === 1) {
                const singleLink = hits[0].url;
                replaceOriginalUrl(res.original, singleLink);
                console.log(`${res.type === 'moviesdrive' ? 'MoviesDrive' : 'SkymoviesHD'} auto-replacement successful:`, { from: res.original, to: singleLink });
              } else {
                setMdriveUrl(res.original);
                setMdriveResults(hits);
                setMdriveSelectedIndices(new Set());
                pausedForUI = true;
                break; 
              }
            } else {
              // 0 hits
              markProcessed(res.original);
            }
          } else if (res.type === 'error') {
            console.log("Extraction error for", res.original, "- skipping from this session");
            markProcessed(res.original);
          }
        }

        setInput(nextInput);
        
        if (!pausedForUI) {
          setTimeout(() => {
            handleCheck(undefined, nextInput, depth + 1, force);
          }, 400);
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
      return;
    }

    // 2. Original MDrive detection logic is now integrated into batch above, 
    // but just in case something slipped through or direct call:
    // (Actually the batch handles it all now)

    // 3. Final Scan Loop - FILTER OUT host links that should be extracted
    const urls = currentLinks.filter(u => 
      !u.includes('mdrive.lol') && !u.includes('mdrvie.lol') && 
      !u.includes('howblogs.xyz') && 
      !u.includes('filesdl.in') &&
      !u.includes('filesdl.top') &&
      !u.includes('moviesdrives.') &&
      !u.includes('moviesdrive.') &&
      !u.includes('filmygo.') &&
      !u.includes('skymovies')
    );
    
    if (urls.length === 0 && currentLinks.length > 0) {
      // If we filtered everything out but had links, it means we are waiting for extractions or extractions failed
      setLoading(false);
      return;
    }
    
    for (const u of urls) {
      try {
        new URL(u);
      } catch {
        setError(`Invalid URL: ${u}`);
        return;
      }
    }

    if (!onlyUrls?.length) {
      setSelectedUrls(new Set());
    }

    setLoading(true);
    try {
      const concurrency = 20;
      const allResults: LinkCheckResult[] = [];
      const queue = [...urls];
      let activeCount = 0;
      let completedCount = 0;

      const processNext = async (): Promise<void> => {
        while (queue.length > 0) {
          const u = queue.shift();
          if (!u) break;

          try {
            const result = await performFullLinkScan(u, extractedMetaRef.current, languages, qualities, undefined, undefined, undefined, force);
            allResults.push(result);
            completedCount++;

            const isHubcloud = result.url.toLowerCase().includes("hubcloud");
            const hasPixeldrain = isHubcloud && !!result.candidates?.some(c => c.text.toLowerCase().includes("pixeldrain") || c.href.toLowerCase().includes("pixeldrain"));
            const isSelectable = result.statusLabel === "WORKING" || result.statusLabel === "SMALL_FILE" || result.statusLabel === "MISSING_FILENAME" || result.statusLabel === "MISSING_METADATA" || result.statusLabel === "SIZE_MISMATCH";

            if (isSelectable) {
              if (!isHubcloud || hasPixeldrain) {
                setSelectedUrls((prev) => new Set(prev).add(result.url));
              }
            }
          } catch (e: any) {
            console.error(`Error checking link ${u}:`, e);
            const meta = extractedMetaRef.current[u] || extractedMetaRef.current[normalizeUrl(u)] || {};
            const errorResult: LinkCheckResult = {
              url: u,
              ok: false,
              statusLabel: "UNKNOWN",
              message: e?.message || "Check failed due to a network or fetch error.",
              season: meta.season,
              episode: meta.episode,
              isFullSeasonMKV: meta.isFullSeasonMKV,
              isFullSeasonZIP: meta.isFullSeasonZIP,
              qualityLabel: meta.qualityLabel,
              codecLabel: meta.codecLabel,
              audioLabel: meta.audioLabel,
              subtitleLabel: meta.subtitleLabel,
              printQualityLabel: meta.printQualityLabel,
            };
            allResults.push(errorResult);
            completedCount++;
          } finally {
            // Update results incrementally for better UX
            setResults((prev) => {
              let merged: LinkCheckResult[];
              if (onlyUrls?.length) {
                const keep = prev.filter((r) => !onlyUrls.includes(r.url));
                merged = [...keep, ...allResults];
              } else {
                merged = [...allResults];
              }
              return merged;
            });
          }
        }
      };

      const workers = Array.from({ length: Math.min(concurrency, urls.length) }, () => processNext());
      await Promise.all(workers);
      
      // Calculate mismatchWarnings at the end to avoid O(N^3) complexity during incremental updates
      const finalResults = allResults.map(r => ({
        ...r,
        mismatchWarnings: buildMismatchWarnings(r, allResults, languages, qualities),
        confidenceScore: Math.max(0, 100 - (buildMismatchWarnings(r, allResults, languages, qualities).length * 18)),
      }));

      setResults(prev => {
        if (onlyUrls?.length) {
          const keep = prev.filter((r) => !onlyUrls.includes(r.url));
          const merged = [...keep, ...finalResults];
          return merged.map(r => ({
            ...r,
            mismatchWarnings: buildMismatchWarnings(r, merged, languages, qualities),
            confidenceScore: Math.max(0, 100 - (buildMismatchWarnings(r, merged, languages, qualities).length * 18)),
          }));
        }
        return finalResults;
      });

      if (onResults) {
        onResults(finalResults);
      }
    } catch (e: any) {
      setError(e?.message || "Unknown error while checking links.");
    } finally {
      setLoading(false);
    }
  };

  const extractTitleAndYear = (text: string) => {
    let year: number | undefined;
    let title: string | undefined;

    // Detect year - look for 4 digits that start with 19 or 20
    const yearPattern = /(?:\D|^)(19\d{2}|20\d{2})(?:\D|$)/;
    const yearMatch = text.match(yearPattern);

    if (yearMatch) {
      year = parseInt(yearMatch[1], 10);
      const yearIndex = text.indexOf(yearMatch[1]);
      title = text.substring(0, yearIndex).trim();
    } else {
      // No year, look for quality/print/language markers
      const noiseMarkers = [
        '\\d{3,4}p', '[0-9]k', 'web[-.\\s_]?(dl|rip)', 
        'hd[-.\\s_]?rip', 'blu[-.\\s_]?ray', 'bd[-.\\s_]?rip', 
        'br[-.\\s_]?rip', 'hdtc', 'hdcam', 'dvdrip', 'webrip',
        'hq', 'proper', 'repack', 'internal', 'hevc', 'x264', 'x265', 'aac', 'ac3',
        'dual[-.\\s_]?audio', 'multi[-.\\s_]?audio',
        'hindi', 'english', 'tamil', 'telugu', 'malayalam', 'kannada', 'urdu', 'punjabi',
        's\\d+e\\d+', 's\\d+', 'season', 'episode'
      ];
      
      const markerRegex = new RegExp(`\\b(${noiseMarkers.join('|')})\\b`, 'i');
      const markerMatch = text.match(markerRegex);
      
      if (markerMatch) {
        title = text.substring(0, markerMatch.index).trim();
      } else {
        title = text.trim();
      }
    }

    if (title) {
      // Strip extensions and noise
      title = title
        .replace(/\.(mkv|mp4|zip|rar|avi|mov|wmv|flv|ts)$/i, '')
        .replace(/[\[\]\(\)\{\}\.\-_/]/g, ' ') 
        .replace(/\s+/g, ' ')
        .trim();

      // Clean up common prefix noise like "🎬", "*", etc
      title = title.replace(/^[🎬\s\*]+/, '');

      // Explicitly strip any season markers (S1, S2, S3, S4, S5, S01, S02, S03, Season 1, Season 2, etc.) from title
      title = title
        .replace(/\b(seasons?|s)\s*[-_]?\s*\d{1,2}\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();

      // Capitalize
      title = title.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
      return { title: title || undefined, year };
    }

    return { title: undefined, year };
  };

  const handleAddLinks = () => {
    if ((!onAddLinks && !onBatchAddLinks) || results.length === 0) return;
    
    const validResultsRaw = results.filter(r => selectedUrls.has(r.url));
    if (validResultsRaw.length === 0) return;

    // Deduplicate by URL
    const seenUrls = new Set<string>();
    const validResults: LinkCheckResult[] = [];
    for (const r of validResultsRaw) {
      if (!seenUrls.has(r.url)) {
        seenUrls.add(r.url);
        validResults.push(r);
      }
    }

    const qualityLinks: QualityLinks = validResults.map(r => {
      // Use detected quality or fallback
      const quality = r.qualityLabel || '720p';

      // Build a descriptive name
      let finalName = quality;
      
      const source = `${r.fileName || ""} ${r.finalUrl || ""}`.toLowerCase();
      let detectedS: number | undefined;
      let detectedE: number | undefined;

      const combinedMatch = source.match(/\bs(\d+)e(\d+)(?![a-z0-9])/i) || 
                           source.match(/season\s*(\d+).*?episode\s*(\d+)/i) ||
                           source.match(/\bs(\d+)\s*e(\d+)\b/i) ||
                           source.match(/\bdl\s*(\d+)\s*(\d+)\b/i);

      if (combinedMatch) {
        detectedS = parseInt(combinedMatch[1]);
        detectedE = parseInt(combinedMatch[2]);
      } else {
        const sMatch = source.match(/\bs(\d+)\b/i) || source.match(/season\s*(\d+)/i) || source.match(/ss\s*(\d+)/i);
        const eMatch = source.match(/\be(\d+)\b/i) || source.match(/episode\s*(\d+)\b/i) || source.match(/ep\s*(\d+)\b/i);
        if (sMatch) detectedS = parseInt(sMatch[1]);
        if (eMatch) detectedE = parseInt(eMatch[1]);
      }

      if (r.codecLabel === "HEVC") finalName += ` HEVC`;
      if (r.audioLabel && r.audioLabel.includes('Dual') && r.codecLabel !== "HEVC") finalName += ' Dual';

      // Determine size and unit
      let sizeStr = '';
      let unit: 'MB' | 'GB' = 'MB';
      
      if (r.fileSizeText) {
        const parts = r.fileSizeText.split(' ');
        if (parts.length === 2 && (parts[1].toUpperCase() === 'MB' || parts[1].toUpperCase() === 'GB')) {
          sizeStr = parts[0];
          unit = parts[1].toUpperCase() as 'MB' | 'GB';
        } else {
          sizeStr = r.fileSizeText.replace(/MB|GB/i, '').trim();
          unit = r.fileSizeText.toLowerCase().includes('gb') ? 'GB' : 'MB';
        }
      } else if (r.fileSize) {
        const sizeMB = r.fileSize / (1000 * 1000);
        if (sizeMB >= 1000) {
          sizeStr = (sizeMB / 1000).toFixed(2);
          unit = 'GB';
        } else {
          sizeStr = sizeMB.toFixed(1).replace(/\.0$/, '');
          unit = 'MB';
        }
      }

      const linkItem: LinkDef = {
        id: Math.random().toString(36).substr(2, 9),
        name: finalName,
        url: normalizeUrl(r.finalUrl || r.url),
        size: sizeStr,
        unit: unit,
      };

      const hasEpisodeRange = /(?:e|ep|episode)\s*\d+\s*(?:-|to|&)\s*(?:e|ep)?\d+/i.test(source);

      const finalS = detectedS !== undefined ? detectedS : r.season;
      const finalE = (detectedE !== undefined && !hasEpisodeRange) ? detectedE : r.episode;

      if (finalS !== undefined) linkItem.season = finalS;
      if (finalE !== undefined) linkItem.episode = finalE;
      if (source.includes('.zip')) {
        linkItem.isFullSeasonZIP = true;
      } else if (hasEpisodeRange || /full season|all episodes|complete/i.test(source)) {
        linkItem.isFullSeasonMKV = true;
      }
      if (source.toLowerCase().includes('sample')) linkItem.isSample = true;

      return linkItem;
    });
    
    if (isBatchMode && onBatchAddLinks) {
       const batchesMap = new Map<string, { 
         title: string; 
         year: number | undefined; 
         links: QualityLinks;
         detectMetadata: {
           languages: Set<string>;
           printQuality?: string;
           subtitles: boolean;
           type: "movie" | "series";
           season?: number;
           episode?: number;
         }
       }>();
       
       qualityLinks.forEach((ql, idx) => {
         const r = validResults[idx];
         const sourceText = `${r.fileName || ""} ${r.url || ""}`;
         const { title: extractedTitle, year: extractedYear } = extractTitleAndYear(sourceText);
         const year = extractedYear || r.year;
         const title = extractedTitle;
         const derivedTitle = title || `Untitled ${new Date().getFullYear()}`;
         const isSeries = !!(ql.season || ql.episode);
         const key = isSeries ? derivedTitle : `${derivedTitle}|${year || ''}`;
 
         if (!batchesMap.has(key)) {
            batchesMap.set(key, { 
              title: derivedTitle, 
              year, 
              links: [],
              detectMetadata: {
                languages: new Set<string>(),
                subtitles: false,
                type: "movie"
              }
            });
         }
         
         const batch = batchesMap.get(key)!;
         if (!batch.links.some(l => l.url === ql.url)) {
           batch.links.push(ql);
         }
 
         // Update detection per batch (if movie, keep movie, if any link is series, whole batch is series)
         if (ql.season || ql.episode || ql.isFullSeasonMKV || ql.isFullSeasonZIP || /full season|all episodes|complete/i.test(sourceText)) {
           batch.detectMetadata.type = "series";
         }
         
         if (r.audioLabel) {
           r.audioLabel.split(" / ").forEach(l => batch.detectMetadata.languages.add(l));
         }
         if (r.printQualityLabel && !batch.detectMetadata.printQuality) {
           batch.detectMetadata.printQuality = r.printQualityLabel;
         }
         const source = (`${r.fileName || ""} ${r.finalUrl || ""}`).toLowerCase();
         if (r.subtitleLabel || /subtitles|subs|softsub|hardsub|esub|esubs|msub|msubs/i.test(source)) {
           batch.detectMetadata.subtitles = true;
         }
 
         // Apply detected S/E to batch metadata if not already set (fallback for creation)
         if (ql.season && !batch.detectMetadata.season) batch.detectMetadata.season = ql.season;
         if (ql.episode && !batch.detectMetadata.episode) batch.detectMetadata.episode = ql.episode;
       });

       const itemsToReview = Array.from(batchesMap.entries()).map(([key, b]) => ({
         key,
         title: b.title,
         year: b.year ? String(b.year) : '',
         links: b.links,
         metadata: {
           ...b.detectMetadata,
           languages: Array.from(b.detectMetadata.languages)
         }
       }));

       setBatchReviewItems(itemsToReview);
       setIsReviewingBatch(true);
       return;
    }

    // Collect metadata to pass back (Single mode)
    const detectedLangs = new Set<string>();
    let detectedPrintQuality: string | undefined;
    let detectedSubtitles = false;
    let detectedType: "movie" | "series" | undefined;
    let detectedSeason: number | undefined;
    let detectedEpisode: number | undefined;

    let seriesCount = 0;

    validResults.forEach(r => {
      const source = `${r.fileName || ""} ${r.finalUrl || ""}`.toLowerCase();
      
      if (r.audioLabel) {
        r.audioLabel.split(" / ").forEach(l => detectedLangs.add(l));
      }
      if (r.printQualityLabel && !detectedPrintQuality) {
        detectedPrintQuality = r.printQualityLabel;
      }
      if (r.subtitleLabel || /subtitles|subs|softsub|hardsub|esub|esubs|msub|msubs/i.test(source)) {
        detectedSubtitles = true;
      }

      let isSeriesLink = false;
      const hasEpisodeRange = /(?:e|ep|episode)\s*\d+\s*(?:-|to|&)\s*(?:e|ep)?\d+/i.test(source);
      if (r.isFullSeasonMKV || r.isFullSeasonZIP || /full season|all episodes|complete/i.test(source) || hasEpisodeRange) {
        isSeriesLink = true;
      }

      // Detect Series vs Movie
      const combinedMatch = hasEpisodeRange ? null : source.match(/\bs(\d+)e(\d+)(?![a-z0-9])/i);
      if (combinedMatch) {
         isSeriesLink = true;
        detectedSeason = parseInt(combinedMatch[1]);
        detectedEpisode = parseInt(combinedMatch[2]);
      } else {
        const seriesMatch = source.match(/\b(s(\d+)|season\s*(\d+))(?![a-z0-9])/i);
        if (seriesMatch) {
           isSeriesLink = true;
          detectedSeason = parseInt(seriesMatch[2] || seriesMatch[3]);
          
          const episodeMatch = hasEpisodeRange ? null : source.match(/(?:e(\d+)|episode\s*(\d+))(?![a-z0-9])/i);
          if (episodeMatch) {
            detectedEpisode = parseInt(episodeMatch[1] || episodeMatch[2]);
          }
        } else {
           const episodeMatch = hasEpisodeRange ? null : source.match(/(?:e(\d+)|episode\s*(\d+))(?![a-z0-9])/i);
           if (episodeMatch && !source.match(/\b(movie|film)\b/i)) {
               isSeriesLink = true;
               detectedEpisode = parseInt(episodeMatch[1] || episodeMatch[2]);
           }
        }
      }
      if (isSeriesLink) seriesCount++;
    });

    if (seriesCount >= 3 || validResults.some(r => r.isFullSeasonMKV || r.isFullSeasonZIP || (r.season === 1 && r.episode === 1) || /full season|all episodes|complete/i.test(`${r.fileName || ""} ${r.finalUrl || ""}`))) {
       detectedType = "series";
    }

    const combinedNames = validResults.map(r => r.fileName || '').join(' ') + ' ' + input;
    const { title: extractedTitle, year: extractedYear } = extractTitleAndYear(combinedNames);
    
    // Fallback to first working result's year if available
    const fallbackYear = validResults.find(r => r.year)?.year;
    const year = extractedYear || fallbackYear;
    const title = extractedTitle;

    if (onAddLinks) {
      onAddLinks(qualityLinks, {
        languages: Array.from(detectedLangs),
        printQuality: detectedPrintQuality,
        subtitles: detectedSubtitles,
        type: detectedType,
        season: detectedSeason,
        episode: detectedEpisode,
        // @ts-ignore
        title,
        // @ts-ignore
        year
      });
    }
    reset();
    onClose();
  };

  const pasteFromClipboard = async (isAuto = false, suppliedText?: string) => {
    try {
      const text = suppliedText !== undefined ? suppliedText : await navigator.clipboard.readText();
      if (!text) return;

      const newLinks = splitLinks(text).map(normalizeUrl).filter(Boolean);

      let addedAny = false;
      const newlyAddedUrls: string[] = [];

      setInput((prev) => {
        if (prev.includes(text)) return prev;
        addedAny = true;
        if (newLinks.length > 0) {
          newlyAddedUrls.push(...newLinks);
        }
        // Instead of conditionally doing text, insert the entire pasted payload
        // This is safe because splitLinks will extract the URLs anyway
        return prev.trim() ? prev + '\n' + text : text;
      });

      if (addedAny && newLinks.length > 0 && isAuto && results.length > 0 && !loading) {
        // Automatically check the newly added links if we already have results
        handleCheck(newlyAddedUrls);
      }
      
      if (!isAuto) setError(null);
    } catch (e) {
      if (!isAuto) setError("Clipboard access denied. Please paste manually.");
    }
  };

  const lastClipboardTextRef = React.useRef<string>("");

  useEffect(() => {
    if (isOpen) {
      if (initialInput) {
        setInput(initialInput);
      } else {
        setInput('');
      }
      setResults([]);
      setSelectedUrls(new Set());
      setError(null);
      setExpanded({});
      setIsReviewingBatch(false);
      setBatchReviewItems([]);
      setAutoClipboard(false);
      setMdriveUrl(null);
      setMdriveResults([]);
      setMdriveSelectedIndices(new Set());
      setMoviesdriveSearchUrl(null);
      setMoviesdriveSearchPosts([]);
      setAllAccumulatedPosts(new Map());
      setMoviesdriveSelectedUrls(new Set());
      setHasUserInteractedSelection(false);
      setMoviesdriveSearchQuery("");
      processedExtractionsRef.current = new Set();

      if (autoStart && initialInput && autoStartedInputRef.current !== initialInput) {
        const initialLinks = splitLinks(initialInput).map(normalizeUrl).filter(Boolean);
        if (initialLinks.length > 0) {
          autoStartedInputRef.current = initialInput;
          handleCheck(initialLinks, initialInput);
        }
      }
    } else {
      autoStartedInputRef.current = null;
    }
  }, [isOpen, initialInput, autoStart, disableAutoClipboard]);

  useEffect(() => {
    if (!isOpen || disableAutoClipboard || !autoClipboard) {
      setClipboardStatus("idle");
      return;
    }

    const checkClipboardText = async () => {
      try {
        const text = await navigator.clipboard.readText();
        setClipboardStatus("active");
        if (!text || !text.trim()) return;

        const trimmedText = text.trim();
        if (trimmedText === lastClipboardTextRef.current) return;

        const extracted = splitLinks(trimmedText);
        if (extracted.length === 0) return;

        lastClipboardTextRef.current = trimmedText;
        await pasteFromClipboard(true, trimmedText);
      } catch (err: any) {
        // Keep status active to prevent confusing "Standing By" or broken warnings.
        // We'll rely on hover and interaction events to automatically gain focus
        // so that the browser successfully satisfies the clipboard reading requirement.
        if (err?.name === "SecurityError") {
          setClipboardStatus("denied");
        } else {
          setClipboardStatus("active");
        }
      }
    };

    const forceWindowFocusAndCheck = () => {
      try {
        window.focus();
      } catch (e) {}
      checkClipboardText();
    };

    // Check clipboard at regular intervals (every 3 seconds)
    const interval = setInterval(checkClipboardText, 3000);

    // Bind event listeners to grab focus when user engages with this floating window/area
    window.addEventListener("focus", checkClipboardText);
    window.addEventListener("mouseenter", forceWindowFocusAndCheck);
    window.addEventListener("pointerenter", forceWindowFocusAndCheck);
    window.addEventListener("click", forceWindowFocusAndCheck);
    document.addEventListener("visibilitychange", checkClipboardText);

    // On setup, actively try to focus and inspect
    forceWindowFocusAndCheck();

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", checkClipboardText);
      window.removeEventListener("mouseenter", forceWindowFocusAndCheck);
      window.removeEventListener("pointerenter", forceWindowFocusAndCheck);
      window.removeEventListener("click", forceWindowFocusAndCheck);
      document.removeEventListener("visibilitychange", checkClipboardText);
    };
  }, [isOpen, disableAutoClipboard, autoClipboard]);

  const reset = () => {
    setInput("");
    setResults([]);
    setSelectedUrls(new Set());
    setError(null);
    setExpanded({});
    setIsReviewingBatch(false);
    setBatchReviewItems([]);
    setMdriveUrl(null);
    setMdriveResults([]);
    setMdriveSelectedIndices(new Set());
    setMoviesdriveSearchUrl(null);
    setMoviesdriveSearchPosts([]);
    setAllAccumulatedPosts(new Map());
    setMoviesdriveSelectedUrls(new Set());
    setHasUserInteractedSelection(false);
    setMoviesdriveSearchQuery("");
    processedExtractionsRef.current = new Set();
  };

  const retryFailed = () => {
    const failed = results
      .filter((r) => !r.ok || r.statusLabel === "UNKNOWN" || r.statusLabel === "MISSING_FILENAME" || r.statusLabel === "BROKEN" || r.statusLabel === "UNAVAILABLE" || isMissingPixeldrain(r))
      .map((r) => r.url);
    if (failed.length) handleCheck(failed, undefined, 0, true);
  };

  const copyResults = async () => {
    const text = JSON.stringify(results, null, 2);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      setError("Could not copy results.");
    }
  };

  const summary = useMemo(() => {
    const working = results.filter((r) => r.statusLabel === "WORKING").length;
    const broken = results.filter((r) => r.statusLabel === "BROKEN").length;
    const protectedCount = results.filter((r) => r.statusLabel === "PROTECTED").length;
    const redirect = results.filter((r) => r.statusLabel === "REDIRECT").length;
    const unavailable = results.filter((r) => r.statusLabel === "UNAVAILABLE").length;
    const unknown = results.filter((r) => r.statusLabel === "UNKNOWN").length;
    const mismatches = results.filter((r) => (r.mismatchWarnings?.length || 0) > 0).length;
    const missingFilename = results.filter((r) => r.statusLabel === "MISSING_FILENAME").length;
    const missingQuality = results.filter((r) => r.statusLabel === "MISSING_METADATA" && r.message?.includes("Quality")).length;
    const missingLanguage = results.filter((r) => r.statusLabel === "MISSING_METADATA" && r.message?.includes("Language")).length;
    const smallFile = results.filter((r) => r.statusLabel === "SMALL_FILE").length;
    const sizeMismatch = results.filter((r) => r.statusLabel === "SIZE_MISMATCH").length;
    return { working, broken, protectedCount, redirect, unavailable, unknown, mismatches, missingFilename, missingQuality, missingLanguage, smallFile, sizeMismatch };
  }, [results]);

  const sortedResults = useMemo(() => {
    const items = results.map((rawResult) => {
      const { mergedResult: result, tag: locationTag } = resolveLocationAndMetadata(rawResult);
      const isWorking = Boolean(
        result.ok ||
        result.statusLabel === "WORKING" ||
        result.statusLabel === "REDIRECT" ||
        result.statusLabel === "PROTECTED"
      );
      return { rawResult, result, locationTag, isWorking };
    });

    items.sort((itemA, itemB) => {
      // 1. Working links first, non-working links at the end
      if (itemA.isWorking && !itemB.isWorking) return -1;
      if (!itemA.isWorking && itemB.isWorking) return 1;

      const a = itemA.result;
      const b = itemB.result;

      // 2. Hubcloud / Pixeldrain prioritization
      const isHubcloudA = (a.url || "").toLowerCase().includes("hubcloud");
      const isHubcloudB = (b.url || "").toLowerCase().includes("hubcloud");

      const hasPixeldrainA = isHubcloudA && !!a.candidates?.some(c => c.text.toLowerCase().includes("pixeldrain") || c.href.toLowerCase().includes("pixeldrain"));
      const hasPixeldrainB = isHubcloudB && !!b.candidates?.some(c => c.text.toLowerCase().includes("pixeldrain") || c.href.toLowerCase().includes("pixeldrain"));

      if (hasPixeldrainA && !hasPixeldrainB) return 1;
      if (!hasPixeldrainA && hasPixeldrainB) return -1;

      if (isHubcloudA && !isHubcloudB) return 1;
      if (!isHubcloudA && isHubcloudB) return -1;

      // 3. Group by location / metadata type: ZIP (1), MKV (2), Episodes (3), Movie/Other (4)
      const typeA = a.isFullSeasonZIP ? 1 : a.isFullSeasonMKV ? 2 : (a.season !== undefined || a.episode !== undefined) ? 3 : 4;
      const typeB = b.isFullSeasonZIP ? 1 : b.isFullSeasonMKV ? 2 : (b.season !== undefined || b.episode !== undefined) ? 3 : 4;

      if (typeA !== typeB) return typeA - typeB;

      // Type 1 (ZIP) or Type 2 (MKV): sort by season if available
      if (typeA === 1 || typeA === 2) {
        if (a.season !== undefined && b.season !== undefined && a.season !== b.season) {
          return (a.season || 0) - (b.season || 0);
        }
      }

      // Type 3 (Episodes): sort by season ascending, then episode ascending
      if (typeA === 3) {
        if (a.season !== b.season) return (a.season || 0) - (b.season || 0);
        if (a.episode !== b.episode) return (a.episode || 0) - (b.episode || 0);
      }

      // Sort by location tag / name naturally if present (e.g. for non-working links)
      const locA = itemA.locationTag || a.locationName || "";
      const locB = itemB.locationTag || b.locationName || "";
      if (locA && locB && locA !== locB) {
        const comp = locA.localeCompare(locB, undefined, { numeric: true, sensitivity: 'base' });
        if (comp !== 0) return comp;
      } else if (locA && !locB) {
        return -1;
      } else if (!locA && locB) {
        return 1;
      }

      // 4. Sort by size ascending (smallest to largest)
      return (a.fileSize || 0) - (b.fileSize || 0);
    });

    return items;
  }, [results, resolveLocationAndMetadata]);

  return (
    <AnimatePresence>
      {isOpen ? (
        <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div initial={{ opacity: 0, y: 20, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.98 }} transition={{ duration: 0.18 }} className="w-full max-w-5xl max-h-[95vh] overflow-y-auto custom-scrollbar">
            <div className="rounded-3xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 shadow-2xl overflow-hidden transition-colors duration-300">
              <div className="p-5 md:p-6 space-y-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-2xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-2.5 transition-colors duration-300">
                      <LinkIcon className="h-5 w-5 text-cyan-500 dark:text-cyan-400" />
                    </div>
                    <div>
                      <h2 className="text-xl font-semibold leading-none text-zinc-900 dark:text-white">
                        {isReviewingBatch ? 'Review Batch Items' : (isBatchMode ? 'Batch Link Checker (Missing Details)' : title)}
                      </h2>
                      <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                        {isReviewingBatch ? 'Please verify and enter missing years for each item before saving.' : 'Check Pixeldrain, direct file links, protected download gateways, and missing movie posts.'}
                      </p>
                    </div>
                  </div>
                  <button onClick={handleClose} className="rounded-full px-3 py-1.5 text-sm text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-white transition">Close</button>
                </div>

                {moviesdriveSearchUrl ? (
                  <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-1">
                      <div>
                        <h3 className="text-lg font-bold flex items-center gap-2 text-zinc-900 dark:text-white">
                          <Search className={`w-5 h-5 ${moviesdrivePageInfo.isSkyMovies ? "text-purple-500" : moviesdrivePageInfo.isFilmygo ? "text-emerald-500" : "text-indigo-500"}`} />
                          {moviesdrivePageInfo.isSkyMovies ? "SkyMoviesHD Search Page Contents" : moviesdrivePageInfo.isFilmygo ? "FilmyGo Search Page Contents" : "MoviesDrive Search Page Contents"}
                        </h3>
                        <p className="text-xs text-zinc-500 mt-0.5">
                          Found {moviesdriveSearchPosts.length} contents on this search page. Select the items you want to scrape.
                        </p>
                      </div>
                      <div className="flex gap-2 items-center shrink-0">
                        <button 
                          onClick={() => {
                            setHasUserInteractedSelection(true);
                            if (moviesdriveSelectedUrls.size > 0) {
                              setMoviesdriveSelectedUrls(new Set());
                            } else {
                              const allUrls = new Set<string>();
                              moviesdriveSearchPosts.forEach(p => { if (p.url) allUrls.add(p.url); });
                              for (const url of allAccumulatedPosts.keys()) {
                                allUrls.add(url);
                              }
                              setMoviesdriveSelectedUrls(allUrls);
                            }
                          }}
                          className={`text-xs font-bold px-3 py-1.5 rounded-xl transition-colors ${
                            moviesdriveSelectedUrls.size > 0
                              ? "text-red-500 hover:text-red-400 bg-red-500/10 border border-red-500/20"
                              : "text-indigo-500 hover:text-indigo-400 bg-indigo-500/10 border border-indigo-500/20"
                          }`}
                        >
                          {moviesdriveSelectedUrls.size > 0 ? "Deselect All" : "Select All"}
                        </button>
                        <button 
                          onClick={handleSelectAllFiltered}
                          disabled={moviesdriveFilteredPosts.length === 0}
                          className={`text-xs font-bold px-3 py-1.5 rounded-xl transition-colors disabled:opacity-40 ${
                            areAllFilteredSelected
                              ? "text-rose-500 hover:text-rose-400 bg-rose-500/10 border border-rose-500/20"
                              : "text-emerald-500 hover:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20"
                          }`}
                        >
                          {areAllFilteredSelected ? "Deselect Filtered" : `Select Filtered (${moviesdriveFilteredPosts.length})`}
                        </button>
                        <button 
                          onClick={() => {
                            processedExtractionsRef.current.add(moviesdriveSearchUrl);
                            setMoviesdriveSearchUrl(null);
                            setMoviesdriveSearchPosts([]);
                            setAllAccumulatedPosts(new Map());
                            setMoviesdriveSelectedUrls(new Set());
                            setHasUserInteractedSelection(false);
                            setMoviesdriveSearchQuery("");
                          }}
                          className="text-xs font-bold text-zinc-500 hover:text-zinc-400 px-3 py-1.5 bg-zinc-500/10 rounded-xl"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="relative flex-1">
                        <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                        <input
                          type="text"
                          placeholder="Filter contents by name..."
                          value={moviesdriveSearchQuery}
                          onChange={(e) => setMoviesdriveSearchQuery(e.target.value)}
                          className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-10 pr-4 py-2 text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:border-indigo-500 transition"
                        />
                      </div>

                      {/* Availability Filter Tabs */}
                      <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-900 p-1 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs font-bold shrink-0">
                        <button
                          type="button"
                          onClick={() => setAvailabilityFilter('all')}
                          className={`px-3 py-1 rounded-lg transition ${availabilityFilter === 'all' ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'}`}
                        >
                          All ({moviesdriveSearchPosts.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setAvailabilityFilter('missing')}
                          className={`px-3 py-1 rounded-lg transition flex items-center gap-1 ${availabilityFilter === 'missing' ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30' : 'text-zinc-500 hover:text-amber-500'}`}
                        >
                          <AlertTriangle className="w-3 h-3" />
                          Missing ({moviesdriveMissingCount})
                        </button>
                        <button
                          type="button"
                          onClick={() => setAvailabilityFilter('available')}
                          className={`px-3 py-1 rounded-lg transition flex items-center gap-1 ${availabilityFilter === 'available' ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30' : 'text-zinc-500 hover:text-emerald-500'}`}
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          Available ({moviesdriveAvailCount})
                        </button>
                      </div>
                    </div>

                    {/* Pagination Controls - Only for MoviesDrive / FilmyGo */}
                    {!moviesdrivePageInfo.isSkyMovies && (
                      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-zinc-50 dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleMoviesdrivePageChange(1)}
                            disabled={moviesdrivePageInfo.page <= 1 || moviesdrivePageLoading}
                            className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 transition flex items-center gap-1"
                            title="First Page"
                          >
                            <ChevronsLeft className="w-3.5 h-3.5" />
                            First
                          </button>
                          <button
                            onClick={() => handleMoviesdrivePageChange(moviesdrivePageInfo.page - 1)}
                            disabled={moviesdrivePageInfo.page <= 1 || moviesdrivePageLoading}
                            className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 transition flex items-center gap-1"
                            title="Previous Page"
                          >
                            <ChevronLeft className="w-3.5 h-3.5" />
                            Prev
                          </button>
                          <span className={`text-xs font-bold px-3 py-1.5 rounded-xl border ${moviesdrivePageInfo.isFilmygo ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-indigo-500/10 text-indigo-500 border-indigo-500/20"}`}>
                            Page {moviesdrivePageInfo.page}
                          </span>
                          <button
                            onClick={() => handleMoviesdrivePageChange(moviesdrivePageInfo.page + 1)}
                            disabled={moviesdrivePageLoading}
                            className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 transition flex items-center gap-1"
                            title="Next Page"
                          >
                            Next
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <form 
                          onSubmit={(e) => {
                            e.preventDefault();
                            const num = parseInt(customPageInput, 10);
                            if (!isNaN(num) && num >= 1) {
                              handleMoviesdrivePageChange(num);
                              setCustomPageInput("");
                            }
                          }}
                          className="flex items-center gap-2"
                        >
                          <span className="text-xs text-zinc-500 font-medium">Custom Page:</span>
                          <input
                            type="number"
                            min={1}
                            placeholder="#"
                            value={customPageInput}
                            onChange={(e) => setCustomPageInput(e.target.value)}
                            className="w-16 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-2 py-1 text-xs text-center font-bold text-zinc-900 dark:text-zinc-100 outline-none focus:border-indigo-500"
                          />
                          <button
                            type="submit"
                            disabled={!customPageInput || moviesdrivePageLoading}
                            className="px-3 py-1 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40 transition"
                          >
                            Go
                          </button>
                        </form>
                      </div>
                    )}

                    {moviesdrivePageLoading ? (
                      <div className="py-16 flex flex-col items-center justify-center gap-3">
                        <LoaderIcon className="w-8 h-8 text-indigo-500 animate-spin" />
                        <p className="text-sm font-medium text-zinc-500">Loading Page {moviesdrivePageInfo.page}...</p>
                      </div>
                    ) : (
                      (() => {
                        if (moviesdriveDisplayedPosts.length === 0) {
                          return (
                            <div className="py-12 text-center text-zinc-500 text-sm font-medium bg-zinc-50 dark:bg-zinc-900/50 rounded-2xl border border-zinc-200 dark:border-zinc-800">
                              No contents match the current filter criteria.
                            </div>
                          );
                        }

                        return (
                          <div className="flex flex-col gap-3">
                            <div className="grid gap-2 max-h-[50vh] overflow-y-auto custom-scrollbar pr-2">
                              {moviesdriveDisplayedPosts.map(({ post, originalIndex, avail }, idx) => {
                                const isSelected = moviesdriveSelectedUrls.has(post.url);
                                return (
                                  <div 
                                    key={post.url || originalIndex}
                                    id={`skymovies-post-item-${idx}`}
                                    onClick={() => {
                                      setHasUserInteractedSelection(true);
                                      setMoviesdriveSelectedUrls(prev => {
                                        const next = new Set(prev);
                                        if (next.has(post.url)) next.delete(post.url);
                                        else next.add(post.url);
                                        return next;
                                      });
                                    }}
                                    className={`group p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                                      isSelected 
                                        ? 'bg-indigo-500/10 border-indigo-500/40 shadow-xs' 
                                        : 'bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                      {/* Poster with overlaid checkbox */}
                                      <div className="relative shrink-0 select-none">
                                        <PostPoster image={post.image} title={post.title} />
                                        <div className={`absolute top-1 left-1 p-0.5 rounded-md flex items-center justify-center transition-all shadow-xs ${
                                          isSelected 
                                            ? 'bg-indigo-600 text-white ring-1 ring-white/30' 
                                            : 'bg-black/60 backdrop-blur-xs ring-1 ring-white/20 hover:bg-black/80'
                                        }`}>
                                          <input 
                                            type="checkbox" 
                                            checked={isSelected}
                                            onChange={() => {}}
                                            className="w-3.5 h-3.5 rounded border-0 text-indigo-600 focus:ring-0 shrink-0 pointer-events-none cursor-pointer accent-indigo-600"
                                          />
                                        </div>
                                      </div>
                                      
                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                                            #{originalIndex + 1}
                                          </span>

                                          {/* Availability Badge */}
                                          {avail.isAvailable ? (
                                            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1 shadow-xs">
                                              <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                                              Available
                                            </span>
                                          ) : (
                                            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center gap-1 shadow-xs">
                                              <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
                                              Missing
                                            </span>
                                          )}

                                          {/* Upgrade / Reason Tag */}
                                          {avail.reason && !avail.isAvailable && avail.reason !== 'Not in Gallery' && (
                                            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 flex items-center gap-1 shadow-xs">
                                              {avail.reason}
                                            </span>
                                          )}

                                          {/* Recognized Title & Year Tag */}
                                          {avail.parsed.formatted && (
                                            <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 border border-indigo-500/20 truncate max-w-[220px]">
                                              Recognized: {avail.parsed.formatted}
                                            </span>
                                          )}
                                        </div>
                                        <h4 className="text-xs sm:text-sm font-bold text-zinc-900 dark:text-zinc-100 leading-snug break-words">
                                          {post.title}
                                        </h4>
                                      </div>
                                    </div>

                                    <div className="shrink-0 flex items-center gap-2">
                                      <a 
                                        href={post.url} 
                                        target="_blank" 
                                        rel="noreferrer" 
                                        onClick={(e) => e.stopPropagation()}
                                        className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition"
                                        title="Open post in new tab"
                                      >
                                        <ExternalLink className="w-4 h-4" />
                                      </a>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>

                            {moviesdrivePageInfo.isSkyMovies && skymoviesVisibleLimit < moviesdriveFilteredPosts.length && (
                              <div className="pt-2 flex justify-center">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const nextIdx = skymoviesVisibleLimit;
                                    setSkymoviesVisibleLimit(prev => prev + 50);
                                    setTimeout(() => {
                                      const el = document.getElementById(`skymovies-post-item-${nextIdx}`);
                                      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                    }, 80);
                                  }}
                                  className="px-6 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-md shadow-purple-600/20 transition flex items-center gap-2"
                                >
                                  <ChevronDown className="w-4 h-4" />
                                  Load More (50) — Showing {moviesdriveDisplayedPosts.length} of {moviesdriveFilteredPosts.length}
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })()
                    )}

                    <div className="flex items-center justify-between pt-4 border-t border-zinc-200 dark:border-zinc-800">
                      <span className="text-xs text-zinc-500 font-medium">
                        {moviesdriveSelectedUrls.size} selected
                      </span>
                      <div className="flex gap-2.5">
                        <button 
                          onClick={() => {
                            setMoviesdriveSearchUrl(null);
                            setMoviesdriveSearchPosts([]);
                            setAllAccumulatedPosts(new Map());
                            setMoviesdriveSelectedUrls(new Set());
                            setHasUserInteractedSelection(false);
                            setMoviesdriveSearchQuery("");
                          }}
                          className="px-4 py-2 rounded-xl text-xs font-bold text-zinc-500 hover:text-zinc-700 dark:hover:text-white transition-colors bg-zinc-100 dark:bg-zinc-800"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={confirmMoviesdriveSearchSelection}
                          disabled={moviesdriveSelectedUrls.size === 0}
                          className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-md shadow-indigo-600/20"
                        >
                          <Download className="w-4 h-4" />
                          Scrape Selected ({moviesdriveSelectedUrls.size})
                        </button>
                      </div>
                    </div>
                  </div>
                ) : mdriveUrl ? (
                  <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                    <div className="flex items-center justify-between px-1">
                      <div>
                        <h3 className="text-lg font-bold">
                          {(mdriveUrl.includes('mdrive.lol') || mdriveUrl.includes('mdrvie.lol')) ? 'MDrive Selection' : 
                          mdriveUrl.includes('filmygo.') ? 'FilmyGo FilesDL Selection' : 
                          mdriveUrl.includes('skymovies') ? 'SkymoviesHD HowBlogs Selection' :
                          'MoviesDrive MDrive Selection'}
                        </h3>
                        <p className="text-xs text-zinc-500">
                          {(mdriveUrl.includes('mdrive.lol') || mdriveUrl.includes('mdrvie.lol')) ? 'Pick the Hubcloud links you want to extract' : 
                          mdriveUrl.includes('filmygo.') ? 'Pick the FilesDL links you want to process' :
                          mdriveUrl.includes('skymovies') ? 'Pick the HowBlogs links you want to process' :
                          'Pick the MDrive links you want to process'}
                        </p>
                      </div>
                      <div className="flex gap-2 items-center">
                        <button 
                          onClick={async () => {
                            const indicesToFetch = mdriveResults
                              .map((item, index) => (!item.size ? index : -1))
                              .filter(index => index !== -1);
                            
                            // Process in batches of 3 to avoid overwhelming
                            for (let i = 0; i < indicesToFetch.length; i++) {
                              handleExtractDirectMdrive(indicesToFetch[i]);
                              if ((i + 1) % 3 === 0) await new Promise(r => setTimeout(r, 800));
                            }
                          }}
                          className="text-xs font-bold text-cyan-500 hover:text-cyan-400 px-3 py-1 bg-cyan-500/10 rounded-lg flex items-center gap-1.5"
                        >
                          <Info className="w-3.5 h-3.5" />
                          Fetch Sizes
                        </button>
                        <button 
                          onClick={() => {
                            if (mdriveResults.length > 0 && mdriveSelectedIndices.size === mdriveResults.length) {
                              setMdriveSelectedIndices(new Set());
                            } else {
                              setMdriveSelectedIndices(new Set(mdriveResults.keys()));
                            }
                          }}
                          className={`text-xs font-bold px-3 py-1 rounded-lg transition-colors ${
                            mdriveResults.length > 0 && mdriveSelectedIndices.size === mdriveResults.length
                              ? "text-red-500 hover:text-red-400 bg-red-500/10"
                              : "text-cyan-500 hover:text-cyan-400 bg-cyan-500/10"
                          }`}
                        >
                          {mdriveResults.length > 0 && mdriveSelectedIndices.size === mdriveResults.length ? "Deselect All" : "Select All"}
                        </button>
                        <button 
                          onClick={handleClose}
                          className="text-xs font-bold text-zinc-500 hover:text-zinc-400 px-3 py-1 bg-zinc-500/10 rounded-lg"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>

                    {mdriveLoading ? (
                      <div className="py-20 flex flex-col items-center justify-center gap-4">
                        <LoaderIcon className="w-10 h-10 text-cyan-500 animate-spin" />
                        <p className="text-zinc-500 text-sm animate-pulse">Scraping MDrive page...</p>
                      </div>
                    ) : mdriveError ? (
                      <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-3 text-red-500 text-sm">
                        <AlertTriangle className="w-5 h-5 shrink-0" />
                        {mdriveError}
                      </div>
                    ) : (
                      <div className="grid gap-2 max-h-[50vh] overflow-y-auto custom-scrollbar pr-2">
                        {mdriveResults.map((item, i) => (
                          <div 
                            key={i}
                            className={`group p-4 rounded-2xl border transition-all cursor-pointer flex items-center gap-4 ${
                              mdriveSelectedIndices.has(i) 
                                ? 'bg-cyan-500/5 border-cyan-500/30' 
                                : 'bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'
                            }`}
                            onClick={() => {
                              setMdriveSelectedIndices(prev => {
                                const next = new Set(prev);
                                if (next.has(i)) next.delete(i);
                                else next.add(i);
                                return next;
                              });
                            }}
                          >
                            <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 transition-all ${
                              mdriveSelectedIndices.has(i)
                                ? 'bg-cyan-500 border-cyan-500'
                                : 'border-zinc-300 dark:border-zinc-700'
                            }`}>
                              {mdriveSelectedIndices.has(i) && <CheckCircle2 className="w-4 h-4 text-white" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              {(() => {
                                const locTag = getLocationTag({ fileName: item.file_name, url: item.url });
                                return (
                                  <>
                                    <div className="flex items-center gap-2">
                                      {locTag && (
                                        <span className="px-2 py-0.5 rounded text-[11px] font-mono font-extrabold bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 border border-indigo-500/30 shrink-0">
                                          {locTag}
                                        </span>
                                      )}
                                      <h4 className="text-sm font-bold truncate text-zinc-900 dark:text-white flex-1">
                                        {item.file_name || 'HubCloud Link'}
                                      </h4>
                                    </div>
                                    <p className="text-[10px] text-zinc-500 flex items-center gap-2 mt-1 truncate">
                                      <LinkIcon className="w-3 h-3 shrink-0" />
                                      <span className="truncate">{item.url}</span>
                                    </p>
                                  </>
                                );
                              })()}
                            </div>
                            <div className="flex items-center gap-2">
                              {(item.size || item.file_size) ? (
                                <span className="text-[10px] font-mono bg-cyan-500/20 px-2 py-1 rounded text-cyan-500 uppercase border border-cyan-500/20">
                                  {item.size || item.file_size}
                                </span>
                              ) : (
                                <span className="text-[10px] font-mono bg-zinc-200 dark:bg-zinc-800 px-2 py-1 rounded text-zinc-400 uppercase italic">
                                  No Size
                                </span>
                              )}
                              {!item.is_direct && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleExtractDirectMdrive(i);
                                  }}
                                  disabled={mdriveExtractingDirect[i]}
                                  className="p-2 bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 rounded-xl text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-all disabled:opacity-50"
                                  title="Extract Direct Drive Link"
                                >
                                  {mdriveExtractingDirect[i] ? <LoaderIcon className="w-4 h-4 animate-spin text-cyan-500" /> : <ExternalLink className="w-4 h-4" />}
                                </button>
                              )}
                              {item.is_direct && (
                                <div className="p-2 bg-cyan-500/20 rounded-xl text-cyan-500" title="Direct Drive Link Extracted">
                                  <CheckCircle2 className="w-4 h-4" />
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex justify-end gap-3 pt-4 border-t border-zinc-200 dark:border-zinc-800">
                      <button 
                        onClick={() => setMdriveUrl(null)}
                        className="px-6 py-2.5 rounded-2xl text-sm font-bold text-zinc-500 hover:text-zinc-700 dark:hover:text-white transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={confirmMdriveSelection}
                        disabled={mdriveSelectedIndices.size === 0}
                        className="bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 text-white px-8 py-2.5 rounded-2xl font-bold flex items-center gap-2 transition-all shadow-lg shadow-cyan-500/20"
                      >
                        Add {mdriveSelectedIndices.size} Extracted Links
                      </button>
                    </div>
                  </div>
                ) : isReviewingBatch ? (
                  <div className="space-y-6">
                    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-4 space-y-4 max-h-[60vh] overflow-y-auto custom-scrollbar">
                      {batchReviewItems.map((item) => (
                        <div key={item.key} className="flex flex-col md:flex-row gap-6 p-5 rounded-2xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 shadow-sm transition-all hover:bg-zinc-100/50 dark:hover:bg-zinc-900/80">
                          <div className="flex-1 space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                              <div className="md:col-span-9">
                                <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400 mb-1.5 block">Content Title</label>
                                <input 
                                  type="text" 
                                  value={item.title} 
                                  onChange={(e) => updateBatchReviewItem(item.key, 'title', e.target.value)}
                                  className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm font-medium outline-none focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-500 shadow-sm transition-all"
                                  placeholder="Enter title..."
                                />
                              </div>
                              <div className="md:col-span-3">
                                <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400 mb-1.5 block">Release Year</label>
                                <div className="relative">
                                  <input 
                                    type="text" 
                                    value={item.year} 
                                    onChange={(e) => updateBatchReviewItem(item.key, 'year', e.target.value.replace(/\D/g, ''))}
                                    className={`w-full bg-white dark:bg-zinc-950 border ${!item.year ? 'border-red-500/50 focus:ring-red-500/20' : 'border-zinc-200 dark:border-zinc-800 focus:ring-cyan-500/20'} rounded-xl px-4 py-2.5 text-sm font-mono outline-none focus:ring-2 transition-all`}
                                    placeholder="YYYY"
                                    maxLength={4}
                                  />
                                  {!item.year && (
                                    <div className="absolute -bottom-5 left-0">
                                      <p className="text-[10px] font-medium text-red-500 flex items-center gap-1">
                                        <AlertTriangle className="h-2.5 w-2.5" /> Year required
                                      </p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center justify-between mb-2">
                              <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400 block">Detected Metadata & Flags</label>
                              <button 
                                onClick={() => setBatchReviewItems(prev => prev.filter(i => i.key !== item.key))}
                                className="p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all group"
                                title="Remove Item"
                              >
                                <Trash2 className="h-4 w-4 group-hover:scale-110 transition-transform" />
                              </button>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${item.metadata.type === 'series' ? 'bg-indigo-500/15 text-indigo-500 border-indigo-500/30' : 'bg-blue-500/15 text-blue-500 border-blue-500/30'}`}>
                                {item.metadata.type}
                              </span>
                              {item.metadata.languages.map((l) => (
                                <span key={l} className="inline-flex items-center rounded-full border bg-emerald-500/15 text-emerald-500 border-emerald-500/30 px-2.5 py-1 text-[10px] font-semibold">
                                  {l}
                                </span>
                              ))}
                              {item.metadata.printQuality && (
                                <span className="inline-flex items-center rounded-full border bg-fuchsia-500/15 text-fuchsia-500 border-fuchsia-500/30 px-2.5 py-1 text-[10px] font-semibold">
                                  {item.metadata.printQuality}
                                </span>
                              )}
                              {item.metadata.subtitles && (
                                <span className="inline-flex items-center rounded-full border bg-amber-500/15 text-amber-500 border-amber-500/30 px-2.5 py-1 text-[10px] font-semibold uppercase">
                                  Subs
                                </span>
                              )}
                              <span className="inline-flex items-center rounded-full border bg-zinc-500/10 text-zinc-500 border-zinc-500/20 px-2.5 py-1 text-[10px] font-medium">
                                {item.links.length} Source{item.links.length > 1 ? 's' : ''}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                      {batchReviewItems.length === 0 && (
                        <div className="py-12 text-center text-zinc-500">No items to save.</div>
                      )}
                    </div>
                    
                    <div className="flex gap-3 justify-end pt-2">
                      <button 
                        onClick={() => setIsReviewingBatch(false)}
                        className="px-6 py-2.5 rounded-2xl border border-zinc-200 dark:border-zinc-800 text-sm font-bold hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all"
                      >
                        Back to Results
                      </button>
                      <button 
                        onClick={confirmBatchReview}
                        disabled={batchReviewItems.length === 0}
                        className="px-8 py-2.5 rounded-2xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 disabled:opacity-50 transition-all shadow-lg shadow-emerald-500/20"
                      >
                        Save Drafts ({batchReviewItems.length})
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/60 p-4 space-y-3 transition-colors duration-300">
                  <label className="text-sm font-medium text-zinc-700 dark:text-zinc-200">Paste one or multiple links / full movie post</label>
                  <textarea ref={textareaRef} value={input} onChange={(e) => setInput(e.target.value)} placeholder="Paste links or a full movie post here..." rows={6} className="w-full rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-4 py-3 text-sm text-zinc-900 dark:text-white placeholder:text-zinc-500 outline-none focus:ring-2 focus:ring-cyan-500 transition-colors duration-300" />

                  {!disableAutoClipboard && (
                    <div className="flex flex-col gap-2">
                      <label className="inline-flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={autoClipboard}
                          onChange={(e) => setAutoClipboard(e.target.checked)}
                          className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-cyan-500 focus:ring-cyan-500"
                        />
                        Auto-detect and paste links from clipboard (Every 3s)
                      </label>
                      {autoClipboard && (
                        <div className="text-xs pl-6 transition-all duration-300">
                          {clipboardStatus === "denied" ? (
                            <span className="text-rose-600 dark:text-rose-400 font-medium flex items-center gap-1.5 animate-fade-in">
                              <span className="inline-block w-2 h-2 rounded-full bg-rose-500" />
                              Access restricted (Please grant clipboard permission)
                            </span>
                          ) : (
                            <span className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1.5 animate-fade-in">
                              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                              Active (Monitoring clipboard)
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => pasteFromClipboard(false)} className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-8 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 gap-2 transition-colors w-32"><ClipboardPaste className="h-4 w-4" />Paste</button>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-zinc-500 dark:text-zinc-400">
                    <span>Detected type: <strong className="text-zinc-900 dark:text-zinc-200">{firstType}</strong> • <strong className="text-zinc-900 dark:text-zinc-200">{links.length}</strong> link(s) found</span>
                    <span className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400"><ShieldCheck className="h-4 w-4" />Checks only when manually used</span>
                  </div>
                </div>

                {/* MoviesDrive Direct Search Input Bar */}
                {showMoviesdriveSearchInput && (
                  <form 
                    onSubmit={(e) => {
                      e.preventDefault();
                      executeMoviesdriveSearch(moviesdriveSearchTerm);
                    }}
                    className="flex items-center gap-2 p-3 bg-indigo-500/10 border border-indigo-500/30 rounded-2xl animate-in fade-in slide-in-from-top-2 duration-200"
                  >
                    <Search className="w-4 h-4 text-indigo-500 shrink-0 ml-1" />
                    <input
                      type="text"
                      placeholder={`Search title or leave empty for Home page (${getMoviesdriveDomain()})...`}
                      value={moviesdriveSearchTerm}
                      onChange={(e) => setMoviesdriveSearchTerm(e.target.value)}
                      className="flex-1 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3.5 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:border-indigo-500 font-medium"
                      autoFocus
                    />
                    <button
                      type="submit"
                      className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition shadow-sm flex items-center gap-1.5 shrink-0"
                    >
                      <Search className="w-3.5 h-3.5" />
                      Search MoviesDrive
                    </button>
                  </form>
                )}

                {/* SkyMoviesHD Direct Search Input Bar */}
                {showSkymoviesSearchInput && (
                  <form 
                    onSubmit={(e) => {
                      e.preventDefault();
                      executeSkymoviesSearch(skymoviesSearchTerm);
                    }}
                    className="flex items-center gap-2 p-3 bg-purple-500/10 border border-purple-500/30 rounded-2xl animate-in fade-in slide-in-from-top-2 duration-200"
                  >
                    <Search className="w-4 h-4 text-purple-500 shrink-0 ml-1" />
                    <input
                      type="text"
                      placeholder={`Search title or leave empty for Home page (${getSkymoviesDomain()})...`}
                      value={skymoviesSearchTerm}
                      onChange={(e) => setSkymoviesSearchTerm(e.target.value)}
                      className="flex-1 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3.5 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:border-purple-500 font-medium"
                      autoFocus
                    />
                    <button
                      type="submit"
                      className="px-4 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs transition shadow-sm flex items-center gap-1.5 shrink-0"
                    >
                      <Search className="w-3.5 h-3.5" />
                      Search SkyMoviesHD
                    </button>
                  </form>
                )}

                {/* FilmyGo Direct Search Input Bar */}
                {showFilmygoSearchInput && (
                  <form 
                    onSubmit={(e) => {
                      e.preventDefault();
                      executeFilmygoSearch(filmygoSearchTerm);
                    }}
                    className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl animate-in fade-in slide-in-from-top-2 duration-200"
                  >
                    <Search className="w-4 h-4 text-emerald-500 shrink-0 ml-1" />
                    <input
                      type="text"
                      placeholder={`Search title or leave empty for Home page (${getFilmygoDomain()})...`}
                      value={filmygoSearchTerm}
                      onChange={(e) => setFilmygoSearchTerm(e.target.value)}
                      className="flex-1 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3.5 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:border-emerald-500 font-medium"
                      autoFocus
                    />
                    <button
                      type="submit"
                      className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition shadow-sm flex items-center gap-1.5 shrink-0"
                    >
                      <Search className="w-3.5 h-3.5" />
                      Search FilmyGo
                    </button>
                  </form>
                )}

                {/* Domain Configuration Panel */}
                {showDomainSettings && (
                  <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-2xl space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                        <Globe className="w-4 h-4" /> Custom Search Domains (Saved in Local Storage)
                      </h4>
                      <button 
                        type="button" 
                        onClick={() => setShowDomainSettings(false)}
                        className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 text-xs"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">MoviesDrive Domain</label>
                        <input
                          type="text"
                          value={moviesdriveDomainInput}
                          onChange={(e) => setMoviesdriveDomainInput(e.target.value)}
                          placeholder="https://new6.moviesdrives.my"
                          className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-zinc-900 dark:text-zinc-100 outline-none focus:border-amber-500 font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">SkyMoviesHD Domain</label>
                        <input
                          type="text"
                          value={skymoviesDomainInput}
                          onChange={(e) => setSkymoviesDomainInput(e.target.value)}
                          placeholder="https://skymovieshd.ceo"
                          className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-zinc-900 dark:text-zinc-100 outline-none focus:border-amber-500 font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">FilmyGo Domain</label>
                        <input
                          type="text"
                          value={filmygoDomainInput}
                          onChange={(e) => setFilmygoDomainInput(e.target.value)}
                          placeholder="https://filmygo.online"
                          className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-zinc-900 dark:text-zinc-100 outline-none focus:border-amber-500 font-mono"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setMoviesdriveDomainInput("https://new6.moviesdrives.my");
                          setSkymoviesDomainInput("https://skymovieshd.ceo");
                          setFilmygoDomainInput("https://filmygo.online");
                        }}
                        className="px-3 py-1 text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition"
                      >
                        Reset Defaults
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveDomains}
                        className="px-4 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs transition shadow-sm flex items-center gap-1.5"
                      >
                        Save & Apply Domains
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <button onClick={() => handleCheck()} disabled={loading} className="inline-flex items-center justify-center rounded-xl gap-1.5 bg-cyan-500 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-cyan-600 dark:hover:bg-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm">{loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}{loading ? "Checking..." : `Check ${links.length || ""} Link${links.length > 1 ? "s" : ""}`}</button>
                  <button 
                    onClick={() => {
                      const trimmedInput = input.trim();
                      if (trimmedInput && !trimmedInput.startsWith("http")) {
                        executeMoviesdriveSearch(trimmedInput);
                      } else {
                        setShowMoviesdriveSearchInput(prev => !prev);
                        setShowSkymoviesSearchInput(false);
                        setShowFilmygoSearchInput(false);
                      }
                    }} 
                    className="inline-flex items-center justify-center rounded-xl border border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 px-3.5 py-1.5 text-xs font-bold text-indigo-500 dark:text-indigo-400 gap-1.5 transition-colors shadow-sm"
                    title="Toggle MoviesDrive search bar or search text"
                  >
                    <Search className="h-3.5 w-3.5" /> Search MoviesDrive
                  </button>
                  <button 
                    onClick={() => {
                      const trimmedInput = input.trim();
                      if (trimmedInput && !trimmedInput.startsWith("http")) {
                        executeSkymoviesSearch(trimmedInput);
                      } else {
                        setShowSkymoviesSearchInput(prev => !prev);
                        setShowMoviesdriveSearchInput(false);
                        setShowFilmygoSearchInput(false);
                      }
                    }} 
                    className="inline-flex items-center justify-center rounded-xl border border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20 px-3.5 py-1.5 text-xs font-bold text-purple-500 dark:text-purple-400 gap-1.5 transition-colors shadow-sm"
                    title="Toggle SkyMoviesHD search bar or search text"
                  >
                    <Search className="h-3.5 w-3.5" /> Search SkyMoviesHD
                  </button>
                  <button 
                    onClick={() => {
                      const trimmedInput = input.trim();
                      if (trimmedInput && !trimmedInput.startsWith("http")) {
                        executeFilmygoSearch(trimmedInput);
                      } else {
                        setShowFilmygoSearchInput(prev => !prev);
                        setShowMoviesdriveSearchInput(false);
                        setShowSkymoviesSearchInput(false);
                      }
                    }} 
                    className="inline-flex items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 px-3.5 py-1.5 text-xs font-bold text-emerald-500 dark:text-emerald-400 gap-1.5 transition-colors shadow-sm"
                    title="Toggle FilmyGo search bar or search text"
                  >
                    <Search className="h-3.5 w-3.5" /> Search FilmyGo
                  </button>
                  <button
                    onClick={() => {
                      setMoviesdriveDomainInput(getMoviesdriveDomain());
                      setSkymoviesDomainInput(getSkymoviesDomain());
                      setFilmygoDomainInput(getFilmygoDomain());
                      setShowDomainSettings(prev => !prev);
                    }}
                    className="inline-flex items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 px-3.5 py-1.5 text-xs font-bold text-amber-600 dark:text-amber-400 gap-1.5 transition-colors shadow-sm"
                    title="Configure custom search domains saved in local storage"
                  >
                    <Globe className="h-3.5 w-3.5" /> Site Domains
                  </button>
                  <button onClick={retryFailed} className="inline-flex items-center justify-center rounded-xl border border-zinc-200 dark:border-zinc-800 bg-transparent px-3.5 py-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 gap-1.5 disabled:opacity-50 transition-colors" disabled={loading || !results.some((r) => !r.ok || r.statusLabel === "UNKNOWN" || r.statusLabel === "MISSING_FILENAME" || r.statusLabel === "BROKEN" || r.statusLabel === "UNAVAILABLE" || isMissingPixeldrain(r))}><RefreshCw className="h-3.5 w-3.5" /> Retry Failed</button>
                  <button onClick={copyResults} className="inline-flex items-center justify-center rounded-xl border border-zinc-200 dark:border-zinc-800 bg-transparent px-3.5 py-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 gap-1.5 disabled:opacity-50 transition-colors" disabled={!results.length}><Copy className="h-3.5 w-3.5" /> Copy Results</button>
                  <button onClick={reset} className="inline-flex items-center justify-center rounded-xl border border-zinc-200 dark:border-zinc-800 bg-transparent px-3.5 py-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 gap-1.5 transition-colors"><Trash2 className="h-3.5 w-3.5" /> Reset</button>
                  
                  {!!results.length && (
                    <button onClick={toggleSelectAll} className="inline-flex items-center justify-center rounded-xl border border-zinc-200 dark:border-zinc-800 bg-transparent px-3.5 py-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 gap-1.5 transition-colors">
                      {areAllEligibleSelected ? "Deselect All" : "Select All"}
                    </button>
                  )}

                  {(onAddLinks || onBatchAddLinks) && selectedUrls.size > 0 && !loading && (
                    <button onClick={handleAddLinks} className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 gap-1.5 ml-auto transition-colors shadow-sm">
                      <LinkIcon className="h-3.5 w-3.5" />
                      {isBatchMode ? `Add ${selectedUrls.size} Links Missing` : `Add ${selectedUrls.size} Link(s)`}
                    </button>
                  )}
                </div>
              </>
            )}

                {error ? <div className="rounded-2xl border border-red-200 dark:border-red-900/70 bg-red-50 dark:bg-red-950/40 p-4 text-red-600 dark:text-red-300 text-sm flex items-start gap-2 transition-colors duration-300"><AlertTriangle className="h-4 w-4 mt-0.5" /><span>{error}</span></div> : null}

                {!!results.length && (
                  <div className="grid grid-cols-2 md:grid-cols-9 gap-3">
                    {[
                      ["Working", summary.working, "text-emerald-600 dark:text-emerald-400"],
                      ["Broken", summary.broken, "text-red-600 dark:text-red-400"],
                      ["Size Mismatch", summary.sizeMismatch, "text-red-600 dark:text-red-400"],
                      ["Protected", summary.protectedCount, "text-yellow-600 dark:text-yellow-400"],
                      ["Redirect", summary.redirect, "text-cyan-600 dark:text-cyan-400"],
                      ["Unavailable", summary.unavailable, "text-orange-600 dark:text-orange-400"],
                      ["Unknown", summary.unknown, "text-zinc-500 dark:text-zinc-300"],
                      ["Mismatches", summary.mismatches, "text-pink-600 dark:text-pink-400"],
                      ["Missing Filename", summary.missingFilename, "text-pink-600 dark:text-pink-400"],
                      ["Missing Quality", summary.missingQuality, "text-pink-600 dark:text-pink-400"],
                      ["Missing Language", summary.missingLanguage, "text-pink-600 dark:text-pink-400"],
                      ["Small File", summary.smallFile, "text-orange-600 dark:text-orange-400"]
                    ].map(([label, count, color]) => (
                      <div key={String(label)} className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/60 p-4 transition-colors duration-300">
                        <div className={`text-sm ${color}`}>{label}</div>
                        <div className="text-2xl font-semibold text-zinc-900 dark:text-white mt-1">{count}</div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="space-y-3 max-h-[500px] overflow-auto pr-1">
                  {sortedResults.map(({ result, locationTag }) => {
                    const statusLabel = result.statusLabel || (result.ok ? "WORKING" : "UNKNOWN");
                    const openRow = !!expanded[result.url];

                    return (
                      <div key={`${result.url}-${result.qualityLabel || "na"}`} className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 overflow-hidden transition-colors duration-300">
                        <div className="p-4 space-y-3">
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                            <div className="min-w-0 flex-1 flex items-start gap-3">
                              <div className="mt-1">
                                <input type="checkbox" checked={selectedUrls.has(result.url)} onChange={() => toggleSelect(result.url)} className="h-5 w-5 rounded border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  {result.ok ? <CheckCircle2 className="h-5 w-5 text-emerald-500 dark:text-emerald-400" /> : <XCircle className="h-5 w-5 text-red-500 dark:text-red-400" />}
                                  <div className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${badgeMap[statusLabel]}`}>{statusLabel}</div>
                                  {result.isDirectDownload ? <div className="inline-flex rounded-full border border-blue-200 dark:border-blue-800 bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-600 dark:text-blue-400"><FileDown className="h-3.5 w-3.5 mr-1" /> Direct Download</div> : null}
                                  {(result.mismatchWarnings?.length || 0) > 0 ? <div className="inline-flex rounded-full border border-pink-200 dark:border-pink-800 bg-pink-500/10 px-3 py-1 text-xs font-medium text-pink-600 dark:text-pink-400"><Siren className="h-3.5 w-3.5 mr-1" /> Mismatch</div> : null}
                                </div>
                                <div className="mt-2 flex flex-wrap gap-2 items-center">
                                  {result.qualityLabel ? <span className="rounded-full border border-fuchsia-200 dark:border-fuchsia-800 bg-fuchsia-500/10 px-2.5 py-1 text-[11px] font-medium text-fuchsia-600 dark:text-fuchsia-300">{result.qualityLabel}</span> : null}
                                  {result.printQualityLabel ? <span className="rounded-full border border-rose-200 dark:border-rose-800 bg-rose-500/10 px-2.5 py-1 text-[11px] font-medium text-rose-600 dark:text-rose-300">{result.printQualityLabel}</span> : null}
                                  {result.codecLabel ? <span className="rounded-full border border-indigo-200 dark:border-indigo-800 bg-indigo-500/10 px-2.5 py-1 text-[11px] font-medium text-indigo-600 dark:text-indigo-300">{result.codecLabel}</span> : null}
                                  {result.audioLabel ? <span className="rounded-full border border-emerald-200 dark:border-emerald-800 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-300">{result.audioLabel}</span> : null}
                                  {result.subtitleLabel ? <span className="rounded-full border border-amber-200 dark:border-amber-800 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-600 dark:text-amber-300">{result.subtitleLabel}</span> : null}
                                  {locationTag ? (
                                    <span className="rounded-full border border-indigo-300 dark:border-indigo-700 bg-indigo-500/20 px-2.5 py-1 text-[11px] font-extrabold text-indigo-600 dark:text-indigo-300 shadow-xs">
                                      Location: {locationTag}
                                    </span>
                                  ) : (
                                    <>
                                      {result.season ? <span className="rounded-full border border-blue-200 dark:border-blue-800 bg-blue-500/10 px-2.5 py-1 text-[11px] font-bold text-blue-600 dark:text-blue-300">Season {result.season}</span> : null}
                                      {result.episode ? <span className="rounded-full border border-indigo-200 dark:border-indigo-800 bg-indigo-500/10 px-2.5 py-1 text-[11px] font-bold text-indigo-600 dark:text-indigo-300">Episode {result.episode}</span> : null}
                                      {result.isFullSeasonMKV ? <span className="rounded-full border border-purple-200 dark:border-purple-800 bg-purple-500/10 px-2.5 py-1 text-[11px] font-bold text-purple-600 dark:text-purple-300">Full Season MKV</span> : null}
                                      {result.isFullSeasonZIP ? <span className="rounded-full border border-purple-200 dark:border-purple-800 bg-purple-500/10 px-2.5 py-1 text-[11px] font-bold text-purple-600 dark:text-purple-300">Full Season ZIP</span> : null}
                                    </>
                                  )}
                                </div>
                                {(result.url.toLowerCase().includes("hubcloud") || (result.candidates && result.candidates.length > 0)) && (
                                  <div className="mt-2 flex flex-wrap gap-2 items-center">
                                    <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 mr-1 flex items-center gap-1.5"><Server className="h-3.5 w-3.5" /> Downloads:</span>
                                    {result.candidates && result.candidates.length > 0 ? (
                                      <>
                                        {result.candidates.map((cand, idx) => {
                                          let name = cand.text.replace(/download/i, '').replace(/\[|\]/g, '').trim();
                                          if (!name) return null;
                                          const isPixeldrain = name.toLowerCase().includes("pixeldrain") || cand.href.toLowerCase().includes("pixeldrain");
                                          return (
                                            <span key={idx} className={`rounded-lg border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
                                              isPixeldrain 
                                                ? "border-emerald-200 dark:border-emerald-800 bg-emerald-500/10 text-emerald-600 dark:text-cyan-400" 
                                                : "border-zinc-200 dark:border-zinc-700 bg-zinc-200/50 dark:bg-zinc-800/50 text-zinc-600 dark:text-zinc-300"
                                            }`}>
                                              {name}
                                            </span>
                                          );
                                        })}
                                        {isMissingPixeldrain(result) && (
                                          <button
                                            onClick={() => handleCheck([result.url], undefined, 0, true)}
                                            disabled={loading}
                                            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 dark:border-red-800 bg-red-500/10 hover:bg-red-500/20 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-red-600 dark:text-red-400 animate-pulse cursor-pointer transition-colors"
                                            title="Retry fetching Pixeldrain download link for this item"
                                          >
                                            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
                                            Missing Pixeldrain (Retry)
                                          </button>
                                        )}
                                      </>
                                    ) : (
                                      <button
                                        onClick={() => handleCheck([result.url], undefined, 0, true)}
                                        disabled={loading}
                                        className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 dark:border-red-800 bg-red-500/10 hover:bg-red-500/20 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-red-600 dark:text-red-400 animate-pulse cursor-pointer transition-colors"
                                        title="Retry fetching Pixeldrain download link for this item"
                                      >
                                        <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
                                        Missing Pixeldrain (Retry)
                                      </button>
                                    )}
                                  </div>
                                )}
                                <div className="mt-2 flex items-center gap-2 flex-wrap">
                                  <span className="break-all text-sm font-medium text-zinc-700 dark:text-zinc-200 select-all">{result.url}</span>
                                </div>
                                {result.finalUrl && result.finalUrl !== result.url && (
                                  <div className="mt-1 break-all text-xs text-zinc-500 dark:text-zinc-400">Redirects to: {result.finalUrl}</div>
                                )}
                                <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">{result.message || (result.ok ? "The link is reachable." : "The link could not be verified.")}</p>
                              </div>
                            </div>
                            <div className="flex gap-2 self-start">
                              {(!result.ok || result.statusLabel === "UNKNOWN" || result.statusLabel === "MISSING_FILENAME" || result.statusLabel === "BROKEN" || result.statusLabel === "UNAVAILABLE" || isMissingPixeldrain(result)) && (
                                <button
                                  onClick={() => handleCheck([result.url], undefined, 0, true)}
                                  disabled={loading}
                                  className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-transparent px-3 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50 gap-1.5 transition-colors"
                                  title="Retry checking this link"
                                >
                                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                                  Retry
                                </button>
                              )}
                              <button onClick={() => toggleExpand(result.url)} className="inline-flex items-center justify-center rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-transparent px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 gap-2 transition-colors">Details {openRow ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button>
                            </div>
                          </div>
                          {openRow ? (
                            <div className="grid gap-2 text-xs text-zinc-500 dark:text-zinc-400 sm:grid-cols-2 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/70 p-4 transition-colors duration-300">
                              {typeof result.status !== "undefined" ? <div>Status: {result.status}</div> : null}
                              {result.host ? <div>Host: {result.host}</div> : null}
                              {result.contentType ? <div>Content-Type: {result.contentType}</div> : null}
                              {result.source ? <div>Method: {result.source}</div> : null}
                              {result.fileName ? <div>File Name: {result.fileName}</div> : null}
                              {result.fileSizeText ? <div>File Size: {result.fileSizeText}</div> : null}
                              {result.qualityLabel ? <div>Quality: {result.qualityLabel}</div> : null}
                              {result.printQualityLabel ? <div>Print Quality: {result.printQualityLabel}</div> : null}
                              {result.codecLabel ? <div>Codec: {result.codecLabel}</div> : null}
                              {result.audioLabel ? <div>Audio: {result.audioLabel}</div> : null}
                              {result.subtitleLabel ? <div>Subtitles: {result.subtitleLabel}</div> : null}
                              {locationTag ? <div>Location: <span className="font-mono font-bold text-indigo-500 dark:text-indigo-400">{locationTag}</span></div> : null}
                              {result.season ? <div>Season: {result.season}</div> : null}
                              {result.episode ? <div>Episode: {result.episode}</div> : null}
                              {result.isFullSeasonMKV ? <div>Full Season MKV: Yes</div> : null}
                              {result.isFullSeasonZIP ? <div>Full Season ZIP: Yes</div> : null}
                              {typeof result.confidenceScore === "number" ? <div>Confidence: {result.confidenceScore}%</div> : null}
                              {result.finalUrl ? <div className="sm:col-span-2 break-all text-zinc-600 dark:text-zinc-300">Final URL: {result.finalUrl}</div> : null}
                              {(result.mismatchWarnings?.length || 0) > 0 ? (
                                <div className="sm:col-span-2 rounded-xl border border-pink-200 dark:border-pink-900/70 bg-pink-50 dark:bg-pink-950/30 p-3 text-pink-600 dark:text-pink-300 transition-colors duration-300">
                                  <div className="font-semibold mb-2">Mismatch Warnings</div>
                                  <ul className="list-disc pl-5 space-y-1">{result.mismatchWarnings?.map((w, i) => <li key={i}>{w}</li>)}</ul>
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
};

