import { Language, Quality } from '../types';

export type StatusLabel =
  | "WORKING"
  | "BROKEN"
  | "PROTECTED"
  | "REDIRECT"
  | "UNAVAILABLE"
  | "UNKNOWN"
  | "MISSING_FILENAME"
  | "MISSING_METADATA"
  | "SMALL_FILE"
  | "SIZE_MISMATCH";

export type LinkCheckResult = {
  url: string;
  ok: boolean;
  status?: number;
  statusLabel?: StatusLabel;
  message?: string;
  finalUrl?: string;
  contentType?: string;
  isDirectDownload?: boolean;
  fileName?: string;
  fileSize?: number;
  fileSizeText?: string;
  host?: string;
  source?: string;
  qualityLabel?: string;
  audioLabel?: string;
  codecLabel?: string;
  subtitleLabel?: string;
  printQualityLabel?: string;
  season?: number;
  episode?: number;
  isFullSeasonMKV?: boolean;
  isFullSeasonZIP?: boolean;
  mismatchWarnings?: string[];
  confidenceScore?: number;
};

export function normalizeUrl(input: string) {
  let trimmed = input.trim();
  if (!trimmed) return "";
  
  // Basic protocol check
  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = `https://${trimmed}`;
  }

  try {
    const url = new URL(trimmed);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    
    const isPixeldrain = host.includes("pixeldrain.com") || 
                        host.includes("pixeldrain.dev") || 
                        host.includes("pixeldrain.net") || 
                        host === "pixel.drain" ||
                        host === "pixeldra.in";

    if (isPixeldrain) {
      // Pixeldrain conversion
      const fileIdMatch = url.pathname.match(/\/(?:u|api\/file)\/([^/?#]+)/i);
      const listIdMatch = url.pathname.match(/\/(?:l|api\/list)\/([^/?#]+)/i);
      
      if (fileIdMatch?.[1]) {
        url.pathname = `/u/${fileIdMatch[1]}`;
      } else if (listIdMatch?.[1]) {
        url.pathname = `/l/${listIdMatch[1]}`;
      }
      
      url.search = "";
      url.hash = "";
      return url.toString().replace(/\/$/, "");
    } else {
      // For other links, remove query parameters and hash
      url.search = "";
      url.hash = "";
      return url.toString().replace(/\/$/, "");
    }
  } catch (e) {
    // Fallback logic if URL is invalid
    const isPixeldrain = trimmed.includes("pixeldrain.com/") || 
                        trimmed.includes("pixeldrain.dev/") || 
                        trimmed.includes("pixeldrain.net/") ||
                        trimmed.includes("pixel.drain/") ||
                        trimmed.includes("pixeldra.in/");

    if (isPixeldrain) {
      trimmed = trimmed.replace(/\?download$/i, "");
      trimmed = trimmed.replace(/\/api\/file\//i, "/u/");
      trimmed = trimmed.replace(/\/api\/list\//i, "/l/");
    }
    return trimmed.replace(/\/$/, "");
  }
}

export function splitLinks(text: string) {
  const matches = text.match(/https?:\/\/[^\s)\]}>"']+/g) || [];
  return [...new Set(matches.map((s) => s.trim()))];
}

export function guessLinkType(url: string) {
  const lower = url.toLowerCase();
  if (lower.includes("pixeldrain.com") || lower.includes("pixeldrain.dev") || lower.includes("pixeldrain.net") || lower.includes("pixel.drain") || lower.includes("pixeldra.in")) return "Pixeldrain";
  if (lower.includes("raj.lat") || lower.includes("hub.")) return "Direct download gate";
  if (/\.(zip|rar|7z|tar|gz|mp4|mkv|avi|mov|pdf|docx?|xlsx?|pptx?|apk|exe|srt|ass|mp3|wav|png|jpe?g|webp)(\?|#|$)/i.test(lower)) {
    return "Direct file";
  }
  return "General link";
}

export function normalizeCodec(v?: string) {
  if (!v) return undefined;
  const s = v.toUpperCase().replace(/\./g, "").replace(/\s+/g, "");
  if (s === "H265" || s === "X265" || s === "HEVC") return "HEVC";
  return undefined;
}

export function formatQuality(q?: string) {
  if (!q) return undefined;
  const lower = q.toLowerCase();
  if (lower === '4k') return '4K';
  return lower;
}

export function normalizePrintQuality(text?: string, qualities?: Quality[]) {
  if (!text) return undefined;
  
  let detected: string | undefined;
  if (/(web[\.\-\s_]*rip)/i.test(text)) detected = "WEB-Rip";
  else if (/(hd[\.\-\s_]*rip)/i.test(text)) detected = "HD-Rip";
  else if (/(blu[\.\-\s_]*ray|bd[\.\-\s_]*rip|br[\.\-\s_]*rip)/i.test(text)) detected = "Blu-Ray";
  else if (/(web[\.\-\s_]*dl)/i.test(text)) detected = "WEB-DL";
  else if (/(hq[\.\-\s_]*hdtc)/i.test(text)) detected = "HQ HDTC";
  else if (/(hdtc)/i.test(text)) detected = "HDTC";
  else if (/(hdcam)/i.test(text)) detected = "HDCAM";
  else if (/(dvd[\.\-\s_]*rip)/i.test(text)) detected = "DVDRip";
  else if (/\bHD\b/i.test(text)) detected = "WEB-DL";

  // If we have a list of qualities, try to find the exact name from the list
  // by comparing normalized versions (ignoring hyphens, spaces, etc.)
  if (qualities && qualities.length > 0) {
    if (detected) {
      const normalizedDetected = detected.replace(/[\.\-\s_]+/g, "").toLowerCase();
      const match = qualities.find(q => q.name.replace(/[\.\-\s_]+/g, "").toLowerCase() === normalizedDetected);
      if (match) return match.name;
    }

    // Try matching list items directly against text if no detected label yet
    const normalizedText = text.replace(/[\.\-\s_]+/g, "").toLowerCase();
    for (const q of qualities) {
      const normalizedQuality = q.name.replace(/[\.\-\s_]+/g, "").toLowerCase();
      if (normalizedQuality.length > 2 && normalizedText.includes(normalizedQuality)) {
        return q.name;
      }
    }
  }
  
  return detected;
}

export function detectMetadataForLink(text: string, url: string, languages?: Language[], qualities?: Quality[]) {
  const lines = text.split(/\r?\n/);
  const idx = lines.findIndex((line) => line.includes(url));
  const windowLines = [
    lines[idx - 3] || "",
    lines[idx - 2] || "",
    lines[idx - 1] || "",
    lines[idx] || "",
    lines[idx + 1] || "",
    lines[idx + 2] || "",
    lines[idx + 3] || "",
  ].join(" ");

  const lower = windowLines.toLowerCase();

  const qualityMatch = lower.match(/\b(2160p|4k|1440p|1080p|720p|480p|360p|540p)\b/i)?.[1];
  const quality = formatQuality(qualityMatch);

  const codec = normalizeCodec(
    lower.match(/\b(x265|x264|h\.265|h\.264|hevc|av1)\b/i)?.[1]
  );

  const audio = (() => {
    const foundLangs = [] as string[];
    const langShortCodes: Record<string, string[]> = {
      'Hindi': ['hin', 'hi'],
      'English': ['eng', 'en'],
      'Punjabi': ['pun', 'pa'],
      'Tamil': ['tam', 'ta'],
      'Telugu': ['tel', 'te'],
      'Urdu': ['urd', 'ur'],
      'Marathi': ['mar', 'mr'],
      'Bengali': ['ben', 'bn'],
      'Gujarati': ['guj', 'gu'],
      'Kannada': ['kan', 'kn'],
      'Malayalam': ['mal', 'ml'],
      'Odia': ['odi', 'or'],
      'Assamese': ['asm', 'as'],
      'Spanish': ['spa', 'es'],
      'French': ['fre', 'fra', 'fr'],
      'German': ['ger', 'deu', 'de'],
      'Italian': ['ita', 'it'],
      'Japanese': ['jpn', 'ja'],
      'Korean': ['kor', 'ko'],
      'Chinese': ['chi', 'zho', 'zh'],
      'Arabic': ['ara', 'ar'],
      'Russian': ['rus', 'ru'],
      'Portuguese': ['por', 'pt'],
      'Dutch': ['dut', 'nld', 'nl'],
      'Turkish': ['tur', 'tr'],
      'Vietnamese': ['vie', 'vi'],
      'Thai': ['tha', 'th'],
      'Indonesian': ['ind', 'id'],
      'Malay': ['may', 'msa', 'ms'],
      'Filipino': ['fil', 'tl'],
      'Persian': ['per', 'fas', 'fa'],
      'Polish': ['pol', 'pl'],
      'Ukrainian': ['ukr', 'uk'],
      'Greek': ['gre', 'ell', 'el'],
      'Hebrew': ['heb', 'he'],
      'Swedish': ['swe', 'sv'],
      'Danish': ['dan', 'da'],
      'Norwegian': ['nor', 'no'],
      'Finnish': ['fin', 'fi'],
      'Czech': ['cze', 'ces', 'cs'],
      'Hungarian': ['hun', 'hu'],
      'Romanian': ['rum', 'ron', 'ro'],
      'Bulgarian': ['bul', 'bg'],
      'Serbian': ['srp', 'sr'],
      'Croatian': ['hrv', 'hr'],
      'Slovak': ['slo', 'slk', 'sk'],
      'Slovenian': ['slv', 'sl'],
      'Lithuanian': ['lit', 'lt'],
      'Latvian': ['lav', 'lv'],
      'Estonian': ['est', 'et'],
      'Icelandic': ['ice', 'isl', 'is'],
      'Irish': ['gle', 'ga'],
      'Welsh': ['wel', 'cym', 'cy'],
      'Scottish Gaelic': ['gla', 'gd'],
      'Basque': ['baq', 'eus', 'eu'],
      'Catalan': ['cat', 'ca'],
      'Galician': ['glg', 'gl'],
      'Afrikaans': ['afr', 'af'],
      'Swahili': ['swa', 'sw'],
      'Zulu': ['zul', 'zu'],
      'Xhosa': ['xho', 'xh'],
      'Amharic': ['amh', 'am'],
      'Somali': ['som', 'so'],
      'Yoruba': ['yor', 'yo'],
      'Igbo': ['ibo', 'ig'],
      'Hausa': ['hau', 'ha'],
      'Nepali': ['nep', 'ne'],
      'Sinhala': ['sin', 'si'],
      'Burmese': ['bur', 'mya', 'my'],
      'Khmer': ['khm', 'km'],
      'Lao': ['lao', 'lo'],
      'Tibetan': ['tib', 'bod', 'bo'],
      'Mongolian': ['mon', 'mn'],
      'Uzbek': ['uzb', 'uz'],
      'Kazakh': ['kaz', 'kk'],
      'Kyrgyz': ['kir', 'ky'],
      'Tajik': ['tgk', 'tg'],
      'Turkmen': ['tuk', 'tk'],
      'Azerbaijani': ['aze', 'az'],
      'Armenian': ['arm', 'hye', 'hy'],
      'Georgian': ['geo', 'kat', 'ka'],
      'Pashto': ['pus', 'ps'],
      'Kurdish': ['kur', 'ku'],
      'Sindhi': ['snd', 'sd'],
      'Kashmiri': ['kas', 'ks'],
    };

    const checkLang = (langName: string) => {
      const normalizedLower = lower.replace(/[\.\-\s_]+/g, "");
      const normalizedLang = langName.replace(/[\.\-\s_]+/g, "").toLowerCase();
      if (normalizedLower.includes(normalizedLang)) {
        foundLangs.push(langName);
      } else {
        const codes = langShortCodes[langName] || [];
        for (const code of codes) {
          const codeRegex = new RegExp(`(?<=^|[^a-zA-Z0-9])${code}(?![a-zA-Z0-9])`, 'i');
          if (codeRegex.test(lower)) {
            foundLangs.push(langName);
            break;
          }
        }
      }
    };

    if (languages && languages.length > 0) {
      languages.forEach(lang => checkLang(lang.name));
    }

    return foundLangs.length > 0 ? foundLangs.join(" / ") : undefined;
  })();

  return {
    qualityLabel: quality,
    codecLabel: codec,
    audioLabel: audio,
    subtitleLabel: /subtitles|subs|softsub|hardsub|esub|esubs|msub|msubs/i.test(lower) ? "Yes" : undefined,
    printQualityLabel: normalizePrintQuality(lower, qualities),
    season: parseInt(lower.match(/(?<=^|[^a-zA-Z0-9])S(?:eason)?\s*(\d+)\b/i)?.[1] || "0") || undefined,
    episode: parseInt(lower.match(/(?<=^|[^a-zA-Z0-9])E(?:pisode|p)?\s*(\d+)\b/i)?.[1] || "0") || undefined,
    isFullSeasonMKV: /full\s*season|complete\s*season/i.test(lower) && lower.includes(".mkv"),
    isFullSeasonZIP: /full\s*season|complete\s*season/i.test(lower) && lower.includes(".zip"),
  };
}

export async function serverCheckLink(url: string, signal?: AbortSignal): Promise<LinkCheckResult> {
  const response = await fetch("/api/check-link", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
    signal
  });

  const data = await response.json().catch(() => ({}));

  return {
    url,
    ok: !!data?.ok,
    status: data?.status,
    statusLabel: data?.statusLabel || (data?.ok ? "WORKING" : "UNKNOWN"),
    message: data?.message,
    finalUrl: data?.finalUrl,
    contentType: data?.contentType,
    isDirectDownload: !!data?.isDirectDownload,
    fileName: data?.fileName,
    fileSize: data?.fileSize,
    fileSizeText: data?.fileSizeText,
    host: data?.host,
    source: data?.source,
  };
}

export function detectFromFilename(fileName?: string, finalUrl?: string, languages?: Language[], qualities?: Quality[]) {
  const source = `${fileName || ""} ${finalUrl || ""}`.toLowerCase();
  
  const qualityMatch = source.match(/\b(2160p|4k|1440p|1080p|720p|480p|360p|540p)\b/i)?.[1];
  const quality = formatQuality(qualityMatch);

  const codec = normalizeCodec(source.match(/\b(x265|x264|h\.265|h\.264|hevc|av1)\b/i)?.[1]);
  
  const audio = (() => {
    const foundLangs = [] as string[];
    
    const langShortCodes: Record<string, string[]> = {
      'Hindi': ['hin', 'hi'],
      'English': ['eng', 'en'],
      'Punjabi': ['pun', 'pa'],
      'Tamil': ['tam', 'ta'],
      'Telugu': ['tel', 'te'],
      'Urdu': ['urd', 'ur'],
      'Marathi': ['mar', 'mr'],
      'Bengali': ['ben', 'bn'],
      'Gujarati': ['guj', 'gu'],
      'Kannada': ['kan', 'kn'],
      'Malayalam': ['mal', 'ml'],
      'Odia': ['odi', 'or'],
      'Assamese': ['asm', 'as'],
      'Spanish': ['spa', 'es'],
      'French': ['fre', 'fra', 'fr'],
      'German': ['ger', 'deu', 'de'],
      'Italian': ['ita', 'it'],
      'Japanese': ['jpn', 'ja'],
      'Korean': ['kor', 'ko'],
      'Chinese': ['chi', 'zho', 'zh'],
      'Arabic': ['ara', 'ar'],
      'Russian': ['rus', 'ru'],
      'Portuguese': ['por', 'pt'],
      'Dutch': ['dut', 'nld', 'nl'],
      'Turkish': ['tur', 'tr'],
      'Vietnamese': ['vie', 'vi'],
      'Thai': ['tha', 'th'],
      'Indonesian': ['ind', 'id'],
      'Malay': ['may', 'msa', 'ms'],
      'Filipino': ['fil', 'tl'],
      'Persian': ['per', 'fas', 'fa'],
      'Polish': ['pol', 'pl'],
      'Ukrainian': ['ukr', 'uk'],
      'Greek': ['gre', 'ell', 'el'],
      'Hebrew': ['heb', 'he'],
      'Swedish': ['swe', 'sv'],
      'Danish': ['dan', 'da'],
      'Norwegian': ['nor', 'no'],
      'Finnish': ['fin', 'fi'],
      'Czech': ['cze', 'ces', 'cs'],
      'Hungarian': ['hun', 'hu'],
      'Romanian': ['rum', 'ron', 'ro'],
      'Bulgarian': ['bul', 'bg'],
      'Serbian': ['srp', 'sr'],
      'Croatian': ['hrv', 'hr'],
      'Slovak': ['slo', 'slk', 'sk'],
      'Slovenian': ['slv', 'sl'],
      'Lithuanian': ['lit', 'lt'],
      'Latvian': ['lav', 'lv'],
      'Estonian': ['est', 'et'],
      'Icelandic': ['ice', 'isl', 'is'],
      'Irish': ['gle', 'ga'],
      'Welsh': ['wel', 'cym', 'cy'],
      'Scottish Gaelic': ['gla', 'gd'],
      'Basque': ['baq', 'eus', 'eu'],
      'Catalan': ['cat', 'ca'],
      'Galician': ['glg', 'gl'],
      'Afrikaans': ['afr', 'af'],
      'Swahili': ['swa', 'sw'],
      'Zulu': ['zul', 'zu'],
      'Xhosa': ['xho', 'xh'],
      'Amharic': ['amh', 'am'],
      'Somali': ['som', 'so'],
      'Yoruba': ['yor', 'yo'],
      'Igbo': ['ibo', 'ig'],
      'Hausa': ['hau', 'ha'],
      'Nepali': ['nep', 'ne'],
      'Sinhala': ['sin', 'si'],
      'Burmese': ['bur', 'mya', 'my'],
      'Khmer': ['khm', 'km'],
      'Lao': ['lao', 'lo'],
      'Tibetan': ['tib', 'bod', 'bo'],
      'Mongolian': ['mon', 'mn'],
      'Uzbek': ['uzb', 'uz'],
      'Kazakh': ['kaz', 'kk'],
      'Kyrgyz': ['kir', 'ky'],
      'Tajik': ['tgk', 'tg'],
      'Turkmen': ['tuk', 'tk'],
      'Azerbaijani': ['aze', 'az'],
      'Armenian': ['arm', 'hye', 'hy'],
      'Georgian': ['geo', 'kat', 'ka'],
      'Pashto': ['pus', 'ps'],
      'Kurdish': ['kur', 'ku'],
      'Sindhi': ['snd', 'sd'],
      'Kashmiri': ['kas', 'ks'],
    };

    const checkLang = (langName: string) => {
      const normalizedLower = source.replace(/[\.\-\s_]+/g, "");
      const normalizedLang = langName.replace(/[\.\-\s_]+/g, "").toLowerCase();
      if (normalizedLower.includes(normalizedLang)) {
        foundLangs.push(langName);
      } else {
        const codes = langShortCodes[langName] || [];
        for (const code of codes) {
          const codeRegex = new RegExp(`(?<=^|[^a-zA-Z0-9])${code}(?![a-zA-Z0-9])`, 'i');
          if (codeRegex.test(source)) {
            foundLangs.push(langName);
            break;
          }
        }
      }
    };

    if (languages && languages.length > 0) {
      languages.forEach(lang => checkLang(lang.name));
    } else {
      const defaultLangs = ['Hindi', 'English', 'Urdu', 'Tamil', 'Telugu', 'Punjabi'];
      defaultLangs.forEach(lang => checkLang(lang));
    }
    
    if (/dual[ ._-]?audio/i.test(source)) {
      if (foundLangs.length > 0) {
        if (foundLangs.length === 1 && !foundLangs.includes('English')) {
          foundLangs.push('English');
        }
        return foundLangs.join(" / ");
      } else {
        return "Hindi / English";
      }
    }
    
    return foundLangs.length ? foundLangs.join(" / ") : undefined;
  })();

  const subtitle = /subtitles|subs|softsub|hardsub|esub|esubs|msub|msubs/i.test(source) ? "Subtitles" : undefined;
  
  let printQuality = normalizePrintQuality(source, qualities);

  const result = {
    qualityLabel: quality,
    codecLabel: codec,
    audioLabel: audio,
    subtitleLabel: subtitle,
    printQualityLabel: printQuality,
    season: undefined as number | undefined,
    episode: undefined as number | undefined,
    isFullSeasonMKV: false,
    isFullSeasonZIP: false,
  };

  const combinedMatch = source.match(/(?<=^|[^a-zA-Z0-9])s(\d+)e(\d+)(?![a-z0-9])/i);
  if (combinedMatch) {
    result.season = parseInt(combinedMatch[1]);
    result.episode = parseInt(combinedMatch[2]);
  } else {
    const seriesMatch = source.match(/(?<=^|[^a-zA-Z0-9])(s(\d+)|season\s*(\d+))(?![a-z0-9])/i);
    if (seriesMatch) {
      result.season = parseInt(seriesMatch[2] || seriesMatch[3]);
      const episodeMatch = source.match(/(?<=^|[^a-zA-Z0-9])(?:e(\d+)|episode\s*(\d+)|ep\s*(\d+))(?![a-z0-9])/i);
      if (episodeMatch) {
        result.episode = parseInt(episodeMatch[1] || episodeMatch[2] || episodeMatch[3]);
      } else {
        // Full season detection
        if (source.includes(".mkv")) result.isFullSeasonMKV = true;
        if (source.includes(".zip")) result.isFullSeasonZIP = true;
      }
    }
  }

  return result;
}

export async function performFullLinkScan(
  url: string, 
  extractedMeta: Record<string, any> = {}, 
  languages: Language[] = [], 
  qualities: Quality[] = [],
  signal?: AbortSignal,
  expectedSize?: string,
  expectedUnit?: 'MB' | 'GB'
): Promise<LinkCheckResult> {
  let base: LinkCheckResult;
  let finalUrlToUse = url;

  // Check if URL has a token parameter
  if (url.includes('?token=') || url.includes('&token=')) {
    try {
      const urlObj = new URL(url);
      const token = urlObj.searchParams.get('token');
      if (token) {
        urlObj.searchParams.delete('token');
        const urlWithoutToken = urlObj.toString();
        
        try {
          // Try without token first
          base = await serverCheckLink(urlWithoutToken, signal);
          if (base.ok) {
            finalUrlToUse = urlWithoutToken;
          } else {
            // If it fails, try with token
            base = await serverCheckLink(url, signal);
          }
        } catch (e) {
          // If it throws, try with token
          base = await serverCheckLink(url, signal);
        }
      } else {
        base = await serverCheckLink(url, signal);
      }
    } catch (e) {
      base = await serverCheckLink(url, signal);
    }
  } else {
    base = await serverCheckLink(url, signal);
  }

  // Pixeldrain fallback logic: If original domain fails, try pixeldrain.dev
  if (!base.ok && guessLinkType(url) === "Pixeldrain") {
    try {
      const urlObj = new URL(url);
      if (urlObj.hostname !== "pixeldrain.dev") {
        const originalHost = urlObj.hostname;
        urlObj.hostname = "pixeldrain.dev";
        const devUrl = urlObj.toString().replace(/\/$/, "");
        const devBase = await serverCheckLink(devUrl, signal);
        if (devBase.ok) {
          base = devBase;
          finalUrlToUse = devUrl;
        }
      }
    } catch (e) {
      // Fallback for invalid URL objects that are still Pixeldrain
      const devUrl = url.replace(/pixeldrain\.(com|net)/i, "pixeldrain.dev")
                        .replace(/pixel\.drain/i, "pixeldrain.dev")
                        .replace(/pixeldra\.in/i, "pixeldrain.dev");
      if (devUrl !== url) {
        try {
          const devBase = await serverCheckLink(devUrl, signal);
          if (devBase.ok) {
            base = devBase;
            finalUrlToUse = devUrl;
          }
        } catch (err) {}
      }
    }
  }

  if ((!base.ok || base.statusLabel === "REDIRECT") && base.finalUrl && base.finalUrl !== url) {
    try {
      const retryBase = await serverCheckLink(base.finalUrl, signal);
      base = retryBase;
      finalUrlToUse = base.finalUrl || base.url;
    } catch (e) {
      // Ignore retry error and stick with original base
    }
  }

  const postMeta = extractedMeta[url] || {};
  const fileMeta = detectFromFilename(base.fileName, base.finalUrl, languages, qualities);
  const hasFileName = !!base.fileName;

  const result: LinkCheckResult = {
    ...base,
    url: finalUrlToUse,
    qualityLabel: fileMeta.qualityLabel || postMeta.qualityLabel,
    codecLabel: fileMeta.codecLabel || (hasFileName ? undefined : postMeta.codecLabel),
    audioLabel: fileMeta.audioLabel || (hasFileName ? undefined : postMeta.audioLabel),
    subtitleLabel: fileMeta.subtitleLabel || (hasFileName ? undefined : postMeta.subtitleLabel),
    printQualityLabel: fileMeta.printQualityLabel || postMeta.printQualityLabel,
    season: fileMeta.season || postMeta.season,
    episode: fileMeta.episode || postMeta.episode,
    isFullSeasonMKV: fileMeta.isFullSeasonMKV || postMeta.isFullSeasonMKV,
    isFullSeasonZIP: fileMeta.isFullSeasonZIP || postMeta.isFullSeasonZIP,
  };

  if (result.ok && !result.fileName) {
    result.statusLabel = "MISSING_FILENAME";
    result.message = "Missing filename";
  }
  
  if (result.ok && result.fileSize && result.fileSize < 20 * 1000 * 1000) {
    result.statusLabel = "SMALL_FILE";
    result.message = "File size too small (< 20MB)";
  }

  // Size mismatch validation
  if (result.ok && result.fileSize && expectedSize && expectedUnit) {
    const expectedSizeBytes = parseFloat(expectedSize) * (expectedUnit === 'GB' ? 1000 * 1000 * 1000 : 1000 * 1000);
    const diff = Math.abs(result.fileSize - expectedSizeBytes);
    if (diff > 50 * 1000 * 1000) { // 50MB tolerance
      result.statusLabel = "SIZE_MISMATCH";
      result.message = `Size mismatch: Expected ${expectedSize}${expectedUnit}, got ${result.fileSizeText}`;
    }
  }

  // Filename validation
  if (result.ok && result.fileName) {
    const hasQuality = !!result.qualityLabel;
    const hasLanguage = !!result.audioLabel;
    
    if (!hasQuality && result.statusLabel === "WORKING") {
      result.statusLabel = "MISSING_METADATA";
      result.message = "Missing Quality in filename";
    } else if (!hasLanguage && result.statusLabel === "WORKING") {
      result.statusLabel = "MISSING_METADATA";
      result.message = "Missing Language in filename";
    }
  }

  return result;
}

export function buildMismatchWarnings(result: LinkCheckResult, all: LinkCheckResult[], languages?: Language[], qualities?: Quality[]) {
  const warnings: string[] = [];
  const fileMeta = detectFromFilename(result.fileName, result.finalUrl, languages, qualities);

  if (result.qualityLabel && fileMeta.qualityLabel && result.qualityLabel !== fileMeta.qualityLabel) {
    warnings.push(`Post says ${result.qualityLabel}, file suggests ${fileMeta.qualityLabel}`);
  }

  const postCodec = normalizeCodec(result.codecLabel);
  const fileCodec = normalizeCodec(fileMeta.codecLabel);
  if (postCodec && fileCodec && postCodec !== fileCodec) {
    warnings.push(`Post says ${postCodec}, file suggests ${fileCodec}`);
  }

  if (result.printQualityLabel && fileMeta.printQualityLabel && result.printQualityLabel !== fileMeta.printQualityLabel) {
    warnings.push(`Post says ${result.printQualityLabel}, file suggests ${fileMeta.printQualityLabel}`);
  }

  if (result.audioLabel && fileMeta.audioLabel) {
    const a = result.audioLabel.toLowerCase();
    const b = fileMeta.audioLabel.toLowerCase();
    if (a !== b && !(a.includes("dual") && b.includes("dual"))) {
      warnings.push(`Post says ${result.audioLabel}, file suggests ${fileMeta.audioLabel}`);
    }
  }

  if (result.subtitleLabel && !fileMeta.subtitleLabel && result.fileName) {
    warnings.push("Post says subtitles, but filename does not suggest subtitles");
  }

  const duplicates = all.filter((x) => x.url === result.url);
  const duplicateQualities = [...new Set(duplicates.map((d) => d.qualityLabel).filter(Boolean))];
  if (duplicateQualities.length > 1) {
    warnings.push(`Same link reused for multiple qualities: ${duplicateQualities.join(", ")}`);
  }

  const sameFile = all.filter((x) => x.fileName && result.fileName && x.fileName === result.fileName);
  const sameFileQualities = [...new Set(sameFile.map((d) => d.qualityLabel).filter(Boolean))];
  if (sameFile.length > 1 && sameFileQualities.length > 1) {
    warnings.push(`Same file name reused across qualities: ${sameFileQualities.join(", ")}`);
  }

  if (result.fileSize && result.qualityLabel) {
    const mb = result.fileSize / (1000 * 1000);
    const gb = mb / 1000;
    if (mb < 20) warnings.push("File size is suspiciously small (< 20MB)");
    if (result.qualityLabel === "1080P" && gb < 0.5) warnings.push("Suspiciously small for 1080p");
    if (result.qualityLabel === "720P" && gb < 0.25) warnings.push("Suspiciously small for 720p");
    if (result.qualityLabel === "480P" && gb > 3.5) warnings.push("Suspiciously large for 480p");
    if ((result.qualityLabel === "2160P" || result.qualityLabel === "4K") && gb < 1.2) warnings.push("Suspiciously small for 4K");
  }

  return [...new Set(warnings)];
}
