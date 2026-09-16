import { Content, Language, Quality } from '../types';
import { extractTitleAndYear, isPreciseTitleMatch, normalizeTitle } from './titleMatcher';

export const getMediaLinksFromContent = (
  c: Content
): {
  hasAnyMediaLinks: boolean;
  totalMediaLinksCount: number;
  movieLinksCount: number;
  seasonLinksMap: Map<
    number,
    { zipCount: number; mkvCount: number; episodeMap: Map<number, number>; totalLinks: number }
  >;
  hasHubcloud: boolean;
  hasPixeldrain: boolean;
  allUrls: string[];
} => {
  let totalMediaLinksCount = 0;
  let movieLinksCount = 0;
  const allUrls: string[] = [];
  const seasonLinksMap = new Map<
    number,
    { zipCount: number; mkvCount: number; episodeMap: Map<number, number>; totalLinks: number }
  >();

  const safeParse = (data: any): any[] => {
    if (!data) return [];
    if (typeof data === 'string') {
      try {
        return JSON.parse(data);
      } catch (e) {
        return [];
      }
    }
    return data;
  };

  const processLinks = (items: any): number => {
    if (!Array.isArray(items)) return 0;
    let count = 0;
    items.forEach((ld: any) => {
      if (ld?.url && typeof ld.url === 'string' && ld.url.trim().length > 0) {
        count++;
        allUrls.push(ld.url);
      }
      if (ld?.links && Array.isArray(ld.links)) {
        ld.links.forEach((l: any) => {
          if (l?.url && typeof l.url === 'string' && l.url.trim().length > 0) {
            count++;
            allUrls.push(l.url);
          }
        });
      }
    });
    return count;
  };

  if (c.movieLinks) {
    const ml = processLinks(safeParse(c.movieLinks));
    movieLinksCount += ml;
    totalMediaLinksCount += ml;
  }
  if (c.fullSeasonZip) {
    const zl = processLinks(safeParse(c.fullSeasonZip));
    totalMediaLinksCount += zl;
  }
  if (c.fullSeasonMkv) {
    const ml = processLinks(safeParse(c.fullSeasonMkv));
    totalMediaLinksCount += ml;
  }
  if ((c as any).telegramLinks) {
    const tl = processLinks(safeParse((c as any).telegramLinks));
    totalMediaLinksCount += tl;
  }

  if (c.seasons) {
    const parsed = safeParse(c.seasons);
    if (Array.isArray(parsed)) {
      parsed.forEach((s: any) => {
        const sNum = s.seasonNumber || 1;
        const zipCount = processLinks(s.zipLinks || []);
        const mkvCount = processLinks(s.mkvLinks || []);
        const episodeMap = new Map<number, number>();
        let epLinksTotal = 0;
        if (Array.isArray(s.episodes)) {
          s.episodes.forEach((e: any) => {
            const eNum = e.episodeNumber;
            const elCount = processLinks(e.links || []);
            if (eNum !== undefined) {
              episodeMap.set(eNum, elCount);
            }
            epLinksTotal += elCount;
          });
        }
        const sTotal = zipCount + mkvCount + epLinksTotal;
        seasonLinksMap.set(sNum, { zipCount, mkvCount, episodeMap, totalLinks: sTotal });
        totalMediaLinksCount += sTotal;
      });
    }
  }

  const hasPixeldrain = allUrls.some((u) => {
    const l = u.toLowerCase();
    return l.includes('pixeldrain') || l.includes('pixel.drain') || l.includes('pixeldra.in');
  });
  const hasHubcloud = allUrls.some((u) => {
    const l = u.toLowerCase();
    return l.includes('hubcloud') || l.includes('vcloud') || l.includes('hubdrive');
  });

  return {
    hasAnyMediaLinks: totalMediaLinksCount > 0,
    totalMediaLinksCount,
    movieLinksCount,
    seasonLinksMap,
    hasHubcloud,
    hasPixeldrain,
    allUrls,
  };
};

export const getAllUrlsFromContent = (c: Content): string[] => {
  return getMediaLinksFromContent(c).allUrls;
};

export const checkGalleryAvailability = (
  postTitle: string,
  contentList: Content[],
  qualities: Quality[] = [],
  languages: Language[] = [],
  titleIndex?: Map<string, Content[]>
): {
  isAvailable: boolean;
  badgeLabel: 'Available' | 'Missing';
  reason?: string;
  matchedContent?: Content;
  parsed: { title: string; year?: number; season?: number; episode?: number; formatted: string };
} => {
  const parsed = extractTitleAndYear(postTitle);
  if (!parsed.title) {
    return { isAvailable: false, badgeLabel: 'Missing', reason: 'Unrecognized Title', parsed };
  }

  const normParsed = normalizeTitle(parsed.title);
  if (!normParsed) {
    return { isAvailable: false, badgeLabel: 'Missing', reason: 'Unrecognized Title', parsed };
  }

  // Find candidates matching title
  let candidates: Content[] = [];
  if (titleIndex && titleIndex.has(normParsed)) {
    candidates = titleIndex.get(normParsed)!;
  } else {
    candidates = contentList.filter((c) => {
      if (!c || !c.title) return false;
      return (
        isPreciseTitleMatch(parsed.title, c.title) ||
        (c.secondTitle ? isPreciseTitleMatch(parsed.title, c.secondTitle) : false)
      );
    });
  }

  if (candidates.length === 0) {
    return {
      isAvailable: false,
      badgeLabel: 'Missing',
      reason: 'Not in Gallery',
      parsed,
    };
  }

  let matched: Content | undefined = undefined;
  if (parsed.year) {
    matched = candidates.find((c) => {
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
            parsedSeasons.forEach((s) => {
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
        return candidateYears.some((y) => Math.abs(y - parsed.year!) <= 1);
      }
      return true;
    });

    if (!matched) {
      return {
        isAvailable: false,
        badgeLabel: 'Missing',
        reason: 'Not in Gallery (Year Mismatch)',
        parsed,
      };
    }
  } else {
    matched = candidates.find((c) => getMediaLinksFromContent(c).hasAnyMediaLinks) || candidates[0];
  }

  if (!matched) {
    return {
      isAvailable: false,
      badgeLabel: 'Missing',
      reason: 'Not in Gallery',
      parsed,
    };
  }

  // Check if library item has actual media download links
  const mediaInfo = getMediaLinksFromContent(matched);
  if (!mediaInfo.hasAnyMediaLinks) {
    return {
      isAvailable: false,
      badgeLabel: 'Missing',
      reason: 'No Download Links in Library',
      matchedContent: matched,
      parsed,
    };
  }

  // Season & Episode availability check
  const targetSeason = parsed.season;
  const targetEpisode = parsed.episode;

  if (targetSeason !== undefined) {
    const sInfo = mediaInfo.seasonLinksMap.get(targetSeason);
    if (!sInfo || sInfo.totalLinks === 0) {
      return {
        isAvailable: false,
        badgeLabel: 'Missing',
        reason: `Season ${targetSeason} Not in Library`,
        matchedContent: matched,
        parsed,
      };
    }

    if (targetEpisode !== undefined && !parsed.isEpisodeRange) {
      const epLinks = sInfo.episodeMap.get(targetEpisode) || 0;
      if (epLinks === 0 && sInfo.zipCount === 0 && sInfo.mkvCount === 0) {
        return {
          isAvailable: false,
          badgeLabel: 'Missing',
          reason: `S${targetSeason} E${targetEpisode} Not in Library`,
          matchedContent: matched,
          parsed,
        };
      }
    }
  }

  // Quality evaluation: Digital releases (WEB-DL, WEBRip, HDRip, BluRay, BRRip)
  const digitalQualityRegex = /\b(web-?dl|web-?rip|hdr-?ip|hd-?rip|bluray|blu-?ray|brrip|br-?rip)\b/i;
  const postHasDigitalQuality = digitalQualityRegex.test(postTitle);

  const libQualityObj = qualities.find((q) => q.id === matched!.qualityId);
  const libQualityName = libQualityObj ? libQualityObj.name : '';
  const combinedLibInfo = `${libQualityName} ${matched.title} ${matched.description || ''} ${matched.movieLinks || ''}`.toLowerCase();

  const libraryHasDigitalQuality = digitalQualityRegex.test(combinedLibInfo);

  // If post has WEB-DL, HDRip, BluRay and library item is a lower quality print (e.g. CAM, PreDVD, HDCAM)
  if (postHasDigitalQuality && !libraryHasDigitalQuality) {
    return {
      isAvailable: false,
      badgeLabel: 'Missing',
      reason: `Old Print in Library (${libQualityName || 'CAM/PreDVD'} → Upgrade: Digital)`,
      matchedContent: matched,
      parsed,
    };
  }

  // Audio / Language evaluation (Hindi Audio)
  const postHasHindi = /\b(hindi|hin|dual audio|multi audio|hindi org|hindi clean)\b/i.test(postTitle);
  if (postHasHindi) {
    const libLangNames = (matched.languageIds || [])
      .map((id) => languages.find((l) => l.id === id)?.name || '')
      .filter(Boolean);
    const libHasHindi =
      libLangNames.some((l) => /hindi/i.test(l)) ||
      /hindi/i.test(matched.title) ||
      /hindi/i.test(matched.description || '');

    if (!libHasHindi) {
      return {
        isAvailable: false,
        badgeLabel: 'Missing',
        reason: 'Missing Hindi Audio in Library',
        matchedContent: matched,
        parsed,
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
      parsed,
    };
  }

  // Check if library version has Pixeldrain but is missing Hubcloud links
  if (mediaInfo.hasPixeldrain && !mediaInfo.hasHubcloud) {
    return {
      isAvailable: false,
      badgeLabel: 'Missing',
      reason: 'Only Pixel Version in Library (Missing Hubcloud Links)',
      matchedContent: matched,
      parsed,
    };
  }

  return {
    isAvailable: true,
    badgeLabel: 'Available',
    reason: `In Gallery${libQualityName ? ` (${libQualityName})` : ''}`,
    matchedContent: matched,
    parsed,
  };
};
